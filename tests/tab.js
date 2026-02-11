/**
 * ГЛАВНАЯ ФУНКЦИЯ
 * Принимает объект data (данные клиента)
 * Возвращает объект с 4-мя строками (готовыми файлами)
 */
function generateAllFiles(data) {
    // --- 0. ПРЕДВАРИТЕЛЬНАЯ ОБРАБОТКА (ЛИДЕР) ---
    const isLeader = data.clientName && data.clientName.trim() === "לידר";
    
    // Переменные для БЛАНКА 2 и РАСЧЕТОВ
    let b2_Name = data.clientName;
    let b2_Phone = data.phone;
    let commissionRate = 0.20;

    if (isLeader) {
        b2_Name = "פרטי ##";
        b2_Phone = "0533403449";
        commissionRate = 0; // Комиссия 0
    }

    // --- 1. ОБЩИЕ РАСЧЕТЫ ---
    const commission = data.price * commissionRate; // 0 или 20%
    const netCost = data.price - commission; // Цена после вычета комиссии
    const remainingBalance = data.price - data.downPayment; // Остаток к оплате клиентом
    
    // Кто кому должен (Логика кассы)
    // paidAtSupplier (שולם אצלכם) - если кредитка
    // paidAtAgent (שולם אצלי) - если пейбокс
    let paidAtSupplier = 0;
    let paidAtAgent = 0;
    
    // Итог взаиморасчетов
    let dueToSupplier = 0; // מגיע לכם (нужно перевести владельцу)
    let dueToAgent = 0;    // מגיע לי (владелец должен агенту)

    if (data.paymentMethod === "credit_card") {
        paidAtSupplier = data.downPayment;
        // Деньги у владельца. Владелец должен отдать комиссию агенту.
        // Если это Лидер (комиссия 0), то никто никому не должен (0).
        dueToAgent = commission; 
    } else {
        paidAtAgent = data.downPayment;
        // Деньги у агента. Агент оставляет комиссию, остаток переводит.
        // Если Лидер (комиссия 0), агент переводит ВСЮ предоплату.
        dueToSupplier = data.downPayment - commission;
    }

    // --- 2. ГЕНЕРАЦИЯ БЛАНКА 1 (Клиент) ---
// --- 4. יצירת בלנק 1 (לקוח) - לוגיקה חכמה ליאכטות ---

    // מסד נתונים של יאכטות: מקסימום אנשים + עיר
    const yachtsDB = {
        // --- חיפה ---
        "יאמי": { max: 11, city: "Haifa" },
        "אודליה": { max: 11, city: "Haifa" },
        "אל-ים": { max: 11, city: "Haifa" },
        "אושן": { max: 13, city: "Haifa" },
        "סי יו": { max: 14, city: "Haifa" },
        "פאר-וינד": { max: 14, city: "Haifa" }, 
        "בת ים": { max: 14, city: "Haifa" },
        "קינג": { max: 39, city: "Haifa" },
        "טייפון": { max: 30, city: "Haifa" },

        // --- הרצליה ---
        "לואיז": { max: 6, city: "Herzliya" },
        "בגירה": { max: 10, city: "Herzliya" },
         "לי-ים": { max: 13, city: "Herzliya" },
        "ג'וי": { max: 13, city: "Herzliya" },
        "עמית": { max: 14, city: "Herzliya" },
        "יובל": { max: 14, city: "Herzliya" },
        "דולפין": { max: 21, city: "Herzliya" },
        "הולידיי": { max: 55, city: "Herzliya" }
    };

    //  לוגיקה חכמה ליאכטות:
   // הגדרות ברירת מחדל
    let locationName = "הרצליה";
    let address = "כתובת שלנו : רחוב יורדי ים 1, הרצליה";
    
    // התיקון: מתחילים עם מה שהמשתמש הזין בשורה (למשל 6)
    let finalPassengers = data.passengers; 

    // בדיקה והחלפת נתונים לפי שם היאכטה
    if (data.yachtName) {
        const cleanName = data.yachtName.trim();
        const yachtInfo = yachtsDB[cleanName];

        if (yachtInfo) {
            // לוגיקה לכתובת (נשארת אותו דבר)
            if (yachtInfo.city === "Haifa") {
                locationName = "חיפה";
                address = "כתובת שלנו : רחוב הדייגים , חיפה";
            } else {
                locationName = "הרצליה";
                address = "כתובת שלנו : רחוב יורדי ים 1, הרצליה";
            }

            // לוגיקה לכמות מפליגים (התיקון החשוב)
            // אם המשתמש לא הזין כלום (או הזין 0), ניקח את המקסימום מהמערכת.
            // אחרת - נשאיר את המספר שהמשתמש הזין (למשל 6).
            if (!finalPassengers || finalPassengers == 0) {
                finalPassengers = yachtInfo.max;
            }
        }
    }
    
// --- 5. לוגיקה חכמה למחיר (Price Logic) ---

    // 1. База цен (заполняй по аналогии)
    const yachtPricingDB = {
        "יאמי": { 
            1: 1290, 
            2: 1390, 
            3: 1890, 
            note: "כולל מעמ" 
        }
        // "בגירה": { 1: 1000, 2: 1500 ... }
    };

    // 2. Расчет длительности для прайса
    let calcDuration = parseInt(data.endTime) - parseInt(data.startTime);
    if (isNaN(calcDuration)) calcDuration = 0;

    // 3. Определение цены
    // Сначала берем то, что ввел пользователь
    let finalPrice = data.price; 
    let priceNote = ""; 

    // Если пользователь НЕ ввел цену (или 0), ищем в базе
    if (!finalPrice || finalPrice == 0) {
        if (data.yachtName && yachtPricingDB[data.yachtName.trim()]) {
            const pricing = yachtPricingDB[data.yachtName.trim()];
            
            // Если есть цена для этой длительности
            if (pricing[calcDuration]) {
                finalPrice = pricing[calcDuration];
            }
            // Если есть примечание
            if (pricing.note) {
                priceNote = `(${pricing.note})`;
            }
        }
    }

    // 4. Пересчет остатка (так как цена могла измениться)
    let finalRemaining = finalPrice - data.downPayment;
    
    const blank1 = `לכבוד:
${data.clientName}
 מספר טלפון: 
${data.phone}
הנדון: 
 אישור הזמנת שייט ביאכטה
אנו שמחים לאשר את הזמנת השייט שלך עם " לידר הפלגות ". פרטי הזמנתך הם כדלקמן:
* תאריך ההפלגה: ${data.date}
* שעת התחלה: ${data.startTime}
* שעת סיום: ${data.endTime}
    זמן  נטו:  
מהשעה רשומה עד לשעה רשומה . 
לא תנתן זמן נוסף.
* היאכטה תשוב לרציף כ-15 דקות לפני תום הזמן.
 שם יאכטה :
*  "   ${data.yachtName} " 
 עד ${maxPassengers} מפליגים! 
(נחשב כל נושם , גם תינוקות)
* או כל יאכטה אחרת בצי החברה המתאימה לכמות המפליגים שצוינה בהזמנה.
  
* נקודת יציאה:
* מרינה ${locationName} .
* ${address}

פרטי תשלום:
* מחיר הזמנה הכולל:        
 סה"כ ${finalPrice} ₪ ${priceNote}. 
* מקדמה נדרשת: ${data.downPayment} ₪
 את המקדמה ניתן להעביר 
כרטיס אשראי (עסקה טלפונית או קישור לתשלום מאובטח) 
באמצעות אפליקציית PayBox,
 או העברה בנקאית ,  
 הערה: ההזמנה תיכנס לתוקף רק לאחר קבלת המקדמה ואישור הלקוח/ה על פרטי ההזמנה.
 יתרת תשלום: ${finalRemaining} ₪

* יתרת התשלום תשולם במועד ההפלגה במזומן, 
או באמצעות כרטיס אשראי (עסקה טלפונית או קישור לתשלום מאובטח).
מחיר ההזמנה כולל:
* בקבוק שמפניה 
* בלונים בתוך היאכטה.
* שלט "מזל טוב".
* מים 
המחיר אינו כולל שירות/טיפ לסקיפר.
-----------------------------
מומלץ להשתמש בכדורים נגד בחילה ללא מרשם כשעה לפני תחילת השייט!
1.  הגעה בזמן: יש להגיע בשעה הנקובה על מנת לקבל תדריך בטיחותי ולסיים את כל סידורי הניהול לפני היציאה.
2.  רחצה בים: הרחצה בים היא באחריות המתרחץ/ת בלבד.
* הירידה למים תתאפשר אך ורק על פי החלטתו הבלעדית של הסקיפר ובמידה ותנאי הים מאפשרים זאת.
* לא תתאפשר רחצה בשעות החשיכה.
* אין גרירת אבוב .
3.  איחור לקוח: כל איחור של הלקוח/ה ייגרע מזמן השייט הכולל שנקבע מראש. אין החזר כספי בגין איחור.
4.  ביטוח: היאכטות מבוטחות בביטוח צד ג'.
5.  ניקיון ואחריות לציוד אישי:
* במידה ואתם מביאים איתכם אוכל ושתייה, אנא דאגו לפנות את האשפה ולהשאיר את היאכטה נקייה לפני סיום ההפלגה. 
* במקרה והיאכטה לא תישאר נקייה, או אם פינוי היאכטה יתבצע לאחר המועד הנקוב, תחויבו בסך השווה לעלות שעת הפלגה אחת.
 
* אחריות במקרה של אובדן או נזק לטלפון סלולרי או כל פריט אחר הנופל למים תחול על המפליג/ה באופן בלעדי.
6.  ליווי: חובה נוכחות של מלווה מעל גיל 16 (מטעם הלקוח/ה) בכל הפלגה.
7.  אלכוהול ואיסורים:
*  שתיית אלכוהול מתחת לגיל 18 אסורה בהחלט.
* אין להגיע להפלגה עם נרגילה או לעלות ליאכטה עם נרגילה.
* אסור בהחלט להפיץ קונפטי ביאכטה.
* אין אפשרות להגיע להפלגה עם מנגל או לעשות ברביקיו על היאכטה.
8.  אחריות אישית: על המזמין/ה חלה האחריות הבלעדית להבהיר את כל תנאי ההסכם המפורטים בחוזה זה לכל המוזמנים/ות מטעמו/ה.
--------------------------------------
 מדיניות ביטולים ושינויים
9.  מזג אוויר ותנאי ים:
* האירוע עשוי להידחות במידה ומזג האוויר אינו מאפשר את קיומו בצורה בטוחה. 
במקרה כזה, ההפלגה תתואם למועד חלופי קרוב ביותר האפשרי. 
לא יינתן החזר כספי או פיצוי בגין שינוי מועד עקב מזג אוויר.
* "לידר הפלגות" אינה אחראית למצב הים ואינה אחראית לתחושות אינדיבידואליות של לקוחותיה בעניין מצב הים ומזג האוויר.
10. ביטול הזמנה מול החזר כספי:
* ביטול הזמנה כנגד החזר כספי  (למעט דמי טיפול) יתאפשר רק עד 14 ימים ממועד הפעילות. בכל מקרה, ינוכו דמי טיפול בסך 400 ₪.
* במידה ויתבצע ביטול הזמנה בין 14 ימים ל-48 שעות ממועד הפעילות, ייגבו 50% מעלות האירוע.
* במקרה של ביטול הזמנה בתוך 48 שעות ממועד האירוע, יחויב המזמין/ה במחיר המלא של ההזמנה.
11. כוח עליון: במקרה של נסיבות בלתי צפויות שאינן בשליטת הספק, כגון פרוץ מלחמה, אסון טבע או כל אירוע המוגדר כ"כוח עליון", תינתן למזמין/ה אפשרות לדחות את מועד האירוע למועד חלופי בלבד, ללא החזר כספי.
---------------------------------------
  הוראות הגעה 
יש להגיע למרינה , כ-10 דקות לפני המועד שנקבע. 
סקיפר יקבל את פניכם ויוביל אתכם ליאכטה.
מספר טלפון של סקיפר  
וקישור לוייז - ישלח לכם יום אחד לפני מועד שייט .
-------------------------------
אישור הלקוח/ה:
אני מאשר/ת  שקראתי והבנתי את כל פרטי ההזמנה ואת תנאי החוזה המפורטים לעיל, ומסכים להם.
נא לאשר את פרטי ההזמנה ואת תנאי החוזה על ידי כתיבה מילת 
 מאשר / מאשרת.
מאשר/ת פרטים בהזמנה : ???`;

  // --- 3. ГЕНЕРАЦИЯ БЛАНКА 2 (СУПЕРВАЙЗЕР) ---
    const extrasMap = {
        "champagne": "בקבוק שמפניה",
        "fishing": "עד 13 מפליגים או 8 דייגים רק יאכטה לי-ים - דייג , ציוד דייג. פתיונות,חכות.",
        "breakfast": "ארוחת בוקר",
        "dinner": "ארוחת ערב"
    };

    let extraContent = "ללא";
    if (data.selectedExtra && extrasMap[data.selectedExtra]) {
        extraContent = extrasMap[data.selectedExtra];
    }

    // Локальные переменные для Бланка 2
    let b2_Remaining = data.price - data.downPayment; // По умолчанию
    let line11 = "";
    let line12 = "";

    // ЛОГИКА ОТОБРАЖЕНИЯ СТРОК
    if (data.paymentMethod === "credit_card") {
        // Оплата КРЕДИТКОЙ (деньги у поставщика)
        line11 = `11. שולם אצלכם ${data.downPayment} ₪`;
        
        // Обычно: Агенту причитается комиссия. Если Лидер (комиссия 0) -> 0.
        let amountDueAgent = commission;
        line12 = `12. מגיע לי ${amountDueAgent} ₪`; 
        
    } else {
        // Оплата ПЕЙБОКС/ПЕРЕВОД (деньги у агента)
        line11 = `11. שולם אצלי ${data.downPayment} ₪`;

        if (isLeader) {
            // СПЕЦ. ЛОГИКА ЛИДЕР: 
            // 1. Клиент как бы ничего не платил поставщику -> Остаток полный
            b2_Remaining = data.price;
            // 2. Поставщику причитается ВСЯ сумма (так как аванс у агента, а комиссия 0)
            line12 = `12. מגיע לכם ${data.price} ₪`;
        } else {
            // ОБЫЧНАЯ ЛОГИКА:
            // Поставщику причитается: Аванс - Комиссия
            let amountDueSupplier = data.downPayment - commission;
            line12 = `12. מגיע לכם ${amountDueSupplier} ₪`;
        }
    }

    // Сборка текста (БЕЗ ЗАГОЛОВКА)
    const blank2 = `1. מפנה : דניאל סוכן
2. הזמנה לתאריך ${data.date}
3. משעה ${data.startTime} עד ${data.endTime}
4. לקוח: ${b2_Name}
5. טלפון : ${b2_Phone}
6. יאכטה ${data.yachtName} :
7. עד ${data.passengers} מפליגים
8. תוספת: {${extraContent}}
9. מחיר לקוח/עלות: ${data.price} ₪
10. נשאר תשלום לקוח : ${b2_Remaining} ₪
${line11}
${line12}
13. עמלת מפנה 20 אחוז :${commission} ₪
14. נא להחזיר / לרשום לי מספר הזמנה
---------------------------------------------`;

// --- 4. EXCEL 3 (Детальная - Обновленная логика) ---
    
    // 1. Длительность (число)
    let duration = parseInt(data.endTime) - parseInt(data.startTime);
    if (isNaN(duration)) duration = 0;

    // 2. Логика "Остаток клиента" (совпадает с Таблицей 4)
    let ex3_Remaining = data.price - data.downPayment;
    if (isLeader && data.paymentMethod !== "credit_card") {
        ex3_Remaining = data.price;
    }

    // 3. Логика "Им причитается" (Due to Supplier)
    const ex3_DueToSupplier = netCost - paidAtSupplier;

    // 4. Логика "Мне причитается" (Due to Agent)
    let ex3_DueToAgent = commission - paidAtAgent;
    if (ex3_DueToAgent < 0) ex3_DueToAgent = 0;

    // 5. Сборка строки
    // Колонки по порядку из твоего заголовка:
    // 1. Date, 2. Order(?), 3. Name, 4. Nick, 5. Phone, 6. Yacht, 7. Time, 
    // 8. Price, 9. Hours, 10. Cost(Price), 11. Net(AfterComm), 12. Remaining, 
    // 13. PaidSup, 14. PaidAg, 15. DueSup, 16. DueAg, 17. Comm, 18. Notes(Empty) ...
    
    const excel3 = `${data.date}\t?\t${data.clientName}\t${data.clientName}\t${data.phone}\t${data.yachtName}\t${data.startTime}-${data.endTime}\t${data.price}\t${duration}\t${data.price}\t${netCost}\t${ex3_Remaining}\t${paidAtSupplier}\t${paidAtAgent}\t${ex3_DueToSupplier}\t${ex3_DueToAgent}\t${commission}\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`;

// --- 4. EXCEL 4 (Сводная - С учетом Лидера) ---
    
    // 1. Длительность (только число)
    // duration already calculated above, reuse it

    // 2. Логика "Остаток" (Remaining / נשאר לתשלום לקוח)
    // Базовая логика: Цена - Аванс
    let ex4_Remaining = data.price - data.downPayment;

    // НОВОЕ ПРАВИЛО: Если Лидер И деньги у Агента (не кредитка),
    // то для владельца яхты "Остаток" равен Полной Цене.
    if (isLeader && data.paymentMethod !== "credit_card") {
        ex4_Remaining = data.price;
    }

    // 3. Логика "מגיע לכם" (Due to Supplier / Им причитается)
    // Формула: Чистая цена (Net) - То, что уже у поставщика
    // Пример (Лидер Paybox): 1590 - 0 = 1590.
    const ex4_DueToSupplier = netCost - paidAtSupplier;

    // 4. Логика "מגיע לי" (Due to Agent / Мне причитается)
    // Формула: Комиссия - То, что уже у агента
    let ex4_DueToAgent = commission - paidAtAgent;
    if (ex4_DueToAgent < 0) ex4_DueToAgent = 0;

    // 5. Сборка строки (Date | ? | Dur | Cost | Net | Remaining | PaidSup | PaidAg | DueSup | DueAg | Comm | Notes)
    const excel4 = `${data.date}\t?\t${duration}\t${data.price}\t${netCost}\t${ex4_Remaining}\t${paidAtSupplier}\t${paidAtAgent}\t${ex4_DueToSupplier}\t${ex4_DueToAgent}\t${commission}\t`;

    return {
        file1_BlankClient: blank1,
        file2_BlankSupplier: blank2,
        file3_ExcelDetailed: excel3,
        file4_ExcelSummary: excel4
    };
}