import { AdapterManager } from '../services/jobAdapters/AdapterManager.js';

export const searchJobs = async (req, res) => {
  try {
    const query = req.query.q || req.query.profession || '';
    const location = req.query.location || req.query.country || '';

    const { jobs, interpretacion } = await AdapterManager.buscar(query, location);

    res.json({
      success: true,
      total: jobs.length,
      query,
      location,
      interpretacion,
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
