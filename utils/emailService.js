const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendOrderEmail(data) {
    if (!process.env.EMAIL_USER) return false;

    const mailOptions = {
        from: `"Gemini Bot" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_TO, // Твой email
        subject: `💰 Новый заказ #${data.orderId || 'N/A'}: ${data.clientName} (${data.date})`,
        html: `
            <div style="font-family: Arial; padding: 20px; border: 1px solid #ccc;">
                <h2>Новый заказ яхты/терминала</h2>
                <p><strong>Номер заказа:</strong> #${data.orderId || 'N/A'}</p>
                <p><strong>Клиент:</strong> ${data.clientName}</p>
                <p><strong>Телефон:</strong> ${data.clientPhone}</p>
                <p><strong>Яхта:</strong> ${data.yachtName}</p>
                <p><strong>Дата:</strong> ${data.date}</p>
                <p><strong>Время:</strong> ${data.startTime}</p>
                <p><strong>Сумма:</strong> ${data.totalPrice} ₪</p>
                <hr>
                <p><em>Сообщение отправлено автоматически после подтверждения в WhatsApp.</em></p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('📧 Email владельцу отправлен.');
        return true;
    } catch (error) {
        console.error('❌ Ошибка Email:', error);
        return false;
    }
}

module.exports = { sendOrderEmail };