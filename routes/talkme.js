import { Router } from 'express';
import { handleInterviewStep, handleAlexChat } from '../controllers/talkmeController.js';
import { requireUser, usageGuard, contarUsos, VENTANA_ENTREVISTA_MS } from '../services/usage.js';

const router = Router();

// El paso 1 empieza una entrevista y consume un uso del plan. Los pasos siguientes
// solo se permiten si hay una entrevista empezada dentro de la ventana.
const entrevistaGuard = usageGuard('entrevista');
async function interviewLimit(req, res, next) {
  const step = Number(req.body?.step) || 1;
  if (step <= 1) return entrevistaGuard(req, res, next);
  try {
    const desde = new Date(Date.now() - VENTANA_ENTREVISTA_MS).toISOString();
    const abiertas = await contarUsos(req.user, req.token, 'entrevista', desde);
    if (abiertas === 0) {
      return res.status(403).json({ success: false, code: 'reiniciar', error: 'Esta entrevista ya terminó. Empezá una nueva.' });
    }
    next();
  } catch (err) {
    res.status(503).json({ success: false, error: 'No pudimos verificar tu plan. Probá de nuevo en un momento.' });
  }
}

router.post('/interview', requireUser, interviewLimit, handleInterviewStep);
router.post('/chat', handleAlexChat);

export default router;
