/**
 * Registro obligatorio de postulantes (Supabase Auth).
 *
 * Usa el mismo proyecto Supabase que el Tutor IA (/home), así una sola cuenta
 * sirve para tests, búsqueda de empleo y tutor.
 *
 * Requiere cargar antes:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js"></script>
 *
 * API global (window.PG_AUTH):
 *   requireAuth()             → Promise<user>. Bloquea la página hasta que el usuario se registre/ingrese.
 *   openModal()               → Promise<user|null>. Igual pero se puede cerrar (null si cierra).
 *   getUser()                 → Promise<user|null>
 *   saveResult(test, puntaje, maximo, detalle) → guarda el resultado de un test.
 *   signOut()
 *   onChange(cb)              → cb(user|null) cada vez que cambia la sesión.
 */
(function () {
    const SUPABASE_URL = 'https://flsguqlmcqxyulkqmriu.supabase.co';
    // Clave "publishable": pensada para el navegador. La seguridad la dan las políticas RLS.
    const SUPABASE_KEY = 'sb_publishable_F2h4qlMjmDY0sb8D-t5adw_5l31usVM';

    const PROFESIONES = [
        'Tecnología / IT',
        'Salud / Enfermería / Medicina',
        'Ingeniería / Construcción',
        'Transporte / Logística',
        'Administración / Finanzas',
        'Hostelería / Servicios',
        'Otro'
    ];

    if (!window.supabase || !window.supabase.createClient) {
        console.error('[PG_AUTH] supabase-js no cargó.');
        window.PG_AUTH = {
            requireAuth: () => { showFatal(); return new Promise(() => {}); },
            openModal: () => { showFatal(); return Promise.resolve(null); },
            getUser: async () => null,
            saveResult: async () => {},
            signOut: async () => {},
            onChange: () => {}
        };
        return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    /* ─── Estilos ───────────────────────────────────────────────────────── */
    const css = `
    .pg-auth-overlay{position:fixed;inset:0;background:rgba(15,23,42,.65);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;font-family:inherit}
    .pg-auth-card{background:#fff;color:#0f172a;border-radius:24px;max-width:440px;width:100%;padding:2rem;position:relative;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);margin:auto}
    .pg-auth-close{position:absolute;top:1rem;right:1rem;border:none;background:#f1f5f9;border-radius:50%;width:32px;height:32px;cursor:pointer;font-weight:700;color:#64748b}
    .pg-auth-head{text-align:center;margin-bottom:1.25rem}
    .pg-auth-head .pg-emoji{font-size:2.25rem;margin-bottom:.35rem}
    .pg-auth-head h3{font-size:1.4rem;font-weight:800;margin:0 0 .25rem}
    .pg-auth-head p{font-size:.9rem;color:#64748b;margin:0;line-height:1.5}
    .pg-auth-tabs{display:flex;background:#f1f5f9;border-radius:12px;padding:4px;margin-bottom:1.25rem}
    .pg-auth-tabs button{flex:1;border:none;background:transparent;padding:.6rem;border-radius:9px;font-weight:700;font-size:.9rem;color:#64748b;cursor:pointer;font-family:inherit}
    .pg-auth-tabs button.on{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    .pg-auth-form{display:flex;flex-direction:column;gap:.85rem}
    .pg-auth-form label{font-size:.82rem;font-weight:600;color:#334155;display:block;margin-bottom:.3rem}
    .pg-auth-form input,.pg-auth-form select{width:100%;box-sizing:border-box;padding:.75rem .9rem;border:1.5px solid #e2e8f0;border-radius:12px;font-size:.95rem;font-family:inherit;background:#fff;color:#0f172a}
    .pg-auth-form input:focus,.pg-auth-form select:focus{outline:none;border-color:#FF6A00}
    .pg-auth-check{display:flex;gap:.5rem;align-items:flex-start;font-size:.8rem;color:#475569;line-height:1.45}
    .pg-auth-check input{width:auto;margin-top:.15rem}
    .pg-auth-btn{width:100%;border:none;background:#FF6A00;color:#fff;font-weight:800;font-size:1rem;padding:.9rem;border-radius:12px;cursor:pointer;font-family:inherit}
    .pg-auth-btn:disabled{opacity:.6;cursor:wait}
    .pg-auth-google{width:100%;border:1.5px solid #e2e8f0;background:#fff;color:#0f172a;font-weight:700;font-size:.95rem;padding:.8rem;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;font-family:inherit}
    .pg-auth-sep{display:flex;align-items:center;gap:.75rem;color:#94a3b8;font-size:.8rem;margin:.25rem 0}
    .pg-auth-sep:before,.pg-auth-sep:after{content:"";flex:1;height:1px;background:#e2e8f0}
    .pg-auth-msg{font-size:.85rem;padding:.65rem .8rem;border-radius:10px;display:none;line-height:1.45}
    .pg-auth-msg.err{display:block;background:#fef2f2;color:#b91c1c}
    .pg-auth-msg.ok{display:block;background:#f0fdf4;color:#15803d}
    .pg-auth-link{background:none;border:none;color:#FF6A00;font-weight:600;font-size:.85rem;cursor:pointer;padding:0;font-family:inherit}
    .pg-auth-foot{text-align:center;margin-top:1rem;font-size:.85rem}
    .pg-auth-foot a{color:#64748b;text-decoration:none;font-weight:600}
    `;
    function injectCss() {
        if (document.getElementById('pg-auth-css')) return;
        const s = document.createElement('style');
        s.id = 'pg-auth-css';
        s.textContent = css;
        document.head.appendChild(s);
    }

    /* ─── Helpers ───────────────────────────────────────────────────────── */
    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function profileComplete(user) {
        const m = (user && user.user_metadata) || {};
        return Boolean((m.full_name || m.name) && m.phone && m.profession);
    }

    function traducirError(err) {
        const msg = (err && err.message) || String(err);
        if (/already registered|already exists/i.test(msg)) return 'Ese email ya tiene una cuenta. Ingresá con tu contraseña.';
        if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
        if (/email not confirmed/i.test(msg)) return 'Tenés que confirmar tu email. Revisá tu bandeja de entrada (y spam).';
        if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
        if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
        if (/invalid email|unable to validate email/i.test(msg)) return 'El email no es válido.';
        return 'No pudimos completar la operación: ' + msg;
    }

    // Guarda/actualiza la ficha del candidato. Si falla (p. ej. tabla aún no creada)
    // no bloquea al usuario: el dato queda igual en user_metadata de Supabase Auth.
    async function syncProfile(user) {
        const m = user.user_metadata || {};
        const { error } = await client.from('pg_candidatos').upsert({
            user_id: user.id,
            email: user.email,
            nombre: m.full_name || m.name || '',
            telefono: m.phone || null,
            profesion: m.profession || null,
            acepta_contacto: m.accepts_contact === true,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) console.warn('[PG_AUTH] No se pudo guardar pg_candidatos:', error.message);
    }

    function showFatal() {
        injectCss();
        const o = document.createElement('div');
        o.className = 'pg-auth-overlay';
        o.innerHTML = `<div class="pg-auth-card"><div class="pg-auth-head"><div class="pg-emoji">⚠️</div>
            <h3>No pudimos cargar el registro</h3><p>Revisá tu conexión y recargá la página.</p></div>
            <button class="pg-auth-btn" onclick="location.reload()">Recargar</button></div>`;
        document.body.appendChild(o);
    }

    /* ─── Modal ─────────────────────────────────────────────────────────── */
    let activeModal = null;

    function openAuthModal({ closable, initialMode, user }) {
        injectCss();
        if (activeModal) activeModal.destroy(null);

        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'pg-auth-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            document.body.appendChild(overlay);
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            let mode = initialMode || 'signup';
            let currentUser = user || null;

            const modal = {
                destroy(result) {
                    overlay.remove();
                    document.body.style.overflow = prevOverflow;
                    activeModal = null;
                    resolve(result);
                }
            };
            activeModal = modal;

            async function finish(u) {
                await syncProfile(u);
                modal.destroy(u);
            }

            const profOpts = PROFESIONES.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
            const consent = `<label class="pg-auth-check"><input type="checkbox" name="consent" required>
                <span>Acepto que Puentes Globales guarde mis datos y me contacte sobre oportunidades laborales y migratorias.</span></label>`;

            function render(msg) {
                const closeBtn = closable ? '<button class="pg-auth-close" data-act="close" aria-label="Cerrar">✕</button>' : '';
                const foot = closable ? '' : '<div class="pg-auth-foot"><a href="index.html">← Volver al inicio</a></div>';
                let body = '';

                if (mode === 'signup' || mode === 'login') {
                    const isSignup = mode === 'signup';
                    body = `
                    <div class="pg-auth-head"><div class="pg-emoji">🚀</div>
                        <h3>${isSignup ? 'Creá tu cuenta gratis' : 'Ingresá a tu cuenta'}</h3>
                        <p>Registrate para hacer los tests, buscar empleo y guardar tus resultados.</p></div>
                    <div class="pg-auth-tabs">
                        <button data-mode="signup" class="${isSignup ? 'on' : ''}">Crear cuenta</button>
                        <button data-mode="login" class="${!isSignup ? 'on' : ''}">Ya tengo cuenta</button>
                    </div>
                    <form class="pg-auth-form" data-form="${mode}">
                        <button type="button" class="pg-auth-google" data-act="google">
                            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                            Continuar con Google
                        </button>
                        <div class="pg-auth-sep">o con tu email</div>
                        ${isSignup ? `
                        <div><label>Nombre completo</label><input name="nombre" required autocomplete="name" placeholder="Ej. Juan Pérez"></div>` : ''}
                        <div><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="juan@ejemplo.com"></div>
                        ${isSignup ? `
                        <div><label>WhatsApp / Teléfono</label><input name="telefono" type="tel" required autocomplete="tel" placeholder="+54 9 11 1234 5678" pattern="[+0-9 ()-]{7,20}"></div>
                        <div><label>Profesión / Área</label><select name="profesion" required><option value="">Seleccioná tu área...</option>${profOpts}</select></div>` : ''}
                        <div><label>Contraseña</label><input name="password" type="password" required minlength="6" autocomplete="${isSignup ? 'new-password' : 'current-password'}" placeholder="Mínimo 6 caracteres"></div>
                        ${isSignup ? consent : '<div style="text-align:right"><button type="button" class="pg-auth-link" data-act="forgot">¿Olvidaste tu contraseña?</button></div>'}
                        <div class="pg-auth-msg"></div>
                        <button type="submit" class="pg-auth-btn">${isSignup ? 'Crear cuenta y continuar →' : 'Ingresar →'}</button>
                    </form>`;
                } else if (mode === 'profile') {
                    const m = (currentUser && currentUser.user_metadata) || {};
                    body = `
                    <div class="pg-auth-head"><div class="pg-emoji">📝</div>
                        <h3>Completá tu perfil</h3>
                        <p>Un último paso para acceder a los tests y ofertas.</p></div>
                    <form class="pg-auth-form" data-form="profile">
                        <div><label>Nombre completo</label><input name="nombre" required value="${esc(m.full_name || m.name || '')}"></div>
                        <div><label>WhatsApp / Teléfono</label><input name="telefono" type="tel" required value="${esc(m.phone || '')}" placeholder="+54 9 11 1234 5678" pattern="[+0-9 ()-]{7,20}"></div>
                        <div><label>Profesión / Área</label><select name="profesion" required><option value="">Seleccioná tu área...</option>${profOpts}</select></div>
                        ${consent}
                        <div class="pg-auth-msg"></div>
                        <button type="submit" class="pg-auth-btn">Guardar y continuar →</button>
                    </form>`;
                } else if (mode === 'check-email') {
                    body = `
                    <div class="pg-auth-head"><div class="pg-emoji">📬</div>
                        <h3>Confirmá tu email</h3>
                        <p>Te enviamos un enlace de confirmación. Abrilo desde este mismo dispositivo y vas a volver acá con tu cuenta activa. Revisá también la carpeta de spam.</p></div>
                    <button class="pg-auth-btn" data-mode="login">Ya lo confirmé, ingresar</button>`;
                } else if (mode === 'new-password') {
                    body = `
                    <div class="pg-auth-head"><div class="pg-emoji">🔑</div><h3>Nueva contraseña</h3><p>Elegí una contraseña nueva para tu cuenta.</p></div>
                    <form class="pg-auth-form" data-form="new-password">
                        <div><label>Contraseña nueva</label><input name="password" type="password" required minlength="6" autocomplete="new-password"></div>
                        <div class="pg-auth-msg"></div>
                        <button type="submit" class="pg-auth-btn">Guardar contraseña</button>
                    </form>`;
                }

                overlay.innerHTML = `<div class="pg-auth-card">${closeBtn}${body}${foot}</div>`;

                if (mode === 'profile') {
                    const m = (currentUser && currentUser.user_metadata) || {};
                    const sel = overlay.querySelector('select[name="profesion"]');
                    if (sel && m.profession) sel.value = m.profession;
                }
                if (msg) setMsg(msg.text, msg.type);
                wire();
            }

            function setMsg(text, type) {
                const el = overlay.querySelector('.pg-auth-msg');
                if (!el) return;
                el.className = 'pg-auth-msg ' + (type || 'err');
                el.textContent = text;
            }

            function setBusy(form, busy) {
                const b = form.querySelector('.pg-auth-btn');
                if (b) b.disabled = busy;
            }

            function wire() {
                overlay.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', e => {
                    e.preventDefault();
                    mode = b.getAttribute('data-mode');
                    render();
                }));
                const close = overlay.querySelector('[data-act="close"]');
                if (close) close.addEventListener('click', () => modal.destroy(null));

                const google = overlay.querySelector('[data-act="google"]');
                if (google) google.addEventListener('click', async () => {
                    const { error } = await client.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: window.location.href }
                    });
                    if (error) setMsg(traducirError(error));
                });

                const forgot = overlay.querySelector('[data-act="forgot"]');
                if (forgot) forgot.addEventListener('click', async () => {
                    const email = overlay.querySelector('input[name="email"]').value.trim();
                    if (!email) { setMsg('Escribí tu email arriba y volvé a tocar "¿Olvidaste tu contraseña?".'); return; }
                    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
                    if (error) setMsg(traducirError(error));
                    else setMsg('Si el email está registrado, te enviamos un enlace para cambiar la contraseña.', 'ok');
                });

                const form = overlay.querySelector('form');
                if (form) form.addEventListener('submit', async e => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(form).entries());
                    setBusy(form, true);
                    try {
                        await handleSubmit(form.getAttribute('data-form'), f);
                    } catch (err) {
                        setMsg(traducirError(err));
                    } finally {
                        if (form.isConnected) setBusy(form, false);
                    }
                });

                const first = overlay.querySelector('input:not([type="checkbox"])');
                if (first) first.focus();
            }

            async function handleSubmit(kind, f) {
                if (kind === 'signup') {
                    const { data, error } = await client.auth.signUp({
                        email: f.email.trim(),
                        password: f.password,
                        options: {
                            emailRedirectTo: window.location.href,
                            data: {
                                full_name: f.nombre.trim(),
                                phone: f.telefono.trim(),
                                profession: f.profesion,
                                accepts_contact: true
                            }
                        }
                    });
                    if (error) {
                        if (/already registered|already exists/i.test(error.message)) {
                            mode = 'login';
                            render({ text: traducirError(error), type: 'err' });
                            return;
                        }
                        throw error;
                    }
                    // Supabase devuelve un usuario sin identidades cuando el email ya existía
                    // (protección contra enumeración de emails).
                    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                        mode = 'login';
                        render({ text: 'Ese email ya tiene una cuenta. Ingresá con tu contraseña.', type: 'err' });
                        return;
                    }
                    if (data.session) return finish(data.user);
                    mode = 'check-email';
                    render();
                } else if (kind === 'login') {
                    const { data, error } = await client.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
                    if (error) throw error;
                    currentUser = data.user;
                    if (!profileComplete(currentUser)) { mode = 'profile'; render(); return; }
                    return finish(currentUser);
                } else if (kind === 'profile') {
                    const { data, error } = await client.auth.updateUser({
                        data: { full_name: f.nombre.trim(), phone: f.telefono.trim(), profession: f.profesion, accepts_contact: true }
                    });
                    if (error) throw error;
                    return finish(data.user);
                } else if (kind === 'new-password') {
                    const { data, error } = await client.auth.updateUser({ password: f.password });
                    if (error) throw error;
                    currentUser = data.user;
                    if (!profileComplete(currentUser)) { mode = 'profile'; render(); return; }
                    return finish(currentUser);
                }
            }

            render();
        });
    }

    /* ─── API pública ───────────────────────────────────────────────────── */
    async function getUser() {
        const { data } = await client.auth.getSession();
        return (data && data.session && data.session.user) || null;
    }

    let recovering = false;
    client.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
            recovering = true;
            openAuthModal({ closable: false, initialMode: 'new-password' });
        }
    });

    async function gate(closable) {
        const user = await getUser();
        if (recovering) return new Promise(() => {});
        if (user && profileComplete(user)) {
            syncProfile(user);
            return user;
        }
        return openAuthModal({ closable, initialMode: user ? 'profile' : 'signup', user });
    }

    async function saveResult(test, puntaje, maximo, detalle) {
        const user = await getUser();
        if (!user) return;
        const { error } = await client.from('pg_resultados_test').insert({
            user_id: user.id,
            test,
            puntaje,
            maximo,
            detalle: detalle || null
        });
        if (error) console.warn('[PG_AUTH] No se pudo guardar el resultado:', error.message);
    }

    window.PG_AUTH = {
        client,
        requireAuth: () => gate(false),
        openModal: () => gate(true),
        getUser,
        saveResult,
        signOut: () => client.auth.signOut(),
        onChange: cb => {
            client.auth.onAuthStateChange((_e, session) => cb((session && session.user) || null));
        }
    };
})();
