// Background service worker for the Chrome extension
console.log('Market Suggestion Extension: Background script loaded');

// Kalshi API configuration
const BASE = 'https://demo-api.kalshi.co';
const KALSHI_KEY_ID = 'c2499810-0f10-4a75-9fb0-09e6592e1398';

// OpenAI API configuration
const OPENAI_API_KEY = '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';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Configuration
const CONFIG = {
    MAX_PAGES: 20,        // Fetch up to 20 pages (4000 markets max)
    EVENTS_PER_PAGE: 200, // Max limit per request
    MAX_RELEVANT_MARKETS: 8, // Maximum number of relevant markets to return
    MAX_MARKETS_FOR_ANALYSIS: 4000, // Increased limit for thorough analysis
    API_TIMEOUT: 30000, // 30 second timeout for individual API calls
    ANALYSIS_TIMEOUT: 180000, // 3 minute timeout for overall analysis
    EMBEDDING_MODEL: 'text-embedding-ada-002', // OpenAI embedding model
    EMBEDDING_BATCH_SIZE: 20, // Number of embeddings to process at once
    EMBEDDING_CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
    BATCH_DELAY: 500, // Delay between batches in milliseconds (reduced from 1000)
    MAX_STORAGE_SIZE: 5 * 1024 * 1024, // 5MB storage limit
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000 // Base delay for exponential backoff
};

// Fetch events from Kalshi API with pagination support
async function fetchKalshiMarkets() {
    try {
        console.log('Starting to fetch Kalshi events...');
        
        let allEvents = [];
        let cursor = null;
        let pageCount = 0;
        const maxPages = CONFIG.MAX_PAGES;
        const limit = CONFIG.EVENTS_PER_PAGE;
        
        do {
            pageCount++;
            console.log(`Fetching page ${pageCount} of up to ${maxPages}...`);
            
            let path = `/trade-api/v2/events?status=open&limit=${limit}`;
            if (cursor) {
                path += `&cursor=${encodeURIComponent(cursor)}`;
            }
            
            console.log('Making API request to:', `${BASE}${path}`);
            const response = await fetch(`${BASE}${path}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            console.log(`Page ${pageCount} API Response status:`, response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const responseText = await response.text();
            console.log(`Page ${pageCount} API Response received, parsing...`);
            
            try {
                const data = JSON.parse(responseText);
                console.log(`Page ${pageCount} response data:`, {
                    eventsCount: data.events?.length || 0,
                    hasCursor: !!data.cursor
                });
                
                if (data.events && Array.isArray(data.events)) {
                    allEvents = allEvents.concat(data.events);
                    console.log(`Total events collected so far: ${allEvents.length}`);
                }
                
                // Update cursor for next page
                cursor = data.cursor;
                
            } catch (parseError) {
                console.error(`Failed to parse page ${pageCount} response:`, parseError);
                console.error('Response text:', responseText.substring(0, 500));
                throw new Error(`Failed to parse API response for page ${pageCount}`);
            }
            
        } while (cursor && pageCount < maxPages);
        
        console.log(`Pagination complete. Fetched ${pageCount} pages with ${allEvents.length} total events.`);
        console.log(`Estimated maximum possible: ${maxPages * limit} events`);
        
        // Transform events to match the expected format
        const events = allEvents.map(event => ({
            ticker: event.event_ticker,
            title: event.title,
            description: event.sub_title || event.title,
            category: event.category || 'General',
            series_ticker: event.series_ticker,
            status: 'open' // All events from this endpoint are open (active and unsettled)
        }));
        
        console.log(`Processed ${events.length} open events from ${allEvents.length} total events`);
        
        return {
            success: true,
            markets: events // Keep the same property name for compatibility with popup
        };
        
    } catch (error) {
        console.error('Error fetching Kalshi events:', error);
        
        // Return error instead of mock data
        return {
            success: false,
            error: error.message,
            markets: []
        };
    }
}

// Utility function for exponential backoff delay
function getRetryDelay(attempt) {
    return CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
}

// OpenAI API functions with retry logic
async function generateEmbedding(text, retryAttempt = 0) {
    try {
        console.log(`Generating embedding for text (attempt ${retryAttempt + 1}):`, text.substring(0, 100) + '...');
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('API request timeout')), CONFIG.API_TIMEOUT);
        });
        
        // Create fetch promise
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
        
        // Race between fetch and timeout
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
        
        // Retry logic
        if (retryAttempt < CONFIG.MAX_RETRY_ATTEMPTS - 1) {
            // Check if it's a retryable error
            const isRetryable = error.message.includes('timeout') || 
                              error.message.includes('Failed to fetch') ||
                              error.message.includes('NetworkError') ||
                              error.message.includes('429') || // Rate limit
                              error.message.includes('500') || // Server error
                              error.message.includes('502') || // Bad gateway
                              error.message.includes('503');   // Service unavailable
            
            if (isRetryable) {
                const delay = getRetryDelay(retryAttempt);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return generateEmbedding(text, retryAttempt + 1);
            }
        }
        
        // If all retries failed or error is not retryable, throw the error
        throw error;
    }
}

// Calculate cosine similarity between two embeddings
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
    
    console.log(`Storage usage: ${currentUsage} bytes, available: ${availableSpace} bytes, needed: ${dataSize} bytes`);
    
    if (dataSize > availableSpace) {
        console.log('Insufficient storage space, clearing cache...');
        await clearOldCache();
        return true; // Cache cleared
    }
    
    return false; // No clearing needed
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
        // Estimate storage size (rough calculation)
        const estimatedSize = JSON.stringify(embeddings).length * 2; // UTF-16 encoding
        
        // Check if we have enough space
        await checkStorageSpace(estimatedSize);
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                marketEmbeddings: embeddings,
                embeddingsCacheTime: Date.now()
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to cache embeddings:', chrome.runtime.lastError);
                    // If storage fails, continue without caching
                    resolve();
                } else {
                    console.log('Market embeddings cached successfully');
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error('Error in cacheMarketEmbeddings:', error);
        // Continue without caching if there's an error
    }
}

// Generate embeddings for all active markets with improved batching and progress tracking
async function generateMarketEmbeddings(markets, progressCallback = null) {
    console.log(`Generating embeddings for ${markets.length} markets...`);
    
    // Check cache first
    const cachedEmbeddings = await getCachedMarketEmbeddings();
    if (cachedEmbeddings && cachedEmbeddings.length >= markets.length * 0.8) { // Allow 20% cache miss tolerance
        console.log(`Using cached embeddings for ${cachedEmbeddings.length} markets`);
        return cachedEmbeddings.slice(0, markets.length); // Return only what we need
    }
    
    const embeddings = [];
    const batchSize = CONFIG.EMBEDDING_BATCH_SIZE;
    const totalBatches = Math.ceil(markets.length / batchSize);
    let processedCount = 0;
    
    // Process markets in smaller batches with progress tracking
    for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`Processing embedding batch ${batchNumber}/${totalBatches} (${batch.length} markets)`);
        
        // Send progress update if callback provided
        if (progressCallback) {
            progressCallback({
                phase: 'embeddings',
                current: batchNumber,
                total: totalBatches,
                message: `Generating embeddings (batch ${batchNumber}/${totalBatches})...`
            });
        }
        
        // Process batch with timeout protection
        const batchPromises = batch.map(async (market, index) => {
            try {
                // Add timeout wrapper for individual embedding generation
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Embedding generation timeout')), 30000); // 30 second timeout
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
            // Continue with next batch even if current batch fails
        }
        
        // Delay between batches to respect rate limits
        if (i + batchSize < markets.length) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
        }
    }
    
    console.log(`Embedding generation completed: ${embeddings.length}/${markets.length} markets processed`);
    
    // Cache the embeddings (with error handling)
    try {
        await cacheMarketEmbeddings(embeddings);
    } catch (error) {
        console.error('Failed to cache embeddings, continuing without cache:', error);
    }
    
    return embeddings;
}

// Estimate token count (rough approximation)
function estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
}

// Create a summarized version of markets for AI analysis
function summarizeMarketsForAI(markets) {
    return markets.map(market => {
        // Create a condensed version with key information
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

// Generate AI-powered content summary using OpenAI
async function generateAIContentSummary(title, summary) {
    try {
        console.log('Generating AI summary for content...');
        
        // Prepare content for summarization
        let contentText = `${title || ''} ${summary || ''}`.trim();
        if (!contentText || contentText.length < 10) {
            return title || 'Content summary not available';
        }
        
        // Truncate if too long to save tokens
        if (contentText.length > 2000) {
            contentText = contentText.substring(0, 2000) + '...';
        }
        
        const prompt = `Please write a brief, clear summary of the following webpage content in 400 characters or fewer. Focus on the main topic and key points:

${contentText}

Summary (400 characters max):`;

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI summary timeout')), CONFIG.API_TIMEOUT);
        });
        
        // Create fetch promise
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
        
        // Race between fetch and timeout
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
        
        // Ensure it's within 400 characters
        if (aiSummary.length > 400) {
            return aiSummary.substring(0, 397) + '...';
        }
        
        return aiSummary;
        
    } catch (error) {
        console.error('Error generating AI summary:', error);
        // Fallback to a simple summary if AI fails
        const fallback = `${title || ''} ${summary || ''}`.substring(0, 397) + '...';
        return fallback || 'Content summary not available';
    }
}

async function fetchEventMarkets(eventTicker) {
    try {
        console.log(`Fetching markets for event: ${eventTicker}`);
        
        let allMarkets = [];
        let cursor = null;
        let pageCount = 0;
        const limit = 50; // Reasonable limit per page
        
        do {
            pageCount++;
            let path = `/trade-api/v2/markets?event_ticker=${eventTicker}&limit=${limit}`;
            if (cursor) {
                path += `&cursor=${encodeURIComponent(cursor)}`;
            }
            
            const response = await fetch(`${BASE}${path}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.markets && Array.isArray(data.markets)) {
                allMarkets = allMarkets.concat(data.markets);
            }
            
            cursor = data.cursor;
            
        } while (cursor);
        
        // Process markets to extract relevant data
        const processedMarkets = allMarkets.map(market => ({
            ticker: market.ticker,
            title: market.title,
            subtitle: market.subtitle || '',
            yes_bid: market.yes_bid,
            yes_ask: market.yes_ask,
            no_bid: market.no_bid,
            no_ask: market.no_ask,
            last_price: market.last_price,
            volume: market.volume || 0,
            volume_24h: market.volume_24h || 0,
            open_interest: market.open_interest || 0,
            close_time: market.close_time,
            status: market.status
        }));
        
        console.log(`Fetched ${processedMarkets.length} markets for event ${eventTicker}`);
        return processedMarkets;
        
    } catch (error) {
        console.error(`Error fetching markets for ${eventTicker}:`, error);
        return [];
    }
}

// Find relevant markets using AI-powered relevance analysis with optimized batching
async function findRelevantMarkets(pageContent, markets, progressCallback = null) {
    const startTime = Date.now();
    
    // Wrap the entire analysis in a timeout to prevent hanging
    const analysisPromise = (async () => {
        console.log('Finding relevant markets using AI analysis...');
        
        // Limit the number of markets to process for efficiency
        const limitedMarkets = markets.slice(0, CONFIG.MAX_MARKETS_FOR_ANALYSIS);
        console.log(`Processing ${limitedMarkets.length} markets (limited from ${markets.length})`);
        
        // Prepare page content (truncate if too long)
        let contentText = `${pageContent.title} ${pageContent.summary}`.trim();
        if (!contentText || contentText.length < 10) {
            throw new Error('Insufficient page content for analysis');
        }
        
        // Generate AI-powered summary for display (400 characters max)
        const displaySummary = await generateAIContentSummary(pageContent.title, pageContent.summary);
        
        // Truncate content if too long to save tokens
        if (contentText.length > 1500) {
            contentText = contentText.substring(0, 1500) + '...';
        }
        
        // Use larger batch size and fewer batches for efficiency
        const basePromptTokens = estimateTokens(`Given the following webpage content and list of prediction markets, identify which markets are most relevant to the content. Return ONLY a JSON array of the top 5-8 most relevant markets with their relevance scores.

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

Only include markets with relevance score 40 or higher. If no markets are highly relevant, return an empty array.`);
        
        // Reserve tokens for response (1000) and safety margin (1000)
        const availableTokens = 16000 - basePromptTokens - 2000;
        
        // Estimate tokens per market entry (ticker + title + description)
        const avgTokensPerMarket = 40; // More aggressive estimate
        const marketsPerBatch = Math.floor(availableTokens / avgTokensPerMarket);
        const batchSize = Math.min(marketsPerBatch, 300); // Larger batch size for efficiency
        
        console.log(`Token analysis: base=${basePromptTokens}, available=${availableTokens}, batch size=${batchSize}`);
        
        // Summarize markets to reduce token usage
        const summarizedMarkets = summarizeMarketsForAI(limitedMarkets);
        
        // Limit to maximum 12 batches to ensure reasonable completion time while allowing more comprehensive analysis
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
                // Prepare markets list for this batch
                const marketsList = batch.map((market, index) => 
                    `${i + index + 1}. ${market.ticker}: ${market.title} - ${market.description}`
                ).join('\n');
                
                // Create optimized prompt for relevance analysis
                const prompt = `Given the following webpage content and list of prediction markets, identify which markets are most relevant to the content. Based specifically on the content of the webpage what markets might the user be most interested in participating in? Return ONLY a JSON array of the top 5-8 most relevant markets with their relevance scores.

WEBPAGE CONTENT:
Title: ${pageContent.title}
Content: ${contentText}

PREDICTION MARKETS:
${marketsList}

Return ONLY a JSON array in this exact format:
[
  {
    "ticker": "MARKET_TICKER",
    "relevanceScore": 85,
    "reason": "Brief explanation of relevance"
  }
]

Only include markets with relevance score 40 or higher. If no markets are highly relevant, return an empty array.`;

                // Double-check token count before sending
                const promptTokens = estimateTokens(prompt);
                if (promptTokens > 15000) {
                    console.warn(`Batch ${batchNumber} prompt too long (${promptTokens} tokens), skipping...`);
                    continue;
                }
                
                console.log(`Sending AI analysis request for batch ${batchNumber} (${promptTokens} estimated tokens)...`);
                
                // Create timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('AI analysis timeout')), CONFIG.API_TIMEOUT);
                });
                
                // Create fetch promise
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
                
                // Race between fetch and timeout
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
                
                // Parse AI response
                let relevantTickers;
                try {
                    relevantTickers = JSON.parse(aiResponse);
                } catch (parseError) {
                    console.error(`Failed to parse AI response for batch ${batchNumber}:`, parseError);
                    // Try to extract JSON from response if it's wrapped in text
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
                
                // Match AI results with original market data
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
                
                // Reduced delay between batches
                if (i + batchSize < marketsToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
                }
                
            } catch (error) {
                console.error(`Error processing batch ${batchNumber}:`, error);
                // Continue with next batch even if current batch fails
            }
        }
        
        // Sort by relevance score and take top results
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
    
    // Add overall timeout for the entire analysis
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
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'analyzePageContent') {
        console.log('Analyzing page content for relevant markets...');
        
        // First get the page content from the content script
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
                    // Fetch active markets
                    const marketsResult = await fetchKalshiMarkets();
                    if (!marketsResult.success) {
                        sendResponse({
                            success: false,
                            error: 'Failed to fetch active markets: ' + marketsResult.error,
                            markets: []
                        });
                        return;
                    }
                    
                    // Find relevant markets using semantic matching
                    const relevantResult = await findRelevantMarkets(
                        contentResponse.content, 
                        marketsResult.markets
                    );
                    
                    // Add fetching of sub-markets for relevant events
                    for (let event of relevantResult.markets) {
                        event.subMarkets = await fetchEventMarkets(event.ticker);
                    }

                    sendResponse(relevantResult);
                    
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
        
        return true; // Keep message channel open for async response
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
