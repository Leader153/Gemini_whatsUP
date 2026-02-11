const express = require('express');
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const conversationEngine = require('../utils/conversationEngine');
const { sendWhatsAppMessage } = require('../utils/whatsappService');

const router = express.Router();
const OWNER_PHONE = '+972533403449'; 

// Кэш обработанных сообщений (чтобы не отвечать дважды)
const processedMessages = new Set();

// Очистка кэша каждые 10 минут
setInterval(() => processedMessages.clear(), 600000);

router.post('/whatsapp', async (request, response) => {
    const incomingMessage = request.body.Body;
    const fromNumber = request.body.From; 
    const messageSid = request.body.MessageSid;
    const numMedia = parseInt(request.body.NumMedia);

    // 1. ЗАЩИТА ОТ ДУБЛЕЙ
    if (processedMessages.has(messageSid)) {
        console.warn(`⚠️ [WHATSAPP] Дубликат сообщения ${messageSid}. Игнорируем.`);
        response.type('text/xml');
        return response.send('<Response></Response>');
    }
    processedMessages.add(messageSid);

    // 2. ФОТО/ФАЙЛЫ (Чек)
    if (numMedia > 0) {
        console.log(`📸 Получено медиа от клиента ${fromNumber}`);
        const mediaUrl = request.body.MediaUrl0;
        
        const forwardMsg = `📸 *קבלה/קובץ מלקוח!*
מאת: ${fromNumber}
הנה הקובץ: ${mediaUrl}`;
        
        await sendWhatsAppMessage(OWNER_PHONE, forwardMsg);

        const twiml = new MessagingResponse();
        twiml.message("קיבלתי את הקובץ, תודה! אני מעבירה לאישור.");
        
        response.type('text/xml');
        return response.send(twiml.toString());
    }

    // 3. ТЕКСТ
    if (!incomingMessage) {
        response.type('text/xml');
        return response.send('<Response></Response>');
    }

    console.log('📱 WhatsApp сообщение от:', fromNumber);
    console.log('📨 Текст:', incomingMessage);
    
    const sessionId = fromNumber;
    const userPhone = fromNumber.replace('whatsapp:', ''); 

    try {
        const result = await conversationEngine.processMessage(
            incomingMessage, sessionId, 'whatsapp', userPhone
        );

        const twiml = new MessagingResponse();
        if (result.text) twiml.message(result.text);

        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('❌ Ошибка:', error);
        // Не отправляем ошибку пользователю, чтобы не спамить
        response.type('text/xml');
        response.send(new MessagingResponse().toString());
    }
});

// SMS ВХОД
router.post('/sms', async (request, response) => {
    const incomingMessage = request.body.Body; 
    const fromNumber = request.body.From; 
    const messageSid = request.body.MessageSid;

    if (processedMessages.has(messageSid)) return response.status(200).send('<Response></Response>');
    processedMessages.add(messageSid);

    if (!incomingMessage) return response.status(200).send('<Response></Response>');

    const sessionId = `sms:${fromNumber}`; 
    try {
        const result = await conversationEngine.processMessage(
            incomingMessage, sessionId, 'sms', fromNumber
        );
        const twiml = new MessagingResponse();
        if (result.text) twiml.message(result.text);
        response.type('text/xml');
        response.send(twiml.toString());
    } catch (error) {
        response.type('text/xml');
        response.send(new MessagingResponse().toString());
    }
});

router.post('/whatsapp/status', (req, res) => res.sendStatus(200));
router.post('/sms/status', (req, res) => res.sendStatus(200));

module.exports = router;