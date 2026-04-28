document.addEventListener("DOMContentLoaded", () => {
    const popupView = document.getElementById("popup-view");
    const settingsView = document.getElementById("settings-view");
    const goToSettingsButton = document.getElementById("goToSettings");
    const backToPopupButton = document.getElementById("backToPopup");
    const pathToggle = document.getElementById("path-toggle");

    const showView = (view) => {
        popupView.style.display = view === "popup" ? "block" : "none";
        settingsView.style.display = view === "settings" ? "block" : "none";
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
});
