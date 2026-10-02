/**
 * Llamadas a la API del sitio con la sesión del usuario (requiere auth-gate.js).
 * Si el plan no permite usar la herramienta, muestra el aviso con el enlace a los planes.
 */
window.PG_API = {
    async post(path, body) {
        const apiBase = window.PG_CONFIG ? window.PG_CONFIG.API_BASE : '/api/v1';
        const token = await PG_AUTH.getToken();
        const res = await fetch(`${apiBase}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));
        if (data.code === 'login') await PG_AUTH.requireAuth();
        if (data.code === 'limite') PG_API.showLimit(data.error);
        return data;
    },

    showLimit(message) {
        if (document.getElementById('pg-limit')) return;
        const o = document.createElement('div');
        o.id = 'pg-limit';
        o.setAttribute('role', 'dialog');
        o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
        o.innerHTML = `
            <div style="background:#fff;color:#0f172a;border-radius:20px;max-width:420px;width:100%;padding:2rem;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);">
                <div style="font-size:2.25rem;margin-bottom:.5rem;">⭐</div>
                <h3 style="font-size:1.3rem;font-weight:800;margin:0 0 .5rem;">Llegaste al límite de tu cuenta gratis</h3>
                <p id="pg-limit-msg" style="color:#64748b;font-size:.95rem;line-height:1.5;margin:0 0 1.25rem;"></p>
                <a href="planes-saas.html" style="display:block;background:#FF6A00;color:#fff;font-weight:800;padding:.85rem;border-radius:12px;text-decoration:none;margin-bottom:.6rem;">Ver Plan Profesional</a>
                <button type="button" style="background:none;border:none;color:#64748b;font-weight:600;cursor:pointer;font-family:inherit;">Cerrar</button>
                <p style="color:#94a3b8;font-size:.8rem;margin:1rem 0 0;">Buscar ofertas y postularte sigue siendo gratis.</p>
            </div>`;
        o.querySelector('#pg-limit-msg').textContent = message;
        o.querySelector('button').addEventListener('click', () => o.remove());
        document.body.appendChild(o);
    }
};
