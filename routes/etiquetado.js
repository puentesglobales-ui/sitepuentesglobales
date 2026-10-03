import { Router } from 'express';
import { requireUser } from '../services/usage.js';
import { requireAdminUser } from '../controllers/adminController.js';
import { adminDisponible, seleccionar, insertar, actualizar, auditar } from '../services/supabaseAdmin.js';
import { emailDisponible, enviarEmail, escaparHtml } from '../services/email.js';
import {
  preguntasPublicas, corregir, validarRedaccion, limpiarSenales,
  TIEMPO_LIMITE_MIN, PUNTAJE_SUGERIDO
} from '../services/etiquetado.js';

// Proyecto de etiquetado de IA: prueba de aptitud (candidatos) y embudo de selección (admin).
const router = Router();

const origen = req => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

function requireServidor(req, res, next) {
  if (!adminDisponible()) return res.status(503).json({ success: false, error: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' });
  next();
}

async function permisoVigente(userId) {
  const r = await seleccionar('pg_consentimientos', `select=aceptado&user_id=eq.${userId}&tipo=eq.trabajos_ia&order=created_at.desc&limit=1`);
  return Boolean(r[0] && r[0].aceptado);
}

async function filaDe(userId) {
  return (await seleccionar('pg_etiquetado', `select=*&user_id=eq.${userId}`))[0] || null;
}

/* ─── Candidatos ──────────────────────────────────────────────────────── */

router.get('/estado', requireUser, requireServidor, async (req, res) => {
  try {
    const [permiso, fila] = await Promise.all([permisoVigente(req.user.id), filaDe(req.user.id)]);
    res.json({
      success: true, permiso, tiempo_limite_min: TIEMPO_LIMITE_MIN,
      estado: fila?.estado || null, hecha: Boolean(fila?.prueba_at),
      puntaje: fila?.prueba_at ? fila.puntaje : null, maximo: fila?.prueba_at ? fila.maximo : null
    });
  } catch (err) {
    console.error('etiquetado/estado:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos leer tu estado.' });
  }
});

// Empieza la prueba (o la retoma): guarda la hora de inicio y devuelve las preguntas sin soluciones.
router.post('/iniciar', requireUser, requireServidor, async (req, res) => {
  try {
    if (!(await permisoVigente(req.user.id))) {
      return res.status(403).json({ success: false, code: 'permiso', error: 'Primero anotate para trabajos de IA (al final del test de CI).' });
    }
    let fila = await filaDe(req.user.id);
    if (fila?.prueba_at) return res.status(409).json({ success: false, code: 'hecha', error: 'Ya hiciste la prueba. Se puede hacer una sola vez.' });
    if (fila?.estado === 'descartado') return res.status(403).json({ success: false, error: 'La prueba no está disponible para tu cuenta.' });
    const ahora = new Date().toISOString();
    if (!fila) {
      try {
        await insertar('pg_etiquetado', [{ user_id: req.user.id, estado: 'prueba_iniciada', prueba_inicio_at: ahora }]);
      } catch { /* dos pestañas a la vez: la otra ya creó la fila */ }
      fila = await filaDe(req.user.id);
    } else if (!fila.prueba_inicio_at) {
      [fila] = await actualizar('pg_etiquetado', `user_id=eq.${req.user.id}&prueba_inicio_at=is.null`,
        { estado: 'prueba_iniciada', prueba_inicio_at: ahora, updated_at: ahora }, { devolver: true });
      fila = fila || await filaDe(req.user.id);
    }
    const restante = Math.max(0, TIEMPO_LIMITE_MIN * 60 - Math.round((Date.now() - new Date(fila.prueba_inicio_at).getTime()) / 1000));
    res.json({ success: true, secciones: preguntasPublicas(), segundos_restantes: restante, tiempo_limite_min: TIEMPO_LIMITE_MIN });
  } catch (err) {
    console.error('etiquetado/iniciar:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos empezar la prueba. Probá de nuevo en unos minutos.' });
  }
});

router.post('/enviar', requireUser, requireServidor, async (req, res) => {
  const { respuestas, redaccion, senales } = req.body || {};
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) {
    return res.status(400).json({ success: false, error: 'Faltan las respuestas.' });
  }
  const errorRedaccion = validarRedaccion(redaccion);
  if (errorRedaccion) return res.status(400).json({ success: false, error: errorRedaccion });
  try {
    if (!(await permisoVigente(req.user.id))) return res.status(403).json({ success: false, code: 'permiso', error: 'Retiraste el permiso para trabajos de IA.' });
    const fila = await filaDe(req.user.id);
    if (!fila?.prueba_inicio_at) return res.status(409).json({ success: false, error: 'Primero empezá la prueba.' });
    const r = corregir(respuestas);
    const ahora = new Date().toISOString();
    // Solo se guarda si todavía no estaba hecha: evita dos envíos.
    const guardadas = await actualizar('pg_etiquetado', `user_id=eq.${req.user.id}&prueba_at=is.null`, {
      estado: 'prueba_hecha', puntaje: r.puntaje, maximo: r.maximo, secciones: r.secciones,
      redaccion: String(redaccion).trim(), senales: limpiarSenales(senales, fila.prueba_inicio_at),
      prueba_at: ahora, updated_at: ahora
    }, { devolver: true });
    if (!guardadas.length) return res.status(409).json({ success: false, code: 'hecha', error: 'Ya hiciste la prueba. Se puede hacer una sola vez.' });
    res.json({ success: true, puntaje: r.puntaje, maximo: r.maximo });
  } catch (err) {
    console.error('etiquetado/enviar:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos guardar tu prueba. Probá de nuevo en unos minutos.' });
  }
});

/* ─── Administración ──────────────────────────────────────────────────── */

// Solo personas con el permiso "trabajos_ia" vigente. Quien lo retiró no aparece.
router.get('/admin/embudo', requireAdminUser, requireServidor, async (req, res) => {
  try {
    const [candidatos, permisos, tests, filas] = await Promise.all([
      seleccionar('pg_candidatos', 'select=user_id,email,nombre,telefono,profesion&limit=20000'),
      seleccionar('pg_consentimientos', 'select=user_id,aceptado,created_at&tipo=eq.trabajos_ia&order=created_at.desc&limit=20000'),
      seleccionar('pg_resultados_test', 'select=user_id,detalle,created_at&test=eq.ci&order=created_at.desc&limit=20000'),
      seleccionar('pg_etiquetado', 'select=*&limit=20000')
    ]);
    const vigente = {};
    for (const p of permisos) if (!(p.user_id in vigente)) vigente[p.user_id] = p.aceptado;
    const ci = {};
    for (const t of tests) if (!(t.user_id in ci)) ci[t.user_id] = t.detalle?.ci_estimado ?? null;
    const etq = Object.fromEntries(filas.map(f => [f.user_id, f]));
    const items = candidatos.filter(c => vigente[c.user_id]).map(c => {
      const f = etq[c.user_id] || {};
      return {
        user_id: c.user_id, email: c.email, nombre: c.nombre, profesion: c.profesion, ci: ci[c.user_id] ?? null,
        estado: f.estado || 'anotado', puntaje: f.puntaje ?? null, maximo: f.maximo ?? null, secciones: f.secciones || null,
        redaccion: f.redaccion || null, senales: f.senales || null, nota: f.nota || null,
        invitado_prueba_at: f.invitado_prueba_at || null, prueba_at: f.prueba_at || null, invitado_entrevista_at: f.invitado_entrevista_at || null
      };
    });
    await auditar(req.user.email, 'etiquetado_embudo', null, { cantidad: items.length });
    const base = origen(req), agenda = process.env.ETIQUETADO_AGENDA_URL || null;
    res.json({
      success: true, items, email_disponible: emailDisponible(), puntaje_sugerido: PUNTAJE_SUGERIDO,
      // Para enviarlo a mano en copia oculta: sin nombre propio.
      textos: { prueba: textoInvitacion('prueba', { base, agenda }), entrevista: textoInvitacion('entrevista', { base, agenda }) }
    });
  } catch (err) {
    console.error('etiquetado/embudo:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos leer el embudo.' });
  }
});

export function textoInvitacion(etapa, { nombre, base, agenda }) {
  const hola = nombre ? `Hola, ${nombre.split(' ')[0]}:` : 'Hola:';
  const baja = `Si ya no te interesa, podés retirar el permiso cuando quieras desde ${base}/mis-datos.html`;
  if (etapa === 'prueba') {
    return {
      asunto: 'Trabajo remoto entrenando IA: el siguiente paso',
      texto: `${hola}\n\nTe anotaste para trabajos remotos de entrenamiento de inteligencia artificial y tu perfil encaja con lo que buscamos.\n\nEl siguiente paso es una prueba de aptitud de ${TIEMPO_LIMITE_MIN} minutos. Se hace una sola vez: buscá un momento tranquilo.\n${base}/test-etiquetado.html\n\nNo compartimos tus datos con ninguna empresa sin tu aceptación.\n\n${baja}\n\nEquipo de Puentes Globales`
    };
  }
  return {
    asunto: 'Te invitamos a una entrevista por videollamada',
    texto: `${hola}\n\nGracias por hacer la prueba de aptitud. Queremos conocerte en una videollamada de unos 20 minutos, donde vas a hacer algunas tareas en vivo (sin usar IA).\n\n${agenda ? `Elegí el horario que te quede mejor: ${agenda}` : 'Respondé este email con dos o tres horarios en los que puedas.'}\n\n${baja}\n\nEquipo de Puentes Globales`
  };
}

// Invita a la prueba o a la entrevista. Sin email configurado, "manual: true" solo marca como
// invitadas a las personas (el admin envió el email por su cuenta con el texto que da el panel).
router.post('/admin/invitar', requireAdminUser, requireServidor, async (req, res) => {
  const { user_ids, etapa, manual } = req.body || {};
  if (!['prueba', 'entrevista'].includes(etapa) || !Array.isArray(user_ids) || !user_ids.length || user_ids.length > 200) {
    return res.status(400).json({ success: false, error: 'Indicá la etapa y entre 1 y 200 personas.' });
  }
  if (!manual && !emailDisponible()) return res.status(400).json({ success: false, error: 'El envío de emails no está configurado.' });
  const ids = [...new Set(user_ids.map(String).filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
  const desde = etapa === 'prueba' ? ['anotado'] : ['prueba_hecha'];
  const resultado = { invitados: [], omitidos: [] };
  try {
    const candidatos = await seleccionar('pg_candidatos', `select=user_id,email,nombre&user_id=in.(${ids.join(',')})`);
    for (const c of candidatos) {
      if (!(await permisoVigente(c.user_id))) { resultado.omitidos.push({ email: c.email, motivo: 'sin permiso' }); continue; }
      const fila = await filaDe(c.user_id);
      if (!desde.includes(fila?.estado || 'anotado')) { resultado.omitidos.push({ email: c.email, motivo: `estado ${fila?.estado}` }); continue; }
      if (!manual) {
        const m = textoInvitacion(etapa, { nombre: c.nombre, base: origen(req), agenda: process.env.ETIQUETADO_AGENDA_URL });
        try {
          await enviarEmail({ para: c.email, asunto: m.asunto, texto: m.texto, html: `<div style="font-family:sans-serif;white-space:pre-line">${escaparHtml(m.texto)}</div>` });
        } catch (e) {
          resultado.omitidos.push({ email: c.email, motivo: 'no se pudo enviar' });
          console.error('etiquetado/invitar:', e.message);
          continue;
        }
      }
      const ahora = new Date().toISOString();
      const cambios = etapa === 'prueba'
        ? { estado: 'invitado_prueba', invitado_prueba_at: ahora, updated_at: ahora }
        : { estado: 'invitado_entrevista', invitado_entrevista_at: ahora, updated_at: ahora };
      if (fila) await actualizar('pg_etiquetado', `user_id=eq.${c.user_id}`, cambios);
      else await insertar('pg_etiquetado', [{ user_id: c.user_id, ...cambios }]);
      resultado.invitados.push(c.email);
    }
    await auditar(req.user.email, `etiquetado_invitar_${etapa}`, null, { cantidad: resultado.invitados.length, manual: Boolean(manual) });
    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error('etiquetado/invitar:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos completar las invitaciones.', ...resultado });
  }
});

router.post('/admin/revisar', requireAdminUser, requireServidor, async (req, res) => {
  const { user_id, estado, nota } = req.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(String(user_id)) || !['aprobado', 'descartado'].includes(estado)) {
    return res.status(400).json({ success: false, error: 'Datos inválidos.' });
  }
  try {
    const fila = await filaDe(user_id);
    const ahora = new Date().toISOString();
    const cambios = { estado, nota: nota ? String(nota).slice(0, 1000) : null, revisado_por: req.user.email, updated_at: ahora };
    if (fila) await actualizar('pg_etiquetado', `user_id=eq.${user_id}`, cambios);
    else await insertar('pg_etiquetado', [{ user_id, ...cambios }]);
    await auditar(req.user.email, `etiquetado_${estado}`, user_id, null);
    res.json({ success: true });
  } catch (err) {
    console.error('etiquetado/revisar:', err.message);
    res.status(500).json({ success: false, error: 'No pudimos guardar la revisión.' });
  }
});

export default router;
