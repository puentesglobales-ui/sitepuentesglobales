import { Router } from 'express';
import { seleccionar, insertar, actualizar, upsert, borrar, auditar } from '../services/supabaseAdmin.js';
import {
  requireSuperAdmin, SLUG, textoValido, precioValido, monedaValida, colorValido, limpiarCacheOrgs
} from '../services/marcaBlanca.js';
import {
  ErrorValidacion, manejar, crearCombo, editarCombo, borrarCombo, listarCombos, estadoPagos, guardarPago, quitarPago
} from '../services/marcaBlancaAdmin.js';

// Superadmin de Puentes Globales (SUPER_ADMIN_EMAILS): empresas, comisiones, catálogo base,
// combos y medios de pago de la plataforma (respaldo de las empresas que no tienen los suyos).
const router = Router();
router.use(requireSuperAdmin);

const exigir = (cond, msg) => { if (!cond) throw new ErrorValidacion(msg); };
const UUID = /^[0-9a-f-]{36}$/i;
const comisionValida = v => v === null || (typeof v === 'number' && v >= 0 && v <= 100);

router.get('/resumen', manejar(async () => {
  const [orgs, plataforma, productos, combos, pagos] = await Promise.all([
    seleccionar('pg_organizaciones', 'select=*&order=created_at.desc'),
    seleccionar('pg_plataforma', 'select=comision_pct'),
    seleccionar('pg_productos', 'select=*&order=precio_base.asc'),
    listarCombos(null),
    estadoPagos(null)
  ]);
  return { orgs, comision_pct: Number(plataforma[0]?.comision_pct ?? 0), productos, combos, pagos };
}));

/* ─── Empresas ───────────────────────────────────────────────────────────── */
router.post('/orgs', manejar(async req => {
  const b = req.body || {};
  const slug = String(b.slug || '').toLowerCase().trim();
  exigir(SLUG.test(slug), 'El identificador va en minúsculas, números y guiones (2 a 41 caracteres).');
  exigir(textoValido(b.nombre, 80), 'La empresa necesita un nombre.');
  exigir(b.comision_pct === undefined || comisionValida(b.comision_pct), 'La comisión va de 0 a 100.');
  const existe = await seleccionar('pg_organizaciones', `select=id&slug=eq.${slug}`);
  exigir(!existe.length, 'Ya existe una empresa con ese identificador.');
  const [org] = await insertar('pg_organizaciones', [{
    slug, nombre: b.nombre.trim(), email_contacto: b.email_contacto || null,
    comision_pct: b.comision_pct ?? null
  }], { devolver: true });
  let aviso = null;
  if (b.admin_email) aviso = await agregarMiembro(org.id, b.admin_email, 'owner');
  await auditar(req.user.email, 'crear_empresa', null, { slug });
  limpiarCacheOrgs();
  return { org, aviso };
}));

router.patch('/orgs/:id', manejar(async req => {
  exigir(UUID.test(req.params.id), 'Empresa no encontrada.');
  const b = req.body || {};
  const cambios = {};
  if (b.nombre !== undefined) { exigir(textoValido(b.nombre, 80), 'La empresa necesita un nombre.'); cambios.nombre = b.nombre.trim(); }
  if (b.activa !== undefined) cambios.activa = Boolean(b.activa);
  if (b.comision_pct !== undefined) { exigir(comisionValida(b.comision_pct), 'La comisión va de 0 a 100.'); cambios.comision_pct = b.comision_pct; }
  if (b.dominio !== undefined) {
    exigir(b.dominio === null || b.dominio === '' || /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(b.dominio), 'El dominio no es válido (ej.: empleo.agencia.com).');
    cambios.dominio = b.dominio || null;
  }
  for (const c of ['color_primario', 'color_acento']) if (b[c] !== undefined) { exigir(colorValido(b[c]), 'Colores en formato #RRGGBB.'); cambios[c] = b[c]; }
  exigir(Object.keys(cambios).length, 'No hay cambios para guardar.');
  await actualizar('pg_organizaciones', `id=eq.${req.params.id}`, cambios);
  await auditar(req.user.email, 'editar_empresa', null, { id: req.params.id, cambios: Object.keys(cambios) });
  limpiarCacheOrgs();
}));

// El admin tiene que estar registrado en el sitio: se busca por el email de su ficha.
async function agregarMiembro(orgId, email, rol = 'admin') {
  exigir(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || ''), 'Email no válido.');
  exigir(['owner', 'admin'].includes(rol), 'Rol no válido.');
  const [persona] = await seleccionar('pg_candidatos', `select=user_id&email=eq.${encodeURIComponent(email.toLowerCase().trim())}`);
  if (!persona) return `No encontramos una cuenta con ${email}. Pedile que se registre en el sitio y volvé a agregarla.`;
  await upsert('pg_org_miembros', [{ org_id: orgId, user_id: persona.user_id, rol }], 'org_id,user_id');
  return null;
}

router.get('/orgs/:id/miembros', manejar(async req => {
  exigir(UUID.test(req.params.id), 'Empresa no encontrada.');
  const miembros = await seleccionar('pg_org_miembros', `select=user_id,rol,created_at&org_id=eq.${req.params.id}`);
  const ids = miembros.map(m => m.user_id);
  const fichas = ids.length ? await seleccionar('pg_candidatos', `select=user_id,email,nombre&user_id=in.(${ids.join(',')})`) : [];
  return { miembros: miembros.map(m => ({ ...m, ...(fichas.find(f => f.user_id === m.user_id) || {}) })) };
}));

router.post('/orgs/:id/miembros', manejar(async req => {
  exigir(UUID.test(req.params.id), 'Empresa no encontrada.');
  const aviso = await agregarMiembro(req.params.id, req.body?.email, req.body?.rol || 'admin');
  exigir(!aviso, aviso);
}));

router.delete('/orgs/:id/miembros/:userId', manejar(async req => {
  exigir(UUID.test(req.params.id) && UUID.test(req.params.userId), 'Miembro no encontrado.');
  await borrar('pg_org_miembros', `org_id=eq.${req.params.id}&user_id=eq.${req.params.userId}`);
}));

/* ─── Plataforma: comisión, catálogo base, combos y medios de pago ───────── */
router.put('/plataforma', manejar(async req => {
  const v = req.body?.comision_pct;
  exigir(typeof v === 'number' && comisionValida(v), 'La comisión va de 0 a 100.');
  await actualizar('pg_plataforma', 'id=is.true', { comision_pct: v, updated_at: new Date().toISOString() });
  await auditar(req.user.email, 'comision_plataforma', null, { comision_pct: v });
}));

function filaProducto(b, parcial) {
  const f = {};
  if (!parcial || b.nombre !== undefined) { exigir(textoValido(b.nombre, 80), 'El producto necesita un nombre.'); f.nombre = b.nombre.trim(); }
  if (b.descripcion !== undefined) { exigir(b.descripcion === null || (typeof b.descripcion === 'string' && b.descripcion.length <= 300), 'Descripción hasta 300 caracteres.'); f.descripcion = b.descripcion; }
  if (!parcial || b.precio_base !== undefined) { exigir(precioValido(b.precio_base), 'El precio base tiene que ser un número entre 0 y 100.000.'); f.precio_base = b.precio_base; }
  if (b.moneda !== undefined) { exigir(monedaValida(b.moneda), 'Moneda de 3 letras, por ejemplo USD.'); f.moneda = b.moneda; }
  if (b.periodo !== undefined) { exigir(['unico', 'mes'].includes(b.periodo), 'Período "unico" o "mes".'); f.periodo = b.periodo; }
  if (b.activo !== undefined) f.activo = Boolean(b.activo);
  return f;
}

router.post('/productos', manejar(async req => {
  const codigo = String(req.body?.codigo || '');
  exigir(/^[a-z0-9_]{2,40}$/.test(codigo), 'El código va en minúsculas, números y guion bajo.');
  await insertar('pg_productos', [{ codigo, ...filaProducto(req.body, false) }]);
  limpiarCacheOrgs();
}));

router.put('/productos/:codigo', manejar(async req => {
  const cambios = filaProducto(req.body || {}, true);
  exigir(Object.keys(cambios).length, 'No hay cambios para guardar.');
  await actualizar('pg_productos', `codigo=eq.${encodeURIComponent(req.params.codigo)}`, cambios);
  limpiarCacheOrgs();
}));

router.post('/combos', manejar(async req => ({ combo: await crearCombo(null, req.body || {}) })));
router.put('/combos/:id', manejar(req => editarCombo(null, req.params.id, req.body || {})));
router.delete('/combos/:id', manejar(req => borrarCombo(null, req.params.id)));

router.put('/pagos/:metodo', manejar(async req => {
  await guardarPago(null, req.params.metodo, req.body || {});
  await auditar(req.user.email, 'configurar_pago', null, { org: 'plataforma', metodo: req.params.metodo });
}));
router.delete('/pagos/:metodo', manejar(req => quitarPago(null, req.params.metodo)));

export default router;
