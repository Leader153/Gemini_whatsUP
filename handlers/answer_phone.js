const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getContextForPrompt } = require('../rag/retriever');
const { calendarTools, handleFunctionCall } = require('../calendar/calendarTools');
const { whatsAppTools, handleWhatsAppCall } = require('../whatsapp/whatsappTools');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const crmService = require('../utils/crmService');
const messagingRoutes = require('./messaging_handler'); // Роуты для WhatsApp и SMS

// Объединяем все инструменты в один массив для Gemini
const allTools = [
    ...calendarTools,
    ...whatsAppTools,
];

require('dotenv').config();

const app = express();
// Middleware для парсинга данных, отправленных Twilio (включая SpeechResult)
app.use(express.urlencoded({ extended: true }));

// Подключаем роуты для WhatsApp и SMS
app.use('/', messagingRoutes);

// Инициализация Gemini API с ключом из .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ----------------------------------------------------------------------
// МАРШРУТ /voice: Начало звонка и сбор речи пользователя
// ----------------------------------------------------------------------
app.post('/voice', (request, response) => {
    // Приветствие на иврите с использованием SSML
    const initialGreeting = botBehavior.getMessage('initial');
    const voice = botBehavior.voiceSettings.he.ttsVoice;
    const lang = botBehavior.voiceSettings.he.language;
    const sttLang = botBehavior.voiceSettings.sttLanguage;

    // Формируем XML вручную, без тега <speak> для Google голосов
    const twimlXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${initialGreeting}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${botBehavior.voiceSettings.he.sttLanguage}" />
    <Redirect method="POST">/voice</Redirect>
</Response>`;

    response.type('text/xml');
    response.send(twimlXml);
    return;
});

// ----------------------------------------------------------------------
// МАРШРУТ /respond: Обработка распознанной речи и получение ответа от Gemini
// ----------------------------------------------------------------------
app.post('/respond', async (request, response) => {
    const speechResult = request.body.SpeechResult; // Распознанный текст от Twilio

    if (speechResult) {
        try {
            // ОТЛАДКА: Выводим в консоль, что сказал пользователь
            console.log('User said:', speechResult);
            console.time(`⏱️ Total Response Time [${speechResult.substring(0, 15)}...]`);

            const callSid = request.body.CallSid || 'default';
            const clientPhone = request.body.From || 'unknown';
            sessionManager.initSession(callSid);
            sessionManager.setClientPhone(callSid, clientPhone); // Сохраняем номер телефона в сессию

            // ПАРАЛЛЕЛИЗАЦИЯ: Запускаем RAG и CRM одновременно
            console.log('🚀 Запуск параллельных задач (RAG + CRM)...');
            console.time('⏱️ RAG + CRM Task');

            const [context, customerData] = await Promise.all([
                getContextForPrompt(speechResult, 3),
                !sessionManager.getGender(callSid) ? crmService.getCustomerData(clientPhone) : Promise.resolve(null)
            ]);

            console.timeEnd('⏱️ RAG + CRM Task');

            // CRM: Применяем данные о клиенте, если они получены
            if (customerData && customerData.gender) {
                sessionManager.setGender(callSid, customerData.gender);
                console.log(`👤 Данные из CRM для ${clientPhone}: ${customerData.name} (${customerData.gender})`);
            }

            const currentGender = sessionManager.getGender(callSid);
            const currentDate = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });

            // DEBUG: Проверяем, что передаётся в промпт
            console.log('📚 RAG Context length:', context.length, 'chars');
            if (context) {
                console.log('📚 RAG Context preview:', context.substring(0, 200) + '...');
            }

            const systemPrompt = botBehavior.getSystemPrompt(context, currentGender, currentDate);

            // Добавляем текущее сообщение пользователя в историю
            // НО! Мы не добавляем его сразу в массив истории для отправки, так как нам нужна структура для Gemini API
            // История для Gemini API: [ {role: 'user', parts...}, {role: 'model', parts...} ]
            // Мы добавим текущий запрос в конец этого массива при вызове.

            const history = sessionManager.getHistory(callSid);

            // Собираем полный контекст для отправки
            // Вариант А: Использовать systemInstruction (доступно в новых моделях)
            // Вариант Б: Добавить system prompt как первое сообщение user (стабильнее)

            let contentsForGemini = [];

            // Если история пуста, добавляем системный промпт первым
            // Если не пуста, системный промпт лучше обновлять (так как RAG контекст меняется), 
            // поэтому мы можем отправлять его как systemInstruction при инициализации модели,
            // или добавлять в текущий запрос пользователя.
            // ЛУЧШИЙ ВАРИАНТ ЗДЕСЬ: System Instruction в модели.

            const model = genAI.getGenerativeModel({
                model: botBehavior.geminiSettings.model,
                systemInstruction: systemPrompt, // Используем нативный systemInstruction
                tools: [{
                    functionDeclarations: allTools.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters,
                    })),
                }],
            });

            // Формируем contents из истории + текущее сообщение
            contentsForGemini = [...history];
            contentsForGemini.push({ role: 'user', parts: [{ text: speechResult }] });

            console.log('📤 Отправка в Gemini истории длиной:', contentsForGemini.length);
            console.time('⏱️ Gemini API Call');

            // Отправляем промпт с инструментами в Gemini
            const result = await model.generateContent({ contents: contentsForGemini });
            console.timeEnd('⏱️ Gemini API Call');
            const geminiResponse = result.response;

            // Сохраняем запрос пользователя в историю (теперь, когда мы знаем, что ошибки нет)
            sessionManager.addToHistory(callSid, 'user', speechResult);

            // Проверяем, вызвала ли модель функцию
            const functionCalls = geminiResponse.functionCalls();

            if (functionCalls && functionCalls.length > 0) {
                console.log('🔧 Gemini запрашивает вызов функции. Перенаправление на /process_tool...');

                // Сохраняем вызовы функций в сессию, чтобы выполнить их после редиректа
                sessionManager.setPendingFunctionCalls(callSid, functionCalls);

                // Обычный ответ (до поиска инструментов)
                const intermediateText = botBehavior.cleanTextForTTS(botBehavior.getMessage('checking'));
                const langCode = botBehavior.detectLanguage(intermediateText);
                const v_check = botBehavior.voiceSettings[langCode].ttsVoice;
                const l_check = botBehavior.voiceSettings[langCode].language;

                // Формируем XML вручную
                const intermediateXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v_check}">${intermediateText}</Say>
    <Redirect method="POST">/process_tool?CallSid=${callSid}</Redirect>
</Response>`;

                response.type('text/xml');
                response.send(intermediateXml);
                return; // Важно прервать выполнение, чтобы не отправлять ответ дважды

            } else {
                // Обычный ответ (без вызова функций)
                let text = geminiResponse.text();

                // ИЗВЛЕЧЕНИЕ ГЕНДЕРА: Если Gemini прислал тег [GENDER: ...], сохраняем его
                const genderMatch = text.match(/\[GENDER:\s*(male|female)\]/i);
                if (genderMatch) {
                    const detectedGender = genderMatch[1].toLowerCase();
                    sessionManager.setGender(callSid, detectedGender);
                    // Удаляем тег из текста
                    text = text.replace(/\[GENDER:\s*(male|female)\]/i, '').trim();
                }

                // Добавляем ответ модели в историю
                sessionManager.addToHistory(callSid, 'model', text);

                // Проверка на пустой ответ и озвучка
                if (!text || text.trim() === "") {
                    const langCode = 'he'; // Default
                    const v = botBehavior.voiceSettings[langCode].ttsVoice;
                    const sttL = botBehavior.voiceSettings[langCode].sttLanguage;

                    const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${botBehavior.getMessage('emptyResponse')}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${sttL}" />
</Response>`;
                    response.type('text/xml');
                    response.send(finalXml);
                    return;
                } else {
                    const cleanedText = botBehavior.cleanTextForTTS(text);
                    const langCode = botBehavior.detectLanguage(cleanedText);
                    const v = botBehavior.voiceSettings[langCode].ttsVoice;
                    const sttL = botBehavior.voiceSettings[langCode].sttLanguage;

                    // Формируем финальный XML
                    const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${cleanedText}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${sttL}" />
</Response>`;

                    response.type('text/xml');
                    response.send(finalXml);
                    console.timeEnd(`⏱️ Total Response Time [${speechResult.substring(0, 15)}...]`);
                    return;
                }
            }

        } catch (error) {
            console.error('Error with Gemini API:', error);
            const msg = botBehavior.getMessage('apiError');
            const v = botBehavior.voiceSettings.he.ttsVoice;
            const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${msg}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${botBehavior.voiceSettings.he.sttLanguage}" />
</Response>`;
            response.type('text/xml');
            response.send(finalXml);
            return;
        }
    } else {
        const msg = botBehavior.getMessage('noSpeech');
        const v = botBehavior.voiceSettings.he.ttsVoice;
        const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${msg}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${botBehavior.voiceSettings.he.sttLanguage}" />
</Response>`;
        response.type('text/xml');
        response.send(finalXml);
        return;
    }
});

// ----------------------------------------------------------------------
// МАРШРУТ /process_tool: Выполнение функций после сообщения "Я проверяю..."
// ----------------------------------------------------------------------
app.post('/process_tool', async (request, response) => {
    const callSid = request.body.CallSid || request.query.CallSid;

    console.log(`⚙️ Обработка инструментов для callSid: ${callSid}`);

    try {
        // Получаем сохраненные вызовы функций
        const functionCalls = sessionManager.getAndClearPendingFunctionCalls(callSid);

        if (!functionCalls || functionCalls.length === 0) {
            console.error('❌ Нет ожидающих вызовов функций для', callSid);
            const v = botBehavior.voiceSettings.he.ttsVoice;
            const sttL = botBehavior.voiceSettings.he.sttLanguage;
            const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${botBehavior.getMessage('noFunctionCalls')}</Say>
    <Redirect method="POST">/respond</Redirect>
</Response>`;
            response.type('text/xml');
            response.send(finalXml);
            return;
        }

        // Инициализируем модель снова (нам нужно сделать второй вызов)
        // Для этого нужно восстановить System Instruction
        const context = await getContextForPrompt('', 3); // Контекст может быть не актуален, но нужен для промпта
        const currentGender = sessionManager.getGender(callSid);

        const currentDateFix = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });
        const model = genAI.getGenerativeModel({
            model: botBehavior.geminiSettings.model,
            systemInstruction: botBehavior.getSystemPrompt(context, currentGender, currentDateFix),
            tools: [{
                functionDeclarations: allTools.map(tool => ({
                    name: tool.name, description: tool.description, parameters: tool.parameters,
                })),
            }],
        });

        // Получаем номер телефона из сессии
        const clientPhone = sessionManager.getClientPhone(callSid);

        // Обрабатываем каждый вызов функции (обычно один)
        for (const functionCall of functionCalls) {
            console.log('🔧 Выполнение функции:', functionCall.name);
            
            let functionResult;
            
            // Проверяем, является ли инструмент инструментом WhatsApp
            if (whatsAppTools.some(tool => tool.name === functionCall.name)) {
                functionResult = await handleWhatsAppCall(functionCall.name, functionCall.args, clientPhone);
            } else {
                // В противном случае, предполагаем, что это инструмент календаря
                functionResult = await handleFunctionCall(functionCall.name, functionCall.args);
            }

            console.log('✅ Результат:', functionResult);

            // Добавляем в историю
            sessionManager.addFunctionInteractionToHistory(callSid, functionCall, functionResult);

            // SPECIAL LOGIC FOR TRANSFER
            if (functionCall.name === 'transfer_to_support') {
                console.log('📞 Initiating call transfer to operator...');

                const v = botBehavior.voiceSettings.he.ttsVoice;
                const transferXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${botBehavior.getMessage('transferring')}</Say>
    <Dial timeout="${botBehavior.operatorSettings.timeout}" action="${botBehavior.operatorSettings.callbackUrl}">${botBehavior.operatorSettings.phoneNumber}</Dial>
</Response>`;

                response.type('text/xml');
                response.send(transferXml);
                return; // STOP EXECUTION HERE
            }
        }


        // Отправляем обновленную историю обратно в Gemini
        const history = sessionManager.getHistory(callSid);
        const result = await model.generateContent({ contents: history });
        let text = result.response.text();

        // ИЗВЛЕЧЕНИЕ ГЕНДЕРА (на всякий случай, если он определился после вызова инструмента)
        const genderMatch = text.match(/\[GENDER:\s*(male|female)\]/i);
        if (genderMatch) {
            const detectedGender = genderMatch[1].toLowerCase();
            sessionManager.setGender(callSid, detectedGender);
            text = text.replace(/\[GENDER:\s*(male|female)\]/i, '').trim();
        }

        // Сохраняем и озвучиваем ответ
        sessionManager.addToHistory(callSid, 'model', text);
        console.log('Gemini post-tool response:', text);

        const cleanedText = botBehavior.cleanTextForTTS(text);
        const langCode = botBehavior.detectLanguage(cleanedText);
        const v_post = botBehavior.voiceSettings[langCode].ttsVoice;
        const sttL = botBehavior.voiceSettings[langCode].sttLanguage;

        const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v_post}">${cleanedText}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${sttL}" />
</Response>`;

        response.type('text/xml');
        response.send(finalXml);
        return;

    } catch (error) {
        console.error('Error in /process_tool:', error);
        const v = botBehavior.voiceSettings.he.ttsVoice;
        const msg = 'אירעה שגיאה בעיבוד הבקשה';
        const sttL = botBehavior.voiceSettings.sttLanguage;

        const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${v}">${msg}</Say>
    <Gather input="speech" action="/respond" speechTimeout="auto" language="${botBehavior.voiceSettings.he.sttLanguage}" />
</Response>`;
        response.type('text/xml');
        response.send(errorXml);
        return;
    }
});

// ----------------------------------------------------------------------
// МАРШРУТ /handle-dial-status: Обработка статуса звонка после попытки перевода
// ----------------------------------------------------------------------
app.post('/handle-dial-status', (request, response) => {
    const twiml = new VoiceResponse();
    const dialStatus = request.body.DialCallStatus;

    console.log(`📞 Dial Status: ${dialStatus}`);

    if (dialStatus === 'busy' || dialStatus === 'no-answer' || dialStatus === 'failed') {
        // Оператор не ответил или занят
        twiml.say(
            { voice: 'Google.he-IL-Standard-A', language: 'he-IL' },
            'מצטער, הנציג אינו זמין כרגע. איך אוכל לעזור לך בנושא אחר?' // Sorry, the representative is not available right now. How else can I help you?
        );

        // Возвращаемся к сбору речи (возврат к боту)
        twiml.gather({
            input: 'speech',
            action: '/respond',
            speechTimeout: 'auto',
            language: 'iw-IL',
        });
    } else {
        // Звонок был успешным (completed) или другой статус
        // Просто завершаем, так как разговор с оператором состоялся
        twiml.hangup();
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// ЗАПУСК СЕРВЕРА
// ----------------------------------------------------------------------
const https = require('https');
const selfsigned = require('selfsigned');

// Генерируем самоподписанный сертификат
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048 });

const credentials = { key: pems.private, cert: pems.cert };

// Создаем HTTPS сервер
const server = https.createServer(credentials, app);

server.listen(1337, () => {
    console.log('TwiML HTTPS server running at https://127.0.0.1:1337/');
    // Дополнительная проверка статуса ключа
    console.log('API Key Status: ' + (process.env.GEMINI_API_KEY ? 'Loaded and Ready' : 'ERROR: API Key Missing'));
});

//change twilio https - https://api.leadertechnology.shop/voice 
//node answer_phone.js
//split terminal and -
//pm2 start ecosystem.config.js
// stop tunel cloudflare - pm2 delete all
//pm2 restart all
