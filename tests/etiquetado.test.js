// Prueba de aptitud para etiquetado de IA y embudo de selección, con Supabase simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { instalar } from './helpers/supabaseFalso.js';
import { SECCIONES, corregir, preguntasPublicas, validarRedaccion, limpiarSenales } from '../services/etiquetado.js';

process.env.ADMIN_EMAILS = 'admin@pg.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.PUBLIC_URL = 'https://pg.test';
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';
const CARLA = '33333333-3333-4333-8333-333333333333';
const USUARIOS = {
    'token-ana': { id: ANA, email: 'ana@pg.test', email_confirmed_at: '2026-01-01' },
    'token-beto': { id: BETO, email: 'beto@pg.test', email_confirmed_at: '2026-01-01' },
    'token-carla': { id: CARLA, email: 'carla@pg.test', email_confirmed_at: '2026-01-01' },
    'token-admin': { id: 'adm', email: 'admin@pg.test', email_confirmed_at: '2026-01-01' }
};
let db;
const emails = [];
const desinstalar = instalar({
    db: () => db, usuarios: USUARIOS,
    otros: async (u, init) => {
        if (u.hostname !== 'api.resend.com') return null;
        emails.push(JSON.parse(init.body));
        return Response.json({ id: 'email-1' });
    }
});

function reiniciar() {
    db = {
        pg_candidatos: [
            { user_id: ANA, email: 'ana@pg.test', nombre: 'Ana Pérez', profesion: 'Tecnología / IT' },
            { user_id: BETO, email: 'beto@pg.test', nombre: 'Beto', profesion: null },
            { user_id: CARLA, email: 'carla@pg.test', nombre: 'Carla', profesion: null }
        ],
        pg_consentimientos: [
            { user_id: ANA, tipo: 'trabajos_ia', aceptado: true, created_at: '2026-09-01T00:00:00Z' },
            // Beto aceptó y después retiró el permiso.
            { user_id: BETO, tipo: 'trabajos_ia', aceptado: true, created_at: '2026-09-01T00:00:00Z' },
            { user_id: BETO, tipo: 'trabajos_ia', aceptado: false, created_at: '2026-09-02T00:00:00Z' }
        ],
        pg_resultados_test: [{ user_id: ANA, test: 'ci', detalle: { ci_estimado: 124 }, created_at: '2026-09-01T00:00:00Z' }],
        pg_etiquetado: [],
        pg_auditoria: []
    };
    emails.length = 0;
}

let server, base;
before(async () => {
    const { default: rutas } = await import('../routes/etiquetado.js');
    const app = express();
    app.use(express.json());
    app.use('/api/v1/etiquetado', rutas);
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1/etiquetado`;
});
after(() => { server.close(); desinstalar(); });

async function llamar(path, token, body) {
    const res = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
}

const PERFECTAS = Object.fromEntries(SECCIONES.flatMap(s => s.preguntas.map(p => [p.id, p.correcta ?? p.correctas])).filter(([, v]) => v !== undefined));
const REDACCION = 'La respuesta A es mejor porque el resultado es correcto: el quince por ciento de ochenta es doce. La B explica bien el método, multiplicar por cero coma quince, pero se equivoca en la cuenta y da diez. Para la guía lo primero es que la respuesta sea correcta, así que A gana aunque sea más corta.';

/* ─── Corrección ──────────────────────────────────────────────────────── */
test('respuestas perfectas: 24 de 24', () => {
    const r = corregir(PERFECTAS);
    assert.equal(r.maximo, 24);
    assert.equal(r.puntaje, 24);
});

test('detectar errores: puntaje parcial con un solo fallo', () => {
    assert.equal(corregir({ e1: [1, 3] }).detalle.e1, 2);
    assert.equal(corregir({ e1: [1] }).detalle.e1, 1);
    assert.equal(corregir({ e1: [0, 2] }).detalle.e1, 0);
    assert.equal(corregir({ e1: ['x', 99] }).detalle.e1, 0);
});

test('al navegador no le llegan las respuestas correctas', () => {
    const json = JSON.stringify(preguntasPublicas());
    assert.doesNotMatch(json, /"correcta"|"correctas"/);
    assert.match(json, /Seguir una guía/);
});

test('la redacción exige un mínimo de palabras', () => {
    assert.ok(validarRedaccion('muy corta'));
    assert.equal(validarRedaccion(REDACCION), null);
});

test('señales: se limitan y se marca si se pasó del tiempo', () => {
    const hace40 = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const s = limpiarSenales({ cambios_pestana: '3', intentos_pegar: -5 }, hace40);
    assert.equal(s.cambios_pestana, 3);
    assert.equal(s.intentos_pegar, 0);
    assert.equal(s.fuera_de_tiempo, true);
});

/* ─── Candidatos ──────────────────────────────────────────────────────── */
test('sin sesión: 401', async () => {
    reiniciar();
    assert.equal((await llamar('/estado')).status, 401);
});

test('sin permiso de trabajos de IA no se puede empezar', async () => {
    reiniciar();
    assert.equal((await llamar('/iniciar', 'token-carla', {})).status, 403);
    assert.equal((await llamar('/iniciar', 'token-beto', {})).status, 403, 'Beto retiró el permiso');
});

test('prueba completa: se corrige en el servidor y se hace una sola vez', async () => {
    reiniciar();
    const ini = await llamar('/iniciar', 'token-ana', {});
    assert.equal(ini.status, 200);
    assert.ok(ini.body.segundos_restantes > 0);
    assert.doesNotMatch(JSON.stringify(ini.body), /"correcta"/);

    assert.equal((await llamar('/enviar', 'token-ana', { respuestas: PERFECTAS, redaccion: 'corta' })).status, 400);

    const env = await llamar('/enviar', 'token-ana', { respuestas: PERFECTAS, redaccion: REDACCION, senales: { cambios_pestana: 1 } });
    assert.equal(env.status, 200);
    assert.equal(env.body.puntaje, 24);
    const fila = db.pg_etiquetado.find(f => f.user_id === ANA);
    assert.equal(fila.estado, 'prueba_hecha');
    assert.equal(fila.senales.cambios_pestana, 1);

    assert.equal((await llamar('/enviar', 'token-ana', { respuestas: PERFECTAS, redaccion: REDACCION })).status, 409);
    assert.equal((await llamar('/iniciar', 'token-ana', {})).status, 409);
    const est = await llamar('/estado', 'token-ana');
    assert.equal(est.body.hecha, true);
});

test('retomar la prueba no reinicia el reloj', async () => {
    reiniciar();
    db.pg_etiquetado.push({ user_id: ANA, estado: 'prueba_iniciada', prueba_inicio_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
    const r = await llamar('/iniciar', 'token-ana', {});
    assert.ok(r.body.segundos_restantes <= 20 * 60 && r.body.segundos_restantes > 19 * 60);
});

/* ─── Administración ──────────────────────────────────────────────────── */
test('embudo: solo admins y solo quienes tienen el permiso vigente', async () => {
    reiniciar();
    assert.equal((await llamar('/admin/embudo', 'token-ana')).status, 403);
    const r = await llamar('/admin/embudo', 'token-admin');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map(i => i.email), ['ana@pg.test']);
    assert.equal(r.body.items[0].ci, 124);
    assert.equal(r.body.items[0].estado, 'anotado');
    assert.equal(r.body.email_disponible, false);
    assert.match(r.body.textos.prueba.texto, /https:\/\/pg\.test\/test-etiquetado\.html/);
    assert.match(r.body.textos.prueba.texto, /mis-datos\.html/);
});

test('invitar sin email configurado: solo en modo manual', async () => {
    reiniciar();
    assert.equal((await llamar('/admin/invitar', 'token-admin', { user_ids: [ANA], etapa: 'prueba' })).status, 400);
    const r = await llamar('/admin/invitar', 'token-admin', { user_ids: [ANA, BETO], etapa: 'prueba', manual: true });
    assert.deepEqual(r.body.invitados, ['ana@pg.test']);
    assert.deepEqual(r.body.omitidos, [{ email: 'beto@pg.test', motivo: 'sin permiso' }]);
    assert.equal(db.pg_etiquetado.find(f => f.user_id === ANA).estado, 'invitado_prueba');
    assert.equal(emails.length, 0);
});

test('invitar con Resend configurado envía el email', async () => {
    reiniciar();
    process.env.RESEND_API_KEY = 're_prueba';
    process.env.EMAIL_FROM = 'Puentes Globales <hola@pg.test>';
    try {
        const r = await llamar('/admin/invitar', 'token-admin', { user_ids: [ANA], etapa: 'prueba' });
        assert.deepEqual(r.body.invitados, ['ana@pg.test']);
        assert.equal(emails.length, 1);
        assert.deepEqual(emails[0].to, ['ana@pg.test']);
        assert.match(emails[0].text, /Hola, Ana:/);
        // A la entrevista solo se invita después de la prueba.
        const r2 = await llamar('/admin/invitar', 'token-admin', { user_ids: [ANA], etapa: 'entrevista' });
        assert.equal(r2.body.invitados.length, 0);
    } finally {
        delete process.env.RESEND_API_KEY;
        delete process.env.EMAIL_FROM;
    }
});

test('revisar: aprobar con nota queda auditado', async () => {
    reiniciar();
    const r = await llamar('/admin/revisar', 'token-admin', { user_id: ANA, estado: 'aprobado', nota: 'Muy buena redacción' });
    assert.equal(r.status, 200);
    const f = db.pg_etiquetado.find(x => x.user_id === ANA);
    assert.equal(f.estado, 'aprobado');
    assert.equal(f.revisado_por, 'admin@pg.test');
    assert.ok(db.pg_auditoria.some(a => a.accion === 'etiquetado_aprobado'));
    assert.equal((await llamar('/admin/revisar', 'token-admin', { user_id: ANA, estado: 'otro' })).status, 400);
});
