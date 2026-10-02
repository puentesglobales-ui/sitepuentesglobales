import { Router } from 'express';
import { getApiStatus, getCandidatos, requireAdminTokenOUsuario, requireAdminUser, esAdmin } from '../controllers/adminController.js';
import { requireUser } from '../services/usage.js';

const router = Router();
router.get('/status', requireAdminTokenOUsuario, getApiStatus);
router.get('/candidatos', requireAdminUser, getCandidatos);
// Para que el panel sepa si la sesión actual es de un administrador.
router.get('/yo', requireUser, (req, res) => res.json({ success: true, admin: esAdmin(req.user), email: req.user.email }));

export default router;
