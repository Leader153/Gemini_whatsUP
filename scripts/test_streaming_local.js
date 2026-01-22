const http = require('http');
const querystring = require('querystring');

const PORT = 1337; // Based on .env
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

function postRequestEmpty(path) {
    return postRequest(path, {});
}

async function runTest() {
    console.log('🧪 Starting Streaming Test on Port ' + PORT);

    try {
        // 1. Initial /respond call
        console.log(`\n1. Sending POST to /respond...`);
        const respondRes = await postRequest('/respond', {
            SpeechResult: 'כמה עולה יאכטה לואיז לשלוש שעות?', // How much does yacht Louise cost for 3 hours?
            CallSid: CALL_SID,
            From: USER_PHONE
        });

        console.log('Response from /respond:');
        console.log(respondRes.body);

        if (!respondRes.body.includes('רק רגע, אני בודקת')) {
            console.error('❌ Failed: Did not find immediate filler phrase.');
        } else {
            console.log('✅ Found immediate filler phrase.');
        }

        if (!respondRes.body.includes('check_ai')) {
            console.error('❌ Failed: redirect to check_ai not found.');
            return;
        }

        // 2. Poll /check_ai
        let completed = false;
        let attempts = 0;

        console.log(`\n2. Polling /check_ai...`);

        while (!completed && attempts < 30) {
            attempts++;
            // Simulate delay between Twilio requests (Twilio plays audio then requests next TwiML)
            await new Promise(r => setTimeout(r, 1500));

            const checkRes = await postRequest(`/check_ai?CallSid=${CALL_SID}`, {});
            const twiml = checkRes.body.trim();

            console.log(`\n--- Attempt ${attempts} ---`);
            // console.log(twiml);

            if (twiml.includes('<Say') && !twiml.includes('apiError')) {
                // Extract text from Say
                const match = twiml.match(/<Say.*?>(.*?)<\/Say>/);
                const text = match ? match[1] : '???';
                console.log(`🗣️ BOT SAYS: "${text}"`);
            } else if (twiml.includes('<Pause')) {
                console.log('⏳ Bot is thinking (Wait music/pause)...');
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
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

runTest();
