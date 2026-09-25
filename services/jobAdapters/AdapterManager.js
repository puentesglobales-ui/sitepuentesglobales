/**
 * Adaptadores para fuentes de empleo externas en Node.js
 */

export class ArbeitnowAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const response = await fetch('https://www.arbeitnow.com/api/job-board-api');
      if (!response.ok) return [];
      const data = await response.json();
      
      const items = data.data || [];
      return items
        .filter(j => {
          const titleMatch = !query || j.title.toLowerCase().includes(query.toLowerCase());
          const locMatch = !location || j.location.toLowerCase().includes(location.toLowerCase());
          return titleMatch && locMatch;
        })
        .map(j => ({
          id: `arbeitnow_${j.slug}`,
          title: j.title,
          company: j.company_name,
          location: j.location || 'Alemania / Remoto',
          description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 300) + '...' : '',
          url: j.url,
          source: 'Arbeitnow',
          tags: j.tags || [],
          created_at: j.created_at
        }));
    } catch (err) {
      console.error('Error Arbeitnow:', err.message);
      return [];
    }
  }
}

export class RemoteOKAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const response = await fetch('https://remoteok.com/api', {
        headers: { 'User-Agent': 'PuentesGlobalesBot/2.0' }
      });
      if (!response.ok) return [];
      const data = await response.json();
      
      // El primer elemento suele ser un objeto legal de disclaimer
      const jobs = Array.isArray(data) ? data.slice(1) : [];
      return jobs
        .filter(j => j && j.position)
        .filter(j => {
          const titleMatch = !query || j.position.toLowerCase().includes(query.toLowerCase());
          const locMatch = !location || (j.location && j.location.toLowerCase().includes(location.toLowerCase()));
          return titleMatch && locMatch;
        })
        .map(j => ({
          id: `remoteok_${j.id}`,
          title: j.position,
          company: j.company,
          location: j.location || 'Mundial / Remoto',
          description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 300) + '...' : '',
          url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
          source: 'RemoteOK',
          tags: j.tags || [],
          created_at: j.date
        }));
    } catch (err) {
      console.error('Error RemoteOK:', err.message);
      return [];
    }
  }
}

export class RemotiveAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const searchUrl = query 
        ? `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`
        : 'https://remotive.com/api/remote-jobs?limit=50';
      
      const response = await fetch(searchUrl);
      if (!response.ok) return [];
      const data = await response.json();
      
      const jobs = data.jobs || [];
      return jobs
        .filter(j => {
          const locMatch = !location || (j.candidate_required_location && j.candidate_required_location.toLowerCase().includes(location.toLowerCase()));
          return locMatch;
        })
        .map(j => ({
          id: `remotive_${j.id}`,
          title: j.title,
          company: j.company_name,
          location: j.candidate_required_location || 'Remoto Europa / Global',
          description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 300) + '...' : '',
          url: j.url,
          source: 'Remotive',
          tags: j.tags || [],
          created_at: j.publication_date
        }));
    } catch (err) {
      console.error('Error Remotive:', err.message);
      return [];
    }
  }
}

export class AdapterManager {
  static async searchAllSources(query = '', location = '') {
    const results = await Promise.allSettled([
      ArbeitnowAdapter.fetchJobs(query, location),
      RemoteOKAdapter.fetchJobs(query, location),
      RemotiveAdapter.fetchJobs(query, location)
    ]);

    let allJobs = [];
    results.forEach(res => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        allJobs = allJobs.concat(res.value);
      }
    });

    return allJobs;
  }
}
