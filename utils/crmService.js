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
 * @param {string} [clientData.name] - Имя и фамилия клиента.
 * @param {string} [clientData.phone] - Номер телефона.
 * @param {string} [clientData.has_terminal] - Есть ли терминал?
 * @param {string} [clientData.business_type] - Тип бизнеса.
 * @param {string} [clientData.city] - Город.
 */
function saveClientData(clientData) {
    const txtPath = path.join(__dirname, '..', 'data', 'clientData.txt');
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Jerusalem' });

    // Формируем читаемую строку
    let content = `Дата и время: ${now}\n`;
    content += `Имя и фамилия: ${clientData.name || ''}\n`;
    content += `Номер телефона: ${clientData.phone || ''}\n`;
    content += `Есть ли терминал: ${clientData.has_terminal || ''}\n`;
    content += `Тип бизнеса: ${clientData.business_type || ''}\n`;
    content += `Город: ${clientData.city || ''}\n`;
    content += `Месячный оборот: ${clientData.monthly_turnover || ''}\n`;
    content += `Текущий провайдер: ${clientData.current_provider || ''}\n`;
    content += `Кол-во касс: ${clientData.points_count || ''}\n`;
    content += `Срочность: ${clientData.urgency || ''}\n`;
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
