import { Router } from 'express';
import { searchJobs } from '../controllers/jobController.js';

const router = Router();
router.get('/search', searchJobs);

export default router;
