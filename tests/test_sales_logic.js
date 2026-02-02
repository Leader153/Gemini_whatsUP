const conversationEngine = require('../utils/conversationEngine');
const path = require('path');
const dotenv = require('dotenv');

// Настройка
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, '..', `.env.${nodeEnv}`);
if (require('fs').existsSync(envPath)) dotenv.config({ path: envPath });

const SESSION_ID = 'TEST_LOGIC_' + Date.now();
const PHONE = '+972533403449';

async function runChat() {
    console.log("🤖 ТЕСТ ЛОГИКИ ПРОДАЖ (без звонка)\n");

    // СЦЕНАРИЙ
    const inputs = [
        "שלום",                          // 1. Привет
        "אני רוצה להזמין יאכטה",         // 2. Хочу яхту (Тут он должен спросить: СКОЛЬКО ЛЮДЕЙ?)
        "אנחנו 32 אנשים",                // 3. Нас 15 (Тут он должен предложить Dolfin или King, но НЕ Joy/Bagira)
        "חיפה"                         // 4. Герцлия
    ];

    for (const text of inputs) {
        console.log(`\n👤 ВЫ: "${text}"`);
        const response = await conversationEngine.processMessage(text, SESSION_ID, 'voice', PHONE);
        
        // Очищаем ответ от лишних тегов для удобства чтения
        console.log(`🤖 БОТ: "${response.text}"`);
        
        if (response.requiresToolCall) {
            console.log(`   [Инструмент]: ${response.functionCalls[0].name}`);
        }
    }
}

runChat();

//node tests/test_sales_logic.js