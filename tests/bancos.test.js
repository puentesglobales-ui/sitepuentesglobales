import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { instalar } from './helpers/supabaseFalso.js';
import { BANCO_CI } from '../services/bancoCI.js';
import { BANCO_RAZONAMIENTO } from '../services/bancoRazonamiento.js';

process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
const ANA = '11111111-1111-4111-8111-111111111111';
const USUARIOS = { token: { id: ANA, email: 'ana@pg.test', email_confirmed_at: '2026-01-01' } };
let db = {};
const desinstalar = instalar({ db: () => db, usuarios: USUARIOS });
let server, base;
before(async () => {
  const { default: rutas } = await import('../routes/tests.js');
  const app = express(); app.use(express.json()); app.use('/api/v1/tests', rutas);
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/v1/tests`;
});
after(() => { server.close(); desinstalar(); });
function reiniciar() { db = { pg_intentos_test: [], pg_resultados_test: [] }; }
async function llamar(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
}
function validaBanco(banco) {
  const ids = new Set();
  for (const q of banco) {
    assert.ok(!ids.has(q.id), `id repetido ${q.id}`); ids.add(q.id);
    assert.ok(q.opciones.length >= 2);
    assert.equal(new Set(q.opciones).size, q.opciones.length, `opciones repetidas en ${q.id}`);
    assert.equal(q.opciones.filter(o => o === q.correcta).length, 1, `respuesta ambigua en ${q.id}`);
  }
}
test('las rutas nuevas exigen sesión autenticada', async () => {
  reiniciar();
  const r = await fetch(base + '/ci/iniciar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 401);
});
test('cada banco tiene una sola respuesta correcta y opciones sin repetir', () => { validaBanco(BANCO_CI); validaBanco(BANCO_RAZONAMIENTO); });
test('dos intentos de la misma persona reciben órdenes distintos y sin respuestas correctas', async () => {
  reiniciar();
  const a = await llamar('/ci/iniciar'); const b = await llamar('/ci/iniciar');
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.notDeepEqual(a.body.preguntas.map(q => q.opciones), b.body.preguntas.map(q => q.opciones));
  assert.doesNotMatch(JSON.stringify(a.body), /"correcta"/);
  assert.doesNotMatch(JSON.stringify(a.body), /ci_estimado/);
});
test('la corrección usa el orden mostrado y un intento no se entrega dos veces', async () => {
  reiniciar();
  const ini = await llamar('/razonamiento/iniciar');
  const todas = Object.fromEntries(ini.body.preguntas.map(q => [q.id, q.opciones.indexOf(BANCO_RAZONAMIENTO.find(x => x.id === q.id).correcta)]));
  const entrega = await llamar('/razonamiento/entregar', { intento_id: ini.body.intento_id, respuestas: todas });
  assert.equal(entrega.status, 200); assert.equal(entrega.body.puntaje, 15);
  assert.equal(db.pg_resultados_test.length, 1);
  const otra = await llamar('/razonamiento/entregar', { intento_id: ini.body.intento_id, respuestas: todas });
  assert.equal(otra.status, 409);
});
test('la corrección no acepta un intento de otra persona', async () => {
  reiniciar();
  const ini = await llamar('/ci/iniciar');
  const r = await fetch(base + '/ci/entregar', { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer token'}, body:JSON.stringify({ intento_id:'00000000-0000-4000-8000-000000000000', respuestas:{} }) });
  assert.equal(r.status, 404); assert.ok(ini.body.intento_id);
});
