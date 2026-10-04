import { Router } from 'express';
import { requireUser, evaluarUso, registrarUso } from '../services/usage.js';
import { adminDisponible, seleccionar, insertar, actualizar } from '../services/supabaseAdmin.js';
import { resolverOrg } from '../services/marcaBlanca.js';
import { esAdmin } from '../controllers/adminController.js';
import {
  PRODUCTO_MOTOR, productoDisponible, motorConfigurado, crearSesion, enviarTurno, terminarSesion, catalogo,
  normalizarResultado, normalizarEvaluacion, ErrorMotor
} from '../services/alexioMotor.js';

// Práctica con IA: simulador de entrevistas e idiomas. La IA es de Alex IO (API motor);
// aquí se controla el acceso, se guarda la conversación y el resultado.
const router = Router();

const HERRAMIENTA = { simulador: 'entrevista', idiomas: 'idiomas' };
const MAX_MENSAJE = 2000;
// Tope de turnos por sesión: Alex IO cobra por sesión y no limita los turnos.
export const MAX_TURNOS = 40;

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

// Los administradores pueden probar con el motor conectado aunque la venta siga cerrada
// (sin ALEXIO_PRODUCTOS), y sin gastar usos gratis.
const modoPrueba = (req, producto) => !productoDisponible(producto) && motorConfigurado() && esAdmin(req.user);
const puedeUsar = (req, producto) => productoDisponible(producto) || modoPrueba(req, producto);

function validarProducto(req, res, next) {
  if (!PRODUCTO_MOTOR[req.params.producto]) return res.status(404).json({ success: false, error: 'Producto desconocido.' });
  if (!adminDisponible()) return res.status(503).json({ success: false, error: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' });
  next();
}

async function perfilDe(userId) {
  try {
    return (await seleccionar('pg_perfiles', `select=puesto,paises&user_id=eq.${userId}`))[0] || null;
  } catch { return null; } // sin creador de CV todavía: se pide todo en el formulario
}

// Opciones que hay cargadas en Alex IO para este producto (tracks o idiomas).
async function opcionesDe(producto) {
  const c = await catalogo();
  if (producto === 'simulador') return (c.coach || []).map(t => ({ track: t.track, rondas: t.rounds }));
  return (c.tutor || []).map(t => ({ idioma: t.language, lecciones: t.lessons, niveles: t.cefr_levels || [] }));
}

/**
 * Arma dos contextos: el que se guarda en Puentes Globales (para el historial) y el que se
 * manda a Alex IO, con solo lo que su API acepta hoy. Nunca lleva email, nombre ni contacto.
 */
export function armarContexto(producto, body = {}, perfil = null, opciones = []) {
  if (producto === 'simulador') {
    const puesto = texto(body.puesto || perfil?.puesto, 120);
    if (puesto.length < 2) return { error: 'Indicá el puesto al que te postulás.' };
    const track = opciones.find(o => o.track === body.track)?.track || opciones[0]?.track;
    if (!track) return { error: 'Todavía no hay entrevistas cargadas. Probá más tarde.', code: 'sin_contenido' };
    return { contexto: { puesto, pais_destino: texto(body.pais_destino, 60) || null, track }, motor: { track, role: puesto } };
  }
  const opcion = opciones.find(o => o.idioma === body.idioma_objetivo);
  if (!opcion) return { error: 'Elegí uno de los idiomas disponibles.' };
  return { contexto: { idioma_objetivo: opcion.idioma }, motor: { language: opcion.idioma } };
}

const publica = s => s && ({
  id: s.id, producto: s.producto, estado: s.estado, contexto: s.contexto, turnos: s.turnos, max_turnos: MAX_TURNOS,
  mensajes: (s.mensajes || []).map(({ clave, ...m }) => m), resultado: s.resultado, puntaje: s.puntaje,
  created_at: s.created_at, terminada_at: s.terminada_at
});

async function sesionDe(req) {
  const [s] = await seleccionar('pg_sesiones_ia', `select=*&id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${req.user.id}&producto=eq.${req.params.producto}`);
  return s || null;
}

function errorMotor(res, err, sesion) {
  if (err instanceof ErrorMotor) {
    if (['SESSION_NOT_FOUND', 'SESSION_EXPIRED'].includes(err.code) && sesion) {
      actualizar('pg_sesiones_ia', `id=eq.${sesion.id}`, { estado: 'vencida', updated_at: new Date().toISOString() }).catch(() => {});
      return res.status(410).json({ success: false, code: 'vencida', error: err.message });
    }
    if (err.code === 'SESSION_ENDED') return res.status(409).json({ success: false, code: 'terminada', error: 'Esta sesión ya terminó. Mirá tu resultado.' });
    return res.status(err.status >= 500 ? 503 : err.status === 429 ? 429 : 409).json({ success: false, code: err.code, error: err.message });
  }
  console.error('practica:', err.message);
  return res.status(500).json({ success: false, error: 'Algo falló. Probá de nuevo en unos minutos.' });
}

// Estado: si el producto está disponible, las opciones cargadas, la sesión en curso, el historial
// y datos del CV para precargar.
router.get('/:producto', requireUser, validarProducto, async (req, res) => {
  try {
    const { producto } = req.params;
    const disponible = puedeUsar(req, producto);
    const [sesiones, perfil, opciones] = await Promise.all([
      seleccionar('pg_sesiones_ia', `select=*&user_id=eq.${req.user.id}&producto=eq.${producto}&order=created_at.desc&limit=20`),
      producto === 'simulador' ? perfilDe(req.user.id) : null,
      disponible ? opcionesDe(producto).catch(() => null) : null
    ]);
    const activa = sesiones.find(s => s.estado === 'activa');
    res.json({
      success: true, disponible, modo_prueba: modoPrueba(req, producto), opciones,
      activa: publica(activa) || null,
      historial: sesiones.filter(s => s.estado === 'terminada').map(s => ({ id: s.id, created_at: s.created_at, puntaje: s.puntaje, contexto: s.contexto, resultado: s.resultado })),
      sugerido: perfil ? { puesto: perfil.puesto, paises: perfil.paises || [] } : null
    });
  } catch (err) { errorMotor(res, err); }
});

router.post('/:producto/sesiones', requireUser, validarProducto, async (req, res) => {
  const { producto } = req.params;
  if (!puedeUsar(req, producto)) return res.status(409).json({ success: false, code: 'proximamente', error: 'Esta herramienta todavía no está disponible.' });
  try {
    const [perfil, opciones] = await Promise.all([producto === 'simulador' ? perfilDe(req.user.id) : null, opcionesDe(producto)]);
    const { contexto, motor: contextoMotor, error, code } = armarContexto(producto, req.body || {}, perfil, opciones);
    if (error) return res.status(code ? 409 : 400).json({ success: false, code, error });

    const herramienta = HERRAMIENTA[producto];
    const prueba = modoPrueba(req, producto);
    const decision = prueba ? { allowed: true } : await evaluarUso(req.user, req.token, herramienta);
    if (!decision.allowed) return res.status(403).json({ success: false, code: 'limite', error: decision.message, upgradeUrl: 'planes-saas.html' });

    // Una sesión en curso por producto: la anterior se da por abandonada (Alex IO la borra al vencer).
    await actualizar('pg_sesiones_ia', `user_id=eq.${req.user.id}&producto=eq.${producto}&estado=eq.activa`, { estado: 'vencida', updated_at: new Date().toISOString() });

    const org = await resolverOrg(req).catch(() => null);
    const motor = await crearSesion({ producto, userId: req.user.id, orgRef: org?.slug || null, contexto: contextoMotor });
    const ahora = new Date().toISOString();
    const [sesion] = await insertar('pg_sesiones_ia', [{
      user_id: req.user.id, producto, org_id: org?.id || null, session_id: motor.session_id, contexto, estado: 'activa', turnos: 0,
      mensajes: motor.mensaje_inicial ? [{ rol: 'ia', texto: motor.mensaje_inicial, at: ahora }] : []
    }], { devolver: true });
    // El uso gratis se descuenta recién cuando la sesión existe.
    if (!prueba) await registrarUso(req.user, req.token, herramienta).catch(e => console.error('practica: no se registró el uso:', e.message));
    res.status(201).json({ success: true, sesion: publica(sesion) });
  } catch (err) { errorMotor(res, err); }
});

router.post('/:producto/sesiones/:id/turnos', requireUser, validarProducto, async (req, res) => {
  const mensaje = texto(req.body?.mensaje, MAX_MENSAJE + 1);
  const clave = String(req.body?.clave || '');
  if (!mensaje) return res.status(400).json({ success: false, error: 'Escribí tu respuesta.' });
  if (mensaje.length > MAX_MENSAJE) return res.status(400).json({ success: false, error: `Máximo ${MAX_MENSAJE} caracteres.` });
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clave)) return res.status(400).json({ success: false, error: 'Falta la clave del mensaje.' });
  let sesion;
  try {
    sesion = await sesionDe(req);
    if (!sesion) return res.status(404).json({ success: false, error: 'Sesión no encontrada.' });
    const mensajes = sesion.mensajes || [];
    // Reintento del mismo mensaje (por un corte de red): se devuelve lo ya guardado.
    const i = mensajes.findIndex(m => m.rol === 'usuario' && m.clave === clave);
    if (i >= 0 && mensajes[i + 1]) {
      const r = mensajes[i + 1];
      return res.json({ success: true, respuesta: r.texto, evaluacion: r.evaluacion || null, terminada: Boolean(r.terminada) });
    }
    if (sesion.estado !== 'activa') return res.status(409).json({ success: false, code: sesion.estado, error: 'Esta sesión ya terminó.' });
    if ((sesion.turnos || 0) >= MAX_TURNOS) return res.status(409).json({ success: false, code: 'tope', error: 'Llegaste al máximo de respuestas de esta sesión. Terminala para ver tu resultado.' });

    const t = await enviarTurno(sesion.session_id, mensaje, `${sesion.id}:${clave}`);
    const ahora = new Date().toISOString();
    const turnos = (sesion.turnos || 0) + 1;
    const nuevos = [
      { rol: 'usuario', texto: mensaje, clave, at: ahora },
      { rol: 'ia', texto: String(t.reply || ''), evaluacion: normalizarEvaluacion(t.evaluacion_del_turno), terminada: turnos >= MAX_TURNOS, at: ahora }
    ];
    await actualizar('pg_sesiones_ia', `id=eq.${sesion.id}`, { mensajes: [...mensajes, ...nuevos], turnos, updated_at: ahora });
    res.json({ success: true, respuesta: nuevos[1].texto, evaluacion: nuevos[1].evaluacion, terminada: nuevos[1].terminada });
  } catch (err) { errorMotor(res, err, sesion); }
});

router.post('/:producto/sesiones/:id/fin', requireUser, validarProducto, async (req, res) => {
  let sesion;
  try {
    sesion = await sesionDe(req);
    if (!sesion) return res.status(404).json({ success: false, error: 'Sesión no encontrada.' });
    if (sesion.estado === 'terminada') return res.json({ success: true, sesion: publica(sesion) });
    if (sesion.estado !== 'activa') return res.status(409).json({ success: false, code: sesion.estado, error: 'Esta sesión venció.' });
    const r = await terminarSesion(sesion.session_id);
    const { rubrica, comentario_general, puntaje } = normalizarResultado(r?.final_evaluation);
    const resultado = { rubrica, comentario_general };
    const ahora = new Date().toISOString();
    const [actualizada] = await actualizar('pg_sesiones_ia', `id=eq.${sesion.id}&estado=eq.activa`, {
      estado: 'terminada', resultado, puntaje, terminada_at: ahora, updated_at: ahora
    }, { devolver: true });
    res.json({ success: true, sesion: publica(actualizada || { ...sesion, estado: 'terminada', resultado, puntaje }) });
  } catch (err) { errorMotor(res, err, sesion); }
});

export default router;
