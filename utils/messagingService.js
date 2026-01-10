require('dotenv').config();
const twilio = require('twilio');

// Инициализация клиента Twilio с учетными данными из .env
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_NUMBER; // например, +972533883507

if (!accountSid || !authToken || !fromNumber) {
    console.error('❌ Ошибка: Учетные данные Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER) не найдены в .env файле.');
    // В реальном приложении здесь лучше выбросить исключение или завершить процесс
    // throw new Error('Twilio credentials are not configured.');
}

const client = twilio(accountSid, authToken);

/**
 * Отправляет сообщение WhatsApp на указанный номер.
 * @param {string} toNumber - Номер получателя в формате E.164 (например, +972533403449).
 * @param {string} messageBody - Текст сообщения для отправки.
 * @returns {Promise<object>} - Возвращает объект с информацией об отправленном сообщении.
 */
async function sendWhatsAppMessage(toNumber, messageBody) {
    if (!client) {
        console.error('Клиент Twilio не инициализирован. Сообщение не отправлено.');
        throw new Error('Twilio client is not initialized.');
    }

    try {
        console.log(`🚀 Отправка WhatsApp сообщения на номер: ${toNumber}`);
        const message = await client.messages.create({
            from: `whatsapp:${fromNumber}`, // Номер, одобренный Meta
            to: `whatsapp:${toNumber}`, // Формат для WhatsApp
            body: messageBody,
        });

        console.log(`✅ Сообщение успешно отправлено. SID: ${message.sid}`);
        return { success: true, sid: message.sid };
    } catch (error) {
        console.error(`❌ Ошибка при отправке WhatsApp сообщения на номер ${toNumber}:`, error.message);
        // Возвращаем информацию об ошибке, чтобы вызывающий код мог ее обработать
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWhatsAppMessage,
};
