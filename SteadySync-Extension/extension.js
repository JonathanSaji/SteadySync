document.addEventListener("DOMContentLoaded", () => {
    const loginView = document.getElementById("login-view");
    const popupView = document.getElementById("popup-view");
    const settingsView = document.getElementById("settings-view");
    const goToSettingsButton = document.getElementById("goToSettings");
    const backToPopupButton = document.getElementById("backToPopup");
    const openWebsiteLoginButton = document.getElementById("openWebsiteLogin");
    const openWebsiteBtn = document.getElementById("openWebsiteBtn");

    const pathToggle = document.getElementById("path-toggle");
    const hitboxToggle = document.getElementById("hitbox-toggle");
    const snapToggle = document.getElementById("snap-toggle");
    const voiceToggle = document.getElementById("voice-toggle");

    // Status text elements
    const pathStatus = document.getElementById("path-status");
    const hitboxStatus = document.getElementById("hitbox-status");
    const snapStatus = document.getElementById("snap-status");
    const voiceStatus = document.getElementById("voice-status");
    
    // Theme toggle elements
    const themeToggleBtn = document.getElementById("themeToggle");

    let currentUser = null;

    const showView = (view) => {
        loginView.style.display = view === "login" ? "flex" : "none";
        popupView.style.display = view === "popup" ? "flex" : "none";
        settingsView.style.display = view === "settings" ? "flex" : "none";
    };

    if (openWebsiteLoginButton) {
        openWebsiteLoginButton.addEventListener("click", () => {
            chrome.tabs.create({ url: "http://127.0.0.1:5500/Website/index.html" });
        });
    }

    if (openWebsiteBtn) {
        openWebsiteBtn.addEventListener("click", () => {
            chrome.tabs.create({ url: "http://127.0.0.1:5500/Website/index.html" });
        });
    }

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
        return pathToggle.checked || hitboxToggle.checked || snapToggle.checked || voiceToggle.checked;
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
        const updates = {
            pathToggleEnabled: pathToggle.checked,
            hitboxEnabled: hitboxToggle.checked,
            snapEnabled: snapToggle.checked,
            voiceEnabled: voiceToggle.checked
        };
        chrome.storage.local.set(updates);
    }

    // --- Load saved states ---
    chrome.storage.local.get(["currentUser", "pathToggleEnabled", "hitboxEnabled", "snapEnabled", "voiceEnabled", "theme"], (result) => {
        currentUser = result.currentUser;
        if (!currentUser) {
            showView("login");
            // Force dark mode for login wall
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeToggleBtn) themeToggleBtn.style.display = 'none';
            return;
        }
        
        showView("popup");
        if (themeToggleBtn) themeToggleBtn.style.display = 'flex';
        const savedTheme = result.theme || 'dark';
        applyTheme(savedTheme);

        pathToggle.checked = Boolean(result.pathToggleEnabled);
        hitboxToggle.checked = Boolean(result.hitboxEnabled);
        snapToggle.checked = Boolean(result.snapEnabled);
        voiceToggle.checked = Boolean(result.voiceEnabled);

        updateStatusLabel(pathStatus, pathToggle.checked);
        updateStatusLabel(hitboxStatus, hitboxToggle.checked);
        updateStatusLabel(snapStatus, snapToggle.checked);
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

    snapToggle.addEventListener("change", () => {
        // If snap is turned OFF while voice is ON, also turn off voice
        if (!snapToggle.checked && voiceToggle.checked) {
            voiceToggle.checked = false;
            updateStatusLabel(voiceStatus, false);
        }
        updateStatusLabel(snapStatus, snapToggle.checked);
        saveFeatureStates();
        syncSystemButton();
    });

    voiceToggle.addEventListener("change", () => {
        // Voice ON → automatically enable Snap too
        if (voiceToggle.checked && !snapToggle.checked) {
            snapToggle.checked = true;
            updateStatusLabel(snapStatus, true);
        }
        updateStatusLabel(voiceStatus, voiceToggle.checked);
        saveFeatureStates();
        syncSystemButton();
    });

    // Closing popup listener
    chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'forceClosePopup') {
        window.close(); // This physically shuts the extension popup
    }
});

    // Theme Management
    const applyTheme = (theme) => {
        if (!currentUser) return; // Forced dark mode active
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if(document.getElementById('themeText')) document.getElementById('themeText').textContent = 'Light Mode';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if(document.getElementById('themeText')) document.getElementById('themeText').textContent = 'Dark Mode';
        }
    };

    themeToggleBtn.addEventListener("click", () => {
        if (!currentUser) return;
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
                savedSnapToggle: snapToggle.checked,
                savedVoiceToggle: voiceToggle.checked
            });

            pathToggle.checked = false;
            hitboxToggle.checked = false;
            snapToggle.checked = false;
            voiceToggle.checked = false;

            updateStatusLabel(pathStatus, false);
            updateStatusLabel(hitboxStatus, false);
            updateStatusLabel(snapStatus, false);
            updateStatusLabel(voiceStatus, false);
            saveFeatureStates();
            syncSystemButton();
        } else {
            // System is OFF -> restore previously saved selections
            chrome.storage.local.get(["savedPathToggle", "savedHitboxToggle", "savedSnapToggle", "savedVoiceToggle"], (result) => {
                // If nothing was saved before, turn on hitbox and voice by default
                const restorePath = Boolean(result.savedPathToggle);
                const restoreHitbox = result.savedHitboxToggle !== undefined ? Boolean(result.savedHitboxToggle) : true;
                const restoreSnap = result.savedSnapToggle !== undefined ? Boolean(result.savedSnapToggle) : true;
                const restoreVoice = result.savedVoiceToggle !== undefined ? Boolean(result.savedVoiceToggle) : true;

                pathToggle.checked = restorePath;
                hitboxToggle.checked = restoreHitbox;
                snapToggle.checked = restoreSnap;
                voiceToggle.checked = restoreVoice;

                updateStatusLabel(pathStatus, restorePath);
                updateStatusLabel(hitboxStatus, restoreHitbox);
                updateStatusLabel(snapStatus, restoreSnap);
                updateStatusLabel(voiceStatus, restoreVoice);
                saveFeatureStates();
                syncSystemButton();
            });
        }
    });
});
