/**
 * Práctica con IA (simulador de entrevistas e idiomas): formulario de inicio, chat con
 * correcciones, resultado e historial. La IA es de Alex IO; la página solo habla con
 * /api/v1/practica de Puentes Globales.
 *
 *   PRACTICA.iniciar({ producto: 'simulador' | 'idiomas', raiz, titulo, intro, formulario, describir })
 *     formulario(sugerido, opciones) → { nodo, leer() }   leer() devuelve el contexto o lanza Error
 *       (opciones = lo que hay cargado en Alex IO: tracks del simulador o idiomas)
 *     describir(contexto)  → texto corto de la sesión para el historial
 */
window.PRACTICA = (function () {
    function el(tag, attrs = {}, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'text') n.textContent = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else if (v === true) n.setAttribute(k, '');
            else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
        }
        for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h);
        return n;
    }

    function claveNueva() {
        return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    }

    async function api(producto, path = '', body) {
        const org = (window.PG_MARCA && PG_MARCA.config && PG_MARCA.config.marca && PG_MARCA.config.marca.slug) || null;
        const res = await fetch(`/api/v1/practica/${producto}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await PG_AUTH.getToken()}`, ...(org ? { 'x-org': org } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({ success: false, error: 'Respuesta inválida del servidor.' }));
        if (!res.ok || !data.success) { const e = new Error(data.error || `Error ${res.status}`); e.code = data.code; e.status = res.status; throw e; }
        return data;
    }

    const fecha = iso => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

    /* ─── Voz: funciones del navegador (sin costo; no se graba ni se guarda audio) ─── */
    const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const puedeLeer = 'speechSynthesis' in window;
    const PREF_LEER = 'pg_practica_leer_en_voz_alta';
    const leerPref = () => { try { return localStorage.getItem(PREF_LEER) === '1'; } catch { return false; } };
    const guardarPref = v => { try { localStorage.setItem(PREF_LEER, v ? '1' : '0'); } catch { /* sin almacenamiento: no se recuerda */ } };

    function vozPara(lang) {
        const voces = speechSynthesis.getVoices();
        return voces.find(v => v.lang === lang) || voces.find(v => v.lang.startsWith(lang.split('-')[0])) || null;
    }

    function leer(texto, lang) {
        if (!puedeLeer || !texto) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = lang;
        const v = vozPara(lang);
        if (v) u.voice = v;
        u.rate = 0.95; // un poco más lento que lo normal, para practicar
        speechSynthesis.speak(u);
    }

    // Botón de micrófono: dicta en el idioma de la práctica y escribe lo que entendió.
    function microfono(lang, entrada, nota) {
        if (!Reconocimiento) {
            nota.textContent = 'Para responder hablando, abrí esta página en Chrome, Edge o Safari.';
            return '';
        }
        const btn = el('button', { type: 'button', class: 'btn ghost', text: '🎤 Hablar', 'aria-pressed': 'false' });
        let rec = null;
        btn.addEventListener('click', () => {
            if (rec) { rec.stop(); return; }
            if (puedeLeer) speechSynthesis.cancel();
            rec = new Reconocimiento();
            rec.lang = lang;
            rec.interimResults = true;
            rec.continuous = false;
            const previo = entrada.value.trim();
            let final = '', confianza = 1;
            btn.textContent = '⏹ Listo'; btn.setAttribute('aria-pressed', 'true');
            nota.textContent = 'Escuchando… hablá cerca del micrófono.';
            rec.onresult = ev => {
                let provisorio = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const r = ev.results[i];
                    if (r.isFinal) { final += r[0].transcript; confianza = Math.min(confianza, r[0].confidence || 1); }
                    else provisorio += r[0].transcript;
                }
                entrada.value = [previo, (final + provisorio).trim()].filter(Boolean).join(' ');
            };
            rec.onerror = ev => {
                nota.textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
                    ? 'Tu navegador no tiene permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.'
                    : ev.error === 'no-speech' ? 'No escuchamos nada. Probá de nuevo, más cerca del micrófono.'
                        : 'No pudimos usar el micrófono. Podés escribir tu respuesta.';
            };
            rec.onend = () => {
                rec = null;
                btn.textContent = '🎤 Hablar'; btn.setAttribute('aria-pressed', 'false');
                if (!final.trim()) return;
                // Lo que entendió el navegador es una pista de cómo se escuchó la pronunciación.
                nota.textContent = confianza < 0.7
                    ? `⚠️ Te entendimos: «${final.trim()}». No se escuchó del todo claro: revisá el texto y probá pronunciar más despacio.`
                    : `✓ Te entendimos: «${final.trim()}». Si es lo que quisiste decir, tu pronunciación se entendió bien.`;
                entrada.focus();
            };
            rec.start();
        });
        return btn;
    }

    function iniciar(cfg) {
        const { producto, raiz } = cfg;
        let estado = null;

        const cabecera = () => [el('h1', { text: cfg.titulo }), el('p', { class: 'sub', text: cfg.intro })];
        const aviso = (texto, tipo = 'err') => el('div', { class: `aviso ${tipo}`, role: 'status', text: texto });

        async function cargar() {
            raiz.replaceChildren(...cabecera(), el('p', { class: 'sub', text: 'Cargando…' }));
            try {
                estado = await api(producto);
                if (estado.activa) return chat(estado.activa);
                inicio();
            } catch (e) {
                raiz.replaceChildren(...cabecera(), aviso(e.message));
            }
        }

        function historial() {
            if (!estado.historial.length) return ''; // replaceChildren escribiría "null"
            return el('div', { class: 'card' }, el('h2', { text: 'Tus sesiones anteriores' }),
                el('div', { class: 'lista' }, estado.historial.map(h => el('button', { type: 'button', class: 'fila', onclick: () => resultado(h) },
                    el('span', {}, el('strong', { text: cfg.describir(h.contexto) }), el('span', { class: 'sub', text: ` · ${fecha(h.created_at)}` })),
                    el('span', { class: 'puntaje-chico', text: h.puntaje !== null ? `${h.puntaje}/100` : '—' })))));
        }

        function inicio(mensaje) {
            if (!estado.disponible) {
                raiz.replaceChildren(...cabecera(), el('div', { class: 'card' },
                    el('span', { class: 'chip', text: 'Próximamente' }),
                    el('p', { text: cfg.proximamente }),
                    el('div', { class: 'acciones' },
                        el('a', { class: 'btn', href: 'cv.html', text: 'Armar mi CV' }),
                        el('a', { class: 'btn ghost', href: 'index.html#tests', text: 'Hacer los tests gratis' }))), historial());
                return;
            }
            if (!estado.opciones || !estado.opciones.length) {
                raiz.replaceChildren(...cabecera(), aviso(`No pudimos cargar las opciones en este momento. Probá de nuevo en unos minutos.${estado.error_opciones ? ` (código: ${estado.error_opciones})` : ''}`), historial());
                return;
            }
            const f = cfg.formulario(estado.sugerido, estado.opciones);
            const msg = el('div');
            const btn = el('button', { type: 'submit', class: 'btn', text: 'Empezar' });
            const form = el('form', { class: 'card' }, f.nodo, msg, btn);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                let contexto;
                try { contexto = f.leer(); } catch (e) { msg.replaceChildren(aviso(e.message)); return; }
                btn.disabled = true; btn.textContent = 'Preparando…'; msg.replaceChildren();
                try {
                    const r = await api(producto, '/sesiones', contexto);
                    chat(r.sesion);
                } catch (e) {
                    btn.disabled = false; btn.textContent = 'Empezar';
                    msg.replaceChildren(aviso(e.message), e.code === 'limite' ? el('a', { class: 'btn ghost', href: 'planes-saas.html', text: 'Ver planes' }) : '');
                }
            });
            const prueba = estado.modo_prueba ? aviso('Modo prueba: solo los administradores ven esto. La venta sigue cerrada hasta cargar ALEXIO_PRODUCTOS.', 'info') : '';
            raiz.replaceChildren(...cabecera(), prueba, mensaje ? aviso(mensaje, 'info') : '', form, historial());
        }

        function burbuja(m, lang) {
            const ev = m.evaluacion;
            return el('div', { class: `msg ${m.rol === 'ia' ? 'ia' : 'yo'}` },
                el('div', { text: m.texto }),
                m.rol === 'ia' && lang && puedeLeer ? el('button', { type: 'button', class: 'escuchar', text: '🔊 Escuchar', onclick: () => leer(m.texto, lang) }) : '',
                ev && ev.has_mistake ? el('div', { class: 'correccion' },
                    el('strong', { text: '💡 Para mejorar: ' }),
                    ev.corrected_text ? el('span', { class: 'corregido', text: ev.corrected_text }) : '',
                    ev.explanation ? el('div', { class: 'sub', text: ev.explanation }) : '') : '',
                ev && ev.avanzo ? el('div', { class: 'avance', text: `✅ ¡Avanzaste!${ev.siguiente ? ` Ahora: ${ev.siguiente}` : ''}${ev.nivel ? ` (${ev.nivel})` : ''}` }) : '');
        }

        function chat(sesion) {
            const lang = cfg.idiomaVoz ? cfg.idiomaVoz(sesion.contexto) : null;
            const caja = el('div', { class: 'chat', 'aria-live': 'polite' }, sesion.mensajes.map(m => burbuja(m, lang)));
            const entrada = el('textarea', { maxlength: '2000', rows: '3', placeholder: lang && Reconocimiento ? 'Escribí o tocá 🎤 Hablar para responder en voz alta…' : 'Escribí tu respuesta…', 'aria-label': 'Tu respuesta' });
            const notaVoz = el('p', { class: 'sub nota-voz', role: 'status' });
            const mic = lang ? microfono(lang, entrada, notaVoz) : '';
            const autoLeer = lang && puedeLeer ? el('input', { type: 'checkbox', checked: leerPref() }) : null;
            if (autoLeer) autoLeer.addEventListener('change', () => guardarPref(autoLeer.checked));
            const controlesVoz = lang ? el('div', { class: 'voz' },
                autoLeer ? el('label', { class: 'sub' }, autoLeer, ' Leer las respuestas en voz alta') : '',
                notaVoz,
                Reconocimiento ? el('p', { class: 'sub privacidad-voz', text: 'El dictado lo hace tu navegador (Chrome usa servidores de Google; Edge, de Microsoft; Safari, de Apple). Puentes Globales no graba ni guarda tu voz.' }) : '') : '';
            const enviar = el('button', { type: 'button', class: 'btn', text: 'Enviar' });
            const terminar = el('button', { type: 'button', class: 'btn ghost', text: 'Terminar y ver mi resultado' });
            const msg = el('div');
            let ocupado = false;

            const bajar = () => { caja.scrollTop = caja.scrollHeight; };
            const bloquear = fin => { entrada.disabled = fin; enviar.disabled = fin; if (fin) entrada.placeholder = 'La sesión llegó a su fin. Mirá tu resultado.'; };

            async function mandar() {
                const texto = entrada.value.trim();
                if (!texto || ocupado) return;
                ocupado = true; enviar.disabled = true; enviar.textContent = 'Pensando…'; msg.replaceChildren();
                if (lang && puedeLeer) speechSynthesis.cancel();
                notaVoz.textContent = '';
                const clave = claveNueva();
                caja.append(burbuja({ rol: 'usuario', texto })); bajar();
                entrada.value = '';
                let r, intento = 0;
                while (!r) {
                    try { r = await api(producto, `/sesiones/${sesion.id}/turnos`, { mensaje: texto, clave }); }
                    catch (e) {
                        // Corte de red o servicio caído: se reintenta una vez con la misma clave (no duplica).
                        if (intento++ === 0 && (!e.status || e.status >= 500)) continue;
                        caja.lastChild.remove(); entrada.value = texto;
                        msg.replaceChildren(aviso(e.message));
                        if (e.code === 'vencida') { bloquear(true); msg.append(el('button', { type: 'button', class: 'btn', text: 'Empezar una nueva', onclick: () => inicio() })); }
                        break;
                    }
                }
                ocupado = false; enviar.textContent = 'Enviar';
                if (!r) { enviar.disabled = false; return; }
                caja.append(burbuja({ rol: 'ia', texto: r.respuesta, evaluacion: r.evaluacion }, lang)); bajar();
                if (autoLeer && autoLeer.checked) leer(r.respuesta, lang);
                bloquear(r.terminada);
                if (!r.terminada) entrada.focus();
            }

            enviar.addEventListener('click', mandar);
            entrada.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); mandar(); } });
            terminar.addEventListener('click', async () => {
                if (sesion.turnos === 0 && caja.querySelectorAll('.msg.yo').length === 0 && !confirm('Todavía no respondiste nada. ¿Terminar igual?')) return;
                terminar.disabled = true; terminar.textContent = 'Preparando tu resultado…'; bloquear(true);
                try {
                    const r = await api(producto, `/sesiones/${sesion.id}/fin`, {});
                    estado = await api(producto);
                    resultado(r.sesion);
                } catch (e) {
                    terminar.disabled = false; terminar.textContent = 'Terminar y ver mi resultado'; bloquear(false);
                    msg.replaceChildren(aviso(e.message));
                }
            });

            raiz.replaceChildren(el('h1', { text: cfg.titulo }), el('p', { class: 'sub', text: cfg.describir(sesion.contexto) }),
                el('div', { class: 'card' }, caja, entrada, el('div', { class: 'acciones' }, mic, enviar, terminar), controlesVoz, msg));
            const ultimo = sesion.mensajes[sesion.mensajes.length - 1];
            bloquear(Boolean(ultimo && ultimo.terminada));
            bajar();
            entrada.focus();
        }

        function resultado(s) {
            const r = s.resultado || {};
            const lista = (titulo, items) => items && items.length ? el('div', {}, el('h3', { text: titulo }), el('ul', {}, items.map(t => el('li', { text: t })))) : '';
            raiz.replaceChildren(el('h1', { text: 'Tu resultado' }), el('p', { class: 'sub', text: cfg.describir(s.contexto) }),
                el('div', { class: 'card' },
                    s.puntaje !== null && s.puntaje !== undefined ? el('div', { class: 'puntaje' }, el('span', { class: 'n', text: String(s.puntaje) }), el('span', { class: 'sub', text: '/100' })) : '',
                    (r.rubrica || []).length ? el('div', { class: 'rubrica' }, r.rubrica.map(c => el('div', { class: 'criterio' },
                        el('div', { class: 'fila-crit' }, el('strong', { text: c.criterio }), el('span', { text: `${c.puntaje}/10` })),
                        el('div', { class: 'barra' }, el('div', { style: `width:${Math.max(0, Math.min(10, Number(c.puntaje) || 0)) * 10}%` })),
                        c.comentario ? el('div', { class: 'sub', text: c.comentario }) : ''))) : '',
                    r.comentario_general ? el('div', {}, el('h3', { text: 'Comentario general' }), el('p', { text: r.comentario_general })) : '',
                    lista('Lo que hiciste bien', r.fortalezas),
                    lista('Para mejorar', r.a_mejorar),
                    r.siguiente_paso ? el('div', { class: 'aviso info', text: `Siguiente paso: ${r.siguiente_paso}` }) : '',
                    el('div', { class: 'acciones' }, el('button', { type: 'button', class: 'btn', text: 'Nueva sesión', onclick: () => inicio() }))),
                historial());
            window.scrollTo({ top: 0 });
        }

        PG_AUTH.requireAuth().then(cargar);
    }

    return { iniciar, el };
})();
