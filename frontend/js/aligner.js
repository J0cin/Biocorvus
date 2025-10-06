// js/aligner.js

document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES DE VALIDACIÓN ---
    const NEEDLEMAN_MAX_LEN = 50000;

    // --- SELECTORES ---
    const alignerForm = document.getElementById('aligner-form');
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.getElementById('status-message');
    const resultsSection = document.getElementById('results-section');
    const summaryWrapper = document.getElementById('summary-results-wrapper');
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
    const alignButton = alignerForm.querySelector('button[type="submit"]');
    const fileName1Display = document.querySelector('#sequence-1-file + .file-name-display');
    const fileName2Display = document.querySelector('#sequence-2-file + .file-name-display');

    // --- ESTADO ---
    let alignerWorker = null;
    let currentInputMode = 'upload';
    // NEW: State to track validity of each file
    let isFile1Valid = false;
    let isFile2Valid = false;

    // ==================================================================
    // ===== NUEVA SECCIÓN: LÓGICA DE VALIDACIÓN Y UI ===================
    // ==================================================================

    function updateSubmitButtonState() {
        // Enable the button only if both files are valid or if we are in paste mode with text
        if (currentInputMode === 'upload') {
            alignButton.disabled = !(isFile1Valid && isFile2Valid);
        } else { // paste mode
            const hasText1 = seq1TextInput.value.trim().length > 0;
            const hasText2 = seq2TextInput.value.trim().length > 0;
            alignButton.disabled = !(hasText1 && hasText2);
        }
    }

    async function handleFileValidation(event, sequenceNumber) {
        const fileInput = sequenceNumber === 1 ? seq1FileInput : seq2FileInput;
        const display = sequenceNumber === 1 ? fileName1Display : fileName2Display;
        const file = fileInput.files[0];

        if (!file) {
            display.textContent = 'No file selected';
            if (sequenceNumber === 1) isFile1Valid = false;
            else isFile2Valid = false;
            updateSubmitButtonState();
            return;
        }

        display.textContent = 'Validating...';
        display.style.color = 'var(--color-text-secondary)';

        const validationResult = await FileValidator.validate(file, {
            allowedExtensions: ['.fasta', '.fa', '.fna', '.txt'],
            maxSizeMB: 50
        });

        if (validationResult.isValid) {
            display.textContent = validationResult.message;
            if (sequenceNumber === 1) isFile1Valid = true;
            else isFile2Valid = true;
        } else {
            display.textContent = validationResult.message;
            display.style.color = '#FF6B6B'; // Error color
            fileInput.value = ''; // Clear the invalid file
            if (sequenceNumber === 1) isFile1Valid = false;
            else isFile2Valid = false;
        }
        updateSubmitButtonState();
    }

    // --- LÓGICA DE UI (MODIFICADA) ---
    function switchInputMode(mode) {
        currentInputMode = mode;
        modeUploadBtn.classList.toggle('active', mode === 'upload');
        modePasteBtn.classList.toggle('active', mode === 'paste');
        uploadContainer.classList.toggle('hidden', mode !== 'upload');
        pasteContainer.classList.toggle('hidden', mode !== 'paste');
        
        // Reset validation state on switch
        isFile1Valid = false;
        isFile2Valid = false;
        updateSubmitButtonState();
    }

    // --- LÓGICA DE PROCESAMIENTO (MODIFICADA) ---

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve("");
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsText(file);
        });
    }

    async function getSequences() {
        if (currentInputMode === 'upload') {
            const file1 = seq1FileInput.files[0];
            const file2 = seq2FileInput.files[0];
            if (!file1 || !file2) throw new Error('Please select two valid sequence files.');
            
            const [content1, content2] = await Promise.all([
                readFileAsText(file1),
                readFileAsText(file2)
            ]);
            return { seq1: cleanSequence(content1), seq2: cleanSequence(content2) };
        } else {
            return { seq1: cleanSequence(seq1TextInput.value), seq2: cleanSequence(seq2TextInput.value) };
        }
    }

    function cleanSequence(rawSeq) {
        if (!rawSeq) return '';
        if (rawSeq.trim().startsWith('>')) {
            return rawSeq.split('\n').slice(1).join('').replace(/\s/g, '').toUpperCase();
        }
        return rawSeq.replace(/\s/g, '').toUpperCase();
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        resetUI();
        statusMessage.textContent = 'Reading and validating sequences...';
        statusContainer.classList.remove('hidden');

        try {
            const { seq1, seq2 } = await getSequences();
            if (!seq1 || !seq2) throw new Error('One or both sequences are empty.');

            if (seq1.length > NEEDLEMAN_MAX_LEN || seq2.length > NEEDLEMAN_MAX_LEN) {
                throw new Error(`Sequences too long. Max length is ${NEEDLEMAN_MAX_LEN.toLocaleString()} bp.`);
            }

            resultsSection.classList.remove('hidden');
            
            const params = {
                matchScore: parseInt(matchInput.value, 10),
                mismatchPenalty: parseInt(mismatchInput.value, 10),
                gapPenalty: parseInt(gapInput.value, 10)
            };

            statusMessage.textContent = 'Aligning sequences in the background...';
            
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

    function resetUI() {
        if (alignerWorker) alignerWorker.terminate();
        statusContainer.classList.add('hidden');
        resultsSection.classList.add('hidden');
        summaryWrapper.innerHTML = '';
        alignmentDisplay.innerHTML = '';
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

    // --- EVENT LISTENERS E INICIALIZACIÓN ---
    function init() {
        alignerForm.addEventListener('submit', handleFormSubmit);
        modeUploadBtn.addEventListener('click', () => switchInputMode('upload'));
        modePasteBtn.addEventListener('click', () => switchInputMode('paste'));

        // ===== CAMBIO CLAVE: Usar el nuevo manejador de validación =====
        seq1FileInput.addEventListener('change', (e) => handleFileValidation(e, 1));
        seq2FileInput.addEventListener('change', (e) => handleFileValidation(e, 2));

        // Add listeners for paste mode to enable/disable button
        seq1TextInput.addEventListener('input', updateSubmitButtonState);
        seq2TextInput.addEventListener('input', updateSubmitButtonState);
        
        switchInputMode('upload');
        updateSubmitButtonState(); // Initial state
    }

    init();
});