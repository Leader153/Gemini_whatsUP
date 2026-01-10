const { sendOrderEmail } = require('../utils/emailService');
require('dotenv').config();

async function test() {
    console.log('🧪 Тестирование отправки Email...');
    const testOrder = {
        clientName: 'Тестовый Клиент (Джимми Флэш)',
        clientPhone: '055-123-4567',
        date: '2025-12-25',
        time: '14:00',
        duration: '3'
    };

    const success = await sendOrderEmail(testOrder);
    if (success) {
        console.log('✅ Тест пройден! Проверь почту:', process.env.EMAIL_TO);
    } else {
        console.log('❌ Тест провален. Проверь логи и настройки в .env');
    }
}

test();
