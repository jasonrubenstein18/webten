console.log('Market Suggestion Extension: Popup script loaded');

let currentPlatform = 'kalshi';
let marketsData = [];
let currentMode = 'all'; // 'all' or 'relevant'

// Cache DOM elements
const elements = {};

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing popup...');
    
    // Cache DOM elements
    elements.kalshiBtn = document.getElementById('kalshi-btn');
    elements.polymarketBtn = document.getElementById('polymarket-btn');
    elements.analyzePageBtn = document.getElementById('analyze-page-btn');
    elements.allMarketsBtn = document.getElementById('all-markets-btn');
    elements.loadingDiv = document.querySelector('.loading');
    elements.errorDiv = document.querySelector('.error');
    elements.marketsContainer = document.querySelector('.markets-container');
    elements.marketsTitle = document.getElementById('markets-title');
    elements.marketsCount = document.querySelector('.markets-count');
    elements.marketsList = document.querySelector('.markets-list');
    elements.analysisInfo = document.querySelector('.analysis-info');
    elements.summaryText = document.querySelector('.summary-text');
    
    if (!elements.kalshiBtn || !elements.polymarketBtn || !elements.marketsContainer || 
        !elements.analyzePageBtn || !elements.allMarketsBtn) {
        console.error('Required DOM elements not found');
        showError('Interface error: Required elements missing');
        return;
    }
    
    setupEventListeners();
    updateActionButtonStates(); // Initialize button states
    loadKalshiMarkets();
});

function setupEventListeners() {
    // Platform switching
    elements.kalshiBtn.addEventListener('click', () => switchPlatform('kalshi'));
    elements.polymarketBtn.addEventListener('click', () => switchPlatform('polymarket'));
    
    // Action buttons
    elements.analyzePageBtn.addEventListener('click', () => analyzeCurrentPage());
    elements.allMarketsBtn.addEventListener('click', () => showAllMarkets());
}

function switchPlatform(platform) {
    console.log(`Switching to platform: ${platform}`);
    currentPlatform = platform;
    
    // Update active button
    elements.kalshiBtn.classList.toggle('active', platform === 'kalshi');
    elements.polymarketBtn.classList.toggle('active', platform === 'polymarket');
    
    if (platform === 'kalshi') {
        loadKalshiMarkets();
    } else if (platform === 'polymarket') {
        showPolymarketComingSoon();
    }
}

function showLoading() {
    console.log('Showing loading state');
    elements.loadingDiv.style.display = 'block';
    elements.errorDiv.style.display = 'none';
    elements.marketsContainer.style.display = 'none';
}

function showError(message) {
    console.log('Showing error:', message);
    elements.loadingDiv.style.display = 'none';
    elements.errorDiv.style.display = 'block';
    elements.errorDiv.textContent = message;
    elements.marketsContainer.style.display = 'none';
}

function showMarkets(markets) {
    console.log(`Showing ${markets.length} markets`);
    elements.loadingDiv.style.display = 'none';
    elements.errorDiv.style.display = 'none';
    elements.marketsContainer.style.display = 'block';
    
    // Update markets count to reflect that these are open events
    elements.marketsCount.textContent = `${markets.length} open events`;
    
    // Clear and populate markets list
    elements.marketsList.innerHTML = '';
    
    if (markets.length === 0) {
        elements.marketsList.innerHTML = '<div class="no-markets">No open events found</div>';
        return;
    }
    
    markets.forEach(market => {
        const marketElement = createMarketElement(market);
        elements.marketsList.appendChild(marketElement);
    });
}

function createMarketElement(market) {
    const marketDiv = document.createElement('div');
    marketDiv.className = 'market-item clickable';
    
    // Construct Kalshi market URL
    const baseUrl = 'https://kalshi.com/events/';
    const marketUrl = `${baseUrl}${market.series_ticker || market.ticker}`;
    
    marketDiv.innerHTML = `
        <div class="market-header">
            <div class="market-title">${escapeHtml(market.title)}</div>
            <div class="market-status open">OPEN</div>
        </div>
        <div class="market-details">
            <div class="market-ticker">${escapeHtml(market.ticker)}</div>
            <div class="market-category">${escapeHtml(market.category)}</div>
        </div>
        <div class="market-actions">
            <button class="btn btn-secondary copy-btn" data-ticker="${escapeHtml(market.ticker)}">
                Copy Ticker
            </button>
            <span class="click-hint">Click to view event ↗</span>
        </div>
    `;
    
    // Make the entire card clickable (except for the copy button)
    marketDiv.addEventListener('click', (e) => {
        // Don't trigger if clicking the copy button
        if (e.target.closest('.copy-btn')) {
            return;
        }
        
        console.log('Opening market URL:', marketUrl);
        
        // Send message to background script to open URL
        chrome.runtime.sendMessage({ 
            action: 'openMarket', 
            url: marketUrl 
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error opening market:', chrome.runtime.lastError);
            } else {
                console.log('Market opened successfully');
            }
        });
    });
    
    // Add hover effect cursor
    marketDiv.style.cursor = 'pointer';
    
    // Add event listener for copy button
    const copyBtn = marketDiv.querySelector('.copy-btn');
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click when copying
        copyTicker(market.ticker);
    });
    
    return marketDiv;
}

function loadKalshiMarkets() {
    console.log('Loading Kalshi events...');
    showLoading();
    
    // Update loading text to indicate we're fetching more markets
    if (elements.loadingDiv.querySelector('p')) {
        elements.loadingDiv.querySelector('p').textContent = 'Fetching open events (up to 4000)...';
    }
    
    // Send message to background script to fetch markets
    chrome.runtime.sendMessage({ action: 'getKalshiMarkets' }, (response) => {
        console.log('Received response from background:', response);
        
        if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            showError('Failed to communicate with background script');
            return;
        }
        
        if (!response) {
            console.error('No response received from background script');
            showError('No response from background script');
            return;
        }
        
        if (!response.success) {
            console.error('Background script returned error:', response.error);
            showError(response.error || 'Failed to fetch events');
            return;
        }
        
        if (!response.markets || !Array.isArray(response.markets)) {
            console.error('Invalid markets data:', response.markets);
            showError('Invalid events data received');
            return;
        }
        
        marketsData = response.markets;
        console.log(`Successfully loaded ${marketsData.length} open events`);
        showMarkets(marketsData);
    });
}

function analyzeCurrentPage() {
    console.log('Analyzing current page for relevant markets...');
    currentMode = 'relevant';
    
    // Update button states
    updateActionButtonStates();
    
    showLoading();
    
    // Update loading text for analysis with progress tracking
    updateLoadingProgress('Extracting page content...');
    
    // Set up timeout for the entire analysis process (can take up to 2 minutes for thorough analysis)
    const analysisTimeout = setTimeout(() => {
        console.error('Analysis timeout after 2 minutes');
        showError('Analysis timed out after 2 minutes. Please try again or check your internet connection.');
    }, 120000); // 2 minute timeout to match background.js ANALYSIS_TIMEOUT
    
    // Send message to background script to analyze page content
    chrome.runtime.sendMessage({ action: 'analyzePageContent' }, (response) => {
        // Clear the timeout since we got a response
        clearTimeout(analysisTimeout);
        
        console.log('Received analysis response:', response);
        
        if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            showError('Failed to communicate with background script. Please check your internet connection.');
            return;
        }
        
        if (!response) {
            console.error('No response received from background script');
            showError('No response from background script. Please try again.');
            return;
        }
        
        if (!response.success) {
            console.error('Analysis failed:', response.error);
            let errorMessage = response.error || 'Failed to analyze page content';
            
            // Provide more specific error messages
            if (errorMessage.includes('Failed to fetch')) {
                errorMessage = 'Network error: Please check your internet connection and try again.';
            } else if (errorMessage.includes('timeout')) {
                errorMessage = 'Request timed out: Please try again. If the issue persists, check your internet connection.';
            } else if (errorMessage.includes('API error')) {
                errorMessage = 'OpenAI API error: Please try again in a few moments.';
            }
            
            showError(errorMessage);
            return;
        }
        
        if (!response.markets || !Array.isArray(response.markets)) {
            console.error('Invalid analysis data:', response.markets);
            showError('Invalid analysis data received. Please try again.');
            return;
        }
        
        // Show analysis results
        showRelevantMarkets(response.markets, response.contentSummary, response.totalAnalyzed);
    });
}

function updateLoadingProgress(message) {
    if (elements.loadingDiv.querySelector('p')) {
        elements.loadingDiv.querySelector('p').textContent = message;
    }
}

function showAllMarkets() {
    console.log('Showing all markets...');
    currentMode = 'all';
    
    // Update button states
    updateActionButtonStates();
    
    // Hide analysis info
    elements.analysisInfo.style.display = 'none';
    
    // Update title and show all markets
    elements.marketsTitle.textContent = 'Active Events';
    
    if (marketsData && marketsData.length > 0) {
        showMarkets(marketsData);
    } else {
        loadKalshiMarkets();
    }
}

function showRelevantMarkets(markets, contentSummary, totalAnalyzed) {
    console.log(`Showing ${markets.length} relevant markets out of ${totalAnalyzed} analyzed`);
    
    // Show analysis info
    if (contentSummary && elements.summaryText) {
        elements.summaryText.textContent = contentSummary;
        elements.analysisInfo.style.display = 'block';
    }
    
    // Update title
    elements.marketsTitle.textContent = 'Relevant Markets';
    
    // Show markets
    elements.loadingDiv.style.display = 'none';
    elements.errorDiv.style.display = 'none';
    elements.marketsContainer.style.display = 'block';
    
    // Update count with relevance info
    elements.marketsCount.textContent = markets.length > 0 
        ? `${markets.length} relevant markets (from ${totalAnalyzed} analyzed)`
        : 'No relevant markets found';
    
    // Clear and populate markets list
    elements.marketsList.innerHTML = '';
    
    if (markets.length === 0) {
        elements.marketsList.innerHTML = `
            <div class="no-markets">
                No relevant markets found for this page content.<br>
                <small>Try clicking "All Markets" to see all available events.</small>
            </div>
        `;
        return;
    }
    
    markets.forEach(market => {
        const marketElement = createRelevantMarketElement(market);
        elements.marketsList.appendChild(marketElement);
    });
}

function createRelevantMarketElement(market) {
    const marketDiv = document.createElement('div');
    marketDiv.className = 'market-item clickable relevant';
    
    // Construct Kalshi market URL
    const baseUrl = 'https://kalshi.com/events/';
    const marketUrl = `${baseUrl}${market.series_ticker || market.ticker}`;
    
    marketDiv.innerHTML = `
        <div class="market-header">
            <div class="market-title">
                ${escapeHtml(market.title)}
                <span class="relevance-score">${market.relevanceScore}%</span>
            </div>
            <div class="market-status open">OPEN</div>
        </div>
        <div class="market-details">
            <div class="market-ticker">${escapeHtml(market.ticker)}</div>
            <div class="market-category">${escapeHtml(market.category)}</div>
        </div>
        <div class="market-actions">
            <button class="btn btn-secondary copy-btn" data-ticker="${escapeHtml(market.ticker)}">
                Copy Ticker
            </button>
            <span class="click-hint">Click to view event ↗</span>
        </div>
    `;
    
    // Make the entire card clickable (except for the copy button)
    marketDiv.addEventListener('click', (e) => {
        // Don't trigger if clicking the copy button
        if (e.target.closest('.copy-btn')) {
            return;
        }
        
        console.log('Opening relevant market URL:', marketUrl);
        
        // Send message to background script to open URL
        chrome.runtime.sendMessage({ 
            action: 'openMarket', 
            url: marketUrl 
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error opening market:', chrome.runtime.lastError);
            } else {
                console.log('Market opened successfully');
            }
        });
    });
    
    // Add hover effect cursor
    marketDiv.style.cursor = 'pointer';
    
    // Add event listener for copy button
    const copyBtn = marketDiv.querySelector('.copy-btn');
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click when copying
        copyTicker(market.ticker);
    });
    
    return marketDiv;
}

function updateActionButtonStates() {
    // Update button visual states based on current mode
    elements.analyzePageBtn.classList.toggle('primary', currentMode === 'relevant');
    elements.analyzePageBtn.classList.toggle('secondary', currentMode !== 'relevant');
    
    elements.allMarketsBtn.classList.toggle('primary', currentMode === 'all');
    elements.allMarketsBtn.classList.toggle('secondary', currentMode !== 'all');
}

function showPolymarketComingSoon() {
    showLoading();
    setTimeout(() => {
        showError('Polymarket integration coming soon!');
    }, 500);
}

function copyTicker(ticker) {
    navigator.clipboard.writeText(ticker).then(() => {
        console.log('Ticker copied to clipboard:', ticker);
        // Could add a toast notification here
    }).catch(err => {
        console.error('Failed to copy ticker:', err);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Error handling for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Popup error:', event.error);
    showError('An unexpected error occurred');
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Popup unhandled promise rejection:', event.reason);
    showError('An unexpected error occurred');
});
