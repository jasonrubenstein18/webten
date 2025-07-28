const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Deploying WebTen Proxy to Heroku...\n');

// Check if Heroku CLI is installed
try {
    execSync('heroku --version', { stdio: 'pipe' });
    console.log('✅ Heroku CLI found\n');
} catch (error) {
    console.error('❌ Heroku CLI not found. Please install it first:');
    console.log('https://devcenter.heroku.com/articles/heroku-cli\n');
    process.exit(1);
}

// Check if user is logged in to Heroku
try {
    execSync('heroku auth:whoami', { stdio: 'pipe' });
    console.log('✅ Logged in to Heroku\n');
} catch (error) {
    console.error('❌ Not logged in to Heroku. Please run:');
    console.log('heroku login\n');
    process.exit(1);
}

// Get app name from user or generate one
const appName = process.argv[2] || `webten-proxy-${Date.now()}`;

console.log(`📦 Creating Heroku app: ${appName}`);

try {
    // Create Heroku app
    execSync(`heroku create ${appName}`, { stdio: 'inherit' });
    console.log('✅ Heroku app created\n');
} catch (error) {
    console.error('❌ Failed to create Heroku app:', error.message);
    process.exit(1);
}

// Set environment variables
console.log('🔧 Setting environment variables...');

const envVars = [
    'OPENAI_API_KEY',
    'GROK_API_KEY',
    'OPENAI_BASE_URL',
    'GROK_BASE_URL',
    'GROK_MODEL'
];

for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value) {
        try {
            execSync(`heroku config:set ${envVar}="${value}"`, { stdio: 'inherit' });
            console.log(`✅ Set ${envVar}`);
        } catch (error) {
            console.error(`❌ Failed to set ${envVar}:`, error.message);
        }
    } else if (envVar === 'OPENAI_API_KEY' || envVar === 'GROK_API_KEY') {
        console.error(`❌ ${envVar} is required but not found in environment`);
        console.log(`Please set it manually: heroku config:set ${envVar}="your_key_here"`);
    }
}

console.log('\n📤 Deploying to Heroku...');

try {
    // Change to server directory
    const serverDir = path.join(__dirname, '..', 'server');
    process.chdir(serverDir);
    
    // Initialize git if not already done
    if (!fs.existsSync('.git')) {
        execSync('git init', { stdio: 'inherit' });
        execSync('git add .', { stdio: 'inherit' });
        execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
    }
    
    // Add Heroku remote
    execSync(`heroku git:remote -a ${appName}`, { stdio: 'inherit' });
    
    // Deploy
    execSync('git push heroku main', { stdio: 'inherit' });
    
    console.log('\n✅ Deployment successful!');
    console.log(`🌐 Your proxy server is now running at: https://${appName}.herokuapp.com`);
    console.log('\n📋 Next steps:');
    console.log(`1. Update your .env file with: PROXY_URL=https://${appName}.herokuapp.com`);
    console.log('2. Rebuild your extension: npm run build:config');
    console.log('3. Test the proxy: curl https://' + appName + '.herokuapp.com/health');
    
} catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
} 