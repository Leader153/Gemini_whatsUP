// ============================================================
// streamingEngine.js — Nayax Smart IVR (PoC)
// Рефакторинг: убраны RAG, Calendar Tools, detectDomain.
// Добавлен Interceptor меток [REDIRECT_*].
// ============================================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const sessionManager = require('../memory/sessionManager');
const botBehavior    = require('../data/botBehavior');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Регулярное выражение для поиска любой метки маршрутизации
const REDIRECT_PATTERN = /\[(REDIRECT_TECH|REDIRECT_FINANCE)\]/i;

const streamingEngine = {

    /**
     * Основной метод обработки голосового сообщения (стриминг).
     *
     * @param {string}   userMessage  — распознанная речь клиента
     * @param {string}   sessionId    — ID сессии (обычно CallSid)
     * @param {string}   userPhone    — номер телефона клиента
     * @param {Function} onChunk      — callback(text) — кусок текста для TTS
     * @param {Function} onComplete   — callback(result) — финальный результат
     * @param {Function} onError      — callback(error)
     * @param {Function} onRedirect   — callback(routeKey, cleanPrefix) — ПЕРЕВОД ЗВОНКА
     *                                  routeKey: 'REDIRECT_TECH' | 'REDIRECT_FINANCE'
     *                                  cleanPrefix: текст до метки (уже озвученный или нет)
     */
    async processMessageStream(userMessage, sessionId, userPhone, onChunk, onComplete, onError, onRedirect) {
        console.log(`📨 [STREAM] Start: "${userMessage}"`);
        const startTime = performance.now();

        try {
            sessionManager.initSession(sessionId, 'voice');

            const systemPrompt = botBehavior.getSystemPrompt();

            const model = genAI.getGenerativeModel({
                model:             botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                // Нет tools — IVR не использует Function Calling
            });

            const history  = sessionManager.getHistory(sessionId);
            const contents = [...history, { role: 'user', parts: [{ text: userMessage }] }];

            console.log('📤 [STREAM] Запрос к Gemini...');
            const result = await model.generateContentStream({ contents });

            await this._handleStreamResult(
                result, startTime, sessionId, userMessage,
                onChunk, onComplete, onError, onRedirect
            );

        } catch (error) {
            console.error('❌ [STREAM] Error:', error);
            if (onError) onError(error);
        }
    },

    /**
     * Продолжение разговора (после инструмента или переспроса).
     * В IVR-режиме используется редко, но оставляем для совместимости.
     */
    async continueConversationStream(sessionId, userPhone, onChunk, onComplete, onError, onRedirect) {
        console.log(`📨 [STREAM] Continue...`);
        const startTime = performance.now();
        try {
            const systemPrompt = botBehavior.getSystemPrompt();
            const model = genAI.getGenerativeModel({
                model:             botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
            });
            const history = sessionManager.getHistory(sessionId);
            const result  = await model.generateContentStream({ contents: history });
            await this._handleStreamResult(
                result, startTime, sessionId, null,
                onChunk, onComplete, onError, onRedirect
            );
        } catch (error) {
            console.error('❌ [STREAM] Continue Error:', error);
            if (onError) onError(error);
        }
    },

    /**
     * Внутренний обработчик стрима Gemini.
     * 
     * INTERCEPTOR логика:
     *   - Накапливаем текст в wordBuffer.
     *   - После каждого чанка проверяем наличие [REDIRECT_*].
     *   - Если нашли — вырезаем метку, озвучиваем текст ДО неё,
     *     останавливаем стрим, вызываем onRedirect(routeKey).
     */
    async _handleStreamResult(result, startTime, sessionId, userMessageToSave, onChunk, onComplete, onError, onRedirect) {
        let fullText   = '';
        let wordBuffer = '';
        let redirectTriggered = false;

        /**
         * Безопасная отправка текста в TTS.
         * Фильтрует пустые строки и остаточные маркеры.
         */
        const sendSafe = (text) => {
            // Очищаем от любых REDIRECT-меток (страховка)
            const clean = text
                .replace(/\[REDIRECT_TECH\]/gi, '')
                .replace(/\[REDIRECT_FINANCE\]/gi, '')
                .trim();
            if (clean.length > 0 && onChunk) {
                onChunk(clean);
            }
        };

        try {
            for await (const chunk of result.stream) {
                // Если редирект уже сработал — прекращаем читать стрим
                if (redirectTriggered) break;

                let text = '';
                try { text = chunk.text(); } catch (e) { continue; }
                if (!text) continue;

                fullText   += text;
                wordBuffer += text;

                // ── INTERCEPTOR ───────────────────────────────────────────
                const redirectMatch = REDIRECT_PATTERN.exec(wordBuffer);
                if (redirectMatch) {
                    redirectTriggered = true;
                    const routeKey    = redirectMatch[1].toUpperCase(); // 'REDIRECT_TECH' | 'REDIRECT_FINANCE'
                    const prefixText  = wordBuffer.substring(0, redirectMatch.index);

                    console.log(`🔀 [INTERCEPTOR] Метка найдена: [${routeKey}]. Прерываем стрим.`);
                    console.log(`   Текст до метки: "${prefixText.trim()}"`);

                    // Озвучиваем текст объявления (до метки), если он есть
                    if (prefixText.trim()) {
                        sendSafe(prefixText);
                    }

                    // Сохраняем в историю то что успел сказать бот
                    if (userMessageToSave) sessionManager.addToHistory(sessionId, 'user', userMessageToSave);
                    sessionManager.addToHistory(sessionId, 'model', fullText.replace(REDIRECT_PATTERN, '').trim());

                    // Вызываем callback перевода звонка
                    if (onRedirect) {
                        onRedirect(routeKey, prefixText.trim());
                    } else {
                        // Fallback если onRedirect не передан
                        console.warn(`⚠️ [INTERCEPTOR] onRedirect не задан! Маршрут [${routeKey}] потерян.`);
                        if (onComplete) onComplete({ text: prefixText.trim(), requiresToolCall: false, redirect: routeKey });
                    }
                    return; // Выходим из функции — редирект обрабатывает answer_phone.js
                }
                // ─────────────────────────────────────────────────────────

                // Стандартная логика отправки чанков по пунктуации
                const match = wordBuffer.match(/[,\.?!;\n]/);
                if (match) {
                    sendSafe(wordBuffer.substring(0, match.index + 1));
                    wordBuffer = wordBuffer.substring(match.index + 1);
                } else if (wordBuffer.split(' ').length > 6) {
                    sendSafe(wordBuffer);
                    wordBuffer = '';
                }
            }

            // Отправляем хвост буфера если стрим закончился без редиректа
            if (!redirectTriggered && wordBuffer) {
                sendSafe(wordBuffer);
            }

            // Финальное завершение (нормальный путь — без редиректа)
            if (!redirectTriggered) {
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                console.log(`✅ [STREAM] Завершён за ${elapsed}с.`);
                if (userMessageToSave) sessionManager.addToHistory(sessionId, 'user', userMessageToSave);
                sessionManager.addToHistory(sessionId, 'model', fullText);
                if (onComplete) onComplete({ text: fullText, requiresToolCall: false, functionCalls: null });
            }

        } catch (error) {
            console.error('❌ [STREAM] Chunk Error:', error);
            if (onError) onError(error);
        }
    },
};

module.exports = streamingEngine;