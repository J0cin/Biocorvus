// js/fastqc.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('[fastqc.js] DOMContentLoaded - initializing QC Inspector UI');
    // --- 1. SELECTORES ---
    const API_BASE_URL = 'http://158.42.124.228:8000';;

    // UI Principal
    const appLayout = document.getElementById('app-layout');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const themeCheckbox = document.getElementById('theme-checkbox');

    // Formulario y Controles
    const fqcForm = document.getElementById('fqc-form');
    const modeUploadBtn = document.getElementById('mode-upload');
    const modePasteBtn = document.getElementById('mode-paste');
    const uploadContainer = document.getElementById('upload-container');
    const pasteContainer = document.getElementById('paste-container');
    const comparisonToggle = document.getElementById('comparison-toggle');
    
    // Inputs de Archivo
    const file1Input = document.getElementById('fastq-file-1');
    const file2Wrapper = document.getElementById('file-2-wrapper');
    const file2Input = document.getElementById('fastq-file-2');

    // Inputs de Texto
    const textInput1 = document.getElementById('fastq-text-input-1');
    const textInput2 = document.getElementById('fastq-text-input-2');
    const pasteGridContainer = document.getElementById('paste-grid-container');
    const paste2Wrapper = document.getElementById('paste-2-wrapper');
    const charCounter1 = document.getElementById('char-counter-1');
    const charCounter2 = document.getElementById('char-counter-2');
    const fileName1Display = document.getElementById('file-name-1');
    const fileName2Display = document.getElementById('file-name-2');

   
    // Secciones de Estado y Resultados
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.getElementById('status-message');
    const loader = document.getElementById('loader');
    const resultsSection = document.getElementById('results-section');
    const summaryWrapper = document.getElementById('summary-results-wrapper');
    const qualityChartCanvas = document.getElementById('quality-chart');

    // Defensive checks summary
    console.log('[fastqc.js] Elements:', {
        appLayoutExists: !!appLayout,
        sidebarToggleBtnExists: !!sidebarToggleBtn,
        themeCheckboxExists: !!themeCheckbox,
        fqcFormExists: !!fqcForm,
        modeUploadBtnExists: !!modeUploadBtn,
        modePasteBtnExists: !!modePasteBtn,
        file1InputExists: !!file1Input,
        qualityChartCanvasExists: !!qualityChartCanvas,
    });
    
    // --- 2. ESTADO DE LA APLICACIÓN ---
    let qualityChart = null;
    let currentInputMode = 'upload';
    let pollingInterval = null;

    // --- 3. FUNCIONES ---

    // UI General
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

    // Lógica de la Herramienta
    function switchInputMode(mode) {
        currentInputMode = mode;
        modeUploadBtn.classList.toggle('active', mode === 'upload');
        modePasteBtn.classList.toggle('active', mode === 'paste');
        uploadContainer.classList.toggle('hidden', mode !== 'upload');
        pasteContainer.classList.toggle('hidden', mode !== 'paste');
        toggleComparisonView();
    }

    function toggleComparisonView() {
        const isComparison = comparisonToggle.checked;
        file2Wrapper.classList.toggle('hidden', !isComparison || currentInputMode !== 'upload');
        paste2Wrapper.classList.toggle('hidden', !isComparison || currentInputMode !== 'paste');
        pasteGridContainer.classList.toggle('comparison-active', isComparison && currentInputMode === 'paste');
    }

    function updateCharCounter(textarea, counter) {
        counter.textContent = `${textarea.value.length} / ${textarea.maxLength}`;
    }
    
    // Esta función se encarga de preguntar por el estado del job
    function pollJobStatus(jobId) {
        pollingInterval = setInterval(async () => {
            try {
                const statusResponse = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
                if (!statusResponse.ok) throw new Error(`Polling failed: ${statusResponse.status}`);
                
                const jobStatus = await statusResponse.json();
                console.log("Respuesta del sondeo:", jobStatus);

                const statusDetail = jobStatus.details?.status || jobStatus.state;
                statusMessage.textContent = `Working on it... (State: ${statusDetail})`;

                if (jobStatus.state === 'SUCCESS' || jobStatus.state === 'SUCCESSFUL') {
                    clearInterval(pollingInterval);
                    statusMessage.textContent = 'Analysis complete!';
                    
                    const finalResults = jobStatus.result;
                    if (!finalResults) throw new Error("Job succeeded but returned no results.");

                    loader.classList.add('hidden');
                    statusContainer.classList.add('hidden');
                    displayResults(finalResults);

                } else if (jobStatus.state === 'FAILURE') {
                    clearInterval(pollingInterval);
                    loader.classList.add('hidden');
                    const errorMessage = jobStatus.result || 'An unknown error occurred in the worker.';
                    statusMessage.textContent = `Error: ${errorMessage}`;
                }
            } catch (error) {
                clearInterval(pollingInterval);
                statusMessage.textContent = `Error polling for status: ${error.message}`;
                loader.classList.add('hidden');
            }
        }, 3000);
    }

    // --- FUNCIÓN CRÍTICA CORREGIDA ---
    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();
    
        const formData = new FormData(); // Se crea un FormData VACÍO
        let isValid = false;
        const isComparison = comparisonToggle.checked;

        if (currentInputMode === 'upload') {
            if (file1Input.files.length > 0) {
                formData.append('file1', file1Input.files[0]); // Se añade el archivo UNA SOLA VEZ
                isValid = true;
            }
            if (isComparison && file2Input.files.length > 0) {
                formData.append('file2', file2Input.files[0]); // Se añade el segundo archivo UNA SOLA VEZ
            }
        } else { // Modo 'paste'
            if (textInput1.value.trim().length > 0) {
                formData.append('file1', new Blob([textInput1.value], { type: 'text/plain' }), 'pasted_1.fastq');
                isValid = true;
            }
            if (isComparison && textInput2.value.trim().length > 0) {
                formData.append('file2', new Blob([textInput2.value], { type: 'text/plain' }), 'pasted_2.fastq');
            }
        }

        if (!isValid) {
            alert('Please provide at least one FASTQ file or sequence.');
            return;
        }

        statusContainer.classList.remove('hidden');
        loader.classList.remove('hidden');
        statusMessage.textContent = 'Submitting job to the queue...';

        try {
            const response = await fetch(`${API_BASE_URL}/api/jobs`, {
                method: 'POST',
                body: formData // formData ahora es correcto
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `Server error: ${response.status}` }));
                throw new Error(errorData.detail);
            }

            const initialData = await response.json();
            const jobId = initialData.job_id;
            if (!jobId) throw new Error("Did not receive a valid job ID from the server.");
            
            statusMessage.textContent = 'Job accepted. Waiting for worker to start...';
            pollJobStatus(jobId);

        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
            loader.classList.add('hidden');
        }
    }

    // Lógica de Renderizado de Resultados
    function displayResults(results) {
        resultsSection.classList.remove('hidden');
        summaryWrapper.innerHTML = '';

        summaryWrapper.appendChild(createSummaryCard(results.file1, 'File 1'));
        if (results.file2) {
            summaryWrapper.classList.add('comparison');
            summaryWrapper.appendChild(createSummaryCard(results.file2, 'File 2'));
            if (results.comparison) {
                summaryWrapper.appendChild(createSummaryCard(results.comparison, 'Comparison'));
            }
        } else {
            summaryWrapper.classList.remove('comparison');
        }
        renderQualityChart(results);
    }

    function createSummaryCard(data, title) {
        const card = document.createElement('div');
        card.className = 'summary-card';
        let content = `<h4>${title}</h4><ul>`;
        const dataToShow = data.summary || data;
        for (const [key, value] of Object.entries(dataToShow)) {
            const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            content += `<li><strong>${formattedKey}:</strong> ${value}</li>`;
        }
        content += '</ul>';
        card.innerHTML = content;
        return card;
    }

    function renderQualityChart(results) {
        if (qualityChart) qualityChart.destroy();
        
        const datasets = [];
        const file1Data = results.file1.per_base_quality_chart;
        const labels = Object.keys(file1Data);
        
        datasets.push({
            label: 'Average Quality (File 1)',
            data: labels.map(pos => file1Data[pos].mean),
            borderColor: '#708993',
            backgroundColor: 'rgba(112, 137, 147, 0.2)',
            borderWidth: 2,
            fill: false,
        });

        if (results.file2) {
            const file2Data = results.file2.per_base_quality_chart;
            datasets.push({
                label: 'Average Quality (File 2)',
                data: Object.values(file2Data).map(d => d.mean),
                borderColor: '#A1C2BD',
                backgroundColor: 'rgba(161, 194, 189, 0.2)',
                borderWidth: 2,
                fill: false,
            });
        }
        
        const ctx = qualityChartCanvas.getContext('2d');
        qualityChart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                scales: { 
                    y: { beginAtZero: true, title: { display: true, text: 'Quality Score (Phred)' } }, 
                    x: { title: { display: true, text: 'Position in Read (bp)' } } 
                },
                plugins: { legend: { display: true, position: 'top' } }
            }
        });
    }

    function resetUI() {
        if (pollingInterval) clearInterval(pollingInterval); 
        statusContainer.classList.add('hidden');
        resultsSection.classList.add('hidden');
        summaryWrapper.innerHTML = '';
        if (qualityChart) {
            qualityChart.destroy();
            qualityChart = null;
        }
    }
// --- 4. INICIALIZACIÓN ---
    // Tu función init con las comprobaciones defensivas es perfecta.
    function init() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

        if (fqcForm) fqcForm.addEventListener('submit', handleFormSubmit);
        if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
        if (themeCheckbox) themeCheckbox.addEventListener('change', handleThemeChange);
        if (modeUploadBtn) modeUploadBtn.addEventListener('click', () => switchInputMode('upload'));
        if (modePasteBtn) modePasteBtn.addEventListener('click', () => switchInputMode('paste'));
        if (comparisonToggle) comparisonToggle.addEventListener('change', toggleComparisonView);
        if (textInput1 && charCounter1) textInput1.addEventListener('input', () => updateCharCounter(textInput1, charCounter1));
        if (textInput2 && charCounter2) textInput2.addEventListener('input', () => updateCharCounter(textInput2, charCounter2));
        if (file1Input && fileName1Display) {
            file1Input.addEventListener('change', () => {
                const fileName = file1Input.files.length > 0 ? file1Input.files[0].name : 'No file selected';
                fileName1Display.textContent = fileName;
            });
        }

        if (file2Input && fileName2Display) {
            file2Input.addEventListener('change', () => {
                const fileName = file2Input.files.length > 0 ? file2Input.files[0].name : 'No file selected';
                fileName2Display.textContent = fileName;
            });
        }


        if (modeUploadBtn && uploadContainer && pasteContainer) switchInputMode('upload');
    }

    init();
});