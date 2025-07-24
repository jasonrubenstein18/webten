// Background service worker for Polymarket integration
console.log('Market Suggestion Extension: Polymarket Background script loaded');

// Polymarket Gamma API configuration
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

// Configuration for Polymarket
const POLYMARKET_CONFIG = {
    MAX_PAGES: 50,        // Fetch up to 50 pages (10,000 markets max)
    MARKETS_PER_PAGE: 200, // Markets per page (increased for efficiency)
    MAX_RELEVANT_MARKETS: 8, // Maximum number of relevant markets to return
    MAX_MARKETS_FOR_ANALYSIS: 10000, // Maximum markets for analysis
    API_TIMEOUT: 30000, // 30 second timeout for individual API calls
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000, // Base delay for exponential backoff
};

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

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI summary timeout')), POLYMARKET_CONFIG.API_TIMEOUT);
        });
        
        // Create fetch promise
        const fetchPromise = fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 200
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

// Fetch ALL Polymarket markets with pricing data
async function fetchAllPolymarketMarkets() {
    try {
        console.log('Starting to fetch ALL Polymarket markets...');
        
        let allMarkets = [];
        let offset = 0;
        let pageCount = 0;
        const maxPages = POLYMARKET_CONFIG.MAX_PAGES;
        const limit = POLYMARKET_CONFIG.MARKETS_PER_PAGE;
        
        do {
            pageCount++;
            console.log(`Fetching markets page ${pageCount} of up to ${maxPages}...`);
            
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
                active: 'true',      // Only get active markets
                closed: 'false',     // Exclude closed markets
                order: 'volume',
                ascending: 'false'   // Sort by volume descending
            });
            
            const url = `${GAMMA_BASE}/markets?${params}`;
            console.log('Making markets API request to:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`Markets page ${pageCount} API Response status:`, response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Markets API Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const markets = await response.json();
            console.log(`Markets page ${pageCount} response data:`, {
                marketsCount: markets?.length || 0,
                hasMore: markets?.length === limit
            });
            
            if (markets && Array.isArray(markets)) {
                // Filter for markets that are truly active and have pricing data
                const marketsWithPricing = markets.filter(market => 
                    market.outcomePrices && 
                    market.outcomes &&
                    market.active === true &&
                    market.closed === false &&
                    market.archived !== true &&
                    market.slug  // Must have a slug for URL generation
                );
                allMarkets = allMarkets.concat(marketsWithPricing);
                console.log(`Page ${pageCount}: Found ${marketsWithPricing.length}/${markets.length} markets that are active with pricing`);
                console.log(`Total markets with pricing collected so far: ${allMarkets.length}`);
            }
            
            // Check if we got fewer markets than requested (last page)
            if (!markets || markets.length < limit) {
                break;
            }
            
            offset += limit;
            
        } while (pageCount < maxPages);
        
        console.log(`Markets pagination complete. Fetched ${pageCount} pages with ${allMarkets.length} total markets with pricing.`);
        console.log(`Total API markets available: ~${pageCount * limit} (estimated)`);
        console.log(`Valid markets with pricing: ${allMarkets.length}`);
        
        return allMarkets;
        
    } catch (error) {
        console.error('Error fetching Polymarket markets:', error);
        throw error;
    }
}

// Helper function to round prices to nearest tenth of a cent
function roundPrice(price) {
    return Math.round(price * 10) / 10;
}

// Transform Polymarket market data to match Kalshi format
function transformPolymarketMarket(market) {
    // Parse outcomes and prices safely
    let outcomes = [];
    let prices = [];
    
    try {
        if (market.outcomes) {
            outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
        }
        if (market.outcomePrices) {
            const priceArray = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices;
            prices = priceArray.map(p => roundPrice(parseFloat(p) * 100)); // Convert to cents and round
        }
    } catch (e) {
        console.warn('Error parsing market outcomes/prices:', e);
        return null; // Skip invalid markets
    }
    
    // Extract parent event information
    let parentTitle = null;
    let parentSlug = null;
    
    if (market.events && market.events.length > 0) {
        parentTitle = market.events[0].title;
        parentSlug = market.events[0].slug;
    }
    
    // For binary Yes/No markets, create a single sub-market with both prices
    if (outcomes.length === 2) {
        // Find Yes and No indices
        let yesIndex = outcomes.findIndex(outcome => outcome.toLowerCase() === 'yes');
        let noIndex = outcomes.findIndex(outcome => outcome.toLowerCase() === 'no');
        
        // Fallback if exact match not found
        if (yesIndex === -1) yesIndex = 0;
        if (noIndex === -1) noIndex = 1;
        
        // Use the groupItemTitle if available, otherwise extract from question
        let title = market.groupItemTitle || market.question || market.title || 'Untitled Market';
        
        // If no groupItemTitle, try to extract name from question
        if (!market.groupItemTitle && market.question && market.question.startsWith('Will ') && market.question.includes(' be the ')) {
            const nameMatch = market.question.match(/Will (.*?) be the /);
            if (nameMatch && nameMatch[1]) {
                title = nameMatch[1];
            }
        }
        
        const subMarket = {
            ticker: market.conditionId || market.id || 'UNKNOWN',
            title: title,
            yes_sub_title: title,
            yes_ask: prices[yesIndex] || 0,
            no_ask: prices[noIndex] || 0,
            volume_24h: parseFloat(market.volume24hr || market.volume || 0),
            status: market.active && !market.closed ? 'open' : 'closed'
        };
        
        return {
            ticker: market.conditionId || market.id || 'UNKNOWN',
            title: parentTitle || market.question || market.title || 'Untitled Market',
            slug: market.slug, // Pass through the slug for URL generation
            parentSlug: parentSlug, // Pass through parent slug for proper URL generation
            subMarkets: [subMarket],
            volume: parseFloat(market.volume) || 0,
            volume_24h: parseFloat(market.volume24hr || market.volume || 0),
            open_interest: parseFloat(market.liquidity) || 0,
            close_time: market.endDate,
            status: market.active && !market.closed ? 'open' : 'closed',
            rules_primary: market.description || '',
            response_price_units: 'usd_cent'
        };
    }
    
    // For multi-outcome markets, create sub-markets for each outcome
    const subMarkets = [];
    for (let i = 0; i < outcomes.length; i++) {
        // Use the groupItemTitle if available, otherwise use the outcome
        let subTitle = market.groupItemTitle || outcomes[i];
        
        // If no groupItemTitle, try to extract name from question
        if (!market.groupItemTitle && market.question && market.question.startsWith('Will ') && market.question.includes(' be the ')) {
            const nameMatch = market.question.match(/Will (.*?) be the /);
            if (nameMatch && nameMatch[1]) {
                subTitle = nameMatch[1];
            }
        }
        
        subMarkets.push({
            ticker: market.conditionId || market.id || 'UNKNOWN',
            title: subTitle,
            yes_sub_title: subTitle,
            yes_ask: prices[i] || 0,
            no_ask: roundPrice(100 - (prices[i] || 0)), // Complement for multi-outcome (rounded)
            volume_24h: parseFloat(market.volume24hr || market.volume || 0) / outcomes.length, // Approximate split
            status: market.active && !market.closed ? 'open' : 'closed'
        });
    }
    
    return {
        ticker: market.conditionId || market.id || 'UNKNOWN',
        title: parentTitle || market.question || market.title || 'Untitled Market',
        slug: market.slug, // Pass through the slug for URL generation
        parentSlug: parentSlug, // Pass through parent slug for proper URL generation
        subMarkets: subMarkets,
        volume: parseFloat(market.volume) || 0,
        volume_24h: parseFloat(market.volume24hr || market.volume || 0),
        open_interest: parseFloat(market.liquidity) || 0,
        close_time: market.endDate,
        status: market.active && !market.closed ? 'open' : 'closed',
        rules_primary: market.description || '',
        response_price_units: 'usd_cent'
    };
}

// Group markets by their parent event to combine related binary markets
function groupMarketsByParentEvent(markets) {
    console.log('Grouping markets by parent event...');
    
    const groupedMarkets = new Map();
    
    for (let market of markets) {
        // Extract parent event information
        let parentTitle = null;
        let parentSlug = null;
        let eventId = null;
        
        if (market.events && market.events.length > 0) {
            parentTitle = market.events[0].title;
            parentSlug = market.events[0].slug;
            eventId = market.events[0].id;
        }
        
        // Use parent event as grouping key, or individual market if no parent
        const groupKey = eventId || parentSlug || market.conditionId || market.id;
        
        if (!groupedMarkets.has(groupKey)) {
            groupedMarkets.set(groupKey, {
                parentTitle: parentTitle,
                parentSlug: parentSlug,
                eventId: eventId,
                markets: []
            });
        }
        
        groupedMarkets.get(groupKey).markets.push(market);
    }
    
    console.log(`Grouped ${markets.length} markets into ${groupedMarkets.size} parent events`);
    return groupedMarkets;
}

// Transform grouped markets into a combined multi-outcome market
function transformGroupedMarkets(groupKey, groupData) {
    const markets = groupData.markets;
    
    if (markets.length === 1) {
        // Single market - transform normally
        return transformPolymarketMarket(markets[0]);
    }
    
    // Multiple markets - combine into single multi-outcome market
    const firstMarket = markets[0];
    const subMarkets = [];
    
    for (let market of markets) {
        // Parse outcomes and prices
        let outcomes = [];
        let prices = [];
        
        try {
            if (market.outcomes) {
                outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
            }
            if (market.outcomePrices) {
                const priceArray = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices;
                prices = priceArray.map(p => roundPrice(parseFloat(p) * 100)); // Convert to cents and round
            }
        } catch (e) {
            console.warn('Error parsing market outcomes/prices:', e);
            continue; // Skip invalid markets
        }
        
        // Extract the specific outcome this market represents
        let outcomeTitle = market.groupItemTitle || market.question || market.title || 'Untitled Market';
        
        // Try to extract name from question if available
        if (!market.groupItemTitle && market.question) {
            if (market.question.startsWith('Will ') && market.question.includes(' be the ')) {
                const nameMatch = market.question.match(/Will (.*?) be the /);
                if (nameMatch && nameMatch[1]) {
                    outcomeTitle = nameMatch[1];
                }
            } else if (market.question.includes('?')) {
                // Try to extract the main subject from other question formats
                outcomeTitle = market.question.replace(/^(Will|Does|Is)\s+/i, '').replace(/\?$/, '');
            }
        }
        
        // For binary markets, find the Yes price
        let yesPrice = 0;
        if (outcomes.length === 2) {
            const yesIndex = outcomes.findIndex(outcome => outcome.toLowerCase() === 'yes');
            yesPrice = yesIndex !== -1 ? (prices[yesIndex] || 0) : (prices[0] || 0);
        } else if (outcomes.length === 1) {
            yesPrice = prices[0] || 0;
        }
        
        subMarkets.push({
            ticker: market.conditionId || market.id || 'UNKNOWN',
            title: outcomeTitle,
            yes_sub_title: outcomeTitle,
            yes_ask: yesPrice,
            no_ask: roundPrice(100 - yesPrice), // Complement
            volume_24h: parseFloat(market.volume24hr || market.volume || 0),
            status: market.active && !market.closed ? 'open' : 'closed'
        });
    }
    
    // Sort submarkets by yes_ask price descending (most likely outcomes first)
    subMarkets.sort((a, b) => b.yes_ask - a.yes_ask);
    
    return {
        ticker: groupKey,
        title: groupData.parentTitle || firstMarket.question || firstMarket.title || 'Untitled Market',
        slug: firstMarket.slug,
        parentSlug: groupData.parentSlug,
        subMarkets: subMarkets,
        volume: markets.reduce((sum, m) => sum + parseFloat(m.volume || 0), 0),
        volume_24h: markets.reduce((sum, m) => sum + parseFloat(m.volume24hr || m.volume || 0), 0),
        open_interest: markets.reduce((sum, m) => sum + parseFloat(m.liquidity || 0), 0),
        close_time: firstMarket.endDate,
        status: markets.some(m => m.active && !m.closed) ? 'open' : 'closed',
        rules_primary: firstMarket.description || '',
        response_price_units: 'usd_cent'
    };
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
        const description = market.description ? (market.description.length > 150 ? market.description.substring(0, 150) + '...' : market.description) : 'No description';
        
        return {
            ticker: market.ticker,
            title: title,
            description: description,
            category: market.category
        };
    });
}

// Find relevant markets using AI-powered relevance analysis with optimized batching
async function findRelevantPolymarketMarkets(pageContent, markets, totalFetchedMarkets = 0, progressCallback = null) {
    const startTime = Date.now();
    
    // Wrap the entire analysis in a timeout to prevent hanging
    const analysisPromise = (async () => {
        console.log('Finding relevant Polymarket markets using AI analysis...');
        
        // Process ALL markets (no artificial limit)
        const marketsToAnalyze = markets;
        console.log(`Processing ${marketsToAnalyze.length} markets (ALL available markets)`);
        
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
        const basePromptTokens = estimateTokens(`Given the following webpage content and list of Polymarket prediction markets, identify which markets are most relevant to the web content. Return ONLY a JSON array of the top 5-8 most relevant markets with their relevance scores.

WEBPAGE CONTENT:
Title: ${pageContent.title}
Content: ${contentText}

POLYMARKET MARKETS:

Return ONLY a JSON array in this exact format:
[
  {
    "ticker": "MARKET_TICKER",
    "relevanceScore": 85,
    "reason": "Brief explanation of relevance"
  }
]

Only include markets with relevance score 75 or higher. If no markets are highly relevant, return an empty array.`);
        
        // Reserve tokens for response (1000) and safety margin (1000)
        const availableTokens = 16000 - basePromptTokens - 2000;
        
        // Estimate tokens per market entry (ticker + title + description)
        const avgTokensPerMarket = 40; // More aggressive estimate
        const marketsPerBatch = Math.floor(availableTokens / avgTokensPerMarket);
        const batchSize = Math.min(marketsPerBatch, 300); // Larger batch size for efficiency
        
        console.log(`Token analysis: base=${basePromptTokens}, available=${availableTokens}, batch size=${batchSize}`);
        
        // Summarize markets to reduce token usage
        const summarizedMarkets = summarizeMarketsForAI(marketsToAnalyze);
        
        // Process ALL markets in batches (no artificial limit)
        const totalBatches = Math.ceil(summarizedMarkets.length / batchSize);
        
        console.log(`Processing ${summarizedMarkets.length} markets in ${totalBatches} batches (ALL markets)`);
        
        let allRelevantMarkets = [];
        
        for (let i = 0; i < summarizedMarkets.length; i += batchSize) {
            const batch = summarizedMarkets.slice(i, i + batchSize);
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
                const prompt = `Given the following webpage content and list of Polymarket prediction markets, identify which markets are most relevant to the content. Based specifically on the content of the webpage what markets might the user be most interested in participating in? Return ONLY a JSON array of the top 5-8 most relevant markets with their relevance scores.

WEBPAGE CONTENT:
Title: ${pageContent.title}
Content: ${contentText}

POLYMARKET MARKETS:
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
                    setTimeout(() => reject(new Error('AI analysis timeout')), POLYMARKET_CONFIG.API_TIMEOUT);
                });
                
                // Create fetch promise for OpenAI API
                const fetchPromise = fetch(`https://api.openai.com/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer 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`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'user', content: prompt }],
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
                    const originalMarket = marketsToAnalyze.find(m => m.ticker === aiMarket.ticker);
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
                if (i + batchSize < summarizedMarkets.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
            } catch (error) {
                console.error(`Error processing batch ${batchNumber}:`, error);
                // Continue with next batch even if current batch fails
            }
        }
        
        // Sort by relevance score and take top results
        allRelevantMarkets.sort((a, b) => b.relevanceScore - a.relevanceScore);
        const topRelevantMarkets = allRelevantMarkets.slice(0, POLYMARKET_CONFIG.MAX_RELEVANT_MARKETS);
        
        const processingTime = Date.now() - startTime;
        console.log(`Found ${topRelevantMarkets.length} relevant Polymarket markets from AI analysis (from ${allRelevantMarkets.length} total candidates) in ${processingTime}ms`);
        
        return {
            success: true,
            markets: topRelevantMarkets,
            totalAnalyzed: summarizedMarkets.length,
            totalFetchedMarkets: totalFetchedMarkets,
            totalBatches: totalBatches,
            processingTime: processingTime,
            contentSummary: displaySummary
        };
    })();
    
    // Add overall timeout for the entire analysis
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Analysis timed out after 3 minutes')), 180000);
    });
    
    try {
        return await Promise.race([analysisPromise, timeoutPromise]);
    } catch (error) {
        console.error('Error finding relevant Polymarket markets:', error);
        return {
            success: false,
            error: error.message,
            markets: []
        };
    }
}

// Handle Polymarket-specific messages
function handlePolymarketMessage(request, sender, sendResponse) {
    console.log('Polymarket background received message:', request);
    
    // Remove the 'polymarket:' prefix for processing
    const action = request.action.replace('polymarket:', '');
    
    if (action === 'getPolymarketMarkets') {
        console.log('Fetching Polymarket markets...');
        fetchAllPolymarketMarkets()
            .then(markets => {
                // Group markets by parent event
                const groupedMarkets = groupMarketsByParentEvent(markets);
                
                // Transform grouped markets into combined multi-outcome markets
                const transformedMarkets = [];
                for (const [groupKey, groupData] of groupedMarkets.entries()) {
                    const transformedGroup = transformGroupedMarkets(groupKey, groupData);
                    if (transformedGroup && transformedGroup.subMarkets && transformedGroup.subMarkets.length > 0) {
                        transformedMarkets.push(transformedGroup);
                    }
                }
                
                console.log(`Sending Polymarket response: ${transformedMarkets.length} markets`);
                sendResponse({
                    success: true,
                    markets: transformedMarkets
                });
            })
            .catch(error => {
                console.error('Error in fetchAllPolymarketMarkets:', error);
                sendResponse({
                    success: false,
                    error: error.message,
                    markets: []
                });
            });
        return true; // Keep message channel open for async response
    }
    
    if (action === 'analyzePageContent') {
        console.log('Analyzing page content for relevant Polymarket markets...');
        
        // Get page content and analyze
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
                    
                    // Step 2: Fetch ALL Polymarket markets
                    sendProgress({
                        phase: 'fetching',
                        current: 1,
                        total: 1,
                        percentage: 20,
                        message: 'Fetching Polymarket markets...',
                        details: 'Connecting to Polymarket API to get all active markets...'
                    });
                    
                    const allMarkets = await fetchAllPolymarketMarkets();
                    if (!allMarkets || allMarkets.length === 0) {
                        sendResponse({
                            success: false,
                            error: 'No Polymarket markets found',
                            markets: []
                        });
                        return;
                    }
                    
                    sendProgress({
                        phase: 'processing',
                        current: 1,
                        total: 1,
                        percentage: 40,
                        message: 'Processing markets...',
                        details: `Found ${allMarkets.length} markets with pricing, grouping by parent events...`
                    });
                    
                    // Step 3: Group markets by parent event
                    const groupedMarkets = groupMarketsByParentEvent(allMarkets);
                    
                    // Step 4: Transform grouped markets into combined multi-outcome markets
                    const transformedMarkets = [];
                    for (const [groupKey, groupData] of groupedMarkets.entries()) {
                        const transformedGroup = transformGroupedMarkets(groupKey, groupData);
                        if (transformedGroup && transformedGroup.subMarkets && transformedGroup.subMarkets.length > 0) {
                            transformedMarkets.push(transformedGroup);
                        }
                    }
                    
                    sendProgress({
                        phase: 'analysis',
                        current: 1,
                        total: 1,
                        percentage: 60,
                        message: 'Analyzing relevance...',
                        details: `Processing ${transformedMarkets.length} grouped markets from ${allMarkets.length} total markets for relevance...`
                    });
                    
                    // Step 5: Find relevant markets using AI analysis (process ALL markets)
                    const relevantResult = await findRelevantPolymarketMarkets(
                        contentResponse.content, 
                        transformedMarkets,
                        allMarkets.length,
                        (progressData) => {
                            // Convert progress data to percentage (60-90% range)
                            const percentage = 60 + (progressData.current / progressData.total) * 30;
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
                    
                    // Final progress update
                    sendProgress({
                        phase: 'complete',
                        current: 1,
                        total: 1,
                        percentage: 100,
                        message: 'Complete!',
                        details: 'Analysis finished successfully.'
                    });
                    
                    console.log(`Processed ${relevantResult.markets.length} relevant Polymarket markets with pricing data`);
                    
                    sendResponse(relevantResult);
                    
                } catch (error) {
                    console.error('Error in Polymarket analyzePageContent:', error);
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
    console.warn('Unknown Polymarket action:', action);
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
} 