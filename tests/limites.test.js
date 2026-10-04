// Límites de la cuenta gratis en el ATS, con Supabase simulado.
// Los del simulador de entrevistas e idiomas están en practica.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import atsRoutes from '../routes/ats.js';

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

test('sin sesión: 401 en ATS', async () => {
    assert.equal((await post('/ats/evaluate', { cvText: CV })).status, 401);
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

test('Plan Pro: sin límite', async () => {
    planes.eva = 'pro';
    for (let i = 0; i < 3; i++) {
        assert.equal((await post('/ats/evaluate', { cvText: CV }, 'eva')).status, 200);
    }
});
