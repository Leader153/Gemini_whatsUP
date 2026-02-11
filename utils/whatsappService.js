const twilio = require('twilio');

// Переменные окружения уже загружены в index.js
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_NUMBER; 

let client = null;

if (accountSid && authToken && fromNumber) {
    client = twilio(accountSid, authToken);
} else {
    console.error('❌ [WHATSAPP] Ошибка: Не найдены учетные данные Twilio в .env');
}

/**
 * Отправляет сообщение WhatsApp (Текст или Медиа)
 */
async function sendWhatsAppMessage(toNumber, messageBody) {
    if (!client) {
        console.error('❌ [WHATSAPP] Клиент не инициализирован.');
        return { success: false, error: 'Twilio credentials missing' };
    }

    try {
        // Убираем префикс whatsapp: для чистоты
        const cleanTo = toNumber.replace('whatsapp:', '');
        const cleanFrom = fromNumber.replace('whatsapp:', '');

        // --- УМНАЯ ПРОВЕРКА НА МЕДИА ---
        let mediaUrl = undefined;
        let bodyText = messageBody;

        // Ищем ссылки в тексте
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const foundUrls = messageBody.match(urlRegex);

        if (foundUrls) {
            // Проверяем, есть ли среди ссылок фото или видео
            const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.pdf'];
            
            const foundMediaLink = foundUrls.find(url => 
                mediaExtensions.some(ext => url.toLowerCase().endsWith(ext))
            );

            if (foundMediaLink) {
                console.log(`📸 [WHATSAPP] Обнаружено медиа: ${foundMediaLink}`);
                // Twilio требует массив для mediaUrl
                mediaUrl = [foundMediaLink];
                
                // Опционально: Убираем саму ссылку из текста, чтобы не дублировать
                bodyText = messageBody.replace(foundMediaLink, '').trim();
            }
        }

        // Формируем параметры запроса
        const messageOptions = {
            from: `whatsapp:${cleanFrom}`,
            to: `whatsapp:${cleanTo}`,
            body: bodyText
        };

        // Если нашли медиа - добавляем его
        if (mediaUrl) {
            messageOptions.mediaUrl = mediaUrl;
        }

        console.log(`🚀 [WHATSAPP] Отправка на ${cleanTo}...`);
        
        const message = await client.messages.create(messageOptions);

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