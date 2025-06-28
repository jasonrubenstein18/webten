// Content script for analyzing webpage content
console.log('Market Suggestion Extension: Content script loaded');

// Function to extract page content
function extractPageContent() {
    const content = {
        title: document.title || '',
        url: window.location.href,
        metaDescription: '',
        text: '',
        keywords: []
    };
    
    // Extract meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        content.metaDescription = metaDesc.getAttribute('content') || '';
    }
    
    // Extract main text content (excluding scripts, styles, etc.)
    const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, article, main, .content');
    const textArray = [];
    
    textElements.forEach(element => {
        const text = element.textContent?.trim();
        if (text && text.length > 20) {
            textArray.push(text);
        }
    });
    
    content.text = textArray.join(' ').substring(0, 5000); // Limit to 5000 chars
    
    // Extract keywords from meta tags
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        content.keywords = metaKeywords.getAttribute('content')?.split(',').map(k => k.trim()) || [];
    }
    
    return content;
}

// Function to analyze content and suggest relevant market topics
function analyzeContentForMarkets(content) {
    const suggestions = [];
    const text = `${content.title} ${content.metaDescription} ${content.text}`.toLowerCase();
    
    // Define market categories and keywords
    const marketCategories = {
        politics: ['election', 'president', 'congress', 'senate', 'politics', 'campaign', 'vote', 'democrat', 'republican'],
        crypto: ['bitcoin', 'ethereum', 'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft'],
        sports: ['nfl', 'nba', 'mlb', 'nhl', 'super bowl', 'world series', 'playoffs', 'championship'],
        tech: ['ai', 'artificial intelligence', 'meta', 'apple', 'google', 'tesla', 'amazon', 'microsoft'],
        economy: ['inflation', 'recession', 'gdp', 'unemployment', 'fed', 'interest rates', 'stock market'],
        climate: ['climate', 'global warming', 'carbon', 'renewable energy', 'solar', 'wind', 'electric vehicle']
    };
    
    // Check which categories match the content
    const matchedCategories = [];
    for (const [category, keywords] of Object.entries(marketCategories)) {
        const matches = keywords.filter(keyword => text.includes(keyword));
        if (matches.length > 0) {
            matchedCategories.push({
                category,
                matches,
                relevance: matches.length
            });
        }
    }
    
    // Sort by relevance
    matchedCategories.sort((a, b) => b.relevance - a.relevance);
    
    return {
        categories: matchedCategories,
        confidence: matchedCategories.length > 0 ? Math.min(matchedCategories[0].relevance * 0.2, 1) : 0
    };
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        const content = extractPageContent();
        const analysis = analyzeContentForMarkets(content);
        
        sendResponse({
            success: true,
            content,
            analysis
        });
        return true;
    }
    
    if (request.action === 'ping') {
        sendResponse({ success: true, message: 'Content script is active' });
        return true;
    }
});

// Auto-analyze on page load (if enabled)
chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {};
    if (settings.autoAnalyze) {
        // Could send analysis to background script here
        console.log('Auto-analysis enabled, analyzing page...');
    }
});
