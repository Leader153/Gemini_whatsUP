const fs = require('fs');
const path = require('path');

// 1. Путь, который мы ожидаем (от корня проекта)
const relativePath = './calendar/service-account-key.json';

// 2. Абсолютный путь (как его видит сервер)
const absolutePath = path.resolve(__dirname, '..', 'calendar', 'service-account-key.json');

console.log('🔍 ПРОВЕРКА КЛЮЧА GOOGLE...');
console.log(`📁 Ожидаемый путь: ${absolutePath}`);

try {
    if (fs.existsSync(absolutePath)) {
        console.log('✅ Файл найден!');
        
        // Попробуем прочитать (проверка прав доступа)
        const fileContent = fs.readFileSync(absolutePath, 'utf-8');
        const json = JSON.parse(fileContent);
        
        if (json.project_id) {
            console.log(`✅ Файл читается корректно.`);
            console.log(`🆔 Project ID: ${json.project_id}`);
            console.log(`📧 Client Email: ${json.client_email}`);
        } else {
            console.warn('⚠️ Файл есть, но это не правильный JSON ключа (нет project_id).');
        }
    } else {
        console.error('❌ ФАЙЛ НЕ НАЙДЕН!');
        console.error('   Убедитесь, что вы загрузили "service-account-key.json" в папку "calendar".');
    }
} catch (error) {
    console.error('❌ Ошибка при чтении файла:', error.message);
}

//node tests/test_key.js