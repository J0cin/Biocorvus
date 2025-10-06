// js/fastqc-clientside.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SELECTORES (CORREGIDOS Y COMPLETOS) ---
    const fqcForm = document.getElementById('fqc-form');
    const analyzeButton = fqcForm.querySelector('button[type="submit"]');
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
    
    // CORRECCIÓN CLAVE: Selectores correctos para los spans que muestran el nombre del archivo
    const fileName1Display = document.querySelector('#fastq-file-1 + .file-name-display');
    const fileName2Display = document.querySelector('#fastq-file-2 + .file-name-display');

    // --- 2. ESTADO DE LA APLICACIÓN ---
    let qualityChart = null;
    let currentInputMode = 'upload';
    let analysisWorker = null;
    let isFile1Valid = false;
    let isFile2Valid = true; // Es true por defecto porque el archivo 2 no es obligatorio

    // ==================================================================
    // ===== SECCIÓN DE VALIDACIÓN DE ARCHIVOS ==========================
    // ==================================================================
    
    function updateSubmitButtonState() {
        const isComparison = comparisonToggle.checked;
        if (currentInputMode === 'upload') {
            if (isComparison) {
                analyzeButton.disabled = !(isFile1Valid && isFile2Valid);
            } else {
                analyzeButton.disabled = !isFile1Valid;
            }
        } else { // Modo 'paste'
            const hasText1 = textInput1.value.trim().length > 0;
            if (isComparison) {
                const hasText2 = textInput2.value.trim().length > 0;
                analyzeButton.disabled = !(hasText1 && hasText2);
            } else {
                analyzeButton.disabled = !hasText1;
            }
        }
    }

    async function handleFileValidation(event, fileNumber) {
        const input = fileNumber === 1 ? file1Input : file2Input;
        const display = fileNumber === 1 ? fileName1Display : fileName2Display;
        const file = input.files[0];

        if (!file) {
            display.textContent = 'No file selected';
            if (fileNumber === 1) isFile1Valid = false;
            else isFile2Valid = true;
            updateSubmitButtonState();
            return;
        }

        display.textContent = 'Validating...';
        display.style.color = 'var(--color-text-secondary)';

        const validationResult = await FileValidator.validate(file, {
            allowedExtensions: ['.fastq', '.fq', '.fastq.gz', '.fq.gz'],
            maxSizeMB: 500
        });

        if (validationResult.isValid) {
            display.textContent = validationResult.message;
            if (fileNumber === 1) isFile1Valid = true;
            else isFile2Valid = true;
        } else {
            display.textContent = validationResult.message;
            display.style.color = '#FF6B6B';
            input.value = '';
            if (fileNumber === 1) isFile1Valid = false;
            else isFile2Valid = false;
        }
        updateSubmitButtonState();
    }

    // --- 3. LÓGICA ASÍNCRONA PRINCIPAL ---
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
            if (currentInputMode === 'upload') {
                const file1 = file1Input.files[0];
                if (!file1) throw new Error('Please select at least one valid file.');
                const promises = [readFileAsText(file1)];
                if (isComparison) {
                    const file2 = file2Input.files[0];
                    if (!file2) throw new Error('Please select a second valid file for comparison.');
                    promises.push(readFileAsText(file2));
                }
                const contents = await Promise.all(promises);
                file1Content = contents[0];
                if (contents.length > 1) file2Content = contents[1];
            } else {
                file1Content = textInput1.value;
                if (!file1Content) throw new Error('Please paste sequence data in the first box.');
                if (isComparison) {
                    file2Content = textInput2.value;
                    if (!file2Content) throw new Error('Please paste sequence data in the second box for comparison.');
                }
            }

            statusMessage.textContent = 'Analyzing data in your browser... (This may take a moment)';
            analysisWorker = new Worker('js/fastqc-worker.js');

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
                analysisWorker.terminate();
            };

            analysisWorker.onerror = function(error) {
                statusMessage.textContent = `An unexpected error occurred in the analysis worker: ${error.message}`;
                loader.classList.add('hidden');
                analysisWorker.terminate();
            };

            analysisWorker.postMessage({ file1Content, file2Content, isComparison });

        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
            loader.classList.add('hidden');
        }
    }

    // --- 4. FUNCIONES DE AYUDA Y RENDERIZADO ---
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(`Error reading file: ${file.name}`));
            if (file.name.endsWith('.gz')) {
                reader.readAsArrayBuffer(file);
                reader.onload = (event) => {
                    try {
                        const compressedData = new Uint8Array(event.target.result);
                        const textContent = pako.inflate(compressedData, { to: 'string' });
                        resolve(textContent);
                    } catch (err) {
                        reject(new Error(`Failed to decompress ${file.name}. It may be corrupted.`));
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
        if (analysisWorker) {
            analysisWorker.terminate();
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

    // --- 5. LÓGICA DE UI ---
    function switchInputMode(mode) {
        currentInputMode = mode;
        modeUploadBtn.classList.toggle('active', mode === 'upload');
        modePasteBtn.classList.toggle('active', mode === 'paste');
        uploadContainer.classList.toggle('hidden', mode !== 'upload');
        pasteContainer.classList.toggle('hidden', mode !== 'paste');
        updateSubmitButtonState();
        toggleComparisonView();
    }

    function toggleComparisonView() {
        const isComparison = comparisonToggle.checked;
        file2Wrapper.classList.toggle('hidden', !isComparison || currentInputMode !== 'upload');
        paste2Wrapper.classList.toggle('hidden', !isComparison || currentInputMode !== 'paste');
        pasteGridContainer.classList.toggle('comparison-active', isComparison && currentInputMode === 'paste');
    }

    // --- 6. INICIALIZACIÓN (CORREGIDA Y LIMPIA) ---
    function init() {
        if (fqcForm) fqcForm.addEventListener('submit', handleFormSubmit);
        if (modeUploadBtn) modeUploadBtn.addEventListener('click', () => switchInputMode('upload'));
        if (modePasteBtn) modePasteBtn.addEventListener('click', () => switchInputMode('paste'));

        if (comparisonToggle) {
            comparisonToggle.addEventListener('change', () => {
                toggleComparisonView();
                if (!comparisonToggle.checked) {
                    isFile2Valid = true;
                } else {
                    // Si se activa la comparación, el archivo 2 debe ser validado si ya hay uno
                    handleFileValidation({ target: file2Input }, 2);
                }
                updateSubmitButtonState();
            });
        }

        if (file1Input) {
            file1Input.addEventListener('change', (e) => handleFileValidation(e, 1));
        }
        if (file2Input) {
            file2Input.addEventListener('change', (e) => handleFileValidation(e, 2));
        }
        
        // Listeners para el modo 'paste'
        if(textInput1) textInput1.addEventListener('input', updateSubmitButtonState);
        if(textInput2) textInput2.addEventListener('input', updateSubmitButtonState);

        switchInputMode('upload');
        analyzeButton.disabled = true;
    }

    init();
});