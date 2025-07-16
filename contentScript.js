// Content script for analyzing webpage content
console.log('Market Suggestion Extension: Content script loaded');

// Function to extract page content optimized for semantic analysis
function extractPageContent() {
    const content = {
        title: document.title || '',
        url: window.location.href,
        metaDescription: '',
        text: '',
        keywords: [],
        summary: ''
    };
    
    // Extract meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        content.metaDescription = metaDesc.getAttribute('content') || '';
    }
    
    // Extract keywords from meta tags
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        content.keywords = metaKeywords.getAttribute('content')?.split(',').map(k => k.trim()) || [];
    }
    
    // Enhanced text extraction with priority order and better filtering
    const textArray = [];
    
    // Priority 1: Main article content with more specific selectors
    const articleSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.content',
        '.story-body',
        '.article-body',
        '.post-body',
        '.story-content'
    ];
    
    let mainContent = null;
    for (const selector of articleSelectors) {
        const candidate = document.querySelector(selector);
        if (candidate) {
            // Verify this is actually main content, not a sidebar or ad container
            if (isMainContentArea(candidate)) {
                mainContent = candidate;
                break;
            }
        }
    }
    
    if (mainContent) {
        console.log('Found main content area:', mainContent.tagName, mainContent.className);
        // Extract from main content area, but still filter out ads within it
        const contentElements = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
        contentElements.forEach(element => {
            if (isContentElement(element)) {
                const text = cleanText(element.textContent);
                if (text && text.length > 15 && !isAdvertisementText(text)) {
                    textArray.push(text);
                }
            }
        });
    } else {
        console.log('No main content area found, using fallback extraction');
        // Fallback: Extract from common content elements with stricter filtering
        const fallbackElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
        fallbackElements.forEach(element => {
            // Skip navigation, footer, sidebar content
            if (isContentElement(element) && !isAdvertisementText(element.textContent)) {
                const text = cleanText(element.textContent);
                if (text && text.length > 15) {
                    textArray.push(text);
                }
            }
        });
    }
    
    // Join and limit content for optimal embedding generation
    const fullText = textArray.join(' ');
    content.text = fullText.substring(0, 3000); // Limit for embedding efficiency
    
    // Create a summary combining title, meta description, and key content
    const summaryParts = [
        content.title,
        content.metaDescription,
        fullText.substring(0, 500)
    ].filter(part => part && part.trim().length > 0);
    
    content.summary = summaryParts.join('. ').substring(0, 1000);
    
    return content;
}

// Helper function to clean extracted text
function cleanText(text) {
    if (!text) return '';
    
    return text
        .trim()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s.,!?;:()\-]/g, '') // Remove special characters but keep punctuation
        .replace(/\n+/g, ' '); // Replace newlines with spaces
}

// Helper function to determine if a container is the main content area
function isMainContentArea(element) {
    const adKeywords = [
        'sidebar', 'aside', 'widget', 'advertisement', 'ad-', 'ads-', 'promo',
        'related', 'recommended', 'insights', 'sponsored', 'partner-content',
        'commercial', 'affiliate', 'newsletter', 'subscription'
    ];
    
    // Check element attributes for ad indicators
    const elementText = (element.className + ' ' + element.id + ' ' + (element.getAttribute('data-module') || '')).toLowerCase();
    
    for (const keyword of adKeywords) {
        if (elementText.includes(keyword)) {
            return false;
        }
    }
    
    // Should have substantial content
    const textContent = element.textContent || '';
    if (textContent.length < 200) {
        return false;
    }
    
    return true;
}

// Helper function to detect advertisement or promotional text
function isAdvertisementText(text) {
    if (!text) return false;
    
    const adIndicators = [
        'advertisement', 'sponsored', 'promoted', 'affiliate', 'partner content',
        'subscribe', 'newsletter', 'get insights', 'learn more', 'find out more',
        'click here', 'sign up', 'join now', 'register', 'download', 'try free',
        'offer expires', 'limited time', 'special offer', 'discount',
        'aime insights', 'related articles', 'you might also like', 'recommended for you'
    ];
    
    const lowerText = text.toLowerCase();
    
    // Check for ad indicators
    for (const indicator of adIndicators) {
        if (lowerText.includes(indicator)) {
            return true;
        }
    }
    
    // Check for promotional patterns
    if (lowerText.match(/\b(save|get|buy|shop|order)\s+\d+%?\s*(off|discount)\b/)) {
        return true;
    }
    
    // Check for ticker symbols or financial promotional content
    if (lowerText.match(/\b[a-z]{2,5}:\s*[a-z]+\b/) && lowerText.includes('stock')) {
        return true;
    }
    
    return false;
}

// Helper function to determine if an element contains main content
function isContentElement(element) {
    const excludeSelectors = [
        'nav', 'header', 'footer', 'aside', 
        '.nav', '.navigation', '.menu', '.sidebar', 
        '.header', '.footer', '.advertisement', '.ad', '.ads',
        '.comments', '.comment', '.social', '.share',
        '.related', '.recommended', '.insights', '.promo',
        '.sponsored', '.affiliate', '.newsletter', '.subscription',
        '.widget', '.banner', '.popup', '.modal'
    ];
    
    // Check if element or its parents match exclude selectors
    let current = element;
    while (current && current !== document.body) {
        // Check tag name
        const tagName = current.tagName?.toLowerCase();
        if (['aside', 'nav', 'footer', 'header'].includes(tagName)) {
            return false;
        }
        
        for (const selector of excludeSelectors) {
            if (current.matches && current.matches(selector)) {
                return false;
            }
            if (current.className && typeof current.className === 'string') {
                const className = current.className.toLowerCase();
                if (className.includes(selector.replace('.', ''))) {
                    return false;
                }
            }
            if (current.id && typeof current.id === 'string') {
                const id = current.id.toLowerCase();
                if (id.includes(selector.replace('.', ''))) {
                    return false;
                }
            }
        }
        current = current.parentElement;
    }
    
    return true;
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
        tech: ['machine learning', 'automation', 'meta', 'apple', 'google', 'tesla', 'amazon', 'microsoft'],
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
