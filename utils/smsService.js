const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_NUMBER; 

let client = null;
if (accountSid && authToken && fromNumber) {
    client = twilio(accountSid, authToken);
}

/**
 * Отправка SMS сообщения
 */
async function sendSms(to, body) {
    if (!client) {
        console.error('❌ [SMS] Клиент не настроен.');
        return false;
    }

    try {
        console.log(`📨 [SMS] Отправка на ${to}...`);
        await client.messages.create({
            body: body,
            from: fromNumber,
            to: to
        });
        console.log('✅ [SMS] Успешно отправлено.');
        return true;
    } catch (error) {
        console.error('❌ [SMS] Ошибка отправки:', error.message);
        return false;
    }
}

module.exports = { sendSms };