const { checkAvailability, createBooking, isSlotAvailable } = require('./calendarService');
const { sendWhatsAppMessage } = require('../utils/whatsappService');
const { sendOrderEmail } = require('../utils/emailService');
const { sendSms } = require('../utils/smsService');

const DEFAULT_PAYMENT_LINK = "https://secure.cardcom.solutions/EA/EA5/5a2HEfT6E6KH1aSdcinQ/PaymentSP";
const WA_NUMBER = (process.env.TWILIO_NUMBER || '972533883507').replace(/[^\d]/g, '');

const TERMS_PART_1 = `
*תנאי הזמנה ותנאי ביטול - חלק א'*
מומלץ להשתמש בכדורים נגד בחילה ללא מרשם כשעה לפני תחילת השייט!

1. *הגעה בזמן:* יש להגיע בשעה הנקובה.
2. *רחצה בים:* באחריות המתרחץ בלבד. ירידה למים רק באישור סקיפר.
3. *איחור:* יקוזז מזמן השייט.
4. *ביטוח:* קיים ביטוח צד ג'.
5. *ניקיון:* יש להשאיר יאכטה נקייה.
6. *ליווי:* חובה מלווה מעל גיל 16.
7. *איסורים:* ללא אלכוהול מתחת לגיל 18. אסור נרגילה/מנגל/קונפטי.
`;

const TERMS_PART_2 = `
*תנאי הזמנה ותנאי ביטול - חלק ב'*

8. *מזג אוויר:* במידה וסוער - יידחה למועד אחר.
9. *ביטול:*
* עד 14 יום: החזר פחות 300 ₪.
* 14 יום - 48 שעות: 50% דמי ביטול.
* פחות מ-48 שעות: תשלום מלא.
10. *כוח עליון:* דחיית מועד בלבד.

*אישור:* תשלום המקדמה מהווה הסכמה לתנאים.
נא לשלוח צילום אסמכתא.
`;

const calendarTools = [
    {
        name: 'check_yacht_availability',
        description: 'Check available slots',
        parameters: {
            type: 'OBJECT',
            properties: {
                date: { type: 'STRING' },
                duration: { type: 'NUMBER' },
                yachtName: { type: 'STRING' }
            },
            required: ['date', 'duration', 'yachtName']
        }
    },
    {
        name: 'transfer_to_support',
        description: 'Transfer call',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'save_client_data',
        description: 'Save details',
        parameters: {
            type: 'OBJECT',
            properties: { name: { type: 'STRING' }, phone: { type: 'STRING' } },
            required: ['name', 'phone']
        }
    },
    {
        name: 'send_whatsapp_message',
        description: 'Send WhatsApp',
        parameters: {
            type: 'OBJECT',
            properties: { messageBody: { type: 'STRING' }, clientPhone: { type: 'STRING' } },
            required: ['messageBody', 'clientPhone']
        }
    },
    {
        name: 'send_booking_confirmation',
        description: 'Finalize booking: Calendar, WhatsApp (Split messages), Email.',
        parameters: {
            type: 'OBJECT',
            properties: {
                clientName: { type: 'STRING' },
                clientPhone: { type: 'STRING' },
                date: { type: 'STRING' },
                startTime: { type: 'STRING' },
                duration: { type: 'NUMBER' },
                yachtName: { type: 'STRING' },
                locationLink: { type: 'STRING' },
                locationDesc: { type: 'STRING' },
                totalPrice: { type: 'NUMBER' },
                paymentLink: { type: 'STRING' },
                guideLink: { type: 'STRING' }
            },
            required: ['clientName', 'clientPhone', 'date', 'startTime', 'duration', 'yachtName', 'totalPrice']
        }
    }
];

// --- ИСПРАВЛЕНИЕ ДАТЫ (DD.MM.YYYY -> YYYY-MM-DD) ---
function normalizeDate(dateStr) {
    if (!dateStr) return dateStr;
    
    // Если дата уже в формате YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // Если дата в формате DD.MM.YYYY или DD/MM/YYYY
    const parts = dateStr.split(/[./]/);
    if (parts.length === 3) {
        // parts[0] = Day, parts[1] = Month, parts[2] = Year
        return `${parts[2]}-${parts[1]}-${parts[0]}`; 
    }
    
    return dateStr; // Возвращаем как есть, если формат неизвестен
}

function forceYear2026(dateStr) {
    let normalized = normalizeDate(dateStr);
    if (!normalized) return normalized;
    return normalized.replace(/^202[0-9]/, '2026');
}

async function trySendWithFallback(phone, text) {
    const waResult = await sendWhatsAppMessage(phone, text);
    if (!waResult.success) {
        console.log(`⚠️ WhatsApp failed. Sending SMS fallback.`);
        const waLink = `https://wa.me/${WA_NUMBER}?text=Hi`;
        const smsBody = `Leader: שלחנו לך פרטים בוואטסאפ. לחץ כאן לקבלתם: ${waLink}`;
        await sendSms(phone, smsBody);
    }
    return { result: "Message sent." };
}

async function handleFunctionCall(name, args) {
    console.log(`🔧 Function call: ${name}`, args);

    try {
        switch (name) {
            case 'check_yacht_availability': {
                const date = forceYear2026(args.date);
                const { checkAvailability } = require('./calendarService');
                const slots = await checkAvailability(date, args.duration, args.yachtName);
                if (slots.length === 0) return { result: "אין שעות פנויות." };
                return { result: `שעות פנויות: ${slots.map(s => s.displayText).join(', ')}` };
            }

            case 'transfer_to_support':
                return { transferToOperator: true };

            case 'send_whatsapp_message':
                return await trySendWithFallback(args.clientPhone, args.messageBody);

            case 'send_booking_confirmation':
                return await handleBookingConfirmation(args);

            case 'save_client_data':
                return { result: `Saved: ${args.name}` };

            default:
                return { error: "Function not implemented." };
        }
    } catch (error) {
        console.error(`❌ Error in ${name}:`, error);
        return { error: "Error executing tool." };
    }
}

async function handleBookingConfirmation(args) {
    const { clientName, clientPhone, date, startTime, duration, yachtName, locationLink, locationDesc, totalPrice, paymentLink, guideLink } = args;

    // Нормализуем дату для Google Calendar (YYYY-MM-DD)
    const isoDate = normalizeDate(date);

    const [hours, minutes] = startTime.split(':').map(Number);
    const endHours = hours + duration;
    const endTimeStr = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    
    // Используем нормализованную дату для создания ISO строк
    const startTimeISO = `${isoDate}T${startTime}:00`;
    const endTimeISO = `${isoDate}T${endTimeStr}:00`;

    const deposit = 500;
    const balance = totalPrice - deposit;

    let bonuses = "בלונים בתוך היאכטה\n שלט \"מזל טוב\"\n מים";
    if (duration >= 3) bonuses = "בקבוק שמפניה\n" + bonuses;

    // 1. ЗАПИСЬ В КАЛЕНДАРЬ
    try {
        console.log(`📅 Booking: ${startTimeISO} - ${endTimeISO}`);
        await createBooking(startTimeISO, endTimeISO, { name: clientName, phone: clientPhone, yachtName: yachtName, duration: duration });
        console.log("✅ Запись в Google Calendar создана.");
    } catch (calError) {
        console.error("⚠️ Calendar Error (Check date format):", calError);
    }

    // 2. СООБЩЕНИЯ КЛИЕНТУ (WhatsApp)
    const msgDetails = `
לכבוד: ${clientName}
*אישור הזמנת שייט ביאכטה* ⚓

פרטי ההזמנה:
📅 *תאריך:* ${date}
⏰ *שעה:* ${startTime} - ${endTimeStr}
⛵ *יאכטה:* ${yachtName}

🎁 *כולל:*
${bonuses}
    `.trim();

    const msgPayment = `
💰 *הסדרת תשלום*

סה"כ לתשלום: ${totalPrice} ₪
*מקדמה נדרשת כעת: ${deposit} ₪*

👇 *לביצוע תשלום מאובטח לחצו כאן:* 👇
${paymentLink || DEFAULT_PAYMENT_LINK}

${guideLink ? `(מצורף דף הסבר: ${guideLink})` : ''}

*היתרה (${balance} ₪) תשולם במועד ההפלגה.*
    `.trim();

    const msgLocation = `
📍 *הוראות הגעה:*
${locationDesc || 'מרינה'}

לניווט בוייז:
${locationLink || ''}
    `.trim();

    console.log(`📤 Sending Client Messages to ${clientPhone}`);
    
    await trySendWithFallback(clientPhone, msgDetails);
    await new Promise(r => setTimeout(r, 1000));
    
    await trySendWithFallback(clientPhone, msgPayment);
    await new Promise(r => setTimeout(r, 1000));
    
    if (locationLink) {
        await trySendWithFallback(clientPhone, msgLocation);
        await new Promise(r => setTimeout(r, 1000));
    }

    await trySendWithFallback(clientPhone, TERMS_PART_1);
    await new Promise(r => setTimeout(r, 1000));
    await trySendWithFallback(clientPhone, TERMS_PART_2);

    await sendOrderEmail(args);
    
    return { result: "כל הפרטים נשלחו ללקוח (ווטסאפ) ולמייל." };
}

module.exports = { calendarTools, handleFunctionCall };