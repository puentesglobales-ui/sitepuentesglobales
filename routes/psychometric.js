import { Router } from 'express';
import { getQuestions, submitTest } from '../controllers/psychometricController.js';

const router = Router();
router.get('/questions', getQuestions);
router.post('/submit', submitTest);

export default router;
