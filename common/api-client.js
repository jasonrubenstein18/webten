// API Client for making calls through the secure proxy server
const { OPENAI_BASE_URL, GROK_BASE_URL, CONFIG } = require('./config.js');

class APIClient {
    constructor() {
        this.cache = new Map();
    }

    // Generic API call method
    async makeRequest(url, options = {}) {
        const cacheKey = `${url}-${JSON.stringify(options)}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CONFIG.EMBEDDING_CACHE_EXPIRY) {
                return cached.data;
            }
            this.cache.delete(cacheKey);
        }

        try {
            const response = await fetch(url, {
                method: options.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: AbortSignal.timeout(CONFIG.API_TIMEOUT)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Cache successful responses
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // OpenAI API calls
    async openaiChatCompletion(messages, model = 'gpt-4', temperature = 0.7) {
        return this.makeRequest(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            body: {
                model,
                messages,
                temperature,
                max_tokens: 4000
            }
        });
    }

    async openaiEmbeddings(texts) {
        const response = await this.makeRequest(`${OPENAI_BASE_URL}/embeddings`, {
            method: 'POST',
            body: {
                model: CONFIG.EMBEDDING_MODEL,
                input: Array.isArray(texts) ? texts : [texts]
            }
        });
        return response.data;
    }

    // Grok API calls
    async grokChatCompletion(messages, model = 'grok-3-latest', temperature = 0.7) {
        return this.makeRequest(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            body: {
                model,
                messages,
                temperature,
                max_tokens: 4000
            }
        });
    }

    // Batch processing with rate limiting
    async batchProcess(items, processor, batchSize = CONFIG.EMBEDDING_BATCH_SIZE) {
        const results = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(item => processor(item))
            );
            results.push(...batchResults);
            
            // Add delay between batches to respect rate limits
            if (i + batchSize < items.length) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
            }
        }
        
        return results;
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Get cache stats
    getCacheStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;
        
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp < CONFIG.EMBEDDING_CACHE_EXPIRY) {
                validEntries++;
            } else {
                expiredEntries++;
            }
        }
        
        return {
            total: this.cache.size,
            valid: validEntries,
            expired: expiredEntries
        };
    }
}

// Export singleton instance
const apiClient = new APIClient();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiClient;
} 