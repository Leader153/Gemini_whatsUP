const { ChromaClient } = require('chromadb');
const { COLLECTION_NAME } = require('./rag/vectorStore');

const CHROMA_URL = 'http://localhost:8000';

async function deleteDocuments() {
    try {
        const client = new ChromaClient({ path: CHROMA_URL });
        const collection = await client.getCollection({ name: COLLECTION_NAME });

        const idsToDelete = [
            '143e9632-e320-11f0-a8e1-cd9f1c6b7ea7', // ID для Документа 35
            '1ee578f2-e31c-11f0-876c-4d55e32c846b', // ID для Документа 29
            '8a839a92-e31e-11f0-98be-490f0d57fd4d'  // ID для Документа 32
        ];

        console.log(`\nУдаляем документы с ID: ${idsToDelete.join(', ')} из коллекции "${COLLECTION_NAME}"...`);
        
        await collection.delete({ ids: idsToDelete });

        console.log(`\n✅ Документы успешно удалены.`);

        // Проверяем количество документов после удаления
        const newCount = await collection.count();
        console.log(`\nНовое количество документов в коллекции "${COLLECTION_NAME}": ${newCount}`);

    } catch (error) {
        console.error("Ошибка при удалении документов из ChromaDB:", error);
    }
}

deleteDocuments();
