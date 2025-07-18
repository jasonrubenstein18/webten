// Background service worker router for the Chrome extension
console.log('Market Suggestion Extension: Background router loaded');

// Import module-specific background scripts
importScripts('market-suggestions/market-suggestions-background.js');

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background router received message:', request);
    
    // Route messages based on action prefix
    if (request.action.startsWith('market-suggestions:')) {
        // Route to market suggestions module
        return handleMarketSuggestionsMessage(request, sender, sendResponse);
    } else if (request.action.startsWith('understand-content:')) {
        // Route to understand content module (placeholder for now)
        return handleUnderstandContentMessage(request, sender, sendResponse);
    } else {
        // Handle legacy actions without prefix (for backward compatibility)
        return handleLegacyMessage(request, sender, sendResponse);
    }
});

// Handle legacy messages (without prefix) - route to market suggestions for now
function handleLegacyMessage(request, sender, sendResponse) {
    console.log('Handling legacy message:', request.action);
    
    // Convert legacy actions to market-suggestions actions
    const legacyToNewAction = {
        'getKalshiMarkets': 'market-suggestions:getKalshiMarkets',
        'analyzePageContent': 'market-suggestions:analyzePageContent',
        'openMarket': 'market-suggestions:openMarket',
        'getSettings': 'market-suggestions:getSettings',
        'updateSettings': 'market-suggestions:updateSettings'
    };
    
    if (legacyToNewAction[request.action]) {
        const newRequest = {
            ...request,
            action: legacyToNewAction[request.action]
        };
        return handleMarketSuggestionsMessage(newRequest, sender, sendResponse);
    }
    
    // Unknown action
    console.warn('Unknown legacy action:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
}

// Handle understand content messages (placeholder)
function handleUnderstandContentMessage(request, sender, sendResponse) {
    console.log('Handling understand content message:', request.action);
    
    // Remove the prefix for processing
    const action = request.action.replace('understand-content:', '');
    
    // Placeholder responses for understand content
    if (action === 'analyzeContent') {
        sendResponse({
            success: true,
            message: 'Understand Content functionality coming soon!',
            data: {}
        });
        return false;
    }
    
    // Unknown understand content action
    console.warn('Unknown understand content action:', action);
    sendResponse({ success: false, error: 'Unknown understand content action' });
    return false;
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
