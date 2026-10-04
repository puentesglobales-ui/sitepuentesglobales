/**
 * Ventas y accesos: arma la venta con el precio del servidor (nunca el del navegador),
 * elige con qué cuenta se cobra (la de la empresa o, si no tiene, la de la plataforma),
 * calcula la comisión y, cuando el proveedor confirma el pago, da acceso a los productos.
 */
import { seleccionar, insertar, actualizar } from '../supabaseAdmin.js';
import { descifrar } from '../cifrado.js';
import { configPublica } from '../marcaBlanca.js';

export class ErrorPago extends Error {}
const exigir = (cond, msg) => { if (!cond) throw new ErrorPago(msg); };
const redondear = n => Math.round(Number(n) * 100) / 100;
export const DIAS_POR_MES = 30;

// Qué se compra: un producto suelto o un combo, con el precio que corresponde a la empresa.
export async function armarCompra(org, { tipo, id }) {
  const cfg = await configPublica(org);
  if (tipo === 'producto') {
    const p = cfg.productos.find(x => x.codigo === id);
    exigir(p, 'Ese producto no está a la venta.');
    exigir(!p.proximamente, 'Ese producto todavía no está disponible.');
    exigir(Number(p.precio) > 0, 'Ese producto es gratis: no hace falta pagarlo.');
    return { concepto: p.codigo, titulo: p.nombre, monto: redondear(p.precio), moneda: p.moneda, items: [{ producto: p.codigo, cantidad: 1, periodo: p.periodo }] };
  }
  if (tipo === 'combo') {
    const c = cfg.combos.find(x => x.id === id);
    exigir(c, 'Ese combo no está a la venta.');
    exigir(!c.proximamente, 'Ese combo incluye una herramienta que todavía no está disponible.');
    exigir(Number(c.precio) > 0, 'Ese combo es gratis: no hace falta pagarlo.');
    return { concepto: `combo:${c.id}`, titulo: c.nombre, monto: redondear(c.precio), moneda: c.moneda, items: c.items.map(i => ({ producto: i.producto, cantidad: i.cantidad || 1, periodo: c.periodo })) };
  }
  throw new ErrorPago('Tipo de compra desconocido.');
}

// Medio de pago a usar: los de la empresa si tiene alguno activo; si no, los de la plataforma.
export async function elegirCuenta(org, metodo) {
  const activos = filas => filas.filter(f => f.activo && f.credenciales);
  const propios = org ? activos(await seleccionar('pg_org_pagos', `select=*&org_id=eq.${org.id}`)) : [];
  const lista = propios.length ? propios : activos(await seleccionar('pg_org_pagos', 'select=*&org_id=is.null'));
  const fila = lista.find(f => f.metodo === metodo);
  exigir(fila, 'Ese medio de pago no está disponible.');
  return { cuenta: propios.length ? 'empresa' : 'plataforma', fila };
}

export function credenciales(fila) {
  return { publicos: fila.config_publica || {}, secretos: descifrar(fila.credenciales), modo: fila.modo };
}

// Fila de pago de la cuenta con la que se cobró una venta (para confirmar pagos y webhooks).
export async function filaDeCuenta(cuentaClave, metodo) {
  const filtro = cuentaClave === 'plataforma' ? 'org_id=is.null' : `org_id=eq.${cuentaClave}`;
  exigir(cuentaClave === 'plataforma' || /^[0-9a-f-]{36}$/i.test(cuentaClave), 'Cuenta no válida.');
  const [fila] = await seleccionar('pg_org_pagos', `select=*&${filtro}&metodo=eq.${metodo}`);
  exigir(fila && fila.credenciales, 'Medio de pago no configurado.');
  return fila;
}

export const claveCuenta = venta => (venta.cuenta === 'empresa' ? venta.org_id : 'plataforma');

export async function comisionPara(org) {
  if (!org) return 0; // venta propia de Puentes Globales
  if (org.comision_pct !== null && org.comision_pct !== undefined) return Number(org.comision_pct);
  const [p] = await seleccionar('pg_plataforma', 'select=comision_pct');
  return Number(p?.comision_pct ?? 0);
}

export async function crearVenta({ user, org, compra, metodo, cuenta }) {
  const pct = await comisionPara(org);
  const [venta] = await insertar('pg_ventas', [{
    org_id: org ? org.id : null, user_id: user.id, concepto: compra.concepto, monto: compra.monto, moneda: compra.moneda,
    metodo, cuenta, comision_pct: pct, comision_monto: redondear(compra.monto * pct / 100), estado: 'pendiente', items: compra.items
  }], { devolver: true });
  return { ...venta, titulo: compra.titulo };
}

export async function buscarVenta(id) {
  exigir(/^[0-9a-f-]{36}$/i.test(String(id || '')), 'Venta no encontrada.');
  const [venta] = await seleccionar('pg_ventas', `select=*&id=eq.${id}`);
  exigir(venta, 'Venta no encontrada.');
  return venta;
}

// Aprueba una venta con los datos que confirmó el proveedor. Es idempotente: si llega el
// webhook y además la persona vuelve a la página de resultado, el acceso se da una sola vez.
export async function aprobarVenta(ventaId, pago) {
  const venta = await buscarVenta(ventaId);
  if (venta.estado === 'aprobada') return { venta, yaAprobada: true };
  exigir(venta.estado === 'pendiente', `La venta está ${venta.estado}.`);
  const montoOk = Math.abs(Number(pago.monto) - Number(venta.monto)) < 0.01;
  const monedaOk = String(pago.moneda).toUpperCase() === String(venta.moneda).toUpperCase();
  if (!montoOk || !monedaOk) {
    await actualizar('pg_ventas', `id=eq.${venta.id}`, { estado: 'rechazada', referencia: pago.referencia || null });
    throw new ErrorPago('El pago no coincide con el precio de la venta.');
  }
  // Solo pasa a aprobada si sigue pendiente. Postgres bloquea la fila: si llegan dos
  // confirmaciones a la vez, solo una la cambia y solo esa da el acceso.
  const cambiadas = await actualizar('pg_ventas', `id=eq.${venta.id}&estado=eq.pendiente`,
    { estado: 'aprobada', referencia: pago.referencia || null, aprobada_at: new Date().toISOString() }, { devolver: true });
  if (!cambiadas.length) return { venta, yaAprobada: true };
  await otorgarAccesos(venta);
  return { venta: { ...venta, estado: 'aprobada' }, yaAprobada: false };
}

// Pago único: acceso sin vencimiento. Mensual: 30 días, que se suman si ya tenía acceso vigente.
export async function otorgarAccesos(venta, ahora = new Date()) {
  const filas = [];
  for (const item of venta.items || []) {
    let vence = null;
    if (item.periodo === 'mes') {
      const vigentes = await seleccionar('pg_accesos', `select=vence&user_id=eq.${venta.user_id}&producto=eq.${item.producto}&vence=gt.${ahora.toISOString()}&order=vence.desc&limit=1`);
      const desde = vigentes[0]?.vence ? new Date(vigentes[0].vence) : ahora;
      vence = new Date(desde.getTime() + DIAS_POR_MES * 24 * 60 * 60 * 1000).toISOString();
    }
    filas.push({ user_id: venta.user_id, org_id: venta.org_id, producto: item.producto, origen: 'compra', venta_id: venta.id, vence });
  }
  if (filas.length) await insertar('pg_accesos', filas);
}
