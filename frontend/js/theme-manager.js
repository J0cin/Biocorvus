// theme-manager.js
(function () {
    // Apply theme to document and optionally update UI controls
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('theme', theme); } catch (e) {}
        // Update checkbox if present
        const cb = document.getElementById('theme-checkbox');
        if (cb) cb.checked = theme === 'light';
        // Update any visual toggle button state
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            try { btn.classList.toggle('is-light', theme === 'light'); } catch (e) {}
        }
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        return next;
    }

    // Expose globally
    window.applyTheme = applyTheme;
    window.toggleTheme = toggleTheme;

    // Initialize from saved value
    const saved = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(saved);

    // Attach a single listener if UI controls present
    const attach = () => {
        const btn = document.getElementById('theme-toggle-btn');
        const cb = document.getElementById('theme-checkbox');
        if (btn) {
            // avoid duplicate listeners by marking on the element
            if (!btn.dataset.themeHandlerAttached) {
                btn.addEventListener('click', () => toggleTheme());
                btn.dataset.themeHandlerAttached = '1';
            }
        }
        if (cb) {
            if (!cb.dataset.themeHandlerAttached) {
                cb.addEventListener('change', () => {
                    const newTheme = cb.checked ? 'light' : 'dark';
                    applyTheme(newTheme);
                });
                cb.dataset.themeHandlerAttached = '1';
            }
        }
    };

    // Run attach on DOMContentLoaded in case script loaded in head
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }
})();
