// Valida que los tests de /public carguen sin errores y que sus respuestas sean coherentes.
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PsychometricEngine, PSYCHOMETRIC_QUESTIONS } from '../services/psychometricEngine.js';
import { BANCO_CI, MATRICES, estimarCI, NORMA_CI, cellSVG, ARROW, LINES } from '../services/bancoCI.js';
import { BANCO_RAZONAMIENTO } from '../services/bancoRazonamiento.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TEST_PAGES = ['test-razonamiento', 'test-numerico', 'test-idiomas', 'test-personalidad', 'test-psicometrico', 'test-ci'];

function inlineScripts(html) {
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

// DOM falso: cualquier propiedad o llamada devuelve otro nodo falso.
function fakeNode() {
    const target = function () {};
    return new Proxy(target, {
        get: (_t, prop) => {
            if (prop === Symbol.toPrimitive) return () => '';
            if (prop === 'length') return 0;
            if (prop === Symbol.iterator) return function* () {};
            return fakeNode();
        },
        set: () => true,
        apply: () => fakeNode()
    });
}

// Ejecuta los scripts de la página en un contexto aislado y devuelve ese contexto.
function loadPage(name) {
    const html = fs.readFileSync(path.join(PUBLIC, `${name}.html`), 'utf8');
    const ctx = vm.createContext({
        document: fakeNode(),
        window: { scrollTo() {}, location: {} },
        location: { origin: 'https://sitio.test' },
        PG_AUTH: { requireAuth: async () => ({}), saveResult: async () => {} },
        setTimeout: () => 0, setInterval: () => 0, clearInterval() {},
        requestAnimationFrame() {}, console, Math, JSON, Date
    });
    for (const code of inlineScripts(html)) vm.runInContext(code, ctx, { filename: `${name}.html` });
    return ctx;
}

const get = (ctx, expr) => vm.runInContext(expr, ctx);

for (const page of TEST_PAGES) {
    test(`${page}: los scripts no tienen errores de sintaxis`, () => {
        const html = fs.readFileSync(path.join(PUBLIC, `${page}.html`), 'utf8');
        for (const code of inlineScripts(html)) assert.doesNotThrow(() => new vm.Script(code));
    });

    test(`${page}: exige registro (carga auth-gate y llama requireAuth)`, () => {
        const html = fs.readFileSync(path.join(PUBLIC, `${page}.html`), 'utf8');
        assert.match(html, /<script src="auth-gate\.js"><\/script>/);
        assert.match(html, /PG_AUTH\.requireAuth\(\)/);
    });
}

function checkMultipleChoice(preguntas) {
    const ids = new Set();
    for (const q of preguntas) {
        assert.ok(!ids.has(q.id), `id duplicado ${q.id}`);
        ids.add(q.id);
        assert.equal(new Set(q.opciones).size, q.opciones.length, `opciones repetidas en ${q.id}`);
        assert.ok(q.opciones.includes(q.correcta), `la respuesta de ${q.id} no está entre las opciones`);
        assert.ok(q.explicacion && q.explicacion.length > 10, `falta explicación en ${q.id}`);
    }
}

test('razonamiento: banco server-side con 30 preguntas válidas', () => {
    assert.equal(BANCO_RAZONAMIENTO.length, 30);
    checkMultipleChoice(BANCO_RAZONAMIENTO);
    assert.ok(BANCO_RAZONAMIENTO.some(q => q.svg), 'el banco conserva los gráficos');
});
test('CI: banco server-side con 40 preguntas y 4 áreas', () => {
    assert.equal(BANCO_CI.length, 40);
    const areas = new Set(BANCO_CI.map(q => q.bloque));
    assert.deepEqual(areas, new Set(['Matrices', 'Series', 'Verbal', 'Lógica']));
    const texto = BANCO_CI.filter(q => q.tipo === 'texto');
    checkMultipleChoice(texto);
    assert.equal(MATRICES.length, 8);
    for (const q of MATRICES) { assert.match(q.svg, /<svg/); assert.equal(new Set(q.opciones).size, q.opciones.length); }
});
test('CI: las páginas no incluyen preguntas ni respuestas correctas', () => {
    const ci = fs.readFileSync(path.join(PUBLIC, 'test-ci.html'), 'utf8');
    const razonamiento = fs.readFileSync(path.join(PUBLIC, 'test-razonamiento.html'), 'utf8');
    assert.doesNotMatch(ci, /const PREGUNTAS|const MATRICES|correcta:/);
    assert.doesNotMatch(razonamiento, /const PREGUNTAS|correcta:/);
});
test('CI: la estimación server-side mantiene la norma 14/4,5 y sus límites', () => {
    assert.equal(estimarCI(NORMA_CI.media), 100);
    let prev = -Infinity;
    for (let n = 0; n <= 24; n++) { const ci = estimarCI(n); assert.ok(ci >= prev); assert.ok(ci >= 55 && ci <= 145); prev = ci; }
});
test('CI: el permiso de trabajos de IA empieza desmarcado y se guarda con versión y texto', () => {
    const html = fs.readFileSync(path.join(PUBLIC, 'test-ci.html'), 'utf8');
    assert.match(html, /<input type=\"checkbox\" id=\"ia-acepto\">/);
    assert.doesNotMatch(html, /id=\"ia-acepto\"[^>]*checked/);
    const ctx = loadPage('test-ci');
    const permiso = get(ctx, 'PERMISO_IA');
    assert.equal(permiso.tipo, 'trabajos_ia');
    assert.match(permiso.version, /^trabajos_ia_v\d+$/);
    assert.match(permiso.texto, /revisa siempre la selección/);
});
// Tests de las páginas que esta tarea no cambia (se mantienen).
test('numérico: 15 preguntas con respuesta válida', () => {
    const P = get(loadPage('test-numerico'), 'PREGUNTAS');
    assert.equal(P.length, 15);
    checkMultipleChoice(P);
});

test('idiomas: 16 preguntas, rangos cubren 0–16', () => {
    const ctx = loadPage('test-idiomas');
    const P = get(ctx, 'PREGUNTAS');
    assert.equal(P.length, 16);
    checkMultipleChoice(P);
    const R = get(ctx, 'RANGOS');
    for (let n = 0; n <= 16; n++) assert.ok(R.some(r => n >= r.min && n <= r.max), `sin rango para ${n}`);
});

test('personalidad: 4 ítems por dimensión, 1 invertido por dimensión', () => {
    const P = get(loadPage('test-personalidad'), 'PREGUNTAS');
    for (const d of ['O', 'C', 'E', 'A', 'N']) {
        const items = P.filter(q => q.dim === d);
        assert.equal(items.length, 4, `dimensión ${d}`);
        assert.equal(items.filter(q => q.inv).length, 1, `invertidos en ${d}`);
    }
});

test('psicométrico: 3 situaciones por dimensión con máximo 3 puntos (máx. 9)', () => {
    const P = get(loadPage('test-psicometrico'), 'PREGUNTAS');
    const byBlock = {};
    for (const q of P) {
        byBlock[q.bloque] = (byBlock[q.bloque] || 0) + Math.max(...q.opciones.map(o => o.puntos));
    }
    assert.deepEqual(Object.values(byBlock), [9, 9, 9, 9]);
});

test('CI: respuestas de la matriz de rotación y la de XOR (banco del servidor)', () => {
    assert.equal(MATRICES[2].correcta, cellSVG(ARROW(0)));
    assert.equal(MATRICES[7].correcta, cellSVG(LINES(['arriba', 'izquierda'])));
});

test('motor psicométrico (API): el máximo por dimensión da 100% y no se satura antes', () => {
    const best = PSYCHOMETRIC_QUESTIONS.map(q => ({ questionId: q.id, optionIndex: 0 }));
    const res = PsychometricEngine.evaluateTest(best);
    for (const v of Object.values(res.dimensions)) assert.ok(v <= 100);
    const worst = PSYCHOMETRIC_QUESTIONS.map(q => ({ questionId: q.id, optionIndex: q.options.length - 1 }));
    const low = PsychometricEngine.evaluateTest(worst);
    assert.ok(low.overallScore < 60, `el peor perfil no debería dar ${low.overallScore}`);
});
