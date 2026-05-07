/**
 * Adaptive Click Assistance System
 * 
 * Features:
 * - Cursor Tracking: Measures cursor path and net displacement.
 * - Tremor Detection: Heuristic based on path distance vs. net displacement.
 * - Smart Hitbox Expansion: Expands clickable areas dynamically based on tremor severity.
 * - Nearest Target Detection: Finds the most likely target when the user clicks near an element.
 * - Click Override: Redirects missed clicks to the intended element.
 * - Steady Mouse: Tremor Filtering via Lerp
 * - Voice Control Engine: Element matching and HUD
 */

(function () {
  // --- Configuration ---
  const CONFIG = {
    // Tuning parameters
    TRACKING_DURATION_MS: 500,       // Duration of cursor history to keep (milliseconds)
    MIN_MOVEMENT_PX: 20,             // Minimum movement needed to evaluate tremor
    BASE_EXPANSION_PX: 10,           // Default invisible padding around clickable elements (px)
    MAX_TREMOR_EXPANSION_PX: 40,     // Extra padding added based on severity of tremor (px)
    MAX_SNAP_DISTANCE_PX: 100,       // Absolute max distance a click can snap (px)

    SMOOTHING_FACTOR: 0.1,          // Steady Mouse smoothing (Lower = smoother but more lag)

    // Developer options
    DEBUG_MODE: true                 // Set to true to visualize expanded hitboxes
  };

  // --- State Variables ---
  let cursorHistory = [];
  let isProgrammaticClick = false;
  let snapEnabled = false;
  let steadyMouseEnabled = false;

  // Steady Mouse Tracking
  let realMouse = { x: 0, y: 0 };
  let virtualMouse = { x: 0, y: 0 };



  // --- Storage Helpers ---
  function setSnapEnabled(enabled) {
    snapEnabled = Boolean(enabled);
  }

  function loadSnapEnabled() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['snapEnabled'], (result) => {
        setSnapEnabled(result.snapEnabled);
      });
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.snapEnabled) {
        setSnapEnabled(changes.snapEnabled.newValue);
      }
    });
  }

  loadSnapEnabled();


  // --- Helpers ---

  /**
   * Calculates Euclidean distance between two points.
   */
  function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Retrieves all interactive elements on the page.
   * Can be expanded with more selectors if needed.
   */
  function getClickableElements() {
    const selectors = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[tabindex]:not([tabindex="-1"])'
    ];
    return Array.from(document.querySelectorAll(selectors.join(', ')));
  }

  // --- Core Logic ---

  /**
   * Updates cursor history and prunes old data.
   */
  function updateCursorHistory(x, y) {
    const now = performance.now();
    cursorHistory.push({ x, y, time: now });

    // Keep only points within the tracking duration
    cursorHistory = cursorHistory.filter(point => now - point.time <= CONFIG.TRACKING_DURATION_MS);
  }

  /**
   * Evaluates tremor severity.
   * A high path distance but low net displacement indicates shaking.
   * Returns a stability score: 0 (stable) to 1 (very shaky).
   */
  function calculateStabilityScore() {
    if (cursorHistory.length < 2) return 0;

    let pathDistance = 0;
    for (let i = 1; i < cursorHistory.length; i++) {
      const prev = cursorHistory[i - 1];
      const curr = cursorHistory[i];
      pathDistance += getDistance(prev.x, prev.y, curr.x, curr.y);
    }

    const first = cursorHistory[0];
    const last = cursorHistory[cursorHistory.length - 1];
    const netDisplacement = getDistance(first.x, first.y, last.x, last.y);

    if (pathDistance < CONFIG.MIN_MOVEMENT_PX) return 0;


    if (pathDistance < CONFIG.MIN_MOVEMENT_PX) {
      return 0; // Not enough movement to confidently detect tremor
    }

    // Score formula: 1 - (net displacement / path distance)
    // Straight line movement ≈ 0. Shaky/circular movement ≈ 1.
    const score = 1 - (netDisplacement / pathDistance);
    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1

  }

  /**
   * Finds the best target element near the given coordinates.
   */
  function findNearestTarget(mouseX, mouseY, stabilityScore) {
    const elements = getClickableElements();
    let nearestElement = null;
    let minDistance = Infinity;

    // Calculate dynamic padding based on how shaky the cursor is
    const currentExpansion = CONFIG.BASE_EXPANSION_PX + (stabilityScore * CONFIG.MAX_TREMOR_EXPANSION_PX);

    for (const el of elements) {
      const rect = el.getBoundingClientRect();

      // Ignore hidden or 0-size elements
      if (rect.width === 0 || rect.height === 0) continue;

      // Calculate effective hitbox with expansion
      const expandedRect = {
        left: rect.left - currentExpansion,
        right: rect.right + currentExpansion,
        top: rect.top - currentExpansion,
        bottom: rect.bottom + currentExpansion,
      };

      // Check if cursor falls within the effective hitbox
      const isInsideExpanded = (
        mouseX >= expandedRect.left &&
        mouseX <= expandedRect.right &&
        mouseY >= expandedRect.top &&
        mouseY <= expandedRect.bottom
      );

      if (isInsideExpanded) {
        // Find distance to the center to pick the *best* element if overlapping
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dist = getDistance(mouseX, mouseY, centerX, centerY);

        if (dist < minDistance && dist <= CONFIG.MAX_SNAP_DISTANCE_PX) {
          minDistance = dist;
          nearestElement = el;
        }
      }
    }

    return nearestElement;
  }

  // --- Event Listeners ---

  // Track cursor movement
  document.addEventListener('mousemove', (event) => {
    // Track the raw, shaky input for the Steady Mouse loop
    realMouse.x = event.clientX;
    realMouse.y = event.clientY;

    updateCursorHistory(event.clientX, event.clientY);

    if (CONFIG.DEBUG_MODE) {
      // Throttle debug drawing via requestAnimationFrame
      if (!window.__debugDrawing) {
        window.__debugDrawing = true;
        requestAnimationFrame(() => {
          drawDebugHitboxes(virtualMouse.x, virtualMouse.y, calculateStabilityScore());
          window.__debugDrawing = false;
        });
      }
    }
  }, { passive: true });

  // --- Visual Cursor Overlay ---
  // Shows a snapping "ghost cursor" near interactive elements

  function initVisualCursor() {
    const cursor = document.createElement('div');
    cursor.id = 'steadysync-cursor';
    Object.assign(cursor.style, {
      position: 'fixed',
      width: '16px',
      height: '16px',
      background: 'rgb(255, 255, 255)',
      border: 'rgba(0, 0, 0, 0.8) solid 2px',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate(-50%, -50%) rotate(45deg)',
      transition: 'background 0.2s ease',
      boxShadow: '0 0 6px rgba(0,0,0,0.3)',
      clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)'
    });
    document.body.appendChild(cursor);

    // Replace the style logic in initVisualCursor()
    const style = document.createElement('style');
    // This creates a tiny 4px black dot as the "real" cursor
    style.textContent = `
      * { 
        cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="2" fill="black" stroke="white" stroke-width="1"/></svg>') 4 4, auto !important; 
      }
    `;
    document.head.appendChild(style);

    // REMOVED: The empty duplicate function renderLoop(){} was here causing the bug.

    // Correct Steady Mouse Smoothing Loop
    function renderLoop() {
      const stabilityScore = calculateStabilityScore();

      // Find potential targets based on where the SMOOTH cursor is
      const target = snapEnabled ? findNearestTarget(virtualMouse.x, virtualMouse.y, stabilityScore) : null;

      // RELEASE MECHANISM: Check if the REAL mouse has moved too far away from the snapped target
      let shouldSnap = false;
      if ((snapEnabled && target) || voiceHoveredElement) {
        const activeTarget = voiceHoveredElement || target;
        const rect = activeTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        if (voiceHoveredElement) {
          const moveFromAnchor = voiceLockAnchor
            ? getDistance(realMouse.x, realMouse.y, voiceLockAnchor.x, voiceLockAnchor.y)
            : 0;

          if (moveFromAnchor > 90) {
            // User intentionally moved after voice lock: release.
            voiceHoveredElement = null;
            voiceLockAnchor = null;
          } else {
            shouldSnap = true;
          }
        } else {
          // Snap mode release mechanism (non-voice target)
          const distanceToReal = getDistance(realMouse.x, realMouse.y, centerX, centerY);
          if (distanceToReal < 120) {
            shouldSnap = true;
          }
        }

        if (shouldSnap) {
          // Smoothly pull toward the center
          virtualMouse.x += (centerX - virtualMouse.x) * 0.25;
          virtualMouse.y += (centerY - virtualMouse.y) * 0.25;
          cursor.style.border = 'rgb(227, 14, 14) solid 3px';
        }
      }

      // If we aren't snapping (or we "broke" the snap), follow the real mouse normally
      if (!shouldSnap) {
        if (steadyMouseEnabled) {
          // Smooth lerp: virtual cursor lags behind real cursor to filter tremor
          const adaptiveFactor = CONFIG.SMOOTHING_FACTOR - (stabilityScore * 0.1);
          const factor = Math.max(0.04, adaptiveFactor);
          virtualMouse.x += (realMouse.x - virtualMouse.x) * factor;
          virtualMouse.y += (realMouse.y - virtualMouse.y) * factor;
        } else {
          // Steady Mouse OFF: virtual cursor tracks real cursor 1:1
          virtualMouse.x = realMouse.x;
          virtualMouse.y = realMouse.y;
        }
        cursor.style.border = 'rgb(0, 0, 0) solid 2px';
      }

      // Apply coordinates to the visual element
      cursor.style.left = `${virtualMouse.x}px`;
      cursor.style.top = `${virtualMouse.y}px`;

      requestAnimationFrame(renderLoop);
    }

    // Start the loop
    requestAnimationFrame(renderLoop);
  }

  initVisualCursor();

  // Intercept clicks to apply snap logic
  document.addEventListener('click', (event) => {
    if (isProgrammaticClick) return; // Prevent infinite loops from our own synthetic clicks
    if (!snapEnabled) return;

    // Find target at VIRTUAL cursor position (where the user sees the cursor)
    const stabilityScore = calculateStabilityScore();
    const target = findNearestTarget(virtualMouse.x, virtualMouse.y, stabilityScore);

    if (target) {
      // Prevent the original click from doing anything
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (CONFIG.DEBUG_MODE) {
        console.log(`[Adaptive Click] Click redirected to virtual cursor position.`);
        console.log(`  - Real mouse: (${event.clientX}, ${event.clientY})`);
        console.log(`  - Virtual cursor: (${virtualMouse.x.toFixed(0)}, ${virtualMouse.y.toFixed(0)})`);
        console.log(`  - Stability Score: ${stabilityScore.toFixed(2)}`);
        console.log(`  - Target:`, target);
      }

      // Trigger click on the target at virtual cursor position
      isProgrammaticClick = true;
      target.click();
      isProgrammaticClick = false;
    }
  }, { capture: true });

  // --- Debug Visuals ---

  let debugBox = null;
  function drawDebugHitboxes(mouseX, mouseY, stabilityScore) {
    const target = findNearestTarget(mouseX, mouseY, stabilityScore);

    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.style.position = 'fixed';
      debugBox.style.pointerEvents = 'none';
      debugBox.style.border = '2px dashed rgba(255, 0, 0, 0.6)';
      debugBox.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
      debugBox.style.zIndex = '2147483647'; // Max z-index
      debugBox.style.transition = 'all 0.1s ease-out';
      document.body.appendChild(debugBox);
    }

    if (target) {
      const rect = target.getBoundingClientRect();
      const expansion = CONFIG.BASE_EXPANSION_PX + (stabilityScore * CONFIG.MAX_TREMOR_EXPANSION_PX);

      debugBox.style.display = 'block';
      debugBox.style.left = `${rect.left - expansion}px`;
      debugBox.style.top = `${rect.top - expansion}px`;
      debugBox.style.width = `${rect.width + expansion * 2}px`;
      debugBox.style.height = `${rect.height + expansion * 2}px`;
    } else {
      debugBox.style.display = 'none';
    }
  }

  console.log("Adaptive Click Assistance System loaded.");

  //voice detection hovering thingy - jon
  // --- Voice Control Engine (v3 — universal Mac/PC) ---

  let voiceHoveredElement = null;
  let voiceLockAnchor = null;
  let lastVoiceMatchedElement = null;

  // --- Voice Feedback HUD ---
  function createVoiceHUD() {
    const hud = document.createElement('div');
    hud.id = 'steadysync-voice-hud';
    Object.assign(hud.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      padding: '10px 18px', borderRadius: '24px',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)', color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px',
      fontWeight: '500', zIndex: '2147483647', pointerEvents: 'none',
      transition: 'opacity 0.3s ease', opacity: '0.9',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: '320px'
    });
    hud.textContent = '\u{1F3A4} Voice ready';
    document.body.appendChild(hud);
    return hud;
  }

  let voiceHUD = null, hudFadeTimer = null;
  let hudStickyUntil = 0;
  function updateHUD(text, type) {
    if (!voiceHUD) voiceHUD = createVoiceHUD();
    const now = Date.now();
    // Keep success/error states visible briefly so rapid "heard" updates
    // don't immediately overwrite important feedback in the HUD.
    if (type === 'heard' && now < hudStickyUntil) return;
    const icons = { listening: '\u{1F3A4}', heard: '\u{1F4AC}', matched: '\u2705', command: '\u26A1', error: '\u26A0\uFE0F' };
    voiceHUD.textContent = `${icons[type] || '\u{1F3A4}'} ${text}`;
    voiceHUD.style.background = type === 'command' ? 'rgba(34,139,34,0.85)'
      : type === 'error' ? 'rgba(200,50,50,0.85)'
        : type === 'matched' ? 'rgba(54,125,138,0.85)'
          : 'rgba(0,0,0,0.75)';
    voiceHUD.style.opacity = '0.95';
    if (type === 'matched' || type === 'command' || type === 'error') {
      hudStickyUntil = now + 1100;
    }
    clearTimeout(hudFadeTimer);
    hudFadeTimer = setTimeout(() => {
      if (voiceHUD) { voiceHUD.style.opacity = '0.4'; voiceHUD.textContent = '\u{1F3A4} Listening...'; voiceHUD.style.background = 'rgba(0,0,0,0.75)'; }
    }, 2500);
  }

  // --- Text helpers ---
  function normalizeText(text) {
    return (text || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Gets the SHORT, readable label for an element.
   * Prefers aria-label/title, then checks direct text and child headings.
   * Caps at 80 chars to support longer link text (like search results).
   */
  function getElementLabel(el) {
    const MAX_LEN = 80;

    // Prefer explicit labels first
    const explicit = el.getAttribute('aria-label') || el.getAttribute('title');
    if (explicit && explicit.trim()) return explicit.trim().substring(0, MAX_LEN);

    // For inputs, use value or placeholder
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el.value || el.placeholder || '').trim().substring(0, MAX_LEN);
    }

    // For links: check for heading child (Google search results have <h3> inside <a>)
    if (el.tagName === 'A') {
      const heading = el.querySelector('h3, h2, h4, [role="heading"]');
      if (heading) {
        const hText = heading.textContent.trim();
        if (hText && hText.length <= MAX_LEN) return hText;
      }
    }

    // Use DIRECT text content: only text nodes that are direct children
    let directText = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        directText += node.textContent;
      }
    }
    directText = directText.trim();
    if (directText && directText.length <= MAX_LEN) return directText;

    // Fallback: use full textContent but only if reasonably short
    const full = (el.textContent || '').trim();
    if (full.length <= MAX_LEN) return full;

    // Too long — skip
    return '';
  }

  // --- Matching ---
  const COMMAND_WORDS = new Set(['select', 'click', 'open', 'close', 'shut']);

  function matchScore(spoken, label) {
    if (!label) return 0;
    const a = normalizeText(spoken);
    const b = normalizeText(label);
    if (!a || !b) return 0;
    if (a === b) return 1.0;

    // Check if spoken words contain the full label as a substring
    if (b.includes(a)) return 0.9;
    if (a.includes(b)) return 0.85;

    // Word-level: check if any spoken word exactly matches a label word
    const spokenWords = a.split(/\s+/).filter(w => !COMMAND_WORDS.has(w));
    const labelWords = b.split(/\s+/);

    if (spokenWords.length === 0 || labelWords.length === 0) return 0;

    // Single-word label: if ANY spoken word matches it exactly, strong match
    if (labelWords.length === 1) {
      for (const w of spokenWords) {
        if (w === labelWords[0]) return 0.95;
        // Check if very close (off by 1-2 chars) for speech recognition errors
        if (w.length > 3 && labelWords[0].length > 3) {
          if (w.startsWith(labelWords[0].substring(0, 3)) || labelWords[0].startsWith(w.substring(0, 3))) return 0.5;
        }
      }
    }

    // Multi-word: count how many label words appear in spoken words
    const spokenSet = new Set(spokenWords);
    const sharedCount = labelWords.filter(w => spokenSet.has(w)).length;
    if (sharedCount === 0) return 0;

    return (sharedCount / labelWords.length) * 0.85;
  }

  function hoverBestMatch(spoken) {
    const elements = getClickableElements();
    let bestEl = null, bestScore = 0.3, bestLabel = '';

    // Strip command words from spoken text
    const cleanSpoken = normalizeText(spoken).split(/\s+/).filter(w => !COMMAND_WORDS.has(w)).join(' ');
    if (!cleanSpoken) return false;

    for (const el of elements) {
      const label = getElementLabel(el);
      if (!label) continue;

      // Skip invisible elements
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      const score = matchScore(cleanSpoken, label);
      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
        bestLabel = label;
      }
    }

    if (bestEl) {
      voiceHoveredElement = bestEl;
      voiceLockAnchor = { x: realMouse.x, y: realMouse.y };
      bestEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bestEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      bestEl.focus({ preventScroll: true });

      // Do not teleport the virtual cursor here.
      // The render loop already eases toward voiceHoveredElement, which creates
      // smooth motion that is easier to follow visually.

      updateHUD(`Matched: "${bestLabel}"`, 'matched');
      if (CONFIG.DEBUG_MODE) console.log(`[Voice] Matched "${cleanSpoken}" -> "${bestLabel}" (${bestScore.toFixed(2)})`);
      return true;
    }
    return false;
  }

  // --- Voice Recognition Engine ---
  function initVoiceHover() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[SteadySync] SpeechRecognition not supported.");
      updateHUD('Speech not supported', 'error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    // Command map
    const COMMANDS = { 'select': 'select', 'click': 'select', 'open': 'open', 'close': 'close', 'shut': 'close' };

    function levenshteinDistance(a, b) {
      const m = a.length;
      const n = b.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }
      return dp[m][n];
    }

    function extractCommand(transcript) {
      const words = normalizeText(transcript).split(/\s+/);
      // Only check the LAST word — prevents re-firing from accumulated transcripts
      const lastWord = words[words.length - 1];
      if (COMMANDS[lastWord]) return COMMANDS[lastWord];
      // Tolerate small speech-recognition errors for "select" (e.g., "selcte").
      if (lastWord && lastWord.length >= 4 && levenshteinDistance(lastWord, 'select') <= 2) {
        return 'select';
      }
      return null;
    }

    function extractButtonWords(transcript) {
      return normalizeText(transcript).split(/\s+/).filter(w => !COMMAND_WORDS.has(w)).join(' ');
    }

    // Cooldown to prevent double-fire but allow intentional repeats
    const cooldowns = {};
    function isOnCooldown(cmd) { return (Date.now() - (cooldowns[cmd] || 0)) < 1500; }
    function setCooldown(cmd) { cooldowns[cmd] = Date.now(); }

    function executeCommand(cmd) {
      if (isOnCooldown(cmd)) return;

      if (cmd === 'select') {
        const target = voiceHoveredElement || lastVoiceMatchedElement;
        if (target) {
          setCooldown(cmd);
          updateHUD(`Selected: "${getElementLabel(target)}"`, 'command');
          if (CONFIG.DEBUG_MODE) console.log('[Voice] SELECT:', target);
          isProgrammaticClick = true;
          target.click();
          isProgrammaticClick = false;
          // One-time use: after select, clear saved match immediately.
          voiceHoveredElement = null;
          voiceLockAnchor = null;
          lastVoiceMatchedElement = null;
        } else {
          updateHUD('Say a button name first', 'error');
        }
      } else if (cmd === 'open') {
        setCooldown(cmd);
        updateHUD('Opening new tab...', 'command');
        chrome.runtime.sendMessage({ action: 'openNewTab' });
      } else if (cmd === 'close') {
        setCooldown(cmd);
        updateHUD('Closing tab...', 'command');
        chrome.runtime.sendMessage({ action: 'closeCurrentTab' });
      }
    }

    const NON_COMMAND_MATCH_DELAY_MS = 600;
    let nonCommandMatchTimer = null;
    let pendingPhraseWords = '';
    let previousRecognizerTranscript = '';

    function scheduleLatestPhraseMatch() {
      clearTimeout(nonCommandMatchTimer);
      nonCommandMatchTimer = setTimeout(() => {
        // Clear current live lock first so stale matches are removed.
        voiceHoveredElement = null;
        voiceLockAnchor = null;
        if (!pendingPhraseWords) return;

        const matched = hoverBestMatch(pendingPhraseWords);
        if (matched) {
          // Keep only the most recent matched target for future "select".
          lastVoiceMatchedElement = voiceHoveredElement;
        } else {
          updateHUD('Listening...', 'listening');
        }
        // Clear phrase memory after each completed sentence match.
        pendingPhraseWords = '';
      }, NON_COMMAND_MATCH_DELAY_MS);
    }

    function processTranscriptChunk(transcriptChunk) {
      if (!transcriptChunk) return;

      const command = extractCommand(transcriptChunk);
      const buttonPart = extractButtonWords(transcriptChunk);

      if (command) {
        clearTimeout(nonCommandMatchTimer);
        pendingPhraseWords = '';
        updateHUD(`"${transcriptChunk}"`, 'heard');
        // Use only command-local button words, then execute immediately.
        if (buttonPart) {
          const matched = hoverBestMatch(buttonPart);
          if (matched) {
            lastVoiceMatchedElement = voiceHoveredElement;
          }
        }
        executeCommand(command);
      } else {
        // No command: keep collecting words until a pause, then match once.
        if (!buttonPart) return;
        pendingPhraseWords = pendingPhraseWords
          ? `${pendingPhraseWords} ${buttonPart}`
          : buttonPart;
        pendingPhraseWords = normalizeText(pendingPhraseWords);
        updateHUD(`"${pendingPhraseWords}"`, 'heard');
        scheduleLatestPhraseMatch();
      }
    }

    recognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      const transcript = normalizeText(latest[0].transcript || '');
      if (!transcript) return;

      // SpeechRecognition often returns cumulative text in each result. Convert it
      // to a "new words only" chunk so old words never re-appear in matching/HUD.
      let transcriptChunk = '';
      if (!previousRecognizerTranscript) {
        transcriptChunk = transcript;
      } else if (transcript.startsWith(previousRecognizerTranscript)) {
        transcriptChunk = transcript.slice(previousRecognizerTranscript.length).trim();
      } else if (!previousRecognizerTranscript.startsWith(transcript)) {
        // Recognizer may reset or branch; treat this as a fresh chunk.
        transcriptChunk = transcript;
      }

      if (latest.isFinal) {
        previousRecognizerTranscript = '';
      } else {
        previousRecognizerTranscript = transcript;
      }

      if (!transcriptChunk) return;
      processTranscriptChunk(transcriptChunk);
      if (CONFIG.DEBUG_MODE) {
        console.log(`[Voice] ${latest.isFinal ? 'Final' : 'Interim'} chunk: "${transcriptChunk}"`);
      }
    };

    // --- Robust restart ---
    let restartAttempts = 0;

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        updateHUD('Mic blocked — check permissions', 'error');
        console.error('[SteadySync] Mic permission denied. Check address bar lock icon.');
        return;
      }
      if (e.error === 'audio-capture') {
        updateHUD('No microphone found', 'error');
        return;
      }
      console.warn('[SteadySync Voice] Error:', e.error);
    };

    recognition.onend = () => {
      if (!voiceControlActive) return; // Don't restart if voice was turned off
      if (document.visibilityState !== 'visible') return; // Don't restart if tab is hidden
      const delay = Math.min(100 * Math.pow(2, restartAttempts), 5000);
      setTimeout(() => {
        if (!voiceControlActive) return;
        if (document.visibilityState !== 'visible') return;
        try { recognition.start(); restartAttempts = Math.max(0, restartAttempts - 1); }
        catch (err) { restartAttempts++; }
      }, delay);
    };

    recognition.onstart = () => {
      restartAttempts = 0;
      updateHUD('Listening...', 'listening');
    };

    try {
      recognition.start();
      console.log("[SteadySync] Voice control active.");
    } catch (err) {
      console.error('[SteadySync Voice] Failed to start:', err.message);
      updateHUD('Voice failed to start', 'error');
    }

    return recognition;
  }

  // --- Feature enable/disable via storage ---
  let voiceControlActive = false;   // User's preference (toggle in popup)
  let activeRecognition = null;
  let voiceRunning = false;         // Is recognition actually running right now?

  /** Start recognition only if user wants voice AND this tab is visible. */
  function startRecognitionIfVisible() {
    if (!voiceControlActive) return;
    if (document.visibilityState !== 'visible') return;
    if (voiceRunning) return; // Already running
    activeRecognition = initVoiceHover();
    voiceRunning = true;
    console.log('[SteadySync] Voice started (tab visible).');
  }

  /** Stop recognition (tab hidden or user disabled). */
  function stopRecognition() {
    voiceRunning = false;
    if (activeRecognition) {
      try { activeRecognition.abort(); } catch (e) { }
      activeRecognition = null;
    }
  }

  function enableVoice() {
    if (voiceControlActive) return;
    voiceControlActive = true;
    startRecognitionIfVisible();
    console.log('[SteadySync] Voice control enabled.');
  }

  function disableVoice() {
    voiceControlActive = false;
    voiceLockAnchor = null;
    voiceHoveredElement = null;
    lastVoiceMatchedElement = null;
    stopRecognition();
    // Hide HUD
    const hud = document.getElementById('steadysync-voice-hud');
    if (hud) hud.style.display = 'none';
    console.log('[SteadySync] Voice control disabled.');
  }

  // --- Tab visibility: only hold mic on the active tab ---
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startRecognitionIfVisible();
    } else {
      if (voiceRunning) {
        stopRecognition();
        console.log('[SteadySync] Voice paused (tab hidden).');
      }
    }
  });

  function enableHitbox() {
    CONFIG.DEBUG_MODE = true;
    if (debugBox) debugBox.style.display = '';
    console.log('[SteadySync] Hitbox display enabled.');
  }

  function disableHitbox() {
    CONFIG.DEBUG_MODE = false;
    if (debugBox) debugBox.style.display = 'none';
    console.log('[SteadySync] Hitbox display disabled.');
  }

  // Check storage on load and init features accordingly
  chrome.storage.local.get(['hitboxEnabled', 'voiceEnabled', 'snapEnabled', 'pathToggleEnabled'], (result) => {
    if (result.hitboxEnabled) {
      enableHitbox();
    } else {
      disableHitbox();
    }

    if (result.snapEnabled) {
      setSnapEnabled(true);
    }

    steadyMouseEnabled = Boolean(result.pathToggleEnabled);
    console.log('[SteadySync] Steady Mouse:', steadyMouseEnabled ? 'ON' : 'OFF');

    if (result.voiceEnabled) {
      enableVoice();
    }
  });

  // Listen for setting changes from the popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.hitboxEnabled) {
      if (changes.hitboxEnabled.newValue) {
        enableHitbox();
      } else {
        disableHitbox();
      }
    }

    if (changes.snapEnabled) {
      setSnapEnabled(changes.snapEnabled.newValue);
    }

    if (changes.pathToggleEnabled) {
      steadyMouseEnabled = Boolean(changes.pathToggleEnabled.newValue);
      console.log('[SteadySync] Steady Mouse:', steadyMouseEnabled ? 'ON' : 'OFF');
    }

    if (changes.voiceEnabled) {
      if (changes.voiceEnabled.newValue) {
        enableVoice();
      } else {
        disableVoice();
      }
    }
  });
})();
