const path = require('path');
const dotenv = require('dotenv');

//Запусти тест (когда календарь пустой,
// Результат: Бот должен показать список: 08:00, 09:00, 10:00, 11:00.
// Создай событие Запусти тест снова:
// Результат: Бот должен показать список, но без 10:00 и 11:00.
//Будет: 08:00,------- 12:00, 13:00

// 1. Настройка окружения
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, '..', `.env.${nodeEnv}`);

console.log(`🔧 Загрузка настроек из: ${envPath}`);
if (require('fs').existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

// 2. Импорт инструментов
const { handleFunctionCall } = require('../calendar/calendarTools');

// НАСТРОЙКИ ТЕСТА
const TEST_DATE = "24.02.2026"; // Выбери дату в будущем
//const YACHT_NAME = "Joy-BE";    // Название яхты
const YACHT_NAME = "Bagira";    // Название яхты

const DURATION = 2;             // Длительность в часах

async function runCalendarTest() {
    console.log(`\n📅 ЗАПУСК ТЕСТА КАЛЕНДАРЯ`);
    console.log(`🔎 Проверяем: ${YACHT_NAME} на ${TEST_DATE} (${DURATION} часа)\n`);

    try {
        // Эмулируем вызов от бота
        const args = {
            date: TEST_DATE,
            duration: DURATION,
            yachtName: YACHT_NAME
        };

        const result = await handleFunctionCall('check_yacht_availability', args);

        console.log("---------------------------------------------------");
        console.log("🤖 ОТВЕТ СИСТЕМЫ:");
        
        // Выводим результат (это то, что скажет бот или передаст в LLM)
        if (result.result) {
            console.log(result.result);
        } else {
            console.log(result);
        }
        console.log("---------------------------------------------------");

        console.log("\n🕵️ КАК ПРОВЕРИТЬ:");
        console.log("1. Посмотрите список выше.");
        console.log("2. Откройте Google Calendar на " + TEST_DATE);
        console.log("3. Создайте событие 'Joy-BE Test' (например, в 10:00).");
        console.log("4. Запустите этот тест снова.");
        console.log("   -> Если 10:00 пропадет из списка, значит БОТ ВИДИТ ЗАНЯТОСТЬ.");

    } catch (error) {
        console.error("\n❌ КРИТИЧЕСКАЯ ОШИБКА:", error);
    }
}

runCalendarTest();

//node tests/test_calendar_real.js 
