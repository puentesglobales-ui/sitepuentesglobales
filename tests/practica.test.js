// Simulador de entrevistas e idiomas con la API motor de Alex IO (simulada) y Supabase simulado.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { instalar } from './helpers/supabaseFalso.js';

process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
process.env.ALEXIO_ENGINE_URL = 'https://motor.test/api/engine/'; // con /api/engine al final también vale
process.env.ALEXIO_ENGINE_KEY = 'clave-vieja';
process.env.ALEXIO_ENGINE_KEY_2 = 'clave-nueva';
process.env.ALEXIO_REF_SECRET = 'secreto-ref';
process.env.ALEXIO_PRODUCTOS = 'simulador';
process.env.ADMIN_EMAILS = 'admin@pg.test';

const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';
const USUARIOS = {
    'token-ana': { id: ANA, email: 'ana@pg.test', email_confirmed_at: '2026-01-01' },
    'token-beto': { id: BETO, email: 'beto@pg.test', email_confirmed_at: '2026-01-01' },
    'token-admin': { id: '33333333-3333-4333-8333-333333333333', email: 'admin@pg.test', email_confirmed_at: '2026-01-01' }
};

/* ─── Alex IO simulado (contrato real del 2026-10-04) ──────────────────── */
let motor;
function reiniciarMotor() {
    motor = { pedidos: [], sesiones: {}, turnos: {}, fallarProxima: null, claveValida: 'clave-nueva' };
}
const error = (status, code) => Response.json({ error: 'mensaje', code }, { status });
const FINAL = {
    contenido_relevancia: { score: 8, comment: 'Ejemplos concretos.' }, estructura_star: { score: 6, comment: 'Faltó el resultado.' },
    comunicacion_claridad: { score: 7, comment: 'Clara.' }, manejo_objeciones: { score: 7, comment: 'Bien.' }, overall_comment: 'Buena entrevista.'
};

async function alexio(u, init) {
    if (u.hostname !== 'motor.test') return null;
    const auth = init.headers?.Authorization;
    const body = init.body ? JSON.parse(init.body) : null;
    motor.pedidos.push({ metodo: init.method || 'GET', path: u.pathname, auth, body });
    if (auth !== `Bearer ${motor.claveValida}`) return error(401, 'UNAUTHORIZED');
    if (motor.fallarProxima) { const f = motor.fallarProxima; motor.fallarProxima = null; return error(f.status, f.code); }
    const p = u.pathname.replace('/api/engine', '');
    if (p === '/catalog') {
        return Response.json({
            coach: [{ track: 'entrevista_laboral_general', rounds: 3, difficulty_tiers: ['easy', 'medium', 'hard'] }],
            tutor: [{ language: 'en', lessons: 3, cefr_levels: ['A1', 'A2', 'B1'] }]
        });
    }
    if (p === '/sessions') {
        const id = `sess_${Object.keys(motor.sesiones).length + 1}`;
        motor.sesiones[id] = { ...body, terminada: false };
        return Response.json({ session_id: id, mensaje_inicial: 'Hola, soy tu entrevistador. Contame de vos.', expires_at: '2026-10-06T00:00:00Z' }, { status: 201 });
    }
    let m = p.match(/^\/sessions\/([^/]+)\/turns$/);
    if (m) {
        const s = motor.sesiones[m[1]];
        if (!s) return error(404, 'SESSION_NOT_FOUND');
        if (s.terminada) return error(410, 'SESSION_ENDED');
        if (motor.turnos[body.idempotency_key]) return Response.json({ ...motor.turnos[body.idempotency_key], idempotent_replay: true });
        const r = {
            reply: 'Contame más.',
            evaluacion_del_turno: { mistake: { mistake_type: 'structure', corrected_text: 'Mejor así', explanation: 'Usá STAR.' }, advanced: true, next_item_title: 'Fortalezas y debilidades', next_level: 'medium' },
            idempotent_replay: false
        };
        motor.turnos[body.idempotency_key] = r;
        return Response.json(r);
    }
    m = p.match(/^\/sessions\/([^/]+)\/end$/);
    if (m) {
        const s = motor.sesiones[m[1]];
        if (!s) return error(404, 'SESSION_NOT_FOUND');
        const ya = s.terminada;
        s.terminada = true;
        return Response.json({ session_id: m[1], status: 'ended', final_evaluation: FINAL, already_ended: ya });
    }
    return error(404, 'NOT_FOUND');
}

let db;
function reiniciarDb() {
    db = {
        pg_sesiones_ia: [], pg_uso: [], pg_planes: [], pg_accesos: [], pg_auditoria: [],
        pg_perfiles: [{ user_id: ANA, puesto: 'enfermero/enfermera', paises: ['de'] }],
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
beforeEach(async () => {
    reiniciarDb();
    reiniciarMotor();
    (await import('../services/alexioMotor.js')).limpiarCacheCatalogo();
});

async function llamar(path, token, body, method) {
    const res = await fetch(base + path, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}
const pedidosA = path => motor.pedidos.filter(p => p.path.endsWith(path) && p.auth === 'Bearer clave-nueva');
const REF_ANA = crypto.createHmac('sha256', 'secreto-ref').update(ANA).digest('hex');

/* ─── Disponibilidad, catálogo y conversiones ─────────────────────────── */
test('solo los productos de ALEXIO_PRODUCTOS están disponibles; sin motor configurado, ninguno', async () => {
    const m = await import('../services/alexioMotor.js');
    assert.equal(m.productoDisponible('simulador'), true);
    assert.equal(m.productoDisponible('idiomas'), false);
    assert.equal(m.productoDisponible('ats'), true, 'los productos propios no dependen de Alex IO');
    const url = process.env.ALEXIO_ENGINE_URL;
    delete process.env.ALEXIO_ENGINE_URL;
    try { assert.equal(m.productoDisponible('simulador'), false); } finally { process.env.ALEXIO_ENGINE_URL = url; }
});

test('catálogo de venta: idiomas y el combo que lo incluye salen como "Próximamente" y no se pueden comprar', async () => {
    const { limpiarCacheOrgs, configPublica } = await import('../services/marcaBlanca.js');
    const { armarCompra } = await import('../services/pagos/ventas.js');
    limpiarCacheOrgs();
    const cfg = await configPublica(null);
    assert.equal(cfg.productos.find(p => p.codigo === 'idiomas').proximamente, true);
    assert.equal(cfg.productos.find(p => p.codigo === 'simulador').proximamente, false);
    assert.equal(cfg.combos.find(c => c.id === 'c-idiomas').proximamente, true);
    await assert.rejects(armarCompra(null, { tipo: 'producto', id: 'idiomas' }), /todavía no está disponible/);
    await assert.rejects(armarCompra(null, { tipo: 'combo', id: 'c-idiomas' }), /todavía no está disponible/);
    assert.equal((await armarCompra(null, { tipo: 'producto', id: 'simulador' })).monto, 15);
    limpiarCacheOrgs();
});

test('rúbrica de Alex IO → criterios con nombre, comentario general y puntaje de 0 a 100', async () => {
    const { normalizarResultado, normalizarEvaluacion } = await import('../services/alexioMotor.js');
    const r = normalizarResultado(FINAL);
    assert.equal(r.puntaje, 70);
    assert.deepEqual(r.rubrica.map(c => c.criterio), ['Contenido y relevancia', 'Estructura (STAR)', 'Comunicación y claridad', 'Manejo de preguntas difíciles']);
    assert.equal(r.comentario_general, 'Buena entrevista.');
    assert.equal(normalizarResultado({ vocabulario: { score: 9 }, gramatica: { score: 5 } }).rubrica[1].criterio, 'Gramática');
    assert.equal(normalizarResultado(null).puntaje, null);
    assert.equal(normalizarEvaluacion(null), null);
    assert.deepEqual(normalizarEvaluacion({ mistake: null, advanced: false }), { has_mistake: false, mistake_type: null, corrected_text: null, explanation: null, avanzo: false, siguiente: null, nivel: null });
});

/* ─── Sesiones ────────────────────────────────────────────────────────── */
test('sin sesión: 401; producto desconocido: 404; idiomas todavía no disponible: 409', async () => {
    assert.equal((await llamar('/practica/simulador')).status, 401);
    assert.equal((await llamar('/practica/otra', 'token-ana')).status, 404);
    const r = await llamar('/practica/idiomas/sesiones', 'token-ana', { idioma_objetivo: 'en' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'proximamente');
});

test('estado: opciones del catálogo de Alex IO y puesto precargado desde el CV', async () => {
    const r = await llamar('/practica/simulador', 'token-ana');
    assert.equal(r.body.disponible, true);
    assert.deepEqual(r.body.opciones, [{ track: 'entrevista_laboral_general', rondas: 3 }]);
    assert.equal(r.body.sugerido.puesto, 'enfermero/enfermera');
});

test('empezar: Alex IO recibe solo track y role con un seudónimo; nunca el email ni el id real', async () => {
    const r = await llamar('/practica/simulador/sesiones', 'token-ana', { pais_destino: 'Alemania' });
    assert.equal(r.status, 201);
    assert.equal(r.body.sesion.mensajes[0].texto, 'Hola, soy tu entrevistador. Contame de vos.');
    assert.equal(r.body.sesion.max_turnos, 40);
    const [pedido] = pedidosA('/sessions');
    assert.equal(pedido.path, '/api/engine/sessions');
    assert.equal(pedido.body.product, 'coach');
    assert.equal(pedido.body.student_ref, REF_ANA);
    assert.deepEqual(pedido.body.context, { track: 'entrevista_laboral_general', role: 'enfermero/enfermera' });
    assert.deepEqual(db.pg_sesiones_ia[0].contexto, { puesto: 'enfermero/enfermera', pais_destino: 'Alemania', track: 'entrevista_laboral_general' });
    const json = JSON.stringify(motor.pedidos);
    assert.ok(!json.includes('ana@pg.test') && !json.includes(ANA), 'no viaja el email ni el id');
    assert.equal(db.pg_uso.length, 1, 'se descuenta el uso gratis');
});

test('rotación de claves: si la clave principal ya no vale, usa la segunda', async () => {
    await llamar('/practica/simulador/sesiones', 'token-ana', {});
    const sesiones = motor.pedidos.filter(p => p.path.endsWith('/sessions'));
    assert.deepEqual(sesiones.map(p => p.auth), ['Bearer clave-vieja', 'Bearer clave-nueva']);
});

test('si Alex IO falla al crear la sesión, no se gasta el uso gratis', async () => {
    motor.claveValida = 'clave-vieja';
    await llamar('/practica/simulador', 'token-ana'); // carga el catálogo
    motor.fallarProxima = { status: 500, code: 'INTERNAL_ERROR' };
    const r = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    // El catálogo quedó en caché; crear sesión no se reintenta, así que falla.
    assert.equal(r.status, 503);
    assert.equal(db.pg_uso.length, 0);
    assert.equal(db.pg_sesiones_ia.length, 0);
});

test('sin contenido cargado en Alex IO, avisa en lugar de crear la sesión', async () => {
    motor.claveValida = 'clave-vieja';
    await llamar('/practica/simulador', 'token-ana');
    motor.fallarProxima = { status: 409, code: 'NO_CONTENT_FOR_CONTEXT' };
    const r = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    assert.equal(r.status, 409);
    assert.match(r.body.error, /no hay contenido/);
    assert.equal(db.pg_uso.length, 0);
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
    assert.equal((await llamar('/practica/simulador/sesiones', 'token-beto', {})).status, 400);
});

test('turnos: manda "text", guarda la corrección y el avance, y un reintento con la misma clave no duplica', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    const id = body.sesion.id;
    const t1 = await llamar(`/practica/simulador/sesiones/${id}/turnos`, 'token-ana', { mensaje: 'Trabajé 6 años en terapia intensiva.', clave: 'clave-0001' });
    assert.equal(t1.status, 200);
    assert.equal(t1.body.respuesta, 'Contame más.');
    assert.equal(t1.body.evaluacion.has_mistake, true);
    assert.equal(t1.body.evaluacion.corrected_text, 'Mejor así');
    assert.equal(t1.body.evaluacion.avanzo, true);
    assert.equal(t1.body.evaluacion.siguiente, 'Fortalezas y debilidades');
    assert.equal(pedidosA('/turns')[0].body.text, 'Trabajé 6 años en terapia intensiva.');
    assert.equal(pedidosA('/turns')[0].body.idempotency_key, `${id}:clave-0001`);
    const repetido = await llamar(`/practica/simulador/sesiones/${id}/turnos`, 'token-ana', { mensaje: 'Trabajé 6 años en terapia intensiva.', clave: 'clave-0001' });
    assert.equal(repetido.body.respuesta, 'Contame más.');
    assert.equal(pedidosA('/turns').length, 1, 'el reintento no vuelve a llamar a Alex IO');
    assert.equal(db.pg_sesiones_ia[0].mensajes.length, 3);
    assert.equal(db.pg_sesiones_ia[0].turnos, 1);
    // Otra persona no puede usar la sesión.
    assert.equal((await llamar(`/practica/simulador/sesiones/${id}/turnos`, 'token-beto', { mensaje: 'hola', clave: 'clave-0002' })).status, 404);
});

test('tope de 40 respuestas por sesión (lo aplica Puentes Globales)', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    db.pg_sesiones_ia[0].turnos = 39;
    const ultimo = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: 'última', clave: 'clave-0040' });
    assert.equal(ultimo.body.terminada, true);
    const otro = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: 'una más', clave: 'clave-0041' });
    assert.equal(otro.status, 409);
    assert.equal(otro.body.code, 'tope');
    assert.equal(pedidosA('/turns').length, 1);
});

test('terminar: se guarda la rúbrica y el puntaje; repetir no vuelve a llamar a Alex IO', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    const fin = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/fin`, 'token-ana', {});
    assert.equal(fin.status, 200);
    assert.equal(fin.body.sesion.puntaje, 70);
    assert.equal(fin.body.sesion.resultado.rubrica.length, 4);
    assert.equal(fin.body.sesion.resultado.comentario_general, 'Buena entrevista.');
    await llamar(`/practica/simulador/sesiones/${body.sesion.id}/fin`, 'token-ana', {});
    assert.equal(pedidosA('/end').length, 1);
    const estado = await llamar('/practica/simulador', 'token-ana');
    assert.equal(estado.body.activa, null);
    assert.equal(estado.body.historial[0].puntaje, 70);
    assert.equal((await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: 'otra', clave: 'clave-0009' })).status, 409);
});

test('sesión vencida en Alex IO (24 h): queda marcada como vencida', async () => {
    const { body } = await llamar('/practica/simulador/sesiones', 'token-ana', {});
    motor.fallarProxima = { status: 410, code: 'SESSION_EXPIRED' };
    const r = await llamar(`/practica/simulador/sesiones/${body.sesion.id}/turnos`, 'token-ana', { mensaje: 'hola', clave: 'clave-0001' });
    assert.equal(r.status, 410);
    assert.equal(r.body.code, 'vencida');
    await new Promise(res => setTimeout(res, 20));
    assert.equal(db.pg_sesiones_ia[0].estado, 'vencida');
});

test('borrar la cuenta pide el borrado en Alex IO; si Alex IO no lo tiene, queda pendiente en la auditoría', async () => {
    const r = await llamar('/cuenta', 'token-ana', null, 'DELETE');
    assert.equal(r.status, 200);
    const borrado = motor.pedidos.find(p => p.metodo === 'DELETE' && p.auth === 'Bearer clave-nueva');
    assert.equal(borrado.path, `/api/engine/students/${REF_ANA}`);
    assert.ok(db.pg_auditoria.some(a => a.accion === 'alexio_borrado_pendiente' && a.candidato_id === ANA));
});

test('modo prueba: un admin usa idiomas con la venta cerrada y sin gastar usos; el resto no', async () => {
    const estado = await llamar('/practica/idiomas', 'token-admin');
    assert.equal(estado.body.disponible, true);
    assert.equal(estado.body.modo_prueba, true);
    assert.deepEqual(estado.body.opciones, [{ idioma: 'en', lecciones: 3, niveles: ['A1', 'A2', 'B1'] }]);
    for (let i = 0; i < 2; i++) assert.equal((await llamar('/practica/idiomas/sesiones', 'token-admin', { idioma_objetivo: 'en' })).status, 201);
    assert.deepEqual(pedidosA('/sessions')[0].body.context, { language: 'en' });
    assert.equal(db.pg_uso.length, 0, 'las pruebas del admin no cuentan como uso');
    assert.equal((await llamar('/practica/idiomas', 'token-ana')).body.disponible, false);
    assert.equal((await llamar('/practica/idiomas/sesiones', 'token-ana', { idioma_objetivo: 'en' })).status, 409);
});
