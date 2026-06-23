// Shared helpers for extracting page content from background/service worker context

const EXTRACTABLE_URL_PATTERN = /^https?:\/\//;

function isExtractableUrl(url) {
    return Boolean(url && EXTRACTABLE_URL_PATTERN.test(url));
}

async function getTargetTab(preferredTabId) {
    if (preferredTabId != null) {
        try {
            return await chrome.tabs.get(preferredTabId);
        } catch (error) {
            console.warn('Preferred tab not found, falling back to active tab:', preferredTabId);
        }
    }

    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0] || null;
}

function sendExtractMessage(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response);
        });
    });
}

async function injectContentScript(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['contentScript.js']
    });
}

function isMissingContentScriptError(error) {
    const message = error?.message || '';
    return message.includes('Could not establish connection') ||
        message.includes('Receiving end does not exist');
}

async function extractContentFromTab(preferredTabId) {
    const tab = await getTargetTab(preferredTabId);

    if (!tab) {
        throw new Error('No active tab found');
    }

    if (!isExtractableUrl(tab.url)) {
        throw new Error(
            'Cannot extract content from this page. Open a regular webpage (http or https), then try again.'
        );
    }

    try {
        const response = await sendExtractMessage(tab.id);
        if (!response || !response.success) {
            throw new Error('Failed to extract page content');
        }
        return response;
    } catch (error) {
        if (!isMissingContentScriptError(error)) {
            throw error;
        }

        try {
            await injectContentScript(tab.id);
            const response = await sendExtractMessage(tab.id);
            if (!response || !response.success) {
                throw new Error('Failed to extract page content');
            }
            return response;
        } catch (retryError) {
            console.error('Content extraction failed after injection:', retryError);
            throw new Error(
                'Failed to extract page content. Refresh the page, reopen the extension, and try again.'
            );
        }
    }
}
