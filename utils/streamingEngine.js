const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getContextForPrompt } = require('../rag/retriever');
const { calendarTools } = require('../calendar/calendarTools');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const crmService = require('./crmService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- УМНОЕ ОПРЕДЕЛЕНИЕ ДОМЕНА (ИСПРАВЛЕНО) ---
function detectDomain(text) {
    const lower = text.toLowerCase();
    
    // 1. ТЕРМИНАЛЫ (Приоритет)
    const terminalKeywords = [
        'מסוף', 'אשראי', 'terminal', 'קופה',
        'חנות', 'עסק', 'לגבות', 'תשלום',
        'סליקה', 'מכשיר', 'pos'
    ];
    
    if (terminalKeywords.some(word => lower.includes(word))) {
        return 'Terminals';
    }

    // 2. ЯХТЫ
    const yachtKeywords = [
        'יאכטה', 'שיט', 'הפלגה', 'yacht', 'סירה', 
        'שייט', 'ים ', ' ים' // Только с пробелами!
    ];

    if (yachtKeywords.some(word => lower.includes(word))) {
        return 'Yachts';
    }
    
    return null;
}
// --------------------------------

const streamingEngine = {
    async processMessageStream(userMessage, sessionId, userPhone, onChunk, onComplete, onError) {
        console.log(`📨 [STREAM] Start: "${userMessage}"`);
        const startTime = performance.now();

        try {
            sessionManager.initSession(sessionId, 'voice');

            let currentDomain = detectDomain(userMessage);
            if (!currentDomain) {
                currentDomain = sessionManager.getDomain(sessionId);
            } else {
                const oldDomain = sessionManager.getDomain(sessionId);
                if (oldDomain !== currentDomain) {
                    console.log(`🔍 [STREAM] Смена домена: ${oldDomain} -> ${currentDomain}`);
                    sessionManager.setDomain(sessionId, currentDomain);
                }
            }

            let searchQuery = userMessage;
            if (currentDomain) searchQuery += ` (Domain: ${currentDomain})`;

            console.time('⏱️ RAG + CRM Task');
            const [context, customerData] = await Promise.all([
                getContextForPrompt(searchQuery, 3),
                !sessionManager.getGender(sessionId) ? crmService.getCustomerData(userPhone) : Promise.resolve(null)
            ]);
            console.timeEnd('⏱️ RAG + CRM Task');

            if (customerData?.gender) sessionManager.setGender(sessionId, customerData.gender);

            const systemPrompt = botBehavior.getSystemPrompt(context, sessionManager.getGender(sessionId), new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' }), userPhone);

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

    async continueConversationStream(sessionId, userPhone, onChunk, onComplete, onError) {
        console.log(`📨 [STREAM] Continue...`);
        const startTime = performance.now();
        try {
            const systemPrompt = botBehavior.getSystemPrompt('', sessionManager.getGender(sessionId), new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' }), userPhone);
            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{
                    functionDeclarations: calendarTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
                }]
            });
            const history = sessionManager.getHistory(sessionId);
            const result = await model.generateContentStream({ contents: history });
            await this._handleStreamResult(result, startTime, sessionId, null, onChunk, onComplete);
        } catch (error) {
            console.error('❌ [STREAM] Continue Error:', error);
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
                if (genderMatch) sessionManager.setGender(sessionId, genderMatch[1].toLowerCase());
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