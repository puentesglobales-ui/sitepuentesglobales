import { AdapterManager } from '../services/jobAdapters/AdapterManager.js';

export const searchJobs = async (req, res) => {
  try {
    const query = req.query.q || req.query.profession || '';
    const location = req.query.location || req.query.country || '';

    const jobs = await AdapterManager.searchAllSources(query, location);

    res.json({
      success: true,
      total: jobs.length,
      query,
      location,
      items: jobs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error al buscar empleos',
      details: err.message
    });
  }
};
