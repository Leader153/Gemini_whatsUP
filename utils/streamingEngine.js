const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getContextForPrompt } = require('../rag/retriever');
const { calendarTools } = require('../calendar/calendarTools');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const crmService = require('./crmService');

require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Потоковая обработка сообщений для минимизации задержки
 * Отправляет текст по мере генерации (слово за словом)
 */
const streamingEngine = {
    /**
     * Обработка сообщения с потоковой генерацией
     */
    async processMessageStream(userMessage, sessionId, userPhone, onChunk, onComplete, onError) {
        console.log(`📨 [STREAMING] Обработка сообщения от ${userPhone}: "${userMessage}"`);
        const startTime = performance.now();

        try {
            sessionManager.initSession(sessionId, 'voice');

            console.time('⏱️ RAG + CRM Task');
            const [context, customerData] = await Promise.all([
                getContextForPrompt(userMessage, 3),
                !sessionManager.getGender(sessionId) ? crmService.getCustomerData(userPhone) : Promise.resolve(null)
            ]);
            console.timeEnd('⏱️ RAG + CRM Task');

            if (customerData && customerData.gender) {
                sessionManager.setGender(sessionId, customerData.gender);
                console.log(`👤 Данные из CRM: ${customerData.name} (${customerData.gender})`);
            }

            const currentGender = sessionManager.getGender(sessionId);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });
            const systemPrompt = botBehavior.getSystemPrompt(context, currentGender, currentDate, userPhone);

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: systemPrompt,
                tools: [{
                    functionDeclarations: calendarTools.map(tool => ({
                        name: tool.name, description: tool.description, parameters: tool.parameters,
                    })),
                }],
            });

            const history = sessionManager.getHistory(sessionId);
            const contentsForGemini = [...history];
            contentsForGemini.push({ role: 'user', parts: [{ text: userMessage }] });

            console.log('📤 Отправка в Gemini (STREAMING) истории длиной:', contentsForGemini.length);
            console.time('⏱️ Gemini Streaming');

            const result = await model.generateContentStream({ contents: contentsForGemini });

            await this._handleStreamResult(result, startTime, sessionId, userMessage, onChunk, onComplete);
            console.timeEnd('⏱️ Gemini Streaming');

        } catch (error) {
            console.error('❌ Ошибка в потоковой обработке:', error);
            onError(error);
        }
    },

    /**
     * Продолжение генерации (после вызова инструментов)
     */
    async continueConversationStream(sessionId, userPhone, onChunk, onComplete, onError) {
        console.log(`📨 [STREAMING] Продолжение генерации для ${sessionId}`);
        const startTime = performance.now();

        try {
            const currentGender = sessionManager.getGender(sessionId);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });
            const context = ''; // Context is implicitly in history or we can skip retrieval for continuation

            const systemPrompt = botBehavior.getSystemPrompt(context, currentGender, currentDate, userPhone);

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: systemPrompt,
                tools: [{
                    functionDeclarations: calendarTools.map(tool => ({
                        name: tool.name, description: tool.description, parameters: tool.parameters,
                    })),
                }],
            });

            const history = sessionManager.getHistory(sessionId);
            console.log('📤 Отправка в Gemini (POST-TOOL) истории длиной:', history.length);

            console.time('⏱️ Gemini Streaming Post-Tool');
            const result = await model.generateContentStream({ contents: history });

            await this._handleStreamResult(result, startTime, sessionId, null, onChunk, onComplete);
            console.timeEnd('⏱️ Gemini Streaming Post-Tool');

        } catch (error) {
            console.error('❌ Ошибка в потоковой обработке (post-tool):', error);
            onError(error);
        }
    },

    /**
     * Внутренний обработчик стрима
     */
    async _handleStreamResult(result, startTime, sessionId, userMessageToSave, onChunk, onComplete) {
        let firstChunkTime = null;
        let fullText = '';
        let wordBuffer = '';
        let accumulatedFunctionCalls = [];

        // Helper to strip tags and send
        const sendChunkSafe = (text) => {
            let cleanText = text.replace(/\[GENDER:\s*(male|female)\]/gi, '').trim();
            if (cleanText) {
                onChunk(cleanText);
            }
        };

        for await (const chunk of result.stream) {
            const functionCalls = chunk.functionCalls();
            if (functionCalls && functionCalls.length > 0) {
                console.log('🔧 Gemini Streaming: получен вызов функции');
                accumulatedFunctionCalls.push(...functionCalls);
                continue;
            }

            let chunkText = '';
            try { chunkText = chunk.text(); } catch (e) { }
            if (!chunkText) continue;

            // Если в первом же чанке приходит тег (даже если с текстом), удаляем его из буфера
            // НО! Если это первый чанк, нужно аккуратно обработать gender
            const genderMatchInChunk = chunkText.match(/\[GENDER:\s*(male|female)\]/i);
            if (genderMatchInChunk) {
                // Сохраняем это для истории
                fullText += genderMatchInChunk[0];
                // Удаляем из текущего текста для буфера озвучки
                chunkText = chunkText.replace(/\[GENDER:\s*(male|female)\]/i, '');

                // Если после удаления пусто - пропускаем
                if (!chunkText.trim()) continue;
            }

            if (!firstChunkTime) {
                firstChunkTime = performance.now();
                const firstChunkLatency = ((firstChunkTime - startTime) / 1000).toFixed(2);
                console.log(`⚡ ПЕРВЫЙ ЧАНК ПОЛУЧЕН: ${firstChunkLatency} секунд`);
            }

            fullText += chunkText;
            wordBuffer += chunkText;

            let processBuffer = true;
            while (processBuffer) {
                processBuffer = false;

                // 0. Safety Check: If buffer starts with '[' (potential tag), wait for ']'
                // unless it's way too long (e.g. > 50 chars), then assume it's just text.
                if (wordBuffer.trim().startsWith('[') && !wordBuffer.includes(']')) {
                    // Still incomplete tag, wait for more chunks
                    if (wordBuffer.length < 50) {
                        break;
                    }
                }

                // 1. Punctuation (removed ':' to avoid splitting [GENDER:])
                const punctuationRegex = /[,\.\?!;\n]/;
                const match = wordBuffer.match(punctuationRegex);

                if (match) {
                    const punctIndex = match.index;
                    const chunkToSend = wordBuffer.substring(0, punctIndex + 1);

                    if (chunkToSend.trim().length > 0) {
                        console.log(`🔊 Chunk (Punctuation): "${chunkToSend.trim()}"`);
                        sendChunkSafe(chunkToSend);
                    }
                    wordBuffer = wordBuffer.substring(punctIndex + 1);
                    processBuffer = true;
                    continue;
                }

                const words = wordBuffer.trim().split(/\s+/).filter(w => w.length > 0);
                if (words.length >= 5) {
                    const wordsToSend = words.slice(0, 5);
                    const chunkToSend = wordsToSend.join(' ') + ' ';

                    console.log(`🔊 Chunk (Length): "${chunkToSend.trim()}"`);
                    sendChunkSafe(chunkToSend);

                    const remainingWords = words.slice(5);
                    wordBuffer = remainingWords.join(' ') + (wordBuffer.endsWith(' ') ? ' ' : '');
                    processBuffer = true;
                    continue;
                }
            }
        }

        if (wordBuffer.trim()) {
            console.log(`🔊 Final Chunk: "${wordBuffer.trim()}"`);
            sendChunkSafe(wordBuffer);
        }

        const endTime = performance.now();
        const totalTime = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`⏱️ Полное время (Stream): ${totalTime}s`);

        if (accumulatedFunctionCalls.length > 0) {
            onComplete({
                text: fullText,
                requiresToolCall: true,
                functionCalls: accumulatedFunctionCalls
            });
            return;
        }

        if (userMessageToSave) {
            sessionManager.addToHistory(sessionId, 'user', userMessageToSave);
        }

        const genderMatch = fullText.match(/\[GENDER:\s*(male|female)\]/i);
        if (genderMatch) {
            const detectedGender = genderMatch[1].toLowerCase();
            sessionManager.setGender(sessionId, detectedGender);
            fullText = fullText.replace(/\[GENDER:\s*(male|female)\]/i, '').trim();
        }

        sessionManager.addToHistory(sessionId, 'model', fullText);

        onComplete({
            text: fullText,
            requiresToolCall: false,
            functionCalls: null
        });
    }
};

module.exports = streamingEngine;
