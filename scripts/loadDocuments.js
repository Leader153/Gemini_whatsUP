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
    console.log('🚀 ЗАГРУЗКА НОВОЙ БАЗЫ (FULL VERSION)...');

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
            // Формируем красивую строку цены
            let prices = [];
            if (row.Price_1h && row.Price_1h !== 'N/A') prices.push(`שעה 1: ${row.Price_1h}`);
            if (row.Price_2h && row.Price_2h !== 'N/A') prices.push(`שעתיים: ${row.Price_2h}`);
            if (row.Price_3h && row.Price_3h !== 'N/A') prices.push(`3 שעות: ${row.Price_3h}`);
            
            let priceString = prices.join('; ');
            if (row.Price_Note && row.Price_Note !== 'N/A') priceString += ` (${row.Price_Note})`;

            // ВАЖНО: Добавляем Search_Keywords в начало для поиска
            const pageContent = `
<<<<<<< HEAD
=== KEYWORDS FOR SEARCH ===
${row.Search_Keywords || ''}
${row.Product_Name}
${row.City !== 'N/A' ? row.City : ''}
${row.Model_Type}
=======
=== SEARCH KEYWORDS (HIDDEN) ===
${row.Search_Keywords}
${row.Product_Name}
${row.City !== 'N/A' ? row.City : ''}
>>>>>>> b710c831e18f4cca5e1b69f253dba911941c7bb0

=== PRODUCT DETAILS (FOR USER) ===
Name: ${row.Product_Name}
Model: ${row.Model_Type}
City: ${row.City}
Price: ${priceString}
Max Participants: ${row.Max_Participants || 'Unknown'}
Features: ${row.Key_Features}
Target: ${row.Target_Audience}
Category: ${row.Domain} / ${row.Sub_Category}
Bonuses: ${row.Bonuses || 'Standard'}

=== LOCATION ===
Waze: ${row.Location_Link || 'None'}
Directions: ${row.Location_Desc || 'None'}

=== MEDIA ===
Images: ${row.Photo_URLs || 'None'}
Video: ${row.Video_URL || 'None'}
Bot Style: ${row.Human_Style_Note || 'Neutral'}

=== PAYMENT ===
Link: ${row.Payment_Link || 'None'}
Guide: ${row.Payment_Guide_URL || 'None'}
            `.trim();

            const metadata = {
                id: row.id,
                Domain: row.Domain,
                Sub_Category: row.Sub_Category,
                Product: row.Product_Name,
                City: row.City,
                Max_Participants: row.Max_Participants
            };

            return new Document({ pageContent, metadata });
        });   

        console.log(`✅ Подготовлено ${docs.length} документов.`);
        console.log(`🔄 Генерация векторов...`);
        
        await Chroma.fromDocuments(docs, embeddings, {
            collectionName: COLLECTION_NAME,
            url: CHROMA_URL,
            collectionMetadata: { "hnsw:space": "cosine" }
        });

        console.log('\n✅ УСПЕХ: База обновлена! Имя на иврите отделено от ключевых слов.');

    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        process.exit(1);
    }
}

main();