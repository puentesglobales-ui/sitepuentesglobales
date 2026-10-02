/**
 * Acceso de servidor a Supabase con la clave SECRETA (variable SUPABASE_SECRET_KEY).
 * Saltea las políticas RLS: usarlo solo desde rutas protegidas (administradores o el
 * propio usuario sobre sus datos). La clave nunca se manda al navegador.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mceiutonddbgddrrrajv.supabase.co').replace(/\/$/, '');

export function adminDisponible() {
  return Boolean((process.env.SUPABASE_SECRET_KEY || '').trim());
}

function headers(extra = {}) {
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  // Las claves nuevas (sb_secret_…) van solo en "apikey"; las viejas (JWT service_role) también como Bearer.
  return { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...extra };
}

async function pedir(path, init = {}) {
  if (!adminDisponible()) throw new Error('Falta configurar SUPABASE_SECRET_KEY en el servidor.');
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: headers(init.headers), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function seleccionar(tabla, query) {
  return (await pedir(`/rest/v1/${tabla}?${query}`)).json();
}

export async function insertar(tabla, filas, { devolver = false } = {}) {
  const res = await pedir(`/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: devolver ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(filas)
  });
  return devolver ? res.json() : null;
}

// Inserta o reemplaza según la clave indicada (p. ej. 'org_id,producto').
export async function upsert(tabla, filas, conflicto) {
  await pedir(`/rest/v1/${tabla}?on_conflict=${encodeURIComponent(conflicto)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas)
  });
}

// filtro en formato PostgREST, p. ej. 'id=eq.123'. Nunca vacío: evita tocar toda la tabla.
export async function actualizar(tabla, filtro, cambios, { devolver = false } = {}) {
  if (!filtro) throw new Error('actualizar sin filtro');
  const res = await pedir(`/rest/v1/${tabla}?${filtro}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: devolver ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(cambios)
  });
  return devolver ? res.json() : null;
}

export async function borrar(tabla, filtro) {
  if (!filtro) throw new Error('borrar sin filtro');
  await pedir(`/rest/v1/${tabla}?${filtro}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// Borra el usuario de Supabase Auth. Sus filas en pg_* se borran en cascada (on delete cascade).
export async function borrarUsuario(userId) {
  await pedir(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export async function auditar(adminEmail, accion, candidatoId = null, detalle = null) {
  try {
    await insertar('pg_auditoria', [{ admin_email: adminEmail, accion, candidato_id: candidatoId, detalle }]);
  } catch (err) {
    console.error('No se pudo registrar la auditoría:', err.message);
  }
}
