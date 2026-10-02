/**
 * Destinos de búsqueda: qué país eligió la persona, en qué idiomas publica ese país
 * y qué código usa Adzuna. Reemplaza la detección por "contiene 'de'" que mandaba
 * España a Reino Unido.
 */

export const DESTINOS = {
  es: { nombre: 'España', adzuna: 'es', idiomas: ['es'] },
  de: { nombre: 'Alemania', adzuna: 'de', idiomas: ['de', 'en'] },
  at: { nombre: 'Austria', adzuna: 'at', idiomas: ['de'] },
  ch: { nombre: 'Suiza', adzuna: 'ch', idiomas: ['de', 'fr'] },
  gb: { nombre: 'Reino Unido', adzuna: 'gb', idiomas: ['en'] },
  ie: { nombre: 'Irlanda', adzuna: null, idiomas: ['en'] },
  nl: { nombre: 'Países Bajos', adzuna: 'nl', idiomas: ['nl', 'en'] },
  be: { nombre: 'Bélgica', adzuna: 'be', idiomas: ['nl', 'fr'] },
  fr: { nombre: 'Francia', adzuna: 'fr', idiomas: ['fr'] },
  it: { nombre: 'Italia', adzuna: 'it', idiomas: ['it'] },
  pl: { nombre: 'Polonia', adzuna: 'pl', idiomas: ['pl'] },
  remoto: { nombre: '100% Remoto', adzuna: null, idiomas: ['en'] }
};

// Países que se consultan en Adzuna cuando no se elige destino.
export const ADZUNA_TODOS = ['es', 'de', 'gb', 'nl', 'fr'];

export function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const ALIAS = {
  espana: 'es', spain: 'es',
  alemania: 'de', germany: 'de', deutschland: 'de',
  austria: 'at', osterreich: 'at',
  suiza: 'ch', switzerland: 'ch', schweiz: 'ch',
  'reino unido': 'gb', uk: 'gb', inglaterra: 'gb', 'united kingdom': 'gb', 'gran bretana': 'gb',
  irlanda: 'ie', ireland: 'ie',
  holanda: 'nl', 'paises bajos': 'nl', netherlands: 'nl',
  belgica: 'be', belgium: 'be',
  francia: 'fr', france: 'fr',
  italia: 'it', italy: 'it',
  polonia: 'pl', poland: 'pl',
  remoto: 'remoto', '100% remoto': 'remoto', remote: 'remoto'
};

// Devuelve el código del destino ('es', 'de', 'remoto'…) o '' si no se eligió o no se reconoce.
export function resolverDestino(texto = '') {
  const t = normalizar(texto);
  if (!t) return '';
  if (DESTINOS[t]) return t;
  return ALIAS[t] || '';
}
