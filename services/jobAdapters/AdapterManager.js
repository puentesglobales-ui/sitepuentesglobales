import { API_SOURCES, RSS_FEEDS } from '../../config/apis.js';
import { DESTINOS, ADZUNA_TODOS, resolverDestino, normalizar } from '../destinos.js';
import { traducirProfesion } from '../esco.js';

/**
 * Cada adaptador recibe (query, location, ctx):
 *   ctx.destino   código de destino ('es', 'de', 'remoto'…) o '' para todos
 *   ctx.terminos  la profesión traducida por idioma ({ en: [...], de: [...] }) o null
 * y declara con cubre(destino) si tiene ofertas para ese destino.
 */

const limpiar = (html, max = 280) => {
  const t = String(html || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) + '...' : '';
};

// Términos de búsqueda para los idiomas dados; si no hay traducción, el texto original.
export function terminosPara(ctx, idiomas, query) {
  const t = idiomas.flatMap(l => ctx?.terminos?.[l] || []);
  if (!t.length && query) t.push(query);
  return [...new Set(t)];
}

export function coincideAlguno(texto, terminos) {
  if (!terminos.length) return true;
  const n = normalizar(texto);
  return terminos.some(t => n.includes(normalizar(t)));
}

// Adzuna: what_or para palabras sueltas (Kinderbetreuer Nanny), what_phrase si solo hay frases.
export function parametrosAdzuna(terminos) {
  const sueltas = terminos.filter(t => !/\s/.test(t));
  if (sueltas.length) return `&what_or=${encodeURIComponent(sueltas.join(' '))}`;
  if (terminos.length) return `&what_phrase=${encodeURIComponent(terminos[0])}`;
  return '';
}

export class AdzunaAdapter {
  static cubre(destino) { return !destino || Boolean(DESTINOS[destino]?.adzuna); }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const cfg = API_SOURCES.adzuna;
    if (!cfg || !cfg.enabled) return [];
    const destino = ctx.destino ?? resolverDestino(location);
    const paises = destino ? [DESTINOS[destino]?.adzuna].filter(Boolean) : ADZUNA_TODOS;
    const porPagina = paises.length > 1 ? 8 : 20;

    const listas = await Promise.all(paises.map(async pais => {
      const idioma = DESTINOS[pais].idiomas[0];
      const what = parametrosAdzuna(terminosPara(ctx, [idioma], query));
      const url = `${cfg.url}/${pais}/search/1?app_id=${cfg.appId}&app_key=${cfg.appKey}&results_per_page=${porPagina}${what}&content-type=application/json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.results || []).map(j => ({
        id: `adzuna_${j.id}`,
        title: j.title ? j.title.replace(/<[^>]*>?/gm, '') : 'Oferta de Empleo',
        company: j.company ? j.company.display_name : 'Empresa Confidencial',
        location: j.location ? j.location.display_name : DESTINOS[pais].nombre,
        description: limpiar(j.description),
        url: j.redirect_url,
        source: 'Adzuna',
        tags: [j.category ? j.category.label : 'General'],
        created_at: j.created
      }));
    }));
    return listas.flat();
  }
}

export class ReedAdapter {
  static cubre(destino) { return !destino || destino === 'gb' || destino === 'ie'; }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const cfg = API_SOURCES.reed;
    if (!cfg || !cfg.enabled) return [];
    const [keywords] = terminosPara(ctx, ['en'], query);
    const url = `${cfg.url}?resultsToTake=20${keywords ? `&keywords=${encodeURIComponent(keywords)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(cfg.apiKey + ':').toString('base64') } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map(j => ({
      id: `reed_${j.jobId}`,
      title: j.jobTitle,
      company: j.employerName,
      location: j.locationName || 'Reino Unido / Irlanda',
      description: limpiar(j.jobDescription),
      url: j.jobUrl,
      source: 'Reed.co.uk',
      tags: [j.expirationDate ? `Expira: ${j.expirationDate}` : 'Europa'],
      created_at: j.date
    }));
  }
}

export class FindWorkAdapter {
  static cubre(destino) { return !destino || ['remoto', 'de', 'fr', 'nl', 'gb', 'ie'].includes(destino); }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const cfg = API_SOURCES.findwork;
    if (!cfg || !cfg.enabled) return [];
    const terminos = terminosPara(ctx, ['en'], query);
    const [search] = terminos;
    const url = search ? `${cfg.url}/?search=${encodeURIComponent(search)}` : `${cfg.url}/?sort_by=relevance`;
    const res = await fetch(url, { headers: { Authorization: `Token ${cfg.bearerToken}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // FindWork busca en todo el texto ("driver" trae programadores de drivers): filtrar por título.
    return (data.results || []).filter(j => j.role && coincideAlguno(decodeXml(j.role), terminos)).slice(0, 25).map(j => ({
      id: `findwork_${j.id}`,
      title: decodeXml(j.role),
      company: j.company_name,
      location: j.location || (j.remote ? 'Remoto Europa' : 'Europa'),
      description: limpiar(j.text),
      url: j.url,
      source: 'FindWork.dev',
      tags: j.keywords || [],
      created_at: j.date_posted
    }));
  }
}

export class HimalayasAdapter {
  static cubre(destino) { return !destino || destino === 'remoto'; }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const cfg = API_SOURCES.himalayas;
    if (!cfg || !cfg.enabled) return [];
    const res = await fetch(cfg.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const terminos = terminosPara(ctx, ['en'], query);
    return (data.jobs || [])
      .filter(j => coincideAlguno(j.title, terminos))
      .slice(0, 25)
      .map(j => ({
        id: `himalayas_${j.slug}`,
        title: j.title,
        company: j.companyName,
        location: j.locationRestriction || 'Remoto Mundial',
        description: limpiar(j.excerpt),
        url: j.applicationUrl || `https://himalayas.app/jobs/${j.slug}`,
        source: 'Himalayas',
        tags: j.categories || [],
        created_at: j.pubDate
      }));
  }
}

export class ArbeitnowAdapter {
  static cubre(destino) { return !destino || destino === 'de' || destino === 'remoto'; }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const terminos = terminosPara(ctx, ['de', 'en'], query);
    return (data.data || [])
      .filter(j => coincideAlguno(j.title, terminos))
      .slice(0, 25)
      .map(j => ({
        id: `arbeitnow_${j.slug}`,
        title: j.title,
        company: j.company_name,
        location: j.location || 'Alemania / Remoto',
        description: limpiar(j.description),
        url: j.url,
        source: 'Arbeitnow',
        tags: j.tags || [],
        created_at: j.created_at
      }));
  }
}

export class RemoteOKAdapter {
  static cubre(destino) { return !destino || destino === 'remoto'; }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const res = await fetch('https://remoteok.com/api', { headers: { 'User-Agent': 'PuentesGlobalesBot/2.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const terminos = terminosPara(ctx, ['en'], query);
    return (Array.isArray(data) ? data.slice(1) : [])
      .filter(j => j && j.position && coincideAlguno(j.position, terminos))
      .slice(0, 25)
      .map(j => ({
        id: `remoteok_${j.id}`,
        title: j.position,
        company: j.company,
        location: j.location || 'Mundial / Remoto',
        description: limpiar(j.description),
        url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
        source: 'RemoteOK',
        tags: j.tags || [],
        created_at: j.date
      }));
  }
}

// Remotive se quitó: sus términos prohíben mostrar sus ofertas a cambio de registro,
// y el buscador de Puentes Globales exige cuenta.

// Feeds RSS genéricos (variable RSS_FEEDS). Parser mínimo sin dependencias.
function decodeXml(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeXml(m[1]).trim() : '';
}

export function parseRss(xml, feedName) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b, i) => {
    const atomLink = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1];
    const url = tag(b, 'link') || decodeXml(atomLink || '');
    const text = (tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    return {
      id: `rss_${feedName}_${url || i}`,
      title: tag(b, 'title') || 'Oferta de Empleo',
      company: tag(b, 'author') || tag(b, 'dc:creator') || feedName,
      location: 'Remoto / Global',
      description: text ? text.slice(0, 280) + '...' : '',
      url,
      source: `RSS: ${feedName}`,
      tags: [],
      created_at: tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published')
    };
  }).filter(j => j.url);
}

// Los feeds no dependen de la búsqueda: se guardan 15 min para no pedirlos en cada
// búsqueda (Reddit, por ejemplo, responde 429 si se lo consulta seguido).
const RSS_CACHE_MS = 15 * 60 * 1000;
const rssCache = new Map();

export class RssAdapter {
  static cubre(destino) { return !destino || destino === 'remoto'; }

  static async fetchFeed(feed) {
    const cached = rssCache.get(feed.url);
    if (cached && Date.now() - cached.at < RSS_CACHE_MS) return cached.jobs;
    try {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'PuentesGlobalesBot/2.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const jobs = parseRss(await res.text(), feed.name);
      rssCache.set(feed.url, { at: Date.now(), jobs });
      return jobs;
    } catch (err) {
      // Si falla pero hay una copia anterior, mejor mostrar eso que nada.
      if (cached) return cached.jobs;
      throw err;
    }
  }

  static async fetchJobs(query = '', location = '', ctx = {}) {
    const results = await Promise.allSettled(RSS_FEEDS.map(feed => withTimeout(RssAdapter.fetchFeed(feed))));
    const terminos = terminosPara(ctx, ['en'], query);
    // Hasta 15 por feed, para que ningún feed tape a los demás.
    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value
        .filter(j => coincideAlguno(`${j.title} ${j.description}`, terminos))
        .slice(0, 15));
  }
}

// Fuente id (config/apis.js) → adaptador.
export const ADAPTERS = {
  adzuna: AdzunaAdapter,
  reed: ReedAdapter,
  findwork: FindWorkAdapter,
  himalayas: HimalayasAdapter,
  arbeitnow: ArbeitnowAdapter,
  remoteok: RemoteOKAdapter
};

const TIMEOUT_MS = 10000;

// Una fuente lenta no debe colgar toda la búsqueda.
export function withTimeout(promise, ms = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Sin respuesta en ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class AdapterManager {
  /**
   * Busca en todas las fuentes que cubren el destino, con la profesión traducida.
   * Devuelve { jobs, interpretacion } para que el sitio muestre cómo se entendió la búsqueda.
   */
  static async buscar(query = '', location = '') {
    const destino = resolverDestino(location);
    const profesion = query ? await withTimeout(traducirProfesion(query), 8000).catch(() => null) : null;
    const ctx = { destino, terminos: profesion?.terminos || null };

    const adaptadores = [...Object.values(ADAPTERS), RssAdapter].filter(a => a.cubre(destino));
    const results = await Promise.allSettled(adaptadores.map(a => withTimeout(a.fetchJobs(query, location, ctx), 12000)));

    const vistos = new Set();
    const jobs = results
      .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
      .flatMap(r => r.value)
      .filter(j => {
        const k = j.url || j.id;
        if (!k || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });

    const idiomas = destino ? DESTINOS[destino].idiomas : ['en', 'de', 'es'];
    return {
      jobs,
      interpretacion: {
        destino: destino ? DESTINOS[destino].nombre : 'Todos los destinos',
        profesion: profesion?.titulo || null,
        terminos: profesion
          ? [...new Map(idiomas.flatMap(l => profesion.terminos[l] || []).map(t => [normalizar(t), t])).values()].slice(0, 6)
          : []
      }
    };
  }

  static async searchAllSources(query = '', location = '') {
    return (await AdapterManager.buscar(query, location)).jobs;
  }
}
