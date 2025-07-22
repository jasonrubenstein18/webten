// Background service worker for Polymarket integration
console.log('Market Suggestion Extension: Polymarket Background script loaded');

// Polymarket Gamma API configuration
const GAMMA_BASE = 'https://gamma-api.polymarket.com';

// Configuration for Polymarket
const POLYMARKET_CONFIG = {
    MAX_PAGES: 20,        // Fetch up to 20 pages
    EVENTS_PER_PAGE: 100, // Reasonable limit per request
    MARKETS_PER_PAGE: 100, // Markets per page
    MAX_RELEVANT_MARKETS: 8, // Maximum number of relevant markets to return
    MAX_MARKETS_FOR_ANALYSIS: 10000, // Maximum markets for analysis
    API_TIMEOUT: 30000, // 30 second timeout for individual API calls
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000, // Base delay for exponential backoff
};

// Fetch events from Polymarket Gamma API
async function fetchPolymarketEvents() {
    try {
        console.log('Starting to fetch Polymarket events...');
        
        let allEvents = [];
        let offset = 0;
        let pageCount = 0;
        const maxPages = POLYMARKET_CONFIG.MAX_PAGES;
        const limit = POLYMARKET_CONFIG.EVENTS_PER_PAGE;
        
        do {
            pageCount++;
            console.log(`Fetching page ${pageCount} of up to ${maxPages}...`);
            
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
                active: 'true',      // Only get active events
                closed: 'false',     // Exclude closed/resolved events
                archived: 'false',   // Exclude archived events
                order: 'volume',
                ascending: 'false'   // Sort by volume descending
            });
            
            const url = `${GAMMA_BASE}/events?${params}`;
            console.log('Making API request to:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`Page ${pageCount} API Response status:`, response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const events = await response.json();
            console.log(`Page ${pageCount} response data:`, {
                eventsCount: events?.length || 0,
                hasMore: events?.length === limit
            });
            
            if (events && Array.isArray(events)) {
                allEvents = allEvents.concat(events);
                console.log(`Total events collected so far: ${allEvents.length}`);
            }
            
            // Check if we got fewer events than requested (last page)
            if (!events || events.length < limit) {
                break;
            }
            
            offset += limit;
            
        } while (pageCount < maxPages);
        
        console.log(`Pagination complete. Fetched ${pageCount} pages with ${allEvents.length} total events.`);
        
        return allEvents;
        
    } catch (error) {
        console.error('Error fetching Polymarket events:', error);
        throw error;
    }
}

// Fetch markets directly with pricing data (for page analysis)
async function fetchPolymarketMarketsWithPricing() {
    try {
        console.log('Starting to fetch Polymarket markets with pricing...');
        
        let allMarkets = [];
        let offset = 0;
        let pageCount = 0;
        const maxPages = Math.ceil(POLYMARKET_CONFIG.MAX_MARKETS_FOR_ANALYSIS / POLYMARKET_CONFIG.MARKETS_PER_PAGE); // Calculate pages needed for 4000 markets
        const limit = POLYMARKET_CONFIG.MARKETS_PER_PAGE; // Use configured limit (100 per page)
        
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
        
        return allMarkets;
        
    } catch (error) {
        console.error('Error fetching Polymarket markets with pricing:', error);
        throw error;
    }
}

// Fetch markets for a specific event
async function fetchPolymarketEventMarkets(eventId) {
    try {
        console.log(`Fetching markets for event: ${eventId}`);
        
        let allMarkets = [];
        let offset = 0;
        let pageCount = 0;
        const limit = POLYMARKET_CONFIG.MARKETS_PER_PAGE;
        
        do {
            pageCount++;
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
                active: 'true',              // Only get active markets
                closed: 'false',             // Exclude closed markets
                event_slug: eventId.toString() // Use event ID or slug
            });
            
            const url = `${GAMMA_BASE}/markets?${params}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const markets = await response.json();
            
            if (markets && Array.isArray(markets)) {
                allMarkets = allMarkets.concat(markets);
            }
            
            // Check if we got fewer markets than requested (last page)
            if (!markets || markets.length < limit) {
                break;
            }
            
            offset += limit;
            
        } while (pageCount < 10); // Limit to 10 pages per event
        
        console.log(`Fetched ${allMarkets.length} markets for event ${eventId}`);
        return allMarkets;
        
    } catch (error) {
        console.error(`Error fetching markets for event ${eventId}:`, error);
        return [];
    }
}

// Transform Polymarket event data to match Kalshi format
function transformPolymarketEvent(event) {
    return {
        ticker: event.slug || event.id?.toString() || 'UNKNOWN',
        title: event.title || event.slug || 'Untitled Event',
        description: event.description || event.title || 'No description available',
        category: event.category || extractCategoryFromTags(event.tags) || 'General',
        series_ticker: event.slug || event.id?.toString() || 'UNKNOWN',
        status: event.active && !event.closed ? 'open' : 'closed',
        volume: event.volume || 0,
        liquidity: event.liquidity || 0,
        start_date: event.startDate,
        end_date: event.endDate
    };
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

// Extract category from Polymarket tags
function extractCategoryFromTags(tags) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
        return 'General';
    }
    
    // Map common Polymarket tags to categories
    const categoryMap = {
        'politics': 'Politics',
        'elections': 'Politics',
        'trump': 'Politics',
        'biden': 'Politics',
        'crypto': 'Crypto',
        'bitcoin': 'Crypto',
        'ethereum': 'Crypto',
        'sports': 'Sports',
        'nfl': 'Sports',
        'nba': 'Sports',
        'soccer': 'Sports',
        'football': 'Sports',
        'business': 'Business',
        'tech': 'Technology',
        'technology': 'Technology',
        'ai': 'Technology',
        'science': 'Science',
        'weather': 'Weather',
        'entertainment': 'Entertainment',
        'celebrity': 'Entertainment'
    };
    
    // Find first matching category
    for (const tag of tags) {
        const normalizedTag = tag.label ? tag.label.toLowerCase() : tag.toLowerCase();
        if (categoryMap[normalizedTag]) {
            return categoryMap[normalizedTag];
        }
    }
    
    // Return the first tag as category if no mapping found
    const firstTag = tags[0].label || tags[0];
    return firstTag.charAt(0).toUpperCase() + firstTag.slice(1);
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

// Main function to fetch Polymarket markets (equivalent to fetchKalshiMarkets)
async function fetchPolymarketMarkets() {
    try {
        console.log('Starting to fetch Polymarket markets...');
        
        // Step 1: Fetch events
        const events = await fetchPolymarketEvents();
        
        if (!events || events.length === 0) {
            return {
                success: false,
                error: 'No events found',
                markets: []
            };
        }
        
        // Step 2: Transform events to match Kalshi format
        const transformedEvents = events.map(transformPolymarketEvent);
        
        // Step 3: Filter to only include truly open events (additional safety check)
        const openEvents = transformedEvents.filter(event => event.status === 'open');
        
        console.log(`Processed ${transformedEvents.length} Polymarket events, ${openEvents.length} are open`);
        
        return {
            success: true,
            markets: openEvents
        };
        
    } catch (error) {
        console.error('Error fetching Polymarket markets:', error);
        
        return {
            success: false,
            error: error.message,
            markets: []
        };
    }
}

// Fetch detailed markets for a Polymarket event (equivalent to fetchEventMarkets)
async function fetchPolymarketEventDetails(eventTicker) {
    try {
        console.log(`Fetching detailed markets for Polymarket event: ${eventTicker}`);
        
        const markets = await fetchPolymarketEventMarkets(eventTicker);
        
        // Transform markets to match Kalshi format
        const transformedMarkets = markets.map(transformPolymarketMarket);
        
        console.log(`Fetched ${transformedMarkets.length} markets for Polymarket event ${eventTicker}`);
        return transformedMarkets;
        
    } catch (error) {
        console.error(`Error fetching Polymarket event details for ${eventTicker}:`, error);
        return [];
    }
}

// Handle Polymarket-specific messages
function handlePolymarketMessage(request, sender, sendResponse) {
    console.log('Polymarket background received message:', request);
    
    // Remove the 'polymarket:' prefix for processing
    const action = request.action.replace('polymarket:', '');
    
    if (action === 'getPolymarketMarkets') {
        console.log('Fetching Polymarket markets...');
        fetchPolymarketMarkets()
            .then(result => {
                console.log('Sending Polymarket response:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('Error in fetchPolymarketMarkets:', error);
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
        
        // Get page content and analyze (similar to Kalshi implementation)
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
                    // Fetch Polymarket markets directly (they include pricing data)
                    const marketsResult = await fetchPolymarketMarketsWithPricing();
                    if (!marketsResult || marketsResult.length === 0) {
                        sendResponse({
                            success: false,
                            error: 'No Polymarket markets found',
                            markets: []
                        });
                        return;
                    }
                    
                    // Group markets by their parent event
                    const groupedMarkets = groupMarketsByParentEvent(marketsResult);
                    
                    // Transform grouped markets into combined multi-outcome markets
                    const transformedMarkets = [];
                    for (const [groupKey, groupData] of groupedMarkets.entries()) {
                        const transformedGroup = transformGroupedMarkets(groupKey, groupData);
                        if (transformedGroup && transformedGroup.subMarkets && transformedGroup.subMarkets.length > 0) {
                            transformedMarkets.push(transformedGroup);
                        }
                    }
                    
                    // Limit markets for analysis efficiency (like Kalshi does)
                    const limitedMarkets = transformedMarkets.slice(0, POLYMARKET_CONFIG.MAX_MARKETS_FOR_ANALYSIS);
                    console.log(`Processing ${limitedMarkets.length} grouped markets (from ${transformedMarkets.length} total)`);
                    
                    // Take top markets for display
                    const marketsToAnalyze = limitedMarkets.slice(0, 8);
                    
                    console.log('Processing grouped Polymarket markets with pricing data...');
                    
                    for (let market of marketsToAnalyze) {
                        if (market.subMarkets && market.subMarkets.length > 0) {
                            console.log(`Market "${market.title}" has ${market.subMarkets.length} outcomes:`);
                            for (let subMarket of market.subMarkets) {
                                console.log(`  - ${subMarket.title}: Yes=${subMarket.yes_ask}¢, No=${subMarket.no_ask}¢`);
                            }
                        }
                    }
                    
                    console.log(`Processed ${marketsToAnalyze.length} Polymarket markets with pricing data`);
                    
                    sendResponse({
                        success: true,
                        markets: marketsToAnalyze,
                        contentSummary: `Found ${marketsResult.length} active Polymarket markets`,
                        totalAnalyzed: limitedMarkets.length
                    });
                    
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