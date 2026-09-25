import { Router } from 'express';
import { getApiStatus } from '../controllers/adminController.js';

const router = Router();
router.get('/status', getApiStatus);

export default router;
