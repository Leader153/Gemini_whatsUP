const express = require('express');
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const conversationEngine = require('../utils/conversationEngine');
const { sendWhatsAppMessage } = require('../utils/whatsappService'); // Для пересылки чека

const router = express.Router();
const OWNER_PHONE = '+972533403449'; // Твой номер

// WHATSAPP ВХОД
router.post('/whatsapp', async (request, response) => {
    const incomingMessage = request.body.Body;
    const fromNumber = request.body.From; 
    const numMedia = parseInt(request.body.NumMedia); // Количество файлов

    // --- ЛОГИКА: ПОЛУЧЕНИЕ ЧЕКА (ФОТО) ---
    if (numMedia > 0) {
        console.log(`📸 Получено медиа от клиента ${fromNumber}`);
        const mediaUrl = request.body.MediaUrl0; // Ссылка на первое фото
        const mimeType = request.body.MediaContentType0; // Тип файла

        // Пересылаем тебе на WhatsApp
        const forwardMsg = `📸 *קבלה/קובץ מלקוח!*
מאת: ${fromNumber}
הנה הקובץ: ${mediaUrl}`;
        
        // Наш whatsappService сам превратит ссылку в картинку
        await sendWhatsAppMessage(OWNER_PHONE, forwardMsg);

        // Отвечаем клиенту (авто-ответ)
        const twiml = new MessagingResponse();
        twiml.message("קיבלתי את הקובץ/תמונה, תודה! אני מעבירה לאישור.");
        
        response.type('text/xml');
        return response.send(twiml.toString());
    }

    // --- ОБЫЧНЫЙ ТЕКСТ ---
    if (!incomingMessage) {
        // Игнорируем статусы
        response.type('text/xml');
        return response.send('<Response></Response>');
    }

    console.log('📱 WhatsApp сообщение от:', fromNumber);
    
    // Обработка текста ботом
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
        response.type('text/xml');
        response.send(new MessagingResponse().toString());
    }
});

// SMS ВХОД
router.post('/sms', async (request, response) => {
    const incomingMessage = request.body.Body; 
    const fromNumber = request.body.From; 

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

// СТАТУСЫ
router.post('/whatsapp/status', (req, res) => res.sendStatus(200));
router.post('/sms/status', (req, res) => res.sendStatus(200));

module.exports = router;