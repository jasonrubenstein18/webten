// Shared configuration for the extension

// OpenAI API configuration
const OPENAI_API_KEY = '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';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Grok API configuration
const GROK_API_KEY = 'xai-JGM7BR2dAtEmNkCka0UPsJ3ANql1UZrs5gtSXRl5Lxd6y0k5A0FUhAiV6j4nRr8cYD4o5hIXYqXh6y3t';
const GROK_BASE_URL = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-3-latest';

// General Configuration
const CONFIG = {
    MAX_PAGES: 20,
    EVENTS_PER_PAGE: 200, // For Kalshi
    MARKETS_PER_PAGE: 200, // For Polymarket
    MAX_RELEVANT_MARKETS: 8,
    MAX_MARKETS_FOR_ANALYSIS: 4000,
    API_TIMEOUT: 30000,
    ANALYSIS_TIMEOUT: 180000,
    EMBEDDING_MODEL: 'text-embedding-ada-002',
    EMBEDDING_BATCH_SIZE: 20,
    EMBEDDING_CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_DELAY: 500,
    MAX_STORAGE_SIZE: 5 * 1024 * 1024,
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000,
    MAX_MISPRICING_ANALYSES: 100,
    MISPRICING_CACHE_EXPIRY: 60 * 60 * 1000
}; 