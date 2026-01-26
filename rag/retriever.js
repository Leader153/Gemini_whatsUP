/**
 * RAG Retriever - поиск релевантных документов
 * Семантический поиск с поддержкой иврита
 */

const { getVectorStore } = require('./vectorStore');

const DOMAIN_KEYWORDS = {
    Terminals: ['terminal', 'nova', 'modu', 'מסוף', 'מסופון', 'קופה', 'אשראי', 'טרמינל', 'נובה'],
    Yachts: ['yacht', 'joy-be', 'sailing', 'cruise', 'יאכטה', 'שייט', 'הפלגה'],
};

/**
 * Определяет домен (категорию) на основе ключевых слов в запросе.
 * @param {string} query - Запрос пользователя.
 * @returns {string|null} - Имя домена ('Terminals' или 'Yachts') или null.
 */
function inferDomain(query) {
    if (!query) return null;
    const lowerCaseQuery = query.toLowerCase();

    for (const domain in DOMAIN_KEYWORDS) {
        for (const keyword of DOMAIN_KEYWORDS[domain]) {
            if (lowerCaseQuery.includes(keyword)) {
                console.log(`🔍 Домен определен: ${domain} (по слову: "${keyword}")`);
                return domain;
            }
        }
    }
    console.log('⚠️ Домен не определен, будет выполнен поиск по всей базе.');
    return null;
}


/**
 * Найти релевантные документы по запросу, с фильтрацией по домену.
 * @param {string} query - Запрос пользователя
 * @param {number} k - Количество документов для возврата
 * @param {string} [domain] - Опциональный домен для строгой фильтрации
 * @returns {Promise<Array>} Массив релевантных документов
 */
async function retrieveContext(query, k = 3, domain = null) {
    try {
        const vectorStore = await getVectorStore();
        
        // FIX: Prioritize explicitly passed domain over inferred one
        const effectiveDomain = domain || inferDomain(query);

        let filter = undefined;
        if (effectiveDomain) {
            filter = {
                "Domain": effectiveDomain
            };
        }

        console.log(`[RAG_DEBUG] Searching for: "${query}" (Domain: ${effectiveDomain || 'ALL'})`);

        // Поиск с оценкой релевантности
        const resultsWithScore = await vectorStore.similaritySearchWithScore(query, k, filter);

        if (resultsWithScore.length === 0) {
            console.log('[RAG_DEBUG] ⚠️ No documents found');
            return [];
        }

        console.log(`[RAG_DEBUG] ✅ Found ${resultsWithScore.length} documents:`);
        resultsWithScore.forEach(([doc, score], i) => {
            console.log(`  ${i + 1}. [Score: ${score.toFixed(4)}] ${doc.pageContent.substring(0, 100)}...`);
        });

        // Возвращаем только документы
        return resultsWithScore.map(([doc, score]) => doc);

    } catch (error) {
        console.error('❌ Ошибка поиска документов:', error.message);
        return [];
    }
}

/**
 * Получить контекст для промпта Gemini
 * @param {string} query - Запрос пользователя
 * @param {number} k - Количество документов
 * @param {string} [domain] - Опциональный домен для строгой фильтрации
 * @returns {Promise<string>} Контекст в виде строки
 */
async function getContextForPrompt(query, k = 3, domain = null) {
    const docs = await retrieveContext(query, k, domain);

    if (docs.length === 0) {
        return '';
    }

    // Объединяем содержимое документов в один контекст
    const context = docs
        .map((doc, index) => `[Документ ${index + 1}]\n${doc.pageContent}`)
        .join('\n\n---\n\n');

    return context;
}

module.exports = { retrieveContext, getContextForPrompt };
