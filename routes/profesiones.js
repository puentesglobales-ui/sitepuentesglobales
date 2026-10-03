import { Router } from 'express';
import { PROFESIONES, buscarEnDiccionario } from '../services/profesiones.js';
import { traducirProfesion } from '../services/esco.js';
import { normalizar, DESTINOS } from '../services/destinos.js';

const router = Router();
const ESCO = 'https://ec.europa.eu/esco/api';
const cacheSugerencias = new Map();
// Destinos del creador de CV que no están en el buscador de empleo.
const IDIOMA_CV = { us: 'en', ca: 'en' };

// Sugerencias mientras la persona escribe el puesto: primero el diccionario propio
// (las profesiones más buscadas, revisadas) y después ESCO.
router.get('/sugerir', async (req, res) => {
  const q = normalizar(req.query.q || '');
  if (q.length < 2 || q.length > 60) return res.json({ success: true, sugerencias: [] });
  const propias = PROFESIONES
    .filter(p => p.claves.some(c => normalizar(c).includes(q)))
    .map(p => ({ titulo: p.titulo, regulada: Boolean(p.regulada), fuente: 'diccionario' }));

  // ESCO no maneja bien palabras cortadas ("niñ"): solo se consulta desde 4 letras.
  let esco = q.length < 4 ? [] : cacheSugerencias.get(q);
  if (!esco) {
    try {
      const r = await fetch(`${ESCO}/search?text=${encodeURIComponent(q)}&language=es&type=occupation&limit=6`, { signal: AbortSignal.timeout(5000) });
      const data = await r.json();
      esco = (data._embedded?.results || []).map(h => ({ titulo: h.title, regulada: null, fuente: 'esco' }));
      if (cacheSugerencias.size > 1000) cacheSugerencias.delete(cacheSugerencias.keys().next().value);
      cacheSugerencias.set(q, esco);
    } catch {
      esco = [];
    }
  }
  const vistos = new Set();
  const sugerencias = [...propias, ...esco].filter(s => {
    const k = normalizar(s.titulo);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 8);
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, sugerencias });
});

// Cómo se llama el puesto en el idioma de cada destino elegido.
router.get('/traducir', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 120) return res.json({ success: true, encontrada: false });
  const paises = String(req.query.paises || '').split(',').map(p => p.trim()).filter(p => DESTINOS[p] || IDIOMA_CV[p]).slice(0, 5);
  const propia = buscarEnDiccionario(q);
  const t = await traducirProfesion(q).catch(() => null);
  if (!t) return res.json({ success: true, encontrada: false });
  const nombres = {};
  for (const p of paises) {
    const idioma = DESTINOS[p] ? DESTINOS[p].idiomas[0] : IDIOMA_CV[p];
    nombres[p] = (t.terminos[idioma] || []).slice(0, 4);
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, encontrada: true, titulo: t.titulo, regulada: propia ? Boolean(propia.regulada) : null, nombres });
});

export default router;
