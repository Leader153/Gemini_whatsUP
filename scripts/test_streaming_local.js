const http = require('http');
const querystring = require('querystring');

const PORT = 1337; 
const CALL_SID = 'test_call_' + Date.now();
const USER_PHONE = '+972533403449';

function postRequest(path, data) {
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
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
                resolve({ status: res.statusCode, body: responseBody });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

async function runTest() {
    console.log('🧪 Starting Logic Test on Port ' + PORT);

    try {
        // --- TURN 1 ---
        console.log(`\n1. Sending POST to /respond...`);
        const respondRes = await postRequest('/respond', {
            SpeechResult: 'כמה עולה יאכטה לואיז לשלוש שעות?', 
            CallSid: CALL_SID,
            From: USER_PHONE
        });

        console.log('Response from /respond:');
        console.log(respondRes.body);

        // ПРОВЕРКА 1: Должна быть музыка (<Play>), а не текст
        if (respondRes.body.includes('<Play') || respondRes.body.includes('mb.mp3')) {
            console.log('✅ Success: Music started immediately.');
        } else {
            console.error('❌ Failed: Music <Play> tag not found.');
        }

        // ПРОВЕРКА 2: Редирект
        if (!respondRes.body.includes('check_ai')) {
            console.error('❌ Failed: redirect to check_ai not found.');
            return;
        }

        // 2. Poll /check_ai
        let completed = false;
        let attempts = 0;

        console.log(`\n2. Polling /check_ai...`);

        while (!completed && attempts < 40) {
            attempts++;
            // Имитируем задержку Twilio (он играет музыку или говорит, это занимает время)
            await new Promise(r => setTimeout(r, 1000));

            const checkRes = await postRequest(`/check_ai?CallSid=${CALL_SID}`, {});
            const twiml = checkRes.body.trim();

            console.log(`\n--- Attempt ${attempts} ---`);
            
            if (twiml.includes('<Say') && !twiml.includes('apiError')) {
                const match = twiml.match(/<Say.*?>(.*?)<\/Say>/);
                const text = match ? match[1] : '???';
                console.log(`🗣️ BOT SAYS: "${text}"`);
                
                // Если бот что-то сказал, значит он ответил.
                // Но мы продолжаем поллинг, пока он не вернет Gather (конец ответа)
            } else if (twiml.includes('<Pause') || twiml.includes('<Play')) {
                console.log('⏳ Bot is thinking...');
            } else if (twiml.includes('apiError')) {
                console.log('❌ API Error reported by bot.');
            }

            if (twiml.includes('<Gather') && twiml.includes('reprompt')) {
                console.log('✅ Conversation turn completed (Gather/Reprompt found).');
                completed = true;
            } else if (twiml.includes('<Hangup')) {
                console.log('🛑 Hangup received.');
                completed = true;
            }
        }

        if (!completed) {
            console.log('⚠️ Test timed out (too many polls).');
            return;
        }
        
        console.log('\n✅ TEST PASSED!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

runTest();