# WebTen API Proxy Server

This proxy server keeps your API keys secure by handling all API calls server-side, preventing them from being exposed in the browser extension.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   GROK_API_KEY=your_grok_api_key_here
   PROXY_URL=http://localhost:3000
   PORT=3000
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

## 🔒 Security Benefits

- **No API keys in client code**: Keys are never sent to the browser
- **Request validation**: Server validates all requests before forwarding
- **Rate limiting**: Built-in protection against abuse
- **CORS protection**: Only allows requests from your extension

## 📡 API Endpoints

### OpenAI Proxy
- **POST** `/api/openai/*` - Forwards to OpenAI API
- **GET** `/api/openai/*` - Forwards to OpenAI API

### Grok Proxy  
- **POST** `/api/grok/*` - Forwards to Grok API
- **GET** `/api/grok/*` - Forwards to Grok API

### Health Check
- **GET** `/health` - Server status

## 🚀 Deployment Options

### Local Development
```bash
npm run dev  # Uses nodemon for auto-restart
```

### Production (Heroku, Railway, etc.)
1. Set environment variables in your hosting platform
2. Deploy the server directory
3. Update `PROXY_URL` in your extension config

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔧 Configuration

The server automatically uses these environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `GROK_API_KEY` - Your Grok API key  
- `PORT` - Server port (default: 3000)
- `OPENAI_BASE_URL` - OpenAI API base URL (default: https://api.openai.com/v1)
- `GROK_BASE_URL` - Grok API base URL (default: https://api.x.ai/v1)

## 📊 Performance Features

- **Request caching**: Reduces duplicate API calls
- **Connection pooling**: Efficient HTTP connections
- **Timeout handling**: Prevents hanging requests
- **Error handling**: Graceful error responses

## 🔍 Monitoring

Check server health:
```bash
curl http://localhost:3000/health
```

## 🛡️ Security Best Practices

1. **Use HTTPS in production**
2. **Set up proper CORS origins**
3. **Implement request rate limiting**
4. **Monitor API usage**
5. **Rotate API keys regularly** 