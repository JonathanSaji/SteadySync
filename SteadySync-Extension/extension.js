document.addEventListener("DOMContentLoaded", () => {
    const popupView = document.getElementById("popup-view");
    const settingsView = document.getElementById("settings-view");
    const goToSettingsButton = document.getElementById("goToSettings");
    const backToPopupButton = document.getElementById("backToPopup");
    const pathToggle = document.getElementById("path-toggle");
    
    // Theme toggle elements
    const themeToggleBtn = document.getElementById("themeToggle");

    const showView = (view) => {
        popupView.style.display = view === "popup" ? "flex" : "none";
        settingsView.style.display = view === "settings" ? "flex" : "none";
    };

    goToSettingsButton.addEventListener("click", () => showView("settings"));
    backToPopupButton.addEventListener("click", () => showView("popup"));

    if (pathToggle) {
        chrome.storage.local.get(["pathToggleEnabled"], (result) => {
            pathToggle.checked = Boolean(result.pathToggleEnabled);
        });

        pathToggle.addEventListener("change", () => {
            chrome.storage.local.set({ pathToggleEnabled: pathToggle.checked });
        });
    }

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
    
    // Master Toggle Button Visual Logic
    const masterBtn = document.getElementById("masterBtn");
    let isSystemOn = false;
    
    // Check initial state if you want to store it, but for now we toggle visually
    masterBtn.addEventListener("click", () => {
        isSystemOn = !isSystemOn;
        if (isSystemOn) {
            masterBtn.textContent = "SYSTEM ON";
            masterBtn.classList.add("active");
        } else {
            masterBtn.textContent = "SYSTEM OFF";
            masterBtn.classList.remove("active");
        }
    });
});
