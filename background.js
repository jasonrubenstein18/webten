// Background service worker router for the Chrome extension
console.log('Market Suggestion Extension: Background router loaded');

// Import shared configuration first
importScripts('common/config.js');

// Import module-specific background scripts
importScripts('market-suggestions/market-suggestions-background.js');
importScripts('market-suggestions/market-suggestions-poly-background.js');

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background router received message:', request);
    
    // Route messages based on action prefix
    if (request.action.startsWith('market-suggestions:')) {
        // Route to market suggestions module
        return handleMarketSuggestionsMessage(request, sender, sendResponse);
    } else if (request.action.startsWith('polymarket:')) {
        // Route to Polymarket module
        return handlePolymarketMessage(request, sender, sendResponse);
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

// Handle understand content messages
function handleUnderstandContentMessage(request, sender, sendResponse) {
    console.log('Handling understand content message:', request.action);
    
    // Remove the prefix for processing
    const action = request.action.replace('understand-content:', '');
    
    if (action === 'analyzeContent') {
        console.log('Analyzing content for summarization...');
        
        // Helper function to send progress updates
        const sendProgress = (progressData) => {
            chrome.runtime.sendMessage({
                action: 'understand-content:progressUpdate',
                progress: progressData
            }).catch(() => {
                // Popup might be closed, ignore errors
            });
        };
        
        // Initial progress
        sendProgress({
            percentage: 5,
            phase: 'Starting analysis...',
            details: 'Initializing content analysis...'
        });
        
        // First get the page content from the content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                sendResponse({
                    success: false,
                    error: 'No active tab found'
                });
                return;
            }
            
            sendProgress({
                percentage: 10,
                phase: 'Extracting content...',
                details: 'Reading webpage content and filtering out ads...'
            });
            
            chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent' }, async (contentResponse) => {
                if (chrome.runtime.lastError) {
                    console.error('Error extracting content:', chrome.runtime.lastError);
                    sendResponse({
                        success: false,
                        error: 'Failed to extract page content. Make sure you are on a webpage.'
                    });
                    return;
                }
                
                if (!contentResponse || !contentResponse.success) {
                    sendResponse({
                        success: false,
                        error: 'Failed to extract page content'
                    });
                    return;
                }
                
                sendProgress({
                    percentage: 25,
                    phase: 'Content extracted',
                    details: 'Content successfully extracted, preparing for analysis...'
                });
                
                try {
                    // Use Grok to summarize the content
                    const summary = await summarizeContentWithGrok(contentResponse.content, sendProgress);
                    
                    sendProgress({
                        percentage: 100,
                        phase: 'Complete!',
                        details: 'Analysis finished successfully.'
                    });
                    
                    sendResponse({
                        success: true,
                        summary: summary,
                        originalContent: {
                            title: contentResponse.content.title,
                            url: contentResponse.content.url
                        }
                    });
                    
                } catch (error) {
                    console.error('Error in content analysis:', error);
                    sendResponse({
                        success: false,
                        error: error.message || 'Failed to analyze content'
                    });
                }
            });
        });
        
        return true; // Keep message channel open for async response
    } else if (action === 'quickSummary') {
        console.log('Generating quick summary...');
        
        // Helper function to send progress updates
        const sendProgress = (progressData) => {
            chrome.runtime.sendMessage({
                action: 'understand-content:progressUpdate',
                progress: progressData
            }).catch(() => {
                // Popup might be closed, ignore errors
            });
        };
        
        // Initial progress
        sendProgress({
            percentage: 5,
            phase: 'Starting quick summary...',
            details: 'Preparing Newsletter-style analysis...'
        });
        
        // First get the page content from the content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                sendResponse({
                    success: false,
                    error: 'No active tab found'
                });
                return;
            }
            
            sendProgress({
                percentage: 15,
                phase: 'Extracting content...',
                details: 'Reading webpage content...'
            });
            
            chrome.tabs.sendMessage(tabs[0].id, { action: 'extractContent' }, async (contentResponse) => {
                if (chrome.runtime.lastError) {
                    console.error('Error extracting content:', chrome.runtime.lastError);
                    sendResponse({
                        success: false,
                        error: 'Failed to extract page content. Make sure you are on a webpage.'
                    });
                    return;
                }
                
                if (!contentResponse || !contentResponse.success) {
                    sendResponse({
                        success: false,
                        error: 'Failed to extract page content'
                    });
                    return;
                }
                
                sendProgress({
                    percentage: 30,
                    phase: 'Content extracted',
                    details: 'Content successfully extracted, creating quick summary...'
                });
                
                try {
                    // Use Grok to create quick summary
                    const summary = await createQuickSummaryWithGrok(contentResponse.content, sendProgress);
                    
                    sendProgress({
                        percentage: 100,
                        phase: 'Complete!',
                        details: 'Quick summary finished successfully.'
                    });
                    
                    sendResponse({
                        success: true,
                        summary: summary,
                        originalContent: {
                            title: contentResponse.content.title,
                            url: contentResponse.content.url
                        }
                    });
                    
                } catch (error) {
                    console.error('Error in quick summary:', error);
                    sendResponse({
                        success: false,
                        error: error.message || 'Failed to create quick summary'
                    });
                }
            });
        });
        
        return true; // Keep message channel open for async response
    }
    
    // Unknown understand content action
    console.warn('Unknown understand content action:', action);
    sendResponse({ success: false, error: 'Unknown understand content action' });
    return false;
}

// Summarize content using Grok API
async function summarizeContentWithGrok(pageContent, progressCallback = null) {
    try {
        console.log('Generating content summary with Grok...');
        
        if (progressCallback) {
            progressCallback({
                percentage: 30,
                phase: 'Preparing content...',
                details: 'Processing and formatting content for analysis...'
            });
        }
        
        // Prepare content for summarization - use the filtered main content
        let contentText = `${pageContent.title || ''} ${pageContent.summary || ''}`.trim();
        if (!contentText || contentText.length < 10) {
            throw new Error('Insufficient page content for analysis');
        }
        
        // Truncate if too long to respect token limits (Grok can handle more but we'll be conservative)
        if (contentText.length > 8000) {
            contentText = contentText.substring(0, 8000) + '...';
        }

        const prompt = `You are tasked with creating a detailed and concise summary of the users webpage.
Your goal is to produce a comprehensive yet concise summary that captures the key points, goals, results, next steps, and insights in a structured format.

Use your complete knowledge base to analyze this web content. Please do deep research to contextualize the information. Draw research from authoritative sources like similar articles or research and unbiased pundits.

To create the summary, follow these steps:

Carefully read and analyze the entire webpage main content. 
Identify the main sections of the document.
Organize the information in a hierarchical structure using numbered sections and subsections.
Include relevant business results, statistics, percentages, and comparative data where applicable.
Highlight any novel approaches, breakthroughs, or significant improvement over previous work.
Summarize the results and their implications concisely.
If the document discusses limitations or future work, include a brief mention of these.
Start by writing a Summary of the purpose and key points of the web content in the first paragraph of your summary.
Your Summary paragraph needs to include the most important business results, risks, debates, or otherwise pertinent highlights.
Highlight key sections and include the most important information.
Where applicable, organize the sections in chronological order of how the document progresses.
For every point or section, make sure to include supporting arguments, examples, short quotes, results, comparisons, or explanations.

When writing the summary:
Use clear and concise language.
Maintain a neutral, objective tone.
Use bullet points for lists of features, characteristics, or findings.
Include specific numbers and metrics where relevant.
Avoid unnecessary jargon, but retain important technical terms.
Do not include personal opinions or critiques of the research. 

Format your summary using markdown for readability.

Use # for main section headings
Use ## for subsection headings
Use * for bullet points
Use ** for bold text to emphasize key points
Aim for a comprehensive summary that captures the essence of the content while remaining concise and easy to read.
The length of the summary should be proportional to the complexity and length of the original paper.

Here is the attached content -- 

WEBPAGE TITLE: ${pageContent.title || 'Untitled'}

WEBPAGE CONTENT:
${contentText}

Please provide a comprehensive markdown-formatted summary following the requirements above:`;

        if (progressCallback) {
            progressCallback({
                percentage: 50,
                phase: 'Analyzing Content...',
                details: 'Performing deep analysis and summarization...'
            });
        }
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Content analysis timeout')), 120000); // 2 minute timeout
        });
        
        // Create fetch promise for Grok API
        const fetchPromise = fetch(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROK_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 4000
            })
        });
        
        // Race between fetch and timeout
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Grok API error: ${response.status} - ${errorText}`);
        }
        
        if (progressCallback) {
            progressCallback({
                percentage: 85,
                phase: 'Processing response...',
                details: 'Formatting and finalizing the analysis results...'
            });
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from Grok API');
        }
        
        const summary = data.choices[0].message.content.trim();
        console.log('Content summary generated successfully');
        
        return summary;
        
    } catch (error) {
        console.error('Error generating content summary:', error);
        throw new Error(`Failed to generate summary: ${error.message}`);
    }
}

// Create quick Newsletter-style summary using Grok API
async function createQuickSummaryWithGrok(pageContent, progressCallback = null) {
    try {
        console.log('Generating quick Newsletterstyle summary with Grok...');
        
        if (progressCallback) {
            progressCallback({
                percentage: 40,
                phase: 'Preparing content...',
                details: 'Processing content for Newsletter-style summary...'
            });
        }
        
        // Prepare content for summarization - use the filtered main content
        let contentText = `${pageContent.title || ''} ${pageContent.summary || ''}`.trim();
        if (!contentText || contentText.length < 10) {
            throw new Error('Insufficient page content for analysis');
        }
        
        // Truncate if too long to respect token limits
        if (contentText.length > 6000) {
            contentText = contentText.substring(0, 6000) + '...';
        }

        const prompt = `You are a Morning Brew–style newsletter writer: smart, snappy, and always a little cheeky. Your task is to read the following webpage content and produce a clear, concise "Morning Brew"–flavored summary that:

1. Captures the key points and takeaways.
2. Feels fun and engaging to read, with the light tone and punchy flair Morning Brew readers love.
3. Stays lean—no fluff, no filler words, no long-winded introductions.
4. Incorporates any relevant context or background you know (e.g., drawing on authoritative articles, research studies, or respected pundits) to enrich the summary and ensure accuracy.
5. Remains unbiased and factual.

Output format:
• **Headline‑style title** (one sentence)
• **3–5 bullet points** (each ~15–25 words)
• **One‑sentence "Why it matters" wrap‑up** 

Here's the content to summarize:

WEBPAGE TITLE: ${pageContent.title || 'Untitled'}

WEBPAGE CONTENT:
${contentText}

Please provide your Morning Brew-style summary following the format above:`;

        if (progressCallback) {
            progressCallback({
                percentage: 60,
                phase: 'Creating summary...',
                details: 'Generating snappy Newsletter-style content...'
            });
        }
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Quick summary timeout')), 60000); // 1 minute timeout for quick summary
        });
        
        // Create fetch promise for Grok API
        const fetchPromise = fetch(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROK_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7, // Higher temperature for more creative/cheeky tone
                max_tokens: 800 // Shorter response for quick summary
            })
        });
        
        // Race between fetch and timeout
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Grok API error: ${response.status} - ${errorText}`);
        }
        
        if (progressCallback) {
            progressCallback({
                percentage: 90,
                phase: 'Processing response...',
                details: 'Formatting and finalizing the quick summary...'
            });
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from Grok API');
        }
        
        const summary = data.choices[0].message.content.trim();
        console.log('Quick summary generated successfully');
        
        return summary;
        
    } catch (error) {
        console.error('Error generating quick summary:', error);
        throw new Error(`Failed to generate quick summary: ${error.message}`);
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
