const { checkAvailability } = require('./calendarService');

async function testAvailability() {
    console.log('🔍 Тестирование проверки доступности яхты...\n');

    try {
        // Тестовая дата (завтра)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const testDate = tomorrow.toISOString().split('T')[0];

        console.log(`📅 Проверка доступности на ${testDate}\n`);

        // Проверка для разных длительностей
        for (const duration of [1, 2, 3]) {
            console.log(`⏱️  Длительность: ${duration} час(а)`);

            const availableSlots = await checkAvailability(testDate, duration);

            if (availableSlots.length === 0) {
                console.log(`   ❌ Нет свободных слотов\n`);
            } else {
                console.log(`   ✅ Найдено ${availableSlots.length} свободных слотов:`);
                availableSlots.forEach((slot, index) => {
                    console.log(`      ${index + 1}. ${slot.start} - ${slot.end}`);
                });
                console.log();
            }
        }

        console.log('✅ Тест завершен успешно!\n');

    } catch (error) {
        console.error('❌ Ошибка при проверке доступности:');
        console.error(error.message);
        console.error('\n📖 Убедитесь, что Google Calendar API настроен правильно\n');
        process.exit(1);
    }
}

// Запуск теста
testAvailability();
