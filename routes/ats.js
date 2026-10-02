import { Router } from 'express';
import { evaluateCV } from '../controllers/atsController.js';
import { requireUser, usageGuard } from '../services/usage.js';

const router = Router();

// Validar antes de consumir el uso, para no gastar el escaneo gratis en un envío vacío.
function validarCV(req, res, next) {
  const { cvText } = req.body || {};
  if (!cvText || cvText.trim().length < 20) {
    return res.status(400).json({ success: false, error: 'Por favor ingresa un texto de CV válido de al menos 20 caracteres.' });
  }
  next();
}

router.post('/evaluate', requireUser, validarCV, usageGuard('ats'), evaluateCV);

export default router;
