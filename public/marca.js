/**
 * Marca blanca en el navegador: carga la configuración de la empresa (marca, productos,
 * combos, medios de pago) y aplica su nombre, logo y colores a la página.
 *
 * La empresa sale de ?org=slug (y se recuerda durante la visita), del subdominio o del
 * dominio propio (lo resuelve el servidor). Sin empresa, todo es de Puentes Globales.
 *
 *   PG_MARCA.listo        → Promise con la configuración
 *   PG_MARCA.config       → la configuración, cuando ya cargó
 *   PG_MARCA.orgId()      → id de la empresa (o null)
 *
 * En el HTML: data-marca="nombre" (texto), data-marca="logo" (<img>). Los colores se aplican
 * a las variables CSS que usan las páginas (--brand, --blue, --primary, --brand-blue, --accent-brand).
 */
(function () {
    const CLAVE = 'pg_org';
    const desdeUrl = new URLSearchParams(location.search).get('org');
    try {
        if (desdeUrl === '') sessionStorage.removeItem(CLAVE);
        else if (desdeUrl && /^[a-z0-9][a-z0-9-]{1,40}$/.test(desdeUrl)) sessionStorage.setItem(CLAVE, desdeUrl);
    } catch (e) { /* almacenamiento bloqueado: se usa solo lo que venga en la URL */ }

    let slug = desdeUrl;
    try { slug = slug || sessionStorage.getItem(CLAVE); } catch (e) { /* idem */ }

    const VARIABLES = ['--brand', '--blue', '--primary', '--brand-blue', '--accent-brand'];

    function aplicar(cfg) {
        const m = cfg.marca || {};
        if (m.slug) {
            const raiz = document.documentElement;
            for (const v of VARIABLES) if (getComputedStyle(raiz).getPropertyValue(v).trim()) raiz.style.setProperty(v, m.color_primario);
            raiz.style.setProperty('--org-primario', m.color_primario);
            raiz.style.setProperty('--org-acento', m.color_acento);
            document.title = document.title.replace(/Puentes ?Globales/gi, m.nombre);
        }
        document.querySelectorAll('[data-marca="nombre"]').forEach(el => { el.textContent = m.nombre; });
        document.querySelectorAll('[data-marca="logo"]').forEach(el => { if (m.logo_url) { el.src = m.logo_url; el.alt = m.nombre; } });
    }

    const url = '/api/v1/org/config' + (slug ? `?org=${encodeURIComponent(slug)}` : '');
    const listo = fetch(url)
        .then(r => r.json())
        .catch(() => ({ marca: { id: null, slug: null, nombre: 'Puentes Globales' }, productos: [], combos: [], pagos: [] }))
        .then(cfg => {
            window.PG_MARCA.config = cfg;
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => aplicar(cfg));
            else aplicar(cfg);
            return cfg;
        });

    window.PG_MARCA = {
        listo,
        config: null,
        orgId: () => (window.PG_MARCA.config && window.PG_MARCA.config.marca && window.PG_MARCA.config.marca.id) || null
    };
})();
