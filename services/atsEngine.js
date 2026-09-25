/**
 * Motor de Evaluación y Filtro ATS para CVs
 * Analiza compatibilidad de CVs con requerimientos laborales en Europa
 */

const COMMON_EU_KEYWORDS = {
  tech: ['javascript', 'python', 'react', 'node.js', 'docker', 'aws', 'sql', 'git', 'ci/cd', 'typescript', 'api', 'scrum'],
  health: ['enfermería', 'médico', 'cuidados', 'diagnóstico', 'farmacia', 'primeros auxilios', 'salud pública', 'pacientes', 'bls'],
  engineering: ['autocad', 'gestión de proyectos', 'plclogic', 'mantenimiento', 'mantenimiento industrial', 'iso 9001', 'seguridad industrial', 'matlab'],
  general: ['inglés', 'alemán', 'español', 'liderazgo', 'trabajo en equipo', 'comunicación', 'resolución de problemas', 'europass']
};

export class ATSEngine {
  static analyzeCV(cvText = '', jobTitle = '', jobDescription = '') {
    const textLower = cvText.toLowerCase();
    const targetLower = (jobTitle + ' ' + jobDescription).toLowerCase();

    // 1. Detección de Secciones Clave
    const sectionsFound = {
      experiencia: /experiencia|laboral|work experience|employment/i.test(cvText),
      educacion: /educación|formación|education|degree|universidad/i.test(cvText),
      habilidades: /habilidades|skills|aptitudes|competencias/i.test(cvText),
      contacto: /email|correo|teléfono|phone|linkedin/i.test(cvText)
    };

    const sectionScore = (Object.values(sectionsFound).filter(Boolean).length / 4) * 25; // Max 25 pts

    // 2. Coincidencia de Palabras Clave y Habilidades
    let matchedKeywords = [];
    let missingKeywords = [];
    
    // Extraer palabras clave del job target si existe o de la lista común
    const keywordsToTest = new Set([
      ...COMMON_EU_KEYWORDS.tech,
      ...COMMON_EU_KEYWORDS.health,
      ...COMMON_EU_KEYWORDS.engineering,
      ...COMMON_EU_KEYWORDS.general
    ]);

    if (jobDescription) {
      const words = targetLower.match(/\b[a-záéíóúñ]{4,}\b/gi) || [];
      words.slice(0, 30).forEach(w => keywordsToTest.add(w));
    }

    keywordsToTest.forEach(kw => {
      if (textLower.includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
      } else if (targetLower.includes(kw.toLowerCase())) {
        missingKeywords.push(kw);
      }
    });

    const skillScore = Math.min(50, matchedKeywords.length * 5); // Max 50 pts

    // 3. Formato y Recomendaciones EU
    const hasIdiomas = /inglés|english|alemán|german|francés|french|b2|c1|c2|b1/i.test(cvText);
    const hasEuropass = /europass|visa|permiso de trabajo|visado|pasaporte/i.test(cvText);
    
    let formatScore = 15;
    if (hasIdiomas) formatScore += 5;
    if (hasEuropass) formatScore += 5;

    const totalScore = Math.min(100, Math.round(sectionScore + skillScore + formatScore));

    // 4. Recomendaciones Personalizadas
    const recommendations = [];
    if (!sectionsFound.experiencia) recommendations.push('Añade una sección clara de "Experiencia Laboral" con logros cuantificables.');
    if (!sectionsFound.contacto) recommendations.push('Incluye tus datos de contacto directos (Email, Teléfono con prefijo internacional, LinkedIn).');
    if (!hasIdiomas) recommendations.push('Especifica tu nivel de idiomas (Inglés, Alemán, etc.) según el Marco Común Europeo (A2, B2, C1).');
    if (!hasEuropass) recommendations.push('Menciona tu estado de visado o ciudadanía para facilitar la contratación en empresas europeas.');
    if (missingKeywords.length > 0) {
      recommendations.push(`Incorpora términos relevantes detectados en la oferta: ${missingKeywords.slice(0, 5).join(', ')}.`);
    }

    return {
      score: totalScore,
      rating: totalScore >= 75 ? 'Excelente' : totalScore >= 50 ? 'Bueno / Competitivo' : 'Requiere Mejoras ATS',
      breakdown: {
        estructura: Math.round(sectionScore),
        habilidades: Math.round(skillScore),
        formatoEuropa: formatScore
      },
      keywordsFound: matchedKeywords.slice(0, 15),
      recommendations: recommendations.length > 0 ? recommendations : ['¡Tu CV cumple con altos estándares ATS para Europa!']
    };
  }
}
