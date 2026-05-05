/**
 * Adaptive Click Assistance System
 * 
 * Features:
 * - Cursor Tracking: Measures cursor path and net displacement.
 * - Tremor Detection: Heuristic based on path distance vs. net displacement.
 * - Smart Hitbox Expansion: Expands clickable areas dynamically based on tremor severity.
 * - Nearest Target Detection: Finds the most likely target when the user clicks near an element.
 * - Click Override: Redirects missed clicks to the intended element.
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

    // Developer options
    DEBUG_MODE: true                 // Set to true to visualize expanded hitboxes
  };

  // --- State Variables ---
  let cursorHistory = [];
  let isProgrammaticClick = false;

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
    updateCursorHistory(event.clientX, event.clientY);

    if (CONFIG.DEBUG_MODE) {
      // Throttle debug drawing via requestAnimationFrame
      if (!window.__debugDrawing) {
        window.__debugDrawing = true;
        requestAnimationFrame(() => {
          drawDebugHitboxes(event.clientX, event.clientY, calculateStabilityScore());
          window.__debugDrawing = false;
        });
      }
    }
  }, { passive: true });

  // --- Visual Cursor Overlay ---
  // Shows a snapping "ghost cursor" near interactive elements

  document.documentElement.style.setProperty('cursor', 'none', 'important');

  function initVisualCursor() {
    const cursor = document.createElement('div');
    cursor.id = 'steadysync-cursor';
    Object.assign(cursor.style, {
      position: 'fixed',
      width: '16px',
      height: '16px',
      background: 'rgba(66, 133, 244, 0.8)',
      border: '2px solid white',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate(-50%, -50%) rotate(45deg)',
      transition: 'left 0.08s ease, top 0.08s ease',
      boxShadow: '0 0 6px rgba(0,0,0,0.3)',
      clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)'
    });
    document.body.appendChild(cursor);

    const style = document.createElement('style');
    style.textContent = '* { cursor: none !important; }';
    document.head.appendChild(style)

    document.addEventListener('mousemove', (e) => {
      const stabilityScore = calculateStabilityScore();
      const target = findNearestTarget(e.clientX, e.clientY, stabilityScore);

      if (target) {
        // Snap the visual cursor to the center of the nearest target
        const rect = target.getBoundingClientRect();
        const snapX = rect.left + rect.width / 2;
        const snapY = rect.top + rect.height / 2;

        // Blend between real position and snapped position based on tremor
        const blendX = e.clientX + (snapX - e.clientX) * stabilityScore * 0.6;
        const blendY = e.clientY + (snapY - e.clientY) * stabilityScore * 0.6;

        cursor.style.left = `${blendX}px`;
        cursor.style.top = `${blendY}px`;
        cursor.style.background = 'rgba(66, 133, 244, 0.85)';
      } else {
        // No nearby target — follow real cursor
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
        cursor.style.background = 'rgba(100, 100, 100, 0.5)';
      }
    }, { passive: true });
  }

  initVisualCursor();

  // Intercept clicks to apply snap logic
  document.addEventListener('click', (event) => {
    if (isProgrammaticClick) return; // Prevent infinite loops from our own synthetic clicks

    const stabilityScore = calculateStabilityScore();
    const target = findNearestTarget(event.clientX, event.clientY, stabilityScore);

    // If a target is found AND the user didn't natively click inside the target (or its children)
    if (target && !target.contains(event.target)) {
      // Prevent the original "missed" click from doing anything
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (CONFIG.DEBUG_MODE) {
        console.log(`[Adaptive Click] Redirected click.`);
        console.log(`  - Stability Score: ${stabilityScore.toFixed(2)}`);
        console.log(`  - Snapped to:`, target);
      }

      // Trigger click on the intended target
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
  function updateHUD(text, type) {
    if (!voiceHUD) voiceHUD = createVoiceHUD();
    const icons = { listening: '\u{1F3A4}', heard: '\u{1F4AC}', matched: '\u2705', command: '\u26A1', error: '\u26A0\uFE0F' };
    voiceHUD.textContent = `${icons[type] || '\u{1F3A4}'} ${text}`;
    voiceHUD.style.background = type === 'command' ? 'rgba(34,139,34,0.85)'
      : type === 'error' ? 'rgba(200,50,50,0.85)'
      : type === 'matched' ? 'rgba(54,125,138,0.85)'
      : 'rgba(0,0,0,0.75)';
    voiceHUD.style.opacity = '0.95';
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
      bestEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bestEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      bestEl.focus({ preventScroll: true });

      const rect = bestEl.getBoundingClientRect();
      const cursor = document.getElementById('steadysync-cursor');
      if (cursor) {
        cursor.style.transition = 'left 0.3s ease, top 0.3s ease';
        cursor.style.left = `${rect.left + rect.width / 2}px`;
        cursor.style.top = `${rect.top + rect.height / 2}px`;
        cursor.style.background = 'rgba(54, 125, 138, 0.85)';
      }

      updateHUD(`Matched: "${bestLabel}"`, 'matched');
      if (CONFIG.DEBUG_MODE) console.log(`[Voice] Matched "${cleanSpoken}" -> "${bestLabel}" (${bestScore.toFixed(2)})`);
      return true;
    }
    return false;
  }

  // --- Debounced hover: waits for user to finish speaking before matching ---
  let hoverDebounceTimer = null;
  function debouncedHoverMatch(spoken) {
    // Show what we're hearing in real-time
    updateHUD(`"${spoken}"`, 'heard');
    // Wait 800ms of silence before actually matching
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = setTimeout(() => {
      hoverBestMatch(spoken);
    }, 800);
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

    function extractCommand(transcript) {
      const words = normalizeText(transcript).split(/\s+/);
      // Only check the LAST word — prevents re-firing from accumulated transcripts
      const lastWord = words[words.length - 1];
      if (COMMANDS[lastWord]) return COMMANDS[lastWord];
      return null;
    }

    function extractButtonWords(transcript) {
      return normalizeText(transcript).split(/\s+/).filter(w => !COMMAND_WORDS.has(w)).join(' ');
    }

    // Cooldown to prevent double-fire but allow intentional repeats
    const cooldowns = {};
    function isOnCooldown(cmd) { return (Date.now() - (cooldowns[cmd] || 0)) < 1500; }
    function setCooldown(cmd) { cooldowns[cmd] = Date.now(); }

    // Track the transcript that last triggered a command, so accumulated
    // transcripts (e.g. "open" → "open videos") don't re-fire the old command
    let lastExecutedTranscript = '';

    function executeCommand(cmd) {
      if (isOnCooldown(cmd)) return;
      setCooldown(cmd);

      if (cmd === 'select') {
        if (voiceHoveredElement) {
          updateHUD(`Selected: "${getElementLabel(voiceHoveredElement)}"`, 'command');
          if (CONFIG.DEBUG_MODE) console.log('[Voice] SELECT:', voiceHoveredElement);
          isProgrammaticClick = true;
          voiceHoveredElement.click();
          isProgrammaticClick = false;
        } else {
          updateHUD('Say a button name first', 'error');
        }
      } else if (cmd === 'open') {
        updateHUD('Opening new tab...', 'command');
        chrome.runtime.sendMessage({ action: 'openNewTab' });
      } else if (cmd === 'close') {
        updateHUD('Closing tab...', 'command');
        chrome.runtime.sendMessage({ action: 'closeCurrentTab' });
      }
    }

    // --- KEY FIX: Debounce-based command execution ---
    // Don't rely on isFinal (broken on Mac). Instead, when we see a command
    // word stay stable for 350ms, execute it. This works on ALL platforms.
    let commandDebounceTimer = null;
    let lastSeenCommand = null;
    let lastTranscript = '';

    function processTranscript(transcript) {
      if (!transcript) return;

      const command = extractCommand(transcript);
      const buttonPart = extractButtonWords(transcript);

      if (command) {
        // If there's a command, match the button part immediately then execute
        clearTimeout(hoverDebounceTimer);
        if (buttonPart) hoverBestMatch(buttonPart);

        // Skip if this transcript is just an accumulation of one that already fired
        if (lastExecutedTranscript && transcript.startsWith(lastExecutedTranscript)) return;
        if (command === lastSeenCommand && transcript === lastTranscript) return;

        lastSeenCommand = command;
        lastTranscript = transcript;

        clearTimeout(commandDebounceTimer);
        commandDebounceTimer = setTimeout(() => {
          executeCommand(command);
          lastExecutedTranscript = transcript;
          lastSeenCommand = null;
          lastTranscript = '';
        }, 350);
      } else {
        // No command — debounce the hover match (wait for user to finish speaking)
        clearTimeout(commandDebounceTimer);
        lastSeenCommand = null;
        if (buttonPart) debouncedHoverMatch(buttonPart);
      }
    }

    recognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      const transcript = latest[0].transcript.trim().toLowerCase();

      if (latest.isFinal) {
        clearTimeout(commandDebounceTimer);
        const command = extractCommand(transcript);
        const buttonPart = extractButtonWords(transcript);
        if (buttonPart) hoverBestMatch(buttonPart);

        // Only execute if not already handled from a prior accumulated transcript
        if (command && !(lastExecutedTranscript && transcript.startsWith(lastExecutedTranscript))) {
          executeCommand(command);
          lastExecutedTranscript = transcript;
        } else if (!command) {
          hoverBestMatch(transcript);
        }

        updateHUD(`"${transcript}"`, 'heard');
        if (CONFIG.DEBUG_MODE) console.log(`[Voice] Final: "${transcript}"`);

        // Reset for next speech segment
        lastExecutedTranscript = '';
      } else {
        processTranscript(transcript);
        if (CONFIG.DEBUG_MODE) console.log(`[Voice] Interim: "${transcript}"`);
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
      try { activeRecognition.abort(); } catch (e) {}
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
  chrome.storage.local.get(['hitboxEnabled', 'voiceEnabled'], (result) => {
    if (result.hitboxEnabled) {
      enableHitbox();
    } else {
      disableHitbox();
    }

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

    if (changes.voiceEnabled) {
      if (changes.voiceEnabled.newValue) {
        enableVoice();
      } else {
        disableVoice();
      }
    }
  });
})();
