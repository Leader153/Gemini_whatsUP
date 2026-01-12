/**
 * ChromaDB Vector Store для RAG
 * Подключение к ChromaDB и управление векторной базой данных
 */

const { Chroma } = require('@langchain/community/vectorstores/chroma');
const { embeddings } = require('./embeddings');

// Настройки подключения к ChromaDB
const CHROMA_URL = process.env.CHROMA_SERVER_URL || 'http://localhost:8000'; // Используем переменную окружения, с запасным вариантом
const COLLECTION_NAME = 'rag_documents';

let cachedVectorStore = null;

/**
 * Получить или создать ChromaDB векторное хранилище
 * @returns {Promise<Chroma>}
 */
async function getVectorStore() {
    if (cachedVectorStore) {
        return cachedVectorStore;
    }

    try {
        cachedVectorStore = await Chroma.fromExistingCollection(
            embeddings,
            {
                collectionName: COLLECTION_NAME,
                url: CHROMA_URL,
            }
        );
        console.log(`✅ Подключено к ChromaDB коллекции: ${COLLECTION_NAME}`);
        return cachedVectorStore;
    } catch (error) {
        console.log(`⚠️ Коллекция не найдена, создаём новую: ${COLLECTION_NAME}`);
        cachedVectorStore = new Chroma(embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
        });
        return cachedVectorStore;
    }
}

module.exports = { getVectorStore, COLLECTION_NAME };
