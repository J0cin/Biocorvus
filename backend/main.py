import uuid
from pathlib import Path
from typing import Optional

# ¡IMPORTANTE! Importamos las tareas directamente desde el worker
from worker import process_qc_job, process_cleaner_job, process_scout_job_custom
from worker import test_task
import redis

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from worker import celery_app # Importamos la instancia de la app de Celery

# --- Configuración de la App ---

Path("uploads").mkdir(exist_ok=True)
Path("results").mkdir(exist_ok=True)

app = FastAPI()


# Lista de orígenes que tienen permiso para hablar con tu API
origins = [
    # La URL que Render te dará para tu frontend (pon la real cuando la tengas)
    "https://tu-frontend.onrender.com", 
    
    # Para tus pruebas locales desde http://127.0.0.1 o http://localhost
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:8000", # A veces se necesita el puerto
    "http://127.0.0.1:8000",

    # CRÍTICO: Para permitir abrir los archivos .html directamente desde tu disco
    "null", 
]

app.add_middleware(
    CORSMiddleware,
    # Cambiamos allow_origins a True para permitir cualquier origen por ahora,
    # o puedes usar la lista `origins` para ser más específico.
    # Para depurar, empecemos con la opción más abierta:
    allow_origins=["*"], 
    
    allow_credentials=True,
    allow_methods=["*"], # Permite todos los métodos (GET, POST, etc.)
    allow_headers=["*"], # Permite todas las cabeceras
)


# --- Funciones de Ayuda (ligeramente modificada) ---

def save_upload_file(upload_file: UploadFile, job_id: str, suffix: str) -> str:
    """Guarda un archivo subido y devuelve su ruta absoluta en formato Linux."""
    original_filename = upload_file.filename
    # Simplificamos las extensiones
    file_extension = "".join(Path(original_filename).suffixes)
    
    # Esta validación sigue siendo útil
    allowed_extensions = {".fastq", ".fq", ".fastq.gz", ".fq.gz", ".fasta", ".fa"}
    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Formato de archivo no soportado: '{file_extension}'.")
    
    job_dir = Path(f"uploads/{job_id}")
    job_dir.mkdir(exist_ok=True, parents=True)
    
    file_path = job_dir / f"{original_filename}" # Usamos el nombre original para claridad
    
    with open(file_path, "wb") as buffer:
        buffer.write(upload_file.file.read())
        
    # Como este script correrá en WSL, .resolve() devolverá una ruta de Linux (/home/user/...)
    # ¡Ya no se necesita ninguna traducción!
    return str(file_path.resolve())

# --- Endpoints de la API (Ahora envían tareas a Celery) ---

@app.post("/api/jobs", status_code=202) # Quality Inspector
def run_qc_inspector(file1: UploadFile = File(...), file2: Optional[UploadFile] = File(None)):
    job_id = str(uuid.uuid4())
    file_path1 = save_upload_file(file1, job_id, suffix="_1")
    file_path2 = save_upload_file(file2, job_id, suffix="_2") if file2 else None
    
    # EN LUGAR DE REQUESTS, AHORA USAMOS CELERY
    task = process_qc_job.delay(file_path1=file_path1, file_path2=file_path2, job_id=job_id)
    
    return {"job_id": task.id} # Devolvemos el ID de la tarea para consultar su estado

@app.post("/api/clean", status_code=202) # Sequence Cleaner
def run_sequence_cleaner(
    file: UploadFile = File(...),
    adapter: str = Form(""),
    quality_threshold: int = Form(20),
    min_length: int = Form(50),
    max_length: int = Form(150),
    max_n_percent: int = Form(10),
    deduplicate: bool = Form(False),
    filter_complexity: bool = Form(False)
):
    job_id = str(uuid.uuid4())
    file_path = save_upload_file(file, job_id, suffix="_clean_input")
    
    task = process_cleaner_job.delay(
        job_id=job_id, file_path=file_path, adapter_seq=adapter,
        quality_threshold=quality_threshold, min_length=min_length,
        max_length=max_length, max_n_percent=max_n_percent,
        deduplicate=deduplicate, filter_complexity=filter_complexity
    )
    return {"job_id": task.id}

@app.post("/api/scout/custom", status_code=202) # Genome Scout
def run_genome_scout_custom_reference(
    file1: UploadFile = File(...),
    reference_fasta: UploadFile = File(...),
    file2: Optional[UploadFile] = File(None),
    run_variant_calling: bool = Form(False),
    min_mapping_quality: int = Form(0)
):
    job_id = str(uuid.uuid4())
    file_path1 = save_upload_file(file1, job_id, suffix="_r1")
    ref_path = save_upload_file(reference_fasta, job_id, suffix="_ref")
    file_path2 = save_upload_file(file2, job_id, suffix="_r2") if file2 else None
    
    task = process_scout_job_custom.delay(
        job_id=job_id, file_path1=file_path1, file_path2=file_path2,
        ref_genome_path=ref_path, run_variant_calling=run_variant_calling,
        min_mapping_quality=min_mapping_quality
    )
    return {"job_id": task.id}

# --- NUEVO Endpoint para consultar el estado de un Job ---
@app.get("/api/jobs/{task_id}")
def get_job_status(task_id: str):
    task_result = AsyncResult(task_id, app=celery_app)
    
    response = {
        "id": task_id,
        "state": task_result.state,
        "details": task_result.info, # Celery guarda aquí lo que pongas en update_state
    }
    
    if task_result.successful():
        response["result"] = task_result.get()
    elif task_result.failed():
        response["result"] = str(task_result.info) # Muestra la excepción
        
    return response


@app.get("/api/download/{job_id}/{file_type}")
def download_result_file(job_id: str, file_type: str):
    """Endpoint para descargar archivos de resultados como BAM o VCF."""
    allowed_types = {"bam": ".sorted.bam", "vcf": ".vcf"}
    if file_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File type not allowed.")
    
    file_suffix = allowed_types[file_type]
    result_path = Path(f"results/{job_id}/{job_id}{file_suffix}")
    
    if not result_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found at {result_path}")
    
    return FileResponse(result_path, filename=f"{job_id}_result{file_suffix}")


@app.get("/api/debug-celery")
def trigger_celery_debug():
    """
    Este endpoint prueba la conexión a Redis y el encolado de una tarea de Celery.
    """
    results = {}
    
    # Prueba 1: ¿Puede FastAPI conectar directamente a Redis?
    try:
        r = redis.Redis.from_url("redis://localhost:6379/0")
        r.ping()
        results["redis_connection"] = "SUCCESS"
    except Exception as e:
        results["redis_connection"] = f"FAILED: {e}"
        # Si esto falla, no tiene sentido continuar.
        return results

    # Prueba 2: ¿Puede FastAPI encolar una tarea?
    try:
        # Usamos la tarea de prueba súper simple
        task = test_task.delay(5, 5)
        results["celery_task_dispatch"] = "SUCCESS"
        results["dispatched_task_id"] = task.id
    except Exception as e:
        # Esta es la parte crucial. Si .delay() falla, lo capturaremos aquí.
        results["celery_task_dispatch"] = f"FAILED: {e}"

    return results