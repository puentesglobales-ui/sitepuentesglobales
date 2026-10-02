import { Router } from 'express';
import { requireUser } from '../services/usage.js';
import { adminDisponible, borrarUsuario } from '../services/supabaseAdmin.js';

const router = Router();

// Borrar la propia cuenta (derecho de supresión). Borra el usuario y, en cascada,
// su ficha, resultados de tests, permisos y usos.
router.delete('/', requireUser, async (req, res) => {
  if (!adminDisponible()) {
    return res.status(503).json({ success: false, error: 'No pudimos borrar tu cuenta automáticamente. Escribinos y la borramos a mano.' });
  }
  try {
    await borrarUsuario(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al borrar cuenta:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos borrar tu cuenta. Probá de nuevo en unos minutos.' });
  }
});

export default router;
