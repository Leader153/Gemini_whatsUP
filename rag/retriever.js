/**
 * RAG Retriever - поиск релевантных документов
 */

const { getVectorStore } = require('./vectorStore');

const DOMAIN_KEYWORDS = {
    Terminals: ['terminal', 'nova', 'modu', 'מסוף', 'מסופון', 'קופה', 'אשראי', 'טרמינל', 'נובה'],
    Yachts: ['yacht', 'joy-be', 'sailing', 'cruise', 'יאכטה', 'שייט', 'הפלגה'],
};

function inferDomain(query) {
    if (!query) return null;
    const lowerCaseQuery = query.toLowerCase();

    for (const domain in DOMAIN_KEYWORDS) {
        for (const keyword of DOMAIN_KEYWORDS[domain]) {
            if (lowerCaseQuery.includes(keyword)) {
                return domain;
            }
        }
    }
    return null;
}

async function retrieveContext(query, k = 3, domain = null) {
    // ЗАЩИТА: Если запрос пустой, не идем в базу
    if (!query || query.trim() === "") {
        console.log('[RAG_DEBUG] ⚠️ Пустой запрос, поиск пропущен.');
        return [];
    }

    try {
        const vectorStore = await getVectorStore();
        const effectiveDomain = domain || inferDomain(query);

        let filter = undefined;
        if (effectiveDomain) {
            filter = { "Domain": effectiveDomain };
        }

        console.log(`[RAG_DEBUG] Searching for: "${query}" (Domain: ${effectiveDomain || 'ALL'})`);

        const resultsWithScore = await vectorStore.similaritySearchWithScore(query, k, filter);

        if (resultsWithScore.length === 0) {
            console.log('[RAG_DEBUG] ⚠️ No documents found');
            return [];
        }

        console.log(`[RAG_DEBUG] ✅ Found ${resultsWithScore.length} documents:`);
        resultsWithScore.forEach(([doc, score], i) => {
            console.log(`  ${i + 1}. [Score: ${score.toFixed(4)}] Product: ${doc.metadata.Product}`);
        });

        return resultsWithScore.map(([doc, score]) => doc);

    } catch (error) {
        console.error('❌ Ошибка поиска документов:', error.message);
        return [];
    }
}

async function getContextForPrompt(query, k = 3, domain = null) {
    const docs = await retrieveContext(query, k, domain);

    if (docs.length === 0) {
        return '';
    }

    const context = docs
        .map((doc, index) => `[Документ ${index + 1}]\n${doc.pageContent}`)
        .join('\n\n---\n\n');

    return context;
}

module.exports = { retrieveContext, getContextForPrompt };