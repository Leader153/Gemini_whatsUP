const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const conversationEngine = require('../utils/conversationEngine');
const sessionManager = require('../memory/sessionManager');
const botBehavior = require('../data/botBehavior');
const messageFormatter = require('../utils/messageFormatter');
const messagingRoutes = require('./messaging_handler');

require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/', messagingRoutes); // Routes for WhatsApp and SMS

// ----------------------------------------------------------------------
// ROUTE /voice: Start of the call and user speech gathering
// ----------------------------------------------------------------------
app.post('/voice', (request, response) => {
    const twiml = new VoiceResponse();
    const initialGreeting = messageFormatter.getGreeting('voice');
    const voice = botBehavior.voiceSettings.he.ttsVoice;
    const sttLang = botBehavior.voiceSettings.he.sttLanguage;

    twiml.say({ voice: voice }, initialGreeting);
    twiml.gather({
        input: 'speech',
        action: '/respond',
        speechTimeout: 'auto',
        language: sttLang,
    });
    twiml.redirect({ method: 'POST' }, '/voice');

    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// ROUTE /respond: Process recognized speech and get response from engine
// ----------------------------------------------------------------------
app.post('/respond', async (request, response) => {
    const speechResult = request.body.SpeechResult;
    const callSid = request.body.CallSid;
    const clientPhone = request.body.From;

    if (speechResult) {
        try {
            const result = await conversationEngine.processMessage(
                speechResult,
                callSid,
                'voice',
                clientPhone
            );

            if (result.requiresToolCall) {
                // If the engine indicates a tool call is needed, we say something
                // and redirect to a new route to process the tool.
                sessionManager.setPendingFunctionCalls(callSid, result.functionCalls);
                const twiml = new VoiceResponse();
                const intermediateText = messageFormatter.getMessage('checking', 'voice');
                const langCode = botBehavior.detectLanguage(intermediateText);
                const v_check = botBehavior.voiceSettings[langCode].ttsVoice;

                twiml.say({ voice: v_check }, intermediateText);
                twiml.redirect({ method: 'POST' }, `/process_tool?CallSid=${callSid}`);
                response.type('text/xml');
                response.send(twiml.toString());
            } else {
                // Regular response without function call
                const twiml = new VoiceResponse();
                const cleanedText = messageFormatter.format(result.text, 'voice');
                const langCode = botBehavior.detectLanguage(cleanedText);
                const v = botBehavior.voiceSettings[langCode].ttsVoice;
                const sttL = botBehavior.voiceSettings[langCode].sttLanguage;

                twiml.say({ voice: v }, cleanedText);
                twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: sttL });
                response.type('text/xml');
                response.send(twiml.toString());
            }
        } catch (error) {
            console.error('Error in /respond:', error);
            const twiml = new VoiceResponse();
            const msg = messageFormatter.getMessage('apiError', 'voice');
            const v = botBehavior.voiceSettings.he.ttsVoice;
            twiml.say({ voice: v }, msg);
            twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
            response.type('text/xml');
            response.send(twiml.toString());
        }
    } else {
        // No speech detected
        const twiml = new VoiceResponse();
        const msg = messageFormatter.getMessage('noSpeech', 'voice');
        const v = botBehavior.voiceSettings.he.ttsVoice;
        twiml.say({ voice: v }, msg);
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        response.type('text/xml');
        response.send(twiml.toString());
    }
});

// ----------------------------------------------------------------------
// ROUTE /process_tool: Execute functions after "I'm checking..."
// ----------------------------------------------------------------------
app.post('/process_tool', async (request, response) => {
    const callSid = request.body.CallSid || request.query.CallSid;
    console.log(`⚙️ Processing tools for callSid: ${callSid}`);

    try {
        const functionCalls = sessionManager.getAndClearPendingFunctionCalls(callSid);
        if (!functionCalls || functionCalls.length === 0) {
            throw new Error('No pending function calls found.');
        }

        const result = await conversationEngine.handleToolCalls(functionCalls, callSid, 'voice');

        // Handle special case for call transfer
        if (result.transferToOperator) {
            const twiml = new VoiceResponse();
            const v = botBehavior.voiceSettings.he.ttsVoice;
            twiml.say({ voice: v }, result.text);
            twiml.dial({
                timeout: botBehavior.operatorSettings.timeout,
                action: botBehavior.operatorSettings.callbackUrl,
            }, botBehavior.operatorSettings.phoneNumber);
            response.type('text/xml');
            response.send(twiml.toString());
            return;
        }

        const twiml = new VoiceResponse();
        const cleanedText = messageFormatter.format(result.text, 'voice');
        const langCode = botBehavior.detectLanguage(cleanedText);
        const v_post = botBehavior.voiceSettings[langCode].ttsVoice;
        const sttL = botBehavior.voiceSettings[langCode].sttLanguage;

        twiml.say({ voice: v_post }, cleanedText);
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: sttL });
        response.type('text/xml');
        response.send(twiml.toString());

    } catch (error) {
        console.error('Error in /process_tool:', error);
        const twiml = new VoiceResponse();
        const msg = messageFormatter.getMessage('apiError', 'voice');
        const v = botBehavior.voiceSettings.he.ttsVoice;
        twiml.say({ voice: v }, msg);
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
        response.type('text/xml');
        response.send(twiml.toString());
    }
});


// ----------------------------------------------------------------------
// ROUTE /handle-dial-status: Handle call status after transfer attempt
// ----------------------------------------------------------------------
app.post('/handle-dial-status', (request, response) => {
    const twiml = new VoiceResponse();
    const dialStatus = request.body.DialCallStatus;

    if (dialStatus === 'busy' || dialStatus === 'no-answer' || dialStatus === 'failed') {
        twiml.say({ voice: botBehavior.voiceSettings.he.ttsVoice }, messageFormatter.getMessage('operatorUnavailable', 'voice'));
        twiml.gather({ input: 'speech', action: '/respond', speechTimeout: 'auto', language: botBehavior.voiceSettings.he.sttLanguage });
    } else {
        twiml.hangup();
    }

    response.type('text/xml');
    response.send(twiml.toString());
});

// ----------------------------------------------------------------------
// SERVER STARTUP
// ----------------------------------------------------------------------
const https = require('https');
const fs = require('fs');

try {
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/assistantbot.online/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/assistantbot.online/fullchain.pem', 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    const server = https.createServer(credentials, app);
    server.listen(1337, () => {
        console.log('TwiML HTTPS server running at https://assistantbot.online:1337/');
    });
} catch (error) {
    console.warn("SSL certificate not found, starting in HTTP mode on port 1337. This is suitable for local testing with ngrok, but not for production.");
    app.listen(1337, () => {
        console.log('TwiML HTTP server running at http://localhost:1337/');
    });
}
