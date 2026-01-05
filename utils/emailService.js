const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Сервис отправки уведомлений по электронной почте.
 */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Отправляет информацию о заказе на email оператора.
 * @param {Object} orderDetails - Данные заказа
 * @returns {Promise<boolean>} - Успешно ли отправлено
 */
async function sendOrderEmail(orderDetails) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TO) {
        console.warn('⚠️ Настройки Email отсутствуют в .env. Отправка отменена.');
        return false;
    }

    // Собираем дополнительные данные, если они есть
    let extraDetailsText = '';
    if (orderDetails.has_terminal) extraDetailsText += `Наличие терминала: ${orderDetails.has_terminal}\n`;
    if (orderDetails.business_type) extraDetailsText += `Тип бизнеса: ${orderDetails.business_type}\n`;
    if (orderDetails.city) extraDetailsText += `Город: ${orderDetails.city}\n`;

    let extraDetailsHtml = '';
    if (orderDetails.has_terminal) extraDetailsHtml += `<p><strong>Наличие терминала:</strong> ${orderDetails.has_terminal}</p>`;
    if (orderDetails.business_type) extraDetailsHtml += `<p><strong>Тип бизнеса:</strong> ${orderDetails.business_type}</p>`;
    if (orderDetails.city) extraDetailsHtml += `<p><strong>Город:</strong> ${orderDetails.city}</p>`;


    const mailOptions = {
        from: `"Gemini Voice Bot" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_TO,
        subject: `Новая заявка от ${orderDetails.clientName}`,
        text: `
НОВАЯ ЗАЯВКА (Заказ/Встреча)
-----------------------
Имя клиента: ${orderDetails.clientName}
Телефон: ${orderDetails.clientPhone}
Желаемая дата: ${orderDetails.date} (2026 год)
Желаемое время: ${orderDetails.time || 'Не указано'}
Длительность: ${orderDetails.duration} ч.

--- Дополнительные данные ---
${extraDetailsText}
-----------------------

Статус: ${orderDetails.status || 'Требуется подтверждение оператора.'}
        `,
        html: `
            <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px; max-width: 600px;">
                <h2 style="color: #2c3e50;">📠 Новая заявка (Заказ/Встреча)</h2>
                <hr>
                <p><strong>Имя клиента:</strong> ${orderDetails.clientName}</p>
                <p><strong>Телефон:</strong> <a href="tel:${orderDetails.clientPhone}">${orderDetails.clientPhone}</a></p>
                <p><strong>Дата:</strong> ${orderDetails.date}</p>
                <p><strong>Время:</strong> ${orderDetails.time || 'Не указано'}</p>
                <p><strong>Длительность:</strong> ${orderDetails.duration} ч.</p>
                <hr>
                <h3 style="color: #34495e;">Дополнительные данные</h3>
                ${extraDetailsHtml}
                <br>
                <div style="background-color: #f9f9f9; padding: 10px; border-left: 5px solid #3498db;">
                    <strong>Статус:</strong> ${orderDetails.status || 'Ожидает подтверждения оператора'}
                </div>
                <p style="font-size: 12px; color: #7f8c8d; margin-top: 20px;">
                    Это автоматическое сообщение от вашего голосового помощника Gemini.
                </p>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Email отправлен успешно:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ Ошибка при отправке Email:', error);
        return false;
    }
}

module.exports = { sendOrderEmail };
