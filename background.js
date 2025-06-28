// Background service worker for the Chrome extension
console.log('Market Suggestion Extension: Background script loaded');

// Kalshi API configuration
const BASE = 'https://demo-api.kalshi.co';
const KALSHI_KEY_ID = 'c2499810-0f10-4a75-9fb0-09e6592e1398';

// Configuration
const CONFIG = {
    MAX_PAGES: 3,        // Fetch up to 3 pages (600 events max)
    EVENTS_PER_PAGE: 200 // Max limit per request
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