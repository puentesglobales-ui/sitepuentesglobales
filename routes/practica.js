import { Router } from 'express';
import { requireUser, evaluarUso, registrarUso } from '../services/usage.js';
import { adminDisponible, seleccionar, insertar, actualizar } from '../services/supabaseAdmin.js';
import { resolverOrg } from '../services/marcaBlanca.js';
import { PRODUCTO_MOTOR, productoDisponible, crearSesion, enviarTurno, terminarSesion, ErrorMotor } from '../services/alexioMotor.js';

// Práctica con IA: simulador de entrevistas e idiomas. La IA es de Alex IO (API motor);
// aquí se controla el acceso, se guarda la conversación y el resultado.
const router = Router();

const HERRAMIENTA = { simulador: 'entrevista', idiomas: 'idiomas' };
const IDIOMAS_ENTREVISTA = ['es', 'en', 'de', 'fr', 'it', 'nl', 'pl', 'pt'];
const IDIOMAS_TUTOR = ['en', 'de', 'fr', 'pt']; // los que tiene Alex IO hoy
const NIVELES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const OBJETIVOS = ['entrevistas', 'trabajo', 'salud', 'vida_diaria'];
const ANIOS = { ninguna: 0, menos_1: 0, '1_3': 2, '3_5': 4, mas_5: 6 };
const MAX_MENSAJE = 2000;

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

function validarProducto(req, res, next) {
  if (!PRODUCTO_MOTOR[req.params.producto]) return res.status(404).json({ success: false, error: 'Producto desconocido.' });
  if (!adminDisponible()) return res.status(503).json({ success: false, error: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' });
  next();
}

async function perfilDe(userId) {
  try {
    return (await seleccionar('pg_perfiles', `select=puesto,paises,experiencia_puesto,resumen&user_id=eq.${userId}`))[0] || null;
  } catch { return null; } // sin creador de CV todavía: se pide todo en el formulario
}

// Contexto que se manda a Alex IO. Nunca lleva email, nombre ni datos de contacto.
export function armarContexto(producto, body = {}, perfil = null) {
  if (producto === 'simulador') {
    const puesto = texto(body.puesto || perfil?.puesto, 120);
    if (puesto.length < 2) return { error: 'Indicá el puesto al que te postulás.' };
    const idioma = IDIOMAS_ENTREVISTA.includes(body.idioma_entrevista) ? body.idioma_entrevista : 'en';
    return {
      contexto: {
        puesto,
        pais_destino: texto(body.pais_destino, 60) || null,
        idioma_entrevista: idioma,
        anios_experiencia: Number.isInteger(body.anios_experiencia) ? Math.max(0, Math.min(50, body.anios_experiencia)) : (ANIOS[perfil?.experiencia_puesto] ?? null),
        tipo_entrevista: body.tipo_entrevista === 'tecnica' ? 'tecnica' : 'rrhh',
        dificultad: ['easy', 'medium', 'hard'].includes(body.dificultad) ? body.dificultad : 'medium',
        resumen_cv: texto(perfil?.resumen, 1200) || null
      }
    };
  }
  const idioma = body.idioma_objetivo;
  if (!IDIOMAS_TUTOR.includes(idioma)) return { error: 'Elegí el idioma que querés practicar.' };
  return {
    contexto: {
      idioma_objetivo: idioma,
      idioma_base: 'es',
      nivel: NIVELES.includes(body.nivel) ? body.nivel : 'A1',
      objetivo: OBJETIVOS.includes(body.objetivo) ? body.objetivo : 'trabajo',
      leccion_id: body.leccion_id ? texto(body.leccion_id, 60) : null
    }
  };
}

const publica = s => s && ({
  id: s.id, producto: s.producto, estado: s.estado, contexto: s.contexto, turnos: s.turnos,
  mensajes: (s.mensajes || []).map(({ clave, ...m }) => m), resultado: s.resultado, puntaje: s.puntaje,
  created_at: s.created_at, terminada_at: s.terminada_at
});

async function sesionDe(req) {
  const [s] = await seleccionar('pg_sesiones_ia', `select=*&id=eq.${encodeURIComponent(req.params.id)}&user_id=eq.${req.user.id}&producto=eq.${req.params.producto}`);
  return s || null;
}

function errorMotor(res, err, sesion) {
  if (err instanceof ErrorMotor) {
    if (err.code === 'SESSION_NOT_FOUND' && sesion) {
      actualizar('pg_sesiones_ia', `id=eq.${sesion.id}`, { estado: 'vencida', updated_at: new Date().toISOString() }).catch(() => {});
      return res.status(410).json({ success: false, code: 'vencida', error: err.message });
    }
    return res.status(err.status >= 500 ? 503 : err.status === 429 ? 429 : 409).json({ success: false, code: err.code, error: err.message });
  }
  console.error('practica:', err.message);
  return res.status(500).json({ success: false, error: 'Algo falló. Probá de nuevo en unos minutos.' });
}

// Estado: si el producto está disponible, la sesión en curso, el historial y datos del CV para precargar.
router.get('/:producto', requireUser, validarProducto, async (req, res) => {
  try {
    const { producto } = req.params;
    const [sesiones, perfil] = await Promise.all([
      seleccionar('pg_sesiones_ia', `select=*&user_id=eq.${req.user.id}&producto=eq.${producto}&order=created_at.desc&limit=20`),
      producto === 'simulador' ? perfilDe(req.user.id) : null
    ]);
    const activa = sesiones.find(s => s.estado === 'activa');
    res.json({
      success: true,
      disponible: productoDisponible(producto),
      activa: publica(activa) || null,
      historial: sesiones.filter(s => s.estado === 'terminada').map(s => ({ id: s.id, created_at: s.created_at, puntaje: s.puntaje, contexto: s.contexto, resultado: s.resultado })),
      sugerido: perfil ? { puesto: perfil.puesto, paises: perfil.paises || [], experiencia_puesto: perfil.experiencia_puesto } : null
    });
  } catch (err) { errorMotor(res, err); }
});

router.post('/:producto/sesiones', requireUser, validarProducto, async (req, res) => {
  const { producto } = req.params;
  if (!productoDisponible(producto)) return res.status(409).json({ success: false, code: 'proximamente', error: 'Esta herramienta todavía no está disponible.' });
  try {
    const perfil = producto === 'simulador' ? await perfilDe(req.user.id) : null;
    const { contexto, error } = armarContexto(producto, req.body || {}, perfil);
    if (error) return res.status(400).json({ success: false, error });

    // Una sesión en curso por producto: la anterior se da por abandonada (Alex IO la borra al vencer).
    await actualizar('pg_sesiones_ia', `user_id=eq.${req.user.id}&producto=eq.${producto}&estado=eq.activa`, { estado: 'vencida', updated_at: new Date().toISOString() });

    const herramienta = HERRAMIENTA[producto];
    const decision = await evaluarUso(req.user, req.token, herramienta);
    if (!decision.allowed) return res.status(403).json({ success: false, code: 'limite', error: decision.message, upgradeUrl: 'planes-saas.html' });

    const org = await resolverOrg(req).catch(() => null);
    const motor = await crearSesion({ producto, userId: req.user.id, orgRef: org?.slug || null, contexto });
    const ahora = new Date().toISOString();
    const [sesion] = await insertar('pg_sesiones_ia', [{
      user_id: req.user.id, producto, org_id: org?.id || null, session_id: motor.session_id, contexto, estado: 'activa', turnos: 0,
      mensajes: motor.mensaje_inicial ? [{ rol: 'ia', texto: motor.mensaje_inicial, at: ahora }] : []
    }], { devolver: true });
    // El uso gratis se descuenta recién cuando la sesión existe.
    await registrarUso(req.user, req.token, herramienta).catch(e => console.error('practica: no se registró el uso:', e.message));
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

    const t = await enviarTurno(sesion.session_id, mensaje, `${sesion.id}:${clave}`);
    const ahora = new Date().toISOString();
    const nuevos = [
      { rol: 'usuario', texto: mensaje, clave, at: ahora },
      { rol: 'ia', texto: String(t.reply || ''), evaluacion: t.evaluacion_del_turno || null, terminada: Boolean(t.terminada), at: ahora }
    ];
    await actualizar('pg_sesiones_ia', `id=eq.${sesion.id}`, { mensajes: [...mensajes, ...nuevos], turnos: (sesion.turnos || 0) + 1, updated_at: ahora });
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
    const ahora = new Date().toISOString();
    const puntaje = Number.isFinite(Number(r?.score)) ? Math.max(0, Math.min(100, Math.round(Number(r.score)))) : null;
    const [actualizada] = await actualizar('pg_sesiones_ia', `id=eq.${sesion.id}&estado=eq.activa`, {
      estado: 'terminada', resultado: r, puntaje, terminada_at: ahora, updated_at: ahora
    }, { devolver: true });
    res.json({ success: true, sesion: publica(actualizada || { ...sesion, estado: 'terminada', resultado: r, puntaje }) });
  } catch (err) { errorMotor(res, err, sesion); }
});

export default router;
