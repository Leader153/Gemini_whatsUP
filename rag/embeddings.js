/**
 * Gemini Embeddings для RAG
 * Поддержка многоязычности (включая иврит)
 */

const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
const envFilePath = path.resolve(__dirname, '..', envFileName);

if (require('fs').existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: true });
}

if (!process.env.GEMINI_API_KEY) {
    // Last resort fallback for local development if everything else fails
    dotenv.config({ path: path.join(process.cwd(), '.env.development'), override: true });
}

// Инициализация Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'text-embedding-004', // Новая модель эмбеддингов от Google
});

module.exports = { embeddings };
