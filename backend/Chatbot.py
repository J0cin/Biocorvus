from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from sentence_transformers import SentenceTransformer
import faiss

# ------------------------
# Inicialización
# ------------------------
app = FastAPI()


# 👇 AÑADIR ESTE BLOQUE COMPLETO
origins = [
    "https://biocorvus.vercel.app",  # Tu dominio de Vercel
    "http://localhost:3000",        # Si pruebas el frontend localmente
    "http://127.0.0.1:5500"          # Para abrir index.html directamente
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ------------------------
# Modelo de embeddings
embedder = SentenceTransformer("paraphrase-MiniLM-L3-v2")

# Base de conocimiento (ejemplo simple, luego puedes meter PDFs)
docs = [
    "El SH-SY5Y es una línea celular usada en neurobiología.",
    "Las vacunas de ARN mensajero se basan en la traducción de proteínas.",
    "Los biopolímeros como PHA se producen mediante bacterias."
]
doc_embeddings = embedder.encode(docs)

# Index FAISS para búsquedas
index = faiss.IndexFlatL2(doc_embeddings.shape[1])
index.add(doc_embeddings)

# Configuración de Mistral
MISTRAL_API_KEY = "kbUvBEvmvjTTsc4YAVpPjMG9C4WO59mz"   # 👈 pon tu API key aquí
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
SYSTEM_PROMPT = "Eres un asistente especializado en biotecnología. Usa los documentos relevantes para responder."

# ------------------------
# Definición del request
# ------------------------
class ChatRequest(BaseModel):
    user_message: str

# ------------------------
# Endpoint principal
# ------------------------
@app.post("/chat")
def chat(req: ChatRequest):
    user_message = req.user_message

    # Buscar contexto relevante en FAISS
    query_vec = embedder.encode([user_message])
    _, I = index.search(query_vec, 2)   # top-2 documentos
    context = "\n".join([docs[i] for i in I[0]])

    # Preparar prompt para Mistral
    payload = {
        "model": "mistral-small",   # o el modelo que uses
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Pregunta: {user_message}\n\nContexto:\n{context}"}
        ]
    }

    headers = {"Authorization": f"Bearer {MISTRAL_API_KEY}"}
    response = requests.post(MISTRAL_URL, json=payload, headers=headers)
    output = response.json()["choices"][0]["message"]["content"]

    return {"response": output, "context_used": context}
