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
    const emailInput = document.getElementById('emailInput');
    const identityInput = document.getElementById('identityInput');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const toggleCreateAccountBtn = document.getElementById('toggleCreateAccountBtn');
    const trySettingsBtn = document.getElementById('trySettingsBtn');

    let currentUser = localStorage.getItem('steadySyncUser');
    let isCreateAccountMode = false;

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

    function setAuthMode(createMode) {
        isCreateAccountMode = !!createMode;
        if (!emailInput || !identityInput || !loginSubmitBtn || !toggleCreateAccountBtn) return;

        emailInput.style.display = isCreateAccountMode ? 'block' : 'none';
        emailInput.required = isCreateAccountMode;
        identityInput.placeholder = isCreateAccountMode ? 'Username' : 'Username or Email';
        loginSubmitBtn.textContent = isCreateAccountMode ? 'Create Account' : 'Login';
        toggleCreateAccountBtn.textContent = isCreateAccountMode ? 'Back to login' : 'Create an account';
        loginError.style.display = 'none';
    }

    if (toggleCreateAccountBtn) {
        toggleCreateAccountBtn.addEventListener('click', () => {
            setAuthMode(!isCreateAccountMode);
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const identity = identityInput ? identityInput.value.trim() : '';
            const pass = document.getElementById('passwordInput').value;
            const email = emailInput ? emailInput.value.trim() : '';

            loginError.style.display = 'none';

            if (isCreateAccountMode && !email) {
                loginError.textContent = 'Email is required to create an account.';
                loginError.style.display = 'block';
                return;
            }

            try {
                const endpoint = isCreateAccountMode ? '/api/signup' : '/api/login';
                const payload = isCreateAccountMode
                    ? { username: identity, email, password: pass }
                    : { identity, password: pass };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    loginError.textContent = data.error || 'Authentication failed.';
                    loginError.style.display = 'block';
                    return;
                }

                const loggedInUser = data.user?.username || data.user?.email || identity;
                login(loggedInUser);
                if (isCreateAccountMode && emailInput) {
                    emailInput.value = '';
                }
                setAuthMode(false);
            } catch (err) {
                loginError.textContent = 'Server error. Please try again.';
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

    setAuthMode(false);

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
