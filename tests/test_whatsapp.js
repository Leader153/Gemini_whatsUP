/**
 * Тестовый скрипт для проверки обработки WhatsApp сообщений
 * Симулирует входящее сообщение и проверяет ответ бота
 */

const conversationEngine = require('../utils/conversationEngine');

async function testWhatsAppMessage() {
    console.log('🧪 Тестирование обработки WhatsApp сообщений\n');

    // Тестовые данные
    const testCases = [
        {
            message: 'שלום',
            sessionId: 'whatsapp:+972533403449',
            phone: '+972533403449',
            description: 'Приветствие на иврите'
        },
        {
            message: 'מה המחיר של קופה רושמת?',
            sessionId: 'whatsapp:+972533403449',
            phone: '+972533403449',
            description: 'Вопрос о цене кассы'
        },
        {
            message: 'אני רוצה לבוא לראות',
            sessionId: 'whatsapp:+972533403449',
            phone: '+972533403449',
            description: 'Запрос на встречу'
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 Тест: ${testCase.description}`);
        console.log(`💬 Сообщение: "${testCase.message}"`);
        console.log(`${'='.repeat(60)}\n`);

        try {
            const result = await conversationEngine.processMessage(
                testCase.message,
                testCase.sessionId,
                'whatsapp',
                testCase.phone
            );

            console.log('\n✅ Результат:');
            console.log('📤 Ответ бота:', result.text);
            console.log('🔧 Требуется вызов функции:', result.requiresToolCall);
            if (result.functionCalls) {
                console.log('🛠️ Функции:', result.functionCalls.map(fc => fc.name).join(', '));
            }

        } catch (error) {
            console.error('❌ Ошибка:', error.message);
        }

        // Пауза между тестами
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 Тестирование завершено!');
    console.log(`${'='.repeat(60)}\n`);
}

// Запуск тестов
testWhatsAppMessage().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});
