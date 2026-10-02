// Las páginas no cargan fuentes ni scripts de terceros que reciban la IP del visitante
// (fallo LG München I, 3 O 17493/20, sobre Google Fonts). Todo se sirve desde el sitio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PROHIBIDOS = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/;

test('ninguna página carga fuentes o scripts de CDNs externos', () => {
    for (const f of fs.readdirSync(PUBLIC).filter(f => /\.(html|js|css)$/.test(f))) {
        assert.doesNotMatch(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), PROHIBIDOS, f);
    }
});

test('los archivos que reemplazan a los CDNs existen', () => {
    for (const f of ['@supabase/supabase-js/dist/umd/supabase.js', 'lucide/dist/umd/lucide.min.js']) {
        assert.ok(fs.existsSync(path.join(ROOT, 'node_modules', f)), f);
    }
    const css = fs.readFileSync(path.join(PUBLIC, 'fonts.css'), 'utf8');
    for (const [, archivo] of css.matchAll(/url\(([^)]+)\)/g)) {
        assert.ok(fs.existsSync(path.join(PUBLIC, archivo)), archivo);
    }
});
