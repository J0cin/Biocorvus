import json
import numpy as np
import gzip
from celery import Celery
from Bio.SeqIO.QualityIO import FastqGeneralIterator
from typing import Optional
from collections import Counter
import subprocess
from pathlib import Path
import re

# Configuración de Celery
celery_app = Celery(
    'tasks',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

def is_gzipped(file_path):
    with open(file_path, 'rb') as f:
        return f.read(2) == b'\x1f\x8b'

def _analyze_single_file(file_path: str):
    results = {"summary": {"total_reads": 0, "avg_gc_content": "0%", "avg_read_length": 0}, "per_base_quality": {}, "gc_content_distribution": []}
    total_gc, total_length = 0, 0

    def analyze_handle(in_handle):
        nonlocal total_gc, total_length
        for title, seq, qual in FastqGeneralIterator(in_handle):
            results["summary"]["total_reads"] += 1
            read_len = len(seq)
            total_length += read_len
            gc_count = seq.count('G') + seq.count('C')
            gc_content = (gc_count / read_len) * 100 if read_len > 0 else 0
            total_gc += gc_content
            results["gc_content_distribution"].append(gc_content)
            phred_scores = [ord(q) - 33 for q in qual]
            for i, score in enumerate(phred_scores):
                pos = i + 1
                if pos not in results["per_base_quality"]: results["per_base_quality"][pos] = []
                results["per_base_quality"][pos].append(score)

    if is_gzipped(file_path):
        with gzip.open(file_path, "rt") as handle: analyze_handle(handle)
    else:
        with open(file_path, "r") as handle: analyze_handle(handle)
    
    if results["summary"]["total_reads"] > 0:
        results["summary"]["avg_gc_content"] = round(total_gc / results["summary"]["total_reads"], 2)
        results["summary"]["avg_read_length"] = round(total_length / results["summary"]["total_reads"], 2)

    quality_chart_data = {}
    for pos, scores in results["per_base_quality"].items():
        quality_chart_data[pos] = {"mean": np.mean(scores), "q1": np.percentile(scores, 25), "median": np.median(scores), "q3": np.percentile(scores, 75)}
    results["per_base_quality_chart"] = quality_chart_data
    del results["per_base_quality"]
    if results["summary"]["total_reads"] == 0: raise ValueError("No valid FASTQ reads were found.")
    return results


@celery_app.task(name='process_qc_job', bind=True)
def process_qc_job(self, file_path1: str, file_path2: Optional[str], job_id: str):
   
    self.update_state(state='STARTED')
    final_results = {}
    try:
        final_results["file1"] = _analyze_single_file(file_path1)
        if file_path2:
            final_results["file2"] = _analyze_single_file(file_path2)
            comparison_metrics = {}
            gc_diff = abs(final_results["file1"]["summary"]["avg_gc_content"] - final_results["file2"]["summary"]["avg_gc_content"])
            comparison_metrics["gc_content_difference"] = f"{round(gc_diff, 2)}%"
            q_means1 = [d["mean"] for d in final_results["file1"]["per_base_quality_chart"].values()]
            q_means2 = [d["mean"] for d in final_results["file2"]["per_base_quality_chart"].values()]
            min_len = min(len(q_means1), len(q_means2))
            mae = np.mean(np.abs(np.array(q_means1[:min_len]) - np.array(q_means2[:min_len])))
            similarity_index = max(0, 100 - mae * 5)
            comparison_metrics["quality_similarity_index"] = f"{similarity_index:.2f}%"
            final_results["comparison"] = comparison_metrics
        with open(f"results/{job_id}.json", "w") as out_handle: json.dump(final_results, out_handle, indent=4)
    except Exception as e:
        self.update_state(state='FAILURE', meta={'exc': str(e)})
        raise e
    return final_results

def sliding_window_trim(seq, qual, quality_threshold, window_size=4):
    if not seq: return "", ""
    for i in range(len(seq) - window_size + 1):
        window_qualities = [ord(q) - 33 for q in qual[i:i+window_size]]
        if (sum(window_qualities) / window_size) < quality_threshold: return seq[:i], qual[:i]
    return seq, qual

def is_low_complexity(seq, threshold=0.5):
    if not seq: return True
    if len(set(seq)) <= 2:
        counts = Counter(seq)
        if counts.most_common(1)[0][1] / len(seq) > threshold: return True
    return False

@celery_app.task(name='process_cleaner_job', bind=True)
def process_cleaner_job(self, file_path: str, job_id: str, adapter_seq: str, quality_threshold: int,
                        min_length: int, max_length: int, max_n_percent: int,
                        deduplicate: bool, filter_complexity: bool):  
    
    
    self.update_state(state='STARTED')
    
    stats = {
        "reads_processed": 0, "reads_passed": 0,
        "discard_reasons": {
            "duplicate": {"count": 0},
            "quality_failed": {"count": 0}, # NUEVA CATEGORÍA
            "too_short": {"count": 0, "lengths": []},
            "too_long": {"count": 0, "lengths": []},
            "too_many_n": {"count": 0, "n_percents": []},
            "low_complexity": {"count": 0}
        }
    }
    cleaned_reads_content, seen_sequences = [], set()

    try:
        open_func = gzip.open if is_gzipped(file_path) else open
        mode = "rt" if is_gzipped(file_path) else "r"

        with open_func(file_path, mode) as handle:
            for title, seq, qual in FastqGeneralIterator(handle):
                stats["reads_processed"] += 1
                
                if deduplicate:
                    if seq in seen_sequences:
                        stats["discard_reasons"]["duplicate"]["count"] += 1
                        continue
                    seen_sequences.add(seq)

                if adapter_seq and adapter_seq in seq:
                    pos = seq.find(adapter_seq)
                    seq, qual = seq[:pos], qual[:pos]

                # LÓGICA CORREGIDA
                seq, qual = sliding_window_trim(seq, qual, quality_threshold)

                # 1. Comprobar si la lectura fue eliminada por calidad
                if not seq:
                    stats["discard_reasons"]["quality_failed"]["count"] += 1
                    continue

                # 2. Ahora, comprobar la longitud
                if len(seq) < min_length:
                    stats["discard_reasons"]["too_short"]["count"] += 1
                    stats["discard_reasons"]["too_short"]["lengths"].append(len(seq))
                    continue
                
                if len(seq) > max_length:
                    stats["discard_reasons"]["too_long"]["count"] += 1
                    stats["discard_reasons"]["too_long"]["lengths"].append(len(seq))
                    continue

                n_percent = (seq.count('N') / len(seq)) * 100
                if n_percent > max_n_percent:
                    stats["discard_reasons"]["too_many_n"]["count"] += 1
                    stats["discard_reasons"]["too_many_n"]["n_percents"].append(n_percent)
                    continue

                if filter_complexity and is_low_complexity(seq):
                    stats["discard_reasons"]["low_complexity"]["count"] += 1
                    continue
                
                stats["reads_passed"] += 1
                cleaned_reads_content.append(f"@{title}\n{seq}\n+\n{qual}\n")

        total_discarded = stats["reads_processed"] - stats["reads_passed"]
        
        for reason, data in stats["discard_reasons"].items():
            if "lengths" in data and data["count"] > 0: data["average_value"] = f"Avg. {round(np.mean(data['lengths']), 1)} bp"
            if "n_percents" in data and data["count"] > 0: data["average_value"] = f"Avg. {round(np.mean(data['n_percents']), 1)}%"

        final_results = {
            "summary": {
                "reads_processed": stats["reads_processed"], "reads_passed": stats["reads_passed"],
                "reads_discarded": total_discarded, "details": stats["discard_reasons"]
            },
            "cleaned_data": "".join(cleaned_reads_content)
        }

        with open(f"results/{job_id}.json", "w") as out_handle: json.dump(final_results, out_handle, indent=4)

    except Exception as e:
        self.update_state(state='FAILURE', meta={'exc': str(e)})
        raise e

    return final_results

# --- genome scout ---

@celery_app.task(name='process_scout_job_custom', bind=True)
def process_scout_job_custom(self, job_id: str, file_path1: str, file_path2: Optional[str], 
                             ref_genome_path: str, run_variant_calling: bool, min_mapping_quality: int):
    
    self.update_state(state='STARTED', meta={'status': 'Preparing analysis...'})
    
    result_dir = Path(f"results/{job_id}")
    result_dir.mkdir(exist_ok=True)
    
    bam_path = str(result_dir / f"{job_id}.bam")
    sorted_bam_path = str(result_dir / f"{job_id}.sorted.bam")
    vcf_path = str(result_dir / f"{job_id}.vcf")
    summary_json_path = str(result_dir / f"{job_id}.json")

    try:
        self.update_state(state='PROGRESS', meta={'status': 'Indexing reference genome...'})
        subprocess.run(['bwa', 'index', ref_genome_path], check=True, capture_output=True, text=True)

        self.update_state(state='PROGRESS', meta={'status': 'Aligning reads with BWA...'})
        bwa_command = ['bwa', 'mem', '-t', '4', ref_genome_path, file_path1]
        if file_path2:
            bwa_command.append(file_path2)
        
        with open(bam_path, 'wb') as bam_file:
            bwa_process = subprocess.Popen(bwa_command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            samtools_process = subprocess.Popen(
                ['samtools', 'view', '-bS', '-q', str(min_mapping_quality), '-'], 
                stdin=bwa_process.stdout, 
                stdout=bam_file,
                stderr=subprocess.PIPE
            )
        bwa_process.stdout.close()
        bwa_stderr = bwa_process.communicate()[1]
        samtools_stderr = samtools_process.communicate()[1]

        if bwa_process.returncode != 0:
            raise subprocess.CalledProcessError(bwa_process.returncode, bwa_command, stderr=bwa_stderr.decode())
        if samtools_process.returncode != 0:
            raise subprocess.CalledProcessError(samtools_process.returncode, 'samtools view', stderr=samtools_stderr.decode())

        self.update_state(state='PROGRESS', meta={'status': 'Sorting and indexing BAM...'})
        subprocess.run(['samtools', 'sort', bam_path, '-o', sorted_bam_path], check=True, capture_output=True, text=True)
        subprocess.run(['samtools', 'index', sorted_bam_path], check=True, capture_output=True, text=True)

        # --- NUEVO: CALCULAR LA TASA DE ALINEAMIENTO REAL ---
        self.update_state(state='PROGRESS', meta={'status': 'Calculating alignment stats...'})
        flagstat_result = subprocess.run(['samtools', 'flagstat', sorted_bam_path], check=True, capture_output=True, text=True)
        
        alignment_rate = 0.0
        # Usamos una expresión regular para encontrar la línea con el porcentaje de mapeo
        match = re.search(r'(\d+\.\d+)% mapped', flagstat_result.stdout)
        if match:
            alignment_rate = float(match.group(1))

        # --- NUEVO: COMPROBAR SI EL ALINEAMIENTO FUE EXITOSO ---
        if alignment_rate < 1.0: # Si menos del 1% de las lecturas alinearon
            # Modificamos el flujo para no llamar variantes y advertir al usuario
            run_variant_calling = False
            variant_stats = {"message": "Alignment rate was too low to perform variant calling."}
        else:
            variant_stats = {}
            if run_variant_calling:
                self.update_state(state='PROGRESS', meta={'status': 'Calling variants with FreeBayes...'})
                with open(vcf_path, "w") as vcf_file:
                    subprocess.run(
                        ['freebayes', '-f', ref_genome_path, sorted_bam_path], 
                        check=True, stdout=vcf_file, stderr=subprocess.PIPE
                    )
                num_variants = sum(1 for line in open(vcf_path) if not line.startswith('#'))
                variant_stats = {"total_variants": num_variants}

        final_results = {
            "summary": {
                "reference_genome": Path(ref_genome_path).name,
                "alignment_rate": alignment_rate, # Usamos el valor real
                "variant_calling_performed": run_variant_calling,
                "variant_calling_stats": variant_stats
            }
        }
        with open(summary_json_path, "w") as out_handle:
            json.dump(final_results, out_handle, indent=4)

    except subprocess.CalledProcessError as e:
        cmd_str = ' '.join(e.cmd) if isinstance(e.cmd, list) else e.cmd
        error_message = f"Command failed with exit code {e.returncode}.\nCMD: {cmd_str}\nStderr: {e.stderr}"
        raise Exception(error_message) from e
    
    return final_results

@celery_app.task(name='test_task')
def test_task(x, y):
    result = x + y
    print(f"--- [TAREA DE PRUEBA EJECUTADA] El resultado de {x} + {y} es {result} ---")
    return result