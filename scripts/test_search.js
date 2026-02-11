const { retrieveContext } = require('../rag/retriever');
const path = require('path');
const dotenv = require('dotenv');

// Load Env
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.join(__dirname, '..', `.env.${nodeEnv}`);
if (require('fs').existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function test() {
    // Тест 1: Ищем Joy (на английском)
    console.log('\n--- TEST 1: "Joy" ---');
    await retrieveContext("Joy", 3, "Yachts");

    // Тест 2: Ищем ג'וי (на иврите)
    console.log('\n--- TEST 2: "ג\'וי" ---');
    await retrieveContext("ג'וי", 3, "Yachts");

    // Тест 3: Полная фраза
    console.log('\n--- TEST 3: "אני רוצה להזמין יאכטה ג\'וי" ---');
    await retrieveContext("אני רוצה להזמין יאכטה ג'וי", 3, "Yachts");
}

test();