const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const conversationEngine = require('../utils/conversationEngine');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const messageFormatter = require('../utils/messageFormatter');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const TwilioMediaStreamHandler = require('./mediaStreamHandler');

const app = express();
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const HOLD_MUSIC_URL = process.env.HOLD_MUSIC_URL || 'https://mabotmusik-2585.twil.io/mb.mp3';

app.use(express.urlencoded({ extended: true }));

const pendingAITasks = new Map();

// 1. ВХОДЯЩИЙ ЗВОНОК
app.post('/voice', (request, response) => {
    const twiml = new VoiceResponse();
    const initialGreeting = botBehavior.getGreeting();
    const clientPhone = request.body.From;
    const callSid = request.body.CallSid;

    if (clientPhone) {
        sessionManager.setUserPhone(callSid, clientPhone);
        sessionManager.addToHistory(clientPhone, 'model', initialGreeting);
    }

    twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, initialGreeting);
    twiml.gather({
        input: 'speech',
        action: '/respond',
        speechTimeout: 'auto',
        language: botBehavior.voiceSettings.he.sttLanguage,
    });
    twiml.redirect({ method: 'POST' }, '/reprompt');

    response.type('text/xml').send(twiml.toString());
});

// 2. ОБРАБОТКА (ОПТИМИЗИРОВАНО ДЛЯ СКОРОСТИ)
app.post('/respond', (request, response) => {
    const speechResult = request.body.SpeechResult;
    const callSid = request.body.CallSid;
    const clientPhone = request.body.From;

    if (speechResult) {
        const twiml = new VoiceResponse();

        // --- ГИБРИДНЫЙ СЛУХ: Музыка + Gather ---
        const gather = twiml.gather({
            input: 'speech',
            action: '/respond',
            speechTimeout: 'auto',
            language: botBehavior.voiceSettings.he.sttLanguage,
        });
        gather.play({ loop: 10 }, HOLD_MUSIC_URL);

        response.type('text/xml').send(twiml.toString());

        const task = {
            status: 'processing',
            queue: [],
            result: null,
            interrupted: false,
            startTime: Date.now()
        };
        pendingAITasks.set(callSid, task);

        const streamingEngine = require('../utils/streamingEngine');
        const sessionKey = clientPhone || callSid;

        setImmediate(async () => {
            const interruptMusic = () => {
                if (!task.interrupted) {
                    task.interrupted = true;
                    const elapsed = Date.now() - task.startTime;
                    const delay = Math.max(0, 1500 - elapsed);
                    setTimeout(async () => {
                        try {
                            const call = await client.calls(callSid).fetch();
                            if (call.status === 'in-progress') {
                                const updateTwiml = new VoiceResponse();
                                updateTwiml.redirect({ method: 'POST' }, `${request.protocol}://${request.headers.host}/check_ai?CallSid=${callSid}`);
                                await client.calls(callSid).update({ twiml: updateTwiml.toString() });
                            }
                        } catch (err) { console.error(`Interrupt error:`, err.message); }
                    }, delay);
                }
            };

            await streamingEngine.processMessageStream(
                speechResult, sessionKey, clientPhone,
                (chunk) => { if (task.queue) task.queue.push(chunk); interruptMusic(); },
                (res) => { task.status = 'completed'; task.result = res; interruptMusic(); },
                (err) => { task.status = 'error'; interruptMusic(); }
            );
        });

    } else {
        const twiml = new VoiceResponse();
        twiml.redirect({ method: 'POST' }, '/reprompt');
        response.type('text/xml').send(twiml.toString());
    }
});

// 3. ЧТЕНИЕ ОТВЕТА
app.post('/check_ai', (request, response) => {
    const callSid = request.query.CallSid || request.body.CallSid;
    const task = pendingAITasks.get(callSid);
    const twiml = new VoiceResponse();
    const voiceHe = botBehavior.voiceSettings.he.ttsVoice;

    if (!task) {
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        twiml.redirect('/reprompt');
        return response.type('text/xml').send(twiml.toString());
    }

    if (task.status === 'error') {
        pendingAITasks.delete(callSid);
        twiml.say({ voice: voiceHe }, botBehavior.getMessage('apiError'));
        twiml.redirect({ method: 'POST' }, '/reprompt');
        return response.type('text/xml').send(twiml.toString());
    }

    if (task.queue && task.queue.length > 0) {
        let combinedText = "";
        while (task.queue.length > 0) combinedText += task.queue.shift() + " ";

        const cleanText = botBehavior.cleanTextForTTS(combinedText);
        if (cleanText.trim().length > 0) {
            const detectedLang = botBehavior.detectLanguage(cleanText);
            const correctVoice = botBehavior.voiceSettings[detectedLang].ttsVoice;
            twiml.say({ voice: correctVoice }, cleanText);
        }

        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.type('text/xml').send(twiml.toString());
    }

    if (task.status === 'processing') {
        twiml.pause({ length: 1 });
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.type('text/xml').send(twiml.toString());
    }

    if (task.status === 'completed') {
        const result = task.result;
        pendingAITasks.delete(callSid);

        if (result && result.requiresToolCall) {
            sessionManager.setPendingFunctionCalls(callSid, result.functionCalls);
            twiml.redirect({ method: 'POST' }, `/process_tool?CallSid=${callSid}`);
        } else {
            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
            twiml.redirect('/reprompt');
        }
        return response.type('text/xml').send(twiml.toString());
    }
    response.type('text/xml').send(twiml.toString());
});

// 4. ИНСТРУМЕНТЫ (СТАБИЛЬНАЯ ВЕРСИЯ К СЕРЕДИНЕ)
app.post('/process_tool', async (request, response) => {
    const callSid = request.body.CallSid || request.query.CallSid;
    const twiml = new VoiceResponse();

    try {
        const pendingData = sessionManager.getAndClearPendingFunctionCalls(callSid);
        if (!pendingData) throw new Error('No pending calls');

        const { functionCalls, context } = pendingData;
        const userPhone = sessionManager.getUserPhone(callSid);

        // ВЫПОЛНЯЕМ ИНСТРУМЕНТ (Тут Календарь / WhatsApp)
        const toolResult = await conversationEngine.handleToolCalls(
            functionCalls, callSid, 'voice', userPhone, context, true
        );

        if (toolResult.transferToOperator) {
            twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, toolResult.text);
            twiml.dial({ timeout: botBehavior.operatorSettings.timeout, action: '/handle-dial-status' }, botBehavior.operatorSettings.phoneNumber);
        } else {
            if (toolResult.text) {
                const cleanText = botBehavior.cleanTextForTTS(toolResult.text);
                const detectedLang = botBehavior.detectLanguage(cleanText);
                const correctVoice = botBehavior.voiceSettings[detectedLang].ttsVoice;
                twiml.say({ voice: correctVoice }, cleanText);
            }
            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
            twiml.redirect({ method: 'POST' }, '/reprompt');
        }
    } catch (error) {
        twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, botBehavior.getMessage('apiError'));
        twiml.redirect('/reprompt');
    }
    response.type('text/xml').send(twiml.toString());
});

// 5. ПЕРЕСПРОС (РЕГУЛЯРНЫЙ СЛУХ)
app.post('/reprompt', (request, response) => {
    const twiml = new VoiceResponse();
    const retryCount = parseInt(request.query.retry || '0');
    const voice = botBehavior.voiceSettings.he.ttsVoice;

    if (retryCount >= 3) {
        twiml.say({ voice: voice }, "תודה, נתראה!");
        twiml.hangup();
    } else {
        if (retryCount > 0) twiml.say({ voice: voice }, "אני עדיין כאן. יש עוד משהו שאוכל לעזור בו?");

        const gather = twiml.gather({
            input: 'speech',
            action: '/respond',
            speechTimeout: 'auto',
            language: botBehavior.voiceSettings.he.sttLanguage
        });
        gather.play({ loop: 1 }, HOLD_MUSIC_URL);
        twiml.redirect({ method: 'POST' }, `/reprompt?retry=${retryCount + 1}`);
    }
    response.type('text/xml').send(twiml.toString());
});

const port = process.env.PORT || 1337;
// Проверяем наличие SSL сертификатов для HTTPS
let server;
if (process.env.SSL_PRIVATE_KEY_PATH && process.env.SSL_CERTIFICATE_PATH) {
    try {
        const sslOptions = {
            key: fs.readFileSync(process.env.SSL_PRIVATE_KEY_PATH),
            cert: fs.readFileSync(process.env.SSL_CERTIFICATE_PATH)
        };
        server = https.createServer(sslOptions, app);
    } catch (error) {
        console.error('❌ Ошибка загрузки SSL сертификатов:', error.message);
        console.log('⚠️ Запуск HTTP сервера (без SSL)');
        server = http.createServer(app);
    }
} else {
    console.log('⚠️ SSL сертификаты не указаны. Запуск HTTP сервера');
    server = http.createServer(app);
}

const WebSocket = require('ws');
const TwilioMediaStreamHandler = require('./utils/twilioMediaStreamHandler');
const wss = new WebSocket.Server({ server: server, path: '/ws' });
const mediaStreamHandler = new TwilioMediaStreamHandler(wss);

server.listen(port, () => console.log(`✅ [HYBRID_READY] Server running on ${port}`));
module.exports.mediaStreamHandler = mediaStreamHandler;