// Background service worker for the Chrome extension
console.log('Market Suggestion Extension: Background script loaded');

// Import configuration and API client (browser-compatible)
importScripts('/common/config.js');
importScripts('/market-suggestions/api-client.js');

// Kalshi API configuration
// Use var to allow redeclaration and prevent errors when script is imported multiple times
var BASE = 'https://api.elections.kalshi.com';
var KALSHI_KEY_ID = 'c2499810-0f10-4a75-9fb0-09e6592e1398';

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
// Generate embedding for text using secure API client
async function generateEmbedding(text, retryAttempt = 0) {
    return apiClient.generateEmbedding(text, retryAttempt);
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
        if (contentText.length > 2500) {
            contentText = contentText.substring(0, 2500) + '...';
        }
        
        const prompt = `Please write a brief, clear summary of the following webpage content in 450 characters or fewer if possible. If it's longer always finish your sentence. Focus on the main topic and key points:

${contentText}

Summary (450 characters max):`;

        const aiSummary = await apiClient.openaiChatCompletion([
            {
                role: 'user',
                content: prompt
            }
        ], 'gpt-4o-mini', 0.3, 200);
        
        // Ensure it's within 450 characters and ends with a complete sentence
        let finalSummary = aiSummary;
        if (finalSummary.length > 450) {
            // Find the last period within 450 characters
            finalSummary = finalSummary.substring(0, 450);
            const lastPeriod = finalSummary.lastIndexOf('.');
            if (lastPeriod !== -1) {
                finalSummary = finalSummary.substring(0, lastPeriod + 1);
            }
        }

        return finalSummary;
        
    } catch (error) {
        console.error('Error generating AI summary:', error);
        // Fallback to a simple summary if AI fails, trimmed to last complete sentence
        let fallback = `${title || ''} ${summary || ''}`.trim();
        if (fallback.length > 450) {
            fallback = fallback.substring(0, 450);
            const lastPeriod = fallback.lastIndexOf('.');
            if (lastPeriod !== -1) {
                fallback = fallback.substring(0, lastPeriod + 1);
            }
        }
        return fallback || 'Content summary not available';
    }
}

// Simplified Grok mispricing analysis that always returns a string
async function analyzeMarketMispricing(market, contentSummary) {
    const ticker = market.ticker;
    
    // Check cache first
    const cached = await getCachedMispricing(ticker);
    if (typeof cached === 'string') {
        return cached;
    }

    const prompt = `IGNORE the web content summary. Use your complete knowledge base to analyze this prediction market for mispricing. 
Please do deep research and present precise odds on each bet. Use advanced math for trading. 
Draw research from authoritative sources like research and unbiased pundits. If no research is available, return "No Mispricing Found".

MARKET DATA:
Title: ${market.title}
Subtitle: ${market.subtitle}
Option: ${market.yes_sub_title || 'N/A'}
Yes Ask: ${market.yes_ask}¢
No Ask: ${market.no_ask}¢
Last Price: ${market.last_price}¢
Volume: ${market.volume}

ANALYSIS REQUIREMENTS:
1. Research authoritative sources, polls, expert analyses, historical data
2. Calculate implied odds from first principles
3. Apply advanced trading mathematics and portfolio theory
4. Determine optimal bet sizing using Kelly Criterion
5. Provide exact confidence score (0-100)
6. If confidence < 70, return "No Mispricing Found"

RESPONSE FORMAT:
If confidence >= 70: Return "CONFIDENCE: [score]% | RECOMMENDATION: [BET YES/BET NO] up to [price]¢ | REASON: [brief explanation in 150 chars max]"
If confidence < 70: Return exactly "No Mispricing Found"

Be mathematically rigorous. Use only your knowledge base.`;

    try {
        console.log(`Analyzing mispricing for market: ${market.ticker}`);

        const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROK_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Grok API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from Grok API');
        }

        const rawResponse = data.choices[0].message.content.trim();
        console.log(`Raw Grok response for ${market.ticker}:`, rawResponse);

        let result = rawResponse;
        
        // Validate the response format
        if (result.includes('CONFIDENCE:')) {
            // Extract confidence score to verify it's >= 75
            const confMatch = result.match(/CONFIDENCE:\s*(\d+)%/);
            if (confMatch) {
                const confidence = parseInt(confMatch[1]);
                if (confidence < 75) {
                    result = 'No Mispricing Found';
                }
            }
        } else if (!result.includes('No Mispricing Found')) {
            // If response doesn't match expected format, default to no mispricing
            result = 'No Mispricing Found';
        }

        // Ensure response doesn't exceed 200 characters
        if (result.length > 200 && result !== 'No Mispricing Found') {
            result = result.substring(0, 197) + '...';
        }

        // Final safety check to ensure we're returning a string
        if (typeof result !== 'string') {
            console.error('Non-string result detected:', typeof result, result);
            result = 'No Mispricing Found';
        }

        await cacheMispricing(ticker, result);
        return result;

    } catch (error) {
        console.error('Error in Grok mispricing analysis:', error);
        return 'No Mispricing Found';
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
        const processedMarkets = allMarkets.map(market => {
            // Check for settlement/outcome information
            let settlement = null;
            let outcome = null;
            
            // Check various possible fields for settlement information
            if (market.settlement) {
                settlement = market.settlement;
            } else if (market.outcome) {
                outcome = market.outcome;
            } else if (market.result) {
                outcome = market.result;
            }
            
            // Determine if market is resolved based on status and settlement info
            let isResolved = market.status === 'settled' || market.status === 'resolved' || market.status === 'finalized' || settlement || outcome;
            
            // Only mark as resolved if status is explicitly inactive AND both prices are 100¢
            // This indicates a truly closed/resolved market
            if (!isResolved && market.status === 'inactive' && market.yes_ask !== null && market.no_ask !== null) {
                if (market.yes_ask === 100 && market.no_ask === 100) {
                    isResolved = true;
                }
            }
            
            // For resolved markets, determine the outcome
            let resolvedOutcome = null;
            if (isResolved) {
                if (settlement) {
                    resolvedOutcome = settlement;
                } else if (outcome) {
                    resolvedOutcome = outcome;
                } else if (market.last_price !== null && market.last_price !== undefined) {
                    // If last price is 0, it's likely "No", if 100, it's likely "Yes"
                    resolvedOutcome = market.last_price === 0 ? 'No' : market.last_price === 100 ? 'Yes' : null;
                } else if (market.yes_ask !== null && market.no_ask !== null && (market.status === 'inactive' || market.status === 'finalized')) {
                    // For inactive or finalized markets with both prices at 100¢, check last_price for outcome
                    if (market.yes_ask === 100 && market.no_ask === 100) {
                        if (market.last_price !== null && market.last_price !== undefined) {
                            // If last_price is 0, it's "No", if 100, it's "Yes"
                            resolvedOutcome = market.last_price === 0 ? 'No' : market.last_price === 100 ? 'Yes' : 'No';
                        } else {
                            // Default to 'No' if no last_price available
                            resolvedOutcome = 'No';
                        }
                    }
                }
            }
            
            return {
                ticker: market.ticker,
                title: market.title,
                subtitle: market.subtitle || '',
                yes_sub_title: market.yes_sub_title || '',
                no_sub_title: market.no_sub_title || '',
                market_type: market.market_type || 'binary',
                yes_bid: market.yes_bid !== null && market.yes_bid !== undefined ? market.yes_bid : null,
                yes_ask: market.yes_ask !== null && market.yes_ask !== undefined ? market.yes_ask : null,
                no_bid: market.no_bid !== null && market.no_bid !== undefined ? market.no_bid : null,
                no_ask: market.no_ask !== null && market.no_ask !== undefined ? market.no_ask : null,
                last_price: market.last_price !== null && market.last_price !== undefined ? market.last_price : null,
                volume: market.volume || 0,
                volume_24h: market.volume_24h || 0,
                open_interest: market.open_interest || 0,
                close_time: market.close_time,
                status: market.status,
                isResolved: isResolved,
                resolvedOutcome: resolvedOutcome,
                settlement: settlement,
                outcome: outcome,
                rules_primary: market.rules_primary || '',
                response_price_units: market.response_price_units || 'usd_cent'
            };
        });
        
        console.log(`Fetched ${processedMarkets.length} markets for event ${eventTicker}`);
        
        // Log some sample market data to debug settlement information
        if (processedMarkets.length > 0) {
            console.log('Sample market data structure:', {
                ticker: processedMarkets[0].ticker,
                status: processedMarkets[0].status,
                isResolved: processedMarkets[0].isResolved,
                resolvedOutcome: processedMarkets[0].resolvedOutcome,
                settlement: processedMarkets[0].settlement,
                outcome: processedMarkets[0].outcome,
                last_price: processedMarkets[0].last_price,
                yes_ask: processedMarkets[0].yes_ask,
                no_ask: processedMarkets[0].no_ask
            });
            
            // Log any markets that are being marked as resolved
            const resolvedMarkets = processedMarkets.filter(m => m.isResolved);
            if (resolvedMarkets.length > 0) {
                console.log('Markets marked as resolved:', resolvedMarkets.map(m => ({
                    ticker: m.ticker,
                    status: m.status,
                    resolvedOutcome: m.resolvedOutcome,
                    yes_ask: m.yes_ask,
                    no_ask: m.no_ask,
                    last_price: m.last_price
                })));
            }
        }
        
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
                
                const aiResponse = await apiClient.openaiChatCompletion([
                    {
                        role: 'user',
                        content: prompt
                    }
                ], 'gpt-4o-mini', 0.1, 1000);
                console.log(`AI Response for batch ${batchNumber}:`, aiResponse);
                
                // Parse AI response with improved handling for code blocks
                let relevantTickers;
                let parseAttempt = aiResponse;

                // First, try to clean if wrapped in code block
                if (parseAttempt.startsWith('```json') && parseAttempt.endsWith('```')) {
                    parseAttempt = parseAttempt.slice(7, -3).trim();
                } else if (parseAttempt.startsWith('```') && parseAttempt.endsWith('```')) {
                    parseAttempt = parseAttempt.slice(3, -3).trim();
                }

                try {
                    relevantTickers = JSON.parse(parseAttempt);
                } catch (parseError) {
                    console.error(`Failed to parse AI response for batch ${batchNumber}:`, parseError);
                    
                    // Fallback: Try to extract JSON array from response
                    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        try {
                            relevantTickers = JSON.parse(jsonMatch[0]);
                        } catch (fallbackError) {
                            console.warn(`Fallback parse failed for batch ${batchNumber}:`, fallbackError);
                            continue;
                        }
                    } else {
                        console.warn(`No JSON array found in response for batch ${batchNumber}, skipping...`);
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

// Add caching functions for mispricing
async function getCachedMispricing(ticker) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['mispricingCache'], (result) => {
            const cache = result.mispricingCache || {};
            const entry = cache[ticker];
            if (entry && (Date.now() - entry.timestamp) < CONFIG.MISPRICING_CACHE_EXPIRY) {
                console.log(`Using cached mispricing for ${ticker}`);
                resolve(entry.result);
            } else {
                resolve(null);
            }
        });
    });
}

async function cacheMispricing(ticker, result) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['mispricingCache'], (result) => {
            const cache = result.mispricingCache || {};
            cache[ticker] = {
                result: result,
                timestamp: Date.now()
            };
            chrome.storage.local.set({ mispricingCache: cache }, () => {
                resolve();
            });
        });
    });
}

// Handle market suggestions messages from the main background router
function handleMarketSuggestionsMessage(request, sender, sendResponse) {
    console.log('Market suggestions background received message:', request);
    
    // Remove the 'market-suggestions:' prefix for processing
    const action = request.action.replace('market-suggestions:', '');
    
    if (action === 'getSettings') {
        chrome.storage.local.get(['settings'], (result) => {
            sendResponse({ settings: result.settings || {} });
        });
        return true;
    }
    
    if (action === 'updateSettings') {
        chrome.storage.local.set({ settings: request.settings }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (action === 'openMarket') {
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
        return true;
    }
    
    if (action === 'getKalshiMarkets') {
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
    
    if (action === 'analyzePageContent') {
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
                    // Send progress update function
                    const sendProgress = (progressData) => {
                        // Send progress updates directly to popup
                        chrome.runtime.sendMessage({
                            action: 'progressUpdate',
                            progress: progressData
                        }).catch(() => {
                            // Popup might be closed, ignore errors
                        });
                    };
                    
                    // Step 1: Extract content (already done)
                    sendProgress({
                        phase: 'content',
                        current: 1,
                        total: 1,
                        percentage: 10,
                        message: 'Extracting page content...',
                        details: 'Reading webpage content and filtering out ads...'
                    });
                    
                    // Step 2: Fetch active markets
                    sendProgress({
                        phase: 'fetching',
                        current: 1,
                        total: 1,
                        percentage: 20,
                        message: 'Fetching active markets...',
                        details: 'Connecting to Kalshi API to get latest markets...'
                    });
                    
                    const marketsResult = await fetchKalshiMarkets();
                    if (!marketsResult.success) {
                        sendResponse({
                            success: false,
                            error: 'Failed to fetch active markets: ' + marketsResult.error,
                            markets: []
                        });
                        return;
                    }
                    
                    sendProgress({
                        phase: 'processing',
                        current: 1,
                        total: 1,
                        percentage: 35,
                        message: 'Processing markets...',
                        details: `Found ${marketsResult.markets.length} markets, preparing for analysis...`
                    });
                    
                    // Step 3: Find relevant markets using semantic matching with real progress
                    const relevantResult = await findRelevantMarkets(
                        contentResponse.content, 
                        marketsResult.markets,
                        (progressData) => {
                            // Convert progress data to percentage (35-70% range)
                            const percentage = 35 + (progressData.current / progressData.total) * 35;
                            sendProgress({
                                phase: progressData.phase,
                                current: progressData.current,
                                total: progressData.total,
                                percentage: Math.round(percentage),
                                message: progressData.message,
                                details: 'Finding relevant markets for this content...'
                            });
                        }
                    );
                    
                    sendProgress({
                        phase: 'submarkets',
                        current: 1,
                        total: 1,
                        percentage: 75,
                        message: 'Fetching sub-markets...',
                        details: 'Getting detailed market information in parallel...'
                    });
                    
                    // Step 4: Fetch sub-markets in parallel for better performance
                    console.log(`Starting parallel fetch of ${relevantResult.markets.length} events...`);
                    
                    // Create parallel promises for all sub-market fetching
                    const subMarketPromises = relevantResult.markets.map(async (event, index) => {
                        try {
                            console.log(`Starting fetch for event ${index + 1}/${relevantResult.markets.length}: ${event.ticker}`);
                            const subMarkets = await fetchEventMarkets(event.ticker);
                            event.subMarkets = subMarkets;
                            
                            // Update progress for this specific event
                            const percentage = 75 + ((index + 1) / relevantResult.markets.length) * 10;
                            sendProgress({
                                phase: 'submarkets',
                                current: index + 1,
                                total: relevantResult.markets.length,
                                percentage: Math.round(percentage),
                                message: 'Fetching sub-markets...',
                                details: `Completed ${index + 1}/${relevantResult.markets.length} events...`
                            });
                            
                            return {
                                event: event,
                                subMarkets: subMarkets,
                                success: true
                            };
                        } catch (error) {
                            console.error(`Error fetching sub-markets for ${event.ticker}:`, error);
                            event.subMarkets = [];
                            return {
                                event: event,
                                subMarkets: [],
                                success: false,
                                error: error.message
                            };
                        }
                    });
                    
                    // Execute all sub-market fetching in parallel
                    const subMarketResults = await Promise.all(subMarketPromises);
                    
                    // Collect all sub-markets and handle any errors
                    const allSubMarkets = [];
                    let successCount = 0;
                    let errorCount = 0;
                    
                    subMarketResults.forEach((result, index) => {
                        if (result.success) {
                            allSubMarkets.push(...result.subMarkets);
                            successCount++;
                        } else {
                            errorCount++;
                            console.warn(`Failed to fetch sub-markets for event ${index}: ${result.error}`);
                        }
                    });
                    
                    console.log(`Parallel sub-market fetching completed: ${successCount} successful, ${errorCount} failed, ${allSubMarkets.length} total sub-markets`);

                    // Step 5: Analyze mispricing
                    sendProgress({
                        phase: 'analysis',
                        current: 1,
                        total: 1,
                        percentage: 85,
                        message: 'Analyzing mispricing...',
                        details: 'Running market analysis algorithms...'
                    });
                    
                    // Limit to max analyses
                    const subMarketsToAnalyze = allSubMarkets.slice(0, CONFIG.MAX_MISPRICING_ANALYSES);

                    // Parallelize analyses with progress tracking
                    let completedAnalyses = 0;
                    const analysisPromises = subMarketsToAnalyze.map(async (subMarket) => {
                        subMarket.mispricing = await analyzeMarketMispricing(subMarket, relevantResult.contentSummary);
                        completedAnalyses++;
                        
                        // Update progress (85-95% range)
                        const percentage = 85 + (completedAnalyses / subMarketsToAnalyze.length) * 10;
                        sendProgress({
                            phase: 'mispricing',
                            current: completedAnalyses,
                            total: subMarketsToAnalyze.length,
                            percentage: Math.round(percentage),
                            message: 'Analyzing mispricing...',
                            details: `Analyzed ${completedAnalyses}/${subMarketsToAnalyze.length} markets...`
                        });
                        
                        return subMarket;
                    });

                    await Promise.all(analysisPromises);

                    // For sub-markets not analyzed, set default
                    for (let event of relevantResult.markets) {
                        for (let subMarket of event.subMarkets) {
                            if (!subMarket.mispricing) {
                                subMarket.mispricing = 'Analysis skipped';
                            }
                        }
                    }

                    // Final progress update
                    sendProgress({
                        phase: 'complete',
                        current: 1,
                        total: 1,
                        percentage: 100,
                        message: 'Complete!',
                        details: 'Analysis finished successfully.'
                    });

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
    
    // Unknown action
    console.warn('Unknown market suggestions action:', action);
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
}
