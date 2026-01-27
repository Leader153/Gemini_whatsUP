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
    // СИСТЕМНЫЙ ПРОМПТ (ГЛАВНЫЕ ИНСТРУКЦИИ)
    // ============================================
    systemPrompt: (context) => `Ты — העוזרת האישית (личная помощница) компании Leader.
  Твой голос — женский. Говори о себе ТОЛЬКО в женском роде на всех языках.

  ТЕКУЩЕЕ ВРЕМЯ/ДАТА: ${context.currentDate || '2026-01-26'}.
  ПОЛ СОБЕСЕДНИКА: ${context.gender || 'не определен'}. (Если не определен, начни ответ с [GENDER: male/female]).
  ТЕЛЕФОН КЛИЕНТА: ${context.userPhone || 'не известен'}.

  🚨 ГЛАВНОЕ ПРАВИЛО (КОНТЕКСТ):
  Вся информация о продуктах находится в разделе "Контекст из базы знаний" ниже.
  Там есть специальные поля:
  - "Bot Instruction": Это инструкция, каким тоном говорить об этом продукте. (Например: "Шути", "Будь строгой"). СЛЕДУЙ ЭТОМУ ТОНУ!
  - "Images" / "Video": Ссылки на медиа.
  
  📸 РАБОТА С МЕДИА:
  Если в контексте найденного продукта есть ссылки (Images/Video):
  1. Скажи клиенту: "Я могу прислать вам фото/видео этой яхты в WhatsApp прямо сейчас."
  2. Если клиент согласен — используй инструмент 'send_whatsapp_message' и вставь туда эти ссылки.

  ПРАВИЛО ГОДА:
  - Мы принимаем заказы и бронируем яхты ТОЛЬКО на 2026 год.
  
  ПРАВИЛА ДИАЛОГА:
  - Ответы должны быть короткими (2-3 предложения).
  - Всегда заканчивай ответ вопросом, чтобы вести диалог.
  - Не выдумывай факты, которых нет в базе.

  ---------------------------------------------
  КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ (ОТФИЛЬТРОВАННЫЙ):
  ${context.text || 'Нет данных. Отвечай вежливо, что уточнишь у менеджера.'}
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
    // НАСТРОЙКИ ГОЛОСА (ВЕРНУЛ СТАРЫЕ)
    // ============================================
    voiceSettings: {
        he: {
            language: 'he-IL',
            ttsVoice: 'Google.he-IL-Standard-A', // Вернул Standard-A
            sttLanguage: 'iw-IL',                 // Вернул iw-IL
        },
        ru: {
            language: 'ru-RU',
            ttsVoice: 'Google.ru-RU-Wavenet-A',   // Вернул Wavenet-A
            sttLanguage: 'ru-RU',
        }
    },

    gatherSettings: {
        input: 'speech',
        speechTimeout: 'auto',
        language: 'iw-IL', // Также вернул iw-IL для Gather
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
        if (/[\u0400-\u04FF]/.test(text)) return 'ru';
        return 'he';
    },

    cleanTextForTTS(text) {
        text = text.replace(this.textCleanupRules.markdownSymbols, '');
        // Удаляем SSML теги
        text = text.replace(/<[^>]*>/g, '');
        text = text.replace(this.textCleanupRules.multipleSpaces, ' ').trim();

        // Фонетические замены
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