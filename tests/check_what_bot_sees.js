const { retrieveContext } = require('../rag/retriever');
const path = require('path');
const dotenv = require('dotenv');
//показывает ровно то, что видит бот перед ответом 
// Грузим настройки
const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, '..', `.env.${nodeEnv}`);
if (require('fs').existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ТЕСТОВЫЕ ВОПРОСЫ
const QUESTIONS = [
    { text: "איפה היאכטה בהרצליה?", domain: "Yachts" }, // Где яхта в Герцлии?
    { text: "איפה אתם בחיפה?", domain: "Yachts" }       // Где вы в Хайфе?
];

async function runXray() {
    console.log("🩻 ЗАПУСК РЕНТГЕНА БАЗЫ ДАННЫХ...\n");

    for (const q of QUESTIONS) {
        console.log(`🔎 Вопрос: "${q.text}"`);
        
        // 1. Имитируем поиск
        const docs = await retrieveContext(q.text, 3, q.domain);
        
        if (docs.length === 0) {
            console.log("❌ БАЗА ВЕРНУЛА ПУСТОТУ! (Ничего не найдено)\n");
            continue;
        }

        // 2. Проверяем, есть ли нужная инфа в найденном
        let foundLink = false;
        let foundDesc = false;

        console.log("📄 Найденные документы (Топ-3):");
        
        docs.forEach((doc, i) => {
            const content = doc.pageContent;
            const hasWaze = content.includes("waze.com") || content.includes("maps.app.goo.gl");
            const hasDesc = content.includes("Location_Desc") || content.includes("Directions:");
            
            console.log(`   [Док ${i+1}] Яхта: ${doc.metadata.Product}`);
            
            if (hasWaze) {
                console.log(`      ✅ Ссылка на карту: ОБНАРУЖЕНА`);
                foundLink = true;
            } else {
                console.log(`      ⚠️ Ссылки на карту НЕТ в этом куске`);
            }
        });

        if (foundLink) {
            console.log("\n✅ ИТОГ: Бот ВИДИТ ссылку. Если он её не шлет — виноват Промпт.");
        } else {
            console.log("\n❌ ИТОГ: Бот СЛЕПОЙ. В найденных документах нет ссылки. Нужно править CSV или ключевые слова.");
        }
        console.log("--------------------------------------------------\n");
    }
}

runXray();

//показывает ровно то, что видит бот перед ответом 

//Если ты видишь красное ❌ ИТОГ: Бот СЛЕПОЙ — значит, поиск работает плохо. 
// Нам нужно добавить ключевых слов в CSV.

//Если ты видишь зеленое ✅ ИТОГ: Бот ВИДИТ ссылку — значит, технически всё исправно.
//  Теперь нужно править Промпт, чтобы бот использовал найденные ссылки<div className=""></div>

//node tests/check_what_bot_sees.js 