/**
 * Gemini Embeddings для RAG
 * Используем единственную доступную модель: gemini-embedding-001
 */

const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const path = require('path');
const dotenv = require('dotenv');

// Настройка окружения
const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
const envFilePath = path.resolve(__dirname, '..', envFileName);

if (require('fs').existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: true });
} else {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

// Инициализация Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    // ВАЖНО: Точное имя, которое мы нашли через скрипт
    modelName: "gemini-embedding-001",
});

module.exports = { embeddings };