const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_BASE_URL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-3-latest';

// Validate required environment variables
if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required in .env file');
    process.exit(1);
}

if (!GROK_API_KEY) {
    console.error('GROK_API_KEY is required in .env file');
    process.exit(1);
}

// Generate config.js content
const configContent = `// Auto-generated config file - DO NOT EDIT MANUALLY
// This file is generated from environment variables during build

// OpenAI API configuration
const OPENAI_API_KEY = '${OPENAI_API_KEY}';
const OPENAI_BASE_URL = '${OPENAI_BASE_URL}';

// Grok API configuration
const GROK_API_KEY = '${GROK_API_KEY}';
const GROK_BASE_URL = '${GROK_BASE_URL}';
const GROK_MODEL = '${GROK_MODEL}';

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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OPENAI_API_KEY,
        OPENAI_BASE_URL,
        GROK_API_KEY,
        GROK_BASE_URL,
        GROK_MODEL,
        CONFIG
    };
}
`;

// Write config.js file
const configPath = path.join(__dirname, '..', 'common', 'config.js');
fs.writeFileSync(configPath, configContent);

console.log('Generated config.js from environment variables');
console.log(`Config file location: ${configPath}`);
console.log('API keys are now loaded from environment variables'); 