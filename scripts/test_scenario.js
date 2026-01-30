const http = require('http');
const querystring = require('querystring');

// Настройки
const PORT = 1337; 
const CALL_SID = 'TEST_CALL_' + Date.now(); // Уникальный ID звонка
const PHONE = '+972533403449';

// Сценарий диалога (Ваши реплики)
const SCENARIO = [
    "שלום, אני רוצה להזמין יאכטה",                  // 1. Привет, хочу яхту
    "הרצליה, ל-10 אנשים",                           // 2. Герцлия, 10 человек
    "לתאריך 13 בפברואר בשעה 14:00",                 // 3. Дата и время
    "תשלחי לי תמונה בוואטסאפ",                      // 4. Тест фото
    "אני רוצה להזמין",                              // 5. Хочу заказать
    "קוראים לי דניאל",                              // 6. Имя (Триггер финала)
    "מאשר"                                          // 7. Подтверждаю (если бот спросит)
];

// Функция отправки запроса
function sendRequest(path, data) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify(data);
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Эмуляция ожидания (пока бот думает)
async function pollCheckAi() {
    let attempts = 0;
    while (attempts < 20) { // Ждем максимум 20 секунд
        await new Promise(r => setTimeout(r, 1000)); // Пауза 1 сек
        const response = await sendRequest(`/check_ai?CallSid=${CALL_SID}`, {});
        
        // Если бот что-то сказал (есть тег <Say>)
        if (response.includes('<Say')) {
            const match = response.match(/<Say.*?>(.*?)<\/Say>/);
            return match ? match[1] : '...';
        }
        
        // Если бот закончил и ждет ответа (есть <Gather>)
        if (response.includes('<Gather')) {
            return null; // Готов слушать дальше
        }
    }
    return "TIMEOUT";
}

async function runTest() {
    console.log(`🚀 ЗАПУСК ТЕСТА СЦЕНАРИЯ (SID: ${CALL_SID})\n`);

    for (let i = 0; i < SCENARIO.length; i++) {
        const userText = SCENARIO[i];
        console.log(`\n👤 ВЫ: "${userText}"`);
        
        // 1. Отправляем вашу фразу
        await sendRequest('/respond', {
            SpeechResult: userText,
            CallSid: CALL_SID,
            From: PHONE
        });

        // 2. Слушаем, что ответит бот (собираем все его фразы подряд)
        console.log(`🤖 БОТ: `);
        let botFinished = false;
        
        while (!botFinished) {
            const botText = await pollCheckAi();
            
            if (botText === null) {
                botFinished = true; // Бот замолчал и ждет ввода
            } else if (botText === "TIMEOUT") {
                console.log("   (Бот молчит слишком долго...)");
                botFinished = true;
            } else {
                console.log(`   - "${botText}"`);
            }
        }
    }
    
    console.log('\n✅ ТЕСТ ЗАВЕРШЕН.');
}

runTest();