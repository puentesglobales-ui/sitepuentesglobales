// Simulador de entrevistas e idiomas con la API motor de Alex IO (simulada) y Supabase simulado.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { instalar } from './helpers/supabaseFalso.js';

process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.ALEXIO_ENGINE_URL = 'https://motor.test';
process.env.ALEXIO_ENGINE_KEY = 'clave-vieja';
process.env.ALEXIO_ENGINE_KEY_2 = 'clave-nueva';
process.env.ALEXIO_REF_SECRET = 'secreto-ref';
process.env.ALEXIO_PRODUCTOS = 'simulador';

const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';
const USUARIOS = {
    'token-ana': { id: ANA, email: 'ana@pg.test', email_confirmed_at: '2026-01-01' },
    'token-beto': { id: BETO, email: 'beto@pg.test', email_confirmed_at: '2026-01-01' }
};

/* ─── Alex IO simulado ────────────────────────────────────────────────── */
let motor;
function reiniciarMotor() {
    motor = { pedidos: [], sesiones: {}, turnos: {}, fallarProxima: null, claveValida: 'clave-nueva' };
}
async function alexio(u, init) {
    if (u.hostname !== 'motor.test') return null;
    const auth = init.headers?.Authorization;
    const body = init.body ? JSON.parse(init.body) : null;
    motor.pedidos.push({ metodo: init.method, path: u.pathname, auth, body });
    if (auth !== `Bearer ${motor.claveValida}`) return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    if (motor.fallarProxima) { const f = motor.fallarProxima; motor.fallarProxima = null; return Response.json({ code: f.code }, { status: f.status }); }
    const p = u.pathname.replace('/api/engine/v1', '');
    if (p === '/sessions') {
        const id = `sess_${Object.keys(motor.sesiones).length + 1}`;
        motor.sesiones[id] = { ...body, turnos: 0, terminada: false };
        return Response.json({ session_id: id, mensaje_inicial: 'Hola, soy tu entrevistador. Contame de vos.', expires_at: '2026-10-06T00:00:00Z' }, { status: 201 });
    }
    let m = p.match(/^\/sessions\/([^/]+)\/turns$/);
    if (m) {
        const s = motor.sesiones[m[1]];
        if (!s) return Response.json({ code: 'SESSION_NOT_FOUND' }, { status: 404 });
        if (motor.turnos[body.idempotency_key]) return Response.json(motor.turnos[body.idempotency_key]);
        s.turnos++;
        const r = { reply: `Pregunta ${s.turnos + 1}`, evaluacion_del_turno: { has_mistake: true, mistake_type: 'structure', corrected_text: 'Mejor así', explanation: 'Usá STAR.' }, terminada: s.turnos >= 3 };
        motor.turnos[body.idempotency_key] = r;
        return Response.json(r);
    }
    m = p.match(/^\/sessions\/([^/]+)\/end$/);
    if (m) {
        if (!motor.sesiones[m[1]]) return Response.json({ code: 'SESSION_NOT_FOUND' }, { status: 404 });
        return Response.json({ session_id: m[1], score: 72.4, rubrica: [{ criterio: 'Estructura', puntaje: 6, comentario: 'Faltó el resultado.' }], fortalezas: ['Ejemplos concretos'], a_mejorar: ['Cerrar con el resultado'], siguiente_paso: 'Probá dificultad alta.' });
    }
    m = p.match(/^\/students\/([^/]+)$/);
    if (m && init.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
}

let db;
function reiniciarDb() {
    db = {
        pg_sesiones_ia: [], pg_uso: [], pg_planes: [], pg_accesos: [], pg_auditoria: [],
        pg_perfiles: [{ user_id: ANA, puesto: 'enfermero/enfermera', paises: ['de'], experiencia_puesto: '3_5', resumen: 'Enfermera con 6 años en terapia intensiva.' }],
        pg_productos: [
            { codigo: 'simulador', nombre: 'Simulador', precio_base: 15, moneda: 'USD', periodo: 'mes', activo: true },
            { codigo: 'idiomas', nombre: 'Idiomas', precio_base: 19, moneda: 'USD', periodo: 'mes', activo: true },
            { codigo: 'ats', nombre: 'ATS', precio_base: 9, moneda: 'USD', periodo: 'mes', activo: true }
        ],
        pg_combos: [
            { id: 'c-pro', org_id: null, nombre: 'Plan Profesional', precio: 29, moneda: 'USD', periodo: 'mes', activo: true },
            { id: 'c-idiomas', org_id: null, nombre: 'Idiomas + ATS', precio: 25, moneda: 'USD', periodo: 'mes', activo: true }
        ],
        pg_combo_items: [
            { combo_id: 'c-pro', producto: 'simulador', cantidad: 1 }, { combo_id: 'c-pro', producto: 'ats', cantidad: 1 },
            { combo_id: 'c-idiomas', producto: 'idiomas', cantidad: 1 }, { combo_id: 'c-idiomas', producto: 'ats', cantidad: 1 }
        ],
        pg_org_pagos: [],
        [`/auth/v1/admin/users/${ANA}`]: []
    };
}
const desinstalar = instalar({ db: () => db, usuarios: USUARIOS, otros: alexio });

let server, base;
before(async () => {
    const { default: practica } = await import('../routes/practica.js');
    const { default: cuenta } = await import('../routes/cuenta.js');
    const app = express();
    app.use(express.json());
    app.use('/api/v1/practica', practica);
    app.use('/api/v1/cuenta', cuenta);
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => { server.close(); desinstalar(); });
beforeEach(() => { reiniciarDb(); reiniciarMotor(); });

async function llamar(path, token, body, method) {
    const res = await fetch(base + path, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}
const pedidosA = path => motor.pedidos.filter(p => p.path.endsWith(path) && p.auth === 'Bearer clave-nueva');

/* ─── Disponibilidad y catálogo ───────────────────────────────────────── */
test('solo los productos de ALEXIO_PRODUCTOS están disponibles; sin motor configurado, ninguno', async () => {
    const m = await import('../services/alexioMotor.js');
    assert.equal(m.productoDisponible('simulador'), true);
    assert.equal(m.productoDisponible('idiomas'), false);
    assert.equal(m.productoDisponible('ats'), true, 'los productos propios no dependen de Alex IO');
    const url = process.env.ALEXIO_ENGINE_URL;
    delete process.env.ALEXIO_ENGINE_URL;
    try { assert.equal(m.productoDisponible('simulador'), false); } finally { process.env.ALEXIO_ENGINE_URL = url; }
});

test('catálogo: idiomas y el combo que lo incluye salen como "Próximamente" y no se pueden comprar', async () => {
    const { limpiarCacheOrgs } = await import('../services/marcaBlanca.js');
    const { armarCompra } = await import('../services/pagos/ventas.js');
    limpiarCacheOrgs();
    const { configPublica } = await import('../services/marcaBlanca.js');
    const cfg = await configPublica(null);
    assert.equal(cfg.productos.find(p => p.codigo === 'idiomas').proximamente, true);
    assert.equal(cfg.productos.find(p => p.codigo === 'simulador').proximamente, false);
    assert.equal(cfg.combos.find(c => c.id === 'c-idiomas').proximamente, true);
    await assert.rejects(armarCompra(null, { tipo: 'producto', id: 'idiomas' }), /todavía no está disponible/);
    await assert.rejects(armarCompra(null, { tipo: 'combo', id: 'c-idiomas' }), /todavía no está disponible/);
    assert.equal((await armarCompra(null, { tipo: 'producto', id: 'simulador' })).monto, 15);
    limpiarCacheOrgs();
});

/* ─── Sesiones ────────────────────────────────────────────────────────── */
test('sin sesión: 401; producto desconocido: 404; idiomas todavía no disponible: 409', async () => {
    assert.equal((await llamar('/practica/simulador')).status, 401);
    assert.equal((await llamar('/practica/otra', 'token-ana')).status, 404);
    const r = await llamar('/practica/idiomas/sesiones', 'token-ana', { idioma_objetivo: 'de', nivel: 'A2' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'proximamente');
});

test('estado: precarga el puesto y el país desde el CV', async () => {
    const r = await llamar('/practica/simulador', 'token-ana');
    assert.equal(r.body.disponible, true);
    assert.equal(r.body.sugerido.puesto, 'enfermero/enfermera');
    assert.deepEqual(r.body.sugerido.paises, ['de']);
});

test('empezar: Alex IO recibe un seudónimo y el contexto, nunca el email ni el id real', async () => {
    const r = await llamar('/practica/simulador/sesiones', 'token-ana', { pais_destino: 'Alemania', idioma_entrevista: 'de', tipo_entrevista: 'tecnica', dificultad: 'hard' });
    assert.equal(r.status, 201);
    assert.equal(r.body.sesion.mensajes[0].texto, 'Hola, soy tu entrevistador. Contame de vos.');
    const [pedido] = pedidosA('/sessions');
    assert.equal(pedido.body.product, 'coach');
    assert.equal(pedido.body.student_ref, crypto.createHmac('sha256', 'secreto-ref').update(ANA).digest('hex'));
    assert.deepEqual(pedido.body.context, {
        puesto: 'enfermero/enfermera', pais_destino: 'Alemania', idioma_entrevista: 'de', anios_experiencia: 4,
        tipo_entrevista: 'tecnica', dificultad: 'hard', resumen_cv: 'Enfermera con 6 años en terapia intensiva.'
    });
    const json = JSON.stringify(motor.pedidos);
    assert.ok(!json.includes('ana@pg.test') && !json.includes(ANA), 'no viaja el email ni el id');
    assert.equal(db.pg_uso.length, 1, 'se descuenta el uso gratis');
});

test('rotación de claves: si la clave principal ya no vale, usa la segunda', async () => {
    await llamar('/practica/simulador/sesiones', 'token-ana', {});
    assert.equal(motor.pedidos[0].auth, 'Bearer clave-vieja');
    assert.equal(motor.pedidos[1].auth, 'Bearer clave-nueva');
});

test('si Alex IO falla al crear la sesión, no se gasta el uso gratis', async () => {
    motor.fallarProxima = { status: 503, code: 'NO_AI_PROVIDER_AVAILABLE' };
    motor.claveValida = 'clave-vieja';
    const r = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    assert.equal(r.status, 503);
    assert.match(r.body.error, /no está disponible/);
    assert.equal(db.pg_uso.length, 0);
    assert.equal(db.pg_sesiones_ia.length, 0);
});

test('cuenta gratis: una sesión; la segunda pide comprar', async () => {
    assert.equal((await llamar('/practica/simulador/sesiones', 'token-beto', { puesto: 'Chofer' })).status, 201);
    const r = await llamar('/practica/simulador/sesiones', 'token-beto', { puesto: 'Chofer' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'limite');
    db.pg_accesos.push({ user_id: BETO, producto: 'simulador', vence: null });
    assert.equal((await llamar('/practica/simulador/sesiones', 'token-beto', { puesto: 'Chofer' })).status, 201, 'con la compra no hay límite');
});

test('sin puesto ni CV no se puede empezar', async () => {
    const r = await llamar('/practica/simulador/sesiones', 'token-beto', {});
    assert.equal(r.status, 400);
});

test('turnos: se guarda la conversación y un reintento con la misma clave no duplica', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    const id = body.sesion.id;
    const t1 = await llamar(`/practica/simulador/sesiones/${id}/turnos`, 'token-ana', { mensaje: 'Trabajé 6 años en terapia intensiva.', clave: 'clave-0001' });
    assert.equal(t1.status, 200);
    assert.equal(t1.body.respuesta, 'Pregunta 2');
    assert.equal(t1.body.evaluacion.corrected_text, 'Mejor así');
    const repetido = await llamar(`/practica/simulador/sesiones/${id}/turnos`, 'token-ana', { mensaje: 'Trabajé 6 años en terapia intensiva.', clave: 'clave-0001' });
    assert.equal(repetido.body.respuesta, 'Pregunta 2');
    assert.equal(pedidosA('/turns').length, 1, 'el reintento no vuelve a llamar a Alex IO');
    const fila = db.pg_sesiones_ia[0];
    assert.equal(fila.mensajes.length, 3);
    assert.equal(fila.turnos, 1);
    assert.equal(pedidosA('/turns')[0].body.idempotency_key, `${id}:clave-0001`);
    // Otra persona no puede usar la sesión.
    assert.equal((await llamar(`/practica/simulador/sesiones/${id}/turnos`, 'token-beto', { mensaje: 'hola', clave: 'clave-0002' })).status, 404);
});

test('al llegar al tope, el turno avisa que terminó', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    let r;
    for (let i = 1; i <= 3; i++) r = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: `respuesta ${i}`, clave: `clave-000${i}` });
    assert.equal(r.body.terminada, true);
});

test('terminar: se guarda el resultado y el puntaje; repetir no vuelve a llamar a Alex IO', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    const fin = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/fin`, 'token-ana', {});
    assert.equal(fin.status, 200);
    assert.equal(fin.body.sesion.puntaje, 72);
    assert.equal(fin.body.sesion.resultado.fortalezas[0], 'Ejemplos concretos');
    await llamar(`/practica/simulador/sesiones/${body.sesion.id}/fin`, 'token-ana', {});
    assert.equal(pedidosA('/end').length, 1);
    const estado = await llamar('/practica/simulador', 'token-ana');
    assert.equal(estado.body.activa, null);
    assert.equal(estado.body.historial[0].puntaje, 72);
    assert.equal((await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: 'otra', clave: 'clave-0009' })).status, 409);
});

test('si la sesión venció en Alex IO, queda marcada como vencida', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    delete motor.sesiones[db.pg_sesiones_ia[0].session_id];
    const r = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: 'hola', clave: 'clave-0001' });
    assert.equal(r.status, 410);
    await new Promise(res => setTimeout(res, 20));
    assert.equal(db.pg_sesiones_ia[0].estado, 'vencida');
});

test('borrar la cuenta borra también los datos en Alex IO', async () => {
    const r = await llamar('/cuenta', 'token-ana', null, 'DELETE');
    assert.equal(r.status, 200);
    const borrado = motor.pedidos.find(p => p.metodo === 'DELETE' && p.auth === 'Bearer clave-nueva');
    assert.equal(borrado.path, `/api/engine/v1/students/${crypto.createHmac('sha256', 'secreto-ref').update(ANA).digest('hex')}`);
});
