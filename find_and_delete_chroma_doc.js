const { ChromaClient } = require('chromadb');
const { COLLECTION_NAME } = require('./rag/vectorStore'); // Используем COLLECTION_NAME из vectorStore

const CHROMA_URL = 'http://localhost:8000';

async function findAndDeleteDocument(filenameToFind) {
    try {
        const client = new ChromaClient({ path: CHROMA_URL });
        const collection = await client.getCollection({ name: COLLECTION_NAME });

        console.log(`\n--- Поиск и удаление документа с именем файла "${filenameToFind}" ---
`);
        
        // 1. Найти документы по имени файла
        console.log(`
Ищем документы с filename: "${filenameToFind}"...
`);
        
        const allDocs = await collection.get({
            include: ["metadatas"]
        });

        const documentsToDelete = allDocs.metadatas
            .map((metadata, index) => ({ id: allDocs.ids[index], metadata }))
            .filter(doc => doc.metadata.filename === filenameToFind);

        if (documentsToDelete.length === 0) {
            console.log(`Документы с именем файла "${filenameToFind}" не найдены.`);
            return;
        }

        const idsToDelete = documentsToDelete.map(doc => doc.id);
        console.log(`Найдены следующие документы для удаления (IDs): ${idsToDelete.join(', ')}`);
        documentsToDelete.forEach(doc => console.log(doc.metadata));

        // 2. Удалить найденные документы
        console.log(`
Удаляем найденные документы из коллекции "${COLLECTION_NAME}"...
`);
        await collection.delete({ ids: idsToDelete });
        console.log(`✅ Документы успешно удалены.`);

        // 3. Проверить количество документов после удаления
        const newCount = await collection.count();
        console.log(`
Новое количество документов в коллекции "${COLLECTION_NAME}": ${newCount}`);

        // 4. Проверить, что удаленные документы больше не находятся
        console.log(`
Проверяем, остались ли документы с именем файла "${filenameToFind}"...
`);
        const remainingDocs = await collection.get({
            include: ["metadatas"]
        });
        const stillPresentDocs = remainingDocs.metadatas
            .map((metadata, index) => ({ id: remainingDocs.ids[index], metadata }))
            .filter(doc => doc.metadata.filename === filenameToFind);

        if (stillPresentDocs.length === 0) {
            console.log(`✅ Документы с именем файла "${filenameToFind}" успешно удалены и больше не найдены.`);
        } else {
            console.log(`⚠️ Некоторые документы с именем файла "${filenameToFind}" все еще присутствуют:`);
            stillPresentDocs.forEach(doc => console.log(doc.metadata));
        }

    } catch (error) {
        console.error("Ошибка при поиске и удалении документов из ChromaDB:", error);
    }
}

// Пример использования:
//Я создал find_and_delete_chroma_doc.js,демонстрирующий поиск и удаление документов по имени файла. Запустите его командой nodefind_and_delete_chroma_doc.js. По умолчанию он      удаляет catalog.txt; для удаления другого файла     измените аргумент findAndDeleteDocument().
// Замените 'catalog.txt' на имя файла, который вы хотите найти и удалить.
// Убедитесь, что такой файл действительно есть в ChromaDB перед запуском.
findAndDeleteDocument('catalog.txt'); 
