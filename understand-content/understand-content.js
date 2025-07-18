console.log('Understand Content Extension: Module loaded');

// Cache DOM elements
const elements = {};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing understand content...');
    
    // Cache DOM elements
    elements.backBtn = document.getElementById('back-btn');
    elements.startAnalysisBtn = document.getElementById('start-analysis-btn');
    elements.analyzeBtn = document.getElementById('analyze-btn');
    elements.retryBtn = document.getElementById('retry-btn');
    elements.copySummaryBtn = document.getElementById('copy-summary-btn');
    
    elements.initialState = document.getElementById('initial-state');
    elements.loading = document.getElementById('loading');
    elements.error = document.getElementById('error');
    elements.analysisContainer = document.getElementById('analysis-container');
    
    elements.sourceTitle = document.getElementById('source-title');
    elements.sourceUrl = document.getElementById('source-url');
    elements.summaryContent = document.getElementById('summary-content');
    elements.errorMessage = document.querySelector('.error-message');
    elements.loadingMessage = document.querySelector('.loading-message');
    elements.loadingDetails = document.querySelector('.loading-details');
    
    // Progress bar elements
    elements.progressFill = document.getElementById('progress-fill');
    elements.progressPercentage = document.getElementById('progress-percentage');
    elements.progressPhase = document.getElementById('progress-phase');
    
    setupEventListeners();
    setupProgressListener();
    showInitialState();
    
    console.log('Understand Content module initialized');
});

function setupEventListeners() {
    // Back button
    if (elements.backBtn) {
        elements.backBtn.addEventListener('click', () => {
            console.log('Navigating back to main menu...');
            window.location.href = '../popup.html';
        });
        
        // Add hover effect
        elements.backBtn.addEventListener('mouseenter', () => {
            elements.backBtn.style.transform = 'translateX(-2px)';
        });
        
        elements.backBtn.addEventListener('mouseleave', () => {
            elements.backBtn.style.transform = 'translateX(0)';
        });
    }
    
    // Analysis buttons
    if (elements.startAnalysisBtn) {
        elements.startAnalysisBtn.addEventListener('click', analyzeContent);
    }
    
    if (elements.analyzeBtn) {
        elements.analyzeBtn.addEventListener('click', analyzeContent);
    }
    
    if (elements.retryBtn) {
        elements.retryBtn.addEventListener('click', analyzeContent);
    }
    
    // Copy summary button
    if (elements.copySummaryBtn) {
        elements.copySummaryBtn.addEventListener('click', copySummary);
    }
}

function setupProgressListener() {
    // Listen for progress updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'understand-content:progressUpdate' && message.progress) {
            const progress = message.progress;
            
            // Calculate percentage if not provided
            let percentage = progress.percentage || 0;
            if (!progress.percentage && progress.current && progress.total) {
                percentage = Math.round((progress.current / progress.total) * 100);
            }
            
            // Update progress bar
            updateProgress(percentage, progress.phase || progress.message || '');
            
            // Update loading details if provided
            if (progress.details && elements.loadingDetails) {
                elements.loadingDetails.textContent = progress.details;
            }
        }
    });
}

function showInitialState() {
    hideAllStates();
    if (elements.initialState) {
        elements.initialState.style.display = 'block';
    }
}

function showLoading(message = 'Analyzing content...', details = 'Extracting and summarizing webpage content...') {
    hideAllStates();
    if (elements.loading) {
        elements.loading.style.display = 'flex';
        if (elements.loadingMessage) {
            elements.loadingMessage.textContent = message;
        }
        if (elements.loadingDetails) {
            elements.loadingDetails.textContent = details;
        }
        
        // Reset progress bar
        resetProgress();
    }
}

function showError(message = 'An error occurred while analyzing the content.') {
    hideAllStates();
    if (elements.error) {
        elements.error.style.display = 'block';
        if (elements.errorMessage) {
            elements.errorMessage.textContent = message;
        }
    }
}

function showAnalysis(summary, originalContent) {
    hideAllStates();
    if (elements.analysisContainer) {
        elements.analysisContainer.style.display = 'flex';
        
        // Update source info
        if (elements.sourceTitle && originalContent.title) {
            elements.sourceTitle.textContent = originalContent.title;
        }
        
        if (elements.sourceUrl && originalContent.url) {
            elements.sourceUrl.href = originalContent.url;
            elements.sourceUrl.textContent = 'View Original';
        }
        
        // Render markdown summary
        if (elements.summaryContent) {
            elements.summaryContent.innerHTML = renderMarkdown(summary);
        }
    }
}

function hideAllStates() {
    const states = [elements.initialState, elements.loading, elements.error, elements.analysisContainer];
    states.forEach(state => {
        if (state) {
            state.style.display = 'none';
        }
    });
}

function resetProgress() {
    if (elements.progressFill) {
        elements.progressFill.style.width = '0%';
    }
    if (elements.progressPercentage) {
        elements.progressPercentage.textContent = '0%';
    }
    if (elements.progressPhase) {
        elements.progressPhase.textContent = 'Starting...';
    }
}

function updateProgress(percentage, phase = '') {
    if (elements.progressFill) {
        elements.progressFill.style.width = `${percentage}%`;
    }
    if (elements.progressPercentage) {
        elements.progressPercentage.textContent = `${percentage}%`;
    }
    if (elements.progressPhase && phase) {
        elements.progressPhase.textContent = phase;
    }
}

function analyzeContent() {
    console.log('Starting content analysis...');
    
    showLoading();
    
    // Set up timeout for the entire analysis process
    const analysisTimeout = setTimeout(() => {
        console.error('Analysis timeout after 2 minutes');
        showError('Analysis timed out after 2 minutes. Please try again or check your internet connection.');
    }, 120000); // 2 minute timeout
    
    // Send message to background script to analyze content
    chrome.runtime.sendMessage({ action: 'understand-content:analyzeContent' }, (response) => {
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
            let errorMessage = response.error || 'Failed to analyze content';
            
            // Provide more specific error messages
            if (errorMessage.includes('Failed to fetch')) {
                errorMessage = 'Network error: Please check your internet connection and try again.';
            } else if (errorMessage.includes('timeout')) {
                errorMessage = 'Request timed out: Please try again. If the issue persists, check your internet connection.';
            } else if (errorMessage.includes('API error')) {
                errorMessage = 'Analysis service error: Please try again in a few moments.';
            } else if (errorMessage.includes('Insufficient page content')) {
                errorMessage = 'Unable to extract sufficient content from this page. Please try a different webpage.';
            }
            
            showError(errorMessage);
            return;
        }
        
        if (!response.summary) {
            console.error('No summary in response:', response);
            showError('No summary received. Please try again.');
            return;
        }
        
        // Show the analysis result
        showAnalysis(response.summary, response.originalContent || {});
    });
}

function copySummary() {
    if (!elements.summaryContent) return;
    
    // Get the text content of the summary
    const summaryText = elements.summaryContent.textContent || elements.summaryContent.innerText;
    
    // Copy to clipboard
    navigator.clipboard.writeText(summaryText).then(() => {
        // Show feedback
        const originalText = elements.copySummaryBtn.textContent;
        elements.copySummaryBtn.textContent = 'Copied!';
        elements.copySummaryBtn.style.background = '#28a745';
        
        setTimeout(() => {
            elements.copySummaryBtn.textContent = originalText;
            elements.copySummaryBtn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy summary:', err);
        // Fallback: select text for manual copying
        const range = document.createRange();
        range.selectNode(elements.summaryContent);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    });
}

// Simple markdown renderer
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
        
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        
        // Lists
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        
        // Wrap in paragraphs if not already wrapped
        .replace(/^(?!<[hul])/gm, '<p>')
        .replace(/(?<!>)$/gm, '</p>')
        
        // Clean up extra paragraph tags
        .replace(/<p><\/p>/g, '')
        .replace(/<p>(<[hul])/g, '$1')
        .replace(/(<\/[hul]>)<\/p>/g, '$1');
    
    return html;
}

// Error handling for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Understand Content error:', event.error);
    showError('An unexpected error occurred. Please try again.');
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Understand Content unhandled promise rejection:', event.reason);
    showError('An unexpected error occurred. Please try again.');
});
