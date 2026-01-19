require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Глобальный обработчик ошибок для предотвращения падения процесса
process.on('uncaughtException', (error) => {
    const errorLogPath = path.join(__dirname, 'error_log.txt');
    const timestamp = new Date().toISOString();
    const logMessage = `\n[${timestamp}] CRITICAL_ERROR (Uncaught Exception): ${error.message}\nStack: ${error.stack}\n`;

    console.error(logMessage);
    fs.appendFileSync(errorLogPath, logMessage);
    // В продакшене лучше перезапускать процесс, но для отладки оставим его "живым" если возможно, 
    // или PM2 перезапустит его. 
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const errorLogPath = path.join(__dirname, 'error_log.txt');
    const timestamp = new Date().toISOString();
    const logMessage = `\n[${timestamp}] CRITICAL_ERROR (Unhandled Rejection): ${reason}\n`;

    console.error(logMessage);
    fs.appendFileSync(errorLogPath, logMessage);
    // Не выходим, но логируем
});

require('./handlers/answer_phone.js');
