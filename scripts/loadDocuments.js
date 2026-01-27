const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// --- НАСТРОЙКА ОКРУЖЕНИЯ ---
const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = `.env.${nodeEnv}`;
const envPath = path.join(__dirname, '..', envFileName);

if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
    console.log('🚀 ЗАГРУЗКА БАЗЫ (ВЕРСИЯ KEYWORD BOOST)...');

    try {
        console.log(`🔄 Подключение к ChromaDB: ${CHROMA_URL}`);
        const chromaConfig = getChromaConfig(CHROMA_URL);
        const chromaClient = new ChromaClient(chromaConfig);

        try {
            await chromaClient.deleteCollection({ name: COLLECTION_NAME });
            console.log('✅ Старая коллекция удалена.');
        } catch (e) {}
        
        await new Promise(r => setTimeout(r, 1000));

        if (!fs.existsSync(CSV_PATH)) throw new Error(`Файл не найден!`);
        const parsedData = parseCSV(fs.readFileSync(CSV_PATH, 'utf-8'));

        const docs = parsedData.map(row => {
            // ХИТРОСТЬ: Дублируем важные слова в начало, чтобы поиск работал лучше
            const pageContent = `
=== KEYWORDS FOR SEARCH ===
${row.Product_Name} ${row.Model_Type}
${row.Product_Name} ${row.Model_Type}
${row.Domain} ${row.Sub_Category}

=== DETAILS ===
Product Name: ${row.Product_Name}
Model: ${row.Model_Type}
Price: ${row.Price}
Features: ${row.Key_Features}
Connectivity: ${row.Connectivity_Safety}
Target Audience: ${row.Target_Audience}
Category: ${row.Domain} / ${row.Sub_Category}

=== MEDIA ===
Images: ${row.Photo_URLs || 'None'}
Video: ${row.Video_URL || 'None'}
Bot Style: ${row.Human_Style_Note || 'Neutral'}
            `.trim();

            return new Document({ 
                pageContent, 
                metadata: {
                    id: row.id,
                    Domain: row.Domain,
                    // Добавляем Product Name в метаданные для отладки
                    Product: row.Product_Name
                } 
            });
        });

        console.log(`✅ Найдено ${docs.length} документов.`);
        console.log(`🔄 Создание векторов (embedding-001)...`);
        
        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
            collectionMetadata: { "hnsw:space": "cosine" }
        });

        console.log('\n✅ УСПЕХ: База обновлена с усиленными ключевыми словами!');

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        process.exit(1);
    }
}

main();