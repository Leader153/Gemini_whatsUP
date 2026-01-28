const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// --- 1. НАСТРОЙКА ОКРУЖЕНИЯ ---
const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
const envPath = path.join(__dirname, '..', envFileName);

console.log(`[CONFIG] Режим: ${nodeEnv}`);
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

const { COLLECTION_NAME } = require('../rag/vectorStore');
const { embeddings } = require('../rag/embeddings');
const { ChromaClient } = require('chromadb');
const { Document } = require("@langchain/core/documents");
const { Chroma } = require('@langchain/community/vectorstores/chroma');

const CHROMA_URL = process.env.CHROMA_SERVER_URL || 'http://localhost:8000';
const CSV_PATH = path.join(__dirname, '..', 'data', 'products_knowledge_base.csv');

function getChromaConfig(urlStr) {
    try {
        const url = new URL(urlStr);
        return { host: `${url.protocol}//${url.hostname}`, port: parseInt(url.port) || 8000 };
    } catch (e) { return { path: urlStr }; }
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
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else current += char;
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
    console.log('🚀 ЗАГРУЗКА БАЗЫ ЗНАНИЙ...');

    try {
        console.log(`🔄 Подключение к ChromaDB: ${CHROMA_URL}`);
        const chromaConfig = getChromaConfig(CHROMA_URL);
        const chromaClient = new ChromaClient(chromaConfig);

        // Очистка
        try {
            await chromaClient.deleteCollection({ name: COLLECTION_NAME });
            console.log('✅ Старая коллекция удалена.');
        } catch (e) {}
        
        await new Promise(r => setTimeout(r, 1000));

        // Чтение CSV
        if (!fs.existsSync(CSV_PATH)) throw new Error(`Файл не найден!`);
        const parsedData = parseCSV(fs.readFileSync(CSV_PATH, 'utf-8'));

        const docs = parsedData.map(row => {
            const pageContent = `
Product: ${row.Product_Name}
Model: ${row.Model_Type}
City: ${row.City}
Price: ${row.Price}
Features: ${row.Key_Features}
Target: ${row.Target_Audience}
Category: ${row.Domain} / ${row.Sub_Category}

--- MEDIA & STYLE ---
Images: ${row.Photo_URLs || 'None'}
Video: ${row.Video_URL || 'None'}
Bot Instruction: ${row.Human_Style_Note || 'Neutral tone'}
            `.trim();

            return new Document({ 
                pageContent, 
                metadata: {
                    id: row.id,
                    Domain: row.Domain,
                    Sub_Category: row.Sub_Category,
                    Product: row.Product_Name,
                    City: row.City
                } 
            });
        });

        console.log(`✅ Подготовлено ${docs.length} документов.`);
        console.log(`🔄 Генерация векторов и сохранение...`);
        
        // ВАЖНО: Используем единый вызов, чтобы видеть ошибку сразу
        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
            collectionMetadata: { "hnsw:space": "cosine" }
        });

        console.log('\n✅ УСПЕХ: База обновлена!');

    } catch (error) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА ЗАГРУЗКИ:');
        console.error(error); // Выводим полную ошибку
        console.error('\n💡 СОВЕТ: Проверьте API Key и доступ к модели text-embedding-004');
        process.exit(1);
    }
}

main();