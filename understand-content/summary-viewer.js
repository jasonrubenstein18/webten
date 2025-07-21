console.log('Summary Viewer: Module loaded');

// Global state
let summaryData = null;
let isLoading = true;

// DOM elements
const elements = {};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Summary Viewer: DOM loaded, initializing...');
    
    // Cache DOM elements
    cacheElements();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load summary data
    loadSummaryData();
    
    console.log('Summary Viewer: Initialized');
});

function cacheElements() {
    elements.loadingContainer = document.getElementById('loading-container');
    elements.errorContainer = document.getElementById('error-container');
    elements.viewerMain = document.getElementById('viewer-main');
    
    elements.backToExtension = document.getElementById('back-to-extension');
    elements.printSummary = document.getElementById('print-summary');
    elements.copySummary = document.getElementById('copy-summary');
    elements.retryLoad = document.getElementById('retry-load');
    
    elements.sourceTitle = document.getElementById('source-title');
    elements.sourceUrl = document.getElementById('source-url');
    elements.analysisDate = document.getElementById('analysis-date');
    elements.summaryContent = document.getElementById('summary-content');
    elements.footerStats = document.getElementById('footer-stats');
}

function setupEventListeners() {
    // Navigation
    if (elements.backToExtension) {
        elements.backToExtension.addEventListener('click', navigateBackToExtension);
    }
    
    // Actions
    if (elements.printSummary) {
        elements.printSummary.addEventListener('click', printSummary);
    }
    
    if (elements.copySummary) {
        elements.copySummary.addEventListener('click', copySummaryToClipboard);
    }
    
    if (elements.retryLoad) {
        elements.retryLoad.addEventListener('click', loadSummaryData);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Handle URL changes (for back navigation)
    window.addEventListener('popstate', handlePopState);
}

function handleKeyboardShortcuts(event) {
    // Ctrl/Cmd + P for print
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        printSummary();
    }
    
    // Ctrl/Cmd + C for copy (when no text is selected)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c' && window.getSelection().toString() === '') {
        event.preventDefault();
        copySummaryToClipboard();
    }
    
    // Escape to go back
    if (event.key === 'Escape') {
        navigateBackToExtension();
    }
}

function handlePopState(event) {
    // Handle browser back button
    navigateBackToExtension();
}

async function loadSummaryData() {
    console.log('Loading summary data...');
    
    showLoading();
    
    try {
        // Try to get data from URL parameters first
        const urlParams = new URLSearchParams(window.location.search);
        const summaryId = urlParams.get('summaryId');
        
        if (summaryId) {
            // Load from chrome storage using the ID
            summaryData = await loadFromStorage(summaryId);
        } else {
            // Fallback: try to get most recent summary from storage
            summaryData = await loadMostRecentSummary();
        }
        
        if (!summaryData) {
            throw new Error('No summary data found');
        }
        
        renderSummary(summaryData);
        showContent();
        
    } catch (error) {
        console.error('Failed to load summary data:', error);
        showError('The summary could not be loaded. Please try opening it from the extension again.');
    }
}

function loadFromStorage(summaryId) {
    return new Promise((resolve) => {
        chrome.storage.session.get([summaryId], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
                resolve(null);
                return;
            }
            
            const data = result[summaryId];
            if (data && data.summary) {
                console.log('Loaded summary from storage:', summaryId);
                resolve(data);
            } else {
                console.log('No summary found for ID:', summaryId);
                resolve(null);
            }
        });
    });
}

function loadMostRecentSummary() {
    return new Promise((resolve) => {
        chrome.storage.session.get(null, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
                resolve(null);
                return;
            }
            
            // Find the most recent summary
            let mostRecent = null;
            let mostRecentTime = 0;
            
            for (const [key, value] of Object.entries(result)) {
                if (key.startsWith('summary_') && value.summary && value.timestamp) {
                    if (value.timestamp > mostRecentTime) {
                        mostRecentTime = value.timestamp;
                        mostRecent = value;
                    }
                }
            }
            
            if (mostRecent) {
                console.log('Loaded most recent summary');
                resolve(mostRecent);
            } else {
                console.log('No recent summary found');
                resolve(null);
            }
        });
    });
}

function renderSummary(data) {
    console.log('Rendering summary data:', data);
    
    // Update page title
    if (data.originalContent && data.originalContent.title) {
        document.title = `${data.originalContent.title} - Content Summary`;
    }
    
    // Update source information
    if (elements.sourceTitle && data.originalContent) {
        elements.sourceTitle.textContent = data.originalContent.title || 'Untitled Page';
    }
    
    if (elements.sourceUrl && data.originalContent && data.originalContent.url) {
        elements.sourceUrl.href = data.originalContent.url;
        elements.sourceUrl.textContent = 'View Original Page';
    }
    
    // Update analysis date
    if (elements.analysisDate) {
        const date = data.timestamp ? new Date(data.timestamp) : new Date();
        elements.analysisDate.textContent = `Analyzed on ${date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    }
    
    // Render summary content
    if (elements.summaryContent && data.summary) {
        elements.summaryContent.innerHTML = renderMarkdown(data.summary);
    }
    
    // Update footer stats
    updateFooterStats(data.summary);
}

function updateFooterStats(summaryText) {
    if (!elements.footerStats || !summaryText) return;
    
    // Calculate statistics
    const wordCount = summaryText.split(/\s+/).filter(word => word.length > 0).length;
    const charCount = summaryText.length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // Assume 200 words per minute
    
    // Create stats HTML
    const statsHTML = `
        <div class="footer-stat">
            <div class="stat-value">${wordCount.toLocaleString()}</div>
            <div class="stat-label">Words</div>
        </div>
        <div class="footer-stat">
            <div class="stat-value">${charCount.toLocaleString()}</div>
            <div class="stat-label">Characters</div>
        </div>
        <div class="footer-stat">
            <div class="stat-value">${readingTime}</div>
            <div class="stat-label">Min Read</div>
        </div>
    `;
    
    elements.footerStats.innerHTML = statsHTML;
}

// Simple markdown renderer (reused from understand-content.js with enhancements)
function renderMarkdown(text) {
    if (!text) return '';
    
    // Convert markdown to HTML
    let html = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        
        // Bold text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        
        // Italic text
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        
        // Code blocks (inline)
        .replace(/`(.*?)`/g, '<code>$1</code>')
        
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        
        // Line breaks and paragraphs
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        
        // Lists (improved handling)
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        
        // Blockquotes
        .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
        
        // Wrap in paragraphs if not already wrapped
        .replace(/^(?!<[hul])/gm, '<p>')
        .replace(/(?<!>)$/gm, '</p>')
        
        // Clean up extra paragraph tags
        .replace(/<p><\/p>/g, '')
        .replace(/<p>(<[hul])/g, '$1')
        .replace(/(<\/[hul]>)<\/p>/g, '$1')
        .replace(/<p>(<blockquote>)/g, '$1')
        .replace(/(<\/blockquote>)<\/p>/g, '$1');
    
    return html;
}

function showLoading() {
    hideAllStates();
    if (elements.loadingContainer) {
        elements.loadingContainer.style.display = 'flex';
    }
    isLoading = true;
}

function showError(message) {
    hideAllStates();
    if (elements.errorContainer) {
        elements.errorContainer.style.display = 'flex';
        const errorMsg = elements.errorContainer.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.textContent = message;
        }
    }
    isLoading = false;
}

function showContent() {
    hideAllStates();
    if (elements.viewerMain) {
        elements.viewerMain.style.display = 'block';
    }
    isLoading = false;
}

function hideAllStates() {
    const states = [elements.loadingContainer, elements.errorContainer, elements.viewerMain];
    states.forEach(state => {
        if (state) {
            state.style.display = 'none';
        }
    });
}

function navigateBackToExtension() {
    // Try to close the tab if it was opened by the extension
    if (window.history.length <= 1 || document.referrer.includes('chrome-extension://')) {
        // If this tab was opened directly or from extension, close it
        chrome.tabs.getCurrent((tab) => {
            if (tab) {
                chrome.tabs.remove(tab.id);
            } else {
                // Fallback: navigate to a generic page
                window.close();
            }
        });
    } else {
        // Navigate back if there's history
        window.history.back();
    }
}

function printSummary() {
    console.log('Printing summary...');
    
    // Temporarily hide header and footer for printing
    const header = document.querySelector('.viewer-header');
    const footer = document.querySelector('.viewer-footer');
    
    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    
    // Print
    window.print();
    
    // Restore header and footer after print dialog
    setTimeout(() => {
        if (header) header.style.display = '';
        if (footer) footer.style.display = '';
    }, 100);
}

async function copySummaryToClipboard() {
    if (!summaryData || !summaryData.summary) {
        console.error('No summary data to copy');
        return;
    }
    
    try {
        // Get plain text version of summary
        const plainText = summaryData.summary;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(plainText);
        
        // Show feedback
        showCopyFeedback();
        
        console.log('Summary copied to clipboard');
        
    } catch (error) {
        console.error('Failed to copy summary:', error);
        
        // Fallback: select summary text for manual copying
        if (elements.summaryContent) {
            const range = document.createRange();
            range.selectNode(elements.summaryContent);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        }
    }
}

function showCopyFeedback() {
    if (!elements.copySummary) return;
    
    const originalText = elements.copySummary.innerHTML;
    
    // Update button to show success
    elements.copySummary.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Copied!
    `;
    elements.copySummary.style.background = '#28a745';
    elements.copySummary.style.borderColor = '#28a745';
    elements.copySummary.style.color = 'white';
    
    // Reset after 2 seconds
    setTimeout(() => {
        elements.copySummary.innerHTML = originalText;
        elements.copySummary.style.background = '';
        elements.copySummary.style.borderColor = '';
        elements.copySummary.style.color = '';
    }, 2000);
}

// Error handling for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Summary Viewer error:', event.error);
    if (isLoading) {
        showError('An unexpected error occurred while loading the summary.');
    }
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Summary Viewer unhandled promise rejection:', event.reason);
    if (isLoading) {
        showError('An unexpected error occurred while loading the summary.');
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !summaryData) {
        // Retry loading if page becomes visible and no data is loaded
        loadSummaryData();
    }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderMarkdown,
        updateFooterStats,
        loadSummaryData
    };
} 