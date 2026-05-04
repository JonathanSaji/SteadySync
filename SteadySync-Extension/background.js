/**
 * SteadySync Background Service Worker
 *
 * Handles messages from content scripts for tab-level operations
 * that require the chrome.tabs API (not available in content scripts).
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openNewTab') {
    chrome.tabs.create({ url: 'chrome://newtab' }, (tab) => {
      if (chrome.runtime.lastError) {
        console.warn('[SteadySync BG] Failed to open tab:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[SteadySync BG] Opened new tab:', tab.id);
        sendResponse({ success: true, tabId: tab.id });
      }
    });
    return true; // Keep the message channel open for async sendResponse
  }

  if (message.action === 'closeCurrentTab') {
    // Close the tab that sent the message
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn('[SteadySync BG] Failed to close tab:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[SteadySync BG] Closed tab:', tabId);
          sendResponse({ success: true });
        }
      });
    } else {
      sendResponse({ success: false, error: 'Could not determine sender tab.' });
    }
    return true; // Keep the message channel open for async sendResponse
  }
});
