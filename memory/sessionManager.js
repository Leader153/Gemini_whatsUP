const sessions = {};

/**
 * Инициализирует или сбрасывает сессию для указанного ID.
 * @param {string} sessionId - ID сессии (CallSid для голоса, номер для WhatsApp/SMS)
 * @param {string} channel - Канал связи: 'voice', 'whatsapp', 'sms'
 */
function initSession(sessionId, channel = 'voice') {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            channel: channel, // Канал связи: 'voice', 'whatsapp', 'sms'
            history: [], // Массив объектов { role: 'user'|'model', parts: [{ text: '...' }] }
            pendingFunctionCalls: null, // Для хранения вызовов функций между этапами Redirect
            gender: null, // Пол собеседника: 'male', 'female' или null
            clientPhone: null, // Номер телефона клиента
            createdAt: Date.now() // Время создания сессии
        };
        console.log(`🆕 Новая сессия создана для: ${sessionId} (канал: ${channel})`);
    }
}

/**
 * Сохраняет номер телефона клиента в сессии.
 * @param {string} sessionId 
 * @param {string} phone 
 */
function setClientPhone(sessionId, phone) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].clientPhone = phone;
}

/**
 * Получает номер телефона клиента из сессии.
 * @param {string} sessionId 
 * @returns {string|null}
 */
function getClientPhone(sessionId) {
    return sessions[sessionId] ? sessions[sessionId].clientPhone : null;
}

/**
 * Добавляет сообщение в историю сессии.
 * @param {string} callSid
 * @param {string} role - 'user' или 'model'
 * @param {string} text - Текст сообщения
 */
function addToHistory(callSid, role, text) {
    if (!sessions[callSid]) {
        initSession(callSid);
    }
    sessions[callSid].history.push({
        role: role,
        parts: [{ text: text }]
    });
}

/**
 * Добавляет функциональный ответ в историю.
 * @param {string} callSid 
 * @param {Object} functionCall - Объект вызова функции от модели
 * @param {Object} functionResponse - Результат выполнения функции
 */
function addFunctionInteractionToHistory(callSid, functionCall, functionResponse) {
    if (!sessions[callSid]) initSession(callSid);

    // Добавляем вызов функции (role: model)
    sessions[callSid].history.push({
        role: 'model',
        parts: [{ functionCall: functionCall }]
    });

    // Добавляем ответ функции (role: function)
    sessions[callSid].history.push({
        role: 'function',
        parts: [{ functionResponse: { name: functionCall.name, response: functionResponse } }]
    });
}


/**
 * Возвращает полную историю для CallSid.
 * @param {string} callSid
 * @returns {Array}
 */
function getHistory(callSid) {
    return sessions[callSid] ? sessions[callSid].history : [];
}

/**
 * Сохраняет вызовы функций для последующей обработки.
 * @param {string} callSid 
 * @param {Array} functionCalls 
 */
function setPendingFunctionCalls(callSid, functionCalls) {
    if (!sessions[callSid]) initSession(callSid);
    sessions[callSid].pendingFunctionCalls = functionCalls;
}

/**
 * Получает и очищает сохраненные вызовы функций.
 * @param {string} callSid 
 * @returns {Array|null}
 */
function getAndClearPendingFunctionCalls(callSid) {
    if (!sessions[callSid] || !sessions[callSid].pendingFunctionCalls) return null;
    const calls = sessions[callSid].pendingFunctionCalls;
    sessions[callSid].pendingFunctionCalls = null;
    return calls;
}
/**
 * Устанавливает пол для текущей сессии.
 */
function setGender(callSid, gender) {
    if (!sessions[callSid]) initSession(callSid);
    sessions[callSid].gender = gender;
    console.log(`👤 Пол для ${callSid} установлен: ${gender}`);
}

/**
 * Получает пол из текущей сессии.
 */
function getGender(callSid) {
    return sessions[callSid] ? sessions[callSid].gender : null;
}

/**
 * Получает канал связи для сессии.
 * @param {string} sessionId
 * @returns {string} 'voice', 'whatsapp', 'sms' или null
 */
function getChannel(sessionId) {
    return sessions[sessionId] ? sessions[sessionId].channel : null;
}

module.exports = {
    initSession,
    addToHistory,
    addFunctionInteractionToHistory,
    getHistory,
    setPendingFunctionCalls,
    getAndClearPendingFunctionCalls,
    setGender,
    getGender,
    getChannel,
    setClientPhone,
    getClientPhone
};
