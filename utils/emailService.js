const nodemailer = require('nodemailer');

// Настройки берутся из переменных окружения (загруженных в index.js)
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
    // Проверка наличия настроек
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TO) {
        console.warn('⚠️ [EMAIL] Настройки отсутствуют в .env. Отправка отменена.');
        return false;
    }

    // Формирование дополнительных деталей
    let extraDetailsText = '';
    if (orderDetails.has_terminal) extraDetailsText += `Наличие терминала: ${orderDetails.has_terminal}\n`;
    if (orderDetails.business_type) extraDetailsText += `Тип бизнеса: ${orderDetails.business_type}\n`;
    if (orderDetails.city) extraDetailsText += `Город: ${orderDetails.city}\n`;

    let extraDetailsHtml = '';
    if (orderDetails.has_terminal) extraDetailsHtml += `<p><strong>Наличие терминала:</strong> ${orderDetails.has_terminal}</p>`;
    if (orderDetails.business_type) extraDetailsHtml += `<p><strong>Тип бизнеса:</strong> ${orderDetails.business_type}</p>`;
    if (orderDetails.city) extraDetailsHtml += `<p><strong>Город:</strong> ${orderDetails.city}</p>`;

    // Формирование письма
    const mailOptions = {
        from: `"Gemini Assistant" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_TO,
        subject: `🔔 Новая заявка: ${orderDetails.clientName}`,
        text: `
НОВАЯ ЗАЯВКА
-----------------------
Имя: ${orderDetails.clientName}
Телефон: ${orderDetails.clientPhone}
Дата: ${orderDetails.date}
Время: ${orderDetails.time || 'Не указано'}
Длительность: ${orderDetails.duration} ч.

${extraDetailsText}
-----------------------
Статус: ${orderDetails.status || 'Ожидает подтверждения'}
        `,
        html: `
            <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px; max-width: 600px;">
                <h2 style="color: #2c3e50;">🔔 Новая заявка</h2>
                <hr>
                <p><strong>Имя:</strong> ${orderDetails.clientName}</p>
                <p><strong>Телефон:</strong> <a href="tel:${orderDetails.clientPhone}">${orderDetails.clientPhone}</a></p>
                <p><strong>Дата:</strong> ${orderDetails.date}</p>
                <p><strong>Время:</strong> ${orderDetails.time || 'Не указано'}</p>
                <p><strong>Длительность:</strong> ${orderDetails.duration} ч.</p>
                <hr>
                <h3 style="color: #34495e;">Детали</h3>
                ${extraDetailsHtml}
                <div style="background-color: #f0f8ff; padding: 15px; margin-top: 15px; border-radius: 5px;">
                    <strong>Статус:</strong> ${orderDetails.status || 'Ожидает подтверждения'}
                </div>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 Email отправлен:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ Ошибка отправки Email:', error);
        return false;
    }
}

module.exports = { sendOrderEmail };