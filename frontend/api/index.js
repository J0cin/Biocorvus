// api/index.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// La ruta principal de tu API que será llamada por el frontend
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // --- Preparamos la petición para la API de Mistral ---
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    const mistralApiUrl = process.env.MISTRAL_API_URL;

    // El "System Prompt" que definiste en la interfaz de Mistral.
    // Es buena práctica enviarlo en cada petición para reforzar las instrucciones.
    const systemPrompt = `Tu única identidad es "BioCorvus Assistant", un agente de IA experto en bioinformática. NUNCA menciones que eres un modelo de Mistral. Basa todas tus respuestas en tu conocimiento sobre las herramientas Quality Inspector, Sequence Cleaner y Sequence Aligner. Si una pregunta se sale de este ámbito, declina amablemente la respuesta.`;

    try {
        const response = await fetch(mistralApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mistralApiKey}`
            },
            body: JSON.stringify({
                // Aquí es donde probablemente uses el ID de tu agente como el modelo
                model: 'mistralai/mistral-7b-instruct:free', // O el modelo que corresponda a tu agente, ej: 'ft:mistral-large:...'
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                temperature: 0.15, // Coincide con la "Randomness" que estableciste
                max_tokens: 300
            })
        });

        if (!response.ok) {
            // Si la API de Mistral devuelve un error, lo pasamos al frontend
            const errorData = await response.json();
            console.error("Error from Mistral API:", errorData);
            throw new Error(`Mistral API error: ${response.statusText}`);
        }

        const result = await response.json();
        const botResponse = result.choices[0]?.message?.content || "No he podido generar una respuesta.";

        res.json({ reply: botResponse });

    } catch (error) {
        console.error("Error calling Mistral API:", error);
        res.status(500).json({ error: 'Failed to get a response from the AI model.' });
    }
});

// Exportamos la app para que Vercel la pueda usar
module.exports = app;