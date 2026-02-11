const { handleFunctionCall } = require('../calendar/calendarTools');

async function test() {
    console.log('🧪 Тест 1: Проверка доступности (передаем 2025)');
    const result1 = await handleFunctionCall('check_yacht_availability', {
        date: '2025-05-20',
        duration: '2'
    });
    console.log('Результат (дата должна быть 2026):', result1.date || result1.message);

    console.log('\n🧪 Тест 2: Предзаказ оператору (передаем 2024)');
    // Мы не будем реально отправлять email (зависит от .env), но проверим что логика прошла
    const result2 = await handleFunctionCall('send_order_to_operator', {
        clientName: 'Тест',
        clientPhone: '123',
        date: '2024-12-31',
        time: '14:00',
        duration: '1'
    });
    console.log('Заказ обработан успешно? (проверьте логи выше на наличие 2026)');
}

test().catch(console.error);





