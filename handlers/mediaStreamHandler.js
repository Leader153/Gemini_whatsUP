const WebSocket = require('ws');
const streamingEngine = require('../utils/streamingEngine');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');

/**
 * WebSocket сервер для Twilio Media Streams
 * Обеспечивает двунаправленную потоковую передачу аудио
 */

class TwilioMediaStreamHandler {
    constructor(wss) {
        this.wss = wss;
        this.activeStreams = new Map(); // CallSid -> { ws, streamSid, userPhone }

        this.setupWebSocketServer();
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws) => {
            console.log('🔌 WebSocket подключение установлено');

            let callSid = null;
            let streamSid = null;
            let userPhone = null;
            let audioBuffer = [];

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);

                    switch (data.event) {
                        case 'start':
                            // Начало стрима
                            callSid = data.start.callSid;
                            streamSid = data.start.streamSid;
                            userPhone = data.start.customParameters?.userPhone || 'unknown';

                            console.log(`🎬 Стрим начат: CallSid=${callSid}, StreamSid=${streamSid}`);

                            this.activeStreams.set(callSid, { ws, streamSid, userPhone });

                            // Отправляем приветствие
                            this.sendTTS(ws, streamSid, botBehavior.getGreeting());
                            break;

                        case 'media':
                            // Получаем аудио от пользователя (base64 encoded mulaw)
                            // Twilio уже делает STT, поэтому нам не нужно обрабатывать сырое аудио
                            // Мы будем использовать отдельный эндпоинт для получения распознанного текста
                            break;

                        case 'stop':
                            console.log(`🛑 Стрим остановлен: ${streamSid}`);
                            this.activeStreams.delete(callSid);
                            break;

                        default:
                            console.log('📦 Неизвестное событие:', data.event);
                    }
                } catch (error) {
                    console.error('❌ Ошибка обработки WebSocket сообщения:', error);
                }
            });

            ws.on('close', () => {
                console.log('🔌 WebSocket соединение закрыто');
                if (callSid) {
                    this.activeStreams.delete(callSid);
                }
            });

            ws.on('error', (error) => {
                console.error('❌ WebSocket ошибка:', error);
            });
        });

        console.log('✅ WebSocket сервер для Media Streams запущен');
    }

    /**
     * Обработка распознанного текста от пользователя
     * Вызывается из HTTP эндпоинта после STT
     */
    async handleUserMessage(callSid, userMessage, userPhone) {
        const stream = this.activeStreams.get(callSid);

        if (!stream) {
            console.warn(`⚠️ Активный стрим не найден для CallSid: ${callSid}`);
            return;
        }

        const { ws, streamSid } = stream;

        console.log(`💬 Обработка сообщения для стрима ${streamSid}: "${userMessage}"`);

        // Запускаем потоковую генерацию от Gemini
        await streamingEngine.processMessageStream(
            userMessage,
            callSid,
            userPhone,
            // onChunk - отправляем каждый чанк в TTS
            (chunkText) => {
                this.sendTTS(ws, streamSid, chunkText);
            },
            // onComplete
            (result) => {
                console.log(`✅ Генерация завершена для ${callSid}`);
                // Можно отправить специальное событие о завершении
            },
            // onError
            (error) => {
                console.error(`❌ Ошибка генерации для ${callSid}:`, error);
                this.sendTTS(ws, streamSid, 'מצטערת, הייתה שגיאה. אנא נסה שוב.');
            }
        );
    }

    /**
     * Отправка текста в Twilio TTS через WebSocket
     */
    sendTTS(ws, streamSid, text) {
        if (!text || !text.trim()) return;

        console.log(`🔊 TTS → Twilio: "${text}"`);

        // Twilio Media Streams использует специальный формат для TTS
        // Мы отправляем команду 'mark' для синхронизации
        const message = {
            event: 'mark',
            streamSid: streamSid,
            mark: {
                name: 'tts_chunk'
            }
        };

        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));

                // ВАЖНО: Для реального TTS нужно использовать отдельный сервис
                // Например, Google Cloud TTS или Twilio TTS API
                // Здесь показана концепция интеграции
            }
        } catch (error) {
            console.error('❌ Ошибка отправки TTS:', error);
        }
    }

    /**
     * Получить активный стрим по CallSid
     */
    getStream(callSid) {
        return this.activeStreams.get(callSid);
    }
}

module.exports = TwilioMediaStreamHandler;
