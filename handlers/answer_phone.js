const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const conversationEngine = require('../utils/conversationEngine');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const messageFormatter = require('../utils/messageFormatter');
const messagingRoutes = require('./messaging_handler');

require('dotenv').config();

const app = express();
const path = require('path');

app.use(express.urlencoded({ extended: true }));
// Раздаем статические файлы из папки public/music по адресу /music с кешированием на 1 день
app.use('/music', express.static(path.join(__dirname, '../public/music'), { maxAge: '1d' }));
app.use('/', messagingRoutes); // Routes for WhatsApp and SMS

// Объект для хранения активных запросов к Gemini в памяти
const pendingAITasks = new Map();

// ----------------------------------------------------------------------
// ROUTE /voice: Start of the call and user speech gathering
// ----------------------------------------------------------------------
app.post('/voice', (request, response) => {
    const twiml = new VoiceResponse();
    const initialGreeting = messageFormatter.getGreeting('voice');
    const voice = botBehavior.voiceSettings.he.ttsVoice;
    const sttLang = botBehavior.voiceSettings.he.sttLanguage;

    twiml.say({ voice: voice }, initialGreeting);
    twiml.gather({
        input: 'speech',
        action: '/respond',
        speechTimeout: 'auto',
        language: sttLang,
    });
    // Если Gather тайм-аутит (нет ввода), перенаправляем на "переспрос"
    twiml.redirect({ method: 'POST' }, '/reprompt');

    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// ROUTE /respond: Process recognized speech and get response from engine
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// ROUTE /respond: Process recognized speech and get response using STREAMING
// ----------------------------------------------------------------------
app.post('/respond', async (request, response) => {
    const speechResult = request.body.SpeechResult;
    const callSid = request.body.CallSid;
    const clientPhone = request.body.From;

    if (speechResult) {
        console.log(`🎙️ [VOICE] Speech recognized for ${callSid}: "${speechResult}"`);

        // Сохраняем userPhone в сессии
        sessionManager.setUserPhone(callSid, clientPhone);

        // Инициализируем задачу в pendingAITasks
        const task = {
            status: 'processing',
            queue: [],
            result: null,
            startTime: Date.now()
        };
        pendingAITasks.set(callSid, task);

        // Запускаем streaming в фоне
        const streamingEngine = require('../utils/streamingEngine');

        // Используем setImmediate чтобы не блокировать отправку ответа Twilio
        setImmediate(async () => {
            await streamingEngine.processMessageStream(
                speechResult,
                callSid,
                clientPhone,
                // onChunk callback
                (chunkText) => {
                    // Добавляем текст в очередь
                    if (task.queue) {
                        task.queue.push(chunkText);
                    }
                },
                // onComplete callback
                (result) => {
                    task.status = 'completed';
                    task.result = result;
                    // Если есть неиспользованные чанки, они останутся в очереди
                },
                // onError callback
                (error) => {
                    console.error('Streaming error task:', error);
                    task.status = 'error';
                    task.error = error;
                }
            );
        });

        const twiml = new VoiceResponse();
        const voice = botBehavior.voiceSettings.he.ttsVoice;

        // ОПТИМИЗАЦИЯ ПЕРВОГО КАСАНИЯ:
        // Сразу говорим "Минутку..." (filler), пока запускается стрим
        // Это заполняет паузу в 1-2 секунды, пока генерируются первые токены
        const filler = "רק רגע, אני בודקת..."; // "Just a moment, I'm checking..."
        twiml.say({ voice: voice }, filler);

        // Редирект на проверку очереди
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);

        response.type('text/xml');
        response.send(twiml.toString());
    } else {
        // No speech detected
        const twiml = new VoiceResponse();
        const msg = messageFormatter.getMessage('noSpeech', 'voice');
        const v = botBehavior.voiceSettings.he.ttsVoice;
        twiml.say({ voice: v }, msg);
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        twiml.redirect({ method: 'POST' }, '/reprompt');
        response.type('text/xml');
        response.send(twiml.toString());
    }
});

/**
 * Эндпоинт для проверки очереди чанков (Polling для стриминга)
 */
app.post('/check_ai', async (request, response) => {
    const callSid = request.query.CallSid || request.body.CallSid;
    const task = pendingAITasks.get(callSid);
    const twiml = new VoiceResponse();

    if (!task) {
        console.warn(`⚠️ No task found for CallSid: ${callSid}`);
        twiml.redirect({ method: 'POST' }, '/reprompt');
        return response.send(twiml.toString());
    }

    const voice = botBehavior.voiceSettings.he.ttsVoice;

    // 1. Если есть ошибки
    if (task.status === 'error') {
        pendingAITasks.delete(callSid);
        const msg = messageFormatter.getMessage('apiError', 'voice');
        twiml.say({ voice: voice }, msg);
        twiml.redirect({ method: 'POST' }, '/reprompt');
        return response.send(twiml.toString());
    }

    // 2. Если есть чанки в очереди - озвучиваем ПЕРВЫЙ и редиректим обратно
    if (task.queue && task.queue.length > 0) {
        const chunk = task.queue.shift(); // Берем первый
        console.log(`🗣️ [VOICE STREAM] Playing chunk: "${chunk}"`);

        // Озвучиваем чанк
        twiml.say({ voice: voice }, chunk);

        // Редирект сразу за следующим (или проверить статус)
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.send(twiml.toString());
    }

    // 3. Если очередь пуста, но стрим еще идет
    if (task.status === 'processing') {
        // Пауза 0.1с (или 0.5с) и снова проверка
        // Twilio <Pause> это минимум 1 секунда? Нет, можно length="0.5" но в целых секундах обычно.
        // Используем 1 сек паузы. Если стрим быстрее, это добавит задержку между фразами.
        // Хак: пустой <Play> или очень короткая пауза?
        // Лучше pause length=1, но это много. 
        // Если очередь пустеет быстрее генерации, речь будет прерывистой.
        twiml.pause({ length: 1 });
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.send(twiml.toString());
    }

    // 4. Если статус completed и очередь пуста - Финализация
    if (task.status === 'completed') {
        const result = task.result;

        // Удаляем задачу, так как все озвучено
        pendingAITasks.delete(callSid);

        if (result.requiresToolCall) {
            sessionManager.setPendingFunctionCalls(callSid, result.functionCalls);
            // Промежуточное сообщение о проверке уже могло быть озвучено или нет.
            // Обычно Gemini говорит "Проверяю..." перед вызовом.

            // Но мы уже могли это озвучить через чанки.
            // Переходим к выполнению тулзов
            twiml.redirect({ method: 'POST' }, `/process_tool?CallSid=${callSid}`);
        } else {
            // Конец ответа, ждем ввод пользователя
            // result.text уже был полность озвучен чанками?
            // Да, task.queue должен быть пуст.

            const sttL = botBehavior.voiceSettings.he.sttLanguage;
            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: sttL });
            twiml.redirect({ method: 'POST' }, '/reprompt');
        }
        return response.send(twiml.toString());
    }

    // Fallback
    twiml.redirect({ method: 'POST' }, '/reprompt');
    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// ROUTE /process_tool: Execute functions after "I'm checking..."
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// ROUTE /process_tool: Execute functions after "I'm checking..." and STREAM response
// ----------------------------------------------------------------------
app.post('/process_tool', async (request, response) => {
    const callSid = request.body.CallSid || request.query.CallSid;
    console.log(`⚙️ Processing tools for callSid: ${callSid}`);

    try {
        const pendingData = sessionManager.getAndClearPendingFunctionCalls(callSid);
        if (!pendingData) {
            throw new Error('No pending function calls found.');
        }

        const { functionCalls, context } = pendingData;
        const userPhone = sessionManager.getUserPhone(callSid);

        // 1. Execute Tools but DO NOT generate response yet (generateResponse = false)
        const toolResult = await conversationEngine.handleToolCalls(
            functionCalls,
            callSid,
            'voice',
            userPhone,
            context,
            false // <--- Streaming Mode: Don't generate text here
        );

        if (toolResult.transferToOperator) {
            const twiml = new VoiceResponse();
            const v = botBehavior.voiceSettings.he.ttsVoice;
            twiml.say({ voice: v }, toolResult.text);
            twiml.dial({
                timeout: botBehavior.operatorSettings.timeout,
                action: botBehavior.operatorSettings.callbackUrl,
            }, botBehavior.operatorSettings.phoneNumber);
            response.type('text/xml');
            response.send(twiml.toString());
            return;
        }

        // 2. Setup Streaming Task similar to /respond
        const task = {
            status: 'processing',
            queue: [],
            result: null,
            startTime: Date.now()
        };
        pendingAITasks.set(callSid, task);

        const streamingEngine = require('../utils/streamingEngine');

        // 3. Start CONTINUATION Stream
        setImmediate(async () => {
            await streamingEngine.continueConversationStream(
                callSid,
                userPhone,
                // onChunk
                (chunkText) => {
                    if (task.queue) task.queue.push(chunkText);
                },
                // onComplete
                (result) => {
                    task.status = 'completed';
                    task.result = result;
                },
                // onError
                (error) => {
                    console.error('Streaming Post-Tool Error:', error);
                    task.status = 'error';
                    task.error = error;
                }
            );
        });

        // 4. Redirect to /check_ai to verify chunks
        const twiml = new VoiceResponse();
        // Мы уже могли сказать "Проверяю...", так что просто переходим к ожиданию
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);

        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('Error in /process_tool:', error);
        const twiml = new VoiceResponse();
        const msg = messageFormatter.getMessage('apiError', 'voice');
        const v = botBehavior.voiceSettings.he.ttsVoice;
        twiml.say({ voice: v }, msg);
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        twiml.redirect({ method: 'POST' }, '/reprompt');
        response.type('text/xml');
        response.send(twiml.toString());
    }
});


// ----------------------------------------------------------------------
// ROUTE /handle-dial-status: Handle call status after transfer attempt
// ----------------------------------------------------------------------
app.post('/handle-dial-status', (request, response) => {
    const twiml = new VoiceResponse();
    const dialStatus = request.body.DialCallStatus;

    if (dialStatus === 'busy' || dialStatus === 'no-answer' || dialStatus === 'failed') {
        twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, messageFormatter.getMessage('operatorUnavailable', 'voice'));
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        twiml.redirect({ method: 'POST' }, '/reprompt');
    } else {
        twiml.hangup();
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// ROUTE /reprompt: Handle silence/timeout
// ----------------------------------------------------------------------
app.post('/reprompt', (request, response) => {
    const twiml = new VoiceResponse();
    const retryCount = parseInt(request.query.retry || '0');

    if (retryCount === 0) {
        // First timeout: Ask "Halo?"
        twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, "הלו?");
        twiml.gather({
            input: 'speech',
            action: '/respond',
            speechTimeout: 'auto',
            language: botBehavior.voiceSettings.he.sttLanguage,
        });
        // Redirect to next retry level
        twiml.redirect({ method: 'POST' }, '/reprompt?retry=1');
    } else if (retryCount === 1) {
        // Second timeout: Just listen silently (give one last chance)
        // No <Say>, just <Gather>
        twiml.gather({
            input: 'speech',
            action: '/respond',
            speechTimeout: 'auto',
            language: botBehavior.voiceSettings.he.sttLanguage,
        });
        twiml.redirect({ method: 'POST' }, '/reprompt?retry=2');
    } else {
        // Third timeout: Hangup
        console.log('🛑 [VOICE] Max reprompts reached. Hanging up.');
        twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, "נתראה!"); // "See you!" or "Bye"
        twiml.hangup();
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// SERVER STARTUP + WEBSOCKET FOR STREAMING
// ----------------------------------------------------------------------
const https = require('https');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const TwilioMediaStreamHandler = require('./mediaStreamHandler');

const domain = process.env.DOMAIN_NAME;
const port = process.env.PORT || 1337;

let httpServer;
let mediaStreamHandler;

if (domain) {
    try {
        const privateKey = fs.readFileSync(`/etc/letsencrypt/live/${domain}/privkey.pem`, 'utf8');
        const certificate = fs.readFileSync(`/etc/letsencrypt/live/${domain}/fullchain.pem`, 'utf8');
        const credentials = { key: privateKey, cert: certificate };

        httpServer = https.createServer(credentials, app);
        httpServer.listen(port, () => {
            console.log(`✅ TwiML HTTPS server running for domain ${domain} on port ${port}`);
        });
    } catch (error) {
        console.error(`❌ Could not start HTTPS server for domain ${domain}.`);
        console.error('Error:', error.message);
        console.warn("Falling back to HTTP mode. This is not suitable for production.");
        httpServer = http.createServer(app);
        httpServer.listen(port, () => {
            console.log(`⚠️ TwiML HTTP server running at http://localhost:${port}/`);
        });
    }
} else {
    console.warn("⚠️ DOMAIN_NAME environment variable not set.");
    console.warn("Starting in HTTP mode. This is suitable for local testing with ngrok, but not for production.");
    httpServer = http.createServer(app);
    httpServer.listen(port, () => {
        console.log(`🚀 TwiML HTTP server running at http://localhost:${port}/`);
    });
}

// Запуск WebSocket сервера на том же HTTP сервере (для работы через Cloudflare)
// Cloudflare проксирует WebSocket через стандартный порт 443
const wss = new WebSocket.Server({
    server: httpServer,  // Привязываем к основному HTTP серверу
    path: '/ws'          // WebSocket доступен по пути /ws
});
mediaStreamHandler = new TwilioMediaStreamHandler(wss);
console.log(`🔌 WebSocket сервер запущен на ${domain}/ws (через Cloudflare)`);

// ----------------------------------------------------------------------
// STREAMING ENDPOINTS
// ----------------------------------------------------------------------

/**
 * Новый эндпоинт для потоковой обработки голоса
 * Использует <Connect><Stream> вместо <Say>
 */
app.post('/voice-stream', (request, response) => {
    const twiml = new VoiceResponse();
    const callSid = request.body.CallSid;
    const userPhone = request.body.From;

    console.log(`🎙️ [STREAMING] Новый звонок: ${callSid} от ${userPhone}`);

    // Подключаем Media Stream
    const connect = twiml.connect();
    // WebSocket URL через Cloudflare (без указания порта)
    const wsUrl = process.env.WS_URL || `wss://${domain}/ws`;

    connect.stream({
        url: wsUrl,
        name: `stream_${callSid}`,
        track: 'both_tracks' // Получаем аудио от обеих сторон
    }).parameter({
        name: 'userPhone',
        value: userPhone
    });


    response.type('text/xml');
    response.send(twiml.toString());
});

/**
 * Эндпоинт для обработки распознанного текста в режиме streaming
 * Вызывается после STT от Twilio
 */
app.post('/stream-message', async (request, response) => {
    const speechResult = request.body.SpeechResult;
    const callSid = request.body.CallSid;
    const userPhone = request.body.From;

    if (!speechResult) {
        return response.status(400).send('No speech result');
    }

    console.log(`💬 [STREAMING] Получено сообщение для ${callSid}: "${speechResult}"`);

    // Обрабатываем сообщение через WebSocket handler
    await mediaStreamHandler.handleUserMessage(callSid, speechResult, userPhone);

    response.status(200).send('OK');
});

// Экспортируем mediaStreamHandler для использования в других модулях
module.exports.mediaStreamHandler = mediaStreamHandler;

