import { Router } from 'express';
import { requireUser } from '../services/usage.js';
import { adminDisponible, seleccionar, insertar, actualizar } from '../services/supabaseAdmin.js';
import { resolverOrg } from '../services/marcaBlanca.js';
import { evaluadorDisponible, evaluarVisa, normalizarEvaluacionVisa, ErrorMotor } from '../services/alexioMotor.js';

// Evaluador de elegibilidad para visas de trabajo: la persona escribe sus respuestas y la
// IA de Alex IO las califica. Siempre se guardan; si Alex IO no está, quedan pendientes.
const router = Router();

export const MAX_POR_DIA = 3; // cada evaluación con IA tiene costo
export const CAMPOS = {
  estudios: { min: 10, max: 1000, obligatorio: true },
  idiomas: { min: 5, max: 600, obligatorio: true },
  experiencia: { min: 10, max: 1500, obligatorio: true },
  destino: { min: 0, max: 300, obligatorio: false },
  situacion: { min: 0, max: 600, obligatorio: false },
  objetivo: { min: 0, max: 600, obligatorio: false }
};

export function validarRespuestas(body = {}) {
  const r = {};
  for (const [campo, regla] of Object.entries(CAMPOS)) {
    const v = String(body[campo] ?? '').trim();
    if (v.length > regla.max) return { error: `"${campo}" puede tener hasta ${regla.max} caracteres.` };
    if (regla.obligatorio && v.length < regla.min) return { error: 'Contanos con un poco más de detalle tus estudios, idiomas y experiencia.' };
    r[campo] = v;
  }
  return { respuestas: r };
}

function requireServidor(req, res, next) {
  if (!adminDisponible()) return res.status(503).json({ success: false, error: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' });
  next();
}

const publica = e => ({ id: e.id, estado: e.estado, respuestas: e.respuestas, resultado: e.resultado, puntaje: e.puntaje, created_at: e.created_at });

router.get('/visa', requireUser, requireServidor, async (req, res) => {
  try {
    const filas = await seleccionar('pg_evaluaciones', `select=*&user_id=eq.${req.user.id}&tipo=eq.visa&order=created_at.desc&limit=10`);
    res.json({ success: true, ia_disponible: evaluadorDisponible(), evaluaciones: filas.map(publica) });
  } catch (err) {
    console.error('evaluador:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos leer tus evaluaciones.' });
  }
});

router.post('/visa', requireUser, requireServidor, async (req, res) => {
  const { respuestas, error } = validarRespuestas(req.body || {});
  if (error) return res.status(400).json({ success: false, error });
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recientes = await seleccionar('pg_evaluaciones', `select=id&user_id=eq.${req.user.id}&created_at=gte.${encodeURIComponent(desde)}`);
    if (recientes.length >= MAX_POR_DIA) {
      return res.status(429).json({ success: false, code: 'limite', error: `Podés hacer hasta ${MAX_POR_DIA} evaluaciones por día. Probá mañana.` });
    }
    const [fila] = await insertar('pg_evaluaciones', [{ user_id: req.user.id, tipo: 'visa', respuestas, estado: 'pendiente' }], { devolver: true });
    if (!evaluadorDisponible()) return res.status(201).json({ success: true, evaluacion: publica(fila) });

    try {
      const org = await resolverOrg(req).catch(() => null);
      const resultado = normalizarEvaluacionVisa(await evaluarVisa({ userId: req.user.id, orgRef: org?.slug || null, respuestas }));
      const ahora = new Date().toISOString();
      const [evaluada] = await actualizar('pg_evaluaciones', `id=eq.${fila.id}`, { estado: 'evaluada', resultado, puntaje: resultado.puntaje, evaluada_at: ahora }, { devolver: true });
      res.status(201).json({ success: true, evaluacion: publica(evaluada || { ...fila, estado: 'evaluada', resultado, puntaje: resultado.puntaje }) });
    } catch (err) {
      // Las respuestas quedan guardadas como pendientes: no se pierde lo que escribió.
      console.error('evaluador: Alex IO no respondió:', err instanceof ErrorMotor ? err.code : err.message);
      res.status(201).json({ success: true, evaluacion: publica(fila), aviso: 'Guardamos tus respuestas. La evaluación con IA no está disponible en este momento: te avisamos cuando esté.' });
    }
  } catch (err) {
    console.error('evaluador:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos guardar tus respuestas. Probá de nuevo en unos minutos.' });
  }
});

export default router;
