const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables (server-side only)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_BASE_URL = process.env.GROK_BASE_URL || 'https://api.x.ai/v1';

// OpenAI proxy endpoint
app.post('/api/openai/*', async (req, res) => {
    try {
        const path = req.path.replace('/api/openai', '');
        console.log(`Making OpenAI request to: ${OPENAI_BASE_URL}${path}`);
        
        const response = await axios({
            method: req.method,
            url: `${OPENAI_BASE_URL}${path}`,
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'User-Agent': 'WebTen-Proxy/1.0'
            },
            data: req.body,
            timeout: 30000,
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });
        
        console.log(`OpenAI response status: ${response.status}`);
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('OpenAI proxy error:', error.message);
        console.error('Error details:', error.response?.data || error.code);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Grok proxy endpoint
app.post('/api/grok/*', async (req, res) => {
    try {
        const path = req.path.replace('/api/grok', '');
        console.log(`Making Grok request to: ${GROK_BASE_URL}${path}`);
        
        const response = await axios({
            method: req.method,
            url: `${GROK_BASE_URL}${path}`,
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json',
                'User-Agent': 'WebTen-Proxy/1.0'
            },
            data: req.body,
            timeout: 30000,
            validateStatus: function (status) {
                return status < 500; // Resolve only if the status code is less than 500
            }
        });
        
        console.log(`Grok response status: ${response.status}`);
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('Grok proxy error:', error.message);
        console.error('Error details:', error.response?.data || error.code);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`API Proxy server running on port ${PORT}`);
}); 