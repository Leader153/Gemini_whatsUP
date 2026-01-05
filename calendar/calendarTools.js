const { checkAvailability, createBooking } = require('./calendarService');
const { saveOrderToFile } = require('../utils/fileUtils');
const { sendOrderEmail } = require('../utils/emailService');
const { saveClientData } = require('../utils/crmService');


/**
 * Определение инструментов для Gemini Function Calling
 */
const calendarTools = [
    {
        name: 'check_yacht_availability',
        description: 'Проверяет доступность времени для ДЕМОНСТРАЦИИ товара в офисе компании Leader на указанную дату. Возвращает список свободных временных слотов.',
        parameters: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Дата в формате YYYY-MM-DD, обязательно 2026 год. Например, 2026-06-15',
                },
                duration: {
                    type: 'string',
                    description: 'Длительность встречи в часах. По умолчанию "1"',
                    enum: ['1', '2'],
                },
            },
            required: ['date', 'duration'],
        },
    },
    {
        name: 'book_yacht',
        description: 'Записывает клиента на демонстрацию товара в офисе Leader. Требует подтверждения времени, имени и телефона.',
        parameters: {
            type: 'object',
            properties: {
                startDateTime: {
                    type: 'string',
                    description: 'Начало встречи в формате ISO 8601, обязательно 2026 год. Например, 2026-06-15T10:00:00+03:00',
                },
                endDateTime: {
                    type: 'string',
                    description: 'Конец встречи в формате ISO 8601, обязательно 2026 год. Например, 2026-06-15T11:00:00+03:00',
                },
                clientName: {
                    type: 'string',
                    description: 'Имя клиента',
                },
                clientPhone: {
                    type: 'string',
                    description: 'Телефон клиента',
                },
                duration: {
                    type: 'string',
                    description: 'Длительность ("1" или "2")',
                    enum: ['1', '2'],
                },
                clientEmail: {
                    type: 'string',
                    description: 'Email клиента (опционально)',
                },
                has_terminal: {
                    type: 'string',
                    description: 'Ответ на вопрос "У вас уже есть терминал?" (да/нет)',
                },
                business_type: {
                    type: 'string',
                    description: 'Ответ на вопрос "Для какого бизнеса вы ищете решение?"',
                },
                city: {
                    type: 'string',
                    description: 'Ответ на вопрос "В каком городе вы находитесь?"',
                },
                monthly_turnover: {
                    type: 'string',
                    description: 'Примерный месячный оборот по картам',
                },
                current_provider: {
                    type: 'string',
                    description: 'Текущий провайдер эквайринга/терминала',
                },
                points_count: {
                    type: 'string',
                    description: 'Количество необходимых кассовых точек',
                },
                urgency: {
                    type: 'string',
                    description: 'Как срочно требуется установка',
                },
            },
            required: ['startDateTime', 'endDateTime', 'clientName', 'clientPhone', 'duration'],
        },
    },
    {
        name: 'send_order_to_operator',
        description: 'Сохраняет предварительный заказ и отправляет его оператору для подтверждения. Использовать, когда клиент хочет заказать, но точное время еще не согласовано или требуется ручная проверка.',
        parameters: {
            type: 'object',
            properties: {
                clientName: {
                    type: 'string',
                    description: 'Имя клиента',
                },
                clientPhone: {
                    type: 'string',
                    description: 'Телефон клиента',
                },
                date: {
                    type: 'string',
                    description: 'Желаемая дата (YYYY-MM-DD). Всегда используй 2026 год.',
                },
                time: {
                    type: 'string',
                    description: 'Желаемое время (например, "14:00")',
                },
                duration: {
                    type: 'string',
                    description: 'Длительность в часах',
                },
                has_terminal: {
                    type: 'string',
                    description: 'Ответ на вопрос "У вас уже есть терминал?" (да/нет)',
                },
                business_type: {
                    type: 'string',
                    description: 'Ответ на вопрос "Для какого бизнеса вы ищете решение?"',
                },
                city: {
                    type: 'string',
                    description: 'Ответ на вопрос "В каком городе вы находитесь?"',
                },
                monthly_turnover: {
                    type: 'string',
                    description: 'Примерный месячный оборот по картам',
                },
                current_provider: {
                    type: 'string',
                    description: 'Текущий провайдер эквайринга/терминала',
                },
                points_count: {
                    type: 'string',
                    description: 'Количество необходимых кассовых точек',
                },
                urgency: {
                    type: 'string',
                    description: 'Как срочно требуется установка',
                },
            },
            required: ['clientName', 'clientPhone', 'date'],
        },
    },
    {
        name: 'transfer_to_support',
        description: 'Переводит звонок на живого оператора/человека. Используй это, когда пользователь явно просит поговорить с человеком или когда ты не можешь помочь.',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'save_client_data',
        description: 'Сохраняет данные о клиенте (имя, телефон, наличие терминала, тип бизнеса, город) в CRM систему. Использовать после того, как удалось собрать информацию по ходу диалога.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Имя и фамилия клиента',
                },
                phone: {
                    type: 'string',
                    description: 'Номер телефона клиента',
                },
                has_terminal: {
                    type: 'string',
                    description: 'Ответ на вопрос "У вас уже есть терминал?" (да/нет)',
                },
                business_type: {
                    type: 'string',
                    description: 'Ответ на вопрос "Для какого бизнеса вы ищете решение?"',
                },
                city: {
                    type: 'string',
                    description: 'Ответ на вопрос "В каком городе вы находитесь?"',
                },
                monthly_turnover: {
                    type: 'string',
                    description: 'Примерный месячный оборот по картам',
                },
                current_provider: {
                    type: 'string',
                    description: 'Текущий провайдер эквайринга/терминала',
                },
                points_count: {
                    type: 'string',
                    description: 'Количество необходимых кассовых точек',
                },
                urgency: {
                    type: 'string',
                    description: 'Как срочно требуется установка',
                },
            },
            required: ['name', 'phone'],
        },
    }
];

/**
 * Вспомогательная функция для принудительной установки 2026 года в строке даты
 */
function forceYear2026(dateStr) {
    if (!dateStr) return dateStr;
    // Заменяем любой год (например, 2024 или 2025) на 2026
    return dateStr.replace(/^202[0-9]/, '2026');
}

/**
 * Обработчик вызовов функций от Gemini
 * @param {string} functionName - Имя вызываемой функции
 * @param {Object} args - Аргументы функции
 * @returns {Promise<Object>} - Результат выполнения функции
 */
async function handleFunctionCall(functionName, args) {
    console.log(`🔧 Function call: ${functionName}`, args);

    try {
        switch (functionName) {
            case 'check_yacht_availability': {
                let { date, duration } = args;
                date = forceYear2026(date);
                // Конвертируем duration из строки в число
                const durationNum = parseInt(duration, 10);
                const availableSlots = await checkAvailability(date, durationNum);

                if (availableSlots.length === 0) {
                    return {
                        success: true,
                        message: `На ${date} нет свободных слотов для ${durationNum} час(а) аренды.`,
                        availableSlots: [],
                    };
                }

                return {
                    success: true,
                    message: `Найдено ${availableSlots.length} свободных слотов на ${date} для встречи (демонстрация товара). Сверься со списком. Если время подходит, спрашивай имя и телефон для записи.`,
                    availableSlots: availableSlots,
                    date: date,
                    duration: durationNum,
                };
            }

            case 'book_yacht': {
                let { startDateTime, endDateTime, clientName, clientPhone, duration, clientEmail, has_terminal, business_type, city, monthly_turnover, current_provider, points_count, urgency } = args;
                startDateTime = forceYear2026(startDateTime);
                endDateTime = forceYear2026(endDateTime);

                // Конвертируем duration из строки в число
                const durationNum = parseInt(duration, 10);

                const clientInfo = {
                    name: clientName,
                    phone: clientPhone,
                    duration: durationNum,
                    email: clientEmail,
                    has_terminal: has_terminal,
                    business_type: business_type,
                    city: city,
                    monthly_turnover: monthly_turnover,
                    current_provider: current_provider,
                    points_count: points_count,
                    urgency: urgency,
                };

                // 1. Создаем событие в Google Calendar
                console.log('📅 Попытка создания события в Google Calendar...');
                const booking = await createBooking(startDateTime, endDateTime, clientInfo);

                // 2. Также сохраняем заказ в локальный файл
                const orderDetails = {
                    clientName: clientName,
                    clientPhone: clientPhone,
                    date: startDateTime.split('T')[0],
                    time: startDateTime.split('T')[1].substring(0, 5),
                    duration: durationNum,
                    has_terminal: has_terminal,
                    business_type: business_type,
                    city: city,
                    monthly_turnover: monthly_turnover,
                    current_provider: current_provider,
                    points_count: points_count,
                    urgency: urgency,
                };

                const filePath = await saveOrderToFile(orderDetails);

                // 3. Отправляем уведомление на Email
                console.log('📧 Отправка уведомления на Email...');
                await sendOrderEmail({
                    ...orderDetails,
                    status: 'Confirmed in Calendar'
                });

                return {
                    success: true,
                    message: `Встреча для демонстрации успешно назначена в Google Calendar (Ссылка: ${booking.htmlLink}) И сохранена в файл (${filePath}). ОБЯЗАТЕЛЬНО скажи клиенту: "Я записала вас на демонстрацию товара на ${orderDetails.date} в ${orderDetails.time}. Мы находимся в офисе компании Leader. Будем рады вас видеть!"`,
                    booking: {
                        id: booking.id,
                        summary: booking.summary,
                        start: booking.start.dateTime,
                        end: booking.end.dateTime,
                        client: clientName,
                        phone: clientPhone,
                        link: booking.htmlLink,
                        localFile: filePath
                    },
                };
            }

            case 'send_order_to_operator': {
                let { clientName, clientPhone, date, time, duration, has_terminal, business_type, city, monthly_turnover, current_provider, points_count, urgency } = args;
                date = forceYear2026(date);

                const orderDetails = {
                    clientName,
                    clientPhone,
                    date,
                    time,
                    duration,
                    has_terminal,
                    business_type,
                    city,
                    monthly_turnover,
                    current_provider,
                    points_count,
                    urgency
                };

                const filePath = await saveOrderToFile(orderDetails);

                // Отправляем уведомление на Email
                console.log('📧 Отправка уведомления на Email (предзаказ)...');
                await sendOrderEmail(orderDetails);

                return {
                    success: true,
                    message: `Заказ успешно сформирован. ОБЯЗАТЕЛЬНО скажи клиенту следующую фразу: "Ваш заказ принят. Наш оператор свяжется с вами по этому номеру телефона в ближайшее время."`,
                };
            }

            case 'transfer_to_support': {
                return {
                    success: true,
                    shouldTransfer: true,
                    message: 'Перевод звонка на оператора инициирован.',
                };
            }

            case 'save_client_data': {
                return await saveClientData(args);
            }

            default:
                return {
                    success: false,
                    error: `Unknown function: ${functionName}`,
                };
        }
    } catch (error) {
        console.error(`❌ Error in ${functionName}:`, error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Форматирование результата функции для отправки обратно в Gemini
 * @param {Object} result - Результат выполнения функции
 * @returns {string} - Форматированный текст для Gemini
 */
function formatFunctionResult(result) {
    if (!result.success) {
        return `Ошибка: ${result.error}`;
    }

    // Форматируем результат в читаемый текст
    return JSON.stringify(result, null, 2);
}

module.exports = {
    calendarTools,
    handleFunctionCall,
    formatFunctionResult,
};
