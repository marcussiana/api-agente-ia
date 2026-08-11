require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

const Jogador = require('./models/Jogador');
const Mensagem = require('./models/Mensagem');

const app = express();


// =====================================================
// CONFIGURAÇÕES
// =====================================================

app.use(cors());

app.use(express.json());


// =====================================================
// MONGODB
// =====================================================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB conectado com sucesso!');
  })
  .catch((error) => {
    console.error('Erro ao conectar ao MongoDB:', error.message);
  });


// =====================================================
// GEMINI
// =====================================================

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);


// =====================================================
// CLOUDINARY
// =====================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});


// =====================================================
// MULTER
// =====================================================

// A imagem fica somente na memória RAM.
// Ela NÃO é salva no disco do Render.

const storage = multer.memoryStorage();


// Limite de 5 MB

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    if (!file.mimetype.startsWith('image/')) {

      return cb(
        new Error('Apenas arquivos de imagem são permitidos.')
      );

    }

    cb(null, true);
  }
});


// =====================================================
// JWT
// =====================================================

function verificarJWT(req, res, next) {

  const autorizacao =
    req.headers.authorization;

  if (!autorizacao) {

    return res.status(401).json({
      erro: 'Token de autenticação não informado.'
    });

  }

  const partes =
    autorizacao.split(' ');

  if (
    partes.length !== 2 ||
    partes[0] !== 'Bearer'
  ) {

    return res.status(401).json({
      erro: 'Formato de token inválido.'
    });

  }

  const token = partes[1];

  try {

    const usuario =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.usuario = usuario;

    next();

  } catch (error) {

    return res.status(401).json({
      erro: 'Token inválido ou expirado.'
    });

  }
}


// =====================================================
// GERAR TOKEN
// =====================================================

// Como seu projeto ainda não tinha sistema de login,
// esta rota gera um token usando o nickname.

// Para o trabalho da disciplina, isso permite
// proteger a rota /vision com JWT.

app.post('/api/auth/token', async (req, res) => {

  try {

    const { nickname } = req.body;

    if (!nickname || !nickname.trim()) {

      return res.status(400).json({
        erro: 'Nickname é obrigatório.'
      });

    }

    const nome =
      nickname.trim();


    const jogador =
      await Jogador.findOneAndUpdate(

        { nome: nome },

        {
          $setOnInsert: {
            nome: nome
          }
        },

        {
          new: true,
          upsert: true
        }

      );


    const token =
      jwt.sign(

        {
          id: jogador._id,
          nickname: jogador.nome
        },

        process.env.JWT_SECRET,

        {
          expiresIn: '7d'
        }

      );


    res.json({
      token: token
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      erro: 'Erro ao gerar token.'
    });

  }

});


// =====================================================
// FUNÇÃO PARA DAR XP
// =====================================================

async function adicionarXP(nickname, quantidade = 10) {

  try {

    const jogador =
      await Jogador.findOneAndUpdate(

        { nome: nickname },

        {
          $inc: {
            xp: quantidade
          }
        },

        {
          new: true,
          upsert: true
        }

      );

    return jogador;

  } catch (error) {

    console.error(
      'Erro ao adicionar XP:',
      error.message
    );

    return null;
  }
}


// =====================================================
// TÍTULO DO JOGADOR
// =====================================================

function descobrirTitulo(xp) {

  if (xp >= 1000) {
    return 'Mestre da IA';
  }

  if (xp >= 500) {
    return 'Especialista';
  }

  if (xp >= 250) {
    return 'Avançado';
  }

  if (xp >= 100) {
    return 'Intermediário';
  }

  return 'Iniciante';
}


// =====================================================
// ROTA ANTIGA /generate
// =====================================================

app.post('/generate', async (req, res) => {

  try {

    const { prompt } = req.body;

    if (!prompt) {

      return res.status(400).json({
        error: 'Prompt é obrigatório.'
      });

    }


    const model =
      genAI.getGenerativeModel({
        model: 'gemini-3.5-flash-lite'
      });


    const result =
      await model.generateContent(prompt);


    const response =
      await result.response;


    const text =
      response.text();


    res.json({
      response: text
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }

});


// =====================================================
// CHAT NORMAL
// =====================================================

app.post('/api/chat', async (req, res) => {

  try {

    const {
      nickname,
      pergunta
    } = req.body;


    if (!nickname || !nickname.trim()) {

      return res.status(400).json({
        erro: 'Nickname é obrigatório.'
      });

    }


    if (!pergunta || !pergunta.trim()) {

      return res.status(400).json({
        erro: 'Pergunta é obrigatória.'
      });

    }


    const nome =
      nickname.trim();


    const model =
      genAI.getGenerativeModel({
        model: 'gemini-3.5-flash-lite'
      });


    const result =
      await model.generateContent(
        pergunta.trim()
      );


    const response =
      await result.response;


    const texto =
      response.text();


    await adicionarXP(
      nome,
      10
    );


    await Mensagem.create({

      nickname: nome,

      pergunta: pergunta.trim(),

      resposta: texto,

      imagemUrl: null

    });


    res.json({

      resposta: texto

    });


  } catch (error) {

    console.error(
      'Erro no /api/chat:',
      error
    );


    res.status(500).json({

      erro: 'Erro ao processar a pergunta.',

      detalhes: error.message

    });

  }

});


// =====================================================
// UPLOAD PARA CLOUDINARY
// =====================================================

function uploadParaCloudinary(buffer, mimetype) {

  return new Promise(
    (resolve, reject) => {

      const stream =
        cloudinary.uploader.upload_stream(

          {
            folder: 'agente-ia',

            resource_type: 'image'

          },

          (error, resultado) => {

            if (error) {

              reject(error);

            } else {

              resolve(resultado);

            }

          }

        );


      stream.end(buffer);

    }
  );

}


// =====================================================
// CHAT COM VISÃO
// POST /api/chat/vision
// =====================================================

app.post(

  '/api/chat/vision',

  verificarJWT,

  (req, res, next) => {

    upload.single('imagem')(
      req,
      res,
      (error) => {

        if (error) {

          if (
            error.code ===
            'LIMIT_FILE_SIZE'
          ) {

            return res.status(400).json({
              erro: 'A imagem é muito grande. O limite é de 5 MB.'
            });

          }


          return res.status(400).json({
            erro: error.message
          });

        }


        next();

      }
    );

  },

  async (req, res) => {

    try {

      const {
        nickname,
        pergunta
      } = req.body;


      // ===============================================
      // VALIDAÇÕES
      // ===============================================

      if (!nickname || !nickname.trim()) {

        return res.status(400).json({
          erro: 'Nickname é obrigatório.'
        });

      }


      if (!req.file) {

        return res.status(400).json({
          erro: 'Nenhuma imagem foi enviada.'
        });

      }


      const nome =
        nickname.trim();


      const textoPergunta =
        pergunta &&
        pergunta.trim()
          ? pergunta.trim()
          : 'Analise esta imagem e descreva o que você vê.';


      // ===============================================
      // UPLOAD CLOUDINARY
      // ===============================================

      const uploadResult =
        await uploadParaCloudinary(

          req.file.buffer,

          req.file.mimetype

        );


      const imagemUrl =
        uploadResult.secure_url;


      // ===============================================
      // BASE64
      // ===============================================

      const base64Imagem =
        req.file.buffer.toString('base64');


      // ===============================================
      // GEMINI VISION
      // ===============================================

      const model =
        genAI.getGenerativeModel({

          model: 'gemini-3.5-flash-lite'

        });


      const result =
        await model.generateContent({

          contents: [

            {

              role: 'user',

              parts: [

                {

                  inlineData: {

                    mimeType:
                      req.file.mimetype,

                    data:
                      base64Imagem

                  }

                },

                {

                  text:
                    textoPergunta

                }

              ]

            }

          ]

        });


      const response =
        await result.response;


      const textoResposta =
        response.text();


      // ===============================================
      // SALVAR NO MONGODB
      // ===============================================

      await Mensagem.create({

        nickname: nome,

        pergunta: textoPergunta,

        resposta: textoResposta,

        imagemUrl: imagemUrl

      });


      // ===============================================
      // XP
      // ===============================================

      await adicionarXP(
        nome,
        20
      );


      // ===============================================
      // RESPOSTA AO FRONT-END
      // ===============================================

      res.json({

        resposta: textoResposta,

        imagemUrl: imagemUrl

      });


    } catch (error) {

      console.error(
        'Erro no /api/chat/vision:',
        error
      );


      res.status(500).json({

        erro:
          'Erro ao analisar a imagem.',

        detalhes:
          error.message

      });

    }

  }

);


// =====================================================
// HISTÓRICO
// =====================================================

app.get(
  '/api/chat/historico',
  async (req, res) => {

    try {

      const mensagens =
        await Mensagem
          .find()
          .sort({
            createdAt: 1
          })
          .limit(100);


      res.json({

        mensagens:
          mensagens

      });


    } catch (error) {

      console.error(error);

      res.status(500).json({

        erro:
          'Erro ao carregar histórico.'

      });

    }

  }
);


// =====================================================
// RANKING
// =====================================================

app.get(
  '/api/ranking',
  async (req, res) => {

    try {

      const jogadores =
        await Jogador
          .find()
          .sort({
            xp: -1
          })
          .limit(20);


      const ranking =
        jogadores.map(
          (jogador) => ({

            nome:
              jogador.nome,

            xp:
              jogador.xp,

            titulo:
              descobrirTitulo(
                jogador.xp
              )

          })
        );


      res.json({

        ranking:
          ranking

      });


    } catch (error) {

      console.error(error);

      res.status(500).json({

        erro:
          'Erro ao carregar ranking.'

      });

    }

  }
);


// =====================================================
// ROTA DE TESTE
// =====================================================

app.get('/', (req, res) => {

  res.json({

    mensagem:
      'API do Agente IA funcionando!',

    status:
      'online'

  });

});


// =====================================================
// TRATAMENTO DE ERROS
// =====================================================

app.use(
  (error, req, res, next) => {

    console.error(error);

    res.status(500).json({

      erro:
        'Erro interno do servidor.'

    });

  }
);


// =====================================================
// SERVIDOR
// =====================================================

const PORT =
  process.env.PORT || 3000;


app.listen(
  PORT,
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);