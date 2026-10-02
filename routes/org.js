import { Router } from 'express';
import { adminDisponible } from '../services/supabaseAdmin.js';
import { resolverOrg, configPublica, PLATAFORMA } from '../services/marcaBlanca.js';

const router = Router();

// Marca, productos con precio, combos y medios de pago de la empresa que está viendo el
// visitante (?org=slug, subdominio o dominio propio). Sin empresa: los de la plataforma.
// Nunca incluye secretos ni la comisión.
router.get('/config', async (req, res) => {
  const vacio = { marca: PLATAFORMA, productos: [], combos: [], pagos: [] };
  if (!adminDisponible()) return res.json({ success: true, ...vacio, parcial: true });
  try {
    const org = await resolverOrg(req);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ success: true, ...(await configPublica(org)) });
  } catch (err) {
    console.error('Error al leer la configuración de la empresa:', err.message);
    res.json({ success: true, ...vacio, parcial: true });
  }
});

export default router;
