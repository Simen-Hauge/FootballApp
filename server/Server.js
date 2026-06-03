require('dotenv').config();
require('./cron/fetchFinishedMatches')
require('./cron/resolveTournamentResults')
const { syncAllFixtures } = require('./cron/syncFixtures')

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/Auth');
const accountRoutes = require('./routes/Account');
const playersRoutes = require('./routes/Players');
const predictionRoutes = require('./routes/Predictions');
const matchRoutes = require('./routes/Matches');
const groupRoutes = require('./routes/Groups');
const teamRoutes = require('./routes/Teams');
const standingsRoutes = require('./routes/Standings');
const groupStandingPredictionRoutes = require('./routes/GroupStandingPredictions');
const tournamentPredictionRoutes = require('./routes/TournamentPredictions');
const tournamentResultRoutes = require('./routes/TournamentResults');
const pointsConfigRoutes = require('./routes/PointsConfig');
const squadRoutes = require('./routes/Squads');

const app = express();

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!process.env.JWT_SECRET) {
  console.error('❌ Startup failed: JWT_SECRET is not set');
  process.exit(1);
}

// ---- Explicit CORS (handles preflight reliably) ----
const allowed = new Set([
  'http://localhost:3000',  // web client (CRA)
  'http://localhost:8081',  // Expo web dev server
  'http://localhost:19006', // Expo legacy web dev port
  'https://footyguru.netlify.app'
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowed.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin'); // good practice when echoing origin
    res.header('Access-Control-Allow-Credentials', 'true'); // only needed if you use cookies/Authorization
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Lightweight health check for the host's uptime monitor. Returns 200 as soon
// as the process is up; reports Mongo connection state without failing the
// check (a transient DB blip shouldn't make the platform recycle the box and
// kill the in-process crons). Placed before routes so it's always cheap.
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.status(200).json({ status: 'ok', db: dbState === 1 ? 'connected' : 'disconnected' });
});

app.use(express.json({ limit: '5mb' }));

// Trust the platform's load balancer (render, etc.) so req.ip reflects the
// real client address. Required for rate-limit keys to actually work.
app.set('trust proxy', 1);

// API responses are per-user, always-fresh data — never let a client, proxy, or
// CDN cache them. Without this, a mobile client can read a stale GET right after
// a successful PUT (e.g. a cleared tournament pick reappears as still-set).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/wc/group-predictions', groupStandingPredictionRoutes);
app.use('/api/wc/tournament-predictions', tournamentPredictionRoutes);
app.use('/api/wc/tournament-results', tournamentResultRoutes);
app.use('/api/points-config', pointsConfigRoutes);
app.use('/api/squads', squadRoutes);

// Start
(async () => {
  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      family: 4,
      dbName: 'FootyGuru',
    });
    console.log('✅ Mongo connected');
    // Populate fixtures immediately on boot so a fresh deploy doesn't wait up
    // to 6h for the first scheduled run (and so the knockout bracket appears
    // right after deploy). Non-blocking — server starts regardless.
    syncAllFixtures().catch((e) => console.error('[fixture-cron] initial sync failed:', e.message));
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API listening on ${PORT}`));
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
})();

process.on('SIGTERM', () => mongoose.connection.close(() => process.exit(0)));
process.on('SIGINT',  () => mongoose.connection.close(() => process.exit(0)));
