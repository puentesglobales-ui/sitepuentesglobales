// Evaluador de visas: respuestas escritas, calificadas por Alex IO (simulado), con Supabase simulado.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { instalar } from './helpers/supabaseFalso.js';

process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.ALEXIO_ENGINE_URL = 'https://motor.test';
process.env.ALEXIO_ENGINE_KEY = 'clave';
process.env.ALEXIO_REF_SECRET = 'secreto-ref';
delete process.env.ALEXIO_EVALUADOR;

const ANA = '11111111-1111-4111-8111-111111111111';
const USUARIOS = { 'token-ana': { id: ANA, email: 'ana@pg.test', email_confirmed_at: '2026-01-01' } };
const RESPUESTAS = {
    estudios: 'Licenciatura en Enfermería, UBA, 2018.',
    idiomas: 'Español nativo, alemán B1 (Goethe).',
    experiencia: 'Enfermera en terapia intensiva, 6 años en el Hospital Italiano.',
    destino: 'Alemania, enfermera',
    situacion: 'Pasaporte argentino, sin oferta.',
    objetivo: ''
};

let db, pedidos, fallar;
const desinstalar = instalar({
    db: () => db,
    usuarios: USUARIOS,
    otros: async (u, init) => {
        if (u.hostname !== 'motor.test') return null;
        pedidos.push({ path: u.pathname, body: JSON.parse(init.body || 'null') });
        if (fallar) return Response.json({ error: 'x', code: 'INTERNAL_ERROR' }, { status: 500 });
        return Response.json({
            score: 64.6, level: 'media', summary: 'Buen perfil; falta el alemán B2 y el reconocimiento.',
            pathways: [
                { name: 'Chancenkarte', country: 'Alemania', fit: 'si', reason: 'Título y alemán A1 o más.' },
                { name: 'EU Blue Card', country: 'Alemania', fit: 'no', reason: 'Necesita una oferta con salario mínimo.' },
                { name: '', fit: 'si' }
            ],
            gaps: ['Alemán B2 para el reconocimiento'], next_steps: ['Iniciar la Anerkennung', 'Preparar el Goethe B2']
        });
    }
});

let server, base;
before(async () => {
    const { default: rutas } = await import('../routes/evaluador.js');
    const app = express();
    app.use(express.json());
    app.use('/api/v1/evaluador', rutas);
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1/evaluador`;
});
after(() => { server.close(); desinstalar(); });
beforeEach(() => { db = { pg_evaluaciones: [] }; pedidos = []; fallar = false; delete process.env.ALEXIO_EVALUADOR; });

async function llamar(token, body) {
    const res = await fetch(`${base}/visa`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
}

test('sin sesión: 401', async () => {
    assert.equal((await llamar(null)).status, 401);
});

test('respuestas demasiado cortas o largas: 400', async () => {
    assert.equal((await llamar('token-ana', { ...RESPUESTAS, experiencia: 'poco' })).status, 400);
    assert.equal((await llamar('token-ana', { ...RESPUESTAS, destino: 'x'.repeat(301) })).status, 400);
    assert.equal(db.pg_evaluaciones.length, 0);
});

test('sin el evaluador de Alex IO encendido: se guarda como pendiente y no se llama a Alex IO', async () => {
    const r = await llamar('token-ana', RESPUESTAS);
    assert.equal(r.status, 201);
    assert.equal(r.body.evaluacion.estado, 'pendiente');
    assert.equal(pedidos.length, 0);
    assert.equal((await llamar('token-ana')).body.ia_disponible, false);
});

test('con ALEXIO_EVALUADOR=1: Alex IO califica con un seudónimo y se guarda el resultado normalizado', async () => {
    process.env.ALEXIO_EVALUADOR = '1';
    const r = await llamar('token-ana', RESPUESTAS);
    assert.equal(r.status, 201);
    const e = r.body.evaluacion;
    assert.equal(e.estado, 'evaluada');
    assert.equal(e.puntaje, 65);
    assert.equal(e.resultado.nivel, 'media');
    assert.deepEqual(e.resultado.vias.map(v => [v.nombre, v.encaje]), [['Chancenkarte', 'si'], ['EU Blue Card', 'no']], 'se descartan las vías sin nombre');
    assert.deepEqual(e.resultado.pasos, ['Iniciar la Anerkennung', 'Preparar el Goethe B2']);
    const [p] = pedidos;
    assert.equal(p.path, '/api/engine/evaluations');
    assert.equal(p.body.type, 'visa_eligibility');
    assert.equal(p.body.student_ref, crypto.createHmac('sha256', 'secreto-ref').update(ANA).digest('hex'));
    assert.deepEqual(p.body.input, RESPUESTAS);
    assert.ok(!JSON.stringify(p).includes('ana@pg.test') && !JSON.stringify(p).includes(ANA));
});

test('si Alex IO falla, las respuestas no se pierden: quedan pendientes con aviso', async () => {
    process.env.ALEXIO_EVALUADOR = '1';
    fallar = true;
    const r = await llamar('token-ana', RESPUESTAS);
    assert.equal(r.status, 201);
    assert.equal(r.body.evaluacion.estado, 'pendiente');
    assert.match(r.body.aviso, /Guardamos tus respuestas/);
    assert.equal(db.pg_evaluaciones.length, 1);
});

test('máximo 3 evaluaciones por día', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await llamar('token-ana', RESPUESTAS)).status, 201);
    const r = await llamar('token-ana', RESPUESTAS);
    assert.equal(r.status, 429);
    assert.equal(r.body.code, 'limite');
    const lista = await llamar('token-ana');
    assert.equal(lista.body.evaluaciones.length, 3);
});
