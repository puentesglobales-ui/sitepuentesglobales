// Supabase falso en memoria para tests: autenticación por token y un PostgREST mínimo
// (filtros eq, is, in, gt, or; order; Prefer return=representation; upsert).
import crypto from 'node:crypto';

function cumple(f, k, expr) {
  const [op, ...resto] = expr.split('.');
  const val = decodeURIComponent(resto.join('.'));
  if (op === 'eq') return String(f[k]) === val;
  if (op === 'is' && val === 'null') return f[k] === null || f[k] === undefined;
  if (op === 'is' && val === 'true') return f[k] === true;
  if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(f[k]));
  if (op === 'gt') return f[k] !== null && f[k] !== undefined && String(f[k]) > val;
  return true;
}

export function filtrar(filas, params) {
  return filas.filter(f => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (k === 'or') {
        const condiciones = decodeURIComponent(v).replace(/^\(|\)$/g, '').split(',');
        if (!condiciones.some(c => { const [campo, ...r] = c.split('.'); return cumple(f, campo, r.join('.')); })) return false;
        continue;
      }
      if (!cumple(f, k, v)) return false;
    }
    return true;
  });
}

export function instalar({ db, usuarios, otros = async () => null }) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (!u.hostname.endsWith('supabase.co')) {
      const r = await otros(u, init);
      return r || realFetch(url, init);
    }
    if (u.pathname === '/auth/v1/user') {
      const t = (init.headers?.Authorization || '').replace('Bearer ', '');
      return usuarios[t] ? Response.json(usuarios[t]) : new Response('{}', { status: 401 });
    }
    const tabla = u.pathname.replace('/rest/v1/', '');
    const filas = db()[tabla];
    if (!filas) return new Response('{"message":"tabla desconocida"}', { status: 404 });
    const params = [...u.searchParams.entries()];
    const metodo = init.method || 'GET';
    const prefer = init.headers?.Prefer || '';
    if (metodo === 'GET' || metodo === 'HEAD') {
      let r = filtrar(filas, params).map(f => ({ ...f }));
      if ((u.searchParams.get('select') || '').includes('items:pg_combo_items')) {
        r = r.map(c => ({ ...c, items: db().pg_combo_items.filter(i => i.combo_id === c.id).map(({ producto, cantidad }) => ({ producto, cantidad })) }));
      }
      const orden = u.searchParams.get('order');
      if (orden) {
        const [campo, dir] = orden.split('.');
        r.sort((a, b) => (String(a[campo]) > String(b[campo]) ? 1 : -1) * (dir === 'desc' ? -1 : 1));
      }
      const limit = Number(u.searchParams.get('limit')) || r.length;
      // Como PostgREST con Prefer: count=exact, el total va en content-range.
      const conteo = { 'content-type': 'application/json', 'content-range': `*/${r.length}` };
      if (metodo === 'HEAD') return new Response(null, { status: 200, headers: conteo });
      return new Response(JSON.stringify(r.slice(0, limit)), { status: 200, headers: conteo });
    }
    if (metodo === 'POST') {
      const nuevas = [JSON.parse(init.body)].flat().map(f => ({ id: f.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...f }));
      const conflicto = u.searchParams.get('on_conflict');
      for (const n of nuevas) {
        const i = conflicto ? filas.findIndex(f => conflicto.split(',').every(c => f[c] === n[c])) : -1;
        if (i >= 0) filas[i] = { ...filas[i], ...n }; else filas.push(n);
      }
      return prefer.includes('representation') ? Response.json(nuevas) : new Response(null, { status: 201 });
    }
    if (metodo === 'PATCH') {
      const cambiadas = filtrar(filas, params);
      for (const f of cambiadas) Object.assign(f, JSON.parse(init.body));
      return prefer.includes('representation') ? Response.json(cambiadas.map(f => ({ ...f }))) : new Response(null, { status: 204 });
    }
    if (metodo === 'DELETE') {
      const borrar = new Set(filtrar(filas, params));
      db()[tabla] = filas.filter(f => !borrar.has(f));
      if (tabla === 'pg_combos') db().pg_combo_items = db().pg_combo_items.filter(i => ![...borrar].some(c => c.id === i.combo_id));
      return new Response(null, { status: 204 });
    }
    return new Response('metodo', { status: 405 });
  };
  return () => { globalThis.fetch = realFetch; };
}
