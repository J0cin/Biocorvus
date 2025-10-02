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

    // Parsea el contenido de un archivo FASTQ en un array de objetos.
    //  * Equivalente a FastqGeneralIterator de BioPython.
    //  * @param {string} textContent - El contenido completo del archivo FASTQ.
    //  * @returns {Array<Object>} Un array de lecturas, donde cada una es {title, seq, qual}.
    //  */
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
     * Equivalente a la función `sliding_window_trim` en worker.py.
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
     * Equivalente a `is_low_complexity` en worker.py.
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
     * Reemplaza toda la lógica del bucle principal en `process_cleaner_job`.
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

            // 1. Deduplicación (si está activado)
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

            // 3. Recorte por calidad (ventana deslizante)
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


    // --- LÓGICA ASÍNCRONA (AHORA 100% LOCAL) ---

    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();

        const fileInput = document.getElementById('sc-fastq-file');
        const file = fileInput.files[0];
        if (!file) {
            scStatusMessage.textContent = 'Error: Please select a FASTQ file.';
            scStatusContainer.classList.remove('hidden');
            return;
        }

        scStatusContainer.classList.remove('hidden');
        scLoader.classList.remove('hidden');
        scStatusMessage.textContent = 'Reading file into memory...';

        // Usamos FileReader para leer el archivo en el navegador
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                scStatusMessage.textContent = 'File read. Starting cleaning process...';
                const fileContent = e.target.result;

                // 1. Recoger parámetros del formulario
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

                // Simular un pequeño retardo para que la UI se actualice
                setTimeout(() => {
                    // 2. Ejecutar el pipeline de limpieza
                    const reads = parseFastq(fileContent);
                    const { stats, cleanedReads } = cleanReads(reads, params);
                    
                    // 3. Guardar el contenido para la descarga
                    cleanedFastqContent = reconstructFastq(cleanedReads);

                    // 4. Mostrar los resultados
                    scStatusMessage.textContent = 'Analysis complete!';
                    scLoader.classList.add('hidden');
                    scStatusContainer.classList.add('hidden');
                    scResultsSection.classList.remove('hidden');
                    renderResults({ summary: stats }); // La función de renderizado es compatible

                }, 50); // 50ms de retardo

            } catch (error) {
                scStatusMessage.textContent = `An error occurred during processing: ${error.message}`;
                scLoader.classList.add('hidden');
            }
        };

        reader.onerror = function() {
            scStatusMessage.textContent = 'Error reading the file.';
            scLoader.classList.add('hidden');
        };

        // Iniciar la lectura del archivo
        reader.readAsText(file);
    }

    // --- FUNCIONES DE RESULTADOS (sin cambios, ya es compatible) ---
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

    // --- INICIALIZACIÓN (simplificada) ---
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
    }

    init();
});