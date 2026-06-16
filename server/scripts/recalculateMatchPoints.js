/**
 * Manual script to recalculate match points for all finished matches.
 * Usage: node scripts/recalculateMatchPoints.js [--competition WC] [--rescore-all] [--first-scorers-file ./scripts/firstScorers.json]
 * 
 * This script:
 * 1. Finds all finished matches
 * 2. Finds all predictions for those matches with missing pointsAwarded
 * 3. Calculates points using the match logic
 * 4. Updates player scores
 * 5. Saves the predictions
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const Player = require('../models/Player');
const mongoose = require('mongoose');
const { matchPointLogic, firstScorerPointLogic } = require('../utils/calculatePoints');
const { getMatch, getMatches, isRateLimit } = require('../utils/footballDataClient');

const FINAL_STATUSES = new Set(['FINISHED', 'IN_PLAY', 'PAUSED']);
const VALID_COMPETITIONS = new Set(['PL', 'WC', 'CL']);

function parseCliOptions(argv = process.argv.slice(2)) {
  let competition = null;
  let rescoreAll = false;
  let firstScorersFile = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--competition' || arg === '-c') {
      competition = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--competition=')) {
      competition = arg.split('=')[1] ?? null;
    }
    if (arg === '--rescore-all' || arg === '--all') {
      rescoreAll = true;
    }
    if (arg === '--first-scorers-file' || arg === '-f') {
      firstScorersFile = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--first-scorers-file=')) {
      firstScorersFile = arg.split('=')[1] ?? null;
    }
  }

  if (!competition) {
    return {
      competition: null,
      rescoreAll,
      firstScorersFile,
    };
  }

  const normalized = String(competition).trim().toUpperCase();
  if (!VALID_COMPETITIONS.has(normalized)) {
    console.error(`❌ Invalid competition "${competition}". Use one of: ${Array.from(VALID_COMPETITIONS).join(', ')}`);
    process.exit(1);
  }

  return {
    competition: normalized,
    rescoreAll,
    firstScorersFile,
  };
}

function loadFirstScorerOverrides(filePathInput) {
  if (!filePathInput) return {};

  const resolvedPath = path.isAbsolute(filePathInput)
    ? filePathInput
    : path.resolve(process.cwd(), filePathInput);

  let parsed;
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read first-scorer overrides from ${resolvedPath}: ${err.message}`);
    process.exit(1);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('❌ first-scorers-file must be a JSON object keyed by matchId');
    process.exit(1);
  }

  const overrides = {};
  for (const [matchIdKey, value] of Object.entries(parsed)) {
    const matchId = Number(matchIdKey);
    const playerId = Number(value?.playerId);

    if (!Number.isFinite(matchId) || !Number.isFinite(playerId)) {
      console.error(`❌ Invalid override entry for key "${matchIdKey}". Expected { playerId: number, playerName?: string, minute?: number }`);
      process.exit(1);
    }

    overrides[matchId] = {
      playerId,
      playerName: value?.playerName ?? null,
      minute: Number.isFinite(Number(value?.minute)) ? Number(value.minute) : null,
    };
  }

  return overrides;
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
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/FootyGuru';
    const dbName = dbNameFromUri(uri) || process.env.DB_NAME || 'FootyGuru';
    await mongoose.connect(uri, { dbName });
    console.log(`✅ Connected to MongoDB (db="${mongoose.connection.db.databaseName}")`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function resolveFirstScorer(matchId) {
  try {
    const data = await getMatch(matchId);
    return resolveFirstScorerFromGoals(data?.goals);
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[recalc] rate limit on /matches/${matchId}, skipping scorer bonus`);
    } else {
      console.error(`[recalc] failed to fetch scorers for ${matchId}:`, err.message);
    }
    return null;
  }
}

function resolveFirstScorerFromGoals(goalsInput) {
  const goals = Array.isArray(goalsInput) ? goalsInput : [];
  if (goals.length === 0) return null;

  const orderedGoals = goals
    .filter((g) => Number.isFinite(Number(g?.minute)))
    .slice()
    .sort((a, b) => Number(a.minute) - Number(b.minute));
  const first = orderedGoals[0] || goals[0];
  const scorer = first?.scorer;
  if (!scorer?.id) return null;

  return {
    playerId: scorer.id,
    playerName: scorer.name ?? null,
    minute: Number.isFinite(Number(first.minute)) ? Number(first.minute) : null,
  };
}

async function buildFirstScorerIndex(competitions) {
  const index = new Map();

  for (const competitionCode of competitions) {
    try {
      const data = await getMatches(competitionCode, {}, { unfoldGoals: true });
      for (const apiMatch of data.matches || []) {
        const firstScorer = resolveFirstScorerFromGoals(apiMatch.goals);
        if (firstScorer) {
          index.set(apiMatch.id, firstScorer);
        }
      }
    } catch (err) {
      if (isRateLimit(err)) {
        console.warn(`[recalc] rate limit while fetching unfolded matches for ${competitionCode}`);
      } else {
        console.warn(`[recalc] failed unfolded matches fetch for ${competitionCode}: ${err.message}`);
      }
    }
  }

  return index;
}

async function recalculateMatchPoints(options = {}) {
  const competition = options.competition ?? null;
  const rescoreAll = options.rescoreAll === true;
  const firstScorerOverrides = loadFirstScorerOverrides(options.firstScorersFile);
  console.log('🔄 Starting match points recalculation...\n');

  const matchFilter = competition ? { competition } : {};
  const totalMatches = await Match.countDocuments(matchFilter);
  const missingPointsPredictions = await Prediction.countDocuments({ pointsAwarded: null });

  if (competition) {
    console.log(`🎯 Competition filter: ${competition}`);
  }
  if (rescoreAll) {
    console.log('♻️  Mode: RESCORE ALL predictions for selected matches');
  }
  if (options.firstScorersFile) {
    console.log(`📝 First-scorer overrides file: ${options.firstScorersFile}`);
    console.log(`📝 Loaded ${Object.keys(firstScorerOverrides).length} match overrides`);
  }
  console.log(`🗂️  Match docs: ${totalMatches}`);
  console.log(`🗂️  Predictions missing points: ${missingPointsPredictions}\n`);

  // Find finished/score-resolved matches robustly.
  const finishedMatches = await Match.find({
    ...matchFilter,
    $or: [
      { status: { $in: Array.from(FINAL_STATUSES) } },
      { 'score.home': { $ne: null } },
      { 'score.away': { $ne: null } },
    ],
  }).lean();

  const competitionCodes = competition
    ? [competition]
    : [...new Set(finishedMatches.map((m) => m.competition).filter((c) => VALID_COMPETITIONS.has(c)))];
  const firstScorerIndex = await buildFirstScorerIndex(competitionCodes);

  console.log(`📊 Found ${finishedMatches.length} finished matches\n`);

  let totalUpdated = 0;
  let totalReconciled = 0;
  let totalSkipped = 0;

  for (const match of finishedMatches) {
    const { matchId, homeTeam, awayTeam, score, firstGoalScorer: cachedFirstScorer } = match;
    const scoreHome = score?.home ?? 0;
    const scoreAway = score?.away ?? 0;

    // Find all predictions for this match
    const predictions = await Prediction.find({ matchid: matchId });
    
    // Filter to those missing pointsAwarded
    const needsScoring = predictions.filter(
      (p) => p.pointsAwarded === null || p.pointsAwarded === undefined
    );
    const pendingScorer = predictions.filter((p) => p.scorerPending === true);
    const targets = rescoreAll ? predictions : needsScoring;

    if (targets.length === 0 && pendingScorer.length === 0) {
      console.log(`✓ ${homeTeam} ${scoreHome}-${scoreAway} ${awayTeam} (${needsScoring.length} predictions) - already scored`);
      totalSkipped += predictions.length;
      continue;
    }

    console.log(`⚽ ${homeTeam} ${scoreHome}-${scoreAway} ${awayTeam} · ${targets.length} predictions to score`);

    // Try to resolve first scorer if needed
    let firstScorer = cachedFirstScorer?.playerId ? cachedFirstScorer : null;
    const unfoldedScorer = firstScorerIndex.get(matchId) || null;
    if (!firstScorer && unfoldedScorer) {
      firstScorer = unfoldedScorer;
      await Match.findOneAndUpdate(
        { matchId },
        { $set: { firstGoalScorer: firstScorer } }
      );
    }
    const overrideScorer = firstScorerOverrides[matchId] || null;
    if (overrideScorer) {
      firstScorer = overrideScorer;
      await Match.findOneAndUpdate(
        { matchId },
        { $set: { firstGoalScorer: firstScorer } }
      );
    }
    const needsScorer =
      targets.some((p) => p.firstGoalScorer?.playerId) || pendingScorer.length > 0;
    if (needsScorer && !firstScorer) {
      firstScorer = await resolveFirstScorer(matchId);
      if (firstScorer) {
        await Match.findOneAndUpdate(
          { matchId },
          { $set: { firstGoalScorer: firstScorer } }
        );
      } else {
        console.warn(
          `  ⚠️ No first-scorer data for match ${matchId}. football-data.org response may not include goal events on this API plan.`
        );
      }
    }

    // Calculate and update points for each prediction
    for (const pred of targets) {
      const previousPoints = pred.pointsAwarded ?? 0;
      const matchPoints = matchPointLogic(
        pred.score.home,
        pred.score.away,
        scoreHome,
        scoreAway
      );
      const hasScorerPrediction = pred.firstGoalScorer?.playerId != null;
      const scorerResolved = !hasScorerPrediction || !!firstScorer?.playerId;
      const scorerPoints = scorerResolved
        ? firstScorerPointLogic(
            pred.firstGoalScorer?.playerId ?? null,
            firstScorer?.playerId ?? null
          )
        : 0;
      const points = matchPoints + scorerPoints;
      const delta = points - previousPoints;

      if (delta !== 0) {
        // Update player score by delta so reruns are idempotent.
        await Player.updateOne(
          { email: pred.email },
          { $inc: { points: delta } }
        );
      }

      // Update prediction with points awarded
      pred.pointsAwarded = points;
      pred.scorerPending = hasScorerPrediction && !scorerResolved;
      await pred.save();

      console.log(
        `  🏅 ${pred.email}: ${pred.score.home}-${pred.score.away} vs ${scoreHome}-${scoreAway}` +
        ` → ${matchPoints}${scorerPoints ? ` + ${scorerPoints} scorer` : ''} = ${points} pts` +
        ` (Δ ${delta > 0 ? '+' : ''}${delta})`
      );

      totalUpdated++;
    }

    if (!rescoreAll && firstScorer?.playerId && pendingScorer.length > 0) {
      for (const pred of pendingScorer) {
        const scorerPoints = firstScorerPointLogic(
          pred.firstGoalScorer?.playerId ?? null,
          firstScorer.playerId
        );

        if (scorerPoints > 0) {
          await Player.updateOne({ email: pred.email }, { $inc: { points: scorerPoints } });
          pred.pointsAwarded = (pred.pointsAwarded ?? 0) + scorerPoints;
        }

        pred.scorerPending = false;
        await pred.save();
        console.log(`  🎯 ${pred.email}: scorer backfill ${scorerPoints} pts`);
      }
    }

    // Reconcile already-scored predictions to the currently expected total.
    // This fixes historical scorer mismatches from earlier scoring bugs.
    if (rescoreAll) {
      continue;
    }
    for (const pred of predictions) {
      if (pred.pointsAwarded === null || pred.pointsAwarded === undefined) continue;
      if (pred.scorerPending === true) continue;

      const hasScorerPrediction = pred.firstGoalScorer?.playerId != null;
      if (hasScorerPrediction && !firstScorer?.playerId) continue;

      const matchPoints = matchPointLogic(
        pred.score.home,
        pred.score.away,
        scoreHome,
        scoreAway
      );
      const scorerPoints = firstScorerPointLogic(
        pred.firstGoalScorer?.playerId ?? null,
        firstScorer?.playerId ?? null
      );
      const expectedTotal = matchPoints + scorerPoints;
      const delta = expectedTotal - pred.pointsAwarded;
      if (delta === 0) continue;

      await Player.updateOne({ email: pred.email }, { $inc: { points: delta } });
      pred.pointsAwarded = expectedTotal;
      await pred.save();
      totalReconciled++;

      console.log(
        `  🔁 ${pred.email}: reconciled ${delta > 0 ? '+' : ''}${delta} pts ` +
        `(${pred.score.home}-${pred.score.away} -> expected ${expectedTotal})`
      );
    }
  }

  console.log(`\n✅ Recalculation complete!`);
  console.log(`📈 Updated: ${totalUpdated} predictions`);
  console.log(`🧮 Reconciled: ${totalReconciled} previously-scored predictions`);
  console.log(`⏭️  Skipped: ${totalSkipped} already-scored predictions`);
  
  process.exit(0);
}

// Run the recalculation
const options = parseCliOptions();
connectDB().then(() => recalculateMatchPoints(options)).catch((err) => {
  console.error('❌ Recalculation failed:', err);
  process.exit(1);
});
