/**
 * Configuración completa de APIs de Empleo registradas (desde sistemaacfinal)
 */

export const API_SOURCES = {
  adzuna: {
    id: 'adzuna',
    name: 'Adzuna',
    enabled: true,
    type: 'free',
    url: 'https://api.adzuna.com/v1/api/jobs',
    appId: 'REMOVIDO',
    appKey: 'REMOVIDO',
    countries: ['gb', 'de', 'fr', 'nl', 'it', 'pl']
  },
  reed: {
    id: 'reed',
    name: 'Reed.co.uk',
    enabled: true,
    type: 'free',
    url: 'https://www.reed.co.uk/api/1.0/search',
    apiKey: 'REMOVIDO',
    countries: ['gb', 'ie']
  },
  findwork: {
    id: 'findwork',
    name: 'FindWork.dev',
    enabled: true,
    type: 'free',
    url: 'https://findwork.dev/api/jobs',
    bearerToken: 'REMOVIDO',
    countries: ['de', 'fr', 'nl', 'gb', 'ie', 'no']
  },
  whatjobs_uk: {
    id: 'whatjobs_uk',
    name: 'WhatJobs Reino Unido',
    enabled: true,
    type: 'paid',
    url: 'https://uk.whatjobs.com/api/v1/jobs',
    publisherId: '6576',
    apiKey: 'REMOVIDO',
    country: 'gb'
  },
  whatjobs_de: {
    id: 'whatjobs_de',
    name: 'WhatJobs Alemania',
    enabled: true,
    type: 'paid',
    url: 'https://de.whatjobs.com/api/v1/jobs',
    publisherId: '6578',
    apiKey: 'REMOVIDO',
    country: 'de'
  },
  himalayas: {
    id: 'himalayas',
    name: 'Himalayas Remote',
    enabled: true,
    type: 'free',
    url: 'https://himalayas.app/jobs/api',
    countries: ['remote']
  },
  arbeitnow: {
    id: 'arbeitnow',
    name: 'Arbeitnow Alemania',
    enabled: true,
    type: 'free',
    url: 'https://www.arbeitnow.com/api/job-board-api',
    countries: ['de', 'remote']
  },
  remoteok: {
    id: 'remoteok',
    name: 'RemoteOK',
    enabled: true,
    type: 'free',
    url: 'https://remoteok.com/api',
    countries: ['remote']
  },
  remotive: {
    id: 'remotive',
    name: 'Remotive',
    enabled: true,
    type: 'free',
    url: 'https://remotive.com/api/remote-jobs',
    countries: ['remote']
  }
};
