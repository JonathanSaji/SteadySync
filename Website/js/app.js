document.addEventListener('DOMContentLoaded', () => {
    // Theme logic
    const themeBtn = document.getElementById('themeToggle');
    const themeText = document.getElementById('themeText');
    const root = document.documentElement;

    function setTheme(isDark) {
        if (isDark) {
            root.setAttribute('data-theme', 'dark');
            themeText.textContent = 'Light Mode';
        } else {
            root.removeAttribute('data-theme');
            themeText.textContent = 'Dark Mode';
        }
    }

    // Default to dark mode
    setTheme(true);

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = root.hasAttribute('data-theme');
            setTheme(!isDark);
        });
    }

    // Auth Logic
    const authContainer = document.getElementById('authContainer');
    const loginWall = document.getElementById('loginWall');
    const featuresSection = document.getElementById('featuresSection');
    const settingsSection = document.getElementById('settingsSection');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const trySettingsBtn = document.getElementById('trySettingsBtn');

    let currentUser = localStorage.getItem('steadySyncUser');

    if (trySettingsBtn) {
        trySettingsBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert("Please log in below to access the Settings Sync Dashboard.");
                if (loginWall) loginWall.scrollIntoView({behavior: 'smooth'});
            } else {
                if (settingsSection) settingsSection.scrollIntoView({behavior: 'smooth'});
            }
        });
    }

    function renderAuthUI() {
        if (authContainer) authContainer.innerHTML = '';
        
        if (currentUser) {
            if (authContainer) {
                const span = document.createElement('span');
                span.textContent = `Logged in as ${currentUser}`;
                span.style.marginRight = '15px';
                span.style.fontWeight = 'bold';
                
                const logoutBtn = document.createElement('button');
                logoutBtn.className = 'secondary-btn';
                logoutBtn.textContent = 'Logout';
                logoutBtn.style.padding = '8px 16px';
                logoutBtn.onclick = () => {
                    currentUser = null;
                    localStorage.removeItem('steadySyncUser');
                    renderAuthUI();
                    window.postMessage({ type: 'STEADYSYNC_LOGOUT' }, '*');
                    for (const elements of Object.values(toggles)) {
                        if (elements.toggle) elements.toggle.disabled = true;
                    }
                };
                
                authContainer.appendChild(span);
                authContainer.appendChild(logoutBtn);
            }
            if (loginWall) loginWall.style.display = 'none';
            if (featuresSection) featuresSection.style.display = 'grid';
            if (settingsSection) settingsSection.style.display = 'block';
        } else {
            if (loginWall) loginWall.style.display = 'block';
            if (featuresSection) featuresSection.style.display = 'none';
            if (settingsSection) settingsSection.style.display = 'none';
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = document.getElementById('usernameInput').value;
            const pass = document.getElementById('passwordInput').value;
            
            if ((user === 'user1' && pass === 'pass1') || (user === 'user2' && pass === 'pass2')) {
                loginError.style.display = 'none';
                login(user);
            } else {
                loginError.style.display = 'block';
            }
        });
    }

    function login(userId) {
        currentUser = userId;
        localStorage.setItem('steadySyncUser', userId);
        renderAuthUI();
        window.postMessage({ type: 'STEADYSYNC_LOGIN', userId: userId }, '*');
    }

    renderAuthUI();

    // Settings logic (Extension Communication)
    const toggles = {
        pathToggleEnabled: { toggle: document.getElementById('path-toggle'), status: document.getElementById('path-status') },
        hitboxEnabled: { toggle: document.getElementById('hitbox-toggle'), status: document.getElementById('hitbox-status') },
        snapEnabled: { toggle: document.getElementById('snap-toggle'), status: document.getElementById('snap-status') },
        voiceEnabled: { toggle: document.getElementById('voice-toggle'), status: document.getElementById('voice-status') }
    };

    const statusBadge = document.getElementById('extensionStatus');

    // On load, send ping AND login if we have a user
    window.postMessage({ type: 'STEADYSYNC_WEBSITE_PING' }, '*');
    if (currentUser) {
        window.postMessage({ type: 'STEADYSYNC_LOGIN', userId: currentUser }, '*');
    }
    
    // Timeout if no response
    const connectTimeout = setTimeout(() => {
        if (statusBadge) {
            statusBadge.className = 'status-badge disconnected';
            statusBadge.textContent = 'Extension not detected';
        }
    }, 1500);

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        const data = event.data;
        if (data.type === 'STEADYSYNC_EXTENSION_STATE') {
            clearTimeout(connectTimeout);
            if (statusBadge) {
                statusBadge.className = 'status-badge connected';
                statusBadge.textContent = 'Connected to Extension';
            }

            // If we are logged out, disable inputs
            if (!data.currentUser) {
                for (const elements of Object.values(toggles)) {
                    if (elements.toggle) elements.toggle.disabled = true;
                }
                return;
            }

            // Sync website's currentUser with extension if it differs
            if (data.currentUser && data.currentUser !== currentUser) {
                currentUser = data.currentUser;
                localStorage.setItem('steadySyncUser', currentUser);
                renderAuthUI();
            }

            // Enable inputs and update states
            for (const [key, elements] of Object.entries(toggles)) {
                if (elements.toggle) {
                    elements.toggle.disabled = false;
                    const val = !!data.state[key];
                    elements.toggle.checked = val;
                    elements.status.textContent = val ? 'ON' : 'OFF';
                    elements.status.className = val ? 'toggle-status active' : 'toggle-status';
                }
            }
        }
    });

    for (const [key, elements] of Object.entries(toggles)) {
        if (elements.toggle) {
            elements.toggle.addEventListener('change', (e) => {
                if (!currentUser) {
                    e.preventDefault();
                    e.target.checked = !e.target.checked; // revert
                    alert("Please log in to change settings.");
                    return;
                }
                const val = e.target.checked;
                elements.status.textContent = val ? 'ON' : 'OFF';
                elements.status.className = val ? 'toggle-status active' : 'toggle-status';
                
                window.postMessage({ 
                    type: 'STEADYSYNC_UPDATE_SETTING', 
                    setting: key, 
                    value: val 
                }, '*');
            });
        }
    }
});
