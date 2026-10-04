// La búsqueda de empleo es gratis e ilimitada en todos los planes: solo se cobra la preparación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SaasCore, SAAS_PLANS } from '../services/saasCore.js';

test('ningún plan define un límite de búsquedas de empleo', () => {
    for (const plan of Object.values(SAAS_PLANS)) {
        assert.equal(JSON.stringify(plan).match(/search|busqueda|búsqueda/i), null, plan.name);
    }
});

test('cuenta gratis: 1 escaneo ATS y 1 entrevista en total', () => {
    for (const h of ['ats', 'entrevista']) {
        assert.equal(SaasCore.canUse(null, h, 0).allowed, true, h);
        const segunda = SaasCore.canUse(null, h, 1);
        assert.equal(segunda.allowed, false, h);
        assert.match(segunda.message, /comprá la herramienta/);
    }
});

test('Plan Pro y Enterprise: sin límite', () => {
    for (const plan of ['pro', 'enterprise']) {
        assert.equal(SaasCore.canUse(plan, 'ats', 500).allowed, true);
        assert.equal(SaasCore.canUse(plan, 'entrevista', 500).allowed, true);
    }
});

test('la página de planes no ofrece búsquedas como beneficio pago', () => {
    const html = fs.readFileSync(new URL('../public/planes-saas.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /\d+\s+búsquedas diarias/i);
    assert.match(html, /Búsqueda de empleo ilimitada/);
});
