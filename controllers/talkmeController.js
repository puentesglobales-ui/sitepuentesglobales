import { TalkMeEngine } from '../services/talkmeEngine.js';

export const handleInterviewStep = (req, res) => {
  try {
    const { jobTitle, candidateAnswer, step } = req.body;
    const result = TalkMeEngine.generateInterviewQuestion(jobTitle, candidateAnswer, step || 1);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error en la simulación de entrevista por IA',
      details: err.message
    });
  }
};

export const handleAlexChat = (req, res) => {
  try {
    const { message } = req.body;
    const response = TalkMeEngine.chatWithAlex(message || '');

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
