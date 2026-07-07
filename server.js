require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mongoose = require('mongoose');

const Jogador = require('./models/Jogador');

const app = express();
app.use(express.json());
app.use(cors());

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI in environment variables');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB conectado');
}

// Função que será chamada pela IA via tools
async function adicionarXP(nickname, quantidade) {
  const nome = String(nickname || '').trim();
  const xp = Number(quantidade);

  if (!nome) throw new Error('nickname inválido');
  if (!Number.isFinite(xp)) throw new Error('quantidade inválida');

  const result = await Jogador.findOneAndUpdate(
    { nome },
    {
      $inc: { xp: xp },
      $setOnInsert: { nome },
    },
    { new: true, upsert: true }
  );

  // evita XP negativo
  if (result.xp < 0) {
    result.xp = 0;
    await result.save();
  }

  return { nome: result.nome, xp: result.xp };
}

app.post('/api/chat', async (req, res) => {
  try {
    const { pergunta, nickname } = req.body;

    if (!pergunta) {
      return res.status(400).json({ erro: "Você precisa enviar uma 'pergunta' no formato JSON." });
    }
    if (!nickname || !String(nickname).trim()) {
      return res.status(400).json({ erro: 'Você precisa enviar um nickname no formato JSON.' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const tools = [
      {
        functionDeclarations: [
          {
            name: 'adicionarXP',
            description: "Adiciona (ou remove) XP ao jogador pelo nickname. Cria o jogador se não existir.",
            parameters: {
              type: 'object',
              properties: {
                nickname: { type: 'string', description: 'Nickname do jogador' },
                quantidade: { type: 'number', description: 'Quantidade de XP a somar (pode ser negativa)' },
              },
              required: ['nickname', 'quantidade'],
              additionalProperties: false,
            },
          },
        ],
      },
    ];

    const systemInstruction = `Você é o Mestre do Jogo (Game Master) de um chatbot.

Regras obrigatórias:
1) Proponha charadas, missões ou avaliações de comportamento do usuário.
2) Se o usuário acertar uma charada, responder de forma educada e cooperativa, ou concluir a missão corretamente, VOCÊ DEVE chamar obrigatoriamente a função 'adicionarXP' com quantidade 50.
3) Se o usuário pedir a resposta ("me dê a resposta" ou equivalente), ou trapacear, VOCÊ DEVE chamar obrigatoriamente a função 'adicionarXP' com quantidade -10.
4) Se o usuário errar claramente a charada/mission, chame 'adicionarXP' com quantidade -5.
5) Nunca diga os pontos que o usuário tem atualmente.
6) Você deve responder com o texto do jogo (próxima charada/missão e instruções), e avisar apenas "ganhou" ou "perdeu" XP sem revelar total.

A chamada de função deve acontecer quando as regras 2-4 se aplicarem. Caso contrário, você não chama a função.`;

    const promptFinal = `nickname do jogador: ${nickname}\n\nMensagem do usuário: ${pergunta}`;

    // O SDK do @google/generative-ai para tools usa geração com options.tools
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + promptFinal }] }],
      tools,
      toolConfig: { functionCallingConfig: { mode: 'any' } },
    });

    // Tenta extrair o texto
    const respostaDaIA =
      result?.response?.text?.() ||
      result?.response?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      '';

    return res.status(200).json({
      sucesso: true,
      resposta: respostaDaIA || 'Vamos continuar o jogo!',
    });
  } catch (erro) {
    console.error('❌ Erro no servidor:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor de IA.' });
  }
});

app.get('/api/ranking', async (req, res) => {
  try {
    const top = await Jogador.find({}).sort({ xp: -1 }).limit(10).lean();

    const formatTitulo = (xp) => {
      if (xp < 100) return 'Novato';
      if (xp >= 500) return 'Lenda';
      return 'Jogador';
    };

    const ranking = top.map((j) => ({
      nome: j.nome,
      xp: j.xp,
      titulo: formatTitulo(j.xp),
    }));

    return res.status(200).json({ ranking });
  } catch (erro) {
    console.error('❌ Erro no ranking:', erro);
    return res.status(500).json({ erro: 'Erro ao obter ranking.' });
  }
});

const PORTA = process.env.PORT || 3000;

main()
  .then(() => {
    app.listen(PORTA, () => {
      console.log(`🚀 Servidor rodando na porta ${PORTA}`);
    });
  })
  .catch((err) => {
    console.error('❌ Falha ao iniciar:', err);
    process.exit(1);
  });

