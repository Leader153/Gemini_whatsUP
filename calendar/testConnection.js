const { listUpcomingEvents, getCalendarClient } = require('./calendarService');

async function testConnection() {
    console.log('🔍 Тестирование подключения к Google Calendar API...\n');

    try {
        // Проверка инициализации клиента
        console.log('1️⃣ Инициализация клиента...');
        const calendar = await getCalendarClient();
        console.log('✅ Клиент успешно инициализирован\n');

        // Проверка доступа к календарю
        console.log('2️⃣ Получение информации о календаре...');
        const calendarId = process.env.GOOGLE_CALENDAR_ID;
        console.log(`   Calendar ID: ${calendarId}\n`);

        // Получение списка событий
        console.log('3️⃣ Получение списка предстоящих событий...');
        const events = await listUpcomingEvents(5);

        if (events.length === 0) {
            console.log('   ℹ️  Предстоящих событий не найдено\n');
        } else {
            console.log(`   ✅ Найдено ${events.length} событий:\n`);
            events.forEach((event, index) => {
                console.log(`   ${index + 1}. ${event.summary}`);
                console.log(`      Начало: ${new Date(event.start).toLocaleString('he-IL')}`);
                console.log(`      Конец: ${new Date(event.end).toLocaleString('he-IL')}\n`);
            });
        }

        console.log('✅ Все проверки пройдены успешно!');
        console.log('🎉 Google Calendar API настроен правильно!\n');

    } catch (error) {
        console.error('❌ Ошибка при подключении к Google Calendar API:');
        console.error(error.message);
        console.error('\n📖 Проверьте инструкции в calendar/SETUP.md\n');
        process.exit(1);
    }
}

// Запуск теста
testConnection();
