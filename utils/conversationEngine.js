const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getContextForPrompt } = require('../rag/retriever');
const { calendarTools, handleFunctionCall } = require('../calendar/calendarTools');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const crmService = require('./crmService');
const messageFormatter = require('./messageFormatter');

require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Общий движок для обработки сообщений из всех каналов
 * Поддерживает: voice, whatsapp, sms
 */

const conversationEngine = {
    /**
     * Обработка входящего сообщения
     * @param {string} userMessage - Текст сообщения от пользователя
     * @param {string} sessionId - ID сессии (CallSid для голоса, номер для WhatsApp/SMS)
     * @param {string} channel - Канал связи: 'voice', 'whatsapp', 'sms'
     * @param {string} userPhone - Номер телефона пользователя
     * @returns {Object} { text: string, requiresToolCall: boolean, functionCalls: array }
     */
    async processMessage(userMessage, sessionId, channel, userPhone) {
        console.log(`📨 [${channel.toUpperCase()}] Обработка сообщения от ${userPhone}: "${userMessage}"`);
        console.time(`⏱️ Total Response Time [${channel}]`);

        try {
            // Инициализация сессии с указанием канала
            sessionManager.initSession(sessionId, channel);

            // ПАРАЛЛЕЛИЗАЦИЯ: Запускаем RAG и CRM одновременно
            console.time('⏱️ RAG + CRM Task');
            const [context, customerData] = await Promise.all([
                getContextForPrompt(userMessage, 3),
                !sessionManager.getGender(sessionId) ? crmService.getCustomerData(userPhone) : Promise.resolve(null)
            ]);
            console.timeEnd('⏱️ RAG + CRM Task');

            // CRM: Применяем данные о клиенте, если они получены
            if (customerData && customerData.gender) {
                sessionManager.setGender(sessionId, customerData.gender);
                console.log(`👤 Данные из CRM для ${userPhone}: ${customerData.name} (${customerData.gender})`);
            }

            const currentGender = sessionManager.getGender(sessionId);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });

            // DEBUG: Проверяем контекст
            console.log('📚 RAG Context length:', context.length, 'chars');

            const systemPrompt = botBehavior.getSystemPrompt(context, currentGender, currentDate);

            // Инициализация модели Gemini
            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: systemPrompt,
                tools: [{
                    functionDeclarations: calendarTools.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters,
                    })),
                }],
            });

            // Формируем contents из истории + текущее сообщение
            const history = sessionManager.getHistory(sessionId);
            const contentsForGemini = [...history];
            contentsForGemini.push({ role: 'user', parts: [{ text: userMessage }] });

            console.log('📤 Отправка в Gemini истории длиной:', contentsForGemini.length);
            console.time('⏱️ Gemini API Call');

            // Отправляем промпт в Gemini
            const result = await model.generateContent({ contents: contentsForGemini });
            console.timeEnd('⏱️ Gemini API Call');
            const geminiResponse = result.response;

            // Сохраняем запрос пользователя в историю
            sessionManager.addToHistory(sessionId, 'user', userMessage);

            // Проверяем, вызвала ли модель функцию
            const functionCalls = geminiResponse.functionCalls();

            if (functionCalls && functionCalls.length > 0) {
                console.log('🔧 Gemini запрашивает вызов функции:', functionCalls.map(fc => fc.name).join(', '));

                // Для текстовых каналов (WhatsApp/SMS) обрабатываем функции сразу
                if (channel === 'whatsapp' || channel === 'sms') {
                    return await this.handleToolCalls(functionCalls, sessionId, channel);
                }

                // Для голоса возвращаем промежуточное сообщение
                return {
                    text: messageFormatter.getMessage('checking', channel),
                    requiresToolCall: true,
                    functionCalls: functionCalls
                };

            } else {
                // Обычный ответ (без вызова функций)
                let text = geminiResponse.text();

                // ИЗВЛЕЧЕНИЕ ГЕНДЕРА: Если Gemini прислал тег [GENDER: ...], сохраняем его
                const genderMatch = text.match(/\[GENDER:\s*(male|female)\]/i);
                if (genderMatch) {
                    const detectedGender = genderMatch[1].toLowerCase();
                    sessionManager.setGender(sessionId, detectedGender);
                    // Удаляем тег из текста
                    text = text.replace(/\[GENDER:\s*(male|female)\]/i, '').trim();
                }

                // Добавляем ответ модели в историю
                sessionManager.addToHistory(sessionId, 'model', text);

                // Форматируем ответ для канала
                const formattedText = messageFormatter.format(text, channel);

                console.timeEnd(`⏱️ Total Response Time [${channel}]`);

                return {
                    text: formattedText,
                    requiresToolCall: false,
                    functionCalls: null
                };
            }

        } catch (error) {
            console.error(`❌ Ошибка обработки сообщения [${channel}]:`, error);
            return {
                text: messageFormatter.getMessage('apiError', channel),
                requiresToolCall: false,
                functionCalls: null,
                error: error
            };
        }
    },

    /**
     * Обработка вызовов функций (инструментов)
     * @param {Array} functionCalls - Массив вызовов функций от Gemini
     * @param {string} sessionId - ID сессии
     * @param {string} channel - Канал связи
     * @returns {Object} { text: string, requiresToolCall: false }
     */
    async handleToolCalls(functionCalls, sessionId, channel) {
        console.log(`⚙️ Обработка инструментов для ${sessionId} [${channel}]`);

        try {
            // Обрабатываем каждый вызов функции
            for (const functionCall of functionCalls) {
                console.log('🔧 Выполнение функции:', functionCall.name);
                const functionResult = await handleFunctionCall(functionCall.name, functionCall.args);
                console.log('✅ Результат:', functionResult);

                // Добавляем в историю
                sessionManager.addFunctionInteractionToHistory(sessionId, functionCall, functionResult);

                // SPECIAL LOGIC FOR TRANSFER (только для голоса)
                if (functionCall.name === 'transfer_to_support' && channel === 'voice') {
                    return {
                        text: messageFormatter.getMessage('transferring', channel),
                        requiresToolCall: false,
                        transferToOperator: true
                    };
                }

                // Для WhatsApp/SMS перевод на оператора означает просто сообщение
                if (functionCall.name === 'transfer_to_support' && (channel === 'whatsapp' || channel === 'sms')) {
                    return {
                        text: 'נציג יצור איתך קשר בהקדם. תודה! 📞',
                        requiresToolCall: false
                    };
                }
            }

            // Получаем контекст для повторного вызова модели
            const context = await getContextForPrompt('', 3);
            const currentGender = sessionManager.getGender(sessionId);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: botBehavior.getSystemPrompt(context, currentGender, currentDate),
                tools: [{
                    functionDeclarations: calendarTools.map(tool => ({
                        name: tool.name, description: tool.description, parameters: tool.parameters,
                    })),
                }],
            });

            // Отправляем обновленную историю обратно в Gemini
            const history = sessionManager.getHistory(sessionId);
            const result = await model.generateContent({ contents: history });
            let text = result.response.text();

            // ИЗВЛЕЧЕНИЕ ГЕНДЕРА
            const genderMatch = text.match(/\[GENDER:\s*(male|female)\]/i);
            if (genderMatch) {
                const detectedGender = genderMatch[1].toLowerCase();
                sessionManager.setGender(sessionId, detectedGender);
                text = text.replace(/\[GENDER:\s*(male|female)\]/i, '').trim();
            }

            // Сохраняем и форматируем ответ
            sessionManager.addToHistory(sessionId, 'model', text);
            const formattedText = messageFormatter.format(text, channel);

            console.log('Gemini post-tool response:', text);

            return {
                text: formattedText,
                requiresToolCall: false
            };

        } catch (error) {
            console.error('❌ Ошибка в handleToolCalls:', error);
            return {
                text: messageFormatter.getMessage('apiError', channel),
                requiresToolCall: false,
                error: error
            };
        }
    }
};

module.exports = conversationEngine;