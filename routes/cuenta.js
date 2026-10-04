import { Router } from 'express';
import { requireUser } from '../services/usage.js';
import { adminDisponible, borrarUsuario, auditar } from '../services/supabaseAdmin.js';
import { motorConfigurado, borrarAlumno } from '../services/alexioMotor.js';

const router = Router();

// Borrar la propia cuenta (derecho de supresión). Borra el usuario y, en cascada,
// su ficha, resultados de tests, permisos y usos.
router.delete('/', requireUser, async (req, res) => {
  if (!adminDisponible()) {
    return res.status(503).json({ success: false, error: 'No pudimos borrar tu cuenta automáticamente. Escribinos y la borramos a mano.' });
  }
  try {
    // Datos de práctica en Alex IO (simulador e idiomas). Si falla, se borra igual la cuenta
    // y queda anotado en la auditoría para reintentarlo a mano.
    if (motorConfigurado()) {
      await borrarAlumno(req.user.id).catch(async e => {
        console.error('No se pudo borrar en Alex IO:', e.message);
        await auditar('sistema', 'alexio_borrado_pendiente', req.user.id, { error: e.message });
      });
    }
    await borrarUsuario(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al borrar cuenta:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos borrar tu cuenta. Probá de nuevo en unos minutos.' });
  }
});

export default router;
