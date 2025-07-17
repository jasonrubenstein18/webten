console.log('Market Suggestion Extension: Popup script loaded');

let currentPlatform = 'kalshi';
let marketsData = [];
let currentMode = 'relevant'; // Only relevant mode available - page analysis

// Cache DOM elements
const elements = {};

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing popup...');
    
    // Cache DOM elements
    elements.kalshiBtn = document.getElementById('kalshi-btn');
    elements.polymarketBtn = document.getElementById('polymarket-btn');
    elements.analyzePageBtn = document.getElementById('analyze-page-btn');
    elements.loadingDiv = document.querySelector('.loading');
    elements.errorDiv = document.querySelector('.error');
    elements.marketsContainer = document.querySelector('.markets-container');
    elements.marketsTitle = document.getElementById('markets-title');
    elements.marketsCount = document.querySelector('.markets-count');
    elements.marketsList = document.querySelector('.markets-list');
    elements.analysisInfo = document.querySelector('.analysis-info');
    elements.summaryText = document.querySelector('.summary-text');
    
    if (!elements.kalshiBtn || !elements.polymarketBtn || !elements.marketsContainer || 
        !elements.analyzePageBtn) {
        console.error('Required DOM elements not found');
        showError('Interface error: Required elements missing');
        return;
    }
    
    setupEventListeners();
    updateActionButtonStates(); // Initialize button states
    analyzeCurrentPage(); // Auto-analyze the current page on startup
});

function setupEventListeners() {
    // Platform switching
    elements.kalshiBtn.addEventListener('click', () => switchPlatform('kalshi'));
    elements.polymarketBtn.addEventListener('click', () => switchPlatform('polymarket'));
    
    // Action buttons
    elements.analyzePageBtn.addEventListener('click', () => analyzeCurrentPage());
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
            <span class="click-hint">Click to view event</span>
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
    
    // Phase 1: Start with extracting page content (random between 3-8%)
    const initialProgress = Math.floor(Math.random() * 6) + 3;
    updateLoadingProgress('Extracting Page Content', initialProgress, 'Reading webpage content and filtering out ads...');
    
    // Set up timeout for the entire analysis process (can take up to 2 minutes for thorough analysis)
    const analysisTimeout = setTimeout(() => {
        clearInterval(progressInterval);
        console.error('Analysis timeout after 2 minutes');
        showError('Analysis timed out after 2 minutes. Please try again or check your internet connection.');
    }, 120000); // 2 minute timeout to match background.js ANALYSIS_TIMEOUT
    
    // Track progress through different phases with random percentages
    let currentPhase = 1;
    const totalPhases = 6; // Updated to include edge calculation phase
    
    // Generate random progress percentages within realistic ranges
    function getRandomProgress(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    // Simulate progress updates for better UX
    const progressInterval = setInterval(() => {
        if (currentPhase === 1) {
            const progress = getRandomProgress(12, 18);
            updateLoadingProgress('Fetching Active Markets', progress, 'Connecting to Kalshi API to get latest markets...');
            currentPhase = 2;
        } else if (currentPhase === 2) {
            const progress = getRandomProgress(28, 38);
            updateLoadingProgress('Processing Markets', progress, 'Found markets, preparing for analysis...');
            currentPhase = 3;
        } else if (currentPhase === 3) {
            const progress = getRandomProgress(55, 65);
            updateLoadingProgress('Analyzing Content', progress, 'Finding relevant markets for this content...');
            currentPhase = 4;
        } else if (currentPhase === 4) {
            const progress = getRandomProgress(70, 80);
            updateLoadingProgress('Generating Summary', progress, 'Creating content summary...');
            currentPhase = 5;
        } else if (currentPhase === 5) {
            const progress = getRandomProgress(85, 92);
            updateLoadingProgress('Calculating Edge', progress, 'Analyzing betting opportunities and market inefficiencies...');
            currentPhase = 6;
        }
    }, 2000);
    
    // Send message to background script to analyze page content
    chrome.runtime.sendMessage({ action: 'analyzePageContent' }, (response) => {
        // Clear the progress interval and timeout
        clearInterval(progressInterval);
        clearTimeout(analysisTimeout);
        
        // Final progress update with random percentage
        const finalProgress = Math.floor(Math.random() * 4) + 96; // 96-99%
        updateLoadingProgress('Finalizing Results', finalProgress, 'Preparing market suggestions...');
        
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
        
        // Complete progress
        updateLoadingProgress('Complete!', 100, 'Analysis finished successfully.');
        
        // Small delay to show completion before showing results
        setTimeout(() => {
            showRelevantMarkets(
                response.markets, 
                response.contentSummary, 
                response.totalAnalyzed,
                response.edgeAnalysisPerformed || false
            );
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



function showRelevantMarkets(markets, contentSummary, totalAnalyzed, edgeAnalysisPerformed = false) {
    console.log(`Showing ${markets.length} relevant markets out of ${totalAnalyzed} analyzed`);
    
    // Count markets with edges
    const marketsWithEdges = markets.filter(m => m.edgeAnalysis?.hasEdge).length;
    
    // Show analysis info
    if (contentSummary && elements.summaryText) {
        elements.summaryText.textContent = contentSummary;
        elements.analysisInfo.style.display = 'block';
    }
    
    // Update title with edge info
    if (edgeAnalysisPerformed && marketsWithEdges > 0) {
        elements.marketsTitle.textContent = `Relevant Markets (${marketsWithEdges} edges detected)`;
    } else {
        elements.marketsTitle.textContent = 'Relevant Markets';
    }
    
    // Show markets
    elements.loadingDiv.style.display = 'none';
    elements.errorDiv.style.display = 'none';
    elements.marketsContainer.style.display = 'block';
    
    // Update count with relevance and edge info
    let countText = markets.length > 0 
        ? `${markets.length} relevant markets (from ${totalAnalyzed} analyzed)`
        : 'No relevant markets found';
    
    if (edgeAnalysisPerformed) {
        countText += ` • ${marketsWithEdges} edges detected`;
    }
    
    elements.marketsCount.textContent = countText;
    
    // Clear and populate markets list
    elements.marketsList.innerHTML = '';
    
    if (markets.length === 0) {
        elements.marketsList.innerHTML = `
            <div class="no-markets">
                No relevant markets found for this page content.
            </div>
        `;
        return;
    }
    
    // Sort markets by edge confidence first, then relevance
    const sortedMarkets = [...markets].sort((a, b) => {
        // First priority: markets with edges (higher confidence first)
        if (a.edgeAnalysis?.hasEdge && !b.edgeAnalysis?.hasEdge) return -1;
        if (!a.edgeAnalysis?.hasEdge && b.edgeAnalysis?.hasEdge) return 1;
        if (a.edgeAnalysis?.hasEdge && b.edgeAnalysis?.hasEdge) {
            return (b.edgeAnalysis.confidence || 0) - (a.edgeAnalysis.confidence || 0);
        }
        // Second priority: relevance score
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });
    
    sortedMarkets.forEach(market => {
        const marketElement = createRelevantMarketElement(market);
        elements.marketsList.appendChild(marketElement);
    });
}

function createRelevantMarketElement(market) {
    const marketDiv = document.createElement('div');
    let marketClasses = 'market-item clickable relevant';
    
    // Add edge classes if edge analysis is available
    if (market.edgeAnalysis?.hasEdge) {
        marketClasses += ' has-edge';
        if (market.edgeAnalysis.confidence >= 70) {
            marketClasses += ' high-confidence';
        } else if (market.edgeAnalysis.confidence >= 50) {
            marketClasses += ' medium-confidence';
        } else {
            marketClasses += ' low-confidence';
        }
    }
    
    marketDiv.className = marketClasses;
    
    // Construct Kalshi market URL
    const baseUrl = 'https://kalshi.com/events/';
    const marketUrl = `${baseUrl}${market.series_ticker || market.ticker}`;
    
    // Create edge indicator HTML
    const edgeIndicatorHtml = createEdgeIndicatorHtml(market.edgeAnalysis);
    
    // Create pricing info HTML if available
    const pricingInfoHtml = createPricingInfoHtml(market);
    
    marketDiv.innerHTML = `
        <div class="market-header">
            <div class="market-title">
                ${escapeHtml(market.title)}
                ${edgeIndicatorHtml}
            </div>
            <div class="market-status open">OPEN</div>
        </div>
        <div class="market-details">
            <div class="market-ticker">${escapeHtml(market.ticker)}</div>
            <div class="market-category">${escapeHtml(market.category)}</div>
        </div>
        ${pricingInfoHtml}
        ${createEdgeAnalysisHtml(market.edgeAnalysis)}
        <div class="market-actions">
            <button class="btn btn-secondary copy-btn" data-ticker="${escapeHtml(market.ticker)}">
                Copy Ticker
            </button>
            <span class="click-hint">Click to view event</span>
        </div>
    `;
    
    // Make the entire card clickable (except for the copy button)
    marketDiv.addEventListener('click', (e) => {
        // Don't trigger if clicking the copy button or edge details
        if (e.target.closest('.copy-btn') || e.target.closest('.edge-details')) {
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

// Create edge indicator badge HTML
function createEdgeIndicatorHtml(edgeAnalysis) {
    if (!edgeAnalysis) {
        return '';
    }
    
    // Show indicator for multi-participant markets (only recommended ones are shown)
    if (edgeAnalysis.isMultiParticipant && edgeAnalysis.hasEdge) {
        return `<span class="edge-indicator recommended" title="Recommended participant (${edgeAnalysis.confidence}% confidence)">PICK</span>`;
    }
    
    // Standard binary market edge indicator
    if (!edgeAnalysis.hasEdge) {
        return '';
    }
    
    const edgeTypeText = edgeAnalysis.edgeType === 'underpriced' ? 'Edge' : 
                        edgeAnalysis.edgeType === 'overpriced' ? 'Edge' : 'Edge';
    
    const confidenceClass = edgeAnalysis.confidence >= 70 ? 'high' : 
                           edgeAnalysis.confidence >= 50 ? 'medium' : 'low';
    
    return `<span class="edge-indicator confidence-${confidenceClass}" title="Confidence: ${edgeAnalysis.confidence}%">${edgeTypeText}</span>`;
}

// Create pricing info HTML if available
function createPricingInfoHtml(market) {
    if (!market.detailedDataAvailable || !market.yes_bid) {
        return '';
    }
    
    return `
        <div class="pricing-info">
            <div class="price-display">
                <span class="price-label">Yes:</span>
                <span class="price-bid">${market.yes_bid}¢</span>
                <span class="price-separator">/</span>
                <span class="price-ask">${market.yes_ask || 'N/A'}¢</span>
            </div>
            <div class="volume-info">
                <span class="volume-label">Vol:</span>
                <span class="volume-value">${formatVolume(market.volume || 0)}</span>
            </div>
        </div>
    `;
}

// Create detailed edge analysis HTML
function createEdgeAnalysisHtml(edgeAnalysis) {
    if (!edgeAnalysis) {
        return '';
    }
    
    if (edgeAnalysis.error) {
        return `
            <div class="edge-analysis error">
                <div class="edge-status">Edge analysis unavailable</div>
            </div>
        `;
    }
    
    if (!edgeAnalysis.hasEdge) {
        return `
            <div class="edge-analysis no-edge">
                <div class="edge-status">No significant edge detected</div>
            </div>
        `;
    }
    
    // Handle multi-participant vs binary market recommendations
    let recommendationIcon = '';
    let recommendationText = '';
    
    if (edgeAnalysis.isMultiParticipant) {
        // Since we only show recommended participants, this is always the recommended one
        recommendationIcon = '';
        recommendationText = 'Recommended participant - Buy YES';
    } else {
        // Standard binary market recommendations
        const binaryRecommendations = {
            'buy_yes': { icon: '', text: 'Consider buying YES' },
            'buy_no': { icon: '', text: 'Consider buying NO' },
            'avoid': { icon: '', text: 'Avoid this market' },
            'insufficient_data': { icon: '', text: 'Insufficient data' }
        };
        
        const rec = binaryRecommendations[edgeAnalysis.recommendation] || { icon: '', text: 'See analysis' };
        recommendationIcon = rec.icon;
        recommendationText = rec.text;
    }
    
    return `
        <div class="edge-analysis has-edge">
            <div class="edge-summary">
                <div class="edge-recommendation">
                    <span class="rec-text">${recommendationText}</span>
                </div>
                ${edgeAnalysis.isMultiParticipant ? 
                    `<div class="multi-participant-note">Multi-participant event</div>` : 
                    ''}
            </div>
            <div class="edge-details">
                <div class="edge-reasoning">${escapeHtml(edgeAnalysis.reasoning)}</div>
                ${edgeAnalysis.isMultiParticipant && edgeAnalysis.recommendedParticipant ? 
                    `<div class="recommended-participant">Best option: ${edgeAnalysis.recommendedParticipant}</div>` : 
                    ''}
                <div class="edge-meta">
                    <span class="confidence">Confidence: ${edgeAnalysis.confidence}%</span>
                    <span class="timeframe">${edgeAnalysis.timeframe}</span>
                    <span class="analyzed-time">Analyzed ${getTimeAgo(edgeAnalysis.analyzedAt)}</span>
                </div>
            </div>
        </div>
    `;
}

// Helper function to format volume
function formatVolume(volume) {
    if (volume >= 1000000) {
        return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
        return (volume / 1000).toFixed(1) + 'K';
    }
    return volume.toString();
}

// Helper function to get time ago
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function updateActionButtonStates() {
    // Update button visual states based on current mode
    elements.analyzePageBtn.classList.toggle('primary', currentMode === 'relevant');
    elements.analyzePageBtn.classList.toggle('secondary', currentMode !== 'relevant');
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
