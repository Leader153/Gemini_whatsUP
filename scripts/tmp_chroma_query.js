const { ChromaClient } = require('chromadb');
const { COLLECTION_NAME } = require('../rag/vectorStore');

const CHROMA_URL = 'http://localhost:8000';

async function queryChroma() {
    try {
        const client = new ChromaClient({ path: CHROMA_URL });
        const collection = await client.getCollection({ name: COLLECTION_NAME });

        const count = await collection.count();
        console.log(`\nВ коллекции "${COLLECTION_NAME}" найдено ${count} документов.`);

        console.log(`\nВсе документы в коллекции "${COLLECTION_NAME}" (ID и метаданные):`);

        // Получаем все документы с их ID и метаданными
        const allDocuments = await collection.get({
            include: ["metadatas"] // Запрашиваем только метаданные
        });

        if (allDocuments.metadatas && allDocuments.metadatas.length > 0) {
            allDocuments.metadatas.forEach((metadata, index) => {
                const docId = allDocuments.ids[index]; // Получаем ID
                console.log(`--- Документ ${index + 1} (ID: ${docId}) ---`);
                console.log(metadata);
            });
        } else {
            console.log("Документы не найдены.");
        }

    } catch (error) {
        console.error("Ошибка при запросе ChromaDB:", error);
    }
}

queryChroma();

//node tmp_chroma_query.js
//проверка того что есть в хромаДБ
//node tmp_chroma_delete.js Документы успешно удалены 