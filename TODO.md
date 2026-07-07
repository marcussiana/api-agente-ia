# TODO - Gamificação e Ranking (Sprint 2)

## Status
✅ 1. Modelo Mongoose: `models/Jogador.js` (nome único + xp default 0)
✅ 2. Backend:
- Conexão MongoDB via `MONGODB_URI`
- Função `adicionarXP(nickname, quantidade)` com upsert
- Tools do Gemini com schema da função
✅ 3. Rota `GET /api/ranking` (Top 10 ordenado por XP)
✅ 4. Front-end: nickname obrigatório + botão 🏆 Ver Ranking

## Próximos passos
⏳ 5. Testar localmente:
- `npm start`
- Enviar mensagem com nickname
- Confirmar XP alterando no MongoDB Atlas
- Clicar em “Ver Ranking”

## Easter eggs (opcional)
⏳ 6. Confete ao detectar “Parabéns” ou “Acertou” na resposta
⏳ 7. Ajustar títulos (Novato/Lenda) conforme regra desejada

