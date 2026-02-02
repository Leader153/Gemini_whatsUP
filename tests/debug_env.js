const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
// ПРОВЕРКА КЛЮЧА В .ENV ФАЙЛЕ
// Путь к файлу
const envPath = path.resolve(__dirname, '..', '.env.development');
console.log('📂 Путь к файлу:', envPath);

// 1. Проверка существования
if (!fs.existsSync(envPath)) {
    console.error('❌ ОШИБКА: Файл физически не найден!');
    process.exit(1);
}
console.log('✅ Файл найден.');

// 2. Проверка кодировки и сырого текста
const rawBuffer = fs.readFileSync(envPath);
console.log('📊 Размер файла (байт):', rawBuffer.length);
console.log('👀 Первые 20 байт (Hex):', rawBuffer.subarray(0, 20).toString('hex'));

// 3. Попытка парсинга через dotenv
const config = dotenv.config({ path: envPath });

if (config.error) {
    console.error('❌ Ошибка парсинга dotenv:', config.error);
} else {
    console.log('\n📋 --- СПИСОК НАЙДЕННЫХ КЛЮЧЕЙ ---');
    console.log(Object.keys(config.parsed));
    
    console.log('\n🔍 --- ПРОВЕРКА КЛЮЧА ---');
    const key = config.parsed.GEMINI_API_KEY;
    if (key) {
        console.log(`✅ GEMINI_API_KEY найден!`);
        console.log(`   Длина: ${key.length}`);
        console.log(`   Первые 5 символов: ${key.substring(0, 5)}...`);
    } else {
        console.error(`❌ GEMINI_API_KEY отсутствует в объекте!`);
        // Выведем первую строку файла текстом, вдруг там мусор
        const rawText = fs.readFileSync(envPath, 'utf8');
        console.log('   Первая строка файла:', rawText.split('\n')[0]);
    }
}


//node tests/debug_env.js