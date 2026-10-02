import crypto from 'node:crypto';
import { API_SOURCES, RSS_FEEDS } from '../config/apis.js';
import { ADAPTERS, withTimeout } from '../services/jobAdapters/AdapterManager.js';
import { requireUser } from '../services/usage.js';
import { adminDisponible, seleccionar, auditar } from '../services/supabaseAdmin.js';

// Protege las rutas de admin con el header x-admin-token = ADMIN_TOKEN (variable de entorno en Render).
export const requireAdmin = (req, res, next) => {
  const expected = (process.env.ADMIN_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({ success: false, error: 'Falta configurar ADMIN_TOKEN en el servidor.' });
  }
  const given = String(req.get('x-admin-token') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, error: 'Clave de administrador incorrecta.' });
  }
  next();
};

async function checkApi(source) {
  const base = { id: source.id, name: source.name, tipo: 'api' };
  if (!source.enabled) {
    return { ...base, estado: 'sin_clave', detalle: `Falta cargar: ${source.requiresKey.join(', ')}` };
  }
  const started = Date.now();
  try {
    const jobs = await withTimeout(ADAPTERS[source.id].fetchJobs('', ''));
    const ms = Date.now() - started;
    return { ...base, estado: jobs.length > 0 ? 'ok' : 'vacio', ofertas: jobs.length, ms };
  } catch (err) {
    return { ...base, estado: 'error', detalle: err.message, ms: Date.now() - started };
  }
}

async function checkRss(feed) {
  const base = { id: feed.id, name: feed.name, tipo: 'rss' };
  const started = Date.now();
  try {
    const res = await withTimeout(fetch(feed.url, { headers: { 'User-Agent': 'PuentesGlobalesBot/2.0' } }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = (xml.match(/<item[\s>]/g) || []).length + (xml.match(/<entry[\s>]/g) || []).length;
    return { ...base, estado: items > 0 ? 'ok' : 'vacio', ofertas: items, ms: Date.now() - started };
  } catch (err) {
    return { ...base, estado: 'error', detalle: err.message, ms: Date.now() - started };
  }
}

// Prueba de verdad cada API y cada RSS desde el servidor (las claves nunca llegan al navegador).
export const getApiStatus = async (req, res) => {
  const fuentes = await Promise.all([
    ...Object.values(API_SOURCES).map(checkApi),
    ...RSS_FEEDS.map(checkRss)
  ]);
  res.json({ success: true, fuentes, systemTime: new Date().toISOString() });
};

/* ─── Administradores con sesión (lista ADMIN_EMAILS) ─────────────────────── */

export function esAdmin(user) {
  const lista = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(user && user.email && user.email_confirmed_at && lista.includes(user.email.toLowerCase()));
}

// Exige sesión de Supabase de un email que esté en ADMIN_EMAILS (y confirmado).
export function requireAdminUser(req, res, next) {
  requireUser(req, res, () => {
    if (!esAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Tu cuenta no tiene permiso de administrador.' });
    }
    next();
  });
}

// Lista de candidatos para el equipo, con sus permisos vigentes y su último CI.
// Cada consulta queda registrada en pg_auditoria.
export const getCandidatos = async (req, res) => {
  if (!adminDisponible()) {
    return res.status(503).json({ success: false, error: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' });
  }
  try {
    const [candidatos, permisos, tests] = await Promise.all([
      seleccionar('pg_candidatos', 'select=user_id,email,nombre,telefono,profesion,created_at&order=created_at.desc&limit=1000'),
      seleccionar('pg_consentimientos', 'select=user_id,tipo,aceptado,created_at&order=created_at.desc&limit=20000'),
      seleccionar('pg_resultados_test', 'select=user_id,detalle,created_at&test=eq.ci&order=created_at.desc&limit=20000')
    ]);
    const vigentes = {};
    for (const p of permisos) {
      vigentes[p.user_id] ??= {};
      if (!(p.tipo in vigentes[p.user_id])) vigentes[p.user_id][p.tipo] = p.aceptado;
    }
    const ci = {};
    for (const t of tests) if (!(t.user_id in ci)) ci[t.user_id] = t.detalle?.ci_estimado ?? null;

    const items = candidatos.map(c => ({ ...c, permisos: vigentes[c.user_id] || {}, ci: ci[c.user_id] ?? null }));
    await auditar(req.user.email, 'listar_candidatos', null, { cantidad: items.length });
    res.json({ success: true, items });
  } catch (err) {
    console.error('Error al listar candidatos:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos leer los candidatos.' });
  }
};

// Estado de fuentes: vale la clave ADMIN_TOKEN o la sesión de un administrador.
export function requireAdminTokenOUsuario(req, res, next) {
  if (req.get('x-admin-token')) return requireAdmin(req, res, next);
  if ((req.get('authorization') || '').startsWith('Bearer ')) return requireAdminUser(req, res, next);
  return requireAdmin(req, res, next);
}
