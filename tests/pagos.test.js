// Cobro real: checkout con el precio del servidor, cuenta de la empresa o de la plataforma,
// comisión, confirmación de Stripe / Mercado Pago / PayPal, idempotencia y accesos.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { instalar } from './helpers/supabaseFalso.js';

process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.PAYMENTS_ENC_KEY = crypto.randomBytes(32).toString('base64');
process.env.PUBLIC_URL = 'https://pg.test';
// Estos tests compran el simulador: se habilita como si Alex IO estuviera conectado.
Object.assign(process.env, { ALEXIO_ENGINE_URL: 'https://motor.test', ALEXIO_ENGINE_KEY: 'k', ALEXIO_REF_SECRET: 's', ALEXIO_PRODUCTOS: 'simulador' });

const { cifrar } = await import('../services/cifrado.js');
const { limpiarCacheOrgs } = await import('../services/marcaBlanca.js');
const { tieneAcceso } = await import('../services/usage.js');

const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const WHSEC = 'whsec_plataforma1234567890';
let db;
const proveedor = { stripe: [], mp: [], paypal: [], sesiones: {}, pagosMP: {} };

function semilla() {
  db = {
    pg_plataforma: [{ id: true, comision_pct: 15 }],
    pg_productos: [
      { codigo: 'tests', nombre: 'Tests', precio_base: 0, moneda: 'USD', periodo: 'unico', activo: true },
      { codigo: 'simulador', nombre: 'Simulador', precio_base: 15, moneda: 'USD', periodo: 'mes', activo: true },
      { codigo: 'ats', nombre: 'ATS', precio_base: 9, moneda: 'USD', periodo: 'mes', activo: true },
      { codigo: 'curso_skool', nombre: 'Curso', precio_base: 49, moneda: 'USD', periodo: 'unico', activo: true }
    ],
    pg_organizaciones: [{ id: ORG, slug: 'agencia', nombre: 'Agencia', color_primario: '#123456', color_acento: '#000000', comision_pct: 10, activa: true }],
    pg_org_precios: [{ org_id: ORG, producto: 'simulador', precio: 20, moneda: 'EUR', visible: true }],
    pg_combos: [{ id: 'cccccccc-0000-0000-0000-000000000001', org_id: null, nombre: 'Plan Profesional', precio: 29, moneda: 'USD', periodo: 'mes', activo: true }],
    pg_combo_items: [
      { combo_id: 'cccccccc-0000-0000-0000-000000000001', producto: 'simulador', cantidad: 1 },
      { combo_id: 'cccccccc-0000-0000-0000-000000000001', producto: 'ats', cantidad: 1 }
    ],
    pg_org_pagos: [
      { id: 'p1', org_id: null, metodo: 'stripe', activo: true, modo: 'prueba', config_publica: {}, credenciales: cifrar({ secret_key: 'sk_test_plataforma123', webhook_secret: WHSEC }) },
      { id: 'p2', org_id: null, metodo: 'paypal', activo: true, modo: 'prueba', config_publica: { client_id: 'cliente-paypal-plataforma-123' }, credenciales: cifrar({ client_secret: 'secreto-paypal-plataforma-123' }) }
    ],
    pg_ventas: [],
    pg_accesos: []
  };
}

const USUARIOS = {
  't-ana': { id: 'u-ana', email: 'ana@x.test', email_confirmed_at: 'x' },
  't-beto': { id: 'u-beto', email: 'beto@x.test', email_confirmed_at: 'x' }
};

const restaurar = instalar({
  db: () => db,
  usuarios: USUARIOS,
  otros: async (u, init) => {
    if (u.hostname === 'api.stripe.com') {
      if (init.method === 'POST' && u.pathname === '/v1/checkout/sessions') {
        const p = new URLSearchParams(init.body);
        const id = `cs_test_${crypto.randomBytes(8).toString('hex')}`;
        const s = { id, url: `https://checkout.stripe.test/${id}`, client_reference_id: p.get('client_reference_id'), amount_total: Number(p.get('line_items[0][price_data][unit_amount]')), currency: p.get('line_items[0][price_data][currency]'), payment_status: 'unpaid', payment_intent: `pi_${id}`, auth: init.headers.Authorization };
        proveedor.stripe.push({ params: p, auth: init.headers.Authorization });
        proveedor.sesiones[id] = s;
        return Response.json(s);
      }
      const m = u.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/);
      if (m) return Response.json(proveedor.sesiones[m[1]]);
    }
    if (u.hostname === 'api.mercadopago.com') {
      if (u.pathname === '/checkout/preferences') {
        const body = JSON.parse(init.body);
        proveedor.mp.push({ body, auth: init.headers.Authorization });
        return Response.json({ id: 'pref-1', init_point: 'https://mp.test/pagar', sandbox_init_point: 'https://sandbox.mp.test/pagar' });
      }
      const m = u.pathname.match(/^\/v1\/payments\/(\d+)$/);
      if (m) return Response.json(proveedor.pagosMP[m[1]] || { status: 'pending' });
    }
    if (u.hostname === 'api-m.sandbox.paypal.com') {
      if (u.pathname === '/v1/oauth2/token') return Response.json({ access_token: 'tok-paypal' });
      if (u.pathname === '/v2/checkout/orders') {
        const body = JSON.parse(init.body);
        proveedor.paypal.push(body);
        return Response.json({ id: 'ORDEN12345', links: [{ rel: 'approve', href: 'https://paypal.test/aprobar' }] });
      }
      if (u.pathname === '/v2/checkout/orders/ORDEN12345/capture') {
        const pu = proveedor.paypal.at(-1).purchase_units[0];
        return Response.json({ status: 'COMPLETED', purchase_units: [{ reference_id: pu.reference_id, payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', custom_id: pu.custom_id, amount: pu.amount }] } }] });
      }
    }
    return null;
  }
});

let server, base;
before(async () => {
  const { default: pagos } = await import('../routes/pagos.js');
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use('/api/v1/pagos', pagos);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/v1/pagos`;
});
after(() => { server.close(); restaurar(); });
beforeEach(() => { semilla(); limpiarCacheOrgs(); proveedor.stripe = []; proveedor.mp = []; proveedor.paypal = []; });

async function api(path, { token, method = 'GET', body, headers = {}, crudo } = {}) {
  const res = await fetch(base + path, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: crudo ?? (body ? JSON.stringify(body) : undefined)
  });
  const texto = await res.text();
  let json; try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: res.status, body: json, location: res.headers.get('location') };
}

function firmaStripe(payload, secreto = WHSEC, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac('sha256', secreto).update(`${t}.${payload}`).digest('hex')}`;
}

/* ─── Checkout ─────────────────────────────────────────────────────────── */
test('checkout: exige sesión', async () => {
  assert.equal((await api('/checkout', { method: 'POST', body: { tipo: 'producto', id: 'ats', metodo: 'stripe' } })).status, 401);
});

test('checkout en la plataforma: precio del servidor, sin comisión, con Stripe de la plataforma', async () => {
  const r = await api('/checkout', { token: 't-ana', method: 'POST', body: { tipo: 'producto', id: 'simulador', metodo: 'stripe', monto: 1 } });
  assert.equal(r.status, 200);
  assert.match(r.body.url, /checkout\.stripe\.test/);
  const v = db.pg_ventas[0];
  assert.deepEqual([v.monto, v.moneda, v.cuenta, v.comision_pct, v.estado, v.user_id], [15, 'USD', 'plataforma', 0, 'pendiente', 'u-ana']);
  assert.equal(proveedor.stripe[0].params.get('line_items[0][price_data][unit_amount]'), '1500', 'el monto que manda el navegador se ignora');
  assert.equal(proveedor.stripe[0].auth, 'Bearer sk_test_plataforma123');
  assert.equal(v.checkout_id, Object.keys(proveedor.sesiones).at(-1));
});

test('checkout en una empresa sin medios propios: su precio, cobra la plataforma y retiene su comisión', async () => {
  const r = await api('/checkout', { token: 't-ana', method: 'POST', headers: { 'x-org': 'agencia' }, body: { tipo: 'producto', id: 'simulador', metodo: 'stripe' } });
  assert.equal(r.status, 200);
  const v = db.pg_ventas[0];
  assert.deepEqual([v.monto, v.moneda, v.cuenta, v.org_id, v.comision_pct, v.comision_monto], [20, 'EUR', 'plataforma', ORG, 10, 2]);
});

test('checkout en una empresa con Mercado Pago propio: cobra la empresa con sus claves', async () => {
  db.pg_org_pagos.push({ id: 'p3', org_id: ORG, metodo: 'mercadopago', activo: true, modo: 'prueba', config_publica: {}, credenciales: cifrar({ access_token: 'TEST-token-de-la-agencia' }) });
  const conStripe = await api('/checkout', { token: 't-ana', method: 'POST', headers: { 'x-org': 'agencia' }, body: { tipo: 'producto', id: 'ats', metodo: 'stripe' } });
  assert.equal(conStripe.status, 400, 'si la empresa tiene medios propios, no se usan los de la plataforma');
  const r = await api('/checkout', { token: 't-ana', method: 'POST', headers: { 'x-org': 'agencia' }, body: { tipo: 'producto', id: 'ats', metodo: 'mercadopago' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.url, 'https://sandbox.mp.test/pagar');
  const v = db.pg_ventas.at(-1);
  assert.equal(v.cuenta, 'empresa');
  assert.equal(proveedor.mp[0].auth, 'Bearer TEST-token-de-la-agencia');
  assert.equal(proveedor.mp[0].body.external_reference, v.id);
  assert.equal(proveedor.mp[0].body.notification_url, `https://pg.test/api/v1/pagos/webhook/mercadopago/${ORG}`);
});

test('checkout: productos gratis, inexistentes o medios no disponibles dan 400', async () => {
  for (const body of [
    { tipo: 'producto', id: 'tests', metodo: 'stripe' },
    { tipo: 'producto', id: 'no-existe', metodo: 'stripe' },
    { tipo: 'producto', id: 'ats', metodo: 'mercadopago' },
    { tipo: 'producto', id: 'ats', metodo: 'bitcoin' }
  ]) assert.equal((await api('/checkout', { token: 't-ana', method: 'POST', body })).status, 400, JSON.stringify(body));
  assert.equal(db.pg_ventas.length, 0);
});

/* ─── Confirmación y accesos ───────────────────────────────────────────── */
test('Stripe: webhook firmado aprueba una sola vez y da 30 días de acceso a cada producto del combo', async () => {
  await api('/checkout', { token: 't-ana', method: 'POST', body: { tipo: 'combo', id: 'cccccccc-0000-0000-0000-000000000001', metodo: 'stripe' } });
  const v = db.pg_ventas[0];
  const evento = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: v.id, payment_status: 'paid', amount_total: 2900, currency: 'usd', payment_intent: 'pi_1' } } });

  assert.equal((await api('/webhook/stripe/plataforma', { method: 'POST', crudo: evento, headers: { 'stripe-signature': firmaStripe(evento, 'whsec_otro_secreto_1234') } })).status, 400);
  assert.equal(db.pg_accesos.length, 0);

  for (let i = 0; i < 2; i++) {
    assert.equal((await api('/webhook/stripe/plataforma', { method: 'POST', crudo: evento, headers: { 'stripe-signature': firmaStripe(evento) } })).status, 200);
  }
  assert.equal(v.estado, 'aprobada');
  assert.deepEqual(db.pg_accesos.map(a => a.producto).sort(), ['ats', 'simulador'], 'un acceso por producto, aunque el aviso llegue dos veces');
  const dias = (new Date(db.pg_accesos[0].vence) - Date.now()) / 86400000;
  assert.ok(dias > 29.9 && dias <= 30, `vence en ${dias} días`);
  assert.equal(await tieneAcceso(USUARIOS['t-ana'], 't-ana', 'ats'), true);
  assert.equal(await tieneAcceso(USUARIOS['t-ana'], 't-ana', 'entrevista'), true);
  assert.equal(await tieneAcceso(USUARIOS['t-beto'], 't-beto', 'ats'), false);
});

test('Stripe: si el monto pagado no coincide, la venta se rechaza y no hay acceso', async () => {
  await api('/checkout', { token: 't-ana', method: 'POST', body: { tipo: 'producto', id: 'ats', metodo: 'stripe' } });
  const v = db.pg_ventas[0];
  const evento = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: v.id, payment_status: 'paid', amount_total: 100, currency: 'usd' } } });
  await api('/webhook/stripe/plataforma', { method: 'POST', crudo: evento, headers: { 'stripe-signature': firmaStripe(evento) } });
  assert.equal(v.estado, 'rechazada');
  assert.equal(db.pg_accesos.length, 0);
});

test('Stripe sin webhook: al volver, el servidor consulta la sesión y aprueba', async () => {
  await api('/checkout', { token: 't-ana', method: 'POST', body: { tipo: 'producto', id: 'curso_skool', metodo: 'stripe' } });
  const v = db.pg_ventas[0];
  proveedor.sesiones[v.checkout_id].payment_status = 'paid';
  const r = await api(`/venta/${v.id}`, { token: 't-ana' });
  assert.equal(r.body.venta.estado, 'aprobada');
  assert.equal(db.pg_accesos[0].vence, null, 'pago único: sin vencimiento');
  assert.equal((await api(`/venta/${v.id}`, { token: 't-beto' })).status, 404, 'otra persona no ve la compra');
});

test('Mercado Pago: el aviso solo aprueba si el pago figura aprobado en Mercado Pago y es de esa cuenta', async () => {
  db.pg_org_pagos.push({ id: 'p3', org_id: ORG, metodo: 'mercadopago', activo: true, modo: 'prueba', config_publica: {}, credenciales: cifrar({ access_token: 'TEST-token-de-la-agencia' }) });
  await api('/checkout', { token: 't-ana', method: 'POST', headers: { 'x-org': 'agencia' }, body: { tipo: 'producto', id: 'ats', metodo: 'mercadopago' } });
  const v = db.pg_ventas[0];
  proveedor.pagosMP['555'] = { id: 555, status: 'pending', external_reference: v.id, transaction_amount: 9, currency_id: 'USD' };
  await api(`/webhook/mercadopago/${ORG}`, { method: 'POST', body: { type: 'payment', data: { id: '555' } } });
  assert.equal(v.estado, 'pendiente');
  proveedor.pagosMP['555'].status = 'approved';
  await api(`/webhook/mercadopago/plataforma`, { method: 'POST', body: { type: 'payment', data: { id: '555' } } });
  assert.equal(v.estado, 'pendiente', 'aviso por la cuenta equivocada');
  await api(`/webhook/mercadopago/${ORG}`, { method: 'POST', body: { type: 'payment', data: { id: '555' } } });
  assert.equal(v.estado, 'aprobada');
  assert.equal(db.pg_accesos.length, 1);
});

test('PayPal: al volver se captura el pago en el servidor y se aprueba', async () => {
  const r = await api('/checkout', { token: 't-ana', method: 'POST', body: { tipo: 'producto', id: 'ats', metodo: 'paypal' } });
  assert.equal(r.body.url, 'https://paypal.test/aprobar');
  const v = db.pg_ventas[0];
  const otraOrden = await api(`/paypal/retorno?venta=${v.id}&token=OTRAORDEN99`);
  assert.equal(v.estado, 'pendiente', 'una orden que no es la de la venta no se captura');
  assert.match(otraOrden.location, /pago-resultado\.html/);
  const vuelta = await api(`/paypal/retorno?venta=${v.id}&token=ORDEN12345`);
  assert.match(vuelta.location, new RegExp(`venta=${v.id}`));
  assert.equal(v.estado, 'aprobada');
  assert.equal(v.referencia, 'CAP-1');
});

test('mensual: una segunda compra suma 30 días desde el vencimiento actual', async () => {
  for (let i = 0; i < 2; i++) {
    await api('/checkout', { token: 't-ana', method: 'POST', body: { tipo: 'producto', id: 'ats', metodo: 'stripe' } });
    const v = db.pg_ventas.at(-1);
    proveedor.sesiones[v.checkout_id].payment_status = 'paid';
    await api(`/venta/${v.id}`, { token: 't-ana' });
  }
  const vences = db.pg_accesos.map(a => new Date(a.vence).getTime()).sort();
  const dias = (vences[1] - Date.now()) / 86400000;
  assert.ok(dias > 59.9 && dias <= 60, `el segundo acceso vence en ${dias} días`);
});
