const fs = require('fs');
const path = require('path');

// Загрузка фонетических замен
let transcriptions = {};
try {
    const transcriptionsPath = path.join(__dirname, 'transcriptions.json');
    if (fs.existsSync(transcriptionsPath)) {
        transcriptions = JSON.parse(fs.readFileSync(transcriptionsPath, 'utf8'));
        console.log('✅ Загружено фонетических замен:', Object.keys(transcriptions).length);
    }
} catch (error) {
    console.error('❌ Ошибка загрузки transcriptions.json:', error);
}

const botBehavior = {
    // ============================================
    // СИСТЕМНЫЙ ПРОМПТ
    // ============================================
    systemPrompt: (context) => `Ты — העוזרת האישית (личная помощница) компании Leader.
  Твой голос — женский. Говори о себе ТОЛЬКО в женском роде.

  ТЕКУЩЕЕ ВРЕМЯ: ${context.currentDate || '2026-01-26'}.
  ПОЛ: ${context.gender || 'не определен'}. (Если не определен, начни с [GENDER: male/female]).
  ТЕЛЕФОН: ${context.userPhone || 'не известен'}.

  📸 ИНСТРУКЦИЯ ПО ОТПРАВКЕ МЕДИА (КРИТИЧНО):
  Если клиент просит фото или видео:
  1. Найди ссылку (начинается на https://) в поле "Images" или "Video" в контексте ниже.
  2. Вызови инструмент 'send_whatsapp_message'.
  3. ⚠️ ВАЖНО: Ты ОБЯЗАНА написать саму ссылку ВНУТРИ текста сообщения (messageBody).
  4. НЕ пиши просто "Вот фото". Пиши: "הנה התמונה: https://your-link.com/image.jpg".
  5. Если ты не напишешь ссылку текстом, клиент НИЧЕГО не получит.

  📋 СБОР ДАННЫХ (СЦЕНАРИЙ ПРОДАЖ):
  📍 ЯХТЫ:
  1. Выясни: "לכמה משתתפים?" (Сколько людей?), "באיזו עיר?" (Герцлия/Хайфа?), "לאיזה תאריך?".
  2. Предложи варианты.
  3. Если просят фото -> send_whatsapp_message (ВСТАВЬ ССЫЛКУ!).
  4. Бронь/Встреча -> только по просьбе клиента.

  💳 ТЕРМИНАЛЫ:
  1. Спроси: "Для какого бизнеса?", "Где вы находитесь?".

  📍 АДРЕСА (ЗНАЙ НАИЗУСТЬ):
  - ХАЙФА: מעגן הדייג שביט , ליד פארק קישון
  - ГЕРЦЛИЯ (Яхты): מרינה הרצליה, ליד קניון ארנה
  - ГЕРЦЛИЯ (Офис/Терминалы): הרצליה, רח' אריק איינשטיין, מס' 3

  🚨 ПРАВИЛА:
  - Используй только данные из базы.
  - Говори на ИВРИТЕ (русский только по просьбе).
  - Работаем только с 2026 годом.
  - Ответы короткие (2-3 фразы) + Вопрос.

  ---------------------------------------------
  КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:
  ${context.text || 'Нет информации.'}
  ---------------------------------------------
  `,

    // ============================================
    // ПРИВЕТСТВИЕ
    // ============================================
    greetings: {
        initial: 'שלום, הגעתם לחברת לידר, אני העוזרת האישית. איך אפשר לעזור?',
    },

    // ============================================
    // СООБЩЕНИЯ
    // ============================================
    messages: {
        checking: 'רק רגע, אני בודקת...',
        noSpeech: 'לא שמעתי, אפשר לחזור?',
        apiError: 'יש תקלה קטנה, נסה שוב מאוחר יותר',
        transferring: 'מעבירה אותך לנציג, המתן רגע.',
        waitMusicUrl: 'https://mabotmusik-2585.twil.io/mb.mp3',
    },

    // ============================================
    // НАСТРОЙКИ ГОЛОСА
    // ============================================
    voiceSettings: {
        he: {
            language: 'he-IL',
            ttsVoice: 'Google.he-IL-Standard-A',
            sttLanguage: 'iw-IL',
        },
        ru: {
            language: 'ru-RU',
            ttsVoice: 'Google.ru-RU-Wavenet-A',
            sttLanguage: 'ru-RU',
        }
    },

    gatherSettings: {
        input: 'speech',
        speechTimeout: 'auto',
        language: 'iw-IL',
    },

    geminiSettings: {
        model: 'gemini-2.0-flash',
        temperature: 0.2, 
    },

    operatorSettings: {
        phoneNumber: '+972533403449',
        timeout: 20,
        callbackUrl: 'https://api.leadertechnology.shop/handle-dial-status',
    },

    textCleanupRules: {
        markdownSymbols: /[*_#`~]/g,
        punctuation: /[.,!?;:"""''()[\]{}]/g,
        multipleSpaces: /\s+/g,
    },

    // ============================================
    // ФУНКЦИИ
    // ============================================

    detectLanguage(text) {
        if (!text) return 'he';
        const lower = text.toLowerCase();
        const russianKeywords = ['russian', 'rusit', 'ברוסית', 'רוסית', 'по-русски'];
        if (/[\u0400-\u04FF]/.test(text) || russianKeywords.some(k => lower.includes(k))) return 'ru';
        return 'he';
    },

    cleanTextForTTS(text) {
        text = text.replace(this.textCleanupRules.markdownSymbols, '');
        text = text.replace(/<[^>]*>/g, '');
        text = text.replace(this.textCleanupRules.multipleSpaces, ' ').trim();

        Object.keys(transcriptions).forEach(word => {
            if (text.includes(word)) {
                const replacement = transcriptions[word];
                const regex = new RegExp(word, 'g');
                text = text.replace(regex, replacement);
            }
        });
        return text;
    },

    getSystemPrompt(context, gender = null, currentDate = null, userPhone = null) {
        return this.systemPrompt({ text: context, gender: gender, currentDate: currentDate, userPhone: userPhone });
    },

    getGreeting() { return this.greetings.initial; },

    getMessage(type) {
        return this.messages[type] || this.greetings[type] || 'שגיאה במערכת';
    },
};

module.exports = botBehavior;