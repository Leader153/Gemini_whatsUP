const twilio = require('twilio');

// Переменные окружения уже загружены в index.js
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_NUMBER; // Ожидается формат +972...

let client = null;

if (accountSid && authToken && fromNumber) {
    client = twilio(accountSid, authToken);
} else {
    console.error('❌ [WHATSAPP] Ошибка: Не найдены учетные данные Twilio в .env');
}

/**
 * Отправляет сообщение WhatsApp
 */
async function sendWhatsAppMessage(toNumber, messageBody) {
    if (!client) {
        console.error('❌ [WHATSAPP] Клиент не инициализирован. Проверьте ключи.');
        return { success: false, error: 'Twilio credentials missing' };
    }

    try {
        // Убираем префикс whatsapp:, если он вдруг передан, чтобы избежать дублей (whatsapp:whatsapp:...)
        const cleanTo = toNumber.replace('whatsapp:', '');
        const cleanFrom = fromNumber.replace('whatsapp:', '');

        console.log(`🚀 [WHATSAPP] Отправка на ${cleanTo}`);
        
        const message = await client.messages.create({
            from: `whatsapp:${cleanFrom}`,
            to: `whatsapp:${cleanTo}`,
            body: messageBody,
        });

        console.log(`✅ [WHATSAPP] Отправлено. SID: ${message.sid}`);
        return { success: true, sid: message.sid };
        
    } catch (error) {
        console.error(`❌ [WHATSAPP] Ошибка отправки:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWhatsAppMessage,
};