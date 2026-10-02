/**
 * Operaciones de administración compartidas por el superadmin (orgId = null → plataforma)
 * y por el admin de cada empresa (orgId = su id): precios, combos y medios de pago.
 */
import { seleccionar, insertar, upsert, actualizar, borrar } from './supabaseAdmin.js';
import { cifrar, cifradoDisponible } from './cifrado.js';
import { METODOS, textoValido, precioValido, monedaValida, validarCredenciales, limpiarCacheOrgs } from './marcaBlanca.js';

export class ErrorValidacion extends Error {}
const exigir = (cond, msg) => { if (!cond) throw new ErrorValidacion(msg); };
const filtroOrg = orgId => (orgId ? `org_id=eq.${orgId}` : 'org_id=is.null');

/* ─── Precios por producto (solo empresas; la plataforma edita el precio base) ─── */
export async function fijarPrecio(orgId, producto, { precio, moneda = 'USD', visible = true }) {
  exigir(orgId, 'La plataforma usa el precio base del producto.');
  exigir(precioValido(precio), 'El precio tiene que ser un número entre 0 y 100.000.');
  exigir(monedaValida(moneda), 'La moneda tiene que ser un código de 3 letras, por ejemplo USD o EUR.');
  const [existe] = await seleccionar('pg_productos', `select=codigo&codigo=eq.${encodeURIComponent(producto)}`);
  exigir(existe, 'Producto desconocido.');
  await upsert('pg_org_precios', [{ org_id: orgId, producto, precio, moneda, visible: Boolean(visible) }], 'org_id,producto');
  limpiarCacheOrgs();
}

export async function quitarPrecio(orgId, producto) {
  await borrar('pg_org_precios', `org_id=eq.${orgId}&producto=eq.${encodeURIComponent(producto)}`);
  limpiarCacheOrgs();
}

/* ─── Combos ─────────────────────────────────────────────────────────────── */
async function validarCombo({ nombre, descripcion, precio, moneda = 'USD', periodo = 'unico', items }) {
  exigir(textoValido(nombre, 80), 'El combo necesita un nombre (hasta 80 caracteres).');
  exigir(descripcion === undefined || descripcion === null || (typeof descripcion === 'string' && descripcion.length <= 300), 'La descripción puede tener hasta 300 caracteres.');
  exigir(precioValido(precio), 'El precio tiene que ser un número entre 0 y 100.000.');
  exigir(monedaValida(moneda), 'La moneda tiene que ser un código de 3 letras, por ejemplo USD o EUR.');
  exigir(['unico', 'mes'].includes(periodo), 'El período tiene que ser "unico" o "mes".');
  exigir(Array.isArray(items) && items.length >= 2, 'Un combo necesita al menos dos productos.');
  const codigos = new Set((await seleccionar('pg_productos', 'select=codigo')).map(p => p.codigo));
  const vistos = new Set();
  for (const it of items) {
    exigir(it && codigos.has(it.producto), `Producto desconocido en el combo: ${it?.producto}.`);
    exigir(!vistos.has(it.producto), 'Un producto aparece dos veces en el combo.');
    vistos.add(it.producto);
    exigir(it.cantidad === undefined || (Number.isInteger(it.cantidad) && it.cantidad > 0 && it.cantidad <= 1000), 'La cantidad tiene que ser un número entero positivo.');
  }
  return { nombre: nombre.trim(), descripcion: descripcion?.trim() || null, precio, moneda, periodo };
}

export async function crearCombo(orgId, datos) {
  const fila = await validarCombo(datos);
  const [combo] = await insertar('pg_combos', [{ ...fila, org_id: orgId }], { devolver: true });
  await insertar('pg_combo_items', datos.items.map(it => ({ combo_id: combo.id, producto: it.producto, cantidad: it.cantidad || 1 })));
  limpiarCacheOrgs();
  return combo;
}

async function comboDe(orgId, comboId) {
  exigir(/^[0-9a-f-]{36}$/i.test(comboId), 'Combo no encontrado.');
  const [combo] = await seleccionar('pg_combos', `select=id&id=eq.${comboId}&${filtroOrg(orgId)}`);
  exigir(combo, 'Combo no encontrado.');
  return combo;
}

export async function editarCombo(orgId, comboId, datos) {
  await comboDe(orgId, comboId);
  const fila = await validarCombo(datos);
  await actualizar('pg_combos', `id=eq.${comboId}`, { ...fila, activo: datos.activo !== false });
  await borrar('pg_combo_items', `combo_id=eq.${comboId}`);
  await insertar('pg_combo_items', datos.items.map(it => ({ combo_id: comboId, producto: it.producto, cantidad: it.cantidad || 1 })));
  limpiarCacheOrgs();
}

export async function borrarCombo(orgId, comboId) {
  await comboDe(orgId, comboId);
  await borrar('pg_combos', `id=eq.${comboId}`);
  limpiarCacheOrgs();
}

export async function listarCombos(orgId) {
  return seleccionar('pg_combos', `select=*,items:pg_combo_items(producto,cantidad)&${filtroOrg(orgId)}&order=created_at.asc`);
}

/* ─── Medios de pago ─────────────────────────────────────────────────────── */
// Estado sin secretos: qué métodos hay, si están activos y si tienen credenciales cargadas.
export async function estadoPagos(orgId) {
  const filas = await seleccionar('pg_org_pagos', `select=metodo,activo,modo,config_publica,credenciales,updated_at&${filtroOrg(orgId)}`);
  return Object.keys(METODOS).map(metodo => {
    const f = filas.find(x => x.metodo === metodo);
    return {
      metodo, nombre: METODOS[metodo].nombre,
      configurado: Boolean(f?.credenciales), activo: Boolean(f?.activo), modo: f?.modo || 'prueba',
      config_publica: f?.config_publica || {}, updated_at: f?.updated_at || null,
      campos: { publicos: Object.keys(METODOS[metodo].publicos), secretos: Object.keys(METODOS[metodo].secretos) }
    };
  });
}

export async function guardarPago(orgId, metodo, { activo = true, modo = 'prueba', publicos = {}, secretos = {} }) {
  exigir(METODOS[metodo], 'Medio de pago desconocido.');
  exigir(['prueba', 'produccion'].includes(modo), 'El modo tiene que ser "prueba" o "produccion".');
  let campos;
  try { campos = validarCredenciales(metodo, publicos, secretos); } catch (e) { throw new ErrorValidacion(e.message); }
  const [actual] = await seleccionar('pg_org_pagos', `select=id,credenciales,config_publica&${filtroOrg(orgId)}&metodo=eq.${metodo}`);

  const fila = { activo: Boolean(activo), modo, config_publica: { ...(actual?.config_publica || {}), ...campos.publicos }, updated_at: new Date().toISOString() };
  if (Object.keys(campos.secretos).length) {
    exigir(cifradoDisponible(), 'El servidor no tiene configurada la clave de cifrado (PAYMENTS_ENC_KEY).');
    fila.credenciales = cifrar(campos.secretos);
  }
  exigir(fila.credenciales || actual?.credenciales || !fila.activo, 'Para activar este medio de pago cargá sus claves secretas.');

  if (actual) await actualizar('pg_org_pagos', `id=eq.${actual.id}`, fila);
  else await insertar('pg_org_pagos', [{ ...fila, org_id: orgId, metodo }]);
  limpiarCacheOrgs();
}

export async function quitarPago(orgId, metodo) {
  exigir(METODOS[metodo], 'Medio de pago desconocido.');
  await borrar('pg_org_pagos', `${filtroOrg(orgId)}&metodo=eq.${metodo}`);
  limpiarCacheOrgs();
}

// Traduce errores a respuestas HTTP: 400 si es de validación, 500 si es otra cosa.
export function manejar(fn) {
  return async (req, res) => {
    try {
      const resultado = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, ...(resultado || {}) });
    } catch (err) {
      if (err instanceof ErrorValidacion) return res.status(400).json({ success: false, error: err.message });
      console.error('Error de administración:', err.message);
      res.status(500).json({ success: false, error: 'No pudimos guardar el cambio. Probá de nuevo.' });
    }
  };
}
