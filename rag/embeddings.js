/**
 * Gemini Embeddings для RAG
 * Поддержка многоязычности (включая иврит)
 */

const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
require('dotenv').config();

// Инициализация Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'text-embedding-004', // Новая модель эмбеддингов от Google
});

module.exports = { embeddings };
