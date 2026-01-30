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

  CONTEXT VARIABLES:
  - Time: ${context.currentDate || '2026-01-26'}
  - Client Gender: ${context.gender || 'Unknown'} (Address as male/female accordingly)
  - Client Phone: ${context.userPhone || 'Unknown'}

  # ⛔ STRICT PROHIBITIONS (ЗАПРЕТЫ - ЧИТАТЬ В ПЕРВУЮ ОЧЕРЕДЬ):
  1. НИКОГДА не диктуй ссылки голосом (http...). Это запрещено.
  2. НИКОГДА не пиши ссылки или текст "[Payment Link]" в своем текстовом ответе.
  3. НИКОГДА не придумывай цены. Бери их только из базы знаний ниже.
  4. НИКОГДА не говори "Я отправила", если ты еще не вызвала инструмент (function call).

  # ✅ MANDATORY ACTIONS (ОБЯЗАТЕЛЬНЫЕ ДЕЙСТВИЯ):
  1. Если нужно отправить фото -> МОЛЧА вызови 'send_whatsapp_message'.
  2. Если нужно отправить заказ/оплату -> МОЛЧА вызови 'send_booking_confirmation'.
  3. Голосом говори только: "Отправила вам в WhatsApp".

  # 📋 SALES SCRIPT (СЦЕНАРИЙ РАЗГОВОРА):
  
  ШАГ 1. ВЫЯВЛЕНИЕ ПОТРЕБНОСТЕЙ
  - Спроси: "Какая яхта / Сколько людей?", "Какой город (Герцлия/Хайфа)?", "Какая дата?".
  
  ШАГ 2. ПРЕЗЕНТАЦИЯ
  - Расскажи о варианте (цена, описание из базы).
  - Если просят фото -> вызови 'send_whatsapp_message' (вставь ссылку из поля Images!).

  ШАГ 3. ЗАКРЫТИЕ СДЕЛКИ (САМОЕ ВАЖНОЕ)
  - Если клиент согласен ("Да, заказываем", "Хочу оплатить"):
    A. Спроси имя: "איך קוראים לך?" (если еще не знаешь).
    B. КАК ТОЛЬКО ПОЛУЧИЛА ИМЯ -> ВЫЗЫВАЙ 'send_booking_confirmation'.
       - Передай туда: Имя, Телефон, Дату, Время, Яхту, Цену.
    C. Скажи голосом: "מצוין [Имя], שלחתי לך כרגע את אישור ההזמנה וקישור לתשלום בוואטסאפ."

  ---------------------------------------------
  KNOWLEDGE BASE (CONTEXT):
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
        temperature: 0.1, // Минимальная креативность = максимальная послушность
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
        // Сначала удаляем ссылки, чтобы она их не читала
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