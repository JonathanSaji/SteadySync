## SUBTRACKR Subscription Helper (Chrome Extension)

This folder contains a Manifest V3 Chrome extension that detects subscription-related pages and gently reminds you to log new subscriptions in your SUBTRACKR web app.

### Files

- `manifest.json` — Extension manifest (MV3).
- `background.js` — Service worker; opens the SUBTRACKR dashboard when requested.
- `content-script.js` — Runs on all pages, detects subscription-related pages, and injects the in-page popup.
- `content-style.css` — Scoped styles for the injected popup UI.
- `options.html` — Simple options page to configure the SUBTRACKR dashboard URL.

### Dashboard URL

By default, the extension uses:

- `http://localhost:5500/HTMLtest.html`

Update this in **one** of two ways:

1. Change `DEFAULT_DASHBOARD_URL` in `background.js`, or  
2. After installing the extension, open its **Options** page and set the dashboard URL there (this value is stored locally in `chrome.storage.sync`).

### How to load in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `subtrackr-extension` folder.
5. Visit a subscription-related page (e.g., a Netflix/Spotify billing or plans page).
6. You should see a small SUBTRACKR reminder popup in the bottom-right. Clicking it opens your dashboard in a new tab.

