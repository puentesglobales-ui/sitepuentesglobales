import { SaasCore, SAAS_PLANS } from '../services/saasCore.js';

export const getPlans = (req, res) => {
  res.json({
    success: true,
    plans: SAAS_PLANS
  });
};

export const getTenantConfig = (req, res) => {
  const domain = req.query.domain || req.headers.host || 'default';
  const config = SaasCore.getTenantConfig(domain);
  res.json({
    success: true,
    config
  });
};
