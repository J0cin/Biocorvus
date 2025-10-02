document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES DE VALIDACIÓN ---
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const NEEDLEMAN_MAX_LEN = 50000;

    // --- SELECTORES ---
    const alignerForm = document.getElementById('aligner-form');
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.getElementById('status-message');
    const resultsSection = document.getElementById('results-section');
    const summaryWrapper = document.getElementById('summary-results-wrapper');
    const alignmentDisplayWrapper = document.getElementById('alignment-display-wrapper');
    const alignmentDisplay = document.getElementById('alignment-display');
    const modeUploadBtn = document.getElementById('mode-upload');
    const modePasteBtn = document.getElementById('mode-paste');
    const uploadContainer = document.getElementById('upload-container');
    const pasteContainer = document.getElementById('paste-container');
    const seq1FileInput = document.getElementById('sequence-1-file');
    const seq2FileInput = document.getElementById('sequence-2-file');
    const seq1TextInput = document.getElementById('sequence-1-input');
    const seq2TextInput = document.getElementById('sequence-2-input');
    const matchInput = document.getElementById('match-score');
    const mismatchInput = document.getElementById('mismatch-penalty');
    const gapInput = document.getElementById('gap-penalty');

    // --- ESTADO ---
    let alignerWorker = null;
    let currentInputMode = 'upload';
    let sequenceFileContent1 = '';
    let sequenceFileContent2 = '';

    // --- LÓGICA DE UI ---
    function switchInputMode(mode) {
        currentInputMode = mode;
        console.log(`[aligner] switching input mode -> ${mode}`);

        // Defensive guards
        if (!modeUploadBtn || !modePasteBtn || !uploadContainer || !pasteContainer) {
            console.warn('[aligner] missing UI elements for switchInputMode', { modeUploadBtn, modePasteBtn, uploadContainer, pasteContainer });
            return;
        }

        // Update tab button visual state
        modeUploadBtn.classList.toggle('active', mode === 'upload');
        modePasteBtn.classList.toggle('active', mode === 'paste');

        if (mode === 'upload') {
            // Show upload container explicitly and hide paste container
            uploadContainer.classList.remove('hidden');
            uploadContainer.style.display = 'grid';
            uploadContainer.hidden = false;
            uploadContainer.setAttribute('aria-hidden', 'false');

            pasteContainer.classList.add('hidden');
            pasteContainer.style.display = 'none';
            pasteContainer.hidden = true;
            pasteContainer.setAttribute('aria-hidden', 'true');

            // Clear pasted values
            if (seq1TextInput) seq1TextInput.value = '';
            if (seq2TextInput) seq2TextInput.value = '';
        } else {
            // mode === 'paste'
            uploadContainer.classList.add('hidden');
            uploadContainer.style.display = 'none';
            uploadContainer.hidden = true;
            uploadContainer.setAttribute('aria-hidden', 'true');

            pasteContainer.classList.remove('hidden');
            pasteContainer.style.display = 'grid';
            pasteContainer.hidden = false;
            pasteContainer.setAttribute('aria-hidden', 'false');

            // Clear file inputs and state
            if (seq1FileInput) seq1FileInput.value = null;
            if (seq2FileInput) seq2FileInput.value = null;
            sequenceFileContent1 = '';
            sequenceFileContent2 = '';

            const name1 = document.querySelector('#sequence-1-file + .file-name-display');
            const name2 = document.querySelector('#sequence-2-file + .file-name-display');
            if (name1) name1.textContent = 'No file selected';
            if (name2) name2.textContent = 'No file selected';
        }
    }

    function renderResults(results) {
        summaryWrapper.innerHTML = `
            <div class="summary-card"><h4>Alignment Score</h4><p class="value">${results.alignmentScore}</p></div>
            <div class="summary-card"><h4>Identity</h4><p class="value">${results.identityPercent}%</p></div>
            <div class="summary-card"><h4>Gaps</h4><p class="value">${results.gaps}</p></div>
        `;
        let alignmentHTML = '';
        let matchLine = '';
        for (let i = 0; i < results.align1.length; i++) {
            if (results.align1[i] === results.align2[i]) matchLine += '|';
            else if (results.align1[i] === '-' || results.align2[i] === '-') matchLine += ' ';
            else matchLine += '.';
        }
        const lineLength = 80;
        for (let i = 0; i < results.align1.length; i += lineLength) {
            alignmentHTML += `Seq1: ${results.align1.substring(i, i + lineLength)}\n`;
            alignmentHTML += `      ${matchLine.substring(i, i + lineLength)}\n`;
            alignmentHTML += `Seq2: ${results.align2.substring(i, i + lineLength)}\n\n`;
        }
        alignmentDisplay.innerHTML = alignmentHTML;
    }

    function cleanSequence(rawSeq) {
        if (!rawSeq) return '';
        if (rawSeq.trim().startsWith('>')) {
            return rawSeq.split('\n').slice(1).join('').replace(/\s/g, '').toUpperCase();
        }
        return rawSeq.replace(/\s/g, '').toUpperCase();
    }

    function getSequences() {
        if (currentInputMode === 'upload') {
            if (!sequenceFileContent1 || !sequenceFileContent2) throw new Error('Please select two sequence files.');
            return { seq1: cleanSequence(sequenceFileContent1), seq2: cleanSequence(sequenceFileContent2) };
        } else {
            return { seq1: cleanSequence(seq1TextInput.value), seq2: cleanSequence(seq2TextInput.value) };
        }
    }

    function handleFileSelect(event, sequenceNumber) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            statusMessage.textContent = `Error: File "${file.name}" is too large.`;
            statusContainer.classList.remove('hidden');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            if (sequenceNumber === 1) sequenceFileContent1 = e.target.result;
            else sequenceFileContent2 = e.target.result;
        };
        reader.readAsText(file);
    }

    function resetUI() {
        if (alignerWorker) alignerWorker.terminate();
        statusContainer.classList.add('hidden');
        resultsSection.classList.add('hidden');
        summaryWrapper.innerHTML = '';
        alignmentDisplay.innerHTML = '';
    }

    // --- LÓGICA PRINCIPAL ---
    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();
        statusMessage.textContent = 'Validating sequences...';
        statusContainer.classList.remove('hidden');

        try {
            const { seq1, seq2 } = getSequences();
            if (!seq1 || !seq2) throw new Error('One or both sequences are empty.');

            // ===== CAMBIO CLAVE: Validación de longitud como primer paso =====
            if (seq1.length > NEEDLEMAN_MAX_LEN || seq2.length > NEEDLEMAN_MAX_LEN) {
                throw new Error(`Sequences are too long. Maximum length is ${NEEDLEMAN_MAX_LEN.toLocaleString()} bp.`);
            }

            resultsSection.classList.remove('hidden');
            alignmentDisplayWrapper.classList.remove('hidden');
            
            const params = {
                matchScore: parseInt(matchInput.value, 10),
                mismatchPenalty: parseInt(mismatchInput.value, 10),
                gapPenalty: parseInt(gapInput.value, 10)
            };

            statusMessage.textContent = 'Aligning sequences in the background...';
            
            // Usamos el worker simple para Needleman-Wunsch
            alignerWorker = new Worker('js/aligner-worker.js');
            
            alignerWorker.onmessage = (e) => {
                statusContainer.classList.add('hidden');
                renderResults(e.data);
                alignerWorker.terminate();
            };

            alignerWorker.onerror = (error) => {
                statusMessage.textContent = `An unexpected worker error occurred: ${error.message}`;
                alignerWorker.terminate();
            };

            alignerWorker.postMessage({ seq1, seq2, ...params });

        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
        }
    }

    // --- EVENT LISTENERS E INICIALIZACIÓN ---
    alignerForm.addEventListener('submit', handleFormSubmit);
    modeUploadBtn.addEventListener('click', () => switchInputMode('upload'));
    modePasteBtn.addEventListener('click', () => switchInputMode('paste'));
    seq1FileInput.addEventListener('change', (e) => handleFileSelect(e, 1));
    seq2FileInput.addEventListener('change', (e) => handleFileSelect(e, 2));
    
    switchInputMode('upload');
});