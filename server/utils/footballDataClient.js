const axios = require('axios');

const BASE_URL = 'https://api.football-data.org/v4';

class FootballDataError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'FootballDataError';
    this.status = status;
    this.body = body;
  }
}

const COMPETITIONS = {
  PL: { code: 'PL', name: 'Premier League', expectedTeams: 20, hasMatchdays: true },
  WC: { code: 'WC', name: 'FIFA World Cup', expectedTeams: 48, hasMatchdays: false },
  CL: { code: 'CL', name: 'UEFA Champions League', expectedTeams: 36, hasMatchdays: false },
};

const COMPETITIONS_TO_TRACK = ['PL', 'WC', 'CL'];

function getClient() {
  const token = process.env.FOOTBALL_API_TOKEN;
  if (!token) {
    console.warn('[football-data] FOOTBALL_API_TOKEN not set — requests will fail with 403.');
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'X-Auth-Token': token || '' },
    timeout: 15000,
  });
}

async function safeGet(path, params) {
  try {
    const res = await getClient().get(path, { params });
    return res.data;
  } catch (err) {
    if (err.response) {
      const { status, data } = err.response;
      const msg = data?.message || data?.error || err.message;
      throw new FootballDataError(`football-data.org ${status} on ${path}: ${msg}`, status, data);
    }
    throw new FootballDataError(`football-data.org request failed for ${path}: ${err.message}`, 0);
  }
}

function isRateLimit(err) {
  return err instanceof FootballDataError && err.status === 429;
}

module.exports = {
  COMPETITIONS,
  COMPETITIONS_TO_TRACK,
  FootballDataError,
  isRateLimit,
  getMatches: (competition, params = {}) => safeGet(`/competitions/${competition}/matches`, params),
  getMatch: (matchId) => safeGet(`/matches/${matchId}`),
  getTeams: (competition) => safeGet(`/competitions/${competition}/teams`),
  getStandings: (competition, params = {}) => safeGet(`/competitions/${competition}/standings`, params),
};
