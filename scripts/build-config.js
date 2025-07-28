const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read environment variables
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000';

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required in .env file');
    process.exit(1);
}

if (!process.env.GROK_API_KEY) {
    console.error('GROK_API_KEY is required in .env file');
    process.exit(1);
}

// Generate config.js content
const configContent = `// Auto-generated config file - DO NOT EDIT MANUALLY
// This file is generated from environment variables during build

// Prevent redeclaration if already loaded
if (typeof self.PROXY_URL === 'undefined') {
    // Proxy server configuration (API keys are kept secure on the server)
    self.PROXY_URL = '${PROXY_URL}';

    // API endpoints (routed through secure proxy)
    self.OPENAI_BASE_URL = '${PROXY_URL}/api/openai';
    self.GROK_BASE_URL = '${PROXY_URL}/api/grok';
    self.GROK_MODEL = 'grok-3-latest';
}

// General Configuration
if (typeof self.CONFIG === 'undefined') {
    self.CONFIG = {
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PROXY_URL: self.PROXY_URL,
        OPENAI_BASE_URL: self.OPENAI_BASE_URL,
        GROK_BASE_URL: self.GROK_BASE_URL,
        GROK_MODEL: self.GROK_MODEL,
        CONFIG: self.CONFIG
    };
}
`;

// Write config.js file
const configPath = path.join(__dirname, '..', 'common', 'config.js');
fs.writeFileSync(configPath, configContent);

console.log('Generated secure config.js using proxy server');
console.log(`Config file location: ${configPath}`);
console.log('API keys are now secured on the proxy server'); 