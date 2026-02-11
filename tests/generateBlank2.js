function generateBlank2(data) {
    // --- 1. РАСЧЕТЫ (Без изменений) ---
    const commissionRate = 0.20; 
    const commission = data.price * commissionRate;
    const remainingBalance = data.price - data.downPayment;

    // --- 2. ЛОГИКА ПУНКТА 8 (НОВОЕ: ФОРМАТ СО СКОБКАМИ) ---
    const extrasMap = {
        "champagne": "בקבוק שמפניה", // 8.1
        "fishing": "עד 13 מפליגים או 8 דייגים רק יאכטה לי-ים - דייג , ציוד דייג. פתיונות,חכות.", // 8.2
        "breakfast": "ארוחת בוקר", // 8.3
        "dinner": "ארוחת ערב" // 8.4
    };

    // Определяем содержание внутри скобок {}
    let extraContent = "ללא"; // Значение по умолчанию
    if (data.selectedExtra && extrasMap[data.selectedExtra]) {
        extraContent = extrasMap[data.selectedExtra];
    }

    // Формируем итоговую строку строго по образцу
    const line8 = `8. תוספת: {${extraContent}}`;

    // --- 3. ЛОГИКА ПУНКТОВ 11 И 12 (Без изменений) ---
    let line11 = "";
    let line12 = "";

    // Оплата КРЕДИТКОЙ -> Деньги у поставщика
    if (data.paymentMethod === "credit_card") {
        line11 = `11. שולם אצלכם ${data.downPayment} ₪`;
        line12 = `12. מגיע לי ${commission} ₪`; 
    } 
    // Оплата PAYBOX/ПЕРЕВОД -> Деньги у агента
    else {
        line11 = `11. שולם אצלי ${data.downPayment} ₪`;
        const amountToTransfer = data.downPayment - commission;
        line12 = `12. מגיע לכם ${amountToTransfer} ₪`;
    }

    // --- 4. СБОРКА БЛАНКА ---
    const blank2 = `
---------------------------------------------

1. מפנה : דניאל סוכן
2. הזמנה לתאריך ${data.date}
3. משעה ${data.startTime} עד ${data.endTime}
4. לקוח: ${data.clientName}
5. טלפון : ${data.phone}
6. יאכטה ${data.yachtName} :
7. עד ${data.passengers} מפליגים
${line8}
9. מחיר לקוח/עלות: ${data.price} ₪
10. נשאר תשלום לקוח : ${remainingBalance} ₪
${line11}
${line12}
13. עמלת מפנה 20 אחוז :${commission} ₪
14. נא להחזיר / לרשום לי מספר הזמנה
---------------------------------------------
`;

    return blank2;
}

// --- ПРИМЕР 1: Клиент с ужином (как в задании) ---
const orderWithDinner = {
    date: "23/02/2026",
    startTime: "14:00",
    endTime: "16:00",
    clientName: "יוסי כהן",
    phone: "0527549368",
    yachtName: "בגירה",
    passengers: 10,
    price: 1300,
    downPayment: 500,
    paymentMethod: "credit_card", 
    selectedExtra: "dinner" // Выбран ужин
};

// --- ПРИМЕР 2: Клиент без добавок ---
const orderEmpty = {
    date: "24/02/2026",
    startTime: "10:00",
    endTime: "11:00",
    clientName: "דני בדיקה",
    phone: "0500000000",
    yachtName: "ליים",
    passengers: 5,
    price: 1000,
    downPayment: 200,
    paymentMethod: "paybox",
    selectedExtra: null // Ничего не выбрано
};

console.log("--- Пример с ужином ---");
console.log(generateBlank2(orderWithDinner));

console.log("--- Пример без добавок ---");
console.log(generateBlank2(orderEmpty));

//node tests/what_bot_sees.js ""