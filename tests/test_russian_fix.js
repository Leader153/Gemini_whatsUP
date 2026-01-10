const { GoogleGenerativeAI } = require('@google/generative-ai');
const botBehavior = require('../data/botBehavior');
require('dotenv').config();

async function testRussianFix() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const currentDate = '2025-12-21'; // Simulating today
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: botBehavior.getSystemPrompt('Контекст: Цены на аренду Joy-BE: 890 шек за час.', 'female', currentDate),
    });

    const history = [
        { role: 'user', parts: [{ text: 'אפשר לדבר ברוסית?' }] },
        { role: 'model', parts: [{ text: 'Конечно! Я перешла на русский язык. На какое число вы бы хотели забронировать яхту?' }] },
    ];

    const speechResult = 'восьмого числа';
    const contents = [...history, { role: 'user', parts: [{ text: speechResult }] }];

    console.log('--- Testing Russian Date Recognition ---');
    console.log('User said:', speechResult);

    try {
        const result = await model.generateContent({ contents });
        const response = result.response;
        console.log('Gemini Response Text:', response.text());

        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            console.log('Gemini Function Calls:', JSON.stringify(functionCalls, null, 2));

            // Check if it correctly identified the day
            const checkAvail = functionCalls.find(fc => fc.name === 'check_yacht_availability');
            if (checkAvail) {
                const date = checkAvail.args.date;
                console.log('Extracted Date:', date);
                if (date && date.includes('-08-')) {
                    console.log('❌ FAIL: Still interpreted as August.');
                } else if (date && date.endsWith('-08')) {
                    console.log('✅ PASS: Interpreted as 8th day.');
                } else {
                    console.log('⚠️ UNCERTAIN: Date format:', date);
                }
            }
        } else {
            console.log('No function calls found.');
        }
    } catch (error) {
        console.error('Error during test:', error);
    }
}

testRussianFix();
