// ============================================================
// botBehavior.js — Nayax Smart IVR (PoC)
// Рефакторинг: убрана логика яхт/бронирований/RAG.
// Теперь бот — чистый маршрутизатор звонков.
// ============================================================

// ============================================
// СЛОВАРЬ МАРШРУТОВ (Routing Dictionary)
// ============================================
const ROUTING_TABLE = {
    REDIRECT_TECH:    '+972533403449', // 🧪 TEST — заменить на реальный номер техподдержки
    REDIRECT_FINANCE: '+972533403449', // 🧪 TEST — заменить на реальный номер финансов/продаж
};

const botBehavior = {

    // ============================================
    // СИСТЕМНЫЙ ПРОМПТ (Nayax IVR)
    // ============================================
    systemPrompt: () => `
אתה נתב שיחות קולי חכם (AI IVR) של חברת Nayax. השם שלך הוא MaBot.
המטרה היחידה שלך היא להבין מה הלקוח צריך ולהעביר את השיחה למחלקה הנכונה.
אסור לך לנסות לפתור תקלות בעצמך!

1. זיהוי תמיכה טכנית (Technical Support):
אם הלקוח מתאר בעיה טכנית (למשל: "המסוף נתקע", "שגיאת תקשורת")
* אמור לו: "אני מבין שמדובר בתקלה טכנית. אני מעביר אותך לצוות התמיכה."
* מיד לאחר מכן פלוט את פקודת המערכת: [REDIRECT_TECH]

2. זיהוי הנהלת חשבונות / מכירות (Finance & General):
אם הלקוח מדבר על כספים, חשבוניות או מבקש נציג כללי (למשל: "עמלות", "זיכוי", "אני צריך נציג")
* אמור לו: "אני מזהה שהשאלה נוגעת לכספים או שירות לקוחות. אני מעביר אותך כעת."
* מיד לאחר מכן פלוט את פקודת המערכת: [REDIRECT_FINANCE]

היה קצר, ענייני ומנומס. אל תשתמש בהסברים ארוכים.
`,

    // ============================================
    // ПРИВЕТСТВИЕ (только иврит — Nayax)
    // ============================================
    greetings: {
        initial: 'שלום, הגעת לשירות הלקוחות של Nayax. אני MaBot, העוזר החכם שלך. איך אוכל לעזור לך היום?',
    },

    // ============================================
    // СООБЩЕНИЯ СИСТЕМЫ
    // ============================================
    messages: {
        checking:     'רק רגע, אני בודק...',
        noSpeech:     'לא שמעתי, אפשר לחזור?',
        apiError:     'יש תקלה קטנה, נסה שוב מאוחר יותר.',
        transferring: 'מעביר אותך, אנא המתן.',
        waitMusicUrl: 'https://mabotmusik-2585.twil.io/mb.mp3',
    },

    // ============================================
    // НАСТРОЙКИ ГОЛОСА (иврит — основной)
    // ============================================
    voiceSettings: {
        he: {
            language:    'he-IL',
            ttsVoice:    'Google.he-IL-Standard-A',
            sttLanguage: 'iw-IL',
        },
        ru: {
            language:    'ru-RU',
            ttsVoice:    'Google.ru-RU-Wavenet-A',
            sttLanguage: 'ru-RU',
        },
    },

    gatherSettings: {
        input:         'speech',
        speechTimeout: 'auto',
        language:      'iw-IL',
    },

    geminiSettings: {
        model:       'gemini-2.0-flash',
        temperature: 0.1,
    },

    // ============================================
    // НАСТРОЙКИ ОПЕРАТОРА (fallback)
    // ============================================
    operatorSettings: {
        phoneNumber: '+972533403449', // 🧪 TEST — fallback-номер
        timeout:     20,
    },

    textCleanupRules: {
        markdownSymbols: /[*_#`~]/g,
        multipleSpaces:  /\s+/g,
        urlPattern:      /https?:\/\/\S+/g,
    },

    // ============================================
    // СЛОВАРЬ МАРШРУТОВ — экспортируется для Interceptor
    // ============================================
    routingTable: ROUTING_TABLE,

    // ============================================
    // ФУНКЦИИ
    // ============================================

    /**
     * Определение языка по тексту
     */
    detectLanguage(text) {
        if (!text) return 'he';
        const lower = text.toLowerCase();
        const russianKeywords = [
            'russian', 'rusit', 'ברוסית', 'רוסית',
            'по-русски', 'на русском', 'paruski'
        ];
        if (/[\u0400-\u04FF]/.test(text) || russianKeywords.some(k => lower.includes(k))) return 'ru';
        return 'he';
    },

    /**
     * Очистка текста для TTS (удаляем Markdown, URL, метки маршрутизации)
     */
    cleanTextForTTS(text) {
        if (!text) return '';
        // Убираем метки маршрутизации (на случай если Interceptor пропустил)
        text = text.replace(/\[REDIRECT_TECH\]/gi, '');
        text = text.replace(/\[REDIRECT_FINANCE\]/gi, '');
        // Убираем URL
        text = text.replace(this.textCleanupRules.urlPattern, '');
        // Убираем Markdown
        text = text.replace(/\*/g, '');
        text = text.replace(this.textCleanupRules.markdownSymbols, '');
        // Убираем HTML-теги
        text = text.replace(/<[^>]*>/g, '');
        // Нормализуем пробелы
        text = text.replace(this.textCleanupRules.multipleSpaces, ' ').trim();
        return text;
    },

    /**
     * Получить системный промпт (без RAG-контекста — не нужен)
     */
    getSystemPrompt() {
        return this.systemPrompt();
    },

    getGreeting() {
        return this.greetings.initial;
    },

    getMessage(type) {
        return this.messages[type] || this.greetings[type] || 'שגיאה במערכת';
    },

    /**
     * Получить номер телефона по ключу маршрута
     * @param {string} routeKey — 'REDIRECT_TECH' | 'REDIRECT_FINANCE'
     * @returns {string|null} — номер телефона или null
     */
    getRoutePhone(routeKey) {
        return this.routingTable[routeKey] || null;
    },
};

module.exports = botBehavior;