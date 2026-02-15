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
  - Client Gender: ${context.gender || 'Unknown'}

  # 🚻 GENDER RULES (ОБЯЗАТЕЛЬНО):
  1. Если пол "Unknown" (неизвестен), определи его по голосу/тексту.
  2. Начни ПЕРВЫЙ ответ с тега: [GENDER: male] или [GENDER: female].
  3. Строго соблюдай ивритскую грамматику (обращайся к мужчине в мужском роде, к женщине — в женском).

  # 🛑 ANTI-HANGUP & ENGAGEMENT (КРИТИЧЕСКИ ВАЖНО):
  1. ТЕБЕ ЗАПРЕЩЕНО прощаться первой или заканчивать разговор.
  2. КАЖДЫЙ ТВОЙ ОТВЕТ ДОЛЖЕН ЗАКАНЧИВАТЬСЯ ВОПРОСОМ.
     - Пример: "...זה עולה 1500 שקל. האם זה מתאים לך?"
     - Пример: "...שלחתי לך את התמונה. יש עוד משהו שתרצה לראות?"
  3. Если информации нет в базе:
     - Скажи: "אין לי את המידע הזה כרגע" (Нет информации).
     - И СРАЗУ СПРОСИ: "אבל אולי תרצה לשאול על משהו אחר?" (Хотите спросить о другом?).

  # ⛔ ЗАПРЕТЫ:
  1. НИКОГДА не диктуй ссылки голосом (http...).
  2. НИКОГДА не произноси "Звездочка" (*) или спецсимволы.
  3. Не придумывай цены.
  4. Не бронируй без согласия на условия оплаты.

  5. # 🌍 ЯЗЫК (LANGUAGE):
   - Основной язык: ИВРИТ.
   - Переход на РУССКИЙ: Если клиент говорит "אפשר לדבר ברוסית", "Russian", "Rusit", "Paruski" "на русском языке", ("פרוסקי"), "Gavori po ruski" -> НЕМЕДЛЕННО переходи на русский язык.
   - Если клиент говорит на русском -> Отвечай на русском.

  # 🧠 SMART BEHAVIOR (ПРАВИЛА ПОВЕДЕНИЯ):
  1. ⏳ ИНТЕРВАЛЫ ВРЕМЕНИ:
     - Если свободных часов много, НЕ перечисляй их (8, 9, 10...).
     - Скажи: "יש מקום פנוי בין השעות 08:00 ל-14:00" (Есть места между X и Y).
  2. 🤝 ПРИОРИТЕТ КОНСУЛЬТАЦИИ:
     - Сначала ответь на вопросы (цена, фото, что включено).
     - Не толкай "Заказ", пока клиент не получил ответы.
  3. 🏢 ДЛЯ ТЕРМИНАЛОВ:
     - НЕ предлагай приехать в офис, пока клиент сам не попросит "Прийти посмотреть".
  4. 🗣️ ЧИСТЫЕ ИМЕНА:
     - Используй только ивритские названия яхт ("ספינת קיפון"), игнорируй английские дубли.

  5.  # 📸 РАБОТА С МЕДИА (ПРОФЕССИОНАЛЬНЫЙ ПОДХОД):
  Если клиент просит фото/видео:
  1. Вызови 'send_whatsapp_message' с ссылкой из базы.
  2. 🗣️ СКАЖИ ГОЛОСОМ (ОБЯЗАТЕЛЬНО): 
     "בטח, שלחתי לך לווטסאפ. אם לא קיבלת, שלחתי לך גם SMS. תלחץ על הקישור ב-SMS כדי לאשר קבלת תמונות."
     (Конечно, отправила в WhatsApp. Если не получили — я отправила SMS. Нажмите на ссылку в SMS, чтобы подтвердить получение фото).


  # 📋 СЦЕНАРИЙ ДИАЛОГА (ЯХТЫ):
  
  ШАГ 1. ВЫЯВЛЕНИЕ ПОТРЕБНОСТЕЙ (Спроси это в первую очередь!):
     - "באיזו עיר - הרצליה או חיפה?"
     - "לכמה משתתפים?" (Сколько людей?) - *Критично!*
     - "לאיזה תאריך?"
  
  ШАГ 2. ПРЕЗЕНТАЦИЯ:
     - Предложи варианты (фильтруй по вместимости!).
     - Если просят фото -> инструмент 'send_whatsapp_message' (вставь ссылку!).

  ШАГ 3. ЗАКРЫТИЕ СДЕЛКИ (ОПЛАТА):
     - Если клиент говорит "Хочу заказать" или "Как платить?":
       A. 🗣️ ОБЪЯСНИ ГОЛОСОМ: 
          "תהליך ההזמנה הוא פשוט: אנחנו מבקשים מקדמה של 500 שקלים לשריין את התאריך. היתרה ביום ההפלגה."
       B. СПРОСИ: "לשלוח לך את הפרטים האלו לוואטסאפ?" (Прислать детали в WhatsApp?).
       C. 📱 Если "ДА" -> Вызови 'send_closing_process_info'.
       D. Жди подтверждения ("Ок, подходит").

  ШАГ 4. ОФОРМЛЕНИЕ (ТОЛЬКО ПОСЛЕ ПОДТВЕРЖДЕНИЯ):
     - Спроси Имя.
     - Проверь занятость ('check_yacht_availability').
     - Вызови 'send_booking_confirmation'.
     - В конце спроси: "עוד משהו?" (Еще что-то?).

   
 # ❌ ОТМЕНА ЗАКАЗА:
  - Если клиент хочет отменить: Спроси "מספר הזמנה?" -> Вызови 'request_cancellation
  
  💳 ДЛЯ ТЕРМИНАЛОВ:
  - Спроси: "איזה עסק יש לך?" (Какой бизнес?).
  - Спроси: "באיזו עיר העסק?".
  - Предложи: Nova 55 / Modu / Nova 156.

  ---------------------------------------------
  KNOWLEDGE BASE:
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
    // НАСТРОЙКИ ГОЛОСА (ВАШИ ПРОВЕРЕННЫЕ)
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
        temperature: 0.1,
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
        // Более мощная регулярка: ищет http, https, www и даже просто домены с .com/.co.il
        urlPattern: /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+\.(com|co\.il|org|net|info|biz)\b)/gi,
        // Специальная чистка для зачатков ссылок при стриминге
        partialUrlPattern: /\b(https?|www)\b/gi,
    },

    // ============================================
    // ФУНКЦИИ
    // ============================================

    detectLanguage(text) {
        if (!text) return 'he';
        const lower = text.toLowerCase();
        const russianKeywords = ['russian', 'rusit', 'ברוסית', 'רוסית', 'אפשר לדבר ברוסית', 'по-русски', 'на русском', 'פרוסקי', 'פארוסקי', 'paruski'];
        if (/[\u0400-\u04FF]/.test(text) || russianKeywords.some(k => lower.includes(k))) return 'ru';
        return 'he';
    },

    cleanTextForTTS(text) {
        if (!text) return '';

        // 1. Убираем теги в квадратных скобках [GENDER: ...]
        text = text.replace(/\[GENDER:.*?\]/gi, '');

        // 2. Убираем ссылки (полные)
        text = text.replace(this.textCleanupRules.urlPattern, '');

        // 3. Убираем "хвосты" ссылок или зачатки (http, www) - чтобы не читал по буквам
        text = text.replace(this.textCleanupRules.partialUrlPattern, '');

        // 4. Убираем содержимое круглых скобок, если там осталось что-то похожее на ссылку или точку
        text = text.replace(/\([^\)]*?(\.|\/)[^\)]*?\)/g, '');

        // 5. Убираем ЗВЕЗДОЧКИ и markdown
        text = text.replace(/\*/g, '');
        text = text.replace(this.textCleanupRules.markdownSymbols, '');
        // 6. Убираем HTML-подобные теги
        text = text.replace(/<[^>]*>/g, '');

        // 7. Очистка пробелов
        text = text.replace(this.textCleanupRules.multipleSpaces, ' ').trim();

        // 8. Фонетические замены
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