// js/genome-scout.js

document.addEventListener('DOMContentLoaded', () => {
    // --- SELECTORES ---
    const API_BASE_URL = 'http://127.0.0.1:8000';
    const appLayout = document.getElementById('app-layout');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const themeCheckbox = document.getElementById('theme-checkbox');
    const gsForm = document.getElementById('gs-form');
    const gsStatusContainer = document.getElementById('gs-status-container');
    const gsStatusMessage = document.getElementById('gs-status-message');
    const gsLoader = document.getElementById('gs-loader');
    const gsResultsSection = document.getElementById('gs-results-section');
    
    let currentJobId = null;
    let pollingInterval = null;

    // --- LÓGICA DE UI (SIN CAMBIOS) ---
    function toggleSidebar() {
        appLayout.classList.toggle('sidebar-collapsed');
        sidebarToggleBtn.classList.toggle('is-active');
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeCheckbox) themeCheckbox.checked = theme === 'light';
    }

    function handleThemeChange() {
        const newTheme = themeCheckbox.checked ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }

    // --- LÓGICA ASÍNCRONA DE LA HERRAMIENTA ---

    // 1. Función para consultar el estado del trabajo (Polling)
    function pollJobStatus(jobId) {
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
                if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
                
                const jobStatus = await response.json();
                
                // ¡Mejora! Muestra los mensajes de progreso del worker
                const statusDetail = jobStatus.details?.status || jobStatus.state;
                gsStatusMessage.textContent = `Working on it... (State: ${statusDetail})`;

                if (jobStatus.state === 'SUCCESS' || jobStatus.state === 'SUCCESSFUL') {
                    clearInterval(pollingInterval);
                    gsStatusMessage.textContent = 'Analysis complete!';
                    
                    const finalResults = jobStatus.result;
                    if (!finalResults) throw new Error("Job succeeded but returned no results.");

                    gsLoader.classList.add('hidden');
                    gsStatusContainer.classList.add('hidden');
                    gsResultsSection.classList.remove('hidden');
                    renderScoutResults(finalResults);
                } else if (jobStatus.state === 'FAILURE') {
                    clearInterval(pollingInterval);
                    gsLoader.classList.add('hidden');
                    const errorMessage = jobStatus.result || 'An unknown error occurred in the worker.';
                    gsStatusMessage.textContent = `Error: ${errorMessage}`;
                }
            } catch (error) {
                clearInterval(pollingInterval);
                gsStatusMessage.textContent = `Error polling for status: ${error.message}`;
                gsLoader.classList.add('hidden');
            }
        }, 4000); // Aumentamos el intervalo a 4s, ya que este trabajo es más largo
    }

    // 2. Manejador del envío del formulario
    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();

        gsStatusContainer.classList.remove('hidden');
        gsLoader.classList.remove('hidden');
        gsStatusMessage.textContent = 'Submitting job to the queue... This may take several minutes.';

        const formData = new FormData(gsForm);

        try {
            const response = await fetch(`${API_BASE_URL}/api/scout/custom`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `Server error: ${response.status}` }));
                throw new Error(errorData.detail);
            }

            const initialData = await response.json();
            currentJobId = initialData.job_id; // Guardamos el Job ID aquí
            if (!currentJobId) throw new Error("Did not receive a valid job ID from the server.");
            
            gsStatusMessage.textContent = 'Job accepted. Waiting for worker to start...';
            pollJobStatus(currentJobId);

        } catch (error) {
            gsStatusMessage.textContent = `Error: ${error.message}`;
            gsLoader.classList.add('hidden');
        }
    }

    // --- FUNCIONES DE RESULTADOS Y DESCARGA ---
    function renderScoutResults(results) {
        if (!results || !results.summary) {
            gsResultsSection.innerHTML = '<h3>Error</h3><p>Could not retrieve valid results.</p>';
            return;
        }
        const summary = results.summary;
        const variantStats = summary.variant_calling_stats || {};

        let variantTableRows = '<tr><td colspan="2" style="text-align:center;">Variant calling was not performed.</td></tr>';
        if (summary.variant_calling_performed) {
            const totalVariants = variantStats.total_variants || 0;
            if (totalVariants > 0) {
                variantTableRows = `<tr><td>Total Variants Found</td><td>${totalVariants.toLocaleString()}</td></tr>`;
            } else {
                variantTableRows = '<tr><td colspan="2" style="text-align:center;">No variants were found.</td></tr>';
            }
        }

        gsResultsSection.innerHTML = `
            <h3>Analysis Complete</h3>
            <div class="summary-results-wrapper comparison">
                <div class="summary-card"><h4>Reference Genome</h4><ul><li><strong>Filename:</strong> ${summary.reference_genome}</li></ul></div>
                <div class="summary-card"><h4>Alignment Rate</h4><ul><li><strong>Estimated Rate:</strong> ${summary.alignment_rate}%</li></ul></div>
            </div>
            <h4 class="options-title">Variant Calling Summary</h4>
            <table class="results-table">
                <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                <tbody>${variantTableRows}</tbody>
            </table>
            <div class="download-buttons">
                <button class="button" id="gs-download-bam-btn"><div class="button_inner"><span class="t">Download BAM</span></div></button>
                <button class="button" id="gs-download-vcf-btn" ${!summary.variant_calling_performed ? 'disabled' : ''}><div class="button_inner"><span class="t">Download VCF</span></div></button>
            </div>`;

        document.getElementById('gs-download-bam-btn').addEventListener('click', () => downloadResultFile('bam'));
        if (summary.variant_calling_performed) {
            document.getElementById('gs-download-vcf-btn').addEventListener('click', () => downloadResultFile('vcf'));
        }
    }

    async function downloadResultFile(fileType) {
        if (!currentJobId) {
            alert('Error: Job ID is missing.');
            return;
        }
        // Mostramos un feedback al usuario
        const originalMessage = gsStatusMessage.textContent;
        gsStatusContainer.classList.remove('hidden');
        gsStatusMessage.textContent = `Preparing download for ${fileType.toUpperCase()} file...`;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/download/${currentJobId}/${fileType}`);
            if (!response.ok) throw new Error(`Server returned status ${response.status}`);
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${currentJobId}_result.${fileType}`; // Nombre de archivo más limpio
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            gsStatusContainer.classList.add('hidden'); // Ocultar al éxito
        } catch (error) {
            gsStatusMessage.textContent = `Download failed: ${error.message}`;
        }
    }

    function resetUI() {
        if (pollingInterval) clearInterval(pollingInterval);
        gsStatusContainer.classList.add('hidden');
        gsResultsSection.classList.add('hidden');
        gsLoader.classList.add('hidden');
        currentJobId = null;
    }

    // --- INICIALIZACIÓN ---
    function init() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);
        if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
        if (themeCheckbox) themeCheckbox.addEventListener('change', handleThemeChange);
        if (gsForm) gsForm.addEventListener('submit', handleFormSubmit);
    }

    init();
});