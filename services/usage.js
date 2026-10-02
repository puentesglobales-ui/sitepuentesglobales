/**
 * Identidad del usuario y contador de usos de herramientas (ATS, entrevista).
 *
 * Se usa el mismo token de sesión de Supabase que tiene el navegador: el servidor
 * lo valida contra Supabase y escribe en pg_uso con ese token, así las políticas
 * RLS limitan cada usuario a sus propios registros y no hace falta una clave secreta.
 */
import { SaasCore } from './saasCore.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mceiutonddbgddrrrajv.supabase.co').replace(/\/$/, '');
// Clave pública (publishable): la misma que usa el navegador en public/auth-gate.js.
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_n95hBZKrS8tOxICy8xd4HA_G_xebnDi';

// Una entrevista son varios pasos: se cuenta un uso al empezar y los pasos
// siguientes se permiten durante esta ventana.
export const VENTANA_ENTREVISTA_MS = 2 * 60 * 60 * 1000;

function headers(token, extra = {}) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, ...extra };
}

async function rest(path, token, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: headers(token, init.headers),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

// Middleware: exige sesión iniciada. Deja req.user y req.token.
export async function requireUser(req, res, next) {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, code: 'login', error: 'Iniciá sesión para usar esta herramienta.' });
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: headers(token), signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      return res.status(401).json({ success: false, code: 'login', error: 'Tu sesión venció. Volvé a iniciar sesión.' });
    }
    req.user = await r.json();
    req.token = token;
    next();
  } catch (err) {
    res.status(503).json({ success: false, error: 'No pudimos verificar tu sesión. Probá de nuevo en un momento.' });
  }
}

export async function getPlan(user, token) {
  const ahora = new Date().toISOString();
  const r = await rest(`pg_planes?select=plan,vence&user_id=eq.${user.id}`, token);
  const [row] = await r.json();
  if (!row || (row.vence && row.vence < ahora)) return null;
  return row.plan;
}

export async function contarUsos(user, token, herramienta, desdeIso) {
  const filtroFecha = desdeIso ? `&created_at=gte.${encodeURIComponent(desdeIso)}` : '';
  const r = await rest(
    `pg_uso?select=id&user_id=eq.${user.id}&herramienta=eq.${herramienta}${filtroFecha}`,
    token,
    { method: 'HEAD', headers: { Prefer: 'count=exact' } }
  );
  const range = r.headers.get('content-range') || '*/0';
  return Number(range.split('/')[1]) || 0;
}

export async function registrarUso(user, token, herramienta) {
  await rest('pg_uso', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: user.id, herramienta })
  });
}

// Comprueba el límite del plan. Si se puede usar, registra el uso.
export async function consumir(user, token, herramienta) {
  const [plan, usos] = await Promise.all([getPlan(user, token), contarUsos(user, token, herramienta)]);
  const decision = SaasCore.canUse(plan, herramienta, usos);
  if (decision.allowed) await registrarUso(user, token, herramienta);
  return decision;
}

// Responde 403 con el mensaje de límite, o 503 si Supabase no responde.
export function usageGuard(herramienta) {
  return async (req, res, next) => {
    try {
      const decision = await consumir(req.user, req.token, herramienta);
      if (!decision.allowed) {
        return res.status(403).json({ success: false, code: 'limite', error: decision.message, upgradeUrl: 'planes-saas.html' });
      }
      next();
    } catch (err) {
      console.error(`Error de límites (${herramienta}):`, err.message);
      res.status(503).json({ success: false, error: 'No pudimos verificar tu plan. Probá de nuevo en un momento.' });
    }
  };
}
