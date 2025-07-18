console.log('Market Suggestion Extension: Upstream navigation loaded');

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing upstream navigation...');
    
    // Get navigation buttons
    const marketSuggestionsBtn = document.getElementById('market-suggestions-btn');
    const understandContentBtn = document.getElementById('understand-content-btn');
    
    if (!marketSuggestionsBtn || !understandContentBtn) {
        console.error('Navigation buttons not found');
        return;
    }
    
    // Set up navigation event listeners
    marketSuggestionsBtn.addEventListener('click', () => {
        console.log('Navigating to Market Suggestions...');
        window.location.href = 'market-suggestions/market-suggestions.html';
    });
    
    understandContentBtn.addEventListener('click', () => {
        console.log('Navigating to Understand Content...');
        window.location.href = 'understand-content/understand-content.html';
    });
    
    // Add hover effects
    marketSuggestionsBtn.addEventListener('mouseenter', () => {
        marketSuggestionsBtn.style.transform = 'translateY(-2px)';
    });
    
    marketSuggestionsBtn.addEventListener('mouseleave', () => {
        marketSuggestionsBtn.style.transform = 'translateY(0)';
    });
    
    understandContentBtn.addEventListener('mouseenter', () => {
        understandContentBtn.style.transform = 'translateY(-2px)';
    });
    
    understandContentBtn.addEventListener('mouseleave', () => {
        understandContentBtn.style.transform = 'translateY(0)';
    });
});

// Error handling for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Upstream navigation error:', event.error);
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Upstream navigation unhandled promise rejection:', event.reason);
});
