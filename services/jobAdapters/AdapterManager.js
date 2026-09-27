import { API_SOURCES } from '../../config/apis.js';

export class AdzunaAdapter {
  static async fetchJobs(query = '', location = 'gb') {
    try {
      const cfg = API_SOURCES.adzuna;
      if (!cfg || !cfg.enabled) return [];

      const countryCode = location.toLowerCase().includes('alemania') || location.toLowerCase().includes('de') ? 'de' 
        : location.toLowerCase().includes('francia') || location.toLowerCase().includes('fr') ? 'fr'
        : location.toLowerCase().includes('italia') || location.toLowerCase().includes('it') ? 'it'
        : location.toLowerCase().includes('holanda') || location.toLowerCase().includes('nl') ? 'nl'
        : 'gb';

      const searchWhat = query ? encodeURIComponent(query) : 'developer';
      const url = `${cfg.url}/${countryCode}/search/1?app_id=${cfg.appId}&app_key=${cfg.appKey}&what=${searchWhat}&results_per_page=20`;

      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map(j => ({
        id: `adzuna_${j.id}`,
        title: j.title ? j.title.replace(/<[^>]*>?/gm, '') : 'Oferta de Empleo',
        company: j.company ? j.company.display_name : 'Empresa Confidencial',
        location: j.location ? j.location.display_name : countryCode.toUpperCase(),
        description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
        url: j.redirect_url,
        source: 'Adzuna',
        tags: [j.category ? j.category.label : 'General'],
        created_at: j.created
      }));
    } catch (err) {
      console.error('Error Adzuna API:', err.message);
      return [];
    }
  }
}

export class ReedAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const cfg = API_SOURCES.reed;
      if (!cfg || !cfg.enabled) return [];

      const searchKeywords = query ? encodeURIComponent(query) : 'engineer';
      const url = `${cfg.url}?keywords=${searchKeywords}&resultsToTake=20`;
      const authHeader = 'Basic ' + Buffer.from(cfg.apiKey + ':').toString('base64');

      const res = await fetch(url, {
        headers: { 'Authorization': authHeader }
      });
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map(j => ({
        id: `reed_${j.jobId}`,
        title: j.jobTitle,
        company: j.employerName,
        location: j.locationName || 'Reino Unido / Irlanda',
        description: j.jobDescription ? j.jobDescription.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
        url: j.jobUrl,
        source: 'Reed.co.uk',
        tags: [j.expirationDate ? `Expira: ${j.expirationDate}` : 'Europa'],
        created_at: j.date
      }));
    } catch (err) {
      console.error('Error Reed API:', err.message);
      return [];
    }
  }
}

export class FindWorkAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const cfg = API_SOURCES.findwork;
      if (!cfg || !cfg.enabled) return [];

      const searchUrl = query 
        ? `${cfg.url}/?search=${encodeURIComponent(query)}`
        : `${cfg.url}/?sort_by=relevance`;

      const res = await fetch(searchUrl, {
        headers: { 'Authorization': `Token ${cfg.bearerToken}` }
      });
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map(j => ({
        id: `findwork_${j.id}`,
        title: j.role,
        company: j.company_name,
        location: j.location || (j.remote ? 'Remoto Europa' : 'Europa'),
        description: j.text ? j.text.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
        url: j.url,
        source: 'FindWork.dev',
        tags: j.keywords || [],
        created_at: j.date_posted
      }));
    } catch (err) {
      console.error('Error FindWork API:', err.message);
      return [];
    }
  }
}

export class HimalayasAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const cfg = API_SOURCES.himalayas;
      if (!cfg || !cfg.enabled) return [];

      const res = await fetch(cfg.url);
      if (!res.ok) return [];
      const data = await res.json();

      const jobs = data.jobs || [];
      return jobs
        .filter(j => !query || j.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 25)
        .map(j => ({
          id: `himalayas_${j.slug}`,
          title: j.title,
          company: j.companyName,
          location: j.locationRestriction || 'Remoto Mundial',
          description: j.excerpt ? j.excerpt.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
          url: j.applicationUrl || `https://himalayas.app/jobs/${j.slug}`,
          source: 'Himalayas',
          tags: j.categories || [],
          created_at: j.pubDate
        }));
    } catch (err) {
      console.error('Error Himalayas API:', err.message);
      return [];
    }
  }
}

export class ArbeitnowAdapter {
  static async fetchJobs(query = '', location = '') {
    try {
      const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
      if (!res.ok) return [];
      const data = await res.json();
      
      const items = data.data || [];
      return items
        .filter(j => {
          const titleMatch = !query || j.title.toLowerCase().includes(query.toLowerCase());
          const locMatch = !location || j.location.toLowerCase().includes(location.toLowerCase());
          return titleMatch && locMatch;
        })
        .slice(0, 25)
        .map(j => ({
          id: `arbeitnow_${j.slug}`,
          title: j.title,
          company: j.company_name,
          location: j.location || 'Alemania / Remoto',
          description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
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
      const res = await fetch('https://remoteok.com/api', {
        headers: { 'User-Agent': 'PuentesGlobalesBot/2.0' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      
      const jobs = Array.isArray(data) ? data.slice(1) : [];
      return jobs
        .filter(j => j && j.position)
        .filter(j => {
          const titleMatch = !query || j.position.toLowerCase().includes(query.toLowerCase());
          const locMatch = !location || (j.location && j.location.toLowerCase().includes(location.toLowerCase()));
          return titleMatch && locMatch;
        })
        .slice(0, 25)
        .map(j => ({
          id: `remoteok_${j.id}`,
          title: j.position,
          company: j.company,
          location: j.location || 'Mundial / Remoto',
          description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
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
        : 'https://remotive.com/api/remote-jobs?limit=30';
      
      const res = await fetch(searchUrl);
      if (!res.ok) return [];
      const data = await res.json();
      
      const jobs = data.jobs || [];
      return jobs
        .filter(j => {
          const locMatch = !location || (j.candidate_required_location && j.candidate_required_location.toLowerCase().includes(location.toLowerCase()));
          return locMatch;
        })
        .slice(0, 25)
        .map(j => ({
          id: `remotive_${j.id}`,
          title: j.title,
          company: j.company_name,
          location: j.candidate_required_location || 'Remoto Europa / Global',
          description: j.description ? j.description.replace(/<[^>]*>?/gm, '').slice(0, 280) + '...' : '',
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
      AdzunaAdapter.fetchJobs(query, location),
      ReedAdapter.fetchJobs(query, location),
      FindWorkAdapter.fetchJobs(query, location),
      HimalayasAdapter.fetchJobs(query, location),
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
