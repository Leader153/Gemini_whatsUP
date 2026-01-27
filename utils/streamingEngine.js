const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getContextForPrompt } = require('../rag/retriever');
const { calendarTools } = require('../calendar/calendarTools');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const crmService = require('./crmService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- ВАЖНО: Функция для запоминания темы (Яхты vs Терминалы) ---
function detectDomain(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('יאכטה') || lowerText.includes('שיט') || lowerText.includes('הפלגה') || lowerText.includes('yacht')) {
        return 'Yachts';
    }
    if (lowerText.includes('מסוף') || lowerText.includes('אשראי') || lowerText.includes('terminal')) {
        return 'Terminals';
    }
    return null;
}
// ----------------------------------------------------------------

const streamingEngine = {
    async processMessageStream(userMessage, sessionId, userPhone, onChunk, onComplete, onError) {
        console.log(`📨 [STREAM] Start: "${userMessage}"`);
        const startTime = performance.now();

        try {
            sessionManager.initSession(sessionId, 'voice');

            // 1. STICKY CONTEXT: Определяем или вспоминаем домен
            let currentDomain = detectDomain(userMessage);
            if (!currentDomain) {
                currentDomain = sessionManager.getDomain(sessionId);
            } else {
                sessionManager.setDomain(sessionId, currentDomain);
                console.log(`🔍 [STREAM] Смена домена: ${currentDomain}`);
            }

            // 2. RAG + CRM
            let searchQuery = userMessage;
            if (currentDomain) {
                searchQuery += ` (Domain: ${currentDomain})`;
            }

            console.time('⏱️ RAG + CRM Task');
            const [context, customerData] = await Promise.all([
                getContextForPrompt(searchQuery, 3),
                !sessionManager.getGender(sessionId) ? crmService.getCustomerData(userPhone) : Promise.resolve(null)
            ]);
            console.timeEnd('⏱️ RAG + CRM Task');

            if (customerData?.gender) {
                sessionManager.setGender(sessionId, customerData.gender);
            }

            const currentGender = sessionManager.getGender(sessionId);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });
            
            // Передаем контекст (с учетом домена) в промпт
            const systemPrompt = botBehavior.getSystemPrompt(context, currentGender, currentDate, userPhone);

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{
                    functionDeclarations: calendarTools.map(t => ({
                        name: t.name, description: t.description, parameters: t.parameters
                    }))
                }]
            });

            const history = sessionManager.getHistory(sessionId);
            const contents = [...history, { role: 'user', parts: [{ text: userMessage }] }];

            console.log('📤 [STREAM] Gemini Request...');
            const result = await model.generateContentStream({ contents });

            await this._handleStreamResult(result, startTime, sessionId, userMessage, onChunk, onComplete);

        } catch (error) {
            console.error('❌ [STREAM] Error:', error);
            if (onError) onError(error);
        }
    },

    // --- CONTINUE STREAM (после вызова функции) ---
    async continueConversationStream(sessionId, userPhone, onChunk, onComplete, onError) {
        console.log(`📨 [STREAM] Continue conversation...`);
        const startTime = performance.now();

        try {
            const currentGender = sessionManager.getGender(sessionId);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });
            // При продолжении контекст уже в истории, RAG можно пропустить
            const context = ''; 

            const systemPrompt = botBehavior.getSystemPrompt(context, currentGender, currentDate, userPhone);

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{
                    functionDeclarations: calendarTools.map(t => ({
                        name: t.name, description: t.description, parameters: t.parameters
                    }))
                }]
            });

            const history = sessionManager.getHistory(sessionId);
            const result = await model.generateContentStream({ contents: history });

            await this._handleStreamResult(result, startTime, sessionId, null, onChunk, onComplete);

        } catch (error) {
            console.error('❌ [STREAM] Post-tool error:', error);
            if (onError) onError(error);
        }
    },

    async _handleStreamResult(result, startTime, sessionId, userMessageToSave, onChunk, onComplete) {
        let fullText = '';
        let wordBuffer = '';
        let functionCalls = [];

        const sendSafe = (text) => {
            const clean = text.replace(/\[GENDER:.*?\]/gi, '').trim();
            if (clean.length > 0 && onChunk) onChunk(clean);
        };

        try {
            for await (const chunk of result.stream) {
                const fc = chunk.functionCalls();
                if (fc && fc.length > 0) { functionCalls.push(...fc); continue; }

                let text = '';
                try { text = chunk.text(); } catch (e) {}
                if (!text) continue;

                if (text.match(/\[GENDER:/)) {
                    fullText += text;
                    text = text.replace(/\[GENDER:.*?\]/gi, '');
                }
                if (!text) continue;

                fullText += text;
                wordBuffer += text;

                const match = wordBuffer.match(/[,\.\?!;\n]/);
                if (match) {
                    sendSafe(wordBuffer.substring(0, match.index + 1));
                    wordBuffer = wordBuffer.substring(match.index + 1);
                } else if (wordBuffer.split(' ').length > 6) {
                    sendSafe(wordBuffer);
                    wordBuffer = '';
                }
            }
            if (wordBuffer) sendSafe(wordBuffer);

            if (functionCalls.length > 0) {
                if (onComplete) onComplete({ text: fullText, requiresToolCall: true, functionCalls });
            } else {
                if (userMessageToSave) sessionManager.addToHistory(sessionId, 'user', userMessageToSave);
                
                const genderMatch = fullText.match(/\[GENDER:\s*(male|female)\]/i);
                if (genderMatch) {
                    sessionManager.setGender(sessionId, genderMatch[1].toLowerCase());
                    fullText = fullText.replace(/\[GENDER:.*?\]/gi, '').trim();
                }

                sessionManager.addToHistory(sessionId, 'model', fullText);
                if (onComplete) onComplete({ text: fullText, requiresToolCall: false, functionCalls: null });
            }
        } catch (error) {
            console.error('❌ [STREAM] Chunk Error:', error);
            throw error;
        }
    }
};

module.exports = streamingEngine;