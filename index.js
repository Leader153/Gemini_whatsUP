const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// --- 1. ЗАГРУЗКА КОНФИГУРАЦИИ ---
// Определяем режим (development по умолчанию, если не задано PM2)
const nodeEnv = process.env.NODE_ENV || 'development';
console.log(`[INIT] Запуск в режиме: "${nodeEnv}"`);

// Формируем путь к .env файлу (например, .env.development)
const envFileName = `.env.${nodeEnv}`;
const envFilePath = path.resolve(__dirname, envFileName);

if (fs.existsSync(envFilePath)) {
    console.log(`[INIT] Загрузка настроек из файла: ${envFileName}`);
    // override: true гарантирует, что файл перепишет системные переменные, если они конфликтуют
    dotenv.config({ path: envFilePath, override: true });
} else {
    console.warn(`[INIT] ⚠️ Файл ${envFileName} не найден! Пробуем искать стандартный .env`);
    dotenv.config({ override: true });
}

// Проверка критических переменных перед стартом
console.log(`[INIT] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Установлен' : '❌ ОТСУТСТВУЕТ'}`);
console.log(`[INIT] CHROMA_URL: ${process.env.CHROMA_SERVER_URL || 'Не задан (будет local)'}`);
console.log(`[INIT] DOMAIN_NAME: ${process.env.DOMAIN_NAME || 'Не задан'}`);

// --- 2. ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК ---
// Чтобы бот не падал "молча", а записывал ошибку в файл
const ERROR_LOG = path.join(__dirname, 'error_log.txt');

process.on('uncaughtException', (error) => {
    const timestamp = new Date().toISOString();
    const msg = `\n[${timestamp}] CRITICAL (Uncaught): ${error.message}\nStack: ${error.stack}\n`;
    console.error(msg);
    try { fs.appendFileSync(ERROR_LOG, msg); } catch(e) {}
    process.exit(1); // PM2 перезапустит процесс
});

process.on('unhandledRejection', (reason, promise) => {
    const timestamp = new Date().toISOString();
    const msg = `\n[${timestamp}] CRITICAL (Unhandled Rejection): ${reason}\n`;
    console.error(msg);
    try { fs.appendFileSync(ERROR_LOG, msg); } catch(e) {}
});

// --- 3. ЗАПУСК ОСНОВНОГО ПРИЛОЖЕНИЯ ---
console.log('[INIT] Запуск обработчиков звонков...');
require('./handlers/answer_phone.js');