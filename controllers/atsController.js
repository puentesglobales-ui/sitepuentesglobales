import { ATSEngine } from '../services/atsEngine.js';

export const evaluateCV = async (req, res) => {
  try {
    const { cvText, jobTitle, jobDescription } = req.body;

    if (!cvText || cvText.trim().length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Por favor ingresa un texto de CV válido de al menos 20 caracteres.'
      });
    }

    const result = ATSEngine.analyzeCV(cvText, jobTitle, jobDescription);

    res.json({
      success: true,
      analysis: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error al procesar el análisis ATS',
      details: err.message
    });
  }
};
