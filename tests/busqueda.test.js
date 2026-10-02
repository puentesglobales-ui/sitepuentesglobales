// Búsqueda en español traducida al idioma de cada destino. ESCO y las fuentes se simulan.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.ADZUNA_APP_ID = 'id-prueba';
process.env.ADZUNA_APP_KEY = 'key-prueba';
process.env.REED_API_KEY = 'reed-prueba';
delete process.env.FINDWORK_TOKEN;
process.env.RSS_FEEDS = '';

const { resolverDestino } = await import('../services/destinos.js');
const { buscarEnDiccionario, PROFESIONES } = await import('../services/profesiones.js');
const { puntaje } = await import('../services/esco.js');
const { parametrosAdzuna, terminosPara, AdapterManager } = await import('../services/jobAdapters/AdapterManager.js');

const realFetch = globalThis.fetch;
const pedidos = [];
globalThis.fetch = async (url) => {
    const u = new URL(url);
    pedidos.push(u);
    if (u.hostname === 'api.adzuna.com') {
        const pais = u.pathname.split('/')[4];
        return Response.json({ results: [{ id: `${pais}1`, title: `Oferta ${pais}`, redirect_url: `https://adzuna.test/${pais}/1`, company: { display_name: 'Empresa' }, location: { display_name: pais } }] });
    }
    if (u.hostname === 'ec.europa.eu') return Response.json({ _embedded: { results: [] } });
    return Response.json({ results: [], data: [], jobs: [] });
};
after(() => { globalThis.fetch = realFetch; });

test('destinos: nombres y códigos; España ya no cae en Reino Unido', () => {
    assert.equal(resolverDestino('España'), 'es');
    assert.equal(resolverDestino('es'), 'es');
    assert.equal(resolverDestino('Holanda'), 'nl');
    assert.equal(resolverDestino('Países Bajos'), 'nl');
    assert.equal(resolverDestino('Reino Unido'), 'gb');
    assert.equal(resolverDestino('Remoto'), 'remoto');
    assert.equal(resolverDestino(''), '');
    assert.equal(resolverDestino('Madrid'), '', 'una ciudad no se confunde con un país');
});

test('diccionario: formas del español llevan a los términos de cada país', () => {
    const p = buscarEnDiccionario('Enfermería');
    assert.equal(p.titulo, 'enfermero/enfermera');
    assert.ok(p.terminos.de.includes('Pflegefachkraft'));
    assert.ok(buscarEnDiccionario('cuidadora de ancianos').terminos.en.includes('care worker'));
    assert.ok(buscarEnDiccionario('chofer').terminos.nl.includes('chauffeur'));
    assert.equal(buscarEnDiccionario('Siemens'), null);
    for (const prof of PROFESIONES) {
        for (const l of ['es', 'en', 'de', 'nl', 'fr', 'it', 'pl']) assert.ok(prof.terminos[l]?.length, `${prof.titulo} sin términos en ${l}`);
    }
});

test('ESCO: el nombre principal exacto gana sobre una especialidad', () => {
    const general = { preferredLabel: { es: 'camarero/camarera' }, alternativeLabel: { es: [] } };
    const barman = { preferredLabel: { es: 'barman' }, alternativeLabel: { es: ['camarero de barra'] } };
    assert.ok(puntaje(general, 'camarero') > puntaje(barman, 'camarero'));
    assert.equal(puntaje({ preferredLabel: { es: 'soldador/soldadora' } }, 'Siemens'), 0);
});

test('Adzuna: palabras sueltas con what_or, frases con what_phrase', () => {
    assert.equal(parametrosAdzuna(['Kinderbetreuer', 'Nanny']), '&what_or=Kinderbetreuer%20Nanny');
    assert.equal(parametrosAdzuna(['assistante maternelle']), '&what_phrase=assistante%20maternelle');
    assert.equal(parametrosAdzuna([]), '');
    assert.deepEqual(terminosPara({ terminos: null }, ['de'], 'niñera'), ['niñera']);
});

test('buscar "enfermera" en Alemania: solo Adzuna Alemania, en alemán', async () => {
    pedidos.length = 0;
    const r = await AdapterManager.buscar('enfermera', 'de');
    const adzuna = pedidos.filter(u => u.hostname === 'api.adzuna.com');
    assert.equal(adzuna.length, 1);
    assert.match(adzuna[0].pathname, /\/jobs\/de\/search/);
    assert.match(adzuna[0].searchParams.get('what_or'), /Pflegefachkraft/);
    assert.equal(pedidos.some(u => u.hostname.includes('reed')), false, 'Reed es solo Reino Unido e Irlanda');
    assert.equal(r.interpretacion.destino, 'Alemania');
    assert.equal(r.interpretacion.profesion, 'enfermero/enfermera');
    assert.ok(r.interpretacion.terminos.includes('Pflegefachkraft'));
});

test('buscar en España usa adzuna.es en español', async () => {
    pedidos.length = 0;
    await AdapterManager.buscar('enfermera', 'España');
    const adzuna = pedidos.filter(u => u.hostname === 'api.adzuna.com');
    assert.match(adzuna[0].pathname, /\/jobs\/es\/search/);
    assert.match(adzuna[0].searchParams.get('what_or'), /enfermera/);
});

test('sin destino: varios países, cada uno en su idioma, sin duplicados', async () => {
    pedidos.length = 0;
    const r = await AdapterManager.buscar('enfermera', '');
    const paises = pedidos.filter(u => u.hostname === 'api.adzuna.com').map(u => u.pathname.split('/')[4]).sort();
    assert.deepEqual(paises, ['de', 'es', 'fr', 'gb', 'nl']);
    const gb = pedidos.find(u => u.pathname.includes('/gb/'));
    assert.match(gb.searchParams.get('what_or'), /nurse/);
    assert.equal(new Set(r.jobs.map(j => j.url)).size, r.jobs.length);
});

test('Remotive no se usa (sus términos prohíben mostrar ofertas a cambio de registro)', () => {
    for (const f of ['../services/jobAdapters/AdapterManager.js', '../config/apis.js']) {
        const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
        assert.doesNotMatch(src, /remotive\.com/i, f);
    }
});
