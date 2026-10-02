import { Router } from 'express';
import { seleccionar, actualizar, auditar } from '../services/supabaseAdmin.js';
import { requireOrgAdmin, textoValido, colorValido, urlHttpsValida, limpiarCacheOrgs } from '../services/marcaBlanca.js';
import {
  ErrorValidacion, manejar, fijarPrecio, quitarPrecio, crearCombo, editarCombo, borrarCombo, listarCombos,
  estadoPagos, guardarPago, quitarPago
} from '../services/marcaBlancaAdmin.js';

// Panel de cada empresa: /api/v1/empresa/:slug/… (admins de la empresa o superadmin).
const router = Router({ mergeParams: true });
router.use(requireOrgAdmin);

router.get('/', manejar(async req => {
  const org = req.org;
  const [productos, precios, combos, pagos, plataforma] = await Promise.all([
    seleccionar('pg_productos', 'select=*&order=precio_base.asc'),
    seleccionar('pg_org_precios', `select=*&org_id=eq.${org.id}`),
    listarCombos(org.id),
    estadoPagos(org.id),
    seleccionar('pg_plataforma', 'select=comision_pct')
  ]);
  return {
    org: {
      id: org.id, slug: org.slug, nombre: org.nombre, dominio: org.dominio, logo_url: org.logo_url,
      color_primario: org.color_primario, color_acento: org.color_acento, email_contacto: org.email_contacto,
      comision_pct: Number(org.comision_pct ?? plataforma[0]?.comision_pct ?? 0)
    },
    productos, precios, combos, pagos
  };
}));

// Marca: nombre, logo, colores, email. El dominio y la comisión los define el superadmin.
router.patch('/', manejar(async req => {
  const b = req.body || {};
  const cambios = {};
  if (b.nombre !== undefined) { if (!textoValido(b.nombre, 80)) throw new ErrorValidacion('El nombre es obligatorio (hasta 80 caracteres).'); cambios.nombre = b.nombre.trim(); }
  if (b.logo_url !== undefined) { if (b.logo_url && !urlHttpsValida(b.logo_url)) throw new ErrorValidacion('El logo tiene que ser una dirección https.'); cambios.logo_url = b.logo_url || null; }
  for (const c of ['color_primario', 'color_acento']) {
    if (b[c] !== undefined) { if (!colorValido(b[c])) throw new ErrorValidacion('Los colores van en formato #RRGGBB.'); cambios[c] = b[c]; }
  }
  if (b.email_contacto !== undefined) {
    if (b.email_contacto && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email_contacto)) throw new ErrorValidacion('El email de contacto no es válido.');
    cambios.email_contacto = b.email_contacto || null;
  }
  if (!Object.keys(cambios).length) throw new ErrorValidacion('No hay cambios para guardar.');
  await actualizar('pg_organizaciones', `id=eq.${req.org.id}`, cambios);
  limpiarCacheOrgs();
}));

router.put('/precios/:producto', manejar(req => fijarPrecio(req.org.id, req.params.producto, req.body || {})));
router.delete('/precios/:producto', manejar(req => quitarPrecio(req.org.id, req.params.producto)));

router.get('/combos', manejar(async req => ({ combos: await listarCombos(req.org.id) })));
router.post('/combos', manejar(async req => ({ combo: await crearCombo(req.org.id, req.body || {}) })));
router.put('/combos/:id', manejar(req => editarCombo(req.org.id, req.params.id, req.body || {})));
router.delete('/combos/:id', manejar(req => borrarCombo(req.org.id, req.params.id)));

router.put('/pagos/:metodo', manejar(async req => {
  await guardarPago(req.org.id, req.params.metodo, req.body || {});
  await auditar(req.user.email, 'configurar_pago', null, { org: req.org.slug, metodo: req.params.metodo });
}));
router.delete('/pagos/:metodo', manejar(req => quitarPago(req.org.id, req.params.metodo)));

// Candidatos de la empresa (solo los suyos). Cada consulta queda registrada.
router.get('/candidatos', manejar(async req => {
  const items = await seleccionar('pg_candidatos', `select=user_id,email,nombre,telefono,profesion,created_at&org_id=eq.${req.org.id}&order=created_at.desc&limit=1000`);
  await auditar(req.user.email, 'listar_candidatos_empresa', null, { org: req.org.slug, cantidad: items.length });
  return { items };
}));

export default router;
