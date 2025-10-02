// js/aligner-worker.js

/**
 * Implementación del algoritmo Needleman-Wunsch.
 * Este se ejecuta en un hilo separado para no bloquear la UI.
 */
self.onmessage = function(e) {
    const { seq1, seq2, matchScore, mismatchPenalty, gapPenalty } = e.data;

    // 1. Inicializar la matriz de puntuación (dp table)
    const n = seq1.length;
    const m = seq2.length;
    const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));

    for (let i = 0; i <= n; i++) {
        dp[i][0] = i * gapPenalty;
    }
    for (let j = 0; j <= m; j++) {
        dp[0][j] = j * gapPenalty;
    }

    // 2. Llenar la matriz
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const match = dp[i - 1][j - 1] + (seq1[i - 1] === seq2[j - 1] ? matchScore : mismatchPenalty);
            const del = dp[i - 1][j] + gapPenalty; // Gap en seq2
            const ins = dp[i][j - 1] + gapPenalty; // Gap en seq1
            dp[i][j] = Math.max(match, del, ins);
        }
    }

    // 3. Reconstruir el alineamiento (Traceback)
    let align1 = '';
    let align2 = '';
    let i = n;
    let j = m;
    let gaps = 0;
    let identity = 0;

    while (i > 0 || j > 0) {
        const score = dp[i][j];
        const scoreDiag = (i > 0 && j > 0) ? dp[i - 1][j - 1] : -Infinity;
        const scoreUp = (i > 0) ? dp[i - 1][j] : -Infinity;
        const scoreLeft = (j > 0) ? dp[i][j - 1] : -Infinity;

        if (i > 0 && j > 0 && score === scoreDiag + (seq1[i - 1] === seq2[j - 1] ? matchScore : mismatchPenalty)) {
            align1 = seq1[i - 1] + align1;
            align2 = seq2[j - 1] + align2;
            if (seq1[i - 1] === seq2[j - 1]) {
                identity++;
            }
            i--;
            j--;
        } else if (i > 0 && score === scoreUp + gapPenalty) {
            align1 = seq1[i - 1] + align1;
            align2 = '-' + align2;
            gaps++;
            i--;
        } else {
            align1 = '-' + align1;
            align2 = seq2[j - 1] + align2;
            gaps++;
            j--;
        }
    }

    const alignmentScore = dp[n][m];
    const identityPercent = ((identity / align1.length) * 100).toFixed(2);

    // Enviar los resultados de vuelta al hilo principal
    self.postMessage({
        alignmentScore,
        identityPercent,
        gaps,
        align1,
        align2
    });
};