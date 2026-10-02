/**
 * Motor SaaS Enterprise: Suscripciones, Cuotas y Multi-tenancy
 *
 * Los planes pagos de candidatos cubren solo servicios de preparación
 * (escáner ATS, tests, simulador). Buscar ofertas y postularse es gratis
 * e ilimitado en todos los planes: no se cobra por acceder al empleo.
 */

export const SAAS_PLANS = {
  FREE: {
    name: 'Plan Gratuito',
    atsScansPerDay: 2,
    psychometricTests: 1,
    interviewSimulator: false,
    price: '$0 / mes'
  },
  PRO: {
    name: 'Plan Profesional',
    atsScansPerDay: 50,
    psychometricTests: 10,
    interviewSimulator: true,
    price: '$19 / mes'
  },
  ENTERPRISE: {
    name: 'Plan Enterprise Multi-Tenant',
    atsScansPerDay: 1000,
    psychometricTests: 500,
    interviewSimulator: true,
    alexWhatsAppBot: true,
    whitelabelBranding: true,
    price: '$99 / mes'
  }
};

// Simulador de almacenamiento de uso en memoria / DB
const userUsageStore = new Map();

export class SaasCore {
  static getUserPlan(userRole = 'candidate') {
    if (userRole === 'enterprise' || userRole === 'org_admin') return SAAS_PLANS.ENTERPRISE;
    if (userRole === 'pro') return SAAS_PLANS.PRO;
    return SAAS_PLANS.FREE;
  }

  static checkUsageLimit(userId = 'guest', feature = 'ats', userRole = 'candidate') {
    // La búsqueda de empleo nunca tiene límite por plan.
    if (feature === 'searches') return { allowed: true, unlimited: true };

    const plan = this.getUserPlan(userRole);
    const today = new Date().toISOString().split('T')[0];
    const key = `${userId}_${today}_${feature}`;

    const currentCount = userUsageStore.get(key) || 0;
    let limit = 5;

    if (feature === 'ats') limit = plan.atsScansPerDay;

    if (currentCount >= limit) {
      return {
        allowed: false,
        currentCount,
        limit,
        planName: plan.name,
        upgradeMessage: `Has alcanzado el límite diario de ${limit} ${feature} de tu ${plan.name}. Actualiza a Pro o Enterprise para uso ilimitado.`
      };
    }

    userUsageStore.set(key, currentCount + 1);
    return {
      allowed: true,
      currentCount: currentCount + 1,
      limit,
      remaining: limit - (currentCount + 1)
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
