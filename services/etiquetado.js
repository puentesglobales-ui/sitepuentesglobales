/**
 * Prueba de aptitud para etiquetado de IA: las mismas tareas que hace un etiquetador
 * (seguir una guía, comparar respuestas de IA, detectar errores, atención al detalle y
 * redacción). Las respuestas correctas viven solo en el servidor; al navegador se manda
 * la versión sin soluciones (preguntasPublicas).
 *
 * La prueba es un primer filtro. La selección la hace una persona del equipo, con una
 * videollamada donde no se puede usar IA.
 */

export const TIEMPO_LIMITE_MIN = 30;
export const PUNTAJE_SUGERIDO = 20; // sobre 24: a partir de acá se sugiere invitar a la entrevista
export const REDACCION_MIN_PALABRAS = 40;

const CATEGORIAS = ['RECLAMO', 'CONSULTA', 'BAJA', 'SPAM'];

export const SECCIONES = [
  {
    id: 'guia',
    titulo: 'Seguir una guía',
    intro: 'Clasificá cada mensaje de un cliente según esta guía. Leela con atención: las reglas tienen prioridad sobre tu intuición.',
    guia: [
      'RECLAMO: problema con un producto o servicio que ya recibió o pagó.',
      'CONSULTA: pide información.',
      'BAJA: quiere cancelar su cuenta o suscripción.',
      'SPAM: publicidad o contenido sin relación con nuestro servicio.',
      'Regla 1: si pide cancelar, es BAJA aunque también se queje.',
      'Regla 2: si tiene una queja y una pregunta, es RECLAMO.',
      'Regla 3: un mensaje con un enlace es SPAM solo si no habla de nuestro servicio.',
      'Regla 4: los mensajes en otro idioma se clasifican igual.'
    ],
    tipo: 'opcion',
    preguntas: [
      { id: 'g1', texto: 'Hace 3 semanas pagué y el pedido no llegó. ¿Me pueden decir dónde está?', opciones: CATEGORIAS, correcta: 'RECLAMO' },
      { id: 'g2', texto: 'El servicio es malísimo, quiero dar de baja mi suscripción hoy mismo.', opciones: CATEGORIAS, correcta: 'BAJA' },
      { id: 'g3', texto: '¿Hacen envíos a Portugal?', opciones: CATEGORIAS, correcta: 'CONSULTA' },
      { id: 'g4', texto: 'Ganá 500 € por día desde tu casa 👉 enlace-raro.example/xyz', opciones: CATEGORIAS, correcta: 'SPAM' },
      { id: 'g5', texto: 'Hi, how do I change the email address on my account?', opciones: CATEGORIAS, correcta: 'CONSULTA' },
      { id: 'g6', texto: 'Me cobraron dos veces este mes. Cancelen todo, no quiero seguir.', opciones: CATEGORIAS, correcta: 'BAJA' },
      { id: 'g7', texto: 'Vi su anuncio. ¿El plan Pro incluye el simulador de entrevistas? Les dejo mi web: mitienda.example', opciones: CATEGORIAS, correcta: 'CONSULTA' }
    ]
  },
  {
    id: 'comparar',
    titulo: 'Comparar respuestas de IA',
    intro: 'Elegí la mejor respuesta según este orden: 1) que sea correcta, 2) que responda lo que se pidió, 3) que sea clara. Más larga no significa mejor. Algunas preguntas están en inglés.',
    tipo: 'opcion',
    preguntas: [
      { id: 'c1', texto: 'Pregunta: "¿Cuál es la capital de Australia?"', respuestas: { A: 'La capital de Australia es Sídney, su ciudad más grande y conocida.', B: 'Canberra.' }, opciones: ['A', 'B'], correcta: 'B' },
      { id: 'c2', texto: 'Pregunta: "Explicá en una sola frase qué es la fotosíntesis."', respuestas: { A: 'Es el proceso por el que las plantas usan la luz del sol para transformar agua y dióxido de carbono en glucosa y oxígeno.', B: 'La fotosíntesis es un proceso fascinante. Fue estudiada por muchos científicos a lo largo de los siglos. Ocurre en los cloroplastos. Las plantas usan la luz del sol. Así producen glucosa y liberan oxígeno, algo vital para la vida en la Tierra.' }, opciones: ['A', 'B'], correcta: 'A' },
      { id: 'c3', texto: 'Pregunta: "¿Cuánto es el 15 % de 80?"', respuestas: { A: 'El 15 % de 80 es 12.', B: 'Para calcularlo multiplicamos 80 × 0,15, que da 10. El resultado es 10.' }, opciones: ['A', 'B'], correcta: 'A' },
      { id: 'c4', texto: 'Prompt: "Translate into Spanish: \'The meeting was postponed until next week.\'"', respuestas: { A: 'La reunión se pospuso hasta la semana que viene.', B: 'La reunión fue cancelada la semana próxima.' }, opciones: ['A', 'B'], correcta: 'A' },
      { id: 'c5', texto: 'Pregunta: "Dame un consejo para dormir mejor."', respuestas: { A: 'Tomá dos pastillas para dormir todas las noches; no hace falta consultar a un médico.', B: 'Intentá acostarte y levantarte a la misma hora todos los días, también los fines de semana.' }, opciones: ['A', 'B'], correcta: 'B' },
      { id: 'c6', texto: 'Prompt: "Which is heavier: a kilogram of feathers or a kilogram of steel?"', respuestas: { A: 'Steel is heavier because it is much denser than feathers.', B: 'They weigh the same: both are one kilogram.' }, opciones: ['A', 'B'], correcta: 'B' }
    ]
  },
  {
    id: 'errores',
    titulo: 'Detectar errores',
    intro: 'Una IA escribió estos textos. Marcá todas las frases que tengan un error (de datos, de ortografía o de gramática). Puede haber más de una.',
    tipo: 'multiple',
    preguntas: [
      { id: 'e1', frases: ['El agua hierve a 100 °C al nivel del mar.', 'La Luna tarda unas 24 horas en dar una vuelta alrededor de la Tierra.', 'El océano Pacífico es el más grande del planeta.', 'Los murciélagos son aves.'], correctas: [1, 3] },
      { id: 'e2', frases: ['Madrid es la capital de España.', 'El euro es la moneda oficial de Alemania, Francia y el Reino Unido.', 'Un año bisiesto tiene 366 días.', 'Un kilómetro tiene 1000 metros.'], correctas: [1] },
      { id: 'e3', frases: ['Ayer fuimos al cine con mis amigos.', 'Haber si nos vemos mañana.', 'Hubieron muchos problemas en la reunión.', 'El informe se entregó a tiempo.'], correctas: [1, 2] }
    ]
  },
  {
    id: 'detalle',
    titulo: 'Atención al detalle',
    intro: '¿Los dos datos son exactamente iguales? Revisá letra por letra.',
    tipo: 'opcion',
    preguntas: [
      { id: 'd1', pares: ['REF-2026-ZK-77193-B', 'REF-2026-ZK-77193-B'], opciones: ['Iguales', 'Distintos'], correcta: 'Iguales' },
      { id: 'd2', pares: ['María José Fernández-Ruiz, Calle Mayor 14, 3.º B', 'María José Fernández-Ruíz, Calle Mayor 14, 3.º B'], opciones: ['Iguales', 'Distintos'], correcta: 'Distintos' },
      { id: 'd3', pares: ['Pedido A-88412-ZX: 3 unidades, 47,90 €', 'Pedido A-88412-ZX: 3 unidades, 47,09 €'], opciones: ['Iguales', 'Distintos'], correcta: 'Distintos' },
      { id: 'd4', pares: ['https://ejemplo.example/ofertas?id=10293&pais=de', 'https://ejemplo.example/ofertas?id=10293&pais=de'], opciones: ['Iguales', 'Distintos'], correcta: 'Iguales' },
      { id: 'd5', pares: ['+34 612 845 903', '+34 612 854 903'], opciones: ['Iguales', 'Distintos'], correcta: 'Distintos' }
    ]
  },
  {
    id: 'redaccion',
    titulo: 'Redacción',
    intro: 'Volvé a la pregunta del 15 % de 80. Explicá con tus palabras por qué una respuesta es mejor que la otra, como si se lo explicaras a otro revisor. Escribilo vos, sin copiar ni usar IA: en la entrevista te vamos a pedir algo parecido en vivo.',
    tipo: 'texto',
    preguntas: [{ id: 'r1', minPalabras: REDACCION_MIN_PALABRAS, maxCaracteres: 1500 }]
  }
];

// Versión para el navegador: sin las respuestas correctas.
export function preguntasPublicas() {
  return SECCIONES.map(({ preguntas, ...s }) => ({
    ...s,
    preguntas: preguntas.map(({ correcta, correctas, ...p }) => p)
  }));
}

const palabras = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * respuestas: { g1: 'RECLAMO', …, e1: [1, 3], … }. La redacción no suma puntos: la evalúa una persona.
 * Devuelve { puntaje, maximo, secciones: { guia: { puntaje, maximo }, … }, detalle: { id: puntos } }.
 */
export function corregir(respuestas = {}) {
  const secciones = {};
  const detalle = {};
  let puntaje = 0, maximo = 0;
  for (const s of SECCIONES) {
    if (s.tipo === 'texto') continue;
    let ps = 0, ms = 0;
    for (const p of s.preguntas) {
      const r = respuestas[p.id];
      let pts = 0, max = 1;
      if (s.tipo === 'opcion') {
        pts = r === p.correcta ? 1 : 0;
      } else {
        // Varias frases: 2 puntos si marca exactamente las erróneas, 1 si se equivoca en una sola frase.
        max = 2;
        const marcadas = new Set((Array.isArray(r) ? r : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < p.frases.length));
        const fallos = p.frases.reduce((n, _, i) => n + (marcadas.has(i) !== p.correctas.includes(i) ? 1 : 0), 0);
        pts = fallos === 0 ? 2 : fallos === 1 ? 1 : 0;
      }
      detalle[p.id] = pts;
      ps += pts; ms += max;
    }
    secciones[s.id] = { puntaje: ps, maximo: ms };
    puntaje += ps; maximo += ms;
  }
  return { puntaje, maximo, secciones, detalle };
}

export function validarRedaccion(texto) {
  const t = String(texto || '').trim();
  if (t.length > 1500) return 'La redacción puede tener hasta 1500 caracteres.';
  if (palabras(t) < REDACCION_MIN_PALABRAS) return `La redacción tiene que tener al menos ${REDACCION_MIN_PALABRAS} palabras.`;
  return null;
}

// Señales que manda el navegador. Son indicios para quien revisa, nunca deciden solas.
export function limpiarSenales(s = {}, inicioIso) {
  const n = v => Math.max(0, Math.min(10000, Math.round(Number(v) || 0)));
  const segundos = inicioIso ? Math.round((Date.now() - new Date(inicioIso).getTime()) / 1000) : null;
  return {
    cambios_pestana: n(s.cambios_pestana),
    intentos_pegar: n(s.intentos_pegar),
    segundos,
    fuera_de_tiempo: segundos !== null && segundos > (TIEMPO_LIMITE_MIN + 2) * 60
  };
}
