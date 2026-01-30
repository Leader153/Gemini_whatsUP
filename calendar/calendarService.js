const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

let authClientInstance = null;

// --- СЛОВАРЬ СИНОНИМОВ (ALIASES) ---
const YACHT_ALIASES = {
    // Герцлия
    'Joy-BE': ['JOY', 'Joy', 'ג\'וי', 'JOYB', 'joy', 'גוי בי', 'Joy-BE'],
    'Louse Yacht': ['Louse', 'Loise', 'לואיז', 'Luize', 'לויז', 'Louise'],
    'Dolfin': ['Dolfin', 'Dolphin', 'דולפין', 'עסוק/ה'],
    'Lee-Yam': ['Lee-Yam', 'Lee Yam', 'לי ים', 'leeyam', 'לי-ים'],
    'Bagira': ['Bagira', 'בגירה'],
    
    // Хайфа
    'Kaifun': ['Kaifun', 'קיפון', 'Caifun'],
    'Katamaran': ['Katamaran', 'קטמרן', 'Catamaran'],
    'King': ['King', 'קינג'],
    'Yami': ['Yami', 'יאמי'],
    'Sea-u': ['Sea-u', 'סי יו', 'Sea u', 'סי-יו']
};

async function getCalendarClient() {
    if (authClientInstance) return google.calendar({ version: 'v3', auth: authClientInstance });

    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './calendar/service-account-key.json';
    const absoluteKeyPath = path.resolve(process.cwd(), keyPath);

    try {
        const auth = new GoogleAuth({
            keyFile: absoluteKeyPath,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        authClientInstance = await auth.getClient();
        return google.calendar({ version: 'v3', auth: authClientInstance });
    } catch (error) {
        console.error(`❌ Ошибка ключа: ${absoluteKeyPath}`);
        throw error;
    }
}

/**
 * Проверка, относится ли событие к указанной яхте
 */
function isEventForYacht(eventSummary, targetYachtName) {
    if (!eventSummary) return false;
    
    const summaryLower = eventSummary.toLowerCase();
    
    // 1. Проверяем точное совпадение
    if (summaryLower.includes(targetYachtName.toLowerCase())) return true;

    // 2. Ищем название яхты в словаре синонимов
    const dbNameKey = Object.keys(YACHT_ALIASES).find(key => 
        targetYachtName.toLowerCase().includes(key.toLowerCase()) || 
        key.toLowerCase().includes(targetYachtName.toLowerCase())
    );

    if (dbNameKey && YACHT_ALIASES[dbNameKey]) {
        const aliases = YACHT_ALIASES[dbNameKey];
        return aliases.some(alias => summaryLower.includes(alias.toLowerCase()));
    }

    return false;
}

async function checkAvailability(date, duration = 2, yachtName) {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        const dayStart = new Date(date);
        dayStart.setHours(8, 0, 0, 0);
        
        const dayEnd = new Date(date);
        dayEnd.setHours(20, 0, 0, 0);

        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: 'Asia/Jerusalem'
        });

        const allEvents = response.data.items || [];
        
        // ФИЛЬТРАЦИЯ: Оставляем только события для ЭТОЙ яхты
        const busySlots = allEvents
            .filter(event => isEventForYacht(event.summary, yachtName))
            .map(event => ({
                start: new Date(event.start.dateTime || event.start.date),
                end: new Date(event.end.dateTime || event.end.date)
            }))
            .sort((a, b) => a.start - b.start);

        const freeRanges = [];
        let currentStart = new Date(dayStart);

        for (const busy of busySlots) {
            if (busy.start > currentStart) {
                const diffMs = busy.start - currentStart;
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours >= duration) {
                    freeRanges.push({ start: new Date(currentStart), end: new Date(busy.start) });
                }
            }
            if (busy.end > currentStart) {
                currentStart = new Date(busy.end);
            }
        }

        if (currentStart < dayEnd) {
            const diffMs = dayEnd - currentStart;
            const diffHours = diffMs / (1000 * 60 * 60);
            if (diffHours >= duration) {
                freeRanges.push({ start: new Date(currentStart), end: new Date(dayEnd) });
            }
        }

        return freeRanges.map(range => {
            const formatTime = (d) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
            return {
                start: formatTime(range.start),
                end: formatTime(range.end),
                startISO: range.start.toISOString(),
                displayText: `בין ${formatTime(range.start)} ל-${formatTime(range.end)}`
            };
        });

    } catch (error) {
        console.error('❌ Ошибка Calendar API:', error.message);
        return [];
    }
}

async function createBooking(startDateTime, endDateTime, clientInfo) {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        const summary = `${clientInfo.yachtName} - ${clientInfo.name}`;
        
        const description = `
        לקוח: ${clientInfo.name}
        טלפון: ${clientInfo.phone}
        יאכטה: ${clientInfo.yachtName}
        משך: ${clientInfo.duration} שעות
        נוצר ע"י בוט
        `;

        const event = {
            summary: summary,
            description: description.trim(),
            start: { dateTime: startDateTime, timeZone: 'Asia/Jerusalem' },
            end: { dateTime: endDateTime, timeZone: 'Asia/Jerusalem' },
        };

        const response = await calendar.events.insert({
            calendarId: calendarId,
            requestBody: event,
        });

        console.log('✅ Event Created:', response.data.htmlLink);
        return response.data;

    } catch (error) {
        console.error('❌ Booking Error:', error);
        throw error;
    }
}

async function isSlotAvailable(startDateTime, endDateTime, yachtName) {
    try {
        const calendar = await getCalendarClient();
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: new Date(startDateTime).toISOString(),
            timeMax: new Date(endDateTime).toISOString(),
            singleEvents: true,
            timeZone: 'Asia/Jerusalem'
        });

        const events = response.data.items || [];
        const conflicts = events.filter(e => isEventForYacht(e.summary, yachtName));

        return conflicts.length === 0;

    } catch (error) {
        console.error('❌ Slot Check Error:', error);
        return false; 
    }
}

module.exports = {
    checkAvailability,
    createBooking,
    isSlotAvailable,
    getCalendarClient // Экспортируем, если нужно для других целей
};