require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta } = req.body;

        if (!pergunta) {
            return res.status(400).json({ erro: "Você precisa enviar uma 'pergunta' no formato JSON." });
        }

        console.log(`📩 Nova pergunta recebida: "${pergunta}"`);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const promptFinal = `Você é um robô sarcástico. Responda a seguinte pergunta: ${pergunta}`;
        
        const result = await model.generateContent(promptFinal);
        const respostaDaIA = result.response.text();

        return res.status(200).json({ 
            sucesso: true,
            resposta: respostaDaIA 
        });

    } catch (erro) {
        console.error("❌ Erro no servidor:", erro);
        return res.status(500).json({ erro: "Erro interno no servidor de IA." });
    }
});

// A nuvem define a porta via process.env.PORT. Se não houver, usa a 3000 (local)
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando na porta ${PORTA}`);
});

