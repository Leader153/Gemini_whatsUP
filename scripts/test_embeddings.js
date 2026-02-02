const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const path = require('path');
const dotenv = require('dotenv');

// --- SETUP ENV LIKE THE APP ---
const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
const envFilePath = path.resolve(__dirname, '..', envFileName);

console.log(`Trying to load env from: ${envFilePath}`);
if (require('fs').existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: true });
    console.log("Env loaded.");
} else {
    console.log("Env file not found.");
}

console.log(`API Key present: ${!!process.env.GEMINI_API_KEY}`);
if (process.env.GEMINI_API_KEY) {
    console.log(`API Key starts with: ${process.env.GEMINI_API_KEY.substring(0, 5)}...`);
}

async function testEmbeddings() {
    try {
        const embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GEMINI_API_KEY,
            modelName: 'text-embedding-004',
        });

        const text = "Test string for embedding";
        console.log(`Generating embedding for: "${text}"`);

        const res = await embeddings.embedDocuments([text]);
        console.log(`Result type: ${typeof res}`);
        console.log(`Is Array: ${Array.isArray(res)}`);
        if (Array.isArray(res) && res.length > 0) {
            console.log(`First element is Array: ${Array.isArray(res[0])}`);
            console.log(`Length of first embedding: ${res[0].length}`);
            console.log(`Sample values: ${res[0].slice(0, 5)}`);
        } else {
            console.log("Result is empty or invalid structure.");
            console.log(JSON.stringify(res, null, 2));
        }

    } catch (error) {
        console.error("Error during embedding generation:", error);
    }
}

testEmbeddings();
