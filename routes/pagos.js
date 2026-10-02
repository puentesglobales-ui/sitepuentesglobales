import { Router } from 'express';
import { requireUser } from '../services/usage.js';
import { adminDisponible, actualizar } from '../services/supabaseAdmin.js';
import { resolverOrg } from '../services/marcaBlanca.js';
import { PROVEEDORES, stripe, mercadopago, paypal, deMenor } from '../services/pagos/proveedores.js';
import {
  ErrorPago, armarCompra, elegirCuenta, credenciales, filaDeCuenta, claveCuenta, crearVenta, buscarVenta, aprobarVenta
} from '../services/pagos/ventas.js';

const router = Router();

// Dirección pública del sitio para las vueltas del proveedor (PUBLIC_URL o la del pedido).
const origen = req => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

function responderError(res, err) {
  if (err instanceof ErrorPago) return res.status(400).json({ success: false, error: err.message });
  console.error('Error de pagos:', err.message);
  res.status(502).json({ success: false, error: 'No pudimos iniciar el pago. Probá de nuevo en unos minutos o con otro medio de pago.' });
}

// Inicia la compra de un producto o combo. Devuelve la URL del proveedor.
router.post('/checkout', requireUser, async (req, res) => {
  if (!adminDisponible()) return res.status(503).json({ success: false, error: 'Los pagos todavía no están habilitados.' });
  try {
    const { tipo, id, metodo } = req.body || {};
    if (!PROVEEDORES[metodo]) throw new ErrorPago('Medio de pago desconocido.');
    const org = await resolverOrg(req);
    const compra = await armarCompra(org, { tipo, id });
    const { cuenta, fila } = await elegirCuenta(org, metodo);
    const venta = await crearVenta({ user: req.user, org, compra, metodo, cuenta });

    const base = origen(req);
    const cuentaKey = claveCuenta(venta);
    const urls = {
      exito: `${base}/pago-resultado.html?venta=${venta.id}`,
      cancelado: `${base}/planes-saas.html?cancelado=1${org ? `&org=${org.slug}` : ''}`,
      notificacion: `${base}/api/v1/pagos/webhook/mercadopago/${cuentaKey}`,
      paypalRetorno: `${base}/api/v1/pagos/paypal/retorno?venta=${venta.id}`
    };
    const { url, checkout_id } = await PROVEEDORES[metodo].crearCheckout({ ...credenciales(fila), venta, urls });
    await actualizar('pg_ventas', `id=eq.${venta.id}`, { checkout_id });
    res.json({ success: true, url, venta: venta.id });
  } catch (err) { responderError(res, err); }
});

// Estado de una compra propia. Si vuelve de Mercado Pago con el id del pago, se confirma
// consultándolo (por si el aviso del proveedor todavía no llegó).
router.get('/venta/:id', requireUser, async (req, res) => {
  try {
    let venta = await buscarVenta(req.params.id);
    if (venta.user_id !== req.user.id) return res.status(404).json({ success: false, error: 'Venta no encontrada.' });
    const pagoId = req.query.payment_id || req.query.collection_id;
    if (venta.estado === 'pendiente' && venta.metodo === 'mercadopago' && pagoId) {
      const pago = await mercadopago.consultarPago(credenciales(await filaDeCuenta(claveCuenta(venta), 'mercadopago')).secretos, pagoId);
      if (pago.aprobado && pago.venta_id === venta.id) venta = (await aprobarVenta(venta.id, pago)).venta;
    }
    // Stripe: se consulta la sesión del checkout (por si el webhook todavía no llegó).
    if (venta.estado === 'pendiente' && venta.metodo === 'stripe' && venta.checkout_id) {
      const pago = await stripe.consultarSesion(credenciales(await filaDeCuenta(claveCuenta(venta), 'stripe')).secretos, venta.checkout_id);
      if (pago.aprobado && pago.venta_id === venta.id) venta = (await aprobarVenta(venta.id, pago)).venta;
    }
    res.json({ success: true, venta: { id: venta.id, estado: venta.estado, concepto: venta.concepto, monto: venta.monto, moneda: venta.moneda, items: venta.items } });
  } catch (err) { responderError(res, err); }
});

// Stripe avisa con un evento firmado. Se verifica con el webhook secret de esa cuenta.
router.post('/webhook/stripe/:cuenta', async (req, res) => {
  try {
    const fila = await filaDeCuenta(req.params.cuenta, 'stripe');
    const { secretos } = credenciales(fila);
    if (!stripe.verificarWebhook(req.rawBody?.toString('utf8') || '', req.get('stripe-signature'), secretos.webhook_secret)) {
      return res.status(400).json({ success: false, error: 'Firma inválida' });
    }
    const evento = req.body;
    const s = evento?.data?.object || {};
    if (evento.type === 'checkout.session.completed' && s.payment_status === 'paid') {
      const ventaId = s.client_reference_id || s.metadata?.venta_id;
      await aprobarVenta(ventaId, { referencia: s.payment_intent || s.id, monto: deMenor(s.amount_total, s.currency || ''), moneda: String(s.currency || '').toUpperCase() });
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook de Stripe:', err.message);
    res.status(err instanceof ErrorPago ? 200 : 500).json({ received: false });
  }
});

// Mercado Pago avisa el id del pago; se consulta a Mercado Pago para saber si se cobró.
router.post('/webhook/mercadopago/:cuenta', async (req, res) => {
  try {
    const tipo = req.body?.type || req.query.type || req.query.topic;
    const pagoId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (tipo !== 'payment' || !pagoId) return res.sendStatus(200);
    const fila = await filaDeCuenta(req.params.cuenta, 'mercadopago');
    const pago = await mercadopago.consultarPago(credenciales(fila).secretos, pagoId);
    if (pago.aprobado && pago.venta_id) {
      const venta = await buscarVenta(pago.venta_id);
      if (claveCuenta(venta) === req.params.cuenta) await aprobarVenta(venta.id, pago);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook de Mercado Pago:', err.message);
    res.sendStatus(err instanceof ErrorPago ? 200 : 500);
  }
});

// PayPal vuelve al sitio con el id de la orden: se captura el pago desde el servidor.
router.get('/paypal/retorno', async (req, res) => {
  const ventaId = String(req.query.venta || '');
  const destino = `/pago-resultado.html?venta=${encodeURIComponent(ventaId)}`;
  try {
    const venta = await buscarVenta(ventaId);
    if (venta.estado === 'pendiente' && venta.metodo === 'paypal') {
      if (String(req.query.token || '') !== venta.checkout_id) throw new ErrorPago('La orden de PayPal no corresponde a esta compra.');
      const pago = await paypal.capturar(credenciales(await filaDeCuenta(claveCuenta(venta), 'paypal')), req.query.token);
      if (pago.aprobado && pago.venta_id === venta.id) await aprobarVenta(venta.id, pago);
    }
  } catch (err) {
    console.error('Retorno de PayPal:', err.message);
  }
  res.redirect(destino);
});

export default router;
