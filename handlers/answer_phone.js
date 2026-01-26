const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const conversationEngine = require('../utils/conversationEngine');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const messageFormatter = require('../utils/messageFormatter');
const messagingRoutes = require('./messaging_handler');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const TwilioMediaStreamHandler = require('./mediaStreamHandler');

const app = express();
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Ссылка на музыку
const HOLD_MUSIC_URL = process.env.HOLD_MUSIC_URL || 'https://mabotmusik-2585.twil.io/mb.mp3';

console.log('[STARTUP] Answer Phone Handler Loaded (Optimized)');

app.use(express.urlencoded({ extended: true }));
app.use('/music', express.static(path.join(__dirname, '../public/music')));
app.use('/', messagingRoutes); 

const pendingAITasks = new Map();

// 1. ВХОДЯЩИЙ ЗВОНОК
app.post('/voice', (request, response) => {
    const twiml = new VoiceResponse();
    const initialGreeting = messageFormatter.getGreeting('voice');
    
    // Оптимизация: Сразу говорим и слушаем
    twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, initialGreeting);
    
    twiml.gather({
        input: 'speech',
        action: '/respond',
        speechTimeout: 'auto', // Twilio сам решает, когда фраза окончена
        language: botBehavior.voiceSettings.he.sttLanguage,
    });
    
    twiml.redirect({ method: 'POST' }, '/reprompt');

    response.type('text/xml');
    response.send(twiml.toString());
});

// 2. ОБРАБОТКА (ОПТИМИЗИРОВАНО ДЛЯ СКОРОСТИ)
app.post('/respond', (request, response) => {
    const speechResult = request.body.SpeechResult;
    const callSid = request.body.CallSid;
    
    // --- УСКОРЕНИЕ 1: МОМЕНТАЛЬНЫЙ ОТВЕТ ---
    // Если речь распознана, мы СРАЗУ отправляем Twilio команду "Играй музыку".
    // Вся логика запускается уже ПОСЛЕ отправки ответа.
    if (speechResult) {
        const twiml = new VoiceResponse();
        // Используем play. Ссылка должна быть быстрой (Twilio Assets идеальны)
        twiml.play({ loop: 10 }, HOLD_MUSIC_URL);
        
        response.type('text/xml');
        response.send(twiml.toString()); // <--- ОТПРАВЛЯЕМ ОТВЕТ ПРЯМО СЕЙЧАС!
        
        // --- АСИНХРОННАЯ ЛОГИКА (В фоне) ---
        // Node.js продолжает выполнение этого блока даже после res.send()
        
        const clientPhone = request.body.From;
        const domain = process.env.DOMAIN_NAME || request.headers.host;
        const protocol = process.env.DOMAIN_NAME ? 'https' : 'http';
        const baseUrl = `${protocol}://${domain}`;

        console.log(`🎙️ [VOICE] Распознано: "${speechResult}"`);
        sessionManager.setUserPhone(callSid, clientPhone);

        const task = {
            status: 'processing',
            queue: [],
            result: null,
            interrupted: false, 
            startTime: Date.now()
        };
        pendingAITasks.set(callSid, task);

        // Ленивая подгрузка модуля (хотя require кешируется, это не страшно)
        const streamingEngine = require('../utils/streamingEngine');

        setImmediate(async () => {
            const interruptMusic = () => {
                if (!task.interrupted) {
                    task.interrupted = true;
                    const elapsed = Date.now() - task.startTime;
                    const minDuration = 2000; 
                    const delay = Math.max(0, minDuration - elapsed);

                    console.log(`⚡ [INTERRUPT] Ответ готов. Прерывание через ${delay}мс...`);

                    setTimeout(() => {
                        const updateTwiml = new VoiceResponse();
                        updateTwiml.redirect({ method: 'POST' }, `${baseUrl}/check_ai?CallSid=${callSid}`);
                        
                        client.calls(callSid)
                            .update({ twiml: updateTwiml.toString() })
                            .then(() => console.log(`✅ [INTERRUPT] Успешный редирект.`))
                            .catch(err => console.error(`❌ Ошибка прерывания:`, err));
                    }, delay);
                }
            };

            await streamingEngine.processMessageStream(
                speechResult, callSid, clientPhone,
                (chunk) => { if (task.queue) task.queue.push(chunk); interruptMusic(); },
                (res) => { task.status = 'completed'; task.result = res; interruptMusic(); },
                (err) => { console.error('Streaming error:', err); task.status = 'error'; interruptMusic(); }
            );
        });

    } else {
        // Если тишина
        const twiml = new VoiceResponse();
        twiml.redirect({ method: 'POST' }, '/reprompt');
        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// 3. ЧТЕНИЕ ОТВЕТА
app.post('/check_ai', (request, response) => {
    const callSid = request.query.CallSid || request.body.CallSid;
    const task = pendingAITasks.get(callSid);
    const twiml = new VoiceResponse();
    const voice = botBehavior.voiceSettings.he.ttsVoice;

    if (!task) {
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        return response.send(twiml.toString());
    }

    if (task.status === 'error') {
        pendingAITasks.delete(callSid);
        twiml.say({ voice: voice }, messageFormatter.getMessage('apiError', 'voice'));
        twiml.redirect({ method: 'POST' }, '/reprompt');
        return response.send(twiml.toString());
    }

    if (task.queue && task.queue.length > 0) {
        let combinedText = "";
        while(task.queue.length > 0) combinedText += task.queue.shift() + " ";
        
        twiml.say({ voice: voice }, combinedText);
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.send(twiml.toString());
    }

    if (task.status === 'processing') {
        twiml.pause({ length: 1 });
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.send(twiml.toString());
    }

    if (task.status === 'completed') {
        const result = task.result;
        pendingAITasks.delete(callSid);

        if (result && result.requiresToolCall) {
            sessionManager.setPendingFunctionCalls(callSid, result.functionCalls);
            twiml.redirect({ method: 'POST' }, `/process_tool?CallSid=${callSid}`);
        } else {
            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
            twiml.redirect({ method: 'POST' }, '/reprompt');
        }
        return response.send(twiml.toString());
    }
    
    response.type('text/xml').send(twiml.toString());
});

// 4. ИНСТРУМЕНТЫ
app.post('/process_tool', async (request, response) => {
    const callSid = request.body.CallSid || request.query.CallSid;
    try {
        const pendingData = sessionManager.getAndClearPendingFunctionCalls(callSid);
        if (!pendingData) throw new Error('No pending calls');

        const { functionCalls, context } = pendingData;
        const userPhone = sessionManager.getUserPhone(callSid);

        const toolResult = await conversationEngine.handleToolCalls(
            functionCalls, callSid, 'voice', userPhone, context, true 
        );

        const twiml = new VoiceResponse();
        const voice = botBehavior.voiceSettings.he.ttsVoice;

        if (toolResult.transferToOperator) {
            twiml.say({ voice: voice }, toolResult.text);
            twiml.dial({ timeout: botBehavior.operatorSettings.timeout, action: botBehavior.operatorSettings.callbackUrl }, botBehavior.operatorSettings.phoneNumber);
        } else {
            const cleanText = botBehavior.cleanTextForTTS(toolResult.text);
            twiml.say({ voice: voice }, cleanText);
            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
            twiml.redirect({ method: 'POST' }, '/reprompt');
        }
        response.type('text/xml').send(twiml.toString());
    } catch (error) {
        const twiml = new VoiceResponse();
        twiml.say(messageFormatter.getMessage('apiError', 'voice'));
        twiml.redirect('/reprompt');
        response.type('text/xml').send(twiml.toString());
    }
});

// 5. ПЕРЕСПРОС
app.post('/reprompt', (request, response) => {
    const twiml = new VoiceResponse();
    const retryCount = parseInt(request.query.retry || '0');
    
    if (retryCount === 0) {
        twiml.play({ loop: 1 }, HOLD_MUSIC_URL);
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        twiml.redirect({ method: 'POST' }, '/reprompt?retry=1');
    } else {
        twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, "נתראה!"); 
        twiml.hangup();
    }
    response.type('text/xml').send(twiml.toString());
});

// SERVER
const port = process.env.PORT || 1337;
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
const mediaStreamHandler = new TwilioMediaStreamHandler(wss);

httpServer.listen(port, () => console.log(`✅ Server running on ${port}`));
module.exports.mediaStreamHandler = mediaStreamHandler;