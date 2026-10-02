// La búsqueda de empleo es gratis e ilimitada en todos los planes: solo se cobra la preparación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SaasCore, SAAS_PLANS } from '../services/saasCore.js';

test('ningún plan define un límite de búsquedas de empleo', () => {
    for (const plan of Object.values(SAAS_PLANS)) {
        assert.equal(Object.keys(plan).some(k => /search/i.test(k)), false, plan.name);
    }
});

test('el plan gratuito puede buscar sin límite', () => {
    for (let i = 0; i < 50; i++) {
        assert.equal(SaasCore.checkUsageLimit('candidato-1', 'searches', 'candidate').allowed, true);
    }
});

test('la página de planes no ofrece búsquedas como beneficio pago', () => {
    const html = fs.readFileSync(new URL('../public/planes-saas.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /\d+\s+búsquedas diarias/i);
    assert.match(html, /Búsqueda de empleo ilimitada/);
});
