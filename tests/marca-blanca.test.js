// Marca blanca: empresas, precios propios, combos, medios de pago con respaldo de la plataforma,
// permisos de superadmin y de admin de empresa. Supabase simulado en memoria.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';

process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.SUPER_ADMIN_EMAILS = 'super@pg.test';
process.env.BASE_DOMAIN = 'puentesglobales.com';
process.env.PAYMENTS_ENC_KEY = crypto.randomBytes(32).toString('base64');

const { cifrar, descifrar } = await import('../services/cifrado.js');
const { limpiarCacheOrgs } = await import('../services/marcaBlanca.js');

/* ─── PostgREST falso ─────────────────────────────────────────────────────── */
let db;
function semilla() {
  db = {
    pg_plataforma: [{ id: true, comision_pct: 15 }],
    pg_productos: [
      { codigo: 'tests', nombre: 'Tests', precio_base: 0, moneda: 'USD', periodo: 'unico', activo: true },
      { codigo: 'simulador', nombre: 'Simulador', precio_base: 15, moneda: 'USD', periodo: 'mes', activo: true },
      { codigo: 'constructor_cv', nombre: 'Constructor de CV', precio_base: 12, moneda: 'USD', periodo: 'mes', activo: true },
      { codigo: 'ats', nombre: 'ATS', precio_base: 9, moneda: 'USD', periodo: 'mes', activo: true },
      { codigo: 'idiomas', nombre: 'Idiomas', precio_base: 19, moneda: 'USD', periodo: 'mes', activo: true }
    ],
    pg_organizaciones: [
      { id: 'aaaaaaaa-0000-0000-0000-000000000001', slug: 'agencia', nombre: 'Agencia Uno', dominio: 'empleo.agenciauno.com', logo_url: null, color_primario: '#123456', color_acento: '#000000', email_contacto: null, comision_pct: null, activa: true },
      { id: 'aaaaaaaa-0000-0000-0000-000000000002', slug: 'otra', nombre: 'Otra', dominio: null, logo_url: null, color_primario: '#FF6A00', color_acento: '#0f172a', comision_pct: 10, activa: true }
    ],
    pg_org_miembros: [{ org_id: 'aaaaaaaa-0000-0000-0000-000000000001', user_id: 'u-admin', rol: 'owner' }],
    pg_org_precios: [],
    pg_combos: [{ id: 'cccccccc-0000-0000-0000-000000000001', org_id: null, nombre: 'Plan Profesional', precio: 29, moneda: 'USD', periodo: 'mes', activo: true }],
    pg_combo_items: [
      { combo_id: 'cccccccc-0000-0000-0000-000000000001', producto: 'simulador', cantidad: 1 },
      { combo_id: 'cccccccc-0000-0000-0000-000000000001', producto: 'ats', cantidad: 1 }
    ],
    pg_org_pagos: [{ id: 'pppppppp-0000-0000-0000-000000000001', org_id: null, metodo: 'stripe', activo: true, modo: 'prueba', config_publica: { publishable_key: 'pk_test_plataforma123' }, credenciales: cifrar({ secret_key: 'sk_test_plataforma123' }) }],
    pg_candidatos: [
      { user_id: 'u-admin', email: 'admin@agencia.test', nombre: 'Admin', org_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
      { user_id: 'u-nuevo', email: 'nuevo@agencia.test', nombre: 'Nuevo', org_id: null }
    ],
    pg_auditoria: []
  };
}

const USUARIOS = {
  't-super': { id: 'u-super', email: 'super@pg.test', email_confirmed_at: 'x' },
  't-admin': { id: 'u-admin', email: 'admin@agencia.test', email_confirmed_at: 'x' },
  't-otro': { id: 'u-otro', email: 'otro@x.test', email_confirmed_at: 'x' }
};

function filtrar(filas, params) {
  return filas.filter(f => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...resto] = v.split('.');
      const val = resto.join('.');
      if (op === 'eq' && String(f[k]) !== decodeURIComponent(val)) return false;
      if (op === 'is' && val === 'null' && f[k] !== null && f[k] !== undefined) return false;
      if (op === 'is' && val === 'true' && f[k] !== true) return false;
      if (op === 'in' && !val.replace(/[()]/g, '').split(',').includes(String(f[k]))) return false;
    }
    return true;
  });
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (!u.hostname.endsWith('supabase.co')) return realFetch(url, init);
  if (u.pathname === '/auth/v1/user') {
    const t = (init.headers?.Authorization || '').replace('Bearer ', '');
    return USUARIOS[t] ? Response.json(USUARIOS[t]) : new Response('{}', { status: 401 });
  }
  const tabla = u.pathname.replace('/rest/v1/', '');
  const filas = db[tabla];
  if (!filas) return new Response('tabla desconocida', { status: 404 });
  const params = [...u.searchParams.entries()];
  const metodo = init.method || 'GET';
  if (metodo === 'GET') {
    let r = filtrar(filas, params).map(f => ({ ...f }));
    if ((u.searchParams.get('select') || '').includes('items:pg_combo_items')) {
      r = r.map(c => ({ ...c, items: db.pg_combo_items.filter(i => i.combo_id === c.id).map(({ producto, cantidad }) => ({ producto, cantidad })) }));
    }
    const limit = Number(u.searchParams.get('limit')) || r.length;
    return Response.json(r.slice(0, limit));
  }
  if (metodo === 'POST') {
    const nuevas = JSON.parse(init.body).map(f => ({ id: crypto.randomUUID(), activo: true, created_at: new Date().toISOString(), ...f }));
    const conflicto = u.searchParams.get('on_conflict');
    for (const n of nuevas) {
      const i = conflicto ? filas.findIndex(f => conflicto.split(',').every(c => f[c] === n[c])) : -1;
      if (i >= 0) filas[i] = { ...filas[i], ...n }; else filas.push(n);
    }
    return (init.headers?.Prefer || '').includes('representation') ? Response.json(nuevas) : new Response(null, { status: 201 });
  }
  if (metodo === 'PATCH') {
    for (const f of filtrar(filas, params)) Object.assign(f, JSON.parse(init.body));
    return new Response(null, { status: 204 });
  }
  if (metodo === 'DELETE') {
    const borrar = new Set(filtrar(filas, params));
    db[tabla] = filas.filter(f => !borrar.has(f));
    if (tabla === 'pg_combos') db.pg_combo_items = db.pg_combo_items.filter(i => ![...borrar].some(c => c.id === i.combo_id));
    return new Response(null, { status: 204 });
  }
  return new Response('metodo', { status: 405 });
};

let server, base;
before(async () => {
  const { default: org } = await import('../routes/org.js');
  const { default: empresa } = await import('../routes/empresa.js');
  const { default: superadmin } = await import('../routes/superadmin.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/org', org);
  app.use('/api/v1/empresa/:slug', empresa);
  app.use('/api/v1/superadmin', superadmin);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });
beforeEach(() => { semilla(); limpiarCacheOrgs(); });

async function api(path, { token, method = 'GET', body, host } = {}) {
  const res = await realFetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(host ? { 'x-forwarded-host': host } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

/* ─── Tests ───────────────────────────────────────────────────────────────── */
test('cifrado: ida y vuelta, y detecta datos alterados', () => {
  const c = cifrar({ secret_key: 'sk_test_abc' });
  assert.ok(!c.includes('sk_test_abc'));
  assert.deepEqual(descifrar(c), { secret_key: 'sk_test_abc' });
  const partes = c.split(':');
  partes[3] = Buffer.from('otra cosa').toString('base64');
  assert.throws(() => descifrar(partes.join(':')));
});

test('config sin empresa: marca, precios y medios de pago de la plataforma', async () => {
  const { body } = await api('/org/config');
  assert.equal(body.marca.nombre, 'Puentes Globales');
  assert.equal(body.productos.find(p => p.codigo === 'simulador').precio, 15);
  assert.equal(body.combos[0].nombre, 'Plan Profesional');
  assert.equal(body.pagos.length, 1);
  assert.equal(body.pagos[0].cuenta, 'plataforma');
  assert.doesNotMatch(JSON.stringify(body), /sk_test|credenciales|comision/);
});

test('config de empresa: su marca, sus precios, productos ocultos y respaldo de pagos', async () => {
  db.pg_org_precios.push(
    { org_id: 'aaaaaaaa-0000-0000-0000-000000000001', producto: 'simulador', precio: 20, moneda: 'EUR', visible: true },
    { org_id: 'aaaaaaaa-0000-0000-0000-000000000001', producto: 'idiomas', precio: 0, moneda: 'USD', visible: false }
  );
  const { body } = await api('/org/config?org=agencia');
  assert.equal(body.marca.nombre, 'Agencia Uno');
  assert.equal(body.marca.color_primario, '#123456');
  const sim = body.productos.find(p => p.codigo === 'simulador');
  assert.deepEqual([sim.precio, sim.moneda, sim.precio_propio], [20, 'EUR', true]);
  assert.equal(body.productos.find(p => p.codigo === 'ats').precio, 9, 'sin precio propio usa el base');
  assert.equal(body.productos.some(p => p.codigo === 'idiomas'), false, 'oculto');
  assert.equal(body.combos[0].nombre, 'Plan Profesional', 'sin combos propios usa los de la plataforma');
  assert.equal(body.pagos[0].cuenta, 'plataforma', 'sin medios propios usa los de la plataforma');
});

test('la empresa se reconoce por subdominio y por dominio propio', async () => {
  // express usa el header Host; lo simulamos llamando a resolverOrg directamente.
  const { resolverOrg } = await import('../services/marcaBlanca.js');
  const req = host => ({ query: {}, get: h => (h === 'host' ? host : undefined) });
  assert.equal((await resolverOrg(req('agencia.puentesglobales.com'))).slug, 'agencia');
  assert.equal((await resolverOrg(req('empleo.agenciauno.com'))).slug, 'agencia');
  assert.equal(await resolverOrg(req('puentesglobales.com')), null);
  assert.equal(await resolverOrg(req('sitepuentesglobales.onrender.com')), null);
  assert.equal(await resolverOrg({ query: { org: 'no-existe' }, get: () => '' }), null);
});

test('panel de empresa: solo sus admins (o el superadmin)', async () => {
  assert.equal((await api('/empresa/agencia')).status, 401);
  assert.equal((await api('/empresa/agencia', { token: 't-otro' })).status, 403);
  assert.equal((await api('/empresa/otra', { token: 't-admin' })).status, 403, 'admin de otra empresa');
  assert.equal((await api('/empresa/agencia', { token: 't-admin' })).status, 200);
  assert.equal((await api('/empresa/agencia', { token: 't-super' })).status, 200);
});

test('precios: la empresa fija y quita su precio; se validan los datos', async () => {
  assert.equal((await api('/empresa/agencia/precios/simulador', { token: 't-admin', method: 'PUT', body: { precio: -1 } })).status, 400);
  assert.equal((await api('/empresa/agencia/precios/no-existe', { token: 't-admin', method: 'PUT', body: { precio: 5 } })).status, 400);
  assert.equal((await api('/empresa/agencia/precios/ats', { token: 't-admin', method: 'PUT', body: { precio: 5, moneda: 'EUR' } })).status, 200);
  assert.equal(db.pg_org_precios[0].precio, 5);
  await api('/empresa/agencia/precios/ats', { token: 't-admin', method: 'DELETE' });
  assert.equal(db.pg_org_precios.length, 0);
});

test('combos: la empresa arma los suyos y no puede tocar los ajenos', async () => {
  const malo = await api('/empresa/agencia/combos', { token: 't-admin', method: 'POST', body: { nombre: 'Solo uno', precio: 10, items: [{ producto: 'ats' }] } });
  assert.equal(malo.status, 400);
  const ok = await api('/empresa/agencia/combos', { token: 't-admin', method: 'POST', body: { nombre: 'Combo Alemania', precio: 25, moneda: 'EUR', items: [{ producto: 'idiomas' }, { producto: 'constructor_cv' }, { producto: 'simulador', cantidad: 10 }] } });
  assert.equal(ok.status, 200);
  const { body } = await api('/org/config?org=agencia');
  assert.equal(body.combos.length, 1, 'con combos propios ya no muestra los de la plataforma');
  assert.equal(body.combos[0].items.length, 3);
  const ajeno = await api('/empresa/agencia/combos/cccccccc-0000-0000-0000-000000000001', { token: 't-admin', method: 'DELETE' });
  assert.equal(ajeno.status, 400, 'el combo de la plataforma no es de la empresa');
});

test('medios de pago: claves cifradas, nunca devueltas, y la empresa pasa a cobrar con los suyos', async () => {
  const sinClaves = await api('/empresa/agencia/pagos/mercadopago', { token: 't-admin', method: 'PUT', body: { activo: true } });
  assert.equal(sinClaves.status, 400);
  const formatoMalo = await api('/empresa/agencia/pagos/stripe', { token: 't-admin', method: 'PUT', body: { secretos: { secret_key: 'cualquier-cosa' } } });
  assert.equal(formatoMalo.status, 400);
  const ok = await api('/empresa/agencia/pagos/mercadopago', { token: 't-admin', method: 'PUT', body: { activo: true, modo: 'prueba', publicos: { public_key: 'TEST-1234567890abcdef' }, secretos: { access_token: 'TEST-secreto-1234567890' } } });
  assert.equal(ok.status, 200);
  const fila = db.pg_org_pagos.find(p => p.org_id === 'aaaaaaaa-0000-0000-0000-000000000001');
  assert.ok(fila.credenciales.startsWith('v1:'));
  assert.ok(!fila.credenciales.includes('TEST-secreto'));
  assert.deepEqual(descifrar(fila.credenciales), { access_token: 'TEST-secreto-1234567890' });

  const panel = await api('/empresa/agencia', { token: 't-admin' });
  assert.doesNotMatch(JSON.stringify(panel.body), /TEST-secreto|credenciales/);
  assert.equal(panel.body.pagos.find(p => p.metodo === 'mercadopago').configurado, true);

  const { body } = await api('/org/config?org=agencia');
  assert.deepEqual(body.pagos.map(p => [p.metodo, p.cuenta]), [['mercadopago', 'empresa']]);
  assert.doesNotMatch(JSON.stringify(body), /TEST-secreto/);
});

test('la empresa no puede cambiar su comisión ni su dominio', async () => {
  const r = await api('/empresa/agencia', { token: 't-admin', method: 'PATCH', body: { comision_pct: 0, dominio: 'x.com' } });
  assert.equal(r.status, 400);
  assert.equal(db.pg_organizaciones[0].comision_pct, null);
  const marca = await api('/empresa/agencia', { token: 't-admin', method: 'PATCH', body: { nombre: 'Agencia Uno SRL', color_primario: '#00aa00' } });
  assert.equal(marca.status, 200);
  assert.equal(db.pg_organizaciones[0].nombre, 'Agencia Uno SRL');
});

test('superadmin: solo SUPER_ADMIN_EMAILS; crea empresas, asigna admins y fija comisiones', async () => {
  assert.equal((await api('/superadmin/resumen', { token: 't-admin' })).status, 403);
  const resumen = await api('/superadmin/resumen', { token: 't-super' });
  assert.equal(resumen.body.comision_pct, 15);

  const dup = await api('/superadmin/orgs', { token: 't-super', method: 'POST', body: { slug: 'agencia', nombre: 'Dup' } });
  assert.equal(dup.status, 400);
  const nueva = await api('/superadmin/orgs', { token: 't-super', method: 'POST', body: { slug: 'escuela-idiomas', nombre: 'Escuela', comision_pct: 12, admin_email: 'nuevo@agencia.test' } });
  assert.equal(nueva.status, 200);
  assert.equal(nueva.body.aviso, null);
  const org = db.pg_organizaciones.find(o => o.slug === 'escuela-idiomas');
  assert.ok(db.pg_org_miembros.some(m => m.org_id === org.id && m.user_id === 'u-nuevo' && m.rol === 'owner'));

  const sinCuenta = await api(`/superadmin/orgs/${org.id}/miembros`, { token: 't-super', method: 'POST', body: { email: 'no-registrado@x.test' } });
  assert.equal(sinCuenta.status, 400);

  assert.equal((await api(`/superadmin/orgs/${org.id}`, { token: 't-super', method: 'PATCH', body: { comision_pct: 150 } })).status, 400);
  assert.equal((await api(`/superadmin/orgs/${org.id}`, { token: 't-super', method: 'PATCH', body: { comision_pct: 8, dominio: 'empleo.escuela.com' } })).status, 200);
  assert.equal(org.comision_pct, 8);
  assert.equal((await api('/superadmin/plataforma', { token: 't-super', method: 'PUT', body: { comision_pct: 20 } })).status, 200);
  assert.equal(db.pg_plataforma[0].comision_pct, 20);
});

test('una empresa pausada deja de reconocerse y se ve la plataforma', async () => {
  db.pg_organizaciones[0].activa = false;
  const { body } = await api('/org/config?org=agencia');
  assert.equal(body.marca.nombre, 'Puentes Globales');
});
