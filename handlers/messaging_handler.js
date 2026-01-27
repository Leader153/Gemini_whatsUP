const express = require('express');
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const conversationEngine = require('../utils/conversationEngine');
const messageFormatter = require('../utils/messageFormatter');

const router = express.Router();

// ----------------------------------------------------------------------
// МАРШРУТ /whatsapp: Обработка входящих WhatsApp сообщений
// ----------------------------------------------------------------------
router.post('/whatsapp', async (request, response) => {
    const incomingMessage = request.body.Body; // Текст сообщения
    const fromNumber = request.body.From;
    const messageSid = request.body.MessageSid;

    // --- ЗАЩИТА ОТ ПУСТЫХ СООБЩЕНИЙ ---
    // Если пришел статус доставки или медиа без подписи, Body может быть undefined
    if (!incomingMessage) {
        console.log(`⚠️ [WHATSAPP] Получено техническое сообщение или медиа без текста (игнорируем). SID: ${messageSid}`);
        // Отправляем пустой TwiML, чтобы Twilio не ругался
        response.type('text/xml');
        return response.send('<Response></Response>');
    }

    console.log('📱 WhatsApp сообщение от:', fromNumber);
    console.log('📝 Текст:', incomingMessage);

    const sessionId = fromNumber;
    const userPhone = fromNumber.replace('whatsapp:', '');

    try {
        const result = await conversationEngine.processMessage(
            incomingMessage,
            sessionId,
            'whatsapp',
            userPhone
        );

        const twiml = new MessagingResponse();

        if (result.text) {
            twiml.message(result.text);
        }

        // Если result.text пустой (например, сработал инструмент и ответ не нужен),
        // мы просто ничего не отправляем в ответ.

        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('❌ Ошибка обработки WhatsApp:', error);
        // В случае ошибки лучше ничего не отвечать клиенту, или ответить, если это критично
        const twiml = new MessagingResponse();
        // twiml.message(messageFormatter.getMessage('apiError', 'whatsapp')); // Можно раскомментировать для отладки
        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// ----------------------------------------------------------------------
// МАРШРУТ /sms: Обработка входящих SMS сообщений
// ----------------------------------------------------------------------
router.post('/sms', async (request, response) => {
    const incomingMessage = request.body.Body;
    const fromNumber = request.body.From;

    // --- ЗАЩИТА ОТ ПУСТЫХ СООБЩЕНИЙ ---
    if (!incomingMessage) {
        return response.status(200).send('<Response></Response>');
    }

    console.log('📲 SMS сообщение от:', fromNumber);

    const sessionId = `sms:${fromNumber}`;
    const userPhone = fromNumber;

    try {
        const result = await conversationEngine.processMessage(
            incomingMessage,
            sessionId,
            'sms',
            userPhone
        );

        const twiml = new MessagingResponse();
        if (result.text) {
            twiml.message(result.text);
        }

        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('❌ Ошибка обработки SMS:', error);
        const twiml = new MessagingResponse();
        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// ----------------------------------------------------------------------
// СТАТУСЫ (Оставляем как есть, они работают корректно)
// ----------------------------------------------------------------------
router.post('/whatsapp/status', (req, res) => {
    // console.log(`📊 WhatsApp статус: ${req.body.MessageStatus}`); 
    // Закомментировал лог, чтобы не засорять консоль
    res.sendStatus(200);
});

router.post('/sms/status', (req, res) => {
    res.sendStatus(200);
});

module.exports = router;