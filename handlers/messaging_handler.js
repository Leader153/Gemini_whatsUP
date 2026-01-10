const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const conversationEngine = require('../utils/conversationEngine');
const messageFormatter = require('../utils/messageFormatter');

const router = express.Router();

// ----------------------------------------------------------------------
// МАРШРУТ /whatsapp: Обработка входящих WhatsApp сообщений
// ----------------------------------------------------------------------
router.post('/whatsapp', async (request, response) => {
    const incomingMessage = request.body.Body; // Текст сообщения
    const fromNumber = request.body.From; // Номер отправителя (формат: whatsapp:+972533403449)
    const messageSid = request.body.MessageSid; // ID сообщения

    console.log('📱 WhatsApp сообщение от:', fromNumber);
    console.log('📝 Текст:', incomingMessage);

    // Используем номер отправителя как sessionId для WhatsApp
    const sessionId = fromNumber; // Уже в формате whatsapp:+972...
    const userPhone = fromNumber.replace('whatsapp:', ''); // Чистый номер для CRM

    try {
        // Если это первое сообщение, отправляем приветствие
        // (можно проверить по истории сессии, но для простоты отправим всегда)

        // Обрабатываем сообщение через общий движок
        const result = await conversationEngine.processMessage(
            incomingMessage,
            sessionId,
            'whatsapp',
            userPhone
        );

        // Формируем ответ через Twilio Messaging Response
        const twiml = new MessagingResponse();

        if (result.text) {
            twiml.message(result.text);
        } else {
            // Если текста нет, отправляем сообщение об ошибке
            twiml.message(messageFormatter.getMessage('apiError', 'whatsapp'));
        }

        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('❌ Ошибка обработки WhatsApp сообщения:', error);

        const twiml = new MessagingResponse();
        twiml.message(messageFormatter.getMessage('apiError', 'whatsapp'));

        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// ----------------------------------------------------------------------
// МАРШРУТ /sms: Обработка входящих SMS сообщений
// ----------------------------------------------------------------------
router.post('/sms', async (request, response) => {
    const incomingMessage = request.body.Body; // Текст сообщения
    const fromNumber = request.body.From; // Номер отправителя (формат: +972533403449)
    const messageSid = request.body.MessageSid; // ID сообщения

    console.log('📲 SMS сообщение от:', fromNumber);
    console.log('📝 Текст:', incomingMessage);

    // Используем номер отправителя как sessionId для SMS
    const sessionId = `sms:${fromNumber}`; // Добавляем префикс для различения от WhatsApp
    const userPhone = fromNumber; // Чистый номер для CRM

    try {
        // Обрабатываем сообщение через общий движок
        const result = await conversationEngine.processMessage(
            incomingMessage,
            sessionId,
            'sms',
            userPhone
        );

        // Формируем ответ через Twilio Messaging Response
        const twiml = new MessagingResponse();

        if (result.text) {
            twiml.message(result.text);
        } else {
            // Если текста нет, отправляем сообщение об ошибке
            twiml.message(messageFormatter.getMessage('apiError', 'sms'));
        }

        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('❌ Ошибка обработки SMS сообщения:', error);

        const twiml = new MessagingResponse();
        twiml.message(messageFormatter.getMessage('apiError', 'sms'));

        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// ----------------------------------------------------------------------
// МАРШРУТ /whatsapp/status: Обработка статусов доставки WhatsApp (опционально)
// ----------------------------------------------------------------------
router.post('/whatsapp/status', (request, response) => {
    const messageStatus = request.body.MessageStatus;
    const messageSid = request.body.MessageSid;

    console.log(`📊 WhatsApp статус для ${messageSid}: ${messageStatus}`);

    // Просто логируем статус, не отправляем ответ
    response.status(200).send('OK');
});

// ----------------------------------------------------------------------
// МАРШРУТ /sms/status: Обработка статусов доставки SMS (опционально)
// ----------------------------------------------------------------------
router.post('/sms/status', (request, response) => {
    const messageStatus = request.body.MessageStatus;
    const messageSid = request.body.MessageSid;

    console.log(`📊 SMS статус для ${messageSid}: ${messageStatus}`);

    // Просто логируем статус, не отправляем ответ
    response.status(200).send('OK');
});

module.exports = router;
