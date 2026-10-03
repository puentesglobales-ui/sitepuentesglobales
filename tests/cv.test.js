// Creador de CV: reglas de revisión (cv-guia.js) y rutas de profesiones con ESCO simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import profesionesRoutes from '../routes/profesiones.js';

import '../public/cv-guia.js';

const G = globalThis.CV_GUIA;

const realFetch = globalThis.fetch;
let llamadasEsco = 0;
globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.hostname !== 'ec.europa.eu') return realFetch(url, init);
    llamadasEsco++;
    if (u.pathname.endsWith('/search')) {
        return Response.json({ _embedded: { results: [{ title: 'soldador/soldadora', uri: 'http://data.europa.eu/esco/occupation/x1' }] } });
    }
    return Response.json({
        preferredLabel: { es: 'soldador/soldadora', de: 'Schweißer/Schweißerin', en: 'welder' },
        alternativeLabel: { de: ['Metallschweißer'] }
    });
};

let server, base;
before(async () => {
    const app = express();
    app.use('/api/v1/profesiones', profesionesRoutes);
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1/profesiones`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });
const get = async path => (await realFetch(base + path)).json();

const textos = r => r.items.map(i => i.texto).join(' | ');

const BUENO = {
    puesto: 'enfermero/enfermera', regulada: true, paises: ['de'], experiencia_puesto: '3_5',
    experiencia: [{ cargo: 'Enfermera de terapia intensiva', empresa: 'Hospital Italiano', desde: '2019-03', actual: true, tareas: 'Atendí 8 pacientes críticos por turno y coordiné la medicación con el equipo médico.' }],
    formacion: [{ titulo: 'Licenciatura en Enfermería', institucion: 'UBA', nivel: 'universitario', fin: '2018-12', reconocimiento: 'en_tramite' }],
    idiomas: [{ idioma: 'Español', nivel: 'Nativo' }, { idioma: 'Alemán', nivel: 'B2', certificado: 'Goethe B2' }],
    habilidades: ['Cuidados intensivos', 'Monitoreo de pacientes', 'Medicación endovenosa'],
    licencias: [],
    resumen: 'Enfermera con 6 años de experiencia en terapia intensiva y alemán B2 certificado. Busco trabajar en un hospital en Alemania.'
};
const CONTACTO = { nombre: 'Ana Pérez', telefono: '+54 9 11 1234 5678', email: 'ana@example.com' };

test('un CV completo y coherente saca 100', () => {
    const r = G.revisar(BUENO, CONTACTO);
    assert.equal(r.puntaje, 100, textos(r));
});

test('sin puesto ni países: error en el paso 1', () => {
    const r = G.revisar({ ...BUENO, puesto: '', paises: [] }, CONTACTO);
    assert.ok(r.items.some(i => i.nivel === 'error' && i.paso === 1));
});

test('profesión regulada sin reconocimiento: error', () => {
    const r = G.revisar({ ...BUENO, formacion: [{ ...BUENO.formacion[0], reconocimiento: 'no_iniciado' }] }, CONTACTO);
    assert.ok(r.items.some(i => i.nivel === 'error' && /regulada/.test(i.texto)), textos(r));
});

test('profesión regulada pide B2 del idioma del destino', () => {
    const r = G.revisar({ ...BUENO, idiomas: [{ idioma: 'Español', nivel: 'Nativo' }, { idioma: 'Alemán', nivel: 'B1' }] }, CONTACTO);
    assert.match(textos(r), /alemán es B1/);
});

test('sin el idioma del destino: avisa', () => {
    const r = G.revisar({ ...BUENO, idiomas: [{ idioma: 'Español', nivel: 'Nativo' }] }, CONTACTO);
    assert.match(textos(r), /alemán/i);
});

test('fechas imposibles y tareas vacías se detectan', () => {
    const r = G.revisar({ ...BUENO, experiencia: [{ cargo: 'Cajera', empresa: 'Súper', desde: '2022-05', hasta: '2021-01', tareas: 'varias' }] }, CONTACTO);
    assert.ok(r.errores >= 1, textos(r));
    assert.ok(r.items.some(i => i.paso === 3));
});

test('teléfono sin código de país: avisa', () => {
    const r = G.revisar(BUENO, { ...CONTACTO, telefono: '11 1234 5678' });
    assert.ok(r.items.some(i => i.paso === 2));
});

test('el formato depende del destino', () => {
    assert.equal(G.formatoPara(['de']), 'lebenslauf');
    assert.equal(G.formatoPara(['gb']), 'uk');
    assert.equal(G.formatoPara(['es']), 'europass');
});

test('consejos del objetivo: regulada, idioma del CV y un CV por puesto', () => {
    const c = G.consejosObjetivo({ puesto: 'enfermero/enfermera', paises: ['de'], regulada: true, experiencia_puesto: '1_3' });
    const t = c.map(x => x.texto).join(' | ');
    assert.match(t, /Anerkennung/);
    assert.match(t, /B2/);
    assert.match(t, /alemán o en inglés/);
    assert.match(t, /Un CV para cada puesto/);
    const uk = G.consejosObjetivo({ puesto: 'chofer', paises: ['gb'], experiencia_puesto: 'ninguna' }).map(x => x.texto).join(' | ');
    assert.match(uk, /en inglés, en formato/);
    assert.doesNotMatch(uk, /inglés o en inglés/);
});

test('sugerir: diccionario primero, sin ESCO con pocas letras', async () => {
    const antes = llamadasEsco;
    const r = await get('/sugerir?q=enf');
    assert.equal(r.sugerencias[0].titulo, 'enfermero/enfermera');
    assert.equal(r.sugerencias[0].regulada, true);
    assert.equal(llamadasEsco, antes);
});

test('sugerir: completa con ESCO y sin duplicados', async () => {
    const r = await get('/sugerir?q=soldador');
    assert.ok(r.sugerencias.some(s => s.titulo === 'soldador/soldadora' && s.fuente === 'esco'));
    const titulos = r.sugerencias.map(s => s.titulo);
    assert.equal(new Set(titulos).size, titulos.length);
});

test('traducir: el título del diccionario da los nombres por país y si es regulada', async () => {
    const r = await get('/traducir?q=enfermero%2Fenfermera&paises=de,gb,xx');
    assert.equal(r.encontrada, true);
    assert.equal(r.regulada, true);
    assert.deepEqual(Object.keys(r.nombres), ['de', 'gb']);
    assert.ok(r.nombres.de.length > 0);
});

test('traducir: profesión fuera del diccionario va a ESCO', async () => {
    const r = await get('/traducir?q=soldador&paises=de');
    assert.equal(r.encontrada, true);
    assert.equal(r.regulada, null);
    assert.deepEqual(r.nombres.de, ['Schweißer', 'Schweißerin', 'Metallschweißer']);
});

test('resumen con partes del modelo sin completar: error', () => {
    const r = G.revisar({ ...BUENO, resumen: 'Enfermera con 5 años de experiencia en [tu especialidad]. [Tu logro principal]. Busco trabajar en Alemania.' }, CONTACTO);
    assert.ok(r.items.some(i => i.nivel === 'error' && /corchetes/.test(i.texto)), textos(r));
});

test('EE. UU. y Canadá: résumé y aviso de visa', () => {
    assert.equal(G.formatoPara(['us']), 'us');
    assert.equal(G.formatoPara(['ca']), 'us');
    const t = G.consejosObjetivo({ puesto: 'soldador', paises: ['us'], experiencia_puesto: '3_5' }).map(x => x.texto).join(' | ');
    assert.match(t, /visa sponsorship/);
});

test('traducir: EE. UU. usa los nombres en inglés', async () => {
    const r = await get('/traducir?q=soldador&paises=us');
    assert.deepEqual(r.nombres.us, ['welder']);
});
