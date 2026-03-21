// ============================================================
// conversationEngine.js — Nayax Smart IVR (PoC)
// Рефакторинг: убраны RAG, Calendar Tools, detectDomain, CRM.
// Используется для WhatsApp/SMS канала (голос — streamingEngine).
// ============================================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const sessionManager = require('../memory/sessionManager');
const botBehavior    = require('../data/botBehavior');
const messageFormatter = require('./messageFormatter');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const conversationEngine = {

    /**
     * Обработка сообщения (WhatsApp / SMS / текстовые каналы).
     * Для голосового канала используется streamingEngine.
     */
    async processMessage(userMessage, sessionId, channel, userPhone) {
        console.log(`📨 [${channel.toUpperCase()}] "${userMessage}"`);

        try {
            sessionManager.initSession(sessionId, channel);

            const systemPrompt = botBehavior.getSystemPrompt();

            const model = genAI.getGenerativeModel({
                model:             botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                // Нет tools — IVR использует текстовые метки, не Function Calling
            });

            const history    = sessionManager.getHistory(sessionId);
            const newContent = userMessage.trim()
                ? [{ role: 'user', parts: [{ text: userMessage }] }]
                : [];

            const result   = await model.generateContent({ contents: [...history, ...newContent] });
            const response = result.response;

            if (userMessage.trim()) {
                sessionManager.addToHistory(sessionId, 'user', userMessage);
            }

            let text = response.text();

            // Проверяем на метки маршрутизации (в текстовых каналах — информационно)
            const redirectMatch = text.match(/\[(REDIRECT_TECH|REDIRECT_FINANCE)\]/i);
            if (redirectMatch) {
                const routeKey   = redirectMatch[1].toUpperCase();
                const phoneNumber = botBehavior.getRoutePhone(routeKey);
                // Убираем метку из текста ответа
                text = text.replace(/\[REDIRECT_TECH\]/gi, '').replace(/\[REDIRECT_FINANCE\]/gi, '').trim();
                console.log(`🔀 [ENGINE] Метка [${routeKey}] в текстовом канале. Телефон: ${phoneNumber}`);
                // В текстовом канале — отправляем инфо о переводе
                sessionManager.addToHistory(sessionId, 'model', text);
                return {
                    text:             messageFormatter.format(text, channel),
                    requiresToolCall: false,
                    redirect:         { routeKey, phoneNumber },
                };
            }

            sessionManager.addToHistory(sessionId, 'model', text);
            return {
                text:             messageFormatter.format(text, channel),
                requiresToolCall: false,
            };

        } catch (error) {
            console.error(`❌ Error processMessage:`, error);
            return {
                text:             messageFormatter.getMessage('apiError', channel),
                requiresToolCall: false,
            };
        }
    },
};

module.exports = conversationEngine;