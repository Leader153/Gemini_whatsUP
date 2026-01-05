const { calendar } = require('@googleapis/calendar');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
require('dotenv').config();

/**
 * Инициализация клиента Google Calendar с Service Account
 */
async function getCalendarClient() {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './calendar/service-account-key.json';
    const absoluteKeyPath = path.resolve(keyPath);

    const authClient = new GoogleAuth({
        keyFile: absoluteKeyPath,
        scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const client = await authClient.getClient();
    const calendarClient = calendar({ version: 'v3', auth: client });

    return calendarClient;
}

/**
 * Проверка доступности времени в календаре
 * @param {string} date - Дата в формате YYYY-MM-DD
 * @param {number} duration - Длительность в часах (1, 2 или 3)
 * @returns {Promise<Array>} - Массив свободных временных слотов
 */
async function checkAvailability(date, duration = 3) {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        // Границы рабочего дня (8:00 - 20:00)
        const dayStart = new Date(date);
        dayStart.setHours(8, 0, 0, 0);

        const dayEnd = new Date(date);
        dayEnd.setHours(20, 0, 0, 0);

        // Запрос занятости
        const freeBusyResponse = await calendar.freebusy.query({
            requestBody: {
                timeMin: dayStart.toISOString(),
                timeMax: dayEnd.toISOString(),
                items: [{ id: calendarId }],
            },
        });

        const busySlots = (freeBusyResponse.data.calendars[calendarId].busy || [])
            .map(slot => ({
                start: new Date(slot.start),
                end: new Date(slot.end)
            }))
            .sort((a, b) => a.start - b.start);

        // Находим свободные интервалы (Inversion of busy slots)
        const freeRanges = [];
        let currentStart = dayStart;

        busySlots.forEach(busy => {
            if (busy.start > currentStart) {
                // Если между текущим началом и следующим занятым слотом есть время
                const diffMs = busy.start - currentStart;
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours >= duration) {
                    freeRanges.push({ start: new Date(currentStart), end: new Date(busy.start) });
                }
            }
            // Двигаем текущее начало к концу занятого слота (если он внутри рабочего дня)
            if (busy.end > currentStart) {
                currentStart = new Date(busy.end);
            }
        });

        // Проверяем остаток дня после последнего занятого слота
        if (currentStart < dayEnd) {
            const diffMs = dayEnd - currentStart;
            const diffHours = diffMs / (1000 * 60 * 60);
            if (diffHours >= duration) {
                freeRanges.push({ start: new Date(currentStart), end: new Date(dayEnd) });
            }
        }

        // Форматируем результат для бота
        return freeRanges.map(range => {
            const formatTime = (d) => {
                const h = d.getHours();
                return h.toString(); // "8", "12", "15" и т.д.
            };

            return {
                start: formatTime(range.start),
                end: formatTime(range.end),
                startISO: range.start.toISOString(),
                endISO: range.end.toISOString(),
                displayText: `בין ${formatTime(range.start)} ל-${formatTime(range.end)}` // "между X и Y" на иврите
            };
        });

    } catch (error) {
        console.error('Error checking availability:', error);
        throw error;
    }
}

/**
 * Создание бронирования в календаре
 * @param {string} startDateTime - Начало в формате ISO
 * @param {string} endDateTime - Конец в формате ISO
 * @param {Object} clientInfo - Информация о клиенте
 * @returns {Promise<Object>} - Созданное событие
 */
async function createBooking(startDateTime, endDateTime, clientInfo) {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        const event = {
            summary: `Бронирование яхты Joy-BE - ${clientInfo.name}`,
            description: `Клиент: ${clientInfo.name}\nТелефон: ${clientInfo.phone}\nДлительность: ${clientInfo.duration} час(а)`,
            start: {
                dateTime: startDateTime,
                timeZone: 'Asia/Jerusalem',
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'Asia/Jerusalem',
            },
            attendees: clientInfo.email ? [{ email: clientInfo.email }] : [],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 }, // За день
                    { method: 'popup', minutes: 60 }, // За час
                ],
            },
        };

        const response = await calendar.events.insert({
            calendarId: calendarId,
            requestBody: event,
        });

        console.log('✅ Бронирование создано:', response.data.htmlLink);
        return response.data;

    } catch (error) {
        console.error('Error creating booking:', error);
        throw error;
    }
}

/**
 * Получение списка предстоящих событий
 * @param {number} maxResults - Максимальное количество событий
 * @returns {Promise<Array>} - Массив событий
 */
async function listUpcomingEvents(maxResults = 10) {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: new Date().toISOString(),
            maxResults: maxResults,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        return events.map(event => ({
            id: event.id,
            summary: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            description: event.description,
        }));

    } catch (error) {
        console.error('Error listing events:', error);
        throw error;
    }
}

module.exports = {
    checkAvailability,
    createBooking,
    listUpcomingEvents,
    getCalendarClient,
};
