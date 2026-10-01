import crypto from 'node:crypto';
import { API_SOURCES, RSS_FEEDS } from '../config/apis.js';
import { ADAPTERS, withTimeout } from '../services/jobAdapters/AdapterManager.js';

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
