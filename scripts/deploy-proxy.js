const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Setting up WebTen API Proxy Server...\n');

// Check if server directory exists
const serverDir = path.join(__dirname, '..', 'server');
if (!fs.existsSync(serverDir)) {
    console.error('❌ Server directory not found. Please ensure the server folder exists.');
    process.exit(1);
}

// Install dependencies
console.log('📦 Installing proxy server dependencies...');
try {
    execSync('npm install', { cwd: serverDir, stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully\n');
} catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
}

// Check environment variables
console.log('🔍 Checking environment variables...');
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found. Please create one with your API keys:');
    console.log(`
# Create a .env file in the root directory with:
OPENAI_API_KEY=your_openai_api_key_here
GROK_API_KEY=your_grok_api_key_here
PROXY_URL=http://localhost:3000
    `);
    process.exit(1);
}

console.log('✅ Environment variables found\n');

// Start the server
console.log('🚀 Starting proxy server...');
console.log('📡 Server will be available at: http://localhost:3000');
console.log('🔒 API keys are now secure on the server side\n');

try {
    execSync('npm start', { cwd: serverDir, stdio: 'inherit' });
} catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
} 