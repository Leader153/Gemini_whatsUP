const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getContextForPrompt } = require('../rag/retriever');
const { calendarTools, handleFunctionCall } = require('../calendar/calendarTools');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const crmService = require('./crmService');
const messageFormatter = require('./messageFormatter');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- УМНОЕ ОПРЕДЕЛЕНИЕ ДОМЕНА ---
function detectDomain(text) {
    const lower = text.toLowerCase();
    
    // Яхты
    if (lower.includes('יאכטה') || lower.includes('שיט') || lower.includes('הפלגה') || lower.includes('yacht') || lower.includes('ים') || lower.includes('סירה')) {
        return 'Yachts';
    }
    
    // Терминалы (Расширенный список)
    const terminalKeywords = [
        'מסוף', 'אשראי', 'terminal', 'קופה', // Стандартные
        'חנות', 'עסק', 'לגבות', 'תשלום',     // Магазин, Бизнес, Оплата
        'סליקה', 'מכשיר'                     // Слика, Аппарат
    ];
    
    if (terminalKeywords.some(word => lower.includes(word))) {
        return 'Terminals';
    }

    return null;
}
// --------------------------------

const conversationEngine = {
    async processMessage(userMessage, sessionId, channel, userPhone) {
        console.log(`📨 [${channel.toUpperCase()}] "${userMessage}"`);
        
        try {
            sessionManager.initSession(sessionId, channel);

            let currentDomain = detectDomain(userMessage);
            if (!currentDomain) {
                currentDomain = sessionManager.getDomain(sessionId);
            } else {
                sessionManager.setDomain(sessionId, currentDomain);
                console.log(`🔍 [ENGINE] Смена домена: ${currentDomain}`);
            }

            let searchQuery = userMessage;
            if (currentDomain) searchQuery += ` (Domain: ${currentDomain})`;

            const [context, customerData] = await Promise.all([
                getContextForPrompt(searchQuery, 3),
                !sessionManager.getGender(sessionId) ? crmService.getCustomerData(userPhone) : null
            ]);

            if (customerData?.gender) sessionManager.setGender(sessionId, customerData.gender);

            const systemPrompt = botBehavior.getSystemPrompt(context, sessionManager.getGender(sessionId), new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' }), userPhone);

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{
                    functionDeclarations: calendarTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
                }]
            });

            const history = sessionManager.getHistory(sessionId);
            const result = await model.generateContent({ contents: [...history, { role: 'user', parts: [{ text: userMessage }] }] });
            const response = result.response;
            
            sessionManager.addToHistory(sessionId, 'user', userMessage);

            const functionCalls = response.functionCalls();
            if (functionCalls && functionCalls.length > 0) {
                console.log('🔧 Gemini function:', functionCalls[0].name);
                
                if (channel === 'whatsapp' || channel === 'sms') {
                    return await this.handleToolCalls(functionCalls, sessionId, channel, userPhone, context);
                }

                sessionManager.setPendingFunctionCalls(sessionId, functionCalls, context);
                return { text: messageFormatter.getMessage('checking', channel), requiresToolCall: true, functionCalls: functionCalls };
            } else {
                let text = response.text();
                const genderMatch = text.match(/\[GENDER:\s*(male|female)\]/i);
                if (genderMatch) sessionManager.setGender(sessionId, genderMatch[1].toLowerCase());
                
                sessionManager.addToHistory(sessionId, 'model', text);
                return { text: messageFormatter.format(text, channel), requiresToolCall: false };
            }

        } catch (error) {
            console.error(`❌ Error processMessage:`, error);
            return { text: messageFormatter.getMessage('apiError', channel), requiresToolCall: false };
        }
    },

    async handleToolCalls(functionCalls, sessionId, channel, userPhone = null, existingContext = null, generateResponse = true) {
        try {
            for (const functionCall of functionCalls) {
                const functionResult = await handleFunctionCall(functionCall.name, functionCall.args);
                sessionManager.addFunctionInteractionToHistory(sessionId, functionCall, functionResult);

                if (functionCall.name === 'transfer_to_support' && channel === 'voice') {
                    return { text: messageFormatter.getMessage('transferring', channel), requiresToolCall: false, transferToOperator: true };
                }
            }

            if (generateResponse) {
                const context = existingContext || await getContextForPrompt('', 3);
                const systemPrompt = botBehavior.getSystemPrompt(context, sessionManager.getGender(sessionId), new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' }), userPhone);
                const model = genAI.getGenerativeModel({
                    model: botBehavior.geminiSettings.model,
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    tools: [{ functionDeclarations: calendarTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
                });
                
                const result = await model.generateContent({ contents: sessionManager.getHistory(sessionId) });
                let text = result.response.text();
                sessionManager.addToHistory(sessionId, 'model', text);
                return { text: messageFormatter.format(text, channel), requiresToolCall: false };
            }
            return { text: '', requiresToolCall: false };
        } catch (error) {
            console.error('❌ Error handleToolCalls:', error);
            return { text: messageFormatter.getMessage('apiError', channel), requiresToolCall: false };
        }
    }
};

module.exports = conversationEngine;