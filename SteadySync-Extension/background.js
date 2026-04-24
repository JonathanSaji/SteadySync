// background.js (service worker)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "OPEN_SUBTRACKR_DASHBOARD") {
    
    chrome.storage.sync.get(["dashboardUrl"], (result) => {
      const DASHBOARD_URL = result.dashboardUrl || "http://127.0.0.1:5501/HTMLtest.html";
      chrome.tabs.create({ url: DASHBOARD_URL });
      sendResponse({ ok: true });
    });

    return true; // keep message channel alive for async
  }
  return false;
});