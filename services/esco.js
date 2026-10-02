/**
 * Traduce una profesión escrita en español a los idiomas de cada país usando ESCO,
 * la clasificación europea de ocupaciones (API pública y gratuita de la Comisión Europea).
 *
 *   traducirProfesion('niñera') → { titulo: 'niñero/niñera',
 *                                   terminos: { en: ['nanny', …], de: ['Kinderbetreuer', 'Nanny', …], … } }
 *
 * Si la búsqueda no es una profesión (por ejemplo, el nombre de una empresa) o ESCO no
 * responde, devuelve null y el buscador usa el texto tal cual.
 */
import { normalizar } from './destinos.js';
import { buscarEnDiccionario } from './profesiones.js';

const ESCO = 'https://ec.europa.eu/esco/api';
export const IDIOMAS = ['es', 'en', 'de', 'nl', 'fr', 'it', 'pl'];
const MAX_TERMINOS = 6;
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`ESCO ${res.status}`);
  return res.json();
}

// "niñero/niñera" → ["niñero", "niñera"]
function partes(label) {
  return String(label || '').split('/').map(s => s.trim()).filter(Boolean);
}

function etiquetas(ocupacion, idioma) {
  const pref = partes(ocupacion.preferredLabel?.[idioma]);
  const alt = (ocupacion.alternativeLabel?.[idioma] || []).flatMap(partes);
  return [...pref, ...alt];
}

// Qué tan bien coincide una ocupación con lo buscado (0 = no sirve).
// Nombre principal exacto > otro nombre exacto > nombre que contiene la búsqueda.
// A igual puntaje gana el nombre más corto, que suele ser la profesión general
// ("enfermero/enfermera" antes que "enfermero/enfermera de extracciones").
export function puntaje(ocupacion, consulta) {
  const q = normalizar(consulta);
  const pref = partes(ocupacion.preferredLabel?.es).map(normalizar);
  const alt = (ocupacion.alternativeLabel?.es || []).flatMap(partes).map(normalizar);
  if (pref.includes(q)) return 300 - Math.min(99, pref[0].length);
  if (alt.includes(q)) return 200 - Math.min(99, pref[0]?.length || 99);
  const contiene = [...pref, ...alt].some(n => q.split(' ').every(w => n.split(' ').includes(w)));
  return contiene ? 100 - Math.min(99, pref[0]?.length || 99) : 0;
}

export function terminosPorIdioma(ocupacion) {
  const terminos = {};
  for (const idioma of IDIOMAS) {
    const vistos = new Set();
    terminos[idioma] = etiquetas(ocupacion, idioma)
      .filter(t => t.length <= 40)
      .filter(t => { const k = normalizar(t); if (vistos.has(k)) return false; vistos.add(k); return true; })
      .slice(0, MAX_TERMINOS);
  }
  return terminos;
}

export async function traducirProfesion(consulta) {
  const q = normalizar(consulta);
  if (q.length < 3) return null;
  const propia = buscarEnDiccionario(q);
  if (propia) return { uri: null, titulo: propia.titulo, terminos: propia.terminos, fuente: 'diccionario' };
  const enCache = cache.get(q);
  if (enCache && Date.now() - enCache.at < CACHE_MS) return enCache.valor;

  let valor = null;
  try {
    const busqueda = await getJson(`${ESCO}/search?text=${encodeURIComponent(consulta)}&language=es&type=occupation&limit=8`);
    const hits = busqueda._embedded?.results || [];
    const ocupaciones = await Promise.all(hits.map(h =>
      getJson(`${ESCO}/resource/occupation?uri=${encodeURIComponent(h.uri)}`).catch(() => null)));
    let mejor = null, mejorPuntaje = 0;
    ocupaciones.forEach((o, i) => {
      if (!o) return;
      const p = puntaje(o, consulta);
      if (p > mejorPuntaje) { mejor = { o, uri: hits[i].uri }; mejorPuntaje = p; }
    });
    if (mejor) {
      valor = { uri: mejor.uri, titulo: mejor.o.preferredLabel?.es, terminos: terminosPorIdioma(mejor.o) };
    }
  } catch (err) {
    console.warn('ESCO no disponible:', err.message);
    return null; // no se guarda en caché: se reintenta en la próxima búsqueda
  }
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(q, { at: Date.now(), valor });
  return valor;
}
