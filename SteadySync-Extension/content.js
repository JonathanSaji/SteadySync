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
      borderRadius: '50%',
      background: 'rgba(54, 125, 138, 0.8)',
      border: '2px solid white',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate(-50%, -50%)',
      transition: 'left 0.08s ease, top 0.08s ease',
      boxShadow: '0 0 6px rgba(0,0,0,0.3)'
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
        cursor.style.background = 'rgba(54, 125, 138, 0.85)';
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
  // --- Voice Hover ---

  function initVoiceHover() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[SteadySync] SpeechRecognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;       // Keep listening
    recognition.interimResults = true;   // Fire events as you speak, not just on silence
    recognition.lang = 'en-US';

    let lastSpoken = '';

    recognition.onresult = (event) => {
      // pasted in from FluencySync
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim().toLowerCase();

      if (transcript === lastSpoken) return;
      lastSpoken = transcript;

      if (CONFIG.DEBUG_MODE) {
        console.log(`[Voice Hover] Heard: "${transcript}"`);
      }

      hoverBestMatch(transcript);
    };

    recognition.onerror = (e) => {
      // 'no-speech' fires often and is harmless — ignore it
      if (e.error !== 'no-speech') {
        console.warn('[SteadySync Voice] Error:', e.error);
      }
    };

    // Auto-restart if recognition stops (e.g. timeout)
    recognition.onend = () => recognition.start();

    recognition.start();
    console.log("[SteadySync] Voice hover active.");
  }

  /**
   * Scores how closely a button label matches the spoken phrase.
   * Returns 0–1 (1 = perfect match).
   */
  function matchScore(spoken, label) {
    if (!label) return 0;
    const a = spoken.toLowerCase();
    const b = label.toLowerCase();
    if (b === a) return 1;
    if (b.includes(a) || a.includes(b)) return 0.8;

    // Count shared words
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = b.split(/\s+/);
    const shared = wordsB.filter(w => wordsA.has(w)).length;
    return shared / Math.max(wordsA.size, wordsB.length);
  }


  //Finds the element whose label best matches the spoken text and hovers it.

  function hoverBestMatch(spoken) {
    const elements = getClickableElements();
    let bestEl = null;
    let bestScore = 0.4;

    for (const el of elements) {
      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.innerText ||
        el.value ||
        ''
      ).trim();

      const score = matchScore(spoken, label);
      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    if (bestEl) {
      bestEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bestEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      bestEl.focus({ preventScroll: true });

      // Move the ghost cursor to the center of the matched button
      const rect = bestEl.getBoundingClientRect();
      const cursor = document.getElementById('steadysync-cursor');
      if (cursor) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        cursor.style.transition = 'left 0.3s ease, top 0.3s ease';
        cursor.style.left = `${centerX}px`;
        cursor.style.top = `${centerY}px`;
        cursor.style.background = 'rgba(54, 125, 138, 0.85)';
      }

      // Wait for the cursor animation to finish, then click
      setTimeout(() => {
        isProgrammaticClick = true;
        bestEl.click();
        isProgrammaticClick = false;
      }, 500);


      if (CONFIG.DEBUG_MODE) {
        console.log(`[Voice Hover] Matched "${spoken}" → `, bestEl, `(score: ${bestScore.toFixed(2)})`);
      }
    }
  }

  //starts it allowing the user to hover over buttons by saying their name - jon
  initVoiceHover();
})();
