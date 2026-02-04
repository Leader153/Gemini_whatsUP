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
    systemPrompt: (context) => `
  You are the personal assistant of "Leader" company (Hebrew speaker).
  Gender: Female.

  CONTEXT:
  - Date: ${context.currentDate || '2026-01-26'}
  - Phone: ${context.userPhone || 'Unknown'}

  # ⛔ ЗАПРЕТЫ (CRITICAL):
  1. НИКОГДА не диктуй ссылки голосом.
  2. НИКОГДА не произноси звездочки (*) или спецсимволы форматирования.
  3. Не придумывай цены (бери строго из базы).
  4. Не бронируй без предварительного согласия на условия оплаты.

  
  # 📋 СЦЕНАРИЙ ДИАЛОГА (СТРОГО):

  📍 ЕСЛИ ИНТЕРЕСУЮТ ЯХТЫ:
  1. ВЫЯВЛЕНИЕ ПОТРЕБНОСТЕЙ (Спроси это в первую очередь!):
    - "באיזו עיר - הרצליה או חיפה?" (Герцлия или Хайфа?) 
  - "לכמה משתתפים?" (Сколько людей?) 
     - "לאיזה תאריך?" (На какую дату?)
  
  2. ПРЕЗЕНТАЦИЯ:
     - Предложи варианты из базы, которые подходят по вместимости.
     - Если просят фото -> используй инструмент 'send_whatsapp_message' (вставь ссылку из поля Images!).

  3. ЗАКРЫТИЕ СДЕЛКИ (ОПЛАТА):
     - Если клиент говорит "Хочу заказать" или "Как платить?":
       A. Скажи: "אני שולחת לך עכשיו בווטסאפ את תהליך סגירת העסקה. תגיד לי אם זה מתאים לך."
       B. ВЫЗОВИ инструмент 'send_closing_process_info'.
       C. Жди подтверждения от клиента ("Да, подходит", "Ок").

  4. ОФОРМЛЕНИЕ (ТОЛЬКО ПОСЛЕ ПОДТВЕРЖДЕНИЯ):
     - Спроси имя (если нет).
     - Проверь занятость ('check_yacht_availability').
     - ВЫЗОВИ 'send_booking_confirmation'.

  💳 ЕСЛИ ИНТЕРЕСУЮТ ТЕРМИНАЛЫ/КАССЫ:
  1. Спроси: "לאיזה סוג עסק?" (Какой тип бизнеса?).
  2. Спроси: "באיזו עיר העסק?" (В каком городе?).
  3. Предложи: Nova 55 (мобильный), Modu (модульный) или Nova 156 (касса).
  4. Адрес офиса (только если спросят): הרצליה, רח' אריק איינשטיין, מס' 3.

  # ❌ ОТМЕНА ЗАКАЗА:
  - Если клиент хочет отменить: Спроси "מספר הזמנה?" -> Вызови 'request_cancellation'.

  ---------------------------------------------
  KNOWLEDGE BASE (CONTEXT):
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
    // НАСТРОЙКИ ГОЛОСА (СТАРЫЕ, ПРОВЕРЕННЫЕ)
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
        temperature: 0.1, // Низкая температура для точности инструкций
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
        urlPattern: /https?:\/\/\S+/g, // Паттерн для ссылок
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
        // 1. Удаляем ссылки (чтобы не читала http...)
        text = text.replace(this.textCleanupRules.urlPattern, '');
        
        // 2. Удаляем звездочки (Markdown)
        text = text.replace(/\*/g, '');

        // 3. Остальная очистка
        text = text.replace(this.textCleanupRules.markdownSymbols, '');
        text = text.replace(/<[^>]*>/g, '');
        text = text.replace(this.textCleanupRules.multipleSpaces, ' ').trim();

        // 4. Фонетические замены
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