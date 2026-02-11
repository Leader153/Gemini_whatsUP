const fs = require('fs');
const path = require('path');

const COUNTER_FILE = path.join(__dirname, '..', 'data', 'orderCounter.json');

// Инициализация (если файла нет, начнем с 1000)
if (!fs.existsSync(COUNTER_FILE)) {
    try {
        if (!fs.existsSync(path.join(__dirname, '..', 'data'))) {
            fs.mkdirSync(path.join(__dirname, '..', 'data'));
        }
        fs.writeFileSync(COUNTER_FILE, JSON.stringify({ nextOrder: 1000 }));
    } catch (e) {
        console.error("Ошибка создания счетчика:", e);
    }
}

function getNextOrderNumber() {
    try {
        const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
        const currentOrder = data.nextOrder;
        
        // Увеличиваем и сохраняем
        data.nextOrder++;
        fs.writeFileSync(COUNTER_FILE, JSON.stringify(data));
        
        return currentOrder;
    } catch (error) {
        console.error("Ошибка чтения счетчика:", error);
        return Math.floor(Math.random() * 10000); // Fallback
    }
}

module.exports = { getNextOrderNumber };