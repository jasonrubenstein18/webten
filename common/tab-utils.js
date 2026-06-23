// Helpers for popup/extension pages to resolve the user's current webpage tab

async function getActiveTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id ?? null;
}
