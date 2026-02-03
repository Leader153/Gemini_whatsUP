const { checkAvailability, createBooking, isSlotAvailable } = require('./calendarService');
const { sendWhatsAppMessage } = require('../utils/whatsappService');
const { sendOrderEmail } = require('../utils/emailService');
const { sendSms } = require('../utils/smsService');
const { getNextOrderNumber } = require('../utils/orderCounter');

const DEFAULT_PAYMENT_LINK = "https://secure.cardcom.solutions/EA/EA5/5a2HEfT6E6KH1aSdcinQ/PaymentSP";
const WA_NUMBER = (process.env.TWILIO_NUMBER || '972533883507').replace(/[^\d]/g, '');
const OWNER_PHONE_NUMBER = '+972533403449'; 

// --- ВЕРНУЛ РЕКВИЗИТЫ НА МЕСТО ---
const PAYBOX_PHONE = "053-340-3449";
const BANK_DETAILS = `
בנק: יהב (04)
סניף: 279 (קריית ביאליק)
חשבון: 129718
שם: דניאל פלידר (לידר הפלגות)
`.trim();

// --- ТЕКСТЫ ---
const CLOSING_DEAL_TEXT = `
*תהליך סגירת עסקה / שריון מקום* ⚓

כדי לשריין את היאכטה, עלינו לבצע הזמנה מסודרת.
אשלח לך כעת *אישור הזמנה* הכולל את כל הפרטים וקישור לתשלום מקדמה.

💳 *אפשרויות לתשלום המקדמה:*
1. כרטיס אשראי (קישור מאובטח).
2. אפליקציית PayBox.
3. העברה בנקאית.

לאחר התשלום, חובה לשלוח לנו צילום אסמכתא בווטסאפ.
*האם לשלוח לך את ההזמנה?*
`;

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
        name: 'send_closing_process_info',
        description: 'Send payment explanation via WhatsApp. Use BEFORE booking.',
        parameters: {
            type: 'OBJECT',
            properties: { clientPhone: { type: 'STRING' } },
            required: ['clientPhone']
        }
    },
    {
        name: 'request_cancellation',
        description: 'Handle booking cancellation request.',
        parameters: {
            type: 'OBJECT',
            properties: { orderId: { type: 'STRING' }, clientPhone: { type: 'STRING' } },
            required: ['orderId', 'clientPhone']
        }
    },
    {
        name: 'send_booking_confirmation',
        description: 'Finalize booking: Calendar, WhatsApp, Email.',
        parameters: {
            type: 'OBJECT',
            properties: {
                clientName: { type: 'STRING' },
                clientPhone: { type: 'STRING' },
                date: { type: 'STRING' },
                startTime: { type: 'STRING' },
                duration: { type: 'NUMBER' },
                yachtName: { type: 'STRING' },
                participants: { type: 'STRING' }, 
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

function forceYear2026(dateStr) {
    if (!dateStr) return dateStr;
    let cleanDate = dateStr.replace(/[./]/g, '-');
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleanDate)) {
        const parts = cleanDate.split('-');
        cleanDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return cleanDate.replace(/^\d{4}/, '2026');
}

async function trySendWithFallback(phone, text) {
    const waResult = await sendWhatsAppMessage(phone, text);
    if (!waResult.success) {
        console.log(`⚠️ WhatsApp failed. Sending SMS fallback.`);
        const waLink = `https://wa.me/${WA_NUMBER}?text=Hi`;
        const smsBody = `Leader: שלחנו לך פרטים בוואטסאפ. לחץ כאן: ${waLink}`;
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

            case 'send_closing_process_info':
                return await trySendWithFallback(args.clientPhone, CLOSING_DEAL_TEXT);

            case 'send_booking_confirmation':
                return await handleBookingConfirmation(args);
            
            case 'request_cancellation':
                const cancelMsg = `🚫 בקשה לביטול הזמנה ${args.orderId} התקבלה.`;
                await trySendWithFallback(args.clientPhone, cancelMsg);
                const adminMsg = `❌ БИТУЛЬ! Клиент ${args.clientPhone} хочет отменить заказ #${args.orderId}`;
                await sendWhatsAppMessage(OWNER_PHONE_NUMBER, adminMsg);
                await sendOrderEmail({ clientName: 'CANCEL REQUEST', date: 'N/A', status: adminMsg });
                return { result: "Cancellation request sent." };

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
    const { clientName, clientPhone, date, startTime, duration, yachtName, participants, locationLink, locationDesc, totalPrice, paymentLink, guideLink } = args;

    const isoDate = forceYear2026(date);
    const [hours, minutes] = startTime.split(':').map(Number);
    const endHours = hours + duration;
    const endTimeStr = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const startTimeISO = `${isoDate}T${startTime}:00`;
    const endTimeISO = `${isoDate}T${endTimeStr}:00`;

    // --- ЗАЩИТА ОТ ДВОЙНОГО ЗАКАЗА ---
    const { isSlotAvailable } = require('./calendarService');
    const isFree = await isSlotAvailable(startTimeISO, endTimeISO, yachtName);
    if (!isFree) {
        return { result: "שגיאה: הזמן הזה נתפס הרגע על ידי לקוח אחר. אנא נסה שעה אחרת." };
    }

    const orderId = getNextOrderNumber(); 
    const deposit = 500;
    const balance = totalPrice - deposit;

    let bonuses = "✅ בלונים בתוך היאכטה\n✅ שלט \"מזל טוב\"\n✅ מים";
    let swimmingText = "";
    if (duration >= 3) {
        bonuses = "🍾 בקבוק שמפניה (מתנה!)\n" + bonuses;
        swimmingText = "🏊 אפשרות לירידה למים (באישור סקיפר)";
    }

    try {
        await createBooking(startTimeISO, endTimeISO, { name: `${clientName} (#${orderId})`, phone: clientPhone, yachtName: yachtName, duration: duration });
    } catch (calError) {
        console.error("⚠️ Calendar Error:", calError);
    }

    const msgBooking = `
לכבוד: ${clientName}
*אישור הזמנת שייט ביאכטה* ⚓
מספר הזמנה: *${orderId}*

פרטי ההזמנה:
📅 *תאריך:* ${isoDate.split('-').reverse().join('.')}
⏰ *שעה:* ${startTime} - ${endTimeStr} (סה"כ ${duration} שעות)
⛵ *יאכטה:* ${yachtName}
👥 *משתתפים:* עד ${participants || '13'} איש

📍 *מקום מפגש:*
${locationDesc || 'מרינה'}

🎁 *החבילה כוללת:*
${bonuses}
${swimmingText}
    `.trim();

    const msgPayment = `
💰 *הסדרת תשלום עבור הזמנה #${orderId}*

סה"כ לתשלום: ${totalPrice} ₪
*מקדמה נדרשת כעת: ${deposit} ₪*

אנא בחרו את דרך התשלום הנוחה לכם:

1️⃣ *כרטיס אשראי (מומלץ):*
${paymentLink || DEFAULT_PAYMENT_LINK}

2️⃣ *PayBox:*
למספר: ${PAYBOX_PHONE}

3️⃣ *העברה בנקאית:*
${BANK_DETAILS}

${guideLink ? `(מצורף מדריך: ${guideLink})` : ''}

*היתרה (${balance} ₪) תשולם במועד ההפלגה.*

⚠️ *שים לב:* תשלום המקדמה מהווה אישור לתנאי ההזמנה.
נא לשלוח צילום אסמכתא לאחר התשלום.
    `.trim();

    const msgLocation = `
📍 *הוראות הגעה:*
${locationDesc || 'מרינה'}

לניווט בוייז:
${locationLink || ''}
    `.trim();

    await trySendWithFallback(clientPhone, msgBooking);
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

    const ownerMsg = `💰 *הזמנה חדשה #${orderId}*
${clientName}, ${yachtName}, ${isoDate}`;
    await sendWhatsAppMessage(OWNER_PHONE_NUMBER, ownerMsg);
    
    await sendOrderEmail({ ...args, orderId: orderId });
    
    return { result: `הזמנה #${orderId} נוצרה בהצלחה.` };
}

module.exports = { calendarTools, handleFunctionCall };