document.addEventListener("DOMContentLoaded", () => {
    const popupView = document.getElementById("popup-view");
    const settingsView = document.getElementById("settings-view");
    const goToSettingsButton = document.getElementById("goToSettings");
    const backToPopupButton = document.getElementById("backToPopup");
    const pathToggle = document.getElementById("path-toggle");
    const hitboxToggle = document.getElementById("hitbox-toggle");
    const voiceToggle = document.getElementById("voice-toggle");

    // Status text elements
    const pathStatus = document.getElementById("path-status");
    const hitboxStatus = document.getElementById("hitbox-status");
    const voiceStatus = document.getElementById("voice-status");
    
    // Theme toggle elements
    const themeToggleBtn = document.getElementById("themeToggle");

    const showView = (view) => {
        popupView.style.display = view === "popup" ? "flex" : "none";
        settingsView.style.display = view === "settings" ? "flex" : "none";
    };

    goToSettingsButton.addEventListener("click", () => showView("settings"));
    backToPopupButton.addEventListener("click", () => showView("popup"));

    // --- Helper: update a status label ---
    function updateStatusLabel(statusEl, isOn) {
        statusEl.textContent = isOn ? "ON" : "OFF";
        if (isOn) {
            statusEl.classList.add("active");
        } else {
            statusEl.classList.remove("active");
        }
    }

    // --- Helper: check if any feature is on ---
    function isAnyFeatureOn() {
        return pathToggle.checked || hitboxToggle.checked || voiceToggle.checked;
    }

    // --- Helper: update system button to match feature state ---
    function syncSystemButton() {
        const masterBtn = document.getElementById("masterBtn");
        if (isAnyFeatureOn()) {
            masterBtn.textContent = "SYSTEM ON";
            masterBtn.classList.add("active");
        } else {
            masterBtn.textContent = "SYSTEM OFF";
            masterBtn.classList.remove("active");
        }
    }

    // --- Helper: save all feature states to storage ---
    function saveFeatureStates() {
        chrome.storage.local.set({
            pathToggleEnabled: pathToggle.checked,
            hitboxEnabled: hitboxToggle.checked,
            voiceEnabled: voiceToggle.checked
        });
    }

    // --- Load saved states ---
    chrome.storage.local.get(["pathToggleEnabled", "hitboxEnabled", "voiceEnabled"], (result) => {
        pathToggle.checked = Boolean(result.pathToggleEnabled);
        hitboxToggle.checked = Boolean(result.hitboxEnabled);
        voiceToggle.checked = Boolean(result.voiceEnabled);

        updateStatusLabel(pathStatus, pathToggle.checked);
        updateStatusLabel(hitboxStatus, hitboxToggle.checked);
        updateStatusLabel(voiceStatus, voiceToggle.checked);
        syncSystemButton();
    });

    // --- Feature toggle handlers ---
    pathToggle.addEventListener("change", () => {
        updateStatusLabel(pathStatus, pathToggle.checked);
        saveFeatureStates();
        syncSystemButton();
    });

    hitboxToggle.addEventListener("change", () => {
        updateStatusLabel(hitboxStatus, hitboxToggle.checked);
        saveFeatureStates();
        syncSystemButton();
    });

    voiceToggle.addEventListener("change", () => {
        updateStatusLabel(voiceStatus, voiceToggle.checked);
        saveFeatureStates();
        syncSystemButton();
    });

    // Theme Management
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.getElementById('themeText').textContent = 'Dark Mode';
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.getElementById('themeText').textContent = 'Light Mode';
        }
    };

    // Load saved theme
    chrome.storage.local.get(["theme"], (result) => {
        const savedTheme = result.theme || 'light';
        applyTheme(savedTheme);
    });

    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        chrome.storage.local.set({ theme: newTheme });
    });
    
    // --- Master Toggle Button ---
    const masterBtn = document.getElementById("masterBtn");

    masterBtn.addEventListener("click", () => {
        if (isAnyFeatureOn()) {
            // System is ON -> turn everything OFF, but save what was on
            chrome.storage.local.set({
                savedPathToggle: pathToggle.checked,
                savedHitboxToggle: hitboxToggle.checked,
                savedVoiceToggle: voiceToggle.checked
            });

            pathToggle.checked = false;
            hitboxToggle.checked = false;
            voiceToggle.checked = false;

            updateStatusLabel(pathStatus, false);
            updateStatusLabel(hitboxStatus, false);
            updateStatusLabel(voiceStatus, false);
            saveFeatureStates();
            syncSystemButton();
        } else {
            // System is OFF -> restore previously saved selections
            chrome.storage.local.get(["savedPathToggle", "savedHitboxToggle", "savedVoiceToggle"], (result) => {
                // If nothing was saved before, turn on hitbox and voice by default
                const restorePath = Boolean(result.savedPathToggle);
                const restoreHitbox = result.savedHitboxToggle !== undefined ? Boolean(result.savedHitboxToggle) : true;
                const restoreVoice = result.savedVoiceToggle !== undefined ? Boolean(result.savedVoiceToggle) : true;

                pathToggle.checked = restorePath;
                hitboxToggle.checked = restoreHitbox;
                voiceToggle.checked = restoreVoice;

                updateStatusLabel(pathStatus, restorePath);
                updateStatusLabel(hitboxStatus, restoreHitbox);
                updateStatusLabel(voiceStatus, restoreVoice);
                saveFeatureStates();
                syncSystemButton();
            });
        }
    });
});
