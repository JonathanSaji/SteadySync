let hasShownSubtrackrPopup = false;

const KNOWN_SUBSCRIPTION_DOMAINS = [
  "netflix.com",
  "spotify.com",
  "hulu.com",
  "disneyplus.com",
  "disneyplus.hotstar.com",
  "youtube.com",
  "music.youtube.com",
  "tv.youtube.com",
  "primevideo.com",
  "amazon.com",
  "amazon.ca",
  "chat.openai.com",
  "openai.com",
  "adobe.com",
  "microsoft.com",
  "office.com",
  "apple.com",
  "tv.apple.com",
  "icloud.com",
  "hbomax.com",
  "max.com"
];

const URL_KEYWORDS = [
  "subscribe",
  "subscription",
  "member",
  "membership",
  "billing",
  "plans",
  "plan",
  "pricing",
  "checkout",
  "upgrade",
  "free-trial",
  "trial",
  "premium",
  "account",
  "auto-renew"
];

const CONTENT_KEYWORDS = [
  "subscribe",
  "subscription",
  "membership",
  "billed",
  "billing",
  "recurring",
  "renewal",
  "monthly",
  "annual",
  "yearly",
  "plan",
  "plans",
  "pricing",
  "checkout",
  "upgrade",
  "premium",
  "free trial",
  "trial",
  "start your trial",
  "manage subscription",
  "cancel anytime"
];

function isKnownSubscriptionDomain(hostname) {
  return KNOWN_SUBSCRIPTION_DOMAINS.some(
    (known) => hostname === known || hostname.endsWith(`.${known}`)
  );
}

function hasSubscriptionUrlHints(url) {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search).toLowerCase();
    return URL_KEYWORDS.some((kw) => path.includes(kw));
  } catch {
    return false;
  }
}

function hasSubscriptionContentHints() {
  const selectors = ["h1", "h2", "h3", "button", "a", "[role='button']"];
  const elements = document.querySelectorAll(selectors.join(","));

  let collected = "";
  for (const el of elements) {
    if (collected.length > 8000) break;
    const text = (el.innerText || el.textContent || "").trim();
    if (!text) continue;
    collected += " " + text.toLowerCase();
  }

  return CONTENT_KEYWORDS.some((kw) => collected.includes(kw.toLowerCase()));
}

function isLikelySubscriptionPage() {
  const hostname = window.location.hostname.toLowerCase();
  const url = window.location.href;

  if (isKnownSubscriptionDomain(hostname)) return true;
  if (hasSubscriptionUrlHints(url)) return true;

  return hasSubscriptionContentHints();
}

function showSubtrackrPopup() {
  if (hasShownSubtrackrPopup) return;
  hasShownSubtrackrPopup = true;

  if (document.getElementById("subtrackr-subscription-helper-root")) return;

  const root = document.createElement("div");
  root.id = "subtrackr-subscription-helper-root";

  root.innerHTML = `
    <div class="subtrackr-card" role="dialog" aria-live="polite" aria-label="SUBTRACKR reminder">
      <div class="subtrackr-header">
        <h2 class="subtrackr-title">Thinking of a new subscription?</h2>
        <button class="subtrackr-close-button" aria-label="Dismiss reminder">✕</button>
      </div>
      <div class="subtrackr-body">
        Make sure to log your subscription in <strong>SUBTRACKR</strong> so you can keep track of costs later.
      </div>
      <div class="subtrackr-actions">
        <button class="subtrackr-primary-button">
          Open SUBTRACKR dashboard
        </button>
        <span class="subtrackr-secondary-text">Opens in a new tab</span>
      </div>
    </div>
  `;

  const closeButton = root.querySelector(".subtrackr-close-button");
  const primaryButton = root.querySelector(".subtrackr-primary-button");

  closeButton?.addEventListener("click", () => {
    root.remove();
  });

  primaryButton?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_SUBTRACKR_DASHBOARD" }, () => {});
    root.remove();
  });

  document.documentElement.appendChild(root);
}

function runDetectionIfNeeded() {
  if (hasShownSubtrackrPopup) return;

  if (
    window.location.protocol === "chrome:" ||
    window.location.protocol === "chrome-extension:"
  ) {
    return;
  }

  if (isLikelySubscriptionPage()) {
    showSubtrackrPopup();
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(runDetectionIfNeeded, 300);
} else {
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(runDetectionIfNeeded, 300);
  });
}


//So that if the app opens up the extension does not open
const origin = window.location.origin;
  if (origin === "http://127.0.0.1:5501" || origin === "http://localhost:5501") {
    return;
  }

(function patchHistoryForSpaSupport() {
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  function handleUrlChange() {
    hasShownSubtrackrPopup = false;
    runDetectionIfNeeded();
  }

  history.pushState = function (...args) {
    const ret = origPushState.apply(this, args);
    handleUrlChange();
    return ret;
  };

  history.replaceState = function (...args) {
    const ret = origReplaceState.apply(this, args);
    handleUrlChange();
    return ret;
  };

  window.addEventListener("popstate", handleUrlChange);
})();

