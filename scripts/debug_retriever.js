const { getContextForPrompt } = require('./rag/retriever');
require('dotenv').config();

async function debug() {
    const queries = [
        'מה המחיר של מסופון נובה?',
        'האם יש לו וויפי?',
        'Nova 55 F wifi',
        'יש לו מדפסת תרמית?',
        'האם זה כולל סליקה?',
        'יאכטה Joy-BE מחיר'
    ];

    for (const query of queries) {
        console.log(`\n--- Query: "${query}" ---`);
        try {
            const context = await getContextForPrompt(query, 3);
            console.log(`Context Length: ${context.length}`);
            if (context) {
                console.log(`Context Preview: ${context.substring(0, 300)}...`);
            } else {
                console.log('Context is EMPTY');
            }
        } catch (e) {
            console.error('Error querying:', e.message);
        }
    }
}

debug();
