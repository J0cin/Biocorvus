// js/sequence-cleaner.js

document.addEventListener('DOMContentLoaded', () => {
    // --- SELECTORES ---
    const API_BASE_URL = 'http://127.0.0.1:8000';
    const appLayout = document.getElementById('app-layout');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    // newer HTML (cleaner.html) uses a checkbox input inside the label
    const sidebarToggleInput = document.getElementById('sidebar-toggle-input');
    const themeCheckbox = document.getElementById('theme-checkbox'); // optional checkbox-based theme control
    // cleaner.html uses a div/button-like theme control with id `theme-toggle-btn`
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const scForm = document.getElementById('sc-form');
    const scStatusContainer = document.getElementById('sc-status-container');
    const scStatusMessage = document.getElementById('sc-status-message');
    const scLoader = document.getElementById('sc-loader');
    const scResultsSection = document.getElementById('sc-results-section');
    
    let cleanedFastqContent = "";
    let pollingInterval = null;

    // --- LÓGICA DE UI ---
    function toggleSidebar() {
        // legacy toggle (keeps existing behavior when no checkbox input is present)
        if (!appLayout) return;
        appLayout.classList.toggle('sidebar-collapsed');
        if (sidebarToggleBtn) sidebarToggleBtn.classList.toggle('is-active');
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeCheckbox) themeCheckbox.checked = theme === 'light';
    }

    function handleThemeChange() {
        // If using a checkbox input
        if (themeCheckbox) {
            const newTheme = themeCheckbox.checked ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
            return;
        }
        // Otherwise, toggle based on current attribute (for div/button toggles)
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }

    // --- LÓGICA ASÍNCRONA DE LA HERRAMIENTA ---

    // 1. Función para consultar el estado del trabajo
    function pollJobStatus(jobId) {
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
                if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
                
                const jobStatus = await response.json();
                const statusDetail = jobStatus.details?.status || jobStatus.state;
                scStatusMessage.textContent = `Working on it... (State: ${statusDetail})`;

                if (jobStatus.state === 'SUCCESS' || jobStatus.state === 'SUCCESSFUL') {
                    clearInterval(pollingInterval);
                    scStatusMessage.textContent = 'Analysis complete!';
                    
                    const finalResults = jobStatus.result;
                    if (!finalResults) throw new Error("Job succeeded but returned no results.");

                    scLoader.classList.add('hidden');
                    scStatusContainer.classList.add('hidden');
                    scResultsSection.classList.remove('hidden');
                    renderResults(finalResults);
                    cleanedFastqContent = finalResults.cleaned_data;
                } else if (jobStatus.state === 'FAILURE') {
                    clearInterval(pollingInterval);
                    scLoader.classList.add('hidden');
                    const errorMessage = jobStatus.result || 'An unknown error occurred in the worker.';
                    scStatusMessage.textContent = `Error: ${errorMessage}`;
                }
            } catch (error) {
                clearInterval(pollingInterval);
                scStatusMessage.textContent = `Error polling for status: ${error.message}`;
                scLoader.classList.add('hidden');
            }
        }, 3000);
    }

    // 2. Manejador del envío del formulario
    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();

        scStatusContainer.classList.remove('hidden');
        scLoader.classList.remove('hidden');
        scStatusMessage.textContent = 'Submitting job to the queue...';

        const formData = new FormData(scForm);

        try {
            const response = await fetch(`${API_BASE_URL}/api/clean`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `Server error: ${response.status}` }));
                throw new Error(errorData.detail);
            }

            const initialData = await response.json();
            const jobId = initialData.job_id;
            if (!jobId) throw new Error("Did not receive a valid job ID from the server.");
            
            scStatusMessage.textContent = 'Job accepted. Waiting for worker to start...';
            pollJobStatus(jobId);

        } catch (error) {
            scStatusMessage.textContent = `Error: ${error.message}`;
            scLoader.classList.add('hidden');
        }
    }

    // --- FUNCIONES DE RESULTADOS ---
    function renderResults(results) {
        if (!results || !results.summary) {
            scResultsSection.innerHTML = '<h3>Error</h3><p>Could not retrieve valid results.</p>';
            return;
        }
        const summary = results.summary;
        const processed = summary.reads_processed || 0;
        const passed = summary.reads_passed || 0;
        const discarded = summary.reads_discarded || 0;
        const passedPercent = processed > 0 ? (passed / processed * 100) : 0;
        const reasonNames = {
            duplicate: "Duplicate Read", quality_failed: "Failed Quality Trim",
            too_short: "Too Short", too_long: "Too Long",
            too_many_n: "Exceeded 'N' Limit", low_complexity: "Low Complexity"
        };
        let tableRows = '';
        const sortedReasons = Object.entries(summary.details || {})
            .filter(([, data]) => data.count > 0)
            .sort(([, a], [, b]) => b.count - a.count);

        for (const [key, data] of sortedReasons) {
            const reasonPercent = processed > 0 ? (data.count / processed * 100).toFixed(2) : 0;
            tableRows += `<tr><td>${reasonNames[key] || key}</td><td>${data.count.toLocaleString()}</td><td>${reasonPercent}%</td></tr>`;
        }

        scResultsSection.innerHTML = `
            <h3>Cleaning Complete</h3>
            <div class="summary-grid">
                <div class="summary-card"><h4>Reads Processed</h4><p class="value">${processed.toLocaleString()}</p></div>
                <div class="summary-card"><h4>Reads Passed</h4><p class="value">${passed.toLocaleString()}</p></div>
                <div class="summary-card"><h4>Reads Discarded</h4><p class="value">${discarded.toLocaleString()}</p></div>
            </div>
            <h4>Reads Distribution</h4>
            <div class="progress-bar-container">
                <div class="progress-bar">
                    <div class="progress-bar-passed" style="width: ${passedPercent.toFixed(2)}%;" title="Passed: ${passedPercent.toFixed(2)}%"></div>
                </div>
            </div>
            <h4>Discard Reason Breakdown</h4>
            <table class="results-table">
                <thead><tr><th>Filter Applied</th><th>Reads Discarded</th><th>% of Total Reads</th></tr></thead>
                <tbody>${tableRows.length > 0 ? tableRows : '<tr><td colspan="3" style="text-align:center;">No reads were discarded.</td></tr>'}</tbody>
            </table>
            <div class="controls-wrapper">
                <button class="button" id="sc-download-btn"><div class="button_inner"><span class="t">Download Cleaned FASTQ</span></div></button>
            </div>`;
        
        document.getElementById('sc-download-btn').addEventListener('click', downloadCleanedFile);
    }

    function downloadCleanedFile() {
        if (!cleanedFastqContent) return;
        const blob = new Blob([cleanedFastqContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cleaned_sequences.fastq';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function resetUI() {
        if (pollingInterval) clearInterval(pollingInterval);
        scStatusContainer.classList.add('hidden');
        scResultsSection.classList.add('hidden');
        scLoader.classList.add('hidden');
        cleanedFastqContent = "";
    }

    // --- INICIALIZACIÓN ---
    function init() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

        // Sidebar: prefer the checkbox input (cleaner.html), fallback to label/button
        if (sidebarToggleInput) {
            // sync initial sidebar state from existing classes
            try {
                const initialChecked = sidebarToggleBtn ? sidebarToggleBtn.classList.contains('is-active') : !appLayout.classList.contains('sidebar-collapsed');
                sidebarToggleInput.checked = !!initialChecked;
                if (appLayout) appLayout.classList.toggle('sidebar-collapsed', !initialChecked);
            } catch (e) {
                // ignore
            }
            sidebarToggleInput.addEventListener('change', (e) => {
                const checked = !!e.target.checked;
                if (appLayout) appLayout.classList.toggle('sidebar-collapsed', !checked);
                if (sidebarToggleBtn) sidebarToggleBtn.classList.toggle('is-active', checked);
            });
        } else if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', toggleSidebar);
        }

        // Theme control: support both checkbox inputs and a button/div control
        if (themeCheckbox) {
            // checkbox: when changed, apply theme
            themeCheckbox.checked = savedTheme === 'light';
            themeCheckbox.addEventListener('change', handleThemeChange);
        } else if (themeToggleBtn) {
            // button-like toggle: set visual state and attach click
            try { themeToggleBtn.classList.toggle('is-light', savedTheme === 'light'); } catch (e) {}
            themeToggleBtn.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                const newTheme = current === 'dark' ? 'light' : 'dark';
                localStorage.setItem('theme', newTheme);
                applyTheme(newTheme);
                try { themeToggleBtn.classList.toggle('is-light', newTheme === 'light'); } catch (e) {}
            });
        }

        if (scForm) scForm.addEventListener('submit', handleFormSubmit);
    }

    init();
});