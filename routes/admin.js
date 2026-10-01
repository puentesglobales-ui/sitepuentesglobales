import { Router } from 'express';
import { getApiStatus, requireAdmin } from '../controllers/adminController.js';

const router = Router();
router.get('/status', requireAdmin, getApiStatus);

export default router;
