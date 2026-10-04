/**
 * Motor SaaS Enterprise: Suscripciones, Cuotas y Multi-tenancy
 *
 * Los planes pagos de candidatos cubren solo servicios de preparación
 * (escáner ATS, simulador de entrevistas, curso). Buscar ofertas y postularse
 * es gratis e ilimitado en todos los planes: no se cobra por acceder al empleo.
 *
 * Límites de herramientas: cantidad TOTAL de usos por cuenta (no por día).
 * null = ilimitado. Se cuentan en Supabase (tabla pg_uso), ver services/usage.js.
 */

export const SAAS_PLANS = {
  FREE: {
    name: 'Plan Gratuito',
    limits: { ats: 1, entrevista: 1, idiomas: 1 },
    price: '$0 / mes'
  },
  PRO: {
    name: 'Plan Profesional',
    limits: { ats: null, entrevista: null, idiomas: null },
    price: '$19 / mes'
  },
  ENTERPRISE: {
    name: 'Plan Enterprise Multi-Tenant',
    limits: { ats: null, entrevista: null, idiomas: null },
    alexWhatsAppBot: true,
    whitelabelBranding: true,
    price: '$99 / mes'
  }
};

export const HERRAMIENTAS = {
  ats: 'escaneo ATS',
  entrevista: 'entrevista simulada',
  idiomas: 'clase de idiomas'
};

export class SaasCore {
  // plan: valor de la columna pg_planes.plan ('pro', 'enterprise') o null para gratis.
  static getUserPlan(plan) {
    if (plan === 'enterprise') return SAAS_PLANS.ENTERPRISE;
    if (plan === 'pro') return SAAS_PLANS.PRO;
    return SAAS_PLANS.FREE;
  }

  // Decide si se puede usar una herramienta dado el plan y los usos ya hechos.
  static canUse(plan, herramienta, usosPrevios) {
    const p = this.getUserPlan(plan);
    const limit = p.limits[herramienta];
    if (limit === undefined) throw new Error(`Herramienta desconocida: ${herramienta}`);
    if (limit === null || usosPrevios < limit) {
      return { allowed: true, limit, used: usosPrevios, planName: p.name };
    }
    return {
      allowed: false,
      limit,
      used: usosPrevios,
      planName: p.name,
      message: `Ya usaste tu ${HERRAMIENTAS[herramienta]} gratis. Para seguir sin límite, comprá la herramienta sola o en un combo.`
    };
  }

  static getTenantConfig(domainOrId = 'default') {
    return {
      tenantId: domainOrId,
      brandName: 'PuentesGlobales Enterprise',
      logoUrl: '/assets/img/hero.png',
      accentColor: '#2563eb',
      supportedLanguages: ['es', 'en', 'de', 'fr'],
      features: {
        jobsAggregation: true,
        atsEngine: true,
        psychometricTest: true,
        talkMeInterview: true,
        alexWhatsAppBot: true
      }
    };
  }
}
