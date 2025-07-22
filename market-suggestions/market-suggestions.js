console.log('Market Suggestion Extension: Popup script loaded');

let currentPlatform = null;
let marketsData = [];
// Only one mode now - page analysis

// Helper function to generate platform-specific market URLs
function getMarketUrl(market) {
    if (currentPlatform === 'polymarket') {
        // Polymarket URLs use parent-slug/market-slug format for grouped markets
        if (market.parentSlug && market.slug) {
            return `https://polymarket.com/event/${market.parentSlug}/${market.slug}`;
        }
        // Fallback to just market slug for standalone markets
        if (market.slug) {
            return `https://polymarket.com/event/${market.slug}`;
        }
        // Last resort fallback
        const slug = market.series_ticker || market.ticker || market.conditionId;
        return `https://polymarket.com/event/${slug}`;
    } else {
        // Default to Kalshi format
        const ticker = market.series_ticker || market.ticker;
        return `https://kalshi.com/events/${ticker}`;
    }
}

// Cache DOM elements
const elements = {};

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing popup...');
    
    // Cache DOM elements
    elements.backBtn = document.getElementById('back-btn');
    elements.kalshiBtn = document.getElementById('kalshi-btn');
    elements.polymarketBtn = document.getElementById('polymarket-btn');

    elements.loadingDiv = document.querySelector('.loading');
    elements.errorDiv = document.querySelector('.error');
    elements.marketsContainer = document.querySelector('.markets-container');
    elements.marketsTitle = document.getElementById('markets-title');
    elements.marketsCount = document.querySelector('.markets-count');
    elements.marketsList = document.querySelector('.markets-list');
    elements.analysisInfo = document.querySelector('.analysis-info');
    elements.summaryText = document.querySelector('.summary-text');
    
    if (!elements.kalshiBtn || !elements.polymarketBtn || !elements.marketsContainer) {
        console.error('Required DOM elements not found');
        showError('Interface error: Required elements missing');
        return;
    }
    
    setupEventListeners();
    setupProgressListener(); // Set up real progress listening
    showPlatformSelection(); // Show platform selection prompt
});

function setupEventListeners() {
    // Back button
    if (elements.backBtn) {
        elements.backBtn.addEventListener('click', () => {
            console.log('Navigating back to main menu...');
            window.location.href = '../popup.html';
        });
    }
    
    // Platform switching
    elements.kalshiBtn.addEventListener('click', () => switchPlatform('kalshi'));
    elements.polymarketBtn.addEventListener('click', () => switchPlatform('polymarket'));
    
    // Action buttons
}

// Set up listener for real progress updates from background script
function setupProgressListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'progressUpdate') {
            const progress = request.progress;
            updateLoadingProgress(
                progress.message,
                progress.percentage,
                progress.details
            );
            return true;
        }
    });
}

function switchPlatform(platform) {
    console.log(`User selected platform: ${platform}`);
    currentPlatform = platform;
    
    // Update active button
    elements.kalshiBtn.classList.toggle('active', platform === 'kalshi');
    elements.polymarketBtn.classList.toggle('active', platform === 'polymarket');
    
    // Start analysis for the selected platform
    analyzeCurrentPage();
}

function showPlatformSelection() {
    console.log('Showing platform selection');
    
    // Hide all other states
    elements.loadingDiv.style.display = 'none';
    elements.errorDiv.style.display = 'none';
    elements.marketsContainer.style.display = 'none';
    
    // Reset platform buttons to inactive state
    elements.kalshiBtn.classList.remove('active');
    elements.polymarketBtn.classList.remove('active');
    
    // Create platform selection UI - insert BEFORE the original content, don't replace it
    elements.marketsContainer.style.display = 'block';
    
    // Hide original content elements
    if (elements.analysisInfo) elements.analysisInfo.style.display = 'none';
    if (elements.marketsTitle) elements.marketsTitle.parentElement.style.display = 'none';
    if (elements.marketsList) elements.marketsList.style.display = 'none';
    
    // Create platform selection div if it doesn't exist
    let platformSelectionDiv = elements.marketsContainer.querySelector('.platform-selection');
    if (!platformSelectionDiv) {
        platformSelectionDiv = document.createElement('div');
        platformSelectionDiv.className = 'platform-selection';
        elements.marketsContainer.insertBefore(platformSelectionDiv, elements.marketsContainer.firstChild);
    }
    
    platformSelectionDiv.innerHTML = `
        <div class="selection-header">
            <h2>Choose Your Platform</h2>
            <p>Select a prediction market platform to analyze this page and find relevant markets.</p>
        </div>
        <div class="platform-cards">
            <div class="platform-card" data-platform="kalshi">
                <h3>Kalshi</h3>
                <p>Regulated prediction markets focused on politics, economics, and current events</p>
                <button class="btn btn-primary platform-select-btn" data-platform="kalshi">
                    Analyze with Kalshi
                </button>
            </div>
            <div class="platform-card" data-platform="polymarket">
                <h3>Polymarket</h3>
                <p>Decentralized prediction markets covering sports, politics, and popular topics</p>
                <button class="btn btn-primary platform-select-btn" data-platform="polymarket">
                    Analyze with Polymarket
                </button>
            </div>
        </div>
    `;
    
    // Show platform selection
    platformSelectionDiv.style.display = 'block';
    
    // Add event listeners to platform selection buttons
    const platformButtons = platformSelectionDiv.querySelectorAll('.platform-select-btn');
    platformButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const platform = e.target.getAttribute('data-platform');
            switchPlatform(platform);
        });
    });
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
    
    // Hide platform selection if it exists
    const platformSelectionDiv = elements.marketsContainer.querySelector('.platform-selection');
    if (platformSelectionDiv) {
        platformSelectionDiv.style.display = 'none';
    }
    
    // Show original content elements
    if (elements.analysisInfo) elements.analysisInfo.style.display = 'none'; // No analysis info for regular markets
    if (elements.marketsTitle) elements.marketsTitle.parentElement.style.display = 'block';
    if (elements.marketsList) elements.marketsList.style.display = 'block';
    
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
    
    // Construct platform-specific market URL
    const marketUrl = getMarketUrl(market);
    
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
            action: 'market-suggestions:openMarket', 
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



function analyzeCurrentPage() {
    console.log(`Analyzing current page for relevant ${currentPlatform} markets...`);
    
    // Use platform-specific analysis
    if (currentPlatform === 'polymarket') {
        analyzePolymarketContent();
        return;
    }
    
    // Default to Kalshi analysis
    showLoading();
    
    // Start with initial progress
    updateLoadingProgress('Starting analysis...', 0, 'Initializing page analysis...');
    
    // Set up timeout for the entire analysis process (can take up to 2 minutes for thorough analysis)
    const analysisTimeout = setTimeout(() => {
        console.error('Analysis timeout after 2 minutes');
        showError('Analysis timed out after 2 minutes. Please try again or check your internet connection.');
    }, 120000); // 2 minute timeout to match background.js ANALYSIS_TIMEOUT
    
    // Send message to background script to analyze page content
    chrome.runtime.sendMessage({ action: 'market-suggestions:analyzePageContent' }, (response) => {
        // Clear the timeout
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
                errorMessage = 'Analysis service error: Please try again in a few moments.';
            }
            
            showError(errorMessage);
            return;
        }
        
        if (!response.markets || !Array.isArray(response.markets)) {
            console.error('Invalid analysis data:', response.markets);
            showError('Invalid analysis data received. Please try again.');
            return;
        }
        
        // Small delay to show completion before showing results
        setTimeout(() => {
            showRelevantMarkets(response.markets, response.contentSummary, response.totalAnalyzed);
        }, 500);
    });
}

function updateLoadingProgress(message, percentage = 0, details = '') {
    const progressMessage = elements.loadingDiv.querySelector('.progress-message');
    const progressPercentage = elements.loadingDiv.querySelector('.progress-percentage');
    const progressFill = elements.loadingDiv.querySelector('.progress-fill');
    const progressDetails = elements.loadingDiv.querySelector('.progress-details');
    
    if (progressMessage) {
        progressMessage.textContent = message;
    }
    
    if (progressPercentage) {
        progressPercentage.textContent = `${Math.round(percentage)}%`;
    }
    
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    
    if (progressDetails && details) {
        progressDetails.textContent = details;
    }
}



function showRelevantMarkets(markets, contentSummary, totalAnalyzed) {
    console.log(`Showing ${markets.length} relevant markets out of ${totalAnalyzed} analyzed`);
    
    // Hide platform selection if it exists
    const platformSelectionDiv = elements.marketsContainer.querySelector('.platform-selection');
    if (platformSelectionDiv) {
        platformSelectionDiv.style.display = 'none';
    }
    
    // Show original content elements
    if (elements.analysisInfo) elements.analysisInfo.style.display = 'block';
    if (elements.marketsTitle) elements.marketsTitle.parentElement.style.display = 'block';
    if (elements.marketsList) elements.marketsList.style.display = 'block';
    
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
                <small>Try analyzing a different page or check back later for new events.</small>
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
    
    // Construct platform-specific market URL
    const marketUrl = getMarketUrl(market);
    
    // Format functions
    const formatPrice = (price) => {
    if (price == null) return '—';
    // Round to nearest tenth to avoid floating point display issues
    const rounded = Math.round(price * 10) / 10;
    return `${rounded}¢`;
};
    const formatVolume = (vol) => {
        if (!vol) return '0';
        return vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol.toString();
    };
    
    // Build sub-markets HTML
    let subMarketsHTML = '';
    if (market.subMarkets && market.subMarkets.length > 0) {
        subMarketsHTML = market.subMarkets.map(sub => `
            <div class="sub-market">
                <div class="sub-title">${escapeHtml(sub.yes_sub_title || sub.title)}</div>
                <div class="pricing">
                    <div class="pricing-row">
                        <span class="label yes">Yes:</span>
                        <span class="price">${formatPrice(sub.yes_ask)}</span>
                    </div>
                    <div class="pricing-row">
                        <span class="label no">No:</span>
                        <span class="price">${formatPrice(sub.no_ask)}</span>
                    </div>
                </div>
                <div class="sub-details">
                    <span class="sub-ticker">${escapeHtml(sub.ticker)}</span>
                    <span class="volume">Vol: ${formatVolume(sub.volume_24h)}</span>
                </div>
                ${sub.mispricing && sub.mispricing !== 'No mispricing detected' && sub.mispricing !== 'Error analyzing mispricing' && sub.mispricing !== 'No Mispricing Found' && !sub.mispricing.startsWith('No Mispricing Found') ? `<div class="mispricing-analysis">${escapeHtml(sub.mispricing)}</div>` : ''}
            </div>
        `).join('');
    } else {
        // Fallback if no sub-markets
        subMarketsHTML = '<div class="no-pricing">Pricing data unavailable</div>';
    }
    
    marketDiv.innerHTML = `
        <div class="market-header">
            <div class="market-title">
                ${escapeHtml(market.title)}
            </div>
            <div class="market-status open">OPEN</div>
        </div>
        <div class="sub-markets">
            ${subMarketsHTML}
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
    
    // Event listeners (existing)
    marketDiv.addEventListener('click', (e) => {
        if (e.target.closest('.copy-btn')) return;
        chrome.runtime.sendMessage({ action: 'market-suggestions:openMarket', url: marketUrl });
    });
    
    const copyBtn = marketDiv.querySelector('.copy-btn');
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTicker(market.ticker);
    });
    
    return marketDiv;
}



function analyzePolymarketContent() {
    console.log('Analyzing current page for relevant Polymarket markets...');
    
    showLoading();
    
    // Start with initial progress
    updateLoadingProgress('Starting Polymarket analysis...', 0, 'Initializing page analysis...');
    
    // Set up timeout for the entire analysis process
    const analysisTimeout = setTimeout(() => {
        console.error('Polymarket analysis timeout after 2 minutes');
        showError('Analysis timed out after 2 minutes. Please try again or check your internet connection.');
    }, 120000); // 2 minute timeout
    
    // Send message to background script to analyze page content for Polymarket
    chrome.runtime.sendMessage({ action: 'polymarket:analyzePageContent' }, (response) => {
        // Clear the timeout
        clearTimeout(analysisTimeout);
        
        console.log('Received Polymarket analysis response:', response);
        
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
            console.error('Polymarket analysis failed:', response.error);
            let errorMessage = response.error || 'Failed to analyze page content';
            
            // Provide more specific error messages
            if (errorMessage.includes('Failed to fetch')) {
                errorMessage = 'Network error: Please check your internet connection and try again.';
            } else if (errorMessage.includes('timeout')) {
                errorMessage = 'Request timed out: Please try again. If the issue persists, check your internet connection.';
            } else if (errorMessage.includes('API error')) {
                errorMessage = 'Analysis service error: Please try again in a few moments.';
            }
            
            showError(errorMessage);
            return;
        }
        
        if (!response.markets || !Array.isArray(response.markets)) {
            console.error('Invalid Polymarket analysis data:', response.markets);
            showError('Invalid analysis data received. Please try again.');
            return;
        }
        
        // Small delay to show completion before showing results
        setTimeout(() => {
            showRelevantMarkets(response.markets, response.contentSummary, response.totalAnalyzed);
        }, 500);
    });
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
