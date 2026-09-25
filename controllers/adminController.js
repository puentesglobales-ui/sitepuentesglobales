import { API_SOURCES } from '../config/apis.js';

export const getApiStatus = (req, res) => {
  res.json({
    success: true,
    sources: Object.entries(API_SOURCES).map(([key, val]) => ({
      key,
      name: val.name,
      enabled: val.enabled,
      url: val.url
    })),
    systemTime: new Date().toISOString()
  });
};
