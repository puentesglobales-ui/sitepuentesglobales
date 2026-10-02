/**
 * Integración con Mercado Pago, Stripe y PayPal.
 *
 * Cada proveedor sabe: crear el checkout (devuelve la URL a la que se manda a la persona)
 * y confirmar el pago consultando al propio proveedor. La venta solo se aprueba con lo que
 * informa el proveedor, nunca con lo que dice el navegador.
 *
 * Pagos únicos: los productos mensuales dan 30 días de acceso por pago (sin renovación
 * automática todavía).
 */
import crypto from 'node:crypto';

const TIMEOUT = 15000;

async function pedirJson(url, init, nombre) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  const texto = await res.text();
  let data;
  try { data = JSON.parse(texto); } catch { data = { raw: texto.slice(0, 300) }; }
  if (!res.ok) {
    const detalle = data.message || data.error?.message || data.error_description || data.raw || res.status;
    throw new Error(`${nombre} respondió ${res.status}: ${detalle}`);
  }
  return data;
}

/* ─── Stripe ──────────────────────────────────────────────────────────────── */
// Monedas sin decimales en Stripe (el monto va en unidades, no en centavos).
const SIN_DECIMALES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
export const aMenor = (monto, moneda) => Math.round(Number(monto) * (SIN_DECIMALES.has(moneda.toUpperCase()) ? 1 : 100));
export const deMenor = (monto, moneda) => Number(monto) / (SIN_DECIMALES.has(moneda.toUpperCase()) ? 1 : 100);

export const stripe = {
  async crearCheckout({ secretos, venta, urls }) {
    const p = new URLSearchParams();
    p.set('mode', 'payment');
    p.set('success_url', urls.exito);
    p.set('cancel_url', urls.cancelado);
    p.set('client_reference_id', venta.id);
    p.set('metadata[venta_id]', venta.id);
    p.set('line_items[0][quantity]', '1');
    p.set('line_items[0][price_data][currency]', venta.moneda.toLowerCase());
    p.set('line_items[0][price_data][unit_amount]', String(aMenor(venta.monto, venta.moneda)));
    p.set('line_items[0][price_data][product_data][name]', venta.titulo);
    const s = await pedirJson('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretos.secret_key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p.toString()
    }, 'Stripe');
    return { url: s.url, checkout_id: s.id };
  },

  async consultarSesion(secretos, sesionId) {
    if (!/^cs_(test|live)_\w{10,}$/.test(String(sesionId))) throw new Error('Id de sesión de Stripe no válido');
    const s = await pedirJson(`https://api.stripe.com/v1/checkout/sessions/${sesionId}`, {
      headers: { Authorization: `Bearer ${secretos.secret_key}` }
    }, 'Stripe');
    return {
      aprobado: s.payment_status === 'paid', venta_id: s.client_reference_id || s.metadata?.venta_id,
      referencia: s.payment_intent || s.id, monto: deMenor(s.amount_total, s.currency || ''), moneda: String(s.currency || '').toUpperCase()
    };
  },

  // Firma "t=<timestamp>,v1=<hmac>" con el webhook secret. Tolerancia de 5 minutos.
  verificarWebhook(rawBody, cabecera, secreto, ahora = Date.now()) {
    const partes = Object.fromEntries(String(cabecera || '').split(',').map(x => x.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v]));
    const firmas = String(cabecera || '').split(',').filter(x => x.startsWith('v1=')).map(x => x.slice(3));
    if (!partes.t || !firmas.length || !secreto) return false;
    if (Math.abs(ahora / 1000 - Number(partes.t)) > 300) return false;
    const esperada = crypto.createHmac('sha256', secreto).update(`${partes.t}.${rawBody}`).digest('hex');
    return firmas.some(f => f.length === esperada.length && crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada)));
  }
};

/* ─── Mercado Pago ────────────────────────────────────────────────────────── */
export const mercadopago = {
  async crearCheckout({ secretos, modo, venta, urls }) {
    const pref = await pedirJson('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretos.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: venta.concepto, title: venta.titulo, quantity: 1, unit_price: Number(venta.monto), currency_id: venta.moneda }],
        external_reference: venta.id,
        back_urls: { success: urls.exito, failure: urls.cancelado, pending: urls.exito },
        auto_return: 'approved',
        notification_url: urls.notificacion
      })
    }, 'Mercado Pago');
    return { url: (modo === 'prueba' && pref.sandbox_init_point) || pref.init_point, checkout_id: pref.id };
  },

  async consultarPago(secretos, pagoId) {
    if (!/^\d{1,20}$/.test(String(pagoId))) throw new Error('Id de pago de Mercado Pago no válido');
    const p = await pedirJson(`https://api.mercadopago.com/v1/payments/${pagoId}`, {
      headers: { Authorization: `Bearer ${secretos.access_token}` }
    }, 'Mercado Pago');
    return { aprobado: p.status === 'approved', venta_id: p.external_reference, referencia: String(p.id), monto: Number(p.transaction_amount), moneda: String(p.currency_id || '').toUpperCase() };
  }
};

/* ─── PayPal ──────────────────────────────────────────────────────────────── */
const paypalBase = modo => (modo === 'produccion' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

async function paypalToken(publicos, secretos, modo) {
  const t = await pedirJson(`${paypalBase(modo)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${publicos.client_id}:${secretos.client_secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  }, 'PayPal');
  return t.access_token;
}

export const paypal = {
  async crearCheckout({ publicos, secretos, modo, venta, urls }) {
    const token = await paypalToken(publicos, secretos, modo);
    const orden = await pedirJson(`${paypalBase(modo)}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: venta.id, custom_id: venta.id, description: venta.titulo.slice(0, 127), amount: { currency_code: venta.moneda, value: Number(venta.monto).toFixed(2) } }],
        application_context: { return_url: urls.paypalRetorno, cancel_url: urls.cancelado, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' }
      })
    }, 'PayPal');
    const aprobar = (orden.links || []).find(l => l.rel === 'approve' || l.rel === 'payer-action');
    if (!aprobar) throw new Error('PayPal no devolvió el enlace de pago');
    return { url: aprobar.href, checkout_id: orden.id };
  },

  async capturar({ publicos, secretos, modo }, ordenId) {
    if (!/^[A-Z0-9]{5,40}$/.test(String(ordenId))) throw new Error('Id de orden de PayPal no válido');
    const token = await paypalToken(publicos, secretos, modo);
    const r = await pedirJson(`${paypalBase(modo)}/v2/checkout/orders/${ordenId}/capture`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, 'PayPal');
    const unidad = r.purchase_units?.[0] || {};
    const captura = unidad.payments?.captures?.[0] || {};
    return {
      aprobado: r.status === 'COMPLETED' && captura.status === 'COMPLETED',
      venta_id: captura.custom_id || unidad.custom_id || unidad.reference_id,
      referencia: captura.id,
      monto: Number(captura.amount?.value),
      moneda: String(captura.amount?.currency_code || '').toUpperCase()
    };
  }
};

export const PROVEEDORES = { stripe, mercadopago, paypal };
