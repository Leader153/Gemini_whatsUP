/**
 * Тестовый скрипт для проверки обновленных данных в ChromaDB
 */

const { getContextForPrompt } = require('../rag/retriever');

async function testUpdate() {
    console.log('🧪 Тестирование обновленных данных в ChromaDB...\n');

    try {
        // Поиск информации о яхте Joy-BE
        const query = 'מחיר יאכטה Joy-BE עבור 3 שעות';
        console.log(`📝 Запрос: ${query}\n`);

        const context = await getContextForPrompt(query, 3);

        console.log('📊 Результаты поиска:');
        console.log('─'.repeat(60));
        console.log(context);
        console.log('─'.repeat(60));

        // Проверка, что новая цена (2000 ₪) присутствует в результатах
        if (context.includes('2000')) {
            console.log('\n✅ УСПЕХ: Обновленная цена (2000 ₪) найдена в ChromaDB!');
            console.log('✅ Обновление документов работает корректно!');
        } else if (context.includes('1850')) {
            console.log('\n❌ ОШИБКА: Найдена старая цена (1850 ₪)');
            console.log('❌ Обновление не сработало');
        } else {
            console.log('\n⚠️ ВНИМАНИЕ: Цена не найдена в результатах');
        }

    } catch (error) {
        console.error('\n❌ Ошибка тестирования:', error.message);
        process.exit(1);
    }
}

testUpdate();
