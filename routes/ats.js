import { Router } from 'express';
import { evaluateCV } from '../controllers/atsController.js';

const router = Router();
router.post('/evaluate', evaluateCV);

export default router;
