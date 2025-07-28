// Extension API Client for secure proxy communication
// This replaces direct API calls with proxy-based calls

// Get configuration from global scope (set by config.js)
// Use var declarations to allow redeclaration and prevent errors
var OPENAI_BASE_URL = self.OPENAI_BASE_URL;
var GROK_BASE_URL = self.GROK_BASE_URL;
var CONFIG = self.CONFIG;

// Only declare the class if it doesn't already exist
if (typeof ExtensionAPIClient === 'undefined') {
    var ExtensionAPIClient = class ExtensionAPIClient {
    constructor() {
        this.cache = new Map();
    }

    // Generic API call method with timeout and retry logic
    async makeRequest(url, options = {}, timeout = CONFIG.API_TIMEOUT) {
        const cacheKey = `${url}-${JSON.stringify(options)}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CONFIG.EMBEDDING_CACHE_EXPIRY) {
                return cached.data;
            }
            this.cache.delete(cacheKey);
        }

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('API request timeout')), timeout);
        });

        try {
            const fetchPromise = fetch(url, {
                method: options.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            // Race between fetch and timeout
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            // Cache successful responses
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('API request error:', error.message);
            throw error;
        }
    }

    // OpenAI Embeddings
    async generateEmbedding(text, retryAttempt = 0) {
        try {
            console.log(`Generating embedding for text (attempt ${retryAttempt + 1}):`, text.substring(0, 100) + '...');
            
            const response = await this.makeRequest(`${OPENAI_BASE_URL}/embeddings`, {
                method: 'POST',
                body: {
                    model: CONFIG.EMBEDDING_MODEL,
                    input: text,
                    encoding_format: 'float'
                }
            });

            if (!response.data || !response.data[0] || !response.data[0].embedding) {
                throw new Error('Invalid response format from OpenAI API');
            }

            return response.data[0].embedding;
        } catch (error) {
            console.error(`Error generating embedding (attempt ${retryAttempt + 1}):`, error.message);
            
            // Retry logic
            if (retryAttempt < CONFIG.MAX_RETRY_ATTEMPTS - 1) {
                const isRetryable = error.message.includes('timeout') || 
                                  error.message.includes('Failed to fetch') ||
                                  error.message.includes('NetworkError') ||
                                  error.message.includes('429') || // Rate limit
                                  error.message.includes('500') || // Server error
                                  error.message.includes('502') || // Bad gateway
                                  error.message.includes('503');   // Service unavailable
                
                if (isRetryable) {
                    const delay = this.getRetryDelay(retryAttempt);
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.generateEmbedding(text, retryAttempt + 1);
                }
            }
            
            throw error;
        }
    }

    // OpenAI Chat Completions
    async openaiChatCompletion(messages, model = 'gpt-4o-mini', temperature = 0.3, maxTokens = 200) {
        const response = await this.makeRequest(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            body: {
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            }
        });

        if (!response.choices || !response.choices[0] || !response.choices[0].message) {
            throw new Error('Invalid response format from OpenAI API');
        }

        return response.choices[0].message.content.trim();
    }

    // Grok Chat Completions
    async grokChatCompletion(messages, model = 'grok-3-latest', temperature = 0.3, maxTokens = 200) {
        const response = await this.makeRequest(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            body: {
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            }
        });

        if (!response.choices || !response.choices[0] || !response.choices[0].message) {
            throw new Error('Invalid response format from Grok API');
        }

        return response.choices[0].message.content.trim();
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

    // Retry delay calculation
    getRetryDelay(attempt) {
        return CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
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
}

// Export singleton instance
// Only create the instance if it doesn't already exist
if (typeof apiClient === 'undefined') {
    var apiClient = new ExtensionAPIClient();
}

// Export for use in other modules (browser-compatible)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiClient;
}

// Make available globally for browser environment
if (typeof window === 'undefined' && typeof self !== 'undefined') {
    // Service worker environment
    self.apiClient = apiClient;
} 