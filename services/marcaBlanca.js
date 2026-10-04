/**
 * Marca blanca: qué empresa está viendo el visitante, con qué marca, precios, combos y
 * medios de pago. Lo que la empresa no definió se toma de la plataforma (Puentes Globales).
 */
import { seleccionar } from './supabaseAdmin.js';
import { requireUser } from './usage.js';
import { productoDisponible } from './alexioMotor.js';

export const PLATAFORMA = {
  id: null,
  slug: null,
  nombre: 'Puentes Globales',
  logo_url: 'assets/img/logo_official.png',
  color_primario: '#FF6A00',
  color_acento: '#0f172a',
  email_contacto: null
};

// Campos de cada medio de pago: los públicos se pueden mostrar; los secretos se guardan cifrados.
export const METODOS = {
  mercadopago: {
    nombre: 'Mercado Pago',
    publicos: { public_key: /^(APP_USR|TEST)-[\w-]{10,}$/ },
    secretos: { access_token: /^(APP_USR|TEST)-[\w-]{10,}$/ }
  },
  stripe: {
    nombre: 'Stripe',
    publicos: { publishable_key: /^pk_(live|test)_\w{10,}$/ },
    secretos: { secret_key: /^(sk|rk)_(live|test)_\w{10,}$/, webhook_secret: /^whsec_\w{10,}$/ }
  },
  paypal: {
    nombre: 'PayPal',
    publicos: { client_id: /^[\w-]{20,}$/ },
    secretos: { client_secret: /^[\w-]{20,}$/ }
  }
};

/* ─── Validaciones ────────────────────────────────────────────────────────── */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const MONEDA = /^[A-Z]{3}$/;

export function textoValido(v, max = 200) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}
export function precioValido(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000;
}
export function monedaValida(v) { return typeof v === 'string' && MONEDA.test(v); }
export function colorValido(v) { return typeof v === 'string' && HEX.test(v); }
export function urlHttpsValida(v) {
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

// Valida y separa los campos de un medio de pago. Devuelve { publicos, secretos } o lanza error.
export function validarCredenciales(metodo, publicos = {}, secretos = {}) {
  const def = METODOS[metodo];
  if (!def) throw new Error('Medio de pago desconocido.');
  const outPub = {}, outSec = {};
  for (const [campo, re] of Object.entries(def.publicos)) {
    if (publicos[campo] === undefined || publicos[campo] === '') continue;
    if (!re.test(String(publicos[campo]).trim())) throw new Error(`El campo ${campo} de ${def.nombre} no tiene el formato esperado.`);
    outPub[campo] = String(publicos[campo]).trim();
  }
  for (const [campo, re] of Object.entries(def.secretos)) {
    if (secretos[campo] === undefined || secretos[campo] === '') continue;
    if (!re.test(String(secretos[campo]).trim())) throw new Error(`El campo ${campo} de ${def.nombre} no tiene el formato esperado.`);
    outSec[campo] = String(secretos[campo]).trim();
  }
  return { publicos: outPub, secretos: outSec };
}

/* ─── Qué empresa es ──────────────────────────────────────────────────────── */
const CACHE_MS = 60 * 1000;
const cacheOrgs = new Map();

async function buscarOrg(filtro) {
  const hit = cacheOrgs.get(filtro);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.org;
  const [org] = await seleccionar('pg_organizaciones', `select=*&${filtro}&activa=is.true&limit=1`);
  cacheOrgs.set(filtro, { at: Date.now(), org: org || null });
  return org || null;
}

export function limpiarCacheOrgs() { cacheOrgs.clear(); cacheConfig.clear(); }

// ?org=slug, header x-org, subdominio de BASE_DOMAIN o dominio propio. null = la plataforma.
export async function resolverOrg(req) {
  const pedido = String(req.query?.org || req.get?.('x-org') || '').toLowerCase().trim();
  if (pedido) return SLUG.test(pedido) ? buscarOrg(`slug=eq.${pedido}`) : null;
  const host = String(req.get?.('host') || '').toLowerCase().split(':')[0];
  const base = (process.env.BASE_DOMAIN || '').toLowerCase().trim();
  if (base && host.endsWith(`.${base}`)) {
    const sub = host.slice(0, -(base.length + 1));
    if (sub !== 'www' && SLUG.test(sub)) return buscarOrg(`slug=eq.${sub}`);
  }
  if (host && base && host !== base && host !== `www.${base}` && !host.endsWith('.onrender.com') && host !== 'localhost') {
    return buscarOrg(`dominio=eq.${encodeURIComponent(host)}`);
  }
  return null;
}

/* ─── Configuración pública (marca, precios, combos, medios de pago) ──────── */
const cacheConfig = new Map();

export function mezclarPrecios(productos, preciosOrg) {
  const porProducto = new Map(preciosOrg.map(p => [p.producto, p]));
  return productos
    .filter(p => p.activo)
    .map(p => {
      const propio = porProducto.get(p.codigo);
      if (propio && propio.visible === false) return null;
      return {
        codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, periodo: p.periodo,
        precio: Number(propio ? propio.precio : p.precio_base),
        moneda: propio ? propio.moneda : p.moneda,
        precio_propio: Boolean(propio),
        // Se muestra pero no se vende (p. ej. productos de Alex IO todavía no conectados).
        proximamente: !productoDisponible(p.codigo)
      };
    })
    .filter(Boolean);
}

// Medios de pago de la empresa; si no tiene ninguno activo, los de la plataforma.
export function elegirPagos(pagosOrg, pagosPlataforma) {
  const activos = l => l.filter(p => p.activo && p.credenciales);
  const propios = activos(pagosOrg);
  const lista = propios.length ? propios : activos(pagosPlataforma);
  const cuenta = propios.length ? 'empresa' : 'plataforma';
  return lista.map(p => ({ metodo: p.metodo, nombre: METODOS[p.metodo]?.nombre || p.metodo, modo: p.modo, config_publica: p.config_publica || {}, cuenta }));
}

export async function configPublica(org) {
  const clave = org ? org.id : 'plataforma';
  const hit = cacheConfig.get(clave);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.valor;

  const [productos, preciosOrg, combosOrg, combosPlat, pagosOrg, pagosPlat] = await Promise.all([
    seleccionar('pg_productos', 'select=*&order=precio_base.asc'),
    org ? seleccionar('pg_org_precios', `select=*&org_id=eq.${org.id}`) : [],
    org ? seleccionar('pg_combos', `select=*,items:pg_combo_items(producto,cantidad)&org_id=eq.${org.id}&activo=is.true&order=precio.asc`) : [],
    seleccionar('pg_combos', 'select=*,items:pg_combo_items(producto,cantidad)&org_id=is.null&activo=is.true&order=precio.asc'),
    org ? seleccionar('pg_org_pagos', `select=metodo,activo,modo,config_publica,credenciales&org_id=eq.${org.id}`) : [],
    seleccionar('pg_org_pagos', 'select=metodo,activo,modo,config_publica,credenciales&org_id=is.null')
  ]);

  const marca = org
    ? { id: org.id, slug: org.slug, nombre: org.nombre, logo_url: org.logo_url || PLATAFORMA.logo_url, color_primario: org.color_primario, color_acento: org.color_acento, email_contacto: org.email_contacto }
    : PLATAFORMA;
  const combos = (combosOrg.length ? combosOrg : combosPlat).map(c => ({
    id: c.id, nombre: c.nombre, descripcion: c.descripcion, precio: Number(c.precio), moneda: c.moneda, periodo: c.periodo, items: c.items || [],
    proximamente: (c.items || []).some(i => !productoDisponible(i.producto))
  }));
  const valor = { marca, productos: mezclarPrecios(productos, preciosOrg), combos, pagos: elegirPagos(pagosOrg, pagosPlat) };
  cacheConfig.set(clave, { at: Date.now(), valor });
  return valor;
}

/* ─── Permisos de administración ──────────────────────────────────────────── */
export function esSuperAdmin(user) {
  const lista = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.email && user.email_confirmed_at && lista.includes(user.email.toLowerCase()));
}

export function requireSuperAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (!esSuperAdmin(req.user)) return res.status(403).json({ success: false, error: 'Solo el superadmin de Puentes Globales puede hacer esto.' });
    next();
  });
}

// Admin de la empresa del parámetro :slug (o superadmin). Deja req.org.
export function requireOrgAdmin(req, res, next) {
  requireUser(req, res, async () => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      if (!SLUG.test(slug)) return res.status(404).json({ success: false, error: 'Empresa no encontrada.' });
      const [org] = await seleccionar('pg_organizaciones', `select=*&slug=eq.${slug}&limit=1`);
      if (!org) return res.status(404).json({ success: false, error: 'Empresa no encontrada.' });
      if (!esSuperAdmin(req.user)) {
        if (!req.user.email_confirmed_at) return res.status(403).json({ success: false, error: 'Confirmá tu email para administrar una empresa.' });
        const miembros = await seleccionar('pg_org_miembros', `select=rol&org_id=eq.${org.id}&user_id=eq.${req.user.id}`);
        if (!miembros.length) return res.status(403).json({ success: false, error: 'No sos administrador de esta empresa.' });
      }
      req.org = org;
      next();
    } catch (err) {
      console.error('Error de permisos de empresa:', err.message);
      res.status(503).json({ success: false, error: 'No pudimos verificar tus permisos. Probá de nuevo.' });
    }
  });
}
