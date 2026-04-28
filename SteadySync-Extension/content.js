const popupView = document.getElementById('popup-view');
const settingsView = document.getElementById('settings-view');

// Switch to Settings
document.getElementById('goToSettings').addEventListener('click', () => {
    popupView.style.display = 'none';
    settingsView.style.display = 'flex';
});

// Switch back to Popup
document.getElementById('backToPopup').addEventListener('click', () => {
    settingsView.style.display = 'none';
    popupView.style.display = 'flex';
});