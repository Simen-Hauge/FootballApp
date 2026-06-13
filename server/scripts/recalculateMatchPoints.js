/**
 * Manual script to recalculate match points for all finished matches.
 * Usage: node scripts/recalculateMatchPoints.js
 * 
 * This script:
 * 1. Finds all finished matches
 * 2. Finds all predictions for those matches with missing pointsAwarded
 * 3. Calculates points using the match logic
 * 4. Updates player scores
 * 5. Saves the predictions
 */

require('dotenv').config();

const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const Player = require('../models/Player');
const mongoose = require('mongoose');
const { matchPointLogic, firstScorerPointLogic } = require('../utils/calculatePoints');
const { getMatch, isRateLimit } = require('../utils/footballDataClient');

const FINAL_STATUSES = new Set(['FINISHED', 'IN_PLAY', 'PAUSED']);

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
    const goals = Array.isArray(data?.goals) ? data.goals : [];
    if (goals.length === 0) return null;
    const first = goals[0];
    const scorer = first?.scorer;
    if (!scorer?.id) return null;
    return {
      playerId: scorer.id,
      playerName: scorer.name ?? null,
      minute: typeof first.minute === 'number' ? first.minute : null,
    };
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[recalc] rate limit on /matches/${matchId}, skipping scorer bonus`);
    } else {
      console.error(`[recalc] failed to fetch scorers for ${matchId}:`, err.message);
    }
    return null;
  }
}

async function recalculateMatchPoints() {
  console.log('🔄 Starting match points recalculation...\n');

  const totalMatches = await Match.countDocuments();
  const totalPredictions = await Prediction.countDocuments();
  const missingPointsPredictions = await Prediction.countDocuments({ pointsAwarded: null });

  console.log(`🗂️  Match docs: ${totalMatches}`);
  console.log(`🗂️  Prediction docs: ${totalPredictions}`);
  console.log(`🗂️  Predictions missing points: ${missingPointsPredictions}\n`);

  // Find finished/score-resolved matches robustly.
  const finishedMatches = await Match.find({
    $or: [
      { status: { $in: Array.from(FINAL_STATUSES) } },
      { 'score.home': { $ne: null } },
      { 'score.away': { $ne: null } },
    ],
  }).lean();

  console.log(`📊 Found ${finishedMatches.length} finished matches\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const match of finishedMatches) {
    const { matchId, homeTeam, awayTeam, score } = match;
    const scoreHome = score?.home ?? 0;
    const scoreAway = score?.away ?? 0;

    // Find all predictions for this match
    const predictions = await Prediction.find({ matchid: matchId });
    
    // Filter to those missing pointsAwarded
    const needsScoring = predictions.filter(
      (p) => p.pointsAwarded === null || p.pointsAwarded === undefined
    );

    if (needsScoring.length === 0) {
      console.log(`✓ ${homeTeam} ${scoreHome}-${scoreAway} ${awayTeam} (${needsScoring.length} predictions) - already scored`);
      totalSkipped += predictions.length;
      continue;
    }

    console.log(`⚽ ${homeTeam} ${scoreHome}-${scoreAway} ${awayTeam} · ${needsScoring.length} predictions to score`);

    // Try to resolve first scorer if needed
    let firstScorer = null;
    const needsScorer = needsScoring.some((p) => p.firstGoalScorer?.playerId);
    if (needsScorer) {
      firstScorer = await resolveFirstScorer(matchId);
      if (firstScorer) {
        await Match.findOneAndUpdate(
          { matchId },
          { $set: { firstGoalScorer: firstScorer } }
        );
      }
    }

    // Calculate and update points for each prediction
    for (const pred of needsScoring) {
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
      const points = matchPoints + scorerPoints;

      // Update player score
      await Player.updateOne(
        { email: pred.email },
        { $inc: { points } }
      );

      // Update prediction with points awarded
      pred.pointsAwarded = points;
      await pred.save();

      console.log(
        `  🏅 ${pred.email}: ${pred.score.home}-${pred.score.away} vs ${scoreHome}-${scoreAway}` +
        ` → ${matchPoints}${scorerPoints ? ` + ${scorerPoints} scorer` : ''} = ${points} pts`
      );

      totalUpdated++;
    }
  }

  console.log(`\n✅ Recalculation complete!`);
  console.log(`📈 Updated: ${totalUpdated} predictions`);
  console.log(`⏭️  Skipped: ${totalSkipped} already-scored predictions`);
  
  process.exit(0);
}

// Run the recalculation
connectDB().then(recalculateMatchPoints).catch((err) => {
  console.error('❌ Recalculation failed:', err);
  process.exit(1);
});
