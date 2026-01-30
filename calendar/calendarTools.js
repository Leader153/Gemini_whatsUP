const { checkAvailability, createBooking } = require('./googleCalendar');
const { sendWhatsAppMessage } = require('../utils/whatsappService');
const { sendOrderEmail } = require('../utils/emailService'); // Добавили импорт

const OWNER_PHONE_NUMBER = '+972533403449'; // Твой номер для отчетов
const DEFAULT_PAYMENT_LINK = "https://secure.cardcom.solutions/EA/EA5/5a2HEfT6E6KH1aSdcinQ/PaymentSP";

const TERMS_AND_CONDITIONS = `
*תנאי הזמנה ותנאי ביטול*
מומלץ להשתמש בכדורים נגד בחילה ללא מרשם כשעה לפני תחילת השייט!

1. *הגעה בזמן:* יש להגיע בשעה הנקובה על מנת לקבל תדריך בטיחותי ולסיים את כל סידורי הניהול לפני היציאה.

2. *רחצה בים:* הרחצה בים היא באחריות המתרחץ/ת בלבד.
* הירידה למים תתאפשר אך ורק על פי החלטתו הבלעדית של הסקיפר ובמידה ותנאי הים מאפשרים זאת.
* לא תתאפשר רחצה בשעות החשיכה.
* אין גרירת אבוב.

3. *איחור לקוח:* כל איחור של הלקוח/ה ייגרע מזמן השייט הכולל שנקבע מראש. אין החזר כספי בגין איחור.

4. *ביטוח:* היאכטות מבוטחות בביטוח צד ג'.

5. *ניקיון ואחריות לציוד אישי:*
* במידה ואתם מביאים איתכם אוכל ושתייה, אנא דאגו לפנות את האשפה ולהשאיר את היאכטה נקייה.
* במקרה והיאכטה לא תישאר נקייה, או אם פינוי היאכטה יתבצע לאחר המועד הנקוב, תחויבו בסך השווה לעלות שעת הפלגה אחת.
* אחריות במקרה של אובדן או נזק לטלפון סלולרי או כל פריט אחר הנופל למים תחול על המפליג/ה באופן בלעדי.

6. *ליווי:* חובה נוכחות של מלווה מעל גיל 16 (מטעם הלקוח/ה) בכל הפלגה.

7. *אלכוהול ואיסורים:*
* שתיית אלכוהול מתחת לגיל 18 אסורה בהחלט.
* אין להגיע להפלגה עם נרגילה או לעלות ליאכטה עם נרגילה.
* אסור בהחלט להפיץ קונפטי ביאכטה.
* אין אפשרות להגיע להפלגה עם מנגל או לעשות ברביקיו על היאכטה.

8. *אחריות אישית:* על המזמין/ה חלה האחריות הבלעדית להבהיר את כל תנאי ההסכם המפורטים בחוזה זה לכל המוזמנים/ות מטעמו/ה.

--------------------------------------
*מדיניות ביטולים ושינויים*

9. *מזג אוויר:*
* האירוע עשוי להידחות במידה ומזג האוויר אינו מאפשר את קיומו בצורה בטוחה. במקרה כזה, ההפלגה תתואם למועד חלופי קרוב ביותר האפשרי. לא יינתן החזר כספי.
* "לידר הפלגות" אינה אחראית למצב הים ואינה אחראית לתחושות אינדיבידואליות.

10. *ביטול הזמנה:*
* ביטול כנגד החזר כספי (למעט דמי טיפול 300 ₪) יתאפשר רק עד 14 ימים ממועד הפעילות.
* ביטול בין 14 ימים ל-48 שעות: ייגבו 50% מעלות האירוע.
* ביטול בתוך 48 שעות: יחויב המזמין/ה במחיר המלא.

11. *כוח עליון:* במקרה של מלחמה או אסון טבע, תינתן אפשרות לדחות את המועד בלבד.
`;

const calendarTools = [
    {
        name: 'check_yacht_availability',
        description: 'Check available slots',
        parameters: {
            type: 'OBJECT',
            properties: {
                date: { type: 'STRING', description: 'YYYY-MM-DD (2026 only)' },
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
        description: 'Finalize booking: Create Calendar, Send WhatsApp to Client & Owner, Send Email.',
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

function forceYear2026(dateStr) {
    if (!dateStr) return dateStr;
    return dateStr.replace(/^202[0-9]/, '2026');
}

async function handleFunctionCall(name, args) {
    console.log(`🔧 Function call: ${name}`, args);

    try {
        switch (name) {
            case 'check_yacht_availability': {
                const date = forceYear2026(args.date);
                const { checkAvailability } = require('./googleCalendar');
                const slots = await checkAvailability(date, args.duration, args.yachtName);
                if (slots.length === 0) return "אין שעות פנויות.";
                return `שעות פנויות: ${slots.map(s => s.displayText).join(', ')}`;
            }

            case 'transfer_to_support':
                return { transferToOperator: true };

            case 'send_whatsapp_message':
                await sendWhatsAppMessage(args.clientPhone, args.messageBody);
                return "Message sent.";

            case 'send_booking_confirmation':
                return await handleBookingConfirmation(args);

            default:
                return "Function not implemented.";
        }
    } catch (error) {
        console.error(`❌ Error in ${name}:`, error);
        return "Error executing tool.";
    }
}

async function handleBookingConfirmation(args) {
    const { clientName, clientPhone, date, startTime, duration, yachtName, locationLink, locationDesc, totalPrice, paymentLink, guideLink } = args;

    const [hours, minutes] = startTime.split(':').map(Number);
    const endHours = hours + duration;
    const endTimeStr = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const startTimeISO = `${date}T${startTime}:00`;
    const endTimeISO = `${date}T${endTimeStr}:00`;

    const deposit = 500;
    const balance = totalPrice - deposit;

    let bonuses = "בלונים בתוך היאכטה\n שלט \"מזל טוב\"\n מים";
    if (duration >= 3) bonuses = "בקבוק שמפניה\n" + bonuses;

    // 1. Google Calendar
    try {
        await createBooking(startTimeISO, endTimeISO, { name: clientName, phone: clientPhone, yachtName: yachtName, duration: duration });
    } catch (calError) {
        console.error("⚠️ Calendar Error:", calError);
    }

    // 2. WhatsApp КЛИЕНТУ
    const msgBooking = `
לכבוד: ${clientName}
*אישור הזמנת שייט ביאכטה*

📅 *תאריך:* ${date}
⏰ *שעה:* ${startTime} - ${endTimeStr}
⚓ *יאכטה:* ${yachtName}

💰 *תשלום:*
סה"כ: ${totalPrice} ₪
*מקדמה לתשלום כעת: ${deposit} ₪*

לתשלום המקדמה:
${paymentLink || DEFAULT_PAYMENT_LINK}

${guideLink ? `(מצורף מדריך: ${guideLink})` : ''}

*יתרה לתשלום בשייט: ${balance} ₪*

🎁 *כולל:*
${bonuses}

⚠️ *שים לב:*
תשלום מקדמה מייבא אישורכם והסכמתכם על אישור הזמנה, תנאי ביטול, תנאי השכרת יאכטה.
נא לשלוח לי צילום חשבונית שקיבלתם במייל.
    `.trim();

    const msgLocation = `
📍 *הוראות הגעה:*
${locationDesc || 'מרינה'}

לניווט בוייז:
${locationLink || ''}
    `.trim();

    // Отправка клиенту
    await sendWhatsAppMessage(clientPhone, msgBooking);
    await new Promise(r => setTimeout(r, 1000));
    if (locationLink) await sendWhatsAppMessage(clientPhone, msgLocation);
    await sendWhatsAppMessage(clientPhone, TERMS_AND_CONDITIONS);

    // 3. WhatsApp ВЛАДЕЛЬЦУ (Тебе)
    const ownerMsg = `
💰 *הזמנה חדשה נוצרה!*
לקוח: ${clientName}
טלפון: ${clientPhone}
יאכטה: ${yachtName}
תאריך: ${date} ${startTime}
מחיר: ${totalPrice}
(נשלח קישור לתשלום ללקוח)
    `.trim();
    
    // Отправляем тебе копию
    await sendWhatsAppMessage(OWNER_PHONE_NUMBER, ownerMsg);

    // 4. Email ВЛАДЕЛЬЦУ
    await sendOrderEmail(args);
    
    return "כל הפרטים נשלחו ללקוח, לבעלים, ולמייל.";
}

module.exports = { calendarTools, handleFunctionCall };