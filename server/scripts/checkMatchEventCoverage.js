#!/usr/bin/env node

require('dotenv').config();

const mongoose = require('mongoose');
const Match = require('../models/Match');
const { getMatch } = require('../utils/footballDataClient');

const VALID_COMPETITIONS = new Set(['PL', 'WC', 'CL']);

function parseArgs(argv = process.argv.slice(2)) {
  let competition = null;
  let limit = 5;
  const explicitMatchIds = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--competition' || arg === '-c') {
      competition = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--competition=')) {
      competition = arg.split('=')[1] ?? null;
      continue;
    }

    if (arg === '--limit' || arg === '-l') {
      limit = Number(argv[i + 1] ?? limit);
      i += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      limit = Number(arg.split('=')[1] ?? limit);
      continue;
    }

    if (arg === '--match' || arg === '-m') {
      const id = Number(argv[i + 1]);
      if (Number.isFinite(id)) explicitMatchIds.push(id);
      i += 1;
      continue;
    }
    if (arg.startsWith('--match=')) {
      const id = Number(arg.split('=')[1]);
      if (Number.isFinite(id)) explicitMatchIds.push(id);
      continue;
    }
  }

  if (competition) {
    competition = String(competition).trim().toUpperCase();
    if (!VALID_COMPETITIONS.has(competition)) {
      console.error(`Invalid competition: ${competition}. Use one of ${Array.from(VALID_COMPETITIONS).join(', ')}`);
      process.exit(1);
    }
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 5;
  }

  return { competition, limit: Math.floor(limit), explicitMatchIds };
}

function dbNameFromUri(uri) {
  try {
    if (!uri) return null;
    const parsed = new URL(uri.replace('mongodb+srv://', 'mongodb://'));
    const path = (parsed.pathname || '').replace(/^\//, '').trim();
    return path || null;
  } catch {
    return null;
  }
}

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/FootyGuru';
  const dbName = dbNameFromUri(uri) || process.env.DB_NAME || 'FootyGuru';
  await mongoose.connect(uri, { dbName });
}

async function selectMatchIds({ competition, limit, explicitMatchIds }) {
  if (explicitMatchIds.length > 0) return explicitMatchIds;

  const query = {
    status: 'finished',
  };
  if (competition) query.competition = competition;

  const matches = await Match.find(query)
    .sort({ kickoffDateTime: -1 })
    .limit(limit)
    .select('matchId competition homeTeam awayTeam kickoffDateTime')
    .lean();

  return matches.map((m) => m.matchId);
}

function summarizePayload(data) {
  const goals = Array.isArray(data?.goals) ? data.goals : [];
  const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
  const penalties = Array.isArray(data?.penalties) ? data.penalties : [];
  const substitutions = Array.isArray(data?.substitutions) ? data.substitutions : [];

  return {
    status: data?.status ?? null,
    hasGoalsField: Object.prototype.hasOwnProperty.call(data || {}, 'goals'),
    goalsCount: goals.length,
    hasBookingsField: Object.prototype.hasOwnProperty.call(data || {}, 'bookings'),
    bookingsCount: bookings.length,
    hasPenaltiesField: Object.prototype.hasOwnProperty.call(data || {}, 'penalties'),
    penaltiesCount: penalties.length,
    hasSubstitutionsField: Object.prototype.hasOwnProperty.call(data || {}, 'substitutions'),
    substitutionsCount: substitutions.length,
    topLevelKeys: Object.keys(data || {}),
    firstGoalSample: goals[0] || null,
  };
}

async function main() {
  const args = parseArgs();
  await connectDB();

  const ids = await selectMatchIds(args);
  if (ids.length === 0) {
    console.log('No matches found for the given selection.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Checking ${ids.length} match(es): ${ids.join(', ')}`);

  for (const matchId of ids) {
    try {
      const data = await getMatch(matchId);
      const summary = summarizePayload(data);
      console.log('---');
      console.log(`matchId: ${matchId}`);
      console.log(`status: ${summary.status}`);
      console.log(`goals field: ${summary.hasGoalsField} (count ${summary.goalsCount})`);
      console.log(`bookings field: ${summary.hasBookingsField} (count ${summary.bookingsCount})`);
      console.log(`penalties field: ${summary.hasPenaltiesField} (count ${summary.penaltiesCount})`);
      console.log(`substitutions field: ${summary.hasSubstitutionsField} (count ${summary.substitutionsCount})`);
      console.log(`top-level keys: ${summary.topLevelKeys.join(', ')}`);
      if (summary.firstGoalSample) {
        console.log(`first goal sample: ${JSON.stringify(summary.firstGoalSample)}`);
      }
    } catch (err) {
      console.log('---');
      console.log(`matchId: ${matchId}`);
      console.log(`error: ${err.message}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('checkMatchEventCoverage failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});
