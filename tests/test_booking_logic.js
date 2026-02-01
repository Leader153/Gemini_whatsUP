const path = require('path');
const dotenv = require('dotenv');

// 1. Настройка окружения (загружаем ключи)
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, '..', `.env.${nodeEnv}`);

console.log(`🔧 Загрузка настроек из: ${envPath}`);
if (require('fs').existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

// 2. Импортируем нашу функцию инструментов
const { handleFunctionCall } = require('../calendar/calendarTools');

// 3. Данные для теста (Имитируем данные от Gemini)
// ОБРАТИ ВНИМАНИЕ: Дата специально написана в "неправильном" формате (через точки),
// чтобы проверить, исправит ли её наш код.
const TEST_ARGS = {
    clientName: "Test Robot (Delete Me)",
    clientPhone: "+972533403449", // Твой номер, чтобы ты увидел WhatsApp
    date: "15.02.2026",            // <--- ТЕСТ: Европейский формат даты
    startTime: "10:00",
    duration: 3,                   // 3 часа (чтобы проверить бонусы)
    yachtName: "Joy-BE Test",
    totalPrice: 1850,
    locationDesc: "Marina Herzliya Test",
    locationLink: "https://waze.com/ul/test"
};

async function runTest() {
    console.log("\n🚀 ЗАПУСК ТЕСТА БРОНИРОВАНИЯ (БЕЗ ЗВОНКА)...\n");
    console.log("📥 Входные данные:", TEST_ARGS);

    try {
        // Вызываем функцию напрямую, как это сделал бы бот
        const result = await handleFunctionCall('send_booking_confirmation', TEST_ARGS);

        console.log("\n✅ РЕЗУЛЬТАТ ВЫПОЛНЕНИЯ:");
        console.log(result);

        if (result && result.result && result.result.includes("הזמנה בוצעה")) {
            console.log("\n🏆 ТЕСТ ПРОЙДЕН УСПЕШНО!");
            console.log("1. Проверь свой WhatsApp (должны прийти сообщения).");
            console.log("2. Проверь Google Calendar на 15.02.2026 (событие должно быть там).");
        } else {
            console.log("\n⚠️ ЧТО-ТО ПОШЛО НЕ ТАК. Проверь логи выше.");
        }

    } catch (error) {
        console.error("\n❌ КРИТИЧЕСКАЯ ОШИБКА ТЕСТА:");
        console.error(error);
    }
}

runTest();
//тест, который напрямую вызывает функцию бронирования с "проблемной" датой (в формате DD.MM.YYYY),
//  чтобы убедиться, что конвертер работает и Google Calendar не выдает ошибку.

//node tests/test_booking_logic.js
