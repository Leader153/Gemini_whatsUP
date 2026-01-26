const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// --- 1. НАСТРОЙКА ОКРУЖЕНИЯ (ВАЖНО ДЛЯ .env.development) ---
// Определяем режим (по умолчанию development)
const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
// Ищем файл на уровень выше, так как скрипт в папке /scripts
const envPath = path.join(__dirname, '..', envFileName);

console.log(`[CONFIG] Режим загрузки: ${nodeEnv}`);
if (fs.existsSync(envPath)) {
    console.log(`[CONFIG] Читаем настройки из: ${envFileName}`);
    dotenv.config({ path: envPath });
} else {
    console.log(`[CONFIG] Файл ${envFileName} не найден, ищем стандартный .env`);
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
}
// ------------------------------------------------------------

const { COLLECTION_NAME } = require('../rag/vectorStore');
const { embeddings } = require('../rag/embeddings');
const { ChromaClient } = require('chromadb');
const { Document } = require("@langchain/core/documents");
const { Chroma } = require('@langchain/community/vectorstores/chroma');

// Настройки из окружения (теперь они точно загрузятся)
const CHROMA_URL = process.env.CHROMA_SERVER_URL || 'http://localhost:8000';
const CSV_PATH = path.join(__dirname, '..', 'data', 'products_knowledge_base.csv');

// Функция для разбора URL (для совместимости с ChromaDB)
function getChromaConfig(urlStr) {
    try {
        const url = new URL(urlStr);
        return {
            host: `${url.protocol}//${url.hostname}`,
            port: parseInt(url.port) || 8000,
        };
    } catch (e) {
        return { path: urlStr };
    }
}

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const headers = lines.shift().split(',').map(h => h.trim());

    return lines.map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else { current += char; }
        }
        values.push(current.trim());
        return headers.reduce((obj, header, i) => {
            let value = values[i] || '';
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/""/g, '"');
            obj[header] = value;
            return obj;
        }, {});
    });
}

async function main() {
    console.log('🚀 Начало загрузки документов в ChromaDB...');

    try {
        console.log(`🔄 Подключение к ChromaDB по адресу: ${CHROMA_URL}`);
        const chromaConfig = getChromaConfig(CHROMA_URL);
        const chromaClient = new ChromaClient(chromaConfig);

        try {
            console.log(`🗑️  Удаление старой коллекции "${COLLECTION_NAME}"...`);
            await chromaClient.deleteCollection({ name: COLLECTION_NAME });
            console.log('✅ Старая коллекция удалена');
        } catch (error) {
            console.log('ℹ️  Коллекция не найдена, создаем новую');
        }

        console.log(`📁 Чтение файла: ${CSV_PATH}`);
        if (!fs.existsSync(CSV_PATH)) throw new Error(`Файл ${CSV_PATH} не найден!`);
        
        const csvData = fs.readFileSync(CSV_PATH, 'utf-8');
        const parsedData = parseCSV(csvData);

        if (parsedData.length === 0) {
            console.log('⚠️ CSV файл пуст.');
            return;
        }

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
            return new Document({ pageContent, metadata: { ...row } });
        });

        console.log(`✅ Подготовлено ${docs.length} документов.`);

        console.log(`🔄 Создание векторного индекса...`);
        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
            collectionMetadata: { "hnsw:space": "cosine" }
        });

        console.log('\n✅ УСПЕХ: База знаний обновлена!');
        console.log(`📊 Всего документов: ${docs.length}`);

    } catch (error) {
        console.error('\n❌ Ошибка загрузки:', error.message);
        console.error('🔧 Проверьте: запущен ли Docker с ChromaDB и правильность .env файла.');
        process.exit(1);
    }
}

main();