import { Router } from 'express';
import { handleAlexChat } from '../controllers/talkmeController.js';

// El simulador de entrevistas ahora lo entrega Alex IO por su API motor: ver routes/practica.js.
const router = Router();
router.post('/chat', handleAlexChat);

export default router;
