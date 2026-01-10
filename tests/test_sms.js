/**
 * Тестовый скрипт для проверки обработки SMS сообщений
 * Симулирует входящее SMS и проверяет форматирование ответа
 */

const conversationEngine = require('../utils/conversationEngine');
const messageFormatter = require('../utils/messageFormatter');

async function testSMSMessage() {
    console.log('🧪 Тестирование обработки SMS сообщений\n');

    // Тестовые данные
    const testCases = [
        {
            message: 'שלום',
            sessionId: 'sms:+972533403449',
            phone: '+972533403449',
            description: 'Приветствие'
        },
        {
            message: 'כמה עולה טרמינל?',
            sessionId: 'sms:+972533403449',
            phone: '+972533403449',
            description: 'Вопрос о цене терминала'
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 Тест: ${testCase.description}`);
        console.log(`💬 SMS: "${testCase.message}"`);
        console.log(`${'='.repeat(60)}\n`);

        try {
            const result = await conversationEngine.processMessage(
                testCase.message,
                testCase.sessionId,
                'sms',
                testCase.phone
            );

            console.log('\n✅ Результат:');
            console.log('📤 Ответ бота:', result.text);
            console.log('📏 Длина ответа:', result.text.length, 'символов');

            // Проверка длины SMS
            if (result.text.length > 160) {
                const segments = Math.ceil(result.text.length / 160);
                console.log(`⚠️ Сообщение будет разбито на ${segments} SMS сегмента`);
            } else {
                console.log('✅ Сообщение помещается в 1 SMS');
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
testSMSMessage().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});
