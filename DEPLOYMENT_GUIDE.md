# Heroku Deployment Guide for WebTen Proxy Server

This guide will walk you through deploying your secure API proxy server to Heroku.

## 🚀 Quick Deployment (Automated)

### Prerequisites
1. **Install Heroku CLI**: Download from [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. **Login to Heroku**: Run `heroku login` in your terminal
3. **Set up environment variables**: Ensure your `.env` file has the required API keys

### Automated Deployment
```bash
# Deploy with auto-generated app name
npm run heroku:deploy

# Or specify a custom app name
npm run heroku:deploy my-webten-proxy
```

## 🔧 Manual Deployment

### Step 1: Install Heroku CLI
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows
# Download installer from https://devcenter.heroku.com/articles/heroku-cli

# Linux
curl https://cli-assets.heroku.com/install.sh | sh
```

### Step 2: Login to Heroku
```bash
heroku login
```

### Step 3: Create Heroku App
```bash
# Navigate to server directory
cd server

# Create new Heroku app
heroku create your-app-name-here
```

### Step 4: Set Environment Variables
```bash
# Set required API keys
heroku config:set OPENAI_API_KEY="your_openai_api_key_here"
heroku config:set GROK_API_KEY="your_grok_api_key_here"

# Set optional variables (these have defaults)
heroku config:set OPENAI_BASE_URL="https://api.openai.com/v1"
heroku config:set GROK_BASE_URL="https://api.x.ai/v1"
heroku config:set GROK_MODEL="grok-3-latest"
```

### Step 5: Deploy
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Add Heroku remote
heroku git:remote -a your-app-name-here

# Deploy
git push heroku main
```

### Step 6: Verify Deployment
```bash
# Check if app is running
heroku open

# Test health endpoint
curl https://your-app-name-here.herokuapp.com/health
```

## 🔄 Update Your Extension

After successful deployment, update your extension configuration:

### Step 1: Update Environment Variables
Add to your `.env` file:
```env
PROXY_URL=https://your-app-name-here.herokuapp.com
```

### Step 2: Rebuild Extension
```bash
npm run build:config
```

### Step 3: Test Extension
Load your extension in Chrome and test the API calls.

## 📊 Monitoring & Management

### View Logs
```bash
heroku logs --tail
```

### Check App Status
```bash
heroku ps
```

### Scale App (if needed)
```bash
# Scale to 2 dynos for better performance
heroku ps:scale web=2
```

### View Config Variables
```bash
heroku config
```

## 🔒 Security Best Practices

### 1. Use HTTPS
Heroku automatically provides HTTPS for your app.

### 2. Set Up CORS Properly
Update the proxy server to only allow requests from your extension's domain.

### 3. Monitor Usage
```bash
# Check API usage
heroku logs --tail | grep "API request"
```

### 4. Rotate API Keys
Regularly rotate your API keys and update them in Heroku:
```bash
heroku config:set OPENAI_API_KEY="new_key_here"
heroku config:set GROK_API_KEY="new_key_here"
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Build Fails
```bash
# Check build logs
heroku logs --tail

# Common fixes:
# - Ensure package.json has correct Node.js version
# - Check that all dependencies are in package.json
```

#### 2. App Crashes
```bash
# Check runtime logs
heroku logs --tail

# Restart app
heroku restart
```

#### 3. Environment Variables Not Set
```bash
# Check current config
heroku config

# Set missing variables
heroku config:set VARIABLE_NAME="value"
```

#### 4. CORS Issues
If you get CORS errors, update the proxy server to allow your extension's origin.

### Performance Optimization

#### 1. Enable Dyno Sleeping (Free Tier)
Free dynos sleep after 30 minutes of inactivity. Consider upgrading to avoid cold starts.

#### 2. Use Hobby Dyno ($7/month)
```bash
heroku ps:type hobby
```

#### 3. Add Caching
Consider adding Redis for better caching:
```bash
heroku addons:create heroku-redis:hobby-dev
```

## 📈 Scaling

### Free Tier Limitations
- 550-1000 dyno hours per month
- App sleeps after 30 minutes of inactivity
- 512MB RAM

### Upgrade Options
- **Hobby**: $7/month - No sleeping, 512MB RAM
- **Standard**: $25/month - 512MB RAM, better performance
- **Performance**: $250/month - 14GB RAM, dedicated resources

## 🔄 Continuous Deployment

### GitHub Integration
1. Connect your GitHub repository to Heroku
2. Enable automatic deploys
3. Set up review apps for testing

### Manual Updates
```bash
# After making changes
git add .
git commit -m "Update proxy server"
git push heroku main
```

## 📞 Support

If you encounter issues:
1. Check Heroku logs: `heroku logs --tail`
2. Review this guide
3. Check Heroku documentation: https://devcenter.heroku.com/
4. Contact Heroku support if needed 