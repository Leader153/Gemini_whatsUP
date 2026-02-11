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

console.log('[STARTUP] Answer Phone Handler Loaded (Production Ready)');

app.use(express.urlencoded({ extended: true }));
app.use('/music', express.static(path.join(__dirname, '../public/music')));

// Подключение WhatsApp/SMS маршрутов
if (messagingRoutes && typeof messagingRoutes === 'function') {
    app.use('/', messagingRoutes);
} else {
    console.error('[CRITICAL_ERROR] messagingRoutes failed to load.');
}

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
        speechTimeout: 'auto',
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

    // --- УСКОРЕНИЕ: МОМЕНТАЛЬНЫЙ ОТВЕТ ---
    if (speechResult) {
        const twiml = new VoiceResponse();
        twiml.play({ loop: 10 }, HOLD_MUSIC_URL);

        response.type('text/xml');
        response.send(twiml.toString());

        // --- АСИНХРОННАЯ ЛОГИКА ---
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
                speechResult, clientPhone,
                clientPhone,
                (chunk) => { if (task.queue) task.queue.push(chunk); interruptMusic(); },
                (res) => { task.status = 'completed'; task.result = res; interruptMusic(); },
                (err) => { console.error('Streaming error:', err); task.status = 'error'; interruptMusic(); }
            );
        });

    } else {
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
        while (task.queue.length > 0) combinedText += task.queue.shift() + " ";

        // --- ИСПРАВЛЕНИЕ: Определяем язык из текста и выбираем правильный голос ---
        const detectedLang = botBehavior.detectLanguage(combinedText);
        const correctVoice = botBehavior.voiceSettings[detectedLang].ttsVoice;
        console.log(`🗣️ [TTS] Detected language: ${detectedLang}, using voice: ${correctVoice}`);
        // ---------------------------------------------------------------------------

        twiml.say({ voice: correctVoice }, combinedText);
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

    response.type('text/xml');
    response.send(twiml.toString());
});

// 4. ИНСТРУМЕНТЫ (Перевод на оператора)
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
            console.log(`📞 Попытка перевода на оператора: ${botBehavior.operatorSettings.phoneNumber}`);
            twiml.say({ voice: voice }, toolResult.text);

            // ВАЖНО: Указываем action, чтобы вернуть звонок, если не ответят
            twiml.dial({
                timeout: botBehavior.operatorSettings.timeout,
                action: '/handle-dial-status'
            }, botBehavior.operatorSettings.phoneNumber);
        } else {
            // --- ЗАЩИТА ОТ ПУСТОГО ТЕКСТА ---
            if (toolResult.text) {
                const cleanText = botBehavior.cleanTextForTTS(toolResult.text);
                // Говорим только если текст не пустой
                if (cleanText && cleanText.trim().length > 0) {
                    // --- ИСПРАВЛЕНИЕ: Определяем язык и выбираем правильный голос ---
                    const detectedLang = botBehavior.detectLanguage(cleanText);
                    const correctVoice = botBehavior.voiceSettings[detectedLang].ttsVoice;
                    console.log(`🗣️ [TTS-TOOL] Detected language: ${detectedLang}, using voice: ${correctVoice}`);
                    // ---------------------------------------------------------------------------

                    twiml.say({ voice: correctVoice }, cleanText);
                }
            }
            // --------------------------------

            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
            twiml.redirect({ method: 'POST' }, '/reprompt');
        }
        response.type('text/xml');
        response.send(twiml.toString());
    } catch (error) {
        const twiml = new VoiceResponse();
        twiml.say(messageFormatter.getMessage('apiError', 'voice'));
        twiml.redirect('/reprompt');
        response.type('text/xml').send(twiml.toString());
    }
});

// --- НОВЫЙ МАРШРУТ: ВОЗВРАТ ЗВОНКА ОТ ОПЕРАТОРА ---
// Именно это сохраняет память и возвращает бота
app.post('/handle-dial-status', (request, response) => {
    const dialStatus = request.body.DialCallStatus;
    const voice = botBehavior.voiceSettings.he.ttsVoice;

    console.log(`🔄 Статус звонка оператору: ${dialStatus}`);

    const twiml = new VoiceResponse();

    if (dialStatus === 'completed' || dialStatus === 'answered') {
        // Успех, кладем трубку
        twiml.hangup();
    } else {
        // Не дозвонились (busy, no-answer, failed)
        // Говорим сообщение и снова слушаем клиента
        // Память (sessionManager) жива, так как CallSid тот же!

        twiml.say({ voice: voice }, "מצטערת, הנציג אינו זמין כרגע. איך אוכל לעזור לך בנושא אחר?");
        // (Извините, представитель сейчас недоступен. Чем еще могу помочь?)

        twiml.gather({
            input: 'speech',
            action: '/respond',
            speechTimeout: 'auto',
            language: botBehavior.voiceSettings.he.sttLanguage
        });

        twiml.redirect({ method: 'POST' }, '/reprompt');
    }

    response.type('text/xml');
    response.send(twiml.toString());
});


// 6. ПЕРЕСПРОС (УЛУЧШЕННЫЙ: НАПОМИНАНИЕ + 3 ПОПЫТКИ)
app.post('/reprompt', (request, response) => {
    const twiml = new VoiceResponse();
    const retryCount = parseInt(request.query.retry || '0');
    // Важно: берем голос динамически, если вдруг переключились на русский, 
    // но по умолчанию будет иврит
    const voice = botBehavior.voiceSettings.he.ttsVoice; 

    console.log(`🎵 [REPROMPT] Тишина. Попытка №${retryCount + 1}`);

    // Если прошло 3 попытки (0, 1, 2) -> Вешаем трубку
    if (retryCount >= 3) {
        console.log('🛑 [HANGUP] Клиент долго молчит. Завершаем.');
        twiml.say({ voice: voice }, "תודה, נתראה!"); // "Спасибо, увидимся!"
        twiml.hangup();
    } else {
        // Если это не самый первый раз (клиент молчит уже какое-то время)
        if (retryCount > 0) {
            // ГОЛОСОВОЕ НАПОМИНАНИЕ (Чтобы не казалось, что завис)
            twiml.say({ voice: voice }, "אני עדיין כאן. קיבלת את ההודעה? יש עוד משהו שאוכל לעזור בו?");
        }

        // Играем музыку
        twiml.play({ loop: 1 }, HOLD_MUSIC_URL); 
        
        // Снова слушаем
        twiml.gather({ 
            input: 'speech', 
            action: '/respond', 
            speechTimeout: 'auto', 
            language: botBehavior.voiceSettings.he.sttLanguage 
        });

        // Увеличиваем счетчик
        twiml.redirect({ method: 'POST' }, `/reprompt?retry=${retryCount + 1}`);
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// SERVER
const port = process.env.PORT || 1337;
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
const mediaStreamHandler = new TwilioMediaStreamHandler(wss);

httpServer.listen(port, () => console.log(`✅ Server running on ${port}`));
module.exports.mediaStreamHandler = mediaStreamHandler;