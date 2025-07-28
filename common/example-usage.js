// Example usage of the secure API client
// This replaces direct API calls with proxy-based calls

const apiClient = require('./api-client.js');

// Example: Analyze market content
async function analyzeMarketContent(content) {
    try {
        // Get embeddings for content analysis
        const embeddings = await apiClient.openaiEmbeddings(content);
        
        // Generate market suggestions using Grok
        const suggestions = await apiClient.grokChatCompletion([
            {
                role: 'system',
                content: 'You are a market analysis expert. Suggest relevant prediction markets based on the given content.'
            },
            {
                role: 'user',
                content: `Analyze this content and suggest relevant markets: ${content}`
            }
        ]);

        return {
            embeddings,
            suggestions: suggestions.choices[0].message.content
        };
    } catch (error) {
        console.error('Analysis failed:', error);
        throw error;
    }
}

// Example: Batch process multiple items
async function batchProcessMarkets(markets) {
    try {
        const results = await apiClient.batchProcess(
            markets,
            async (market) => {
                // Process each market individually
                return await analyzeMarketContent(market.description);
            },
            5 // Process 5 at a time
        );
        
        return results;
    } catch (error) {
        console.error('Batch processing failed:', error);
        throw error;
    }
}

// Example: Check cache performance
function checkCachePerformance() {
    const stats = apiClient.getCacheStats();
    console.log('Cache performance:', stats);
    return stats;
}

// Example: Clear cache if needed
function clearCache() {
    apiClient.clearCache();
    console.log('Cache cleared');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeMarketContent,
        batchProcessMarkets,
        checkCachePerformance,
        clearCache
    };
} 