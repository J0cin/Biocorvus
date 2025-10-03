import os
from fastapi import FastAPI
from pydantic import BaseModel
import requests
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# Cargar variables de entorno (para pruebas locales)
load_dotenv()

# --- 1. Inicialización de la App y CORS ---
app = FastAPI()

# Permitir conexiones desde tu frontend en Vercel
origins = [
    "https://biocorvus.vercel.app",
    "http://127.0.0.1:5500",
    "http://localhost:3000" # Si usas un entorno de desarrollo de frontend
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. Configuración y Base de Conocimiento Interna ---
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MODEL_NAME = "mistral-small-latest" # Usamos un modelo oficial, rápido y eficiente

# ¡LA INFORMACIÓN AHORA VIVE AQUÍ DENTRO!
KNOWLEDGE_BASE_TEXT = """
Documentación de Herramientas BioCorvus:

1.  **Quality Inspector**:
    -   **Función**: Analiza la calidad de archivos de secuenciación en formato FASTQ.
    -   **Uso**: El usuario sube un archivo FASTQ o FASTQ.gz.
    -   **Resultado**: Genera un reporte visual en HTML que muestra métricas como la calidad de las bases por ciclo, el contenido de GC, la presencia de secuencias sobre-representadas y la duplicación de secuencias. Ayuda a decidir si los datos crudos son de buena calidad para análisis posteriores.

2.  **Sequence Cleaner**:
    -   **Función**: Limpia y pre-procesa datos de secuenciación crudos para mejorar la calidad del análisis.
    -   **Uso**: El usuario sube su archivo FASTQ y selecciona las operaciones a realizar (ej. recortar adaptadores, filtrar por calidad).
    -   **Resultado**: Devuelve un nuevo archivo FASTQ limpio, listo para ser usado en alineamientos u otros análisis. Eliminar datos de baja calidad es crucial para obtener resultados fiables.

3.  **Sequence Aligner**:
    -   **Función**: Realiza el alineamiento de secuencias de ADN o proteínas contra un genoma de referencia.
    -   **Uso**: El usuario proporciona sus secuencias (en formato FASTA o FASTQ) y elige un genoma de referencia de una lista predefinida o sube el suyo.
    -   **Resultado**: Genera un archivo en formato SAM o BAM que describe dónde y cómo cada secuencia se alinea con el genoma de referencia.
"""

SYSTEM_PROMPT = "Tu única identidad es 'BioCorvus Assistant', un agente de IA experto en las herramientas bioinformáticas Quality Inspector, Sequence Cleaner y Sequence Aligner. Basa todas tus respuestas únicamente en la 'Documentación de Herramientas BioCorvus' que se te proporciona en el contexto. Si una pregunta se sale de este ámbito o la respuesta no está en la documentación, declina amablemente la respuesta diciendo que solo puedes responder sobre las herramientas mencionadas."

# --- 3. Definición de Endpoints ---
class ChatRequest(BaseModel):
    user_message: str

@app.post("/api/Chatbot") # Ruta compatible con Vercel
async def chat_endpoint(req: ChatRequest):
    user_question = req.user_message

    # Construimos el prompt que le pasaremos al modelo
    user_prompt = f"""
    Basándote estrictamente en la siguiente documentación, responde la pregunta del usuario.

    ---
    Documentación de Herramientas BioCorvus:
    {KNOWLEDGE_BASE_TEXT}
    ---

    Pregunta del usuario: "{user_question}"
    """

    headers = {"Authorization": f"Bearer {MISTRAL_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 400
    }

    try:
        resp = requests.post(MISTRAL_API_URL, headers=headers, json=payload)
        resp.raise_for_status()
        result = resp.json()
        answer = result["choices"][0]["message"]["content"]
        return {"response": answer}
    except requests.exceptions.RequestException as e:
        return {"error": "Error al conectar con la API de Mistral", "details": str(e)}
    except (KeyError, IndexError):
        return {"error": "Respuesta inesperada de la API de Mistral."}