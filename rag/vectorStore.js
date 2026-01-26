/**
 * ChromaDB Vector Store для RAG
 * Подключение к ChromaDB и управление векторной базой данных
 */

const { Chroma } = require('@langchain/community/vectorstores/chroma');
const { embeddings } = require('./embeddings');

// Берем URL из переменных окружения (которые загрузил index.js или loadDocuments.js)
const CHROMA_URL = process.env.CHROMA_SERVER_URL || 'http://127.0.0.1:8000';
const COLLECTION_NAME = 'rag_documents';

let cachedVectorStore = null;

/**
 * Получить или создать ChromaDB векторное хранилище
 * @returns {Promise<Chroma>}
 */
async function getVectorStore() {
    // Если уже подключились, возвращаем готовое соединение
    if (cachedVectorStore) {
        return cachedVectorStore;
    }

    // Проверка на случай проблем с импортом
    if (!embeddings) {
        throw new Error("❌ Ошибка: Не найден модуль embeddings. Проверьте rag/embeddings.js");
    }

    try {
        console.log(`🔌 Подключение к ChromaDB [${CHROMA_URL}]...`);

        // Инициализируем клиент через LangChain.
        // Важно: передаем 'embeddings' первым аргументом, чтобы LangChain знал, как векторизовать запросы.
        cachedVectorStore = new Chroma(embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
        });

        console.log(`✅ Успешное подключение к коллекции: ${COLLECTION_NAME}`);
        return cachedVectorStore;
    } catch (error) {
        console.error(`❌ Не удалось инициализировать ChromaDB:`, error);
        throw error; // Бросаем ошибку дальше, чтобы бот не запустился "наполовину"
    }
}

module.exports = { getVectorStore, COLLECTION_NAME };