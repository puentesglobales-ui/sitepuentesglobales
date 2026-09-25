import { PsychometricEngine } from '../services/psychometricEngine.js';

export const getQuestions = (req, res) => {
  try {
    const questions = PsychometricEngine.getQuestions();
    res.json({
      success: true,
      questions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error al obtener preguntas psicométricas',
      details: err.message
    });
  }
};

export const submitTest = (req, res) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Respuestas inválidas o no enviadas.'
      });
    }

    const evaluation = PsychometricEngine.evaluateTest(answers);

    res.json({
      success: true,
      evaluation
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error al procesar el test psicométrico',
      details: err.message
    });
  }
};
