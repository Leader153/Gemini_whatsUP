// ============================================================
// answer_phone.js — Nayax Smart IVR (PoC)
// Рефакторинг: вся логика яхт/бронирований удалена.
// Добавлена обработка onRedirect → TwiML <Dial>.
// ============================================================

const express       = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const sessionManager  = require('../memory/sessionManager');
const botBehavior     = require('../data/botBehavior');
const messageFormatter = require('../utils/messageFormatter');
const messagingRoutes  = require('./messaging_handler');
const path = require('path');
const fs   = require('fs');
const http  = require('http');
const https = require('https');
const WebSocket = require('ws');
const TwilioMediaStreamHandler = require('./mediaStreamHandler');

const app    = express();
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const HOLD_MUSIC_URL = process.env.HOLD_MUSIC_URL || 'https://mabotmusik-2585.twil.io/mb.mp3';

console.log('[STARTUP] Nayax Smart IVR Handler Loaded');

app.use(express.urlencoded({ extended: true }));
app.use('/music', express.static(path.join(__dirname, '../public/music')));

// WhatsApp/SMS маршруты
if (messagingRoutes && typeof messagingRoutes === 'function') {
    app.use('/', messagingRoutes);
} else {
    console.error('[CRITICAL_ERROR] messagingRoutes failed to load.');
}

// Хранилище асинхронных задач AI (ключ — CallSid)
const pendingAITasks = new Map();

// ============================================================
// 1. ВХОДЯЩИЙ ЗВОНОК — приветствие и старт распознавания
// ============================================================
app.post('/voice', (request, response) => {
    const twiml = new VoiceResponse();
    const initialGreeting = messageFormatter.getGreeting('voice');

    twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, initialGreeting);

    twiml.gather({
        input:         'speech',
        action:        '/respond',
        speechTimeout: 'auto',
        language:      botBehavior.voiceSettings.he.sttLanguage,
    });

    twiml.redirect({ method: 'POST' }, '/reprompt');

    response.type('text/xml');
    response.send(twiml.toString());
});

// ============================================================
// 2. ОБРАБОТКА РЕЧИ — запускаем AI асинхронно, играем музыку
// ============================================================
app.post('/respond', (request, response) => {
    const speechResult = request.body.SpeechResult;
    const callSid      = request.body.CallSid;

    if (speechResult) {
        // Моментальный ответ Twilio — играем музыку пока AI думает
        const twiml = new VoiceResponse();
        twiml.play({ loop: 10 }, HOLD_MUSIC_URL);
        response.type('text/xml');
        response.send(twiml.toString());

        const clientPhone = request.body.From;
        const domain      = process.env.DOMAIN_NAME || request.headers.host;
        const protocol    = process.env.DOMAIN_NAME ? 'https' : 'http';
        const baseUrl     = `${protocol}://${domain}`;

        console.log(`🎙️ [VOICE] Распознано: "${speechResult}"`);
        sessionManager.setUserPhone(callSid, clientPhone);

        // Создаём задачу для этого звонка
        const task = {
            status:      'processing',
            queue:       [],        // чанки текста для TTS
            result:      null,
            interrupted: false,
            redirect:    null,      // { routeKey, phoneNumber } если Interceptor сработал
            startTime:   Date.now()
        };
        pendingAITasks.set(callSid, task);

        const streamingEngine = require('../utils/streamingEngine');

        /**
         * interruptMusic — прерывает hold-музыку и отправляет звонок
         * на /check_ai для дальнейшей обработки.
         */
        const interruptMusic = () => {
            if (!task.interrupted) {
                task.interrupted = true;
                const elapsed     = Date.now() - task.startTime;
                const minDuration = 2000; // минимум 2с музыки
                const delay       = Math.max(0, minDuration - elapsed);

                console.log(`⚡ [INTERRUPT] Прерывание через ${delay}мс...`);

                setTimeout(() => {
                    const updateTwiml = new VoiceResponse();
                    updateTwiml.redirect({ method: 'POST' }, `${baseUrl}/check_ai?CallSid=${callSid}`);

                    client.calls(callSid)
                        .update({ twiml: updateTwiml.toString() })
                        .then(()  => console.log(`✅ [INTERRUPT] Редирект выполнен.`))
                        .catch(err => console.error(`❌ [INTERRUPT] Ошибка:`, err));
                }, delay);
            }
        };

        setImmediate(async () => {
            await streamingEngine.processMessageStream(
                speechResult,
                callSid,
                clientPhone,
                // onChunk — кусок текста готов для TTS
                (chunk) => {
                    if (task.queue) task.queue.push(chunk);
                    interruptMusic();
                },
                // onComplete — AI закончил (нормальный путь)
                (res) => {
                    task.status = 'completed';
                    task.result = res;
                    interruptMusic();
                },
                // onError
                (err) => {
                    console.error('[STREAM] Ошибка:', err);
                    task.status = 'error';
                    interruptMusic();
                },
                // ── onRedirect (INTERCEPTOR) ──────────────────────────────
                // Вызывается когда Gemini выдал [REDIRECT_TECH] или [REDIRECT_FINANCE]
                (routeKey) => {
                    const phoneNumber = botBehavior.getRoutePhone(routeKey);
                    console.log(`🔀 [REDIRECT] routeKey=${routeKey}, phone=${phoneNumber}`);
                    task.status   = 'redirect';
                    task.redirect = { routeKey, phoneNumber };
                    interruptMusic();
                }
                // ─────────────────────────────────────────────────────────
            );
        });

    } else {
        const twiml = new VoiceResponse();
        twiml.redirect({ method: 'POST' }, '/reprompt');
        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// ============================================================
// 3. ПРОВЕРКА РЕЗУЛЬТАТА AI — чтение из очереди чанков
// ============================================================
app.post('/check_ai', (request, response) => {
    const callSid = request.query.CallSid || request.body.CallSid;
    const task    = pendingAITasks.get(callSid);
    const twiml   = new VoiceResponse();

    if (!task) {
        // Задача не найдена — возвращаемся к слушанию клиента
        twiml.gather({
            input:         'speech',
            action:        '/respond',
            speechTimeout: 'auto',
            language:      botBehavior.voiceSettings.he.sttLanguage
        });
        return response.type('text/xml').send(twiml.toString());
    }

    // ── ОШИБКА ──────────────────────────────────────────────
    if (task.status === 'error') {
        pendingAITasks.delete(callSid);
        twiml.say(
            { voice: botBehavior.voiceSettings.he.ttsVoice },
            messageFormatter.getMessage('apiError', 'voice')
        );
        twiml.redirect({ method: 'POST' }, '/reprompt');
        return response.type('text/xml').send(twiml.toString());
    }

    // ── РЕДИРЕКТ (INTERCEPTOR сработал) ─────────────────────
    if (task.status === 'redirect') {
        const { routeKey, phoneNumber } = task.redirect;
        pendingAITasks.delete(callSid);
        console.log(`📞 [DIAL] Переводим звонок: [${routeKey}] → ${phoneNumber}`);

        if (phoneNumber) {
            // Если в очереди ещё есть необозвученные чанки — произносим их
            let prefixText = '';
            while (task.queue && task.queue.length > 0) {
                prefixText += task.queue.shift() + ' ';
            }
            if (prefixText.trim()) {
                const lang  = botBehavior.detectLanguage(prefixText);
                const voice = botBehavior.voiceSettings[lang].ttsVoice;
                twiml.say({ voice }, botBehavior.cleanTextForTTS(prefixText));
            }

            // Физический перевод звонка через <Dial>
            twiml.dial(
                {
                    timeout: botBehavior.operatorSettings.timeout,
                    action:  '/handle-dial-status', // fallback если не ответили
                },
                phoneNumber
            );
        } else {
            // Номер не настроен — сообщаем об ошибке маршрутизации
            console.error(`❌ [DIAL] Номер для [${routeKey}] не настроен!`);
            twiml.say(
                { voice: botBehavior.voiceSettings.he.ttsVoice },
                'מצטערים, אין אפשרות להעביר את השיחה כרגע. אנא נסה שוב מאוחר יותר.'
            );
            twiml.hangup();
        }

        return response.type('text/xml').send(twiml.toString());
    }

    // ── ЧАНКИ — произносим накопленный текст ─────────────────
    if (task.queue && task.queue.length > 0) {
        let combinedText = '';
        while (task.queue.length > 0) combinedText += task.queue.shift() + ' ';

        const lang  = botBehavior.detectLanguage(combinedText);
        const voice = botBehavior.voiceSettings[lang].ttsVoice;
        console.log(`🗣️ [TTS] lang=${lang}, voice=${voice}`);

        twiml.say({ voice }, botBehavior.cleanTextForTTS(combinedText));
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.type('text/xml').send(twiml.toString());
    }

    // ── AI ЕЩЁ ДУМАЕТ — ждём ────────────────────────────────
    if (task.status === 'processing') {
        twiml.pause({ length: 1 });
        twiml.redirect({ method: 'POST' }, `/check_ai?CallSid=${callSid}`);
        return response.type('text/xml').send(twiml.toString());
    }

    // ── ЗАВЕРШЕНО (нормальный путь — без редиректа) ──────────
    if (task.status === 'completed') {
        pendingAITasks.delete(callSid);
        // Слушаем следующий вопрос клиента
        twiml.gather({
            input:         'speech',
            action:        '/respond',
            speechTimeout: 'auto',
            language:      botBehavior.voiceSettings.he.sttLanguage
        });
        twiml.redirect({ method: 'POST' }, '/reprompt');
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ============================================================
// 4. FALLBACK: Что делать если оператор не ответил на <Dial>
// ============================================================
app.post('/handle-dial-status', (request, response) => {
    const dialStatus = request.body.DialCallStatus;
    const voice      = botBehavior.voiceSettings.he.ttsVoice;

    console.log(`🔄 [DIAL STATUS] ${dialStatus}`);

    const twiml = new VoiceResponse();

    if (dialStatus === 'completed' || dialStatus === 'answered') {
        // Оператор ответил и поговорил — кладём трубку
        twiml.hangup();
    } else {
        // Не дозвонились (busy / no-answer / failed)
        twiml.say(
            { voice },
            'מצטערים, הנציג אינו זמין כרגע. אנא התקשר שוב מאוחר יותר. תודה.'
        );
        twiml.hangup();
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ============================================================
// 5. ПЕРЕСПРОС — тишина в трубке
// ============================================================
app.post('/reprompt', (request, response) => {
    const twiml      = new VoiceResponse();
    const retryCount = parseInt(request.query.retry || '0');
    const voice      = botBehavior.voiceSettings.he.ttsVoice;

    console.log(`🎵 [REPROMPT] Тишина. Попытка №${retryCount + 1}`);

    if (retryCount >= 3) {
        console.log('🛑 [HANGUP] 3 попытки без ответа. Завершаем.');
        twiml.say({ voice }, 'תודה, שיהיה לך יום טוב!');
        twiml.hangup();
    } else {
        if (retryCount > 0) {
            twiml.say({ voice }, 'אני עדיין כאן. איך אוכל לעזור לך?');
        }
        twiml.play({ loop: 1 }, HOLD_MUSIC_URL);
        twiml.gather({
            input:         'speech',
            action:        '/respond',
            speechTimeout: 'auto',
            language:      botBehavior.voiceSettings.he.sttLanguage
        });
        twiml.redirect({ method: 'POST' }, `/reprompt?retry=${retryCount + 1}`);
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ============================================================
// ЗАПУСК СЕРВЕРА (HTTP / HTTPS)
// ============================================================
const port       = process.env.PORT || 1337;
const sslKeyPath  = process.env.SSL_PRIVATE_KEY_PATH;
const sslCertPath = process.env.SSL_CERTIFICATE_PATH;

let server;

if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    console.log('[SSL] ✅ HTTPS сервер...');
    server = https.createServer({
        key:  fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
    }, app);
} else {
    console.log('[SSL] ⚠️ HTTP сервер (нет сертификатов).');
    server = http.createServer(app);
}

const wss = new WebSocket.Server({ server, path: '/ws' });
const mediaStreamHandler = new TwilioMediaStreamHandler(wss);

server.listen(port, () => {
    const proto = sslKeyPath && sslCertPath ? 'HTTPS' : 'HTTP';
    console.log(`✅ [Nayax IVR] ${proto} Server on port ${port}`);
});

module.exports.mediaStreamHandler = mediaStreamHandler;