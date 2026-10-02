/**
 * Piezas compartidas por el panel de empresa (empresa.html) y el superadmin (superadmin.html):
 * llamadas a la API con la sesión, editor de combos y editor de medios de pago.
 * Todo el texto que viene de la base se escribe con textContent.
 */
window.PANEL = (function () {
    const $ = (sel, raiz = document) => raiz.querySelector(sel);

    function el(tag, attrs = {}, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'text') n.textContent = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else if (v === true) n.setAttribute(k, '');
            else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
        }
        for (const h of hijos.flat()) if (h !== null && h !== undefined) n.append(h);
        return n;
    }

    async function api(path, { method = 'GET', body } = {}) {
        const res = await fetch(`/api/v1${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await PG_AUTH.getToken()}` },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));
        if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`);
        return data;
    }

    function aviso(texto, tipo = 'ok') {
        const t = el('div', { class: `toast ${tipo}`, role: 'status', text: texto });
        document.body.append(t);
        setTimeout(() => t.remove(), 3500);
    }

    const precioTxt = (precio, moneda, periodo) =>
        `${Number(precio).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${moneda}${periodo === 'mes' ? ' / mes' : ''}`;

    /* ─── Combos ──────────────────────────────────────────────────────────── */
    // base: '/empresa/<slug>' o '/superadmin'. productos: catálogo. combos: lista actual.
    function combos(cont, { base, productos, combos, recargar }) {
        cont.replaceChildren();
        const nombreProducto = c => (productos.find(p => p.codigo === c) || {}).nombre || c;

        if (!combos.length) cont.append(el('p', { class: 'hint', text: 'Todavía no hay combos.' }));
        for (const c of combos) {
            cont.append(el('div', { class: 'item' },
                el('div', {},
                    el('strong', { text: c.nombre }),
                    el('div', { class: 'hint', text: `${precioTxt(c.precio, c.moneda, c.periodo)} · ${(c.items || []).map(i => `${nombreProducto(i.producto)}${i.cantidad > 1 ? ` ×${i.cantidad}` : ''}`).join(' + ')}` })
                ),
                el('button', {
                    class: 'btn ghost small', text: 'Borrar', onclick: async () => {
                        try { await api(`${base}/combos/${c.id}`, { method: 'DELETE' }); aviso('Combo borrado.'); recargar(); }
                        catch (e) { aviso(e.message, 'err'); }
                    }
                })
            ));
        }

        const form = el('form', { class: 'combo-form' });
        form.append(
            el('h3', { text: 'Nuevo combo' }),
            el('div', { class: 'grid3' },
                el('label', { class: 'field' }, 'Nombre', el('input', { name: 'nombre', required: true, maxlength: '80', placeholder: 'Ej.: Pack Alemania' })),
                el('label', { class: 'field' }, 'Precio', el('input', { name: 'precio', type: 'number', min: '0', step: '0.01', required: true })),
                el('label', { class: 'field' }, 'Moneda', el('input', { name: 'moneda', value: 'USD', maxlength: '3', pattern: '[A-Z]{3}', required: true })),
                el('label', { class: 'field' }, 'Período', el('select', { name: 'periodo' }, el('option', { value: 'unico', text: 'Pago único' }), el('option', { value: 'mes', text: 'Por mes' }))),
                el('label', { class: 'field wide' }, 'Descripción', el('input', { name: 'descripcion', maxlength: '300' }))
            ),
            el('p', { class: 'hint', text: 'Productos del combo (al menos dos). La cantidad sirve para paquetes, por ejemplo 10 entrevistas.' }),
            el('div', { class: 'checks' }, productos.filter(p => p.activo !== false).map(p => el('label', { class: 'check' },
                el('input', { type: 'checkbox', name: 'prod', value: p.codigo }),
                el('span', { text: p.nombre }),
                el('input', { type: 'number', name: `cant_${p.codigo}`, min: '1', value: '1', class: 'cant', 'aria-label': `Cantidad de ${p.nombre}` })
            ))),
            el('button', { class: 'btn', type: 'submit', text: 'Crear combo' })
        );
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const f = new FormData(form);
            const items = f.getAll('prod').map(codigo => ({ producto: codigo, cantidad: Number(f.get(`cant_${codigo}`)) || 1 }));
            try {
                await api(`${base}/combos`, { method: 'POST', body: { nombre: f.get('nombre'), descripcion: f.get('descripcion') || null, precio: Number(f.get('precio')), moneda: String(f.get('moneda')).toUpperCase(), periodo: f.get('periodo'), items } });
                aviso('Combo creado.');
                recargar();
            } catch (err) { aviso(err.message, 'err'); }
        });
        cont.append(form);
    }

    /* ─── Medios de pago ──────────────────────────────────────────────────── */
    const ETIQUETAS = {
        public_key: 'Public key', access_token: 'Access token', publishable_key: 'Publishable key',
        secret_key: 'Secret key', webhook_secret: 'Webhook secret (opcional)', client_id: 'Client ID', client_secret: 'Client secret'
    };

    function pagos(cont, { base, pagos, recargar, textoRespaldo }) {
        cont.replaceChildren();
        if (textoRespaldo) cont.append(el('p', { class: 'hint', text: textoRespaldo }));
        for (const p of pagos) {
            const form = el('form', { class: 'pago' });
            const estado = p.configurado ? (p.activo ? `Activo · modo ${p.modo === 'produccion' ? 'producción' : 'prueba'}` : 'Configurado, desactivado') : 'Sin configurar';
            form.append(
                el('div', { class: 'pago-head' }, el('h3', { text: p.nombre }), el('span', { class: `pill ${p.configurado && p.activo ? 'ok' : ''}`, text: estado })),
                el('div', { class: 'grid2' },
                    ...p.campos.publicos.map(c => el('label', { class: 'field' }, ETIQUETAS[c] || c, el('input', { name: `pub_${c}`, value: p.config_publica[c] || '', autocomplete: 'off' }))),
                    ...p.campos.secretos.map(c => el('label', { class: 'field' }, ETIQUETAS[c] || c, el('input', { name: `sec_${c}`, type: 'password', autocomplete: 'new-password', placeholder: p.configurado ? 'Guardado · dejalo vacío para no cambiarlo' : '' }))),
                    el('label', { class: 'field' }, 'Modo', el('select', { name: 'modo' },
                        el('option', { value: 'prueba', text: 'Prueba', selected: p.modo !== 'produccion' }),
                        el('option', { value: 'produccion', text: 'Producción', selected: p.modo === 'produccion' })))
                ),
                el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'activo', checked: p.activo || !p.configurado }), el('span', { text: 'Activo' })),
                el('div', { class: 'acciones' },
                    el('button', { class: 'btn', type: 'submit', text: 'Guardar' }),
                    p.configurado ? el('button', {
                        class: 'btn ghost', type: 'button', text: 'Quitar', onclick: async () => {
                            try { await api(`${base}/pagos/${p.metodo}`, { method: 'DELETE' }); aviso(`${p.nombre} quitado.`); recargar(); }
                            catch (e) { aviso(e.message, 'err'); }
                        }
                    }) : null
                ),
                el('p', { class: 'hint', text: 'Las claves secretas se guardan cifradas y nunca se vuelven a mostrar.' })
            );
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const f = new FormData(form);
                const publicos = {}, secretos = {};
                for (const c of p.campos.publicos) publicos[c] = String(f.get(`pub_${c}`) || '').trim();
                for (const c of p.campos.secretos) { const v = String(f.get(`sec_${c}`) || '').trim(); if (v) secretos[c] = v; }
                try {
                    await api(`${base}/pagos/${p.metodo}`, { method: 'PUT', body: { activo: f.get('activo') === 'on', modo: f.get('modo'), publicos, secretos } });
                    aviso(`${p.nombre} guardado.`);
                    recargar();
                } catch (err) { aviso(err.message, 'err'); }
            });
            cont.append(form);
        }
    }

    const CSS = `
    :root { --bg:#F8FAFC; --white:#fff; --brand:#FF6A00; --brand-dark:#c2410c; --border:#e2e8f0; --text:#0f172a; --muted:#64748b; --ok:#15803d; --ok-bg:#f0fdf4; --err:#b91c1c; --err-bg:#fef2f2; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
    nav{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 5%;background:var(--white);border-bottom:1px solid var(--border);flex-wrap:wrap}
    .logo{font-weight:800;font-size:1.2rem;color:var(--text);text-decoration:none}
    .logo span{color:var(--brand)}
    nav .tabs{display:flex;gap:.4rem;flex-wrap:wrap}
    nav .tabs button{border:1px solid var(--border);background:var(--white);border-radius:99px;padding:.4rem .9rem;font-family:inherit;font-weight:600;cursor:pointer;color:var(--muted)}
    nav .tabs button[aria-pressed="true"]{background:var(--text);color:#fff;border-color:var(--text)}
    main{max-width:980px;margin:0 auto;padding:1.5rem 1rem 4rem;display:grid;gap:1.25rem}
    h1{font-size:1.6rem;font-weight:800}
    h2{font-size:1.15rem;font-weight:800}
    h3{font-size:1rem;font-weight:800}
    section{background:var(--white);border:1px solid var(--border);border-radius:16px;padding:1.2rem;display:grid;gap:.9rem}
    .hint{color:var(--muted);font-size:.88rem}
    .field{display:grid;gap:.3rem;font-size:.82rem;font-weight:600;color:#334155}
    .field.wide{grid-column:1/-1}
    input,select{width:100%;padding:.6rem .75rem;border:1.5px solid var(--border);border-radius:10px;font-family:inherit;font-size:.92rem;background:var(--white);color:var(--text)}
    input[type=checkbox]{width:auto}
    input[type=color]{padding:.15rem;height:2.4rem}
    .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem}
    .grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.75rem}
    .btn{border:none;background:var(--brand);color:#fff;font-weight:800;font-family:inherit;font-size:.9rem;padding:.65rem 1rem;border-radius:10px;cursor:pointer;justify-self:start}
    .btn:hover{background:var(--brand-dark)}
    .btn.ghost{background:var(--white);color:var(--text);border:1.5px solid var(--border)}
    .btn.small{padding:.4rem .7rem;font-size:.82rem}
    .item{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.7rem 0;border-top:1px solid var(--border)}
    .checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.5rem}
    .check{display:flex;align-items:center;gap:.5rem;font-size:.9rem}
    .check .cant{width:70px;margin-left:auto;padding:.3rem .4rem}
    .combo-form{display:grid;gap:.75rem;border-top:1px dashed var(--border);padding-top:1rem}
    .pago{display:grid;gap:.75rem;border:1px solid var(--border);border-radius:12px;padding:1rem}
    .pago-head{display:flex;justify-content:space-between;align-items:center;gap:1rem}
    .pill{font-size:.75rem;font-weight:700;padding:.2rem .6rem;border-radius:99px;background:#f1f5f9;color:var(--muted);white-space:nowrap}
    .pill.ok{background:var(--ok-bg);color:var(--ok)}
    .pill.off{background:var(--err-bg);color:var(--err)}
    .acciones{display:flex;gap:.5rem;flex-wrap:wrap}
    .scroll{overflow-x:auto}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    th,td{text-align:left;padding:.5rem;border-bottom:1px solid var(--border);vertical-align:middle}
    th{color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
    td input{min-width:90px}
    .toast{position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);padding:.75rem 1.1rem;border-radius:10px;font-weight:600;z-index:10001;max-width:90vw;box-shadow:0 10px 30px rgba(0,0,0,.15)}
    .toast.ok{background:var(--ok-bg);color:var(--ok)}
    .toast.err{background:var(--err-bg);color:var(--err)}
    .bloqueo{position:fixed;inset:0;background:#0f172a;color:#fff;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center}
    .bloqueo a{color:#fb923c;font-weight:700}
    [hidden]{display:none!important}
    `;
    const estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.append(estilo);

    function bloquear(titulo, texto) {
        document.body.append(el('div', { class: 'bloqueo' }, el('div', {}, el('h2', { text: titulo }), el('p', { text: texto, style: 'opacity:.8;margin:.5rem 0 1rem' }), el('a', { href: 'index.html', text: '← Volver al inicio' }))));
    }

    function pestañas(nav, secciones) {
        const botones = [...nav.querySelectorAll('button[data-tab]')];
        const mostrar = id => {
            botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === id)));
            secciones.forEach(s => { s.hidden = s.id !== id; });
        };
        botones.forEach(b => b.addEventListener('click', () => mostrar(b.dataset.tab)));
        mostrar(botones[0].dataset.tab);
    }

    return { $, el, api, aviso, precioTxt, combos, pagos, bloquear, pestañas };
})();
