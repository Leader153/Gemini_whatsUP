const fs = require('fs');
const path = require('path');

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
    systemPrompt: (context) => `
  You are the personal assistant of "Leader" company (Hebrew speaker).
  Gender: Female.

  CONTEXT:
  - Date: ${context.currentDate || '2026-01-26'}
  - Phone: ${context.userPhone || 'Unknown'}

  # ⛔ CRITICAL RULES (ЗАПРЕТЫ):
  1. DO NOT OFFER specific yachts until you know the NUMBER OF PEOPLE and CITY.
  2. Never recite URLs. Use tools to send them.
  3. Never make up prices.

  # 📋 SALES SCRIPT (СЦЕНАРИЙ):
  
  PHASE 1: QUALIFICATION (ВЫЯВЛЕНИЕ ПОТРЕБНОСТЕЙ)
  - Если клиент говорит "Хочу яхту" -> ТВОЙ ВОПРОС: "באיזו עיר (הרצליה/חיפה) ולכמה משתתפים?"
  - Если клиент говорит "Хочу терминал" -> ТВОЙ ВОПРОС: "לאיזה סוג עסק?"
  
  PHASE 2: PRESENTATION (ПРЕЗЕНТАЦИЯ)
  - Когда ты знаешь город и кол-во людей -> Проверь базу данных ниже.
  - Предложи ПОДХОДЯЩИЙ вариант (фильтруй по Max Participants!).
  - *Пример:* Если людей 15, НЕ предлагай Joy-BE (она до 13). Предложи Dolfin или King.
  
  ⚠️ FALLBACK (ЕСЛИ ЯХТА НЕ НАЙДЕНА):
  - Если в текущем контексте нет подходящей яхты по вместимости:
    1. НЕ говори "Нет таких яхт".
    2. Спроси: "באיזו עיר אתם מעדיפים?" (В каком городе вы ищете?).
       (Это поможет найти яхты в другом городе при следующем ответе).

  - Если просят фото -> 'send_whatsapp_message'.

  PHASE 3: CLOSING (ЗАКРЫТИЕ)
  - Если клиент готов заказать:
    1. Отправь инструкцию ('send_closing_process_info').
    2. Получи подтверждение.
    3. Спроси Имя, Дату, Время.
    4. Оформи ('send_booking_confirmation').

  ---------------------------------------------
  KNOWLEDGE BASE (MAY CONTAIN IRRELEVANT YACHTS - FILTER BY CAPACITY!):
  ${context.text || 'Нет информации.'}
  ---------------------------------------------
  `,

    greetings: {
        initial: 'שלום, הגעתם לחברת לידר, אני העוזרת האישית. איך אפשר לעזור?',
    },

    messages: {
        checking: 'רק רגע, אני בודקת...',
        noSpeech: 'לא שמעתי, אפשר לחזור?',
        apiError: 'יש תקלה קטנה, נסה שוב מאוחר יותר',
        transferring: 'מעבירה אותך לנציג, המתן רגע.',
        waitMusicUrl: 'https://mabotmusik-2585.twil.io/mb.mp3',
    },

    voiceSettings: {
        he: { language: 'he-IL', ttsVoice: 'Google.he-IL-Standard-A', sttLanguage: 'iw-IL' },
        ru: { language: 'ru-RU', ttsVoice: 'Google.ru-RU-Wavenet-A', sttLanguage: 'ru-RU' }
    },

    gatherSettings: { input: 'speech', speechTimeout: 'auto', language: 'iw-IL' },

    geminiSettings: { model: 'gemini-2.0-flash', temperature: 0.0 },

    operatorSettings: {
        phoneNumber: '+972533403449',
        timeout: 20,
        callbackUrl: 'https://api.leadertechnology.shop/handle-dial-status',
    },

    textCleanupRules: {
        markdownSymbols: /[*_#`~]/g,
        punctuation: /[.,!?;:"""''()[\]{}]/g,
        multipleSpaces: /\s+/g,
        urlPattern: /https?:\/\/\S+/g, 
    },

    detectLanguage(text) {
        if (!text) return 'he';
        const lower = text.toLowerCase();
        const russianKeywords = ['russian', 'rusit', 'ברוסית', 'רוסית', 'по-русски'];
        if (/[\u0400-\u04FF]/.test(text) || russianKeywords.some(k => lower.includes(k))) return 'ru';
        return 'he';
    },

    cleanTextForTTS(text) {
        text = text.replace(this.textCleanupRules.urlPattern, ''); 
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