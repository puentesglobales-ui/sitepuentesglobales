import { Router } from 'express';
import { handleInterviewStep, handleAlexChat } from '../controllers/talkmeController.js';

const router = Router();
router.post('/interview', handleInterviewStep);
router.post('/chat', handleAlexChat);

export default router;
