// Permisos del registro, "Mis datos", borrar cuenta y acceso de administradores.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';

process.env.ADMIN_EMAILS = 'admin@pg.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.ADMIN_TOKEN = 'token-admin';

const PUBLIC = new URL('../public/', import.meta.url);
const leer = f => fs.readFileSync(new URL(f, PUBLIC), 'utf8');

test('registro: todas las casillas de permisos empiezan desmarcadas y solo "términos" es obligatoria', () => {
    const src = leer('auth-gate.js');
    assert.match(src, /name="permiso_\$\{p\.tipo\}"\$\{p\.obligatorio \? ' required' : ''\}/);
    assert.doesNotMatch(src, /name="permiso_[^"]*"[^>]*checked/);
    const obligatorios = [...src.matchAll(/obligatorio: true/g)].length;
    assert.equal(obligatorios, 1);
});

test('el texto del permiso de trabajos de IA es el mismo en el registro y en el test de CI', () => {
    const extraer = (src, re) => (src.match(re) || [])[1];
    const enGate = extraer(leer('auth-gate.js'), /tipo: 'trabajos_ia', version: '([^']+)'/);
    const enCI = extraer(leer('test-ci.html'), /version: '(trabajos_ia_v\d+)'/);
    assert.equal(enGate, enCI);
    const texto = 'Quiero que Puentes Globales me escriba con propuestas de trabajo remoto de entrenamiento de inteligencia artificial';
    assert.ok(leer('auth-gate.js').includes(texto) && leer('test-ci.html').includes(texto));
});

test('los permisos enlazan a la política de privacidad y "Mis datos" existe', () => {
    assert.match(leer('auth-gate.js'), /privacidad\.html/);
    assert.match(leer('privacidad.html'), /id="terminos"/);
    assert.match(leer('mis-datos.html'), /PG_AUTH\.requireAuth\(\)/);
    assert.match(leer('mis-datos.html'), /BORRAR/);
});

test('la migración permite el tipo "terminos" y crea la auditoría', () => {
    const sql = fs.readFileSync(new URL('../supabase/migrations/20261003_pg_consentimientos.sql', import.meta.url), 'utf8');
    assert.match(sql, /'terminos'/);
    assert.match(sql, /create table if not exists public\.pg_auditoria/);
});

/* ─── Servidor con Supabase simulado ─────────────────────────────────────── */
const realFetch = globalThis.fetch;
const llamadas = [];
const USUARIOS = {
    'token-ana': { id: 'ana', email: 'ana@pg.test', email_confirmed_at: '2026-01-01' },
    'token-admin': { id: 'adm', email: 'admin@pg.test', email_confirmed_at: '2026-01-01' },
    'token-admin-sin-confirmar': { id: 'adm2', email: 'admin@pg.test', email_confirmed_at: null }
};

globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (!u.hostname.endsWith('supabase.co')) return realFetch(url, init);
    llamadas.push({ path: u.pathname, method: init.method || 'GET', headers: init.headers || {} });
    if (u.pathname === '/auth/v1/user') {
        const t = (init.headers?.Authorization || '').replace('Bearer ', '');
        return USUARIOS[t] ? Response.json(USUARIOS[t]) : new Response('{}', { status: 401 });
    }
    if (u.pathname.startsWith('/auth/v1/admin/users/')) return new Response('{}', { status: 200 });
    if (u.pathname === '/rest/v1/pg_candidatos') return Response.json([{ user_id: 'ana', email: 'ana@pg.test', nombre: 'Ana', telefono: '+54', profesion: 'Salud', created_at: '2026-10-01' }]);
    if (u.pathname === '/rest/v1/pg_consentimientos') return Response.json([
        { user_id: 'ana', tipo: 'compartir_cv', aceptado: false, created_at: '2026-10-03' },
        { user_id: 'ana', tipo: 'compartir_cv', aceptado: true, created_at: '2026-10-02' }
    ]);
    if (u.pathname === '/rest/v1/pg_resultados_test') return Response.json([{ user_id: 'ana', detalle: { ci_estimado: 118 }, created_at: '2026-10-02' }]);
    if (u.pathname === '/rest/v1/pg_auditoria') return new Response(null, { status: 201 });
    return new Response('not found', { status: 404 });
};

let server, base;
before(async () => {
    const { default: admin } = await import('../routes/admin.js');
    const { default: cuenta } = await import('../routes/cuenta.js');
    const app = express();
    app.use(express.json());
    app.use('/api/v1/admin', admin);
    app.use('/api/v1/cuenta', cuenta);
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });

const pedir = (path, token, init = {}) => realFetch(base + path, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });

test('candidatos: un usuario común recibe 403; sin sesión, 401', async () => {
    assert.equal((await pedir('/admin/candidatos')).status, 401);
    assert.equal((await pedir('/admin/candidatos', 'token-ana')).status, 403);
    assert.equal((await pedir('/admin/candidatos', 'token-admin-sin-confirmar')).status, 403, 'email sin confirmar no es admin');
});

test('candidatos: el admin ve el permiso vigente (el último) y el CI, y queda auditado', async () => {
    llamadas.length = 0;
    const res = await pedir('/admin/candidatos', 'token-admin');
    assert.equal(res.status, 200);
    const { items } = await res.json();
    assert.equal(items[0].permisos.compartir_cv, false, 'retiró el permiso después de darlo');
    assert.equal(items[0].ci, 118);
    assert.ok(llamadas.some(l => l.path === '/rest/v1/pg_auditoria' && l.method === 'POST'));
    const conClave = llamadas.find(l => l.path === '/rest/v1/pg_candidatos');
    assert.equal(conClave.headers.apikey, 'sb_secret_prueba');
    assert.equal(conClave.headers.Authorization, undefined, 'una clave sb_secret no va como Bearer');
});

test('estado de fuentes: vale la sesión de admin o ADMIN_TOKEN', async () => {
    assert.equal((await pedir('/admin/yo', 'token-admin').then(r => r.json())).admin, true);
    assert.equal((await pedir('/admin/yo', 'token-ana').then(r => r.json())).admin, false);
});

test('borrar cuenta: exige sesión y borra solo al propio usuario', async () => {
    assert.equal((await pedir('/cuenta', null, { method: 'DELETE' })).status, 401);
    llamadas.length = 0;
    const res = await pedir('/cuenta', 'token-ana', { method: 'DELETE' });
    assert.equal(res.status, 200);
    const borrado = llamadas.find(l => l.path.startsWith('/auth/v1/admin/users/'));
    assert.equal(borrado.path, '/auth/v1/admin/users/ana');
    assert.equal(borrado.method, 'DELETE');
});
