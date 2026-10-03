/**
 * Guía del creador de CV: formato e idioma de cada país, consejos según el puesto y
 * revisión automática de los errores más comunes. Funciona en el navegador (window.CV_GUIA)
 * y en Node para los tests (globalThis.CV_GUIA).
 */
(function (raiz) {
    const DESTINOS = {
        es: { nombre: 'España', idioma: 'es', idiomaNombre: 'español', formato: 'europass' },
        de: { nombre: 'Alemania', idioma: 'de', idiomaNombre: 'alemán', formato: 'lebenslauf' },
        at: { nombre: 'Austria', idioma: 'de', idiomaNombre: 'alemán', formato: 'lebenslauf' },
        ch: { nombre: 'Suiza', idioma: 'de', idiomaNombre: 'alemán o francés', formato: 'lebenslauf' },
        gb: { nombre: 'Reino Unido', idioma: 'en', idiomaNombre: 'inglés', formato: 'uk' },
        ie: { nombre: 'Irlanda', idioma: 'en', idiomaNombre: 'inglés', formato: 'uk' },
        nl: { nombre: 'Países Bajos', idioma: 'nl', idiomaNombre: 'neerlandés (en muchas empresas alcanza el inglés)', formato: 'europass' },
        be: { nombre: 'Bélgica', idioma: 'nl', idiomaNombre: 'neerlandés o francés', formato: 'europass' },
        fr: { nombre: 'Francia', idioma: 'fr', idiomaNombre: 'francés', formato: 'europass' },
        it: { nombre: 'Italia', idioma: 'it', idiomaNombre: 'italiano', formato: 'europass' },
        pl: { nombre: 'Polonia', idioma: 'pl', idiomaNombre: 'polaco', formato: 'europass' },
        pt: { nombre: 'Portugal', idioma: 'pt', idiomaNombre: 'portugués', formato: 'europass' },
        us: { nombre: 'Estados Unidos', idioma: 'en', idiomaNombre: 'inglés', formato: 'us' },
        ca: { nombre: 'Canadá', idioma: 'en', idiomaNombre: 'inglés', formato: 'us' }
    };

    // Idioma del perfil (como lo carga la persona, con o sin tildes) → código.
    const IDIOMA_COD = { espanol: 'es', ingles: 'en', aleman: 'de', neerlandes: 'nl', holandes: 'nl', frances: 'fr', italiano: 'it', polaco: 'pl', portugues: 'pt' };
    const IDIOMAS_LISTA = ['Español', 'Inglés', 'Alemán', 'Neerlandés', 'Francés', 'Italiano', 'Polaco', 'Portugués'];
    const NIVELES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Nativo'];
    const NIVEL_DESC = {
        A1: 'Frases básicas', A2: 'Situaciones simples y conocidas', B1: 'Me desenvuelvo en el trabajo cotidiano',
        B2: 'Converso con fluidez con nativos', C1: 'Uso profesional y académico', C2: 'Dominio completo', Nativo: 'Lengua materna'
    };
    const nivelNum = n => NIVELES.indexOf(n);

    const FORMATOS = {
        lebenslauf: { nombre: 'Lebenslauf (alemán)', nota: 'Tabla cronológica inversa, con mes y año en cada etapa. La foto y la fecha de nacimiento son habituales pero opcionales. Suele cerrar con lugar, fecha y firma.' },
        uk: { nombre: 'CV británico', nota: 'Sin foto, sin fecha de nacimiento ni estado civil. Dos páginas como máximo, con un "personal statement" al principio.' },
        us: { nombre: 'Résumé (EE. UU. y Canadá)', nota: 'Una página (dos si tenés mucha experiencia). Sin foto, edad, estado civil ni nacionalidad: las leyes contra la discriminación hacen que las empresas los descarten. Logros con números y verbos de acción.' },
        europass: { nombre: 'Europass', nota: 'Formato estándar de la Unión Europea, aceptado en todos los países. Incluye la tabla de idiomas con niveles A1 a C2.' }
    };

    function formatoPara(paises = []) {
        const p = paises.find(c => DESTINOS[c]);
        return p ? DESTINOS[p].formato : 'europass';
    }

    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const codigoIdioma = nombre => IDIOMA_COD[norm(nombre).trim()] || null;

    function mesesEntre(a, b) {
        const [ay, am] = String(a).split('-').map(Number);
        const [by, bm] = String(b).split('-').map(Number);
        return (by - ay) * 12 + (bm - am);
    }
    const hoyMes = () => new Date().toISOString().slice(0, 7);

    // Consejos del primer paso: se muestran en cuanto la persona elige puesto y destino.
    function consejosObjetivo({ puesto, paises = [], regulada, experiencia_puesto }) {
        const c = [];
        if (!puesto) return c;
        const destinos = paises.filter(p => DESTINOS[p]);
        if (regulada) {
            c.push({ tipo: 'importante', texto: `${puesto} es una profesión regulada: para trabajar de eso necesitás que tu título esté reconocido en cada país (en Alemania se llama "Anerkennung"). Sin el reconocimiento muchas empresas no pueden contratarte en ese puesto. Iniciá el trámite cuanto antes y mencionalo en el CV.` });
            if (destinos.some(p => ['de', 'at', 'ch'].includes(p))) c.push({ tipo: 'importante', texto: 'En salud, para el reconocimiento en Alemania y Austria normalmente se pide alemán nivel B2.' });
        }
        for (const p of destinos) {
            const d = DESTINOS[p];
            if (d.idioma !== 'es') c.push({ tipo: 'consejo', texto: `${d.nombre}: las empresas esperan el CV en ${d.idioma === 'en' ? 'inglés' : `${d.idiomaNombre} o en inglés`}, en formato ${FORMATOS[d.formato].nombre}.` });
        }
        if (destinos.some(p => ['us', 'ca'].includes(p))) c.push({ tipo: 'importante', texto: 'Para trabajar en Estados Unidos o Canadá necesitás una visa o permiso de trabajo, y muchas empresas no lo tramitan. En cada oferta fijate si dice "visa sponsorship".' });
        if (destinos.length > 2) c.push({ tipo: 'consejo', texto: 'Postularte a muchos países a la vez dispersa el esfuerzo: cada uno pide otro idioma y otro formato de CV. Empezá por uno o dos.' });
        if (experiencia_puesto === 'ninguna') c.push({ tipo: 'consejo', texto: 'Si nunca trabajaste de esto, destacá tareas parecidas de otros trabajos, cursos y prácticas. Buscá también puestos de entrada (ayudante, auxiliar, junior).' });
        c.push({ tipo: 'consejo', texto: 'Un CV para cada puesto: el que armes acá apunta a este puesto. Si después te postulás a otro, conviene adaptarlo.' });
        return c;
    }

    // Revisión completa: errores (bloquean un buen CV) y avisos (mejoras).
    function revisar(perfil = {}, contacto = {}) {
        const r = [];
        const add = (nivel, paso, texto) => r.push({ nivel, paso, texto });
        const paises = (perfil.paises || []).filter(p => DESTINOS[p]);
        const exp = perfil.experiencia || [];
        const form = perfil.formacion || [];
        const idiomas = perfil.idiomas || [];

        if (!perfil.puesto) add('error', 1, 'Falta el puesto al que te vas a postular.');
        if (!paises.length) add('error', 1, 'Elegí al menos un país de destino.');

        if (!contacto.telefono) add('error', 2, 'Falta tu teléfono.');
        else if (!String(contacto.telefono).trim().startsWith('+')) add('aviso', 2, 'Escribí el teléfono con el código de país (por ejemplo +54…): desde Europa no te pueden llamar sin él.');

        if (!exp.length) {
            add(perfil.experiencia_puesto && perfil.experiencia_puesto !== 'ninguna' ? 'error' : 'aviso', 3,
                perfil.experiencia_puesto && perfil.experiencia_puesto !== 'ninguna' ? 'Dijiste que tenés experiencia en el puesto pero no cargaste ningún trabajo.' : 'No cargaste experiencia laboral: sumá trabajos, prácticas o voluntariados.');
        }
        const ordenada = [...exp].sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')));
        ordenada.forEach((e, i) => {
            const nombre = e.cargo || `Trabajo ${i + 1}`;
            if (!e.cargo || !e.empresa) add('error', 3, `${nombre}: falta el cargo o la empresa.`);
            if (!e.desde) add('error', 3, `${nombre}: falta la fecha de inicio (mes y año).`);
            if (!e.actual && !e.hasta) add('aviso', 3, `${nombre}: indicá cuándo terminó o marcalo como trabajo actual.`);
            if (e.desde && e.hasta && !e.actual && mesesEntre(e.desde, e.hasta) < 0) add('error', 3, `${nombre}: la fecha de fin es anterior a la de inicio.`);
            if (e.desde && e.desde > hoyMes()) add('error', 3, `${nombre}: la fecha de inicio está en el futuro.`);
            if (!e.tareas || e.tareas.trim().length < 40) add('aviso', 3, `${nombre}: contá qué hacías y qué lograste (2 a 4 líneas, empezando con un verbo: "Atendí…", "Coordiné…").`);
            if (e.tareas && /(\b|^)(responsable de todo|varias tareas|etc\.?)(\b|$)/i.test(e.tareas)) add('aviso', 3, `${nombre}: evitá frases vagas como "varias tareas" o "etc.": nombrá tareas concretas.`);
            const siguiente = ordenada[i + 1];
            if (siguiente && e.desde && siguiente.hasta && !siguiente.actual && mesesEntre(siguiente.hasta, e.desde) > 12) {
                add('aviso', 3, `Hay más de un año sin experiencia antes de "${nombre}": explicalo en una línea (estudios, cuidado familiar, mudanza).`);
            }
        });
        if (perfil.puesto && exp.length) {
            const palabras = norm(perfil.puesto).split(/[\s/]+/).filter(w => w.length > 3).map(w => w.slice(0, 5));
            const relacionada = exp.some(e => palabras.some(w => norm(`${e.cargo} ${e.tareas}`).includes(w)));
            if (!relacionada) add('aviso', 3, `Ninguna experiencia menciona "${perfil.puesto}": poné primero los trabajos y tareas más parecidos al puesto.`);
        }

        if (!form.length) add('aviso', 4, 'Agregá tu formación: el título más alto alcanzado y cursos relacionados con el puesto.');
        form.forEach((f, i) => { if (!f.titulo || !f.institucion) add('error', 4, `Formación ${i + 1}: falta el título o la institución.`); });
        if (perfil.regulada && !form.some(f => ['reconocido', 'en_tramite'].includes(f.reconocimiento))) {
            add('error', 4, 'Es una profesión regulada: indicá si tu título está reconocido o el reconocimiento en trámite en el país de destino.');
        }

        for (const p of paises) {
            const d = DESTINOS[p];
            if (d.idioma === 'es') continue;
            const delPais = idiomas.find(x => codigoIdioma(x.idioma) === d.idioma);
            const ingles = idiomas.find(x => codigoIdioma(x.idioma) === 'en');
            if (!delPais && !(ingles && nivelNum(ingles.nivel) >= nivelNum('B2'))) {
                add('error', 5, `Para ${d.nombre} indicá tu nivel de ${d.idiomaNombre.split(' ')[0]} (aunque sea básico) o de inglés.`);
            } else if (delPais) {
                const minimo = perfil.regulada ? 'B2' : 'B1';
                if (nivelNum(delPais.nivel) >= 0 && nivelNum(delPais.nivel) < nivelNum(minimo)) {
                    add('aviso', 5, `Tu nivel de ${String(delPais.idioma).toLowerCase()} es ${delPais.nivel}. Para trabajar de esto en ${d.nombre} suele pedirse ${minimo}: indicá si estás estudiando y cuándo rendís el examen.`);
                }
            }
        }
        idiomas.forEach(x => { if (x.nivel && nivelNum(x.nivel) >= nivelNum('B2') && x.nivel !== 'Nativo' && !x.certificado) add('aviso', 5, `${x.idioma} ${x.nivel}: si tenés un certificado (Goethe, IELTS, DELF…), agregalo; pesa mucho.`); });

        if (/chofer|conductor|camion/.test(norm(perfil.puesto)) && !(perfil.licencias || []).length) add('error', 6, 'Para trabajar de chofer indicá tus licencias de conducir (B, C, C+E, D, CAP).');
        if (!(perfil.habilidades || []).length) add('aviso', 6, 'Agregá 4 a 8 habilidades concretas del puesto (programas, máquinas, técnicas).');

        if (/\[[^\]]*\]/.test(perfil.resumen || '')) add('error', 7, 'Tu resumen todavía tiene partes del modelo entre corchetes [ ]: reemplazalas con tus datos.');
        else if (!perfil.resumen || perfil.resumen.trim().length < 80) add('aviso', 7, 'Escribí un resumen de 3 a 4 líneas: quién sos, tu experiencia clave para el puesto y qué buscás.');
        else if (perfil.resumen.length > 600) add('aviso', 7, 'El resumen es largo: dejalo en 3 a 4 líneas.');

        const errores = r.filter(x => x.nivel === 'error').length;
        const avisos = r.filter(x => x.nivel === 'aviso').length;
        return { items: r, errores, avisos, puntaje: Math.max(0, 100 - errores * 15 - avisos * 5) };
    }

    const api = { DESTINOS, NIVELES, NIVEL_DESC, FORMATOS, IDIOMAS_LISTA, formatoPara, consejosObjetivo, revisar, mesesEntre, codigoIdioma };
    raiz.CV_GUIA = api;
})(typeof window !== 'undefined' ? window : globalThis);
