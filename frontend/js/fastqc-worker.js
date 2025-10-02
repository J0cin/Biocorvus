function parseFastq(textContent) {
    const lines = textContent.split('\n');
    const reads = [];
    for (let i = 0; i < lines.length; i += 4) {
        if (i + 3 < lines.length && lines[i].startsWith('@')) {
            reads.push({ title: lines[i].substring(1), seq: lines[i + 1], qual: lines[i + 3] });
        }
    }
    return reads;
}

const statsHelper = {
    mean: arr => arr.reduce((a, b) => a + b, 0) / arr.length,
    median: arr => {
        const mid = Math.floor(arr.length / 2), nums = [...arr].sort((a, b) => a - b);
        return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    },
    percentile: (arr, p) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const pos = (sorted.length - 1) * (p / 100);
        const base = Math.floor(pos);
        const rest = pos - base;
        return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
    }
};

function analyzeSingleFile(textContent) {
    const reads = parseFastq(textContent);
    if (reads.length === 0) {
        throw new Error("No valid FASTQ reads were found.");
    }
    const results = {
        summary: { total_reads: 0, avg_gc_content: 0, avg_read_length: 0 },
        per_base_quality: {}, gc_content_distribution: []
    };
    let totalGcContentSum = 0, totalLengthSum = 0;
    for (const read of reads) {
        results.summary.total_reads++;
        const readLen = read.seq.length;
        totalLengthSum += readLen;
        const gcCount = (read.seq.match(/[GC]/gi) || []).length;
        const gcContent = (readLen > 0) ? (gcCount / readLen) * 100 : 0;
        results.gc_content_distribution.push(gcContent);
        totalGcContentSum += gcContent;
        for (let i = 0; i < read.qual.length; i++) {
            const pos = i + 1;
            const score = read.qual.charCodeAt(i) - 33;
            if (!results.per_base_quality[pos]) results.per_base_quality[pos] = [];
            results.per_base_quality[pos].push(score);
        }
    }
    results.summary.avg_gc_content = (totalGcContentSum / results.summary.total_reads).toFixed(2);
    results.summary.avg_read_length = (totalLengthSum / results.summary.total_reads).toFixed(2);
    const qualityChartData = {};
    for (const pos in results.per_base_quality) {
        const scores = results.per_base_quality[pos];
        qualityChartData[pos] = {
            mean: statsHelper.mean(scores), q1: statsHelper.percentile(scores, 25),
            median: statsHelper.median(scores), q3: statsHelper.percentile(scores, 75)
        };
    }
    results.per_base_quality_chart = qualityChartData;
    delete results.per_base_quality;
    return results;
}


// --- El "Cerebro" del Worker ---
// Esto escucha los mensajes de la página principal.
self.onmessage = function(event) {
    const { file1Content, file2Content, isComparison } = event.data;

    try {
        const finalResults = {};
        finalResults.file1 = analyzeSingleFile(file1Content);

        if (isComparison && file2Content) {
            finalResults.file2 = analyzeSingleFile(file2Content);
            // Calcular métricas de comparación
            const comparisonMetrics = {};
            const gc_diff = Math.abs(finalResults.file1.summary.avg_gc_content - finalResults.file2.summary.avg_gc_content);
            comparisonMetrics.gc_content_difference = `${gc_diff.toFixed(2)}%`;
            const q_means1 = Object.values(finalResults.file1.per_base_quality_chart).map(d => d.mean);
            const q_means2 = Object.values(finalResults.file2.per_base_quality_chart).map(d => d.mean);
            const min_len = Math.min(q_means1.length, q_means2.length);
            let mae = 0;
            for (let i = 0; i < min_len; i++) mae += Math.abs(q_means1[i] - q_means2[i]);
            mae /= min_len;
            const similarity_index = Math.max(0, 100 - mae * 5);
            comparisonMetrics.quality_similarity_index = `${similarity_index.toFixed(2)}%`;
            finalResults.comparison = comparisonMetrics;
        }

        // Enviar los resultados de vuelta a la página principal
        self.postMessage({ status: 'success', results: finalResults });

    } catch (error) {
        // Si algo falla, enviar un mensaje de error
        self.postMessage({ status: 'error', message: error.message });
    }
};