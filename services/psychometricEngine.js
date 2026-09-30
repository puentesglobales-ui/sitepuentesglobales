/**
 * Motor de Evaluación Psicométrica y Diagnóstico Laboral
 * Evalúa idoneidad profesional y adaptabilidad para relocalización laboral en Europa
 */

export const PSYCHOMETRIC_QUESTIONS = [
  {
    id: 1,
    question: "¿Cómo reaccionas ante un cambio inesperado en los procedimientos de tu trabajo?",
    options: [
      { text: "Me adapto rápidamente y busco aprender la nueva metodología.", points: { adaptabilidad: 3, autonomia: 2 } },
      { text: "Analizo los motivos del cambio antes de ajustar mi rutina.", points: { adaptabilidad: 2, comunicacion: 2 } },
      { text: "Prefiero seguir con los métodos probados que conozco.", points: { adaptabilidad: 1, autonomia: 1 } }
    ]
  },
  {
    id: 2,
    question: "En un equipo de trabajo multicultural con opiniones divididas, ¿cuál es tu rol habitual?",
    options: [
      { text: "Escucho activamente y busco puntos en común para llegar a consensos.", points: { comunicacion: 3, adaptabilidad: 2 } },
      { text: "Tomo la iniciativa para proponer una solución estructurada.", points: { motivacion: 3, autonomia: 2 } },
      { text: "Me enfoco estrictamente en completar mis tareas asignadas.", points: { autonomia: 2, adaptabilidad: 1 } }
    ]
  },
  {
    id: 3,
    question: "Ante la barrera del idioma o modismos locales en un nuevo entorno laboral, tú:",
    options: [
      { text: "Utilizo herramientas de traducción y practico proactivamente todos los días.", points: { motivacion: 3, adaptabilidad: 3 } },
      { text: "Pido ayuda a compañeros bilingües mientras gano confianza.", points: { comunicacion: 3, adaptabilidad: 2 } },
      { text: "Procuro comunicarme solo lo estrictamente necesario por escrito.", points: { adaptabilidad: 1, comunicacion: 1 } }
    ]
  },
  {
    id: 4,
    question: "Cuando enfrentas una fecha límite muy ajustada con alta carga de trabajo:",
    options: [
      { text: "Priorizo tareas críticas, mantengo la calma y ejecuto con foco.", points: { autonomia: 3, motivacion: 2 } },
      { text: "Comunico de inmediato el estado al equipo para renegociar plazos.", points: { comunicacion: 3, autonomia: 2 } },
      { text: "Siento estrés pero trato de avanzar lo más rápido posible.", points: { autonomia: 1, adaptabilidad: 2 } }
    ]
  },
  {
    id: 5,
    question: "¿Cuál es tu principal motivación para buscar una oportunidad laboral en Europa?",
    options: [
      { text: "Crecimiento profesional a largo plazo e inmersión en una nueva cultura.", points: { motivacion: 3, adaptabilidad: 3 } },
      { text: "Estabilidad económica y mejor calidad de vida para mí y mi entorno.", points: { motivacion: 3, autonomia: 2 } },
      { text: "Explorar opciones temporales de experiencia internacional.", points: { adaptabilidad: 2, motivacion: 1 } }
    ]
  }
];

export class PsychometricEngine {
  static getQuestions() {
    return PSYCHOMETRIC_QUESTIONS.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options.map((o, idx) => ({ index: idx, text: o.text }))
    }));
  }

  // Puntaje máximo alcanzable por dimensión: la mejor opción de cada pregunta para esa dimensión.
  static maxPerCategory() {
    const max = { adaptabilidad: 0, comunicacion: 0, autonomia: 0, motivacion: 0 };
    for (const q of PSYCHOMETRIC_QUESTIONS) {
      for (const key of Object.keys(max)) {
        max[key] += Math.max(...q.options.map(o => o.points[key] || 0));
      }
    }
    return max;
  }

  static evaluateTest(answers = []) {
    let scores = {
      adaptabilidad: 0,
      comunicacion: 0,
      autonomia: 0,
      motivacion: 0
    };

    answers.forEach(ans => {
      const q = PSYCHOMETRIC_QUESTIONS.find(item => item.id === ans.questionId);
      if (q && q.options[ans.optionIndex]) {
        const points = q.options[ans.optionIndex].points;
        for (const [key, val] of Object.entries(points)) {
          scores[key] = (scores[key] || 0) + val;
        }
      }
    });

    const max = PsychometricEngine.maxPerCategory();
    const pct = key => Math.min(100, Math.round((scores[key] / max[key]) * 100));
    const percentages = {
      adaptabilidad: pct('adaptabilidad'),
      comunicacion: pct('comunicacion'),
      autonomia: pct('autonomia'),
      motivacion: pct('motivacion')
    };

    const overallScore = Math.round(
      (percentages.adaptabilidad + percentages.comunicacion + percentages.autonomia + percentages.motivacion) / 4
    );

    let diagnostic = '';
    if (overallScore >= 80) {
      diagnostic = 'Perfil con Alta Idoneidad y Preparación Migratoria. Tienes un perfil resiliente, proactivo y altamente adaptable a entornos profesionales europeos.';
    } else if (overallScore >= 60) {
      diagnostic = 'Perfil Competitivo. Posees buena flexibilidad laboral. Te recomendamos reforzar la práctica de idiomas y la comunicación en entornos multiculturales.';
    } else {
      diagnostic = 'Perfil en Desarrollo. Recomendamos orientación laboral personalizada para potenciar tus competencias de adaptación antes de iniciar postulaciones activas.';
    }

    return {
      overallScore,
      diagnostic,
      dimensions: percentages,
      timestamp: new Date().toISOString()
    };
  }
}
