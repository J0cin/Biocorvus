// js/fastqc-clientside.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('[fastqc-clientside.js] DOMContentLoaded - initializing Client-Side QC Inspector');
    
    // --- 1. SELECTORES ---
    const fqcForm = document.getElementById('fqc-form');
    const modeUploadBtn = document.getElementById('mode-upload');
    const modePasteBtn = document.getElementById('mode-paste');
    const uploadContainer = document.getElementById('upload-container');
    const pasteContainer = document.getElementById('paste-container');
    const comparisonToggle = document.getElementById('comparison-toggle');
    const file1Input = document.getElementById('fastq-file-1');
    const file2Wrapper = document.getElementById('file-2-wrapper');
    const file2Input = document.getElementById('fastq-file-2');
    const textInput1 = document.getElementById('fastq-text-input-1');
    const textInput2 = document.getElementById('fastq-text-input-2');
    const pasteGridContainer = document.getElementById('paste-grid-container');
    const paste2Wrapper = document.getElementById('paste-2-wrapper');
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.getElementById('status-message');
    const loader = document.getElementById('loader');
    const resultsSection = document.getElementById('results-section');
    const summaryWrapper = document.getElementById('summary-results-wrapper');
    const qualityChartCanvas = document.getElementById('quality-chart');
    const fileName1Display = document.getElementById('file-name-1');
    const fileName2Display = document.getElementById('file-name-2');

    // --- 2. ESTADO DE LA APLICACIÓN ---
    let qualityChart = null;
    let currentInputMode = 'upload';

    // --- 3. LÓGICA ASÍNCRONA PRINCIPAL DE LA HERRAMIENTA ---
   async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();

        statusContainer.classList.remove('hidden');
        loader.classList.remove('hidden'); 
        statusMessage.textContent = 'Reading file(s)...';

        const isComparison = comparisonToggle.checked;
        let file1Content = null;
        let file2Content = null;

        try {
            // Leer el contenido de los archivos (esto es rápido)
            if (currentInputMode === 'upload') {
                const file1 = file1Input.files[0];
                if (!file1) throw new Error('Please select at least one file.');
                const promises = [readFileAsText(file1)];
                if (isComparison) {
                    const file2 = file2Input.files[0];
                    if (file2) promises.push(readFileAsText(file2));
                }
                const contents = await Promise.all(promises);
                file1Content = contents[0];
                if (contents.length > 1) file2Content = contents[1];
            } else {
                file1Content = textInput1.value;
                if (!file1Content) throw new Error('Please paste sequence data in the first box.');
                if (isComparison) file2Content = textInput2.value;
            }

            statusMessage.textContent = 'Analyzing data in your browser... (This may take a moment)';
            
            // Crear y usar el Web Worker
            analysisWorker = new Worker('js/fastqc-worker.js');

            // Qué hacer cuando el worker nos devuelve los resultados
            analysisWorker.onmessage = function(event) {
                const { status, results, message } = event.data;
                if (status === 'success') {
                    statusMessage.textContent = 'Analysis complete!';
                    loader.classList.add('hidden');
                    statusContainer.classList.add('hidden');
                    displayResults(results);
                } else {
                    throw new Error(message);
                }
                analysisWorker.terminate(); // Limpiar el worker cuando termina
            };

            // Qué hacer si hay un error en el worker
            analysisWorker.onerror = function(error) {
                statusMessage.textContent = `An unexpected error occurred in the analysis worker: ${error.message}`;
                loader.classList.add('hidden');
                analysisWorker.terminate();
            };

            // Enviar los datos al worker para que empiece a trabajar
            analysisWorker.postMessage({
                file1Content,
                file2Content,
                isComparison
            });

        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
            loader.classList.add('hidden');
        }
    }

    // --- 4. FUNCIONES DE AYUDA Y RENDERIZADO  ---

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(`Error reading file: ${file.name}`));
            if (file.name.endsWith('.gz')) {
                reader.readAsArrayBuffer(file);
                reader.onload = (event) => {
                    try {
                        const compressedData = new Uint8Array(event.target.result);
                        const textContent = pako.inflate(compressedData, { to: 'string', gzip: true });
                        resolve(textContent);
                    } catch (err) {
                        reject(new Error(`Failed to decompress ${file.name}.`));
                    }
                };
            } else {
                reader.readAsText(file);
                reader.onload = (event) => resolve(event.target.result);
            }
        });
    }

    function displayResults(results) {
        resultsSection.classList.remove('hidden');
        summaryWrapper.innerHTML = '';
        summaryWrapper.appendChild(createSummaryCard(results.file1, 'File 1'));
        if (results.file2) {
            summaryWrapper.classList.add('comparison');
            summaryWrapper.appendChild(createSummaryCard(results.file2, 'File 2'));
            if (results.comparison) summaryWrapper.appendChild(createSummaryCard(results.comparison, 'Comparison'));
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
            label: 'Average Quality (File 1)', data: labels.map(pos => file1Data[pos].mean),
            borderColor: '#708993', backgroundColor: 'rgba(112, 137, 147, 0.2)',
            borderWidth: 2, fill: false,
        });
        if (results.file2) {
            const file2Data = results.file2.per_base_quality_chart;
            datasets.push({
                label: 'Average Quality (File 2)', data: Object.values(file2Data).map(d => d.mean),
                borderColor: '#A1C2BD', backgroundColor: 'rgba(161, 194, 189, 0.2)',
                borderWidth: 2, fill: false,
            });
        }
        const ctx = qualityChartCanvas.getContext('2d');
        qualityChart = new Chart(ctx, {
            type: 'line', data: { labels: labels, datasets: datasets },
            options: { /* ... tus opciones de gráfico ... */ }
        });
    }

    function resetUI() {
        if (analysisWorker) {
            analysisWorker.terminate(); // 
            analysisWorker = null;
        }
        statusContainer.classList.add('hidden');
        resultsSection.classList.add('hidden');
        summaryWrapper.innerHTML = '';
        if (qualityChart) {
            qualityChart.destroy();
            qualityChart = null;
        }
    }

    // --- 5. FUNCIONES DE RENDERIZADO  ---
    function displayResults(results) {
        resultsSection.classList.remove('hidden');
        summaryWrapper.innerHTML = '';
        summaryWrapper.appendChild(createSummaryCard(results.file1, 'File 1'));
        if (results.file2) {
            summaryWrapper.classList.add('comparison');
            summaryWrapper.appendChild(createSummaryCard(results.file2, 'File 2'));
            if (results.comparison) summaryWrapper.appendChild(createSummaryCard(results.comparison, 'Comparison'));
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
            label: 'Average Quality (File 1)', data: labels.map(pos => file1Data[pos].mean),
            borderColor: '#708993', backgroundColor: 'rgba(112, 137, 147, 0.2)',
            borderWidth: 2, fill: false,
        });
        if (results.file2) {
            const file2Data = results.file2.per_base_quality_chart;
            datasets.push({
                label: 'Average Quality (File 2)', data: Object.values(file2Data).map(d => d.mean),
                borderColor: '#A1C2BD', backgroundColor: 'rgba(161, 194, 189, 0.2)',
                borderWidth: 2, fill: false,
            });
        }
        const ctx = qualityChartCanvas.getContext('2d');
        qualityChart = new Chart(ctx, {
            type: 'line', data: { labels: labels, datasets: datasets },
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
        statusContainer.classList.add('hidden');
        resultsSection.classList.add('hidden');
        summaryWrapper.innerHTML = '';
        if (qualityChart) {
            qualityChart.destroy();
            qualityChart = null;
        }
    }

    // --- 6. INICIALIZACIÓN ---
    function init() {
        if (fqcForm) fqcForm.addEventListener('submit', handleFormSubmit);
        if (modeUploadBtn) modeUploadBtn.addEventListener('click', () => switchInputMode('upload'));
        if (modePasteBtn) modePasteBtn.addEventListener('click', () => switchInputMode('paste'));
        if (comparisonToggle) comparisonToggle.addEventListener('change', toggleComparisonView);
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
        switchInputMode('upload');
    }
    
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

    init();
});