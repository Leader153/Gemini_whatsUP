const { getVectorStore } = require('../rag/vectorStore');
require('dotenv').config();

async function testDirect() {
    const vectorStore = await getVectorStore();
    const query = 'מדפסת'; // printer
    console.log(`Searching for: "${query}"`);

    // Test 1: No filter
    const res1 = await vectorStore.similaritySearch(query, 3);
    console.log(`Test 1 (No filter) results: ${res1.length}`);
    if (res1.length > 0) {
        console.log(`First result content sample: ${res1[0].pageContent.substring(0, 50)}...`);
    }

    // Test 2: With filter
    const res2 = await vectorStore.similaritySearch(query, 3, { "Domain": "Terminals" });
    console.log(`Test 2 (Filter: Terminals) results: ${res2.length}`);
}

testDirect();
