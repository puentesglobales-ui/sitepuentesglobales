import { Router } from 'express';
import { getPlans, getTenantConfig } from '../controllers/saasController.js';

const router = Router();
router.get('/plans', getPlans);
router.get('/tenant-config', getTenantConfig);

export default router;
