import { TalkMeEngine } from '../services/talkmeEngine.js';

export const handleAlexChat = async (req, res) => {
  try {
    const { message } = req.body;
    const response = await TalkMeEngine.chatWithAlex(message || '');

    res.json({
      success: true,
      reply: response.reply
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error en la consulta con ALEX IO',
      details: err.message
    });
  }
};
