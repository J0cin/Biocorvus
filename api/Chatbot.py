import os
import faiss
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer
from PyPDF2 import PdfReader
import requests
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware # <-- MEJORA: Importar CORS

# Cargar variables de entorno (para pruebas locales)
load_dotenv()

# --- 1. Inicialización de la App y CORS ---
app = FastAPI()

# Permitir conexiones desde tu frontend en Vercel
origins = [
    "https://biocorvus.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. Configuración Centralizada ---
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
# <-- CORRECCIÓN: Usar un modelo oficial de Mistral. 'mistral-small-latest' es rápido y eficiente.
MODEL_NAME = "mistral-small-latest" 
SYSTEM_PROMPT = "Tu única identidad es 'BioCorvus Assistant', un agente de IA experto en bioinformática. Basa todas tus respuestas en el contexto proporcionado. Si la respuesta no está en el contexto, indica que no tienes esa información."

# --- 3. Carga de Modelos y Datos (Singleton Pattern) ---
# Usamos un diccionario para cargar los modelos solo una vez de forma "perezosa"
cache = {}

def get_knowledge_base():
    if "knowledge_base" not in cache:
        print("Cargando y procesando documentos por primera vez...")
        
        # Lógica para cargar y procesar los PDFs
        pdf_docs = []
        folder_path = "./docs" # Asume una carpeta 'docs' en el mismo directorio que el script
        if os.path.exists(folder_path):
            for file in os.listdir(folder_path):
                if file.endswith(".pdf"):
                    reader = PdfReader(os.path.join(folder_path, file))
                    text = "".join(page.extract_text() or "" for page in reader.pages)
                    pdf_docs.append(text)
        
        # Si no hay PDFs, usamos un texto por defecto para que no falle
        if not pdf_docs:
            pdf_docs = ["No se encontraron documentos de conocimiento. El chatbot responderá con conocimiento general."]

        all_texts = []
        for doc in pdf_docs:
            # Dividir el texto en trozos más manejables
            words = doc.split()
            chunks = [" ".join(words[i:i + 400]) for i in range(0, len(words), 350)]
            all_texts.extend(chunks)

        # Cargar modelo de embeddings (¡esta es la parte pesada!)
        embedder = SentenceTransformer("paraphrase-MiniLM-L3-v2") # Usamos el modelo ligero
        embeddings = embedder.encode(all_texts, convert_to_numpy=True)
        
        index = faiss.IndexFlatL2(embeddings.shape[1])
        index.add(embeddings)
        
        cache["knowledge_base"] = {
            "embedder": embedder,
            "index": index,
            "corpus": all_texts
        }
        print("Base de conocimiento cargada y lista.")
    return cache["knowledge_base"]

# --- 4. Definición de Endpoints ---
class ChatRequest(BaseModel):
    user_message: str

@app.post("/api/Chatbot") # Ruta compatible con Vercel
async def chat_endpoint(req: ChatRequest):
    # Carga la base de conocimiento (la primera vez tardará, las siguientes será instantáneo)
    kb = get_knowledge_base()
    embedder = kb["embedder"]
    index = kb["index"]
    corpus = kb["corpus"]

    # Búsqueda de contexto
    query_vec = embedder.encode([req.user_message], convert_to_numpy=True)
    _, I = index.search(query_vec, k=3) # Buscamos los 3 trozos más relevantes
    retrieved_chunks = [corpus[i] for i in I[0]]
    context = "\n\n---\n\n".join(retrieved_chunks)

    # Construcción del prompt
    prompt = f"Contexto:\n{context}\n\nPregunta del usuario: {req.user_message}"

    headers = {"Authorization": f"Bearer {MISTRAL_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 200
    }

    try:
        resp = requests.post(MISTRAL_API_URL, headers=headers, json=payload)
        resp.raise_for_status() # Lanza un error si la respuesta no es 2xx
        result = resp.json()
        answer = result.get("choices", [{}])[0].get("message", {}).get("content", "No se pudo obtener una respuesta.")
        return {"response": answer, "context_used": retrieved_chunks}
    except requests.exceptions.RequestException as e:
        return {"error": "Error al conectar con la API de Mistral", "details": str(e)}
    except (KeyError, IndexError) as e:
        return {"error": "La respuesta de la API de Mistral no tuvo el formato esperado.", "details": str(e)}