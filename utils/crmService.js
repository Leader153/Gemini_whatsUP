const fs = require('fs');
const path = require('path');

/**
 * Имитация сервиса CRM для получения данных о клиентах.
 */

// База "известных" клиентов
const mockDatabase = {
    '449': {
        name: 'Daniel',
        gender: 'male'
    },
    '000': {
        name: 'Maria',
        gender: 'female'
    }
};

/**
 * Получает данные клиента по номеру телефона.
 * @param {string} phone - Номер телефона звонящего
 * @returns {Object|null} - Данные клиента или null, если не найден
 */
function getCustomerData(phone) {
    if (!phone) return null;

    // Ищем соответствие по последним цифрам (для простоты теста)
    for (const suffix in mockDatabase) {
        if (phone.endsWith(suffix)) {
            console.log(`🔍 CRM: Найден клиент ${mockDatabase[suffix].name} по суффиксу ${suffix}`);
            return mockDatabase[suffix];
        }
    }

    return null;
}

/**
 * Сохраняет данные клиента в текстовый файл.
 * @param {object} clientData - Данные клиента.
 * @param {string} [clientData.product_type] - Тип продукта (яхты/терминалы/кассы/FAQ).
 * @param {string} [clientData.participants_count] - Количество участников (для яхт).
 * @param {string} [clientData.hours_count] - Количество часов аренды (для яхт).
 * @param {string} [clientData.date] - Дата бронирования (для яхт/встреч).
 * @param {string} [clientData.has_terminal] - Есть ли терминал? (для терминалов/касс).
 * @param {string} [clientData.business_type] - Тип бизнеса (для терминалов/касс).
 * @param {string} [clientData.current_provider] - Текущий провайдер (для терминалов/касс).
 * @param {string} [clientData.points_count] - Кол-во касс (для терминалов/касс).
 * @param {string} [clientData.urgency] - Срочность (для терминалов/касс).
 * @param {string} [clientData.city] - Город (универсально).
 * @param {string} [clientData.name] - Имя и фамилия клиента.
 * @param {string} [clientData.phone] - Номер телефона.
 */
function saveClientData(clientData) {
    const txtPath = path.join(__dirname, '..', 'data', 'clientData.txt');
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });

    // Формируем читаемую строку (только заполненные поля)
    let content = `Дата и время: ${now}\n`;
    content += `Тип продукта: ${clientData.product_type || ''}\n`;

    // Поля для яхт
    if (clientData.participants_count) content += `Количество участников: ${clientData.participants_count}\n`;
    if (clientData.hours_count) content += `Количество часов: ${clientData.hours_count}\n`;
    if (clientData.date) content += `Дата бронирования: ${clientData.date}\n`;

    // Поля для терминалов/касс
    if (clientData.has_terminal) content += `Есть ли терминал: ${clientData.has_terminal}\n`;
    if (clientData.business_type) content += `Тип бизнеса: ${clientData.business_type}\n`;
    if (clientData.current_provider) content += `Текущий провайдер: ${clientData.current_provider}\n`;
    if (clientData.points_count) content += `Кол-во касс: ${clientData.points_count}\n`;
    if (clientData.urgency) content += `Срочность: ${clientData.urgency}\n`;

    // Универсальные поля
    if (clientData.city) content += `Город: ${clientData.city}\n`;
    if (clientData.name) content += `Имя и фамилия: ${clientData.name}\n`;
    if (clientData.phone) content += `Номер телефона: ${clientData.phone}\n`;

    content += '----------------------------------------\n';

    try {
        fs.appendFileSync(txtPath, content, 'utf-8');
        console.log(`✅ CRM: Данные клиента сохранены в ${txtPath}`);
        return { status: "success", message: "Данные клиента успешно сохранены." };
    } catch (error) {
        console.error(`❌ CRM: Ошибка сохранения данных клиента:`, error);
        return { status: "error", message: "Ошибка при сохранении данных клиента." };
    }
}


module.exports = {
    getCustomerData,
    saveClientData
};
