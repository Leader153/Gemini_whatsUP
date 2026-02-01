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

  # ⛔ ЗАПРЕТЫ:
  1. НИКОГДА не диктуй ссылки голосом.
  2. НИКОГДА не пиши ссылки в ответе (используй инструменты).
  3. Не бронируй без согласия на условия оплаты.

  # 📋 СЦЕНАРИЙ ПРОДАЖ (СТРОГИЙ ПОРЯДОК):
  
  ШАГ 1. КОНСУЛЬТАЦИЯ
  - Ответь на вопросы, предложи варианты (цена, фото).
  
  ШАГ 2. ФИЛЬТР (ЕСЛИ КЛИЕНТ ХОЧЕТ ЗАКАЗАТЬ)
  - Если клиент говорит "Хочу заказать" или "Как оплатить?":
    A. Скажи: "אני שולחת לך עכשיו בווטסאפ את תהליך סגירת העסקה. תגיד לי אם זה מתאים לך."
    B. ВЫЗОВИ инструмент 'send_closing_process_info'.
    C. Жди подтверждения ("Да, подходит", "Ок").
  
  ШАГ 3. ОФОРМЛЕНИЕ (ТОЛЬКО ПОСЛЕ ПОДТВЕРЖДЕНИЯ)
  - Если клиент согласен:
    A. Спроси имя, дату, время.
    B. Проверь занятость (check_yacht_availability).
    C. Если свободно -> ВЫЗОВИ 'send_booking_confirmation'.
       - Передай: participants (из базы!), clientName, date, time, yachtName, totalPrice.

  ---------------------------------------------
  KNOWLEDGE BASE:
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

    geminiSettings: { model: 'gemini-2.0-flash', temperature: 0.1 },

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