// Límites de la cuenta gratis en ATS y entrevista, con Supabase simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import atsRoutes from '../routes/ats.js';
import talkmeRoutes from '../routes/talkme.js';

const realFetch = globalThis.fetch;
const usos = []; // filas de pg_uso simuladas
let planes = {}; // user_id → plan

// Supabase falso: /auth/v1/user y las tablas pg_planes / pg_uso.
globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (!u.hostname.endsWith('supabase.co')) return realFetch(url, init);
    const token = (init.headers?.Authorization || '').replace('Bearer ', '');
    const userId = token.replace('token-', '');
    if (u.pathname === '/auth/v1/user') {
        return token.startsWith('token-') ? Response.json({ id: userId }) : new Response('{}', { status: 401 });
    }
    if (u.pathname === '/rest/v1/pg_planes') {
        return Response.json(planes[userId] ? [{ plan: planes[userId], vence: null }] : []);
    }
    if (u.pathname === '/rest/v1/pg_uso') {
        if (init.method === 'POST') {
            usos.push({ ...JSON.parse(init.body), created_at: new Date().toISOString() });
            return new Response(null, { status: 201 });
        }
        const herramienta = u.searchParams.get('herramienta').replace('eq.', '');
        const desde = u.searchParams.get('created_at')?.replace('gte.', '');
        const n = usos.filter(r => r.user_id === userId && r.herramienta === herramienta && (!desde || r.created_at >= desde)).length;
        return new Response(null, { status: 200, headers: { 'content-range': `0-0/${n}` } });
    }
    return new Response('not found', { status: 404 });
};

let server, base;
before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/ats', atsRoutes);
    app.use('/api/v1/talkme', talkmeRoutes);
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });

async function post(path, body, user) {
    const res = await realFetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer token-${user}` } : {}) },
        body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
}

const CV = 'Experiencia laboral: enfermera en hospital durante 5 años. Educación: universidad. Email: a@b.com';

test('sin sesión: 401 en ATS y entrevista', async () => {
    assert.equal((await post('/ats/evaluate', { cvText: CV })).status, 401);
    assert.equal((await post('/talkme/interview', { jobTitle: 'Enfermera', step: 1 })).status, 401);
});

test('ATS gratis: el primero funciona, el segundo pide plan', async () => {
    assert.equal((await post('/ats/evaluate', { cvText: CV }, 'ana')).status, 200);
    const segundo = await post('/ats/evaluate', { cvText: CV }, 'ana');
    assert.equal(segundo.status, 403);
    assert.equal(segundo.body.code, 'limite');
});

test('ATS: un CV vacío no gasta el uso gratis', async () => {
    assert.equal((await post('/ats/evaluate', { cvText: 'corto' }, 'beto')).status, 400);
    assert.equal((await post('/ats/evaluate', { cvText: CV }, 'beto')).status, 200);
});

test('entrevista gratis: una entrevista completa, la segunda pide plan', async () => {
    assert.equal((await post('/talkme/interview', { jobTitle: 'Chofer', step: 1 }, 'carla')).status, 200);
    for (let step = 2; step <= 4; step++) {
        assert.equal((await post('/talkme/interview', { jobTitle: 'Chofer', candidateAnswer: 'respuesta', step }, 'carla')).status, 200, `paso ${step}`);
    }
    assert.equal(usos.filter(u => u.user_id === 'carla').length, 1, 'una entrevista = un uso');
    assert.equal((await post('/talkme/interview', { jobTitle: 'Chofer', step: 1 }, 'carla')).status, 403);
});

test('entrevista: no se puede saltar al paso 2 sin haber empezado', async () => {
    const r = await post('/talkme/interview', { jobTitle: 'Chofer', step: 2 }, 'dani');
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'reiniciar');
});

test('Plan Pro: sin límite', async () => {
    planes.eva = 'pro';
    for (let i = 0; i < 3; i++) {
        assert.equal((await post('/ats/evaluate', { cvText: CV }, 'eva')).status, 200);
        assert.equal((await post('/talkme/interview', { jobTitle: 'Cocinero', step: 1 }, 'eva')).status, 200);
    }
});
