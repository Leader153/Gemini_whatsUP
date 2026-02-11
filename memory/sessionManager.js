const sessions = {};

function initSession(sessionId, channel = 'voice') {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            channel: channel,
            history: [],
            pendingFunctionCalls: null,
            gender: null,
            userPhone: null,
            domain: null, // Хранит тему: Yachts / Terminals
            createdAt: Date.now()
        };
        console.log(`🆕 [MEMORY] Новая сессия: ${sessionId}`);
    }
}

function addToHistory(sessionId, role, text) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].history.push({ role, parts: [{ text }] });
}

function addFunctionInteractionToHistory(sessionId, functionCall, functionResponse) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].history.push({
        role: 'model',
        parts: [{ functionCall }]
    });
    sessions[sessionId].history.push({
        role: 'function',
        parts: [{ functionResponse: { name: functionCall.name, response: functionResponse } }]
    });
}

function getHistory(sessionId) {
    return sessions[sessionId] ? sessions[sessionId].history : [];
}

function setPendingFunctionCalls(sessionId, functionCalls, context = null) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].pendingFunctionCalls = { functionCalls, context };
}

function getAndClearPendingFunctionCalls(sessionId) {
    if (!sessions[sessionId] || !sessions[sessionId].pendingFunctionCalls) return null;
    const data = sessions[sessionId].pendingFunctionCalls;
    sessions[sessionId].pendingFunctionCalls = null;
    return data;
}

function setGender(sessionId, gender) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].gender = gender;
}
function getGender(sessionId) { return sessions[sessionId] ? sessions[sessionId].gender : null; }

function setUserPhone(sessionId, phone) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].userPhone = phone;
}
function getUserPhone(sessionId) { return sessions[sessionId] ? sessions[sessionId].userPhone : null; }

function setDomain(sessionId, domain) {
    if (!sessions[sessionId]) initSession(sessionId);
    sessions[sessionId].domain = domain;
}
function getDomain(sessionId) { return sessions[sessionId] ? sessions[sessionId].domain : null; }

module.exports = {
    initSession, addToHistory, addFunctionInteractionToHistory, getHistory,
    setPendingFunctionCalls, getAndClearPendingFunctionCalls,
    setGender, getGender, setUserPhone, getUserPhone,
    setDomain, getDomain
};