// Valida que los tests de /public carguen sin errores y que sus respuestas sean coherentes.
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PsychometricEngine, PSYCHOMETRIC_QUESTIONS } from '../services/psychometricEngine.js';

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

test('razonamiento: 15 preguntas con respuesta válida', () => {
    const P = get(loadPage('test-razonamiento'), 'PREGUNTAS');
    assert.equal(P.length, 15);
    checkMultipleChoice(P);
});

test('razonamiento: la flecha de la pregunta 11 gira de a 45° (0, 45, 90, 135 → 180 = Abajo)', () => {
    const html = fs.readFileSync(path.join(PUBLIC, 'test-razonamiento.html'), 'utf8');
    const block = html.slice(html.indexOf('pattern_11:'), html.indexOf('pattern_14:'));
    const angles = [...block.matchAll(/^\s*(\d+),\s*\/\//gm)].map(m => Number(m[1]));
    assert.deepEqual(angles, [0, 45, 90, 135]);
    const P = get(loadPage('test-razonamiento'), 'PREGUNTAS');
    assert.equal(P.find(q => q.id === 11).correcta, 'Abajo');
});

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

test('CI: 24 preguntas; matrices con 6 opciones distintas y una sola correcta', () => {
    const ctx = loadPage('test-ci');
    const P = get(ctx, 'PREGUNTAS');
    const key = get(ctx, 'key');
    assert.equal(P.length, 24);
    for (const q of P.filter(q => q.tipo === 'matriz')) {
        const answer = key(q.cell(2, 2));
        const all = [answer, ...q.distractores.map(key)];
        assert.equal(all.length, 6, `matriz ${q.id}`);
        assert.equal(new Set(all).size, 6, `opciones repetidas o distractor igual a la respuesta en matriz ${q.id}`);
    }
    checkMultipleChoice(P.filter(q => q.tipo === 'texto'));
});

test('CI: respuestas de la matriz de rotación y la de XOR', () => {
    const ctx = loadPage('test-ci');
    const M = get(ctx, 'MATRICES');
    // JSON: los objetos vienen de otro contexto vm y no comparten prototipo.
    assert.equal(JSON.stringify(M[2].cell(2, 2)), JSON.stringify({ type: 'arrow', rot: 0 }));
    assert.equal(JSON.stringify(M[7].cell(2, 2).segs), JSON.stringify(['arriba', 'izquierda']));
});

test('CI: la estimación crece con los aciertos y respeta los límites', () => {
    const ctx = loadPage('test-ci');
    const estimarCI = get(ctx, 'estimarCI');
    const norma = get(ctx, 'NORMA');
    assert.equal(estimarCI(norma.media), 100);
    let prev = -Infinity;
    for (let n = 0; n <= 24; n++) {
        const ci = estimarCI(n);
        assert.ok(ci >= prev, `no monótono en ${n}`);
        assert.ok(ci >= 55 && ci <= 145);
        prev = ci;
    }
});

test('motor psicométrico (API): el máximo por dimensión da 100% y no se satura antes', () => {
    const best = PSYCHOMETRIC_QUESTIONS.map(q => ({ questionId: q.id, optionIndex: 0 }));
    const res = PsychometricEngine.evaluateTest(best);
    for (const v of Object.values(res.dimensions)) assert.ok(v <= 100);
    const worst = PSYCHOMETRIC_QUESTIONS.map(q => ({ questionId: q.id, optionIndex: q.options.length - 1 }));
    const low = PsychometricEngine.evaluateTest(worst);
    assert.ok(low.overallScore < 60, `el peor perfil no debería dar ${low.overallScore}`);
});
