const fs = require('fs');
const path = require('path');
const { Chroma } = require('@langchain/community/vectorstores/chroma');
const { embeddings } = require('./rag/embeddings');
const { COLLECTION_NAME } = require('./rag/vectorStore');
const { ChromaClient } = require('chromadb');
const { Document } = require("@langchain/core/documents");

// Путь к файлу базы знаний
const CSV_PATH = path.join(__dirname, 'data', 'products_knowledge_base.csv');
const CHROMA_URL = 'http://localhost:8000';

// Простая функция для парсинга CSV, устойчивая к запятым в кавычках и пустым полям
function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines.shift().split(',').map(h => h.trim());

    return lines.map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim()); // Добавляем последнее значение

        return headers.reduce((obj, header, i) => {
            let value = values[i] || '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1).replace(/""/g, '"');
            }
            obj[header] = value;
            return obj;
        }, {});
    });
}


async function main() {
    console.log('🚀 Начало загрузки документов в ChromaDB из CSV...\n');

    try {
        // 0. Подключение к ChromaDB и удаление старой коллекции
        console.log('🔄 Подключение к ChromaDB...');
        const chromaClient = new ChromaClient({ path: CHROMA_URL });

        try {
            console.log(`🗑️  Удаление старой коллекции "${COLLECTION_NAME}"...`);
            await chromaClient.deleteCollection({ name: COLLECTION_NAME });
            console.log('✅ Старая коллекция удалена\n');
        } catch (error) {
            console.log('ℹ️  Коллекция не существует, создаем новую\n');
        }

        // 1. Загрузить данные из CSV
        console.log(`📁 Чтение файла: ${CSV_PATH}`);
        if (!fs.existsSync(CSV_PATH)) {
            throw new Error(`Файл ${CSV_PATH} не найден!`);
        }
        const csvData = fs.readFileSync(CSV_PATH, 'utf-8');
        const parsedData = parseCSV(csvData);

        if (parsedData.length === 0) {
            console.log('\n⚠️ CSV файл пуст или не удалось его распарсить.');
            return;
        }

        // 2. Создать документы LangChain с метаданными
        const docs = parsedData.map(row => {
            const pageContent = `
Product: ${row.Product_Name || ''}
Model: ${row.Model_Type || ''}
Price: ${row.Price || ''}
Features: ${row.Key_Features || ''}
Connectivity & Safety: ${row.Connectivity_Safety || ''}
Target: ${row.Target_Audience || ''}
Category: ${row.Domain || ''} / ${row.Sub_Category || ''}
            `.trim();

            return new Document({
                pageContent,
                metadata: { ...row }
            });
        });

        console.log(`\n✅ Подготовлено ${docs.length} документов из CSV`);
        if (docs.length > 0) {
            console.log('📝 Пример первого документа:\n', docs[0].pageContent);
        }

        // 3. Подключиться к хранилищу и добавить документы
        console.log(`\n🔄 Добавление документов в ChromaDB...`);
        console.log(`   Коллекция: ${COLLECTION_NAME}`);
        console.log(`   URL: ${CHROMA_URL}`);

        // Инициализируем Chroma напрямую для создания коллекции
        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
        });

        console.log('\n✅ Все документы успешно загружены в ChromaDB!');
        console.log(`📊 Статистика:`);
        console.log(`   - Всего документов: ${docs.length}`);
        console.log(`   - Коллекция: ${COLLECTION_NAME}`);
        console.log(`   - Готово к использованию в RAG!`);
        console.log('\n💡 Теперь вы можете запустить голосовой бот, который будет различать домены: node answer_phone.js');

    } catch (error) {
        console.error('\n❌ Ошибка загрузки документов:', error.message);
        console.error('\n💡 Убедитесь, что:');
        console.error('   1. ChromaDB запущен (docker ps)');
        console.error(`   2. Файл ${CSV_PATH} существует и корректен.`);
        console.error('   3. GEMINI_API_KEY установлен в .env');
        console.error('\n🔧 Полная ошибка:', error);
        process.exit(1);
    }
}

// Запуск скрипта
main();
