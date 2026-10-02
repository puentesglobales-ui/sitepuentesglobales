// Claves por variables de entorno y protección del panel de estado. Sin llamadas de red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const k of ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'REED_API_KEY', 'FINDWORK_TOKEN']) delete process.env[k];
process.env.ADMIN_TOKEN = 'secreto-de-prueba';

const { API_SOURCES, parseRssFeeds } = await import('../config/apis.js');
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

test('RSS_FEEDS: interpreta "Nombre|url;Nombre|url" e ignora entradas inválidas', () => {
    const feeds = parseRssFeeds(' WWR Programming|https://a.com/x.rss ; Reddit|https://b.com/.rss;;sin-url|nada ');
    assert.equal(JSON.stringify(feeds.map(f => [f.id, f.name, f.url])), JSON.stringify([
        ['wwr-programming', 'WWR Programming', 'https://a.com/x.rss'],
        ['reddit', 'Reddit', 'https://b.com/.rss']
    ]));
    assert.equal(parseRssFeeds('').length, 0);
});

test('parseRss: lee RSS 2.0 y Atom', async () => {
    const { parseRss } = await import('../services/jobAdapters/AdapterManager.js');
    const rss = `<rss><channel><item><title><![CDATA[Dev &amp; Ops]]></title><link>https://x.com/1</link>
        <description>&lt;p&gt;Remoto&lt;/p&gt;</description><pubDate>Thu, 01 Oct 2026</pubDate></item></channel></rss>`;
    const atom = `<feed><entry><title>Designer</title><link href="https://y.com/2"/><updated>2026-10-02</updated></entry></feed>`;
    const [a] = parseRss(rss, 'Feed A');
    assert.equal(a.title, 'Dev & Ops');
    assert.equal(a.url, 'https://x.com/1');
    assert.match(a.description, /Remoto/);
    assert.equal(a.source, 'RSS: Feed A');
    const [b] = parseRss(atom, 'Feed B');
    assert.equal(b.url, 'https://y.com/2');
    assert.equal(b.created_at, '2026-10-02');
});

test('no quedan URLs de feeds RSS escritas en el código', () => {
    for (const f of ['../config/apis.js', '../public/admin.html']) {
        const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
        assert.doesNotMatch(src, /https?:\/\/[^'"\s]+\.rss/, f);
    }
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
