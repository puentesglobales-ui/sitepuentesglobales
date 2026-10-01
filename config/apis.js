/**
 * Fuentes de empleo. Las claves se leen de variables de entorno (Render → Environment).
 * Nunca escribir claves en este archivo: el repo es público.
 * Una fuente que necesita clave queda desactivada si su variable no está cargada.
 */

const env = name => (process.env[name] || '').trim();

export const API_SOURCES = {
  adzuna: {
    id: 'adzuna',
    name: 'Adzuna',
    enabled: Boolean(env('ADZUNA_APP_ID') && env('ADZUNA_APP_KEY')),
    requiresKey: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
    type: 'free',
    url: 'https://api.adzuna.com/v1/api/jobs',
    appId: env('ADZUNA_APP_ID'),
    appKey: env('ADZUNA_APP_KEY'),
    countries: ['gb', 'de', 'fr', 'nl', 'it', 'pl']
  },
  reed: {
    id: 'reed',
    name: 'Reed.co.uk',
    enabled: Boolean(env('REED_API_KEY')),
    requiresKey: ['REED_API_KEY'],
    type: 'free',
    url: 'https://www.reed.co.uk/api/1.0/search',
    apiKey: env('REED_API_KEY'),
    countries: ['gb', 'ie']
  },
  findwork: {
    id: 'findwork',
    name: 'FindWork.dev',
    enabled: Boolean(env('FINDWORK_TOKEN')),
    requiresKey: ['FINDWORK_TOKEN'],
    type: 'free',
    url: 'https://findwork.dev/api/jobs',
    bearerToken: env('FINDWORK_TOKEN'),
    countries: ['de', 'fr', 'nl', 'gb', 'ie', 'no']
  },
  himalayas: {
    id: 'himalayas',
    name: 'Himalayas Remote',
    enabled: true,
    requiresKey: [],
    type: 'free',
    url: 'https://himalayas.app/jobs/api',
    countries: ['remote']
  },
  arbeitnow: {
    id: 'arbeitnow',
    name: 'Arbeitnow Alemania',
    enabled: true,
    requiresKey: [],
    type: 'free',
    url: 'https://www.arbeitnow.com/api/job-board-api',
    countries: ['de', 'remote']
  },
  remoteok: {
    id: 'remoteok',
    name: 'RemoteOK',
    enabled: true,
    requiresKey: [],
    type: 'free',
    url: 'https://remoteok.com/api',
    countries: ['remote']
  },
  remotive: {
    id: 'remotive',
    name: 'Remotive',
    enabled: true,
    requiresKey: [],
    type: 'free',
    url: 'https://remotive.com/api/remote-jobs',
    countries: ['remote']
  }
};

// Feeds RSS que se controlan desde el panel de estado (/api/v1/admin/status).
export const RSS_FEEDS = [
  { id: 'wwr-prog', name: 'WWR Programming', url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss' },
  { id: 'remoteok-rss', name: 'RemoteOK RSS', url: 'https://remoteok.com/remote-jobs.rss' },
  { id: 'reddit-forhire', name: 'Reddit ForHire', url: 'https://www.reddit.com/r/forhire/new/.rss' },
  { id: 'dribbble-jobs', name: 'Dribbble Jobs', url: 'https://dribbble.com/jobs.rss' }
];
