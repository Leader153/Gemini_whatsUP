const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const path = require('path');
const dotenv = require('dotenv');

const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
const envFilePath = path.resolve(__dirname, '..', envFileName);

if (require('fs').existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: true });
}

// Инициализация Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    // ВАЖНО: Используем старую, но рабочую модель
    modelName: 'embedding-001',
});

module.exports = { embeddings };