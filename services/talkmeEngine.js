/**
 * Motor conversacional ALEX IO & TalkMe conectado a IA Generativa (Gemini / OpenAI)
 * Soporta API Keys dinámicas desde variables de entorno (.env en Render)
 */

const ALEX_SYSTEM_PROMPT = `
Eres ALEX IO, el asistente virtual y consultor experto en relocalización laboral y movilidad profesional a Europa de PuentesGlobales.
Tu misión es guiar a profesionales, técnicos y trabajadores de todos los rubros para emigrar y conseguir empleo legalmente en países europeos (España, Alemania, Francia, Italia, Reino Unido, Irlanda, etc.).
Respuestas breves, empáticas, profesionales y estructuradas con emojis.
Proporciona orientación sobre:
- Visados y homologación (Blue Card de la UE, Chancenkarte en Alemania, Ley de Nietos en España, etc.).
- Formato de CV europeo (Europass, palabras clave ATS, adaptación de experiencia).
- Certificación de idiomas (Inglés B2/C1, Alemán B2).
`;

export class TalkMeEngine {
  /**
   * Genera respuestas de simulador de entrevista de trabajo según el puesto objetivo
   */
  static generateInterviewQuestion(jobTitle = 'General', candidateAnswer = '', step = 1) {
    const questionsByRole = {
      tech: [
        `Bienvenido a la entrevista para el puesto de ${jobTitle}. Háblame de tu experiencia principal y qué arquitecturas o tecnologías dominas.`,
        `Excelente. En un entorno laboral europeo con equipos distribuidos, ¿cómo gestionas la entrega de código, las pruebas unitarias y el control de calidad?`,
        `Cuéntame sobre una situación en la que tuviste un desacuerdo técnico con un compañero o cliente y cómo lo resolviste.`
      ],
      health: [
        `Bienvenido/a. Para la posición en el sector salud como ${jobTitle}, ¿cuál es tu formación oficial y qué homologación o título posees?`,
        `En hospitales o clínicas europeas, la atención al paciente bajo presión es clave. ¿Cómo manejas turnos exigentes y la comunicación con pacientes de diversos orígenes?`,
        `¿Cuál es tu nivel de idioma (Inglés, Alemán o Francés) para la comunicación médica diaria y la redacción de informes?`
      ],
      general: [
        `Hola, bienvenido/a a la entrevista para ${jobTitle} en Europa. ¿Podrías presentarte brevemente y resumir tu trayectoria laboral relevante?`,
        `¿Qué te motiva a relocalizarte laboralmente en Europa en este momento de tu carrera?`,
        `¿Cuáles consideras que son tus 3 mayores fortalezas profesionales y cómo las aplicarías en tu primer mes de trabajo?`
      ]
    };

    let roleType = 'general';
    const titleLower = jobTitle.toLowerCase();
    if (titleLower.includes('developer') || titleLower.includes('software') || titleLower.includes('tech') || titleLower.includes('it') || titleLower.includes('programador')) {
      roleType = 'tech';
    } else if (titleLower.includes('médico') || titleLower.includes('enfermer') || titleLower.includes('salud') || titleLower.includes('doctor')) {
      roleType = 'health';
    }

    const roleQuestions = questionsByRole[roleType] || questionsByRole.general;
    const currentQuestionIndex = Math.min(step - 1, roleQuestions.length - 1);
    const nextQuestion = roleQuestions[currentQuestionIndex];

    let feedback = '';
    if (candidateAnswer) {
      if (candidateAnswer.length > 50) {
        feedback = '✓ Buena profundidad en tu respuesta. Demuestras seguridad y claridad en tus conceptos.';
      } else {
        feedback = '💡 Consejo: En entrevistas europeas se valora la precisión. Trata de expandir tus respuestas con ejemplos concretos (método STAR: Situación, Tarea, Acción, Resultado).';
      }
    }

    return {
      step,
      totalSteps: roleQuestions.length,
      question: nextQuestion,
      feedback,
      isCompleted: step >= roleQuestions.length
    };
  }

  /**
   * Asistente ALEX IO con soporte para Gemini API, OpenAI API o Base de Conocimientos Experta
   */
  static async chatWithAlex(message = '') {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    // 1. Intentar llamar a Gemini 2.0 Flash si la API Key está configurada en Render
    if (geminiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${ALEX_SYSTEM_PROMPT}\n\nPregunta del usuario: ${message}` }]
              }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) return { reply: replyText };
        }
      } catch (err) {
        console.warn('⚠️ Error al consultar Gemini API, usando motor de respaldo:', err.message);
      }
    }

    // 2. Intentar consultar OpenAI GPT si la clave está disponible
    if (openAiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: ALEX_SYSTEM_PROMPT },
              { role: 'user', content: message }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const replyText = data.choices?.[0]?.message?.content;
          if (replyText) return { reply: replyText };
        }
      } catch (err) {
        console.warn('⚠️ Error al consultar OpenAI API:', err.message);
      }
    }

    // 3. Base de Conocimientos de Respaldo Inteligente (si no hay llaves API en .env)
    const msgLower = message.toLowerCase();
    if (msgLower.includes('visa') || msgLower.includes('visado') || msgLower.includes('permiso')) {
      return {
        reply: "🇪🇺 Para trabajar legalmente en Europa requieres una visa de trabajo (ej. Blue Card de la UE para profesionales cualificados, Visa de Profesional Altamente Cualificado en España o Chancenkarte en Alemania). ¿Tienes título universitario o más de 3 años de experiencia demostrable?"
      };
    } else if (msgLower.includes('idioma') || msgLower.includes('inglés') || msgLower.includes('alemán')) {
      return {
        reply: "🗣️ El nivel de idioma recomendado para empresas internacionales en Europa es B2/C1 en Inglés. Para países como Alemania u Holanda en sectores regulados (salud/educación), se exige certificación oficial B2 en el idioma local."
      };
    } else if (msgLower.includes('cv') || msgLower.includes('europass')) {
      return {
        reply: "📄 Te recomiendo adaptar tu CV al formato estándar Europass o formato limpio de 1 o 2 páginas sin foto personal si aplicas a países anglosajones/nórdicos. Puedes pasar tu CV por nuestro Escáner ATS en la web para medir tu compatibilidad."
      };
    } else {
      return {
        reply: "¡Hola! 👋 Soy ALEX IO, tu consultor de inteligencia artificial para relocalización laboral en Europa. Puedo ayudarte a preparar tu CV para filtros ATS, evaluar tu idoneidad o resolver dudas sobre ofertas de trabajo y visados."
      };
    }
  }
}
