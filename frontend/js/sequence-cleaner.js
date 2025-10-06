// js/sequence-cleaner.js

document.addEventListener('DOMContentLoaded', () => {
    // --- SELECTORES ---
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
    const fileInput = document.getElementById('sc-fastq-file');
    const fileNameDisplay = document.querySelector('.file-name-display');
    const cleanButton = document.getElementById('sc-clean-button');
    
    let cleanedFastqContent = "";

 

    // --- LÓGICA ASÍNCRONA DE LA HERRAMIENTA ---

    // Parsea el contenido de un archivo FASTQ en un array de objetos.
    //  Cada objeto tiene {title, seq, qual}.
    //  * @param {string} textContent - El contenido completo del archivo FASTQ.
    //  * @returns {Array<Object>} Un array de lecturas, donde cada una es {title, seq, qual}.
    //  */

     // ==================================================================
    // ===== SECCIÓN DE VALIDACIÓN DE ARCHIVOS ==========================
    // ==================================================================
    async function handleFileSelection() {
        const file = fileInput.files[0];

        if (file) {
            fileNameDisplay.textContent = 'Validating...';
            fileNameDisplay.style.color = 'var(--color-text-secondary)';
            cleanButton.disabled = true; // Desactivar botón mientras se valida

            // Llamamos a nuestro validador reutilizable con las opciones para FASTQ
            const validationResult = await FileValidator.validate(file, {
                allowedExtensions: ['.fastq', '.fq', '.fastq.gz', '.fq.gz'],
                maxSizeMB: 500 // Límite de 500MB para el navegador
            });

            if (validationResult.isValid) {
                fileNameDisplay.textContent = validationResult.message;
                cleanButton.disabled = false; // ¡Archivo válido! Activamos el botón.
            } else {
                fileNameDisplay.textContent = validationResult.message;
                fileNameDisplay.style.color = '#FF6B6B'; // Rojo para errores
                fileInput.value = ''; // Limpiamos el input para forzar una nueva selección
            }
        } else {
            fileNameDisplay.textContent = 'No file selected';
            cleanButton.disabled = true;
        }
    }

    // --- LÓGICA ASÍNCRONA DE LA HERRAMIENTA ---

    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();

        const file = fileInput.files[0];
        // Esta comprobación es una segunda capa de seguridad, ya que el botón debería estar desactivado.
        if (!file) {
            scStatusMessage.textContent = 'Error: Please select a valid FASTQ file.';
            scStatusContainer.classList.remove('hidden');
            return;
        }

        scStatusContainer.classList.remove('hidden');
        scLoader.classList.remove('hidden');
        scStatusMessage.textContent = 'Reading file into memory...';

        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                scStatusMessage.textContent = 'File read. Starting cleaning process...';
                const fileContent = e.target.result;

                const formData = new FormData(scForm);
                const params = {
                    adapter: formData.get('adapter'),
                    quality_threshold: parseInt(formData.get('quality_threshold'), 10),
                    min_length: parseInt(formData.get('min_length'), 10),
                    max_length: parseInt(formData.get('max_length'), 10),
                    max_n_percent: parseInt(formData.get('max_n_percent'), 10),
                    deduplicate: formData.has('deduplicate'),
                    filter_complexity: formData.has('filter_complexity')
                };

                setTimeout(() => {
                    const reads = parseFastq(fileContent);
                    const { stats, cleanedReads } = cleanReads(reads, params);
                    cleanedFastqContent = reconstructFastq(cleanedReads);
                    scStatusMessage.textContent = 'Analysis complete!';
                    scLoader.classList.add('hidden');
                    scStatusContainer.classList.add('hidden');
                    scResultsSection.classList.remove('hidden');
                    renderResults({ summary: stats });
                }, 50);

            } catch (error) {
                scStatusMessage.textContent = `An error occurred during processing: ${error.message}`;
                scLoader.classList.add('hidden');
            }
        };

        reader.onerror = function() {
            scStatusMessage.textContent = 'Error reading the file.';
            scLoader.classList.add('hidden');
        };

        reader.readAsText(file);
    }

    function parseFastq(textContent) {
        const lines = textContent.split('\n');
        const reads = [];
        for (let i = 0; i < lines.length; i += 4) {
            // Asegurarse de que tenemos las 4 líneas para una lectura completa
            if (i + 3 < lines.length && lines[i].startsWith('@')) {
                reads.push({
                    title: lines[i].substring(1), // Sin el '@'
                    seq: lines[i + 1],
                    qual: lines[i + 3]
                });
            }
        }
        return reads;
    }

    /**
     * Recorta una lectura usando una ventana deslizante de calidad.
     
     * @param {string} seq - La secuencia de ADN.
     * @param {string} qual - La cadena de calidad Phred.
     * @param {number} qualityThreshold - El umbral de calidad promedio de la ventana.
     * @param {number} windowSize - El tamaño de la ventana.
     * @returns {{seq: string, qual: string}} La secuencia y calidad recortadas.
     */
    function slidingWindowTrim(seq, qual, qualityThreshold, windowSize = 4) {
        if (!seq) return { seq: "", qual: "" };
        for (let i = 0; i <= seq.length - windowSize; i++) {
            const windowQuals = qual.substring(i, i + windowSize);
            let sumOfScores = 0;
            for (let j = 0; j < windowQuals.length; j++) {
                sumOfScores += windowQuals.charCodeAt(j) - 33; // Phred+33
            }
            if ((sumOfScores / windowSize) < qualityThreshold) {
                return { seq: seq.substring(0, i), qual: qual.substring(0, i) };
            }
        }
        return { seq, qual };
    }

    /**
     * Comprueba si una secuencia es de baja complejidad.
     *
     * @param {string} seq - La secuencia a comprobar.
     * @param {number} threshold - El umbral de frecuencia para el nucleótido más común.
     * @returns {boolean} - True si es de baja complejidad.
     */
    function isLowComplexity(seq, threshold = 0.5) {
        if (!seq) return true;
        const distinctBases = new Set(seq);
        if (distinctBases.size <= 2) {
            const counts = {};
            for (const base of seq) {
                counts[base] = (counts[base] || 0) + 1;
            }
            const mostCommonCount = Math.max(...Object.values(counts));
            if (mostCommonCount / seq.length > threshold) {
                return true;
            }
        }
        return false;
    }

    /**
     * El núcleo del proceso de limpieza. Itera sobre las lecturas y aplica los filtros.
     * 
     * @param {Array<Object>} reads - El array de lecturas parseadas.
     * @param {Object} params - Los parámetros del formulario.
     * @returns {Object} - Un objeto con las estadísticas y las lecturas limpias.
     */
    function cleanReads(reads, params) {
        const stats = {
            reads_processed: 0,
            reads_passed: 0,
            discard_reasons: {
                duplicate: { count: 0 },
                quality_failed: { count: 0 },
                too_short: { count: 0 },
                too_long: { count: 0 },
                too_many_n: { count: 0 },
                low_complexity: { count: 0 }
            }
        };
        const cleanedReads = [];
        const seenSequences = new Set();

        for (const read of reads) {
            stats.reads_processed++;
            let { title, seq, qual } = read;
            let discard = false;

            // 1. Deduplicación 
            if (params.deduplicate) {
                if (seenSequences.has(seq)) {
                    stats.discard_reasons.duplicate.count++;
                    continue; // Saltar al siguiente read
                }
                seenSequences.add(seq);
            }

            // 2. Recorte de adaptadores
            if (params.adapter && seq.includes(params.adapter)) {
                const pos = seq.indexOf(params.adapter);
                seq = seq.substring(0, pos);
                qual = qual.substring(0, pos);
            }

            // 3. Recorte por calidad 
            const trimmed = slidingWindowTrim(seq, qual, params.quality_threshold);
            seq = trimmed.seq;
            qual = trimmed.qual;

            // 4. Comprobar filtros en orden
            if (!seq) {
                stats.discard_reasons.quality_failed.count++;
                discard = true;
            } else if (seq.length < params.min_length) {
                stats.discard_reasons.too_short.count++;
                discard = true;
            } else if (seq.length > params.max_length) {
                stats.discard_reasons.too_long.count++;
                discard = true;
            } else if ((seq.match(/N/g) || []).length / seq.length * 100 > params.max_n_percent) {
                stats.discard_reasons.too_many_n.count++;
                discard = true;
            } else if (params.filter_complexity && isLowComplexity(seq)) {
                stats.discard_reasons.low_complexity.count++;
                discard = true;
            }

            if (!discard) {
                stats.reads_passed++;
                cleanedReads.push({ title, seq, qual });
            }
        }
        
        stats.reads_discarded = stats.reads_processed - stats.reads_passed;
        return { stats, cleanedReads };
    }

    /**
     * Reconstruye el contenido de un archivo FASTQ a partir de un array de lecturas limpias.
     * @param {Array<Object>} cleanedReads - Las lecturas que pasaron los filtros.
     * @returns {string} - El contenido del nuevo archivo FASTQ.
     */
    function reconstructFastq(cleanedReads) {
        return cleanedReads.map(r => `@${r.title}\n${r.seq}\n+\n${r.qual}`).join('\n');
    }


    // --- FUNCIONES DE RESULTADOS  ---
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
        const sortedReasons = Object.entries(summary.discard_reasons || {})
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
        scStatusContainer.classList.add('hidden');
        scResultsSection.classList.add('hidden');
        scLoader.classList.add('hidden');
        cleanedFastqContent = "";
    }

    // --- INICIALIZACIÓN  ---
    function init() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

        if (sidebarToggleInput) {
            sidebarToggleInput.addEventListener('change', (e) => {
                const checked = !!e.target.checked;
                if (appLayout) appLayout.classList.toggle('sidebar-collapsed', !checked);
                if (sidebarToggleBtn) sidebarToggleBtn.classList.toggle('is-active', checked);
            });
        }

        if (themeToggleBtn) {
            // Prefer centralized theme manager
            if (window.toggleTheme) {
                themeToggleBtn.addEventListener('click', () => window.toggleTheme());
            } else {
                themeToggleBtn.addEventListener('click', () => {
                    const current = document.documentElement.getAttribute('data-theme') || 'dark';
                    const newTheme = current === 'dark' ? 'light' : 'dark';
                    localStorage.setItem('theme', newTheme);
                    applyTheme(newTheme);
                });
            }
        }

        if (scForm) scForm.addEventListener('submit', handleFormSubmit);

        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelection);
        }
        if (cleanButton) {
            cleanButton.disabled = true;
        }

    }

    init();
});