const { execSync } = require('child_process');
require('dotenv').config();

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000';

console.log('🧪 Testing WebTen Proxy Server...\n');
console.log(`📍 Testing URL: ${PROXY_URL}\n`);

async function testProxy() {
    try {
        // Test health endpoint
        console.log('1️⃣ Testing health endpoint...');
        const healthResponse = await fetch(`${PROXY_URL}/health`);
        const healthData = await healthResponse.json();
        
        if (healthResponse.ok) {
            console.log('✅ Health check passed:', healthData);
        } else {
            console.log('❌ Health check failed:', healthData);
            return false;
        }

        // Test OpenAI proxy (without making actual API call)
        console.log('\n2️⃣ Testing OpenAI proxy endpoint...');
        const openaiResponse = await fetch(`${PROXY_URL}/api/openai/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            })
        });

        if (openaiResponse.status === 401) {
            console.log('✅ OpenAI proxy is working (401 expected without valid API key)');
        } else if (openaiResponse.ok) {
            console.log('✅ OpenAI proxy is working');
        } else {
            console.log('❌ OpenAI proxy test failed:', openaiResponse.status);
        }

        // Test Grok proxy (without making actual API call)
        console.log('\n3️⃣ Testing Grok proxy endpoint...');
        const grokResponse = await fetch(`${PROXY_URL}/api/grok/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'grok-3-latest',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            })
        });

        if (grokResponse.status === 401) {
            console.log('✅ Grok proxy is working (401 expected without valid API key)');
        } else if (grokResponse.ok) {
            console.log('✅ Grok proxy is working');
        } else {
            console.log('❌ Grok proxy test failed:', grokResponse.status);
        }

        console.log('\n🎉 Proxy server tests completed!');
        console.log('\n📋 Next steps:');
        console.log('1. Ensure your API keys are set in Heroku');
        console.log('2. Test with actual API calls');
        console.log('3. Update your extension configuration');
        
        return true;

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check if the proxy server is running');
        console.log('2. Verify the PROXY_URL is correct');
        console.log('3. Check Heroku logs: heroku logs --tail');
        return false;
    }
}

// Run the test
testProxy().then(success => {
    process.exit(success ? 0 : 1);
}); 