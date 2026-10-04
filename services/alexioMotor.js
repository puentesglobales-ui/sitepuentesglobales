/**
 * Cliente de la "API motor" de Alex IO (proyecto aparte). Alex IO genera las respuestas
 * de la IA y la evaluación; Puentes Globales maneja alumnos, progreso, accesos y pagos.
 * La llamada es de servidor a servidor: el navegador nunca habla con Alex IO.
 *
 * Variables:
 *   ALEXIO_ENGINE_URL     URL base (p. ej. https://…onrender.com); /api/engine se agrega solo
 *   ALEXIO_ENGINE_KEY     clave de API activa; ALEXIO_ENGINE_KEY_2 = la nueva durante una rotación
 *   ALEXIO_REF_SECRET     secreto propio para el student_ref seudónimo (nunca se manda el email)
 *   ALEXIO_PRODUCTOS      productos habilitados, separados por coma: "simulador,idiomas".
 *                         Sin la variable, los dos se muestran como "Próximamente".
 */
import crypto from 'node:crypto';

// Productos de Puentes Globales que entrega Alex IO, y su nombre en la API motor.
export const PRODUCTO_MOTOR = { simulador: 'coach', idiomas: 'tutor' };
export const TIMEOUT_MS = 30000; // Alex IO corta cada turno a los 25 s

const env = k => (process.env[k] || '').trim();

export function motorConfigurado() {
  return Boolean(env('ALEXIO_ENGINE_URL') && env('ALEXIO_ENGINE_KEY') && env('ALEXIO_REF_SECRET'));
}

// ¿Se puede vender y usar este producto? Los de Alex IO solo si el motor está configurado
// y el producto figura en ALEXIO_PRODUCTOS. El resto del catálogo no depende de esto.
export function productoDisponible(codigo) {
  if (!PRODUCTO_MOTOR[codigo]) return true;
  const habilitados = env('ALEXIO_PRODUCTOS').split(',').map(s => s.trim()).filter(Boolean);
  return motorConfigurado() && habilitados.includes(codigo);
}

export const esProductoAlexio = codigo => Boolean(PRODUCTO_MOTOR[codigo]);

// Identificador estable y seudónimo: Alex IO nunca recibe el id real, el email ni el nombre.
export function studentRef(userId) {
  return crypto.createHmac('sha256', env('ALEXIO_REF_SECRET')).update(String(userId)).digest('hex');
}

export class ErrorMotor extends Error {
  constructor(status, code, mensaje) { super(mensaje); this.status = status; this.code = code; }
}

// Mensajes para la persona según el error de Alex IO.
const MENSAJES = {
  SESSION_NOT_FOUND: 'La sesión venció. Empezá una nueva.',
  SESSION_EXPIRED: 'La sesión venció (duran 24 horas). Empezá una nueva.',
  SESSION_ENDED: 'Esta sesión ya terminó.',
  TEXT_TOO_LONG: 'El mensaje es demasiado largo (máximo 2000 caracteres).',
  INVALID_TEXT: 'Escribí tu respuesta.',
  INVALID_CONTEXT: 'Faltan datos para empezar la sesión.',
  NO_CONTENT_FOR_CONTEXT: 'Todavía no hay contenido cargado para esta opción. Probá con otra.',
  RATE_LIMITED: 'Hay mucha demanda en este momento. Probá de nuevo en unos segundos.',
  NO_AI_PROVIDER_AVAILABLE: 'El servicio de IA no está disponible en este momento. Probá de nuevo en unos minutos.',
  TURN_TIMEOUT: 'La respuesta tardó demasiado. Probá de nuevo.'
};

async function pedir(path, { method = 'GET', body } = {}, reintentar = false) {
  // Se acepta la URL con o sin /api/engine al final.
  const base = env('ALEXIO_ENGINE_URL').replace(/\/+$/, '').replace(/\/api\/engine(\/v1)?$/, '');
  const claves = [env('ALEXIO_ENGINE_KEY'), env('ALEXIO_ENGINE_KEY_2')].filter(Boolean);
  const intentos = reintentar ? 2 : 1;
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    for (const [k, clave] of claves.entries()) {
      let res;
      try {
        res = await fetch(`${base}/api/engine${path}`, {
          method,
          headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch (err) {
        ultimo = new ErrorMotor(503, 'RED', 'No pudimos conectar con el servicio de IA. Probá de nuevo en unos minutos.');
        break; // error de red: se reintenta (si corresponde) con la clave principal
      }
      // Durante una rotación, una clave ya revocada da 401: se prueba con la otra.
      if (res.status === 401 && k < claves.length - 1) continue;
      if (res.status === 204) return null;
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const code = data.code || data.error?.code || (typeof data.error === 'string' ? data.error : null) || `HTTP_${res.status}`;
      ultimo = new ErrorMotor(res.status, code, MENSAJES[code] || 'El servicio de IA devolvió un error. Probá de nuevo en unos minutos.');
      if (res.status < 500 && res.status !== 429) throw ultimo; // errores del pedido: no se reintenta
      break;
    }
  }
  throw ultimo;
}

// contexto: lo que Alex IO acepta hoy. Simulador: { track, role }. Idiomas: { language }.
export function crearSesion({ producto, userId, orgRef, contexto }) {
  return pedir('/sessions', { method: 'POST', body: { product: PRODUCTO_MOTOR[producto], student_ref: studentRef(userId), org_ref: orgRef || null, context: contexto } });
}

// Con la misma idempotency_key Alex IO devuelve la misma respuesta: el reintento es seguro.
export function enviarTurno(sessionId, mensaje, idempotencyKey) {
  return pedir(`/sessions/${encodeURIComponent(sessionId)}/turns`, { method: 'POST', body: { text: mensaje, idempotency_key: idempotencyKey } }, true);
}

// Llamarlo dos veces devuelve la misma rúbrica (already_ended: true).
export function terminarSesion(sessionId) {
  return pedir(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', body: {} }, true);
}

// Qué hay cargado en Alex IO: tracks del simulador e idiomas del tutor. Se guarda 10 minutos.
let cacheCatalogo = null;
export async function catalogo() {
  if (cacheCatalogo && Date.now() - cacheCatalogo.at < 10 * 60 * 1000) return cacheCatalogo.valor;
  const valor = await pedir('/catalog', {}, true);
  cacheCatalogo = { at: Date.now(), valor };
  return valor;
}
export function limpiarCacheCatalogo() { cacheCatalogo = null; }

// Nombres de los criterios de la rúbrica de /end.
const CRITERIOS = {
  contenido_relevancia: 'Contenido y relevancia', estructura_star: 'Estructura (STAR)',
  comunicacion_claridad: 'Comunicación y claridad', manejo_objeciones: 'Manejo de preguntas difíciles',
  vocabulario: 'Vocabulario', gramatica: 'Gramática', fluidez_comunicacion: 'Fluidez', comprension: 'Comprensión'
};

// final_evaluation de Alex IO → { rubrica[], comentario_general, puntaje 0–100 }.
export function normalizarResultado(final = {}) {
  const rubrica = Object.entries(final || {})
    .filter(([, v]) => v && typeof v === 'object' && Number.isFinite(Number(v.score)))
    .map(([k, v]) => ({ criterio: CRITERIOS[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), puntaje: Math.max(0, Math.min(10, Number(v.score))), comentario: v.comment || '' }));
  const puntaje = rubrica.length ? Math.round(rubrica.reduce((a, c) => a + c.puntaje, 0) / rubrica.length * 10) : null;
  return { rubrica, comentario_general: typeof final?.overall_comment === 'string' ? final.overall_comment : '', puntaje };
}

// evaluacion_del_turno de Alex IO → formato que muestra la página.
export function normalizarEvaluacion(e) {
  if (!e) return null;
  const m = e.mistake || null;
  return {
    has_mistake: Boolean(m), mistake_type: m?.mistake_type || null, corrected_text: m?.corrected_text || null, explanation: m?.explanation || null,
    avanzo: Boolean(e.advanced), siguiente: e.next_item_title || null, nivel: e.next_level || null
  };
}

// Ojo: al 2026-10-04 Alex IO todavía no tiene este endpoint (se pidió para la Etapa 1).
// Mientras tanto, el borrado de cuenta lo anota en la auditoría como pendiente.
export function borrarAlumno(userId) {
  return pedir(`/students/${studentRef(userId)}`, { method: 'DELETE' }, true);
}
