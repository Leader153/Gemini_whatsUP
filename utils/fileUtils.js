const fs = require('fs');
const path = require('path');

/**
 * Ensures the orders directory exists.
 */
function ensureOrderDirectory() {
    const dirPath = path.join(__dirname, '..', 'orders');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

/**
 * Saves order details to a text file.
 * @param {Object} orderDetails 
 * @returns {Promise<string>} Path to the created file
 */
async function saveOrderToFile(orderDetails) {
    const dirPath = ensureOrderDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Sanitize filename safe characters
    const safePhone = (orderDetails.clientPhone || 'unknown').replace(/[^0-9]/g, '');
    const filename = `order_${timestamp}_${safePhone}.txt`;
    const filePath = path.join(dirPath, filename);

    const content = `
ORDER DETAILS
-------------
Date: ${new Date().toLocaleString('he-IL')}
Client Name: ${orderDetails.clientName}
Client Phone: ${orderDetails.clientPhone}
Requested Date: ${orderDetails.date} (2026 год)
Requested Time: ${orderDetails.time || 'Not specified'}
Duration: ${orderDetails.duration || 'Not specified'} hours

Status: Pending Operator Confirmation
`.trim();

    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, content, 'utf8', (err) => {
            if (err) {
                console.error('Error writing order file:', err);
                reject(err);
            } else {
                console.log(`✅ Order saved to: ${filePath}`);
                resolve(filePath);
            }
        });
    });
}

module.exports = {
    saveOrderToFile
};
