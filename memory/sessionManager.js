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
            createdAt: Date.now() // Время создания сессии
        };
        console.log(`🆕 Новая сессия создана для: ${sessionId} (канал: ${channel})`);
    }
}

/**
 * Добавляет сообщение в историю сессии.
 * @param {string} sessionId
 * @param {string} role - 'user' или 'model'
 * @param {string} text - Текст сообщения
 */
function addToHistory(sessionId, role, text) {
    if (!sessions[sessionId]) {
        initSession(sessionId);
    }
    sessions[sessionId].history.push({
        role: role,
        parts: [{ text: text }]
    });
}

/**
 * Добавляет функциональный ответ в историю.
 * @param {string} sessionId 
 * @param {Object} functionCall - Объект вызова функции от модели
 * @param {Object} functionResponse - Результат выполнения функции
 */
function addFunctionInteractionToHistory(sessionId, functionCall, functionResponse) {
    if (!sessions[sessionId]) initSession(sessionId);

    // Добавляем вызов функции (role: model)
    sessions[sessionId].history.push({
        role: 'model',
        parts: [{ functionCall: functionCall }]
    });

    // Добавляем ответ функции (role: function)
    sessions[sessionId].history.push({
        role: 'function',
        parts: [{ functionResponse: { name: functionCall.name, response: functionResponse } }]
    });
}


/**
 * Возвращает полную историю для sessionId.
 * @param {string} sessionId
 * @returns {Array}
 */
function getHistory(sessionId) {
    return sessions[sessionId] ? sessions[sessionId].history : [];
}

/**
 * Сохраняет вызовы функций для последующей обработки.
 * @param {string} sessionId 
 * @param {Array} functionCalls 
 */
function setPendingFunctionCalls(sessionId, functionCalls) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].pendingFunctionCalls = functionCalls;
}

/**
 * Получает и очищает сохраненные вызовы функций.
 * @param {string} sessionId 
 * @returns {Array|null}
 */
function getAndClearPendingFunctionCalls(sessionId) {
    if (!sessions[sessionId] || !sessions[sessionId].pendingFunctionCalls) return null;
    const calls = sessions[sessionId].pendingFunctionCalls;
    sessions[sessionId].pendingFunctionCalls = null;
    return calls;
}
/**
 * Устанавливает пол для текущей сессии.
 */
function setGender(sessionId, gender) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].gender = gender;
    console.log(`👤 Пол для ${sessionId} установлен: ${gender}`);
}

/**
 * Получает пол из текущей сессии.
 */
function getGender(sessionId) {
    return sessions[sessionId] ? sessions[sessionId].gender : null;
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
};