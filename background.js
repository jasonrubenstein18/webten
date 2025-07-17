// Background service worker for the Chrome extension
console.log('Market Suggestion Extension: Background script loaded');

// API configuration
const BASE = 'https://demo-api.kalshi.co';
const KALSHI_KEY_ID = 'c2499810-0f10-4a75-9fb0-09e6592e1398';
const OPENAI_API_KEY = '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';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GROK_API_KEY = 'xai-237BhLIsoTsrbfY5uIvewcQe3Fg9bu0qRAhpxng39z1CaMCm6wmZ34naoZqvKrNsSjcxHPYxzc4IL53i';
const GROK_BASE_URL = 'https://api.x.ai/v1';

// Configuration
const CONFIG = {
    MAX_PAGES: 20,
    EVENTS_PER_PAGE: 200,
    MAX_RELEVANT_MARKETS: 8,
    MAX_MARKETS_FOR_ANALYSIS: 4000,
    API_TIMEOUT: 30000,
    ANALYSIS_TIMEOUT: 180000,
    EMBEDDING_MODEL: 'text-embedding-3-small',
    EMBEDDING_BATCH_SIZE: 20,
    EMBEDDING_CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_DELAY: 500,
    MAX_STORAGE_SIZE: 5 * 1024 * 1024,
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000,
    MIN_RELEVANCE_SCORE: 40,
    EDGE_ANALYSIS_ENABLED: true,
    EDGE_CACHE_EXPIRY: 15 * 60 * 1000,
    MIN_EDGE_CONFIDENCE: 20,
    GROK_MODEL: 'grok-3-latest',
    GROK_TIMEOUT: 45000
};

// Utility functions
function getRetryDelay(attempt) {
    return CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
}

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fetch events from Kalshi API with pagination
async function fetchKalshiMarkets() {
    try {
        console.log('Starting to fetch Kalshi events...');
        
        let allEvents = [];
        let cursor = null;
        let pageCount = 0;
        
        do {
            pageCount++;
            console.log(`Fetching page ${pageCount} of up to ${CONFIG.MAX_PAGES}...`);
            
            let path = `/trade-api/v2/events?status=open&limit=${CONFIG.EVENTS_PER_PAGE}`;
            if (cursor) {
                path += `&cursor=${encodeURIComponent(cursor)}`;
            }
            
            const response = await fetch(`${BASE}${path}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const data = await response.json();
            
            if (data.events && Array.isArray(data.events)) {
                allEvents = allEvents.concat(data.events);
            }
            
            cursor = data.cursor;
            
        } while (cursor && pageCount < CONFIG.MAX_PAGES);
        
        console.log(`Fetched ${pageCount} pages with ${allEvents.length} total events.`);
        
        const events = allEvents.map(event => ({
            ticker: event.event_ticker,
            title: event.title,
            description: event.sub_title || event.title,
            category: event.category || 'General',
            series_ticker: event.series_ticker,
            status: 'open'
        }));
        
        return { success: true, markets: events };
        
    } catch (error) {
        console.error('Error fetching Kalshi events:', error);
        return { success: false, error: error.message, markets: [] };
    }
}

// OpenAI API functions with retry logic
async function generateEmbedding(text, retryAttempt = 0) {
    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('API request timeout')), CONFIG.API_TIMEOUT);
        });
        
        const fetchPromise = fetch(`${OPENAI_BASE_URL}/embeddings`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: CONFIG.EMBEDDING_MODEL,
                input: text,
                encoding_format: 'float'
            })
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.data || !data.data[0] || !data.data[0].embedding) {
            throw new Error('Invalid response format from OpenAI API');
        }
        
        return data.data[0].embedding;
        
    } catch (error) {
        console.error(`Error generating embedding (attempt ${retryAttempt + 1}):`, error.message);
        
        if (retryAttempt < CONFIG.MAX_RETRY_ATTEMPTS - 1) {
            const isRetryable = error.message.includes('timeout') || 
                              error.message.includes('Failed to fetch') ||
                              error.message.includes('NetworkError') ||
                              error.message.includes('429') ||
                              error.message.includes('500') ||
                              error.message.includes('502') ||
                              error.message.includes('503');
            
            if (isRetryable) {
                const delay = getRetryDelay(retryAttempt);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return generateEmbedding(text, retryAttempt + 1);
            }
        }
        
        throw error;
    }
}

// Group markets by event/series for multi-participant analysis
function groupMarketsByEvent(markets) {
    const groups = {};
    
    markets.forEach(market => {
        const eventKey = market.series_ticker || market.ticker.split('-')[0];
        if (!groups[eventKey]) {
            groups[eventKey] = [];
        }
        groups[eventKey].push(market);
    });
    
    const multiParticipantGroups = [];
    const singleMarkets = [];
    
    Object.entries(groups).forEach(([eventKey, eventMarkets]) => {
        if (eventMarkets.length > 1) {
            multiParticipantGroups.push({
                eventKey,
                eventTitle: eventMarkets[0].title.split(' - ')[0] || eventMarkets[0].title,
                markets: eventMarkets,
                isMultiParticipant: true
            });
        } else {
            singleMarkets.push({
                ...eventMarkets[0],
                isMultiParticipant: false
            });
        }
    });
    
    return { multiParticipantGroups, singleMarkets };
}

// Enhanced market data fetching from Kalshi API
async function fetchDetailedMarketData(markets) {
    console.log(`Fetching detailed data for ${markets.length} markets...`);
    
    const enhancedMarkets = [];
    const batchSize = 5;
    
    for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (market) => {
            try {
                const response = await fetch(`${BASE}/trade-api/v2/events/${market.ticker}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (!response.ok) {
                    console.warn(`Failed to fetch details for ${market.ticker}: ${response.status}`);
                    return { ...market, detailedDataAvailable: false };
                }
                
                const data = await response.json();
                const eventData = data.event || {};
                const marketData = eventData.markets?.[0] || {};
                
                return {
                    ...market,
                    detailedDataAvailable: true,
                    currentPrice: marketData.yes_bid || null,
                    volume: marketData.volume || 0,
                    open_interest: marketData.open_interest || 0,
                    last_price: marketData.last_price || null,
                    expiration_time: eventData.expected_resolve_time || null,
                    can_close_early: eventData.can_close_early || false,
                    trading_active: marketData.status === 'open',
                    yes_bid: marketData.yes_bid || null,
                    yes_ask: marketData.yes_ask || null,
                    no_bid: marketData.no_bid || null,
                    no_ask: marketData.no_ask || null
                };
                
            } catch (error) {
                console.error(`Error fetching detailed data for ${market.ticker}:`, error);
                return { ...market, detailedDataAvailable: false };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        enhancedMarkets.push(...batchResults);
        
        if (i + batchSize < markets.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    return enhancedMarkets;
}

// Fetch current orderbook data for markets
async function fetchOrderbookData(markets, progressCallback = null) {
    console.log(`Fetching orderbook data for ${markets.length} markets...`);
    
    if (progressCallback) {
        progressCallback({
            phase: 'orderbook',
            current: 1,
            total: 3,
            message: 'Fetching current bid/ask prices...'
        });
    }
    
    const tickerMap = new Map();
    markets.forEach(market => {
        tickerMap.set(market.ticker, market);
    });
    
    const marketsWithOrderbook = [];
    const batchSize = 200;
    const totalBatches = Math.ceil(markets.length / batchSize);
    
    for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        if (progressCallback) {
            progressCallback({
                phase: 'orderbook',
                current: 1 + Math.floor((i / markets.length) * 2),
                total: 3,
                message: `Fetching orderbook data (${batchNumber}/${totalBatches})...`
            });
        }
        
        try {
            const tickers = batch.map(market => market.ticker).join(',');
            const response = await fetch(`${BASE}/trade-api/v2/markets?tickers=${encodeURIComponent(tickers)}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.warn(`Failed to fetch markets data for batch ${batchNumber}: ${response.status}`);
                
                batch.forEach(market => {
                    marketsWithOrderbook.push({
                        ...market,
                        orderbookDataAvailable: false,
                        orderbookError: `HTTP ${response.status}: ${errorText}`
                    });
                });
                continue;
            }
            
            const data = await response.json();
            
            if (data.markets && Array.isArray(data.markets)) {
                data.markets.forEach(marketData => {
                    const originalMarket = tickerMap.get(marketData.ticker);
                    if (originalMarket) {
                        const enhancedMarket = {
                            ...originalMarket,
                            orderbookDataAvailable: true,
                            detailedDataAvailable: true,
                            yes_ask: marketData.yes_ask,
                            no_ask: marketData.no_ask,
                            yes_bid: marketData.yes_bid,
                            no_bid: marketData.no_bid,
                            last_price: marketData.last_price,
                            volume: marketData.volume || 0,
                            volume_24h: marketData.volume_24h || 0,
                            open_interest: marketData.open_interest || 0,
                            close_time: marketData.close_time,
                            can_close_early: marketData.can_close_early,
                            market_type: marketData.market_type,
                            orderbookTimestamp: Date.now()
                        };
                        
                        marketsWithOrderbook.push(enhancedMarket);
                    }
                });
                
                batch.forEach(market => {
                    const found = data.markets.some(m => m.ticker === market.ticker);
                    if (!found) {
                        marketsWithOrderbook.push({
                            ...market,
                            orderbookDataAvailable: false,
                            orderbookError: 'Market not found in API response'
                        });
                    }
                });
            } else {
                batch.forEach(market => {
                    marketsWithOrderbook.push({
                        ...market,
                        orderbookDataAvailable: false,
                        orderbookError: 'Invalid API response format'
                    });
                });
            }
            
        } catch (error) {
            console.error(`Error fetching markets data for batch ${batchNumber}:`, error);
            batch.forEach(market => {
                marketsWithOrderbook.push({
                    ...market,
                    orderbookDataAvailable: false,
                    orderbookError: error.message
                });
            });
        }
        
        if (i + batchSize < markets.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    if (progressCallback) {
        progressCallback({
            phase: 'orderbook',
            current: 3,
            total: 3,
            message: 'Orderbook data complete!'
        });
    }
    
    console.log(`Orderbook data fetching completed for ${marketsWithOrderbook.length} markets`);
    return marketsWithOrderbook;
}


// Extract participant name from ticker
function extractParticipantFromTicker(ticker) {
    const parts = ticker.split('-');
    if (parts.length > 1) {
        return parts[parts.length - 1].replace(/([A-Z])/g, ' $1').trim();
    }
    return null;
}

// Grok API call for edge analysis
async function callGrokAPI(prompt, retryAttempt = 0) {
    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Grok API request timeout')), CONFIG.GROK_TIMEOUT);
        });
        
        const fetchPromise = fetch(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: CONFIG.GROK_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a financial analysis expert specializing in prediction markets and betting odds. You have access to real-time information and can identify potential mispricings or edges in betting markets based on current events, news, and market dynamics.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 2000
            })
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Grok API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from Grok API');
        }
        
        return data.choices[0].message.content.trim();
        
    } catch (error) {
        console.error(`Error calling Grok API (attempt ${retryAttempt + 1}):`, error.message);
        
        if (retryAttempt < CONFIG.MAX_RETRY_ATTEMPTS - 1) {
            const isRetryable = error.message.includes('timeout') || 
                              error.message.includes('Failed to fetch') ||
                              error.message.includes('NetworkError') ||
                              error.message.includes('429') ||
                              error.message.includes('500') ||
                              error.message.includes('502') ||
                              error.message.includes('503');
            
            if (isRetryable) {
                const delay = getRetryDelay(retryAttempt);
                console.log(`Retrying Grok API call in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return callGrokAPI(prompt, retryAttempt + 1);
            }
        }
        
        throw error;
    }
}

// Build edge analysis prompt for Grok
function buildEdgeAnalysisPrompt(enhancedMarkets, pageContent) {
    const contentSummary = `${pageContent.title || ''} ${pageContent.summary || ''}`.substring(0, 1000);
    const marketGroups = groupMarketsByEvent(enhancedMarkets);
    
    let marketsInfo = '';
    
    marketGroups.multiParticipantGroups.forEach(group => {
        marketsInfo += `\nMULTI-PARTICIPANT EVENT: ${group.eventTitle}\n`;
        marketsInfo += `Event Key: ${group.eventKey}\n`;
        marketsInfo += `Participants:\n`;
        
        group.markets.forEach(market => {
            const pricingInfo = (market.yes_bid !== null && market.yes_bid !== undefined) ? 
                `Yes ${market.yes_bid}¢ (bid) / ${market.yes_ask || 'N/A'}¢ (ask), Volume: ${market.volume || 0}` :
                'Pricing data pending';
                
            const participant = market.participantName || extractParticipantFromTicker(market.ticker) || 'Unknown';
            
            marketsInfo += `  - ${participant} (${market.ticker}): ${pricingInfo}\n`;
        });
        marketsInfo += `Expiration: ${group.markets[0].expiration_time || 'Not specified'}\n`;
        marketsInfo += `Trading Active: ${group.markets[0].trading_active ? 'Yes' : 'No'}\n`;
        marketsInfo += '---\n';
    });
    
    marketGroups.singleMarkets.forEach(market => {
        const pricingInfo = (market.yes_bid !== null && market.yes_bid !== undefined) ? 
            `Current prices: Yes ${market.yes_bid}¢ (bid) / ${market.yes_ask || 'N/A'}¢ (ask), Volume: ${market.volume || 0}, Last price: ${market.last_price || 'N/A'}¢` :
            'Live pricing data will be available when trading';
            
        marketsInfo += `\nBINARY MARKET: ${market.ticker}\n`;
        marketsInfo += `Title: ${market.title}\n`;
        marketsInfo += `Category: ${market.category}\n`;
        marketsInfo += `${pricingInfo}\n`;
        marketsInfo += `Expiration: ${market.expiration_time || 'Not specified'}\n`;
        marketsInfo += `Trading Active: ${market.trading_active ? 'Yes' : 'No'}\n`;
        marketsInfo += '---\n';
    });
    
    return `Based on the following webpage content and prediction markets, analyze each market for potential betting edges or mispricings using your real-time knowledge of current events, news, and market dynamics.

WEBPAGE CONTENT (Context):
${contentSummary}

PREDICTION MARKETS TO ANALYZE:
${marketsInfo}

IMPORTANT INSTRUCTIONS:
- For MULTI-PARTICIPANT EVENTS: Analyze all participants together and recommend which specific participant offers the best value. Set the recommendation to the ticker of the participant you recommend betting YES on.
- For BINARY MARKETS: Recommend "buy_yes", "buy_no", or "avoid".
- Consider current real-time events, news, and developments that might affect outcomes
- Assess whether current market pricing accurately reflects true probabilities
- Look for information asymmetries or market inefficiencies
- Consider volume, liquidity, and time until resolution

Please do deep research and present precise odds on each bet. Use advanced math for trading. 
Draw research from authoritative sources like research and unbiased pundits. 
Size my bets properly and use everything you know about portfolio theory. 
Calculate your implied odds from first principles and make sure you get an exact number. 

For confidence please imagine you have $100 to bet. Would you bet on this market/participant, and how much? 
If you would bet $80 that means you have an 80% confidence in your edge. If you would not bet, that means you have a 0% confidence.

Return ONLY a JSON array with your analysis in this exact format:

For multi-participant events, return one analysis object for the event (not per participant):
[
  {
    "eventKey": "EVENT_KEY_FOR_MULTI_PARTICIPANT_EVENTS",
    "ticker": "RECOMMENDED_PARTICIPANT_TICKER" | "BINARY_MARKET_TICKER",
    "hasEdge": true/false,
    "edgeType": "underpriced" | "overpriced" | "none",
    "confidence": 0-100,
    "reasoning": "Brief 1-2 sentence explanation focusing on why this participant/option is best",
    "recommendation": "PARTICIPANT_TICKER" | "buy_yes" | "buy_no" | "avoid" | "insufficient_data",
    "participantName": "Name of recommended participant" | null,
    "isMultiParticipant": true | false,
    "timeframe": "immediate" | "short_term" | "long_term"
  }
]

Only include markets/events where you have sufficient information to make an assessment. For multi-participant events, only return ONE recommendation for the best participant.`;
}

// Analyze markets for edges using Grok
async function analyzeMarketEdges(relevantMarkets, pageContent, progressCallback = null) {
    if (!CONFIG.EDGE_ANALYSIS_ENABLED || !relevantMarkets || relevantMarkets.length === 0) {
        return relevantMarkets.map(market => ({ ...market, edgeAnalysis: null }));
    }
    
    try {
        console.log(`Starting edge analysis for ${relevantMarkets.length} markets...`);
        
        if (progressCallback) {
            progressCallback({
                phase: 'edge_analysis',
                current: 1,
                total: 4,
                message: 'Starting edge analysis...'
            });
        }
        
        if (progressCallback) {
            progressCallback({
                phase: 'edge_analysis',
                current: 2,
                total: 5,
                message: 'Fetching detailed market data...'
            });
        }
        const enhancedMarkets = await fetchDetailedMarketData(relevantMarkets);
        
        if (progressCallback) {
            progressCallback({
                phase: 'edge_analysis',
                current: 3,
                total: 5,
                message: 'Fetching current bid/ask prices...'
            });
        }
        const marketsWithOrderbook = await fetchOrderbookData(enhancedMarkets, progressCallback);
        
        if (progressCallback) {
            progressCallback({
                phase: 'edge_analysis',
                current: 4,
                total: 5,
                message: 'Analyzing market inefficiencies...'
            });
        }
        const prompt = buildEdgeAnalysisPrompt(marketsWithOrderbook, pageContent);
        
        const grokResponse = await callGrokAPI(prompt);
        
        let edgeAnalyses;
        try {
            edgeAnalyses = JSON.parse(grokResponse);
        } catch (parseError) {
            console.error('Failed to parse Grok response:', parseError);
            const jsonMatch = grokResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                edgeAnalyses = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Could not parse Grok analysis response');
            }
        }
        
        if (!Array.isArray(edgeAnalyses)) {
            throw new Error('Grok response is not an array');
        }
        
        const marketsWithEdges = marketsWithOrderbook.map(market => {
            let edgeData = edgeAnalyses.find(analysis => analysis.ticker === market.ticker);
            
            if (!edgeData) {
                const eventKey = market.series_ticker || market.ticker.split('-')[0];
                edgeData = edgeAnalyses.find(analysis => 
                    analysis.eventKey === eventKey && 
                    analysis.isMultiParticipant === true
                );
            }
            
            if (!edgeData) {
                return { ...market, edgeAnalysis: null };
            }
            
            let isRecommendedParticipant = false;
            let marketSpecificRecommendation = edgeData.recommendation;
            
            if (edgeData.isMultiParticipant) {
                isRecommendedParticipant = (edgeData.recommendation === market.ticker);
                if (!isRecommendedParticipant) {
                    marketSpecificRecommendation = 'avoid';
                } else {
                    marketSpecificRecommendation = 'buy_yes';
                }
            }
            
            return {
                ...market,
                edgeAnalysis: {
                    hasEdge: edgeData.hasEdge && edgeData.confidence >= CONFIG.MIN_EDGE_CONFIDENCE,
                    edgeType: edgeData.edgeType,
                    confidence: edgeData.confidence,
                    reasoning: edgeData.reasoning,
                    recommendation: marketSpecificRecommendation,
                    timeframe: edgeData.timeframe,
                    isMultiParticipant: edgeData.isMultiParticipant || false,
                    isRecommendedParticipant: isRecommendedParticipant,
                    eventKey: edgeData.eventKey,
                    recommendedParticipant: edgeData.participantName,
                    analyzedAt: Date.now()
                }
            };
        });
        
        const filteredMarkets = marketsWithEdges.filter(market => {
            if (!market.edgeAnalysis?.isMultiParticipant) {
                return true;
            }
            return market.edgeAnalysis?.isRecommendedParticipant === true;
        });
        
        console.log(`Edge analysis completed. Found ${marketsWithEdges.filter(m => m.edgeAnalysis?.hasEdge).length} markets with potential edges.`);
        
        if (progressCallback) {
            progressCallback({
                phase: 'edge_analysis',
                current: 5,
                total: 5,
                message: 'Edge analysis complete!'
            });
        }
        
        return filteredMarkets;
        
    } catch (error) {
        console.error('Error in edge analysis:', error);
        return relevantMarkets.map(market => ({ 
            ...market, 
            edgeAnalysis: { 
                error: error.message,
                analyzedAt: Date.now()
            } 
        }));
    }
}

// Storage management utilities
async function getStorageUsage() {
    return new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
            resolve(bytesInUse);
        });
    });
}

async function clearOldCache() {
    return new Promise((resolve) => {
        chrome.storage.local.remove(['marketEmbeddings', 'embeddingsCacheTime'], () => {
            console.log('Cleared old embedding cache');
            resolve();
        });
    });
}

async function checkStorageSpace(dataSize) {
    const currentUsage = await getStorageUsage();
    const availableSpace = CONFIG.MAX_STORAGE_SIZE - currentUsage;
    
    if (dataSize > availableSpace) {
        console.log('Insufficient storage space, clearing cache...');
        await clearOldCache();
        return true;
    }
    
    return false;
}

// Cache management for market embeddings
async function getCachedMarketEmbeddings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['marketEmbeddings', 'embeddingsCacheTime'], (result) => {
            const cacheTime = result.embeddingsCacheTime || 0;
            const now = Date.now();
            const cacheExpiry = CONFIG.EMBEDDING_CACHE_EXPIRY;
            
            if (result.marketEmbeddings && (now - cacheTime) < cacheExpiry) {
                console.log('Using cached market embeddings');
                resolve(result.marketEmbeddings);
            } else {
                console.log('Market embeddings cache expired or missing');
                resolve(null);
            }
        });
    });
}

async function cacheMarketEmbeddings(embeddings) {
    try {
        const estimatedSize = JSON.stringify(embeddings).length * 2;
        await checkStorageSpace(estimatedSize);
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                marketEmbeddings: embeddings,
                embeddingsCacheTime: Date.now()
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to cache embeddings:', chrome.runtime.lastError);
                    resolve();
                } else {
                    console.log('Market embeddings cached successfully');
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error('Error in cacheMarketEmbeddings:', error);
    }
}

// Generate embeddings for all active markets
async function generateMarketEmbeddings(markets, progressCallback = null) {
    console.log(`Generating embeddings for ${markets.length} markets...`);
    
    const cachedEmbeddings = await getCachedMarketEmbeddings();
    if (cachedEmbeddings && cachedEmbeddings.length >= markets.length * 0.8) {
        console.log(`Using cached embeddings for ${cachedEmbeddings.length} markets`);
        return cachedEmbeddings.slice(0, markets.length);
    }
    
    const embeddings = [];
    const batchSize = CONFIG.EMBEDDING_BATCH_SIZE;
    const totalBatches = Math.ceil(markets.length / batchSize);
    let processedCount = 0;
    
    for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`Processing embedding batch ${batchNumber}/${totalBatches} (${batch.length} markets)`);
        
        if (progressCallback) {
            progressCallback({
                phase: 'embeddings',
                current: batchNumber,
                total: totalBatches,
                message: `Generating embeddings (batch ${batchNumber}/${totalBatches})...`
            });
        }
        
        const batchPromises = batch.map(async (market, index) => {
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Embedding generation timeout')), 30000);
                });
                
                const embeddingPromise = (async () => {
                    const marketText = `${market.title} ${market.description}`.trim();
                    const embedding = await generateEmbedding(marketText);
                    
                    return {
                        ticker: market.ticker,
                        title: market.title,
                        description: market.description,
                        category: market.category,
                        series_ticker: market.series_ticker,
                        embedding: embedding
                    };
                })();
                
                return await Promise.race([embeddingPromise, timeoutPromise]);
                
            } catch (error) {
                console.error(`Error generating embedding for market ${market.ticker}:`, error);
                return null;
            }
        });
        
        try {
            const batchResults = await Promise.all(batchPromises);
            const validResults = batchResults.filter(result => result !== null);
            embeddings.push(...validResults);
            processedCount += validResults.length;
            
            console.log(`Batch ${batchNumber} completed: ${validResults.length}/${batch.length} successful, total processed: ${processedCount}`);
            
        } catch (error) {
            console.error(`Error processing batch ${batchNumber}:`, error);
        }
        
        if (i + batchSize < markets.length) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
        }
    }
    
    console.log(`Embedding generation completed: ${embeddings.length}/${markets.length} markets processed`);
    
    try {
        await cacheMarketEmbeddings(embeddings);
    } catch (error) {
        console.error('Failed to cache embeddings, continuing without cache:', error);
    }
    
    return embeddings;
}

// Generate AI-powered content summary
async function generateAIContentSummary(title, summary) {
    try {
        console.log('Generating AI summary for content...');
        
        let contentText = `${title || ''} ${summary || ''}`.trim();
        if (!contentText || contentText.length < 10) {
            return title || 'Content summary not available';
        }
        
        if (contentText.length > 2000) {
            contentText = contentText.substring(0, 2000) + '...';
        }
        
        const prompt = `Please write a brief, clear summary of the following webpage content in 400 characters or fewer. Focus on the main topic and key points:

${contentText}

Summary (400 characters max):`;

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI summary timeout')), CONFIG.API_TIMEOUT);
        });
        
        const fetchPromise = fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 150
            })
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from OpenAI API');
        }
        
        const aiSummary = data.choices[0].message.content.trim();
        
        if (aiSummary.length > 400) {
            return aiSummary.substring(0, 397) + '...';
        }
        
        return aiSummary;
        
    } catch (error) {
        console.error('Error generating AI summary:', error);
        const fallback = `${title || ''} ${summary || ''}`.substring(0, 397) + '...';
        return fallback || 'Content summary not available';
    }
}

// Create a summarized version of markets for AI analysis
function summarizeMarketsForAI(markets) {
    return markets.map(market => {
        const title = market.title.length > 100 ? market.title.substring(0, 100) + '...' : market.title;
        const description = market.description.length > 150 ? market.description.substring(0, 150) + '...' : market.description;
        
        return {
            ticker: market.ticker,
            title: title,
            description: description,
            category: market.category
        };
    });
}

// Find relevant markets using AI-powered relevance analysis
async function findRelevantMarkets(pageContent, markets, progressCallback = null) {
    const startTime = Date.now();
    
    const analysisPromise = (async () => {
        console.log('Finding relevant markets using AI analysis...');
        
        const limitedMarkets = markets.slice(0, CONFIG.MAX_MARKETS_FOR_ANALYSIS);
        console.log(`Processing ${limitedMarkets.length} markets (limited from ${markets.length})`);
        
        let contentText = `${pageContent.title} ${pageContent.summary}`.trim();
        if (!contentText || contentText.length < 10) {
            throw new Error('Insufficient page content for analysis');
        }
        
        const displaySummary = await generateAIContentSummary(pageContent.title, pageContent.summary);
        
        if (contentText.length > 1500) {
            contentText = contentText.substring(0, 1500) + '...';
        }
        
        const basePromptTokens = estimateTokens(`Given the following webpage content and list of prediction markets, 
            identify which markets are most relevant to the content. Return ONLY a JSON array of the top 5-8 most 
            relevant markets with their relevance scores. The relevance score is a number between 0 and 100, where 100 is the most relevant. 
            It is essential to take the relevance score seriously. If a market has nothing to do with the content, it should have a relevance score of 0. If the market is 
            exactly the same as the content, it should have a relevance score of 100. If a market is regarding the same topic or broader industry it should have a relevance score about 50.

WEBPAGE CONTENT:
Title: ${pageContent.title}
Content: ${contentText}

PREDICTION MARKETS:

Return ONLY a JSON array in this exact format:
[
  {
    "ticker": "MARKET_TICKER",
    "relevanceScore": 85,
    "reason": "Brief explanation of relevance"
  }
]

Only include markets with relevance score ${CONFIG.MIN_RELEVANCE_SCORE} or higher. If no markets are highly relevant, return an empty array.`) ;
        
        const availableTokens = 16000 - basePromptTokens - 2000;
        const avgTokensPerMarket = 40;
        const marketsPerBatch = Math.floor(availableTokens / avgTokensPerMarket);
        const batchSize = Math.min(marketsPerBatch, 300);
        
        console.log(`Token analysis: base=${basePromptTokens}, available=${availableTokens}, batch size=${batchSize}`);
        
        const summarizedMarkets = summarizeMarketsForAI(limitedMarkets);
        
        const maxBatches = 12;
        const totalBatches = Math.min(Math.ceil(summarizedMarkets.length / batchSize), maxBatches);
        const marketsToProcess = summarizedMarkets.slice(0, totalBatches * batchSize);
        
        console.log(`Processing ${marketsToProcess.length} markets in ${totalBatches} batches (max ${maxBatches})`);
        
        let allRelevantMarkets = [];
        
        for (let i = 0; i < marketsToProcess.length; i += batchSize) {
            const batch = marketsToProcess.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            
            console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} markets)`);
            
            if (progressCallback) {
                progressCallback({
                    phase: 'analysis',
                    current: batchNumber,
                    total: totalBatches,
                    message: `Analyzing markets (batch ${batchNumber}/${totalBatches})...`
                });
            }
            
            try {
                const marketsList = batch.map((market, index) => 
                    `${i + index + 1}. ${market.ticker}: ${market.title} - ${market.description}`
                ).join('\n');
                
                const prompt = `Given the following webpage content and list of prediction markets, identify which markets are most relevant to the content. Based specifically on the content of the webpage what markets might the user be most interested in participating in? Return ONLY a JSON array of the top 5-8 most relevant markets with their relevance scores.

WEBPAGE CONTENT:
Title: ${pageContent.title}
Content: ${contentText}

PREDICTION MARKETS:
${marketsList}

Return ONLY a JSON array in this exact format:
[
  {
    "ticker": "COMPLETE_MARKET_TICKER_EXACTLY_AS_SHOWN_ABOVE",
    "relevanceScore": 85,
    "reason": "Brief explanation of relevance"
  }
]

Only include markets with relevance score 40 or higher. If no markets are highly relevant, return an empty array.`;

                const promptTokens = estimateTokens(prompt);
                if (promptTokens > 15000) {
                    console.warn(`Batch ${batchNumber} prompt too long (${promptTokens} tokens), skipping...`);
                    continue;
                }
                
                console.log(`Sending AI analysis request for batch ${batchNumber} (${promptTokens} estimated tokens)...`);
                
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('AI analysis timeout')), CONFIG.API_TIMEOUT);
                });
                
                const fetchPromise = fetch(`${OPENAI_BASE_URL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-3.5-turbo',
                        messages: [
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 1000
                    })
                });
                
                const response = await Promise.race([fetchPromise, timeoutPromise]);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                
                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                    throw new Error('Invalid response format from OpenAI API');
                }
                
                const aiResponse = data.choices[0].message.content.trim();
                console.log(`AI Response for batch ${batchNumber}:`, aiResponse);
                
                let relevantTickers;
                try {
                    relevantTickers = JSON.parse(aiResponse);
                } catch (parseError) {
                    console.error(`Failed to parse AI response for batch ${batchNumber}:`, parseError);
                    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        relevantTickers = JSON.parse(jsonMatch[0]);
                    } else {
                        console.warn(`Skipping batch ${batchNumber} due to parse error`);
                        continue;
                    }
                }
                
                if (!Array.isArray(relevantTickers)) {
                    console.warn(`Batch ${batchNumber} response is not an array, skipping...`);
                    continue;
                }
                
                const batchRelevantMarkets = relevantTickers.map(aiMarket => {
                    const originalMarket = limitedMarkets.find(m => m.ticker === aiMarket.ticker);
                    if (!originalMarket) {
                        console.warn(`Market ${aiMarket.ticker} not found in original list`);
                        return null;
                    }
                    
                    return {
                        ...originalMarket,
                        relevanceScore: aiMarket.relevanceScore,
                        reason: aiMarket.reason
                    };
                }).filter(market => market !== null);
                
                allRelevantMarkets = allRelevantMarkets.concat(batchRelevantMarkets);
                console.log(`Batch ${batchNumber} completed: ${batchRelevantMarkets.length} relevant markets found`);
                
                if (i + batchSize < marketsToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
                }
                
            } catch (error) {
                console.error(`Error processing batch ${batchNumber}:`, error);
            }
        }
        
        allRelevantMarkets.sort((a, b) => b.relevanceScore - a.relevanceScore);
        const topRelevantMarkets = allRelevantMarkets.slice(0, CONFIG.MAX_RELEVANT_MARKETS);
        
        const processingTime = Date.now() - startTime;
        console.log(`Found ${topRelevantMarkets.length} relevant markets from AI analysis (from ${allRelevantMarkets.length} total candidates) in ${processingTime}ms`);
        
        return {
            success: true,
            markets: topRelevantMarkets,
            totalAnalyzed: marketsToProcess.length,
            totalBatches: totalBatches,
            processingTime: processingTime,
            contentSummary: displaySummary
        };
    })();
    
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Analysis timed out after 2 minutes')), CONFIG.ANALYSIS_TIMEOUT);
    });
    
    try {
        return await Promise.race([analysisPromise, timeoutPromise]);
    } catch (error) {
        console.error('Error finding relevant markets:', error);
        return {
            success: false,
            error: error.message,
            markets: []
        };
    }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Market Suggestion Extension installed');
        chrome.storage.local.set({
            settings: {
                enabled: true,
                defaultPlatform: 'kalshi',
                autoAnalyze: false
            }
        });
    }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (request.action === 'getSettings') {
        chrome.storage.local.get(['settings'], (result) => {
            sendResponse({ settings: result.settings || {} });
        });
        return true;
    }
    
    if (request.action === 'updateSettings') {
        chrome.storage.local.set({ settings: request.settings }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (request.action === 'openMarket') {
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
        return true;
    }
    
    if (request.action === 'getKalshiMarkets') {
        console.log('Fetching Kalshi events...');
        fetchKalshiMarkets()
            .then(result => {
                console.log('Sending response:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('Error in fetchKalshiMarkets:', error);
                sendResponse({
                    success: false,
                    error: error.message,
                    markets: []
                });
            });
        return true;
    }
    
    if (request.action === 'analyzePageContent') {
        console.log('Analyzing page content for relevant markets...');
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                sendResponse({
                    success: false,
                    error: 'No active tab found',
                    markets: []
                });
                return;
            }
            
            chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent' }, async (contentResponse) => {
                if (chrome.runtime.lastError) {
                    console.error('Error extracting content:', chrome.runtime.lastError);
                    sendResponse({
                        success: false,
                        error: 'Failed to extract page content. Make sure you are on a webpage.',
                        markets: []
                    });
                    return;
                }
                
                if (!contentResponse || !contentResponse.success) {
                    sendResponse({
                        success: false,
                        error: 'Failed to extract page content',
                        markets: []
                    });
                    return;
                }
                
                try {
                    const marketsResult = await fetchKalshiMarkets();
                    if (!marketsResult.success) {
                        sendResponse({
                            success: false,
                            error: 'Failed to fetch active markets: ' + marketsResult.error,
                            markets: []
                        });
                        return;
                    }
                    
                    const relevantResult = await findRelevantMarkets(
                        contentResponse.content, 
                        marketsResult.markets
                    );
                    
                    if (!relevantResult.success) {
                        sendResponse(relevantResult);
                        return;
                    }
                    
                    let marketsWithOrderbook = [];
                    if (relevantResult.markets && relevantResult.markets.length > 0) {
                        console.log('Fetching orderbook data for relevant markets...', relevantResult.markets.map(m => m.ticker));
                        try {
                            marketsWithOrderbook = await fetchOrderbookData(relevantResult.markets);
                            console.log('Orderbook data fetched. Results:', marketsWithOrderbook.map(m => ({
                                ticker: m.ticker,
                                orderbookDataAvailable: m.orderbookDataAvailable,
                                yes_bid: m.yes_bid,
                                yes_ask: m.yes_ask,
                                no_bid: m.no_bid,
                                no_ask: m.no_ask,
                                orderbookError: m.orderbookError
                            })));
                        } catch (orderbookError) {
                            console.error('Orderbook fetching failed, continuing with basic market data:', orderbookError);
                            marketsWithOrderbook = relevantResult.markets.map(market => ({ 
                                ...market, 
                                orderbookDataAvailable: false,
                                orderbookError: 'Orderbook data unavailable: ' + orderbookError.message
                            }));
                        }
                    } else {
                        marketsWithOrderbook = relevantResult.markets;
                    }
                    
                    let marketsWithEdges = [];
                    if (marketsWithOrderbook && marketsWithOrderbook.length > 0) {
                        console.log('Starting edge analysis with Grok...');
                        try {
                            marketsWithEdges = await analyzeMarketEdges(
                                marketsWithOrderbook, 
                                contentResponse.content
                            );
                        } catch (edgeError) {
                            console.error('Edge analysis failed, continuing without edge data:', edgeError);
                            marketsWithEdges = marketsWithOrderbook.map(market => ({ 
                                ...market, 
                                edgeAnalysis: { 
                                    error: 'Edge analysis unavailable',
                                    analyzedAt: Date.now()
                                } 
                            }));
                        }
                    } else {
                        marketsWithEdges = marketsWithOrderbook;
                    }
                    
                    sendResponse({
                        ...relevantResult,
                        markets: marketsWithEdges,
                        edgeAnalysisPerformed: marketsWithEdges.some(m => m.edgeAnalysis && !m.edgeAnalysis.error)
                    });
                    
                } catch (error) {
                    console.error('Error in analyzePageContent:', error);
                    sendResponse({
                        success: false,
                        error: error.message,
                        markets: []
                    });
                }
            });
        });
        
        return true;
    }
});

// Handle tab updates for potential auto-analysis
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        chrome.storage.local.get(['settings'], (result) => {
            const settings = result.settings || {};
            if (settings.autoAnalyze) {
                console.log('Page loaded, auto-analyze enabled');
            }
        });
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    console.log('Extension icon clicked on tab:', tab.id);
});
