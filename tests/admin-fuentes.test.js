// Claves por variables de entorno y protección del panel de estado. Sin llamadas de red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const k of ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'REED_API_KEY', 'FINDWORK_TOKEN']) delete process.env[k];
process.env.ADMIN_TOKEN = 'secreto-de-prueba';

const { API_SOURCES } = await import('../config/apis.js');
const { requireAdmin } = await import('../controllers/adminController.js');

function fakeRes() {
    return {
        statusCode: 200,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}
const req = token => ({ get: h => (h === 'x-admin-token' ? token : undefined) });

test('config/apis.js no contiene claves escritas', () => {
    const src = fs.readFileSync(new URL('../config/apis.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /appKey:\s*'[^']+'|apiKey:\s*'[^']+'|bearerToken:\s*'[^']+'|Sofi2035/);
});

test('sin variables de entorno, las fuentes con clave quedan desactivadas', () => {
    assert.equal(API_SOURCES.adzuna.enabled, false);
    assert.equal(API_SOURCES.reed.enabled, false);
    assert.equal(API_SOURCES.findwork.enabled, false);
    assert.equal(API_SOURCES.arbeitnow.enabled, true);
});

test('admin/status rechaza sin clave o con clave incorrecta', () => {
    for (const token of [undefined, '', 'otra-clave']) {
        const res = fakeRes();
        let called = false;
        requireAdmin(req(token), res, () => { called = true; });
        assert.equal(called, false);
        assert.equal(res.statusCode, 401);
    }
});

test('admin/status deja pasar con la clave correcta', () => {
    let called = false;
    requireAdmin(req('secreto-de-prueba'), fakeRes(), () => { called = true; });
    assert.equal(called, true);
});
