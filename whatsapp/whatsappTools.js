const { sendWhatsAppMessage } = require('../utils/messagingService');

/**
 * Определение инструмента для отправки WhatsApp сообщений.
 */
const sendWhatsAppMessageTool = {
    name: 'send_whatsapp_message',
    description: 'Отправляет текстовое сообщение WhatsApp клиенту, с которым идет текущий разговор. Используй, чтобы отправить важную информацию, такую как адрес, детали встречи, ссылки или подтверждения.',
    parameters: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'Текст сообщения, который нужно отправить клиенту. Сообщение должно быть на том же языке, на котором идет разговор.',
            },
        },
        required: ['message'],
    },
};

/**
 * Массив, содержащий все инструменты, связанные с WhatsApp.
 */
const whatsAppTools = [
    sendWhatsAppMessageTool,
];

/**
 * Обрабатывает вызов функции, связанной с WhatsApp.
 * @param {string} toolName - Имя вызываемого инструмента.
 * @param {object} toolParams - Параметры для инструмента.
 * @param {string} clientPhone - Номер телефона клиента для отправки сообщения.
 * @returns {Promise<object>} - Результат выполнения инструмента.
 */
async function handleWhatsAppCall(toolName, toolParams, clientPhone) {
    if (toolName === 'send_whatsapp_message') {
        const { message } = toolParams;
        if (!clientPhone || clientPhone === 'unknown') {
            return { success: false, error: 'Номер телефона клиента неизвестен.' };
        }
        // Убираем префикс, если он есть, но сохраняем +
        const cleanPhone = clientPhone.replace('whatsapp:', '');
        const result = await sendWhatsAppMessage(cleanPhone, message);
        return { success: result.success, message: result.success ? `Сообщение успешно отправлено на номер ${cleanPhone}.` : `Ошибка отправки: ${result.error}` };
    }
    // Возвращаем null если инструмент не найден
    return null;
}

module.exports = {
    whatsAppTools,
    handleWhatsAppCall,
};
