const cron = require('node-cron');
const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const { matchPointLogic, firstScorerPointLogic } = require('../utils/calculatePoints');
const { incrementPlayerScore } = require('../controllers/PlayerController');
const { getMatch, getMatches, COMPETITIONS_TO_TRACK, isRateLimit } = require('../utils/footballDataClient');
const { mapApiMatchToDoc } = require('../utils/matchMapper');

const FINAL_STATUSES = new Set(['FINISHED', 'IN_PLAY', 'PAUSED']);

async function processCompetition(competition) {
  let data;
  try {
    data = await getMatches(competition, {}, { unfoldGoals: true });
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[finished-cron] rate limit hit for ${competition}, skipping`);
      return;
    }
    console.error(`[finished-cron] failed to fetch ${competition}:`, err.message);
    return;
  }

  for (const apiMatch of data.matches || []) {
    if (!FINAL_STATUSES.has(apiMatch.status)) continue;

    const doc = mapApiMatchToDoc(apiMatch, competition);
    const fullTimeHome = apiMatch.score?.fullTime?.home;
    const fullTimeAway = apiMatch.score?.fullTime?.away;
    const halfTimeHome = apiMatch.score?.halfTime?.home;
    const halfTimeAway = apiMatch.score?.halfTime?.away;
    const scoreHome = fullTimeHome ?? halfTimeHome ?? 0;
    const scoreAway = fullTimeAway ?? halfTimeAway ?? 0;
    doc.score = { home: scoreHome, away: scoreAway };

    console.log(
      `⚽ [${competition}] ${doc.homeTeam} ${scoreHome}-${scoreAway} ${doc.awayTeam} · ${apiMatch.status}`,
    );

    const storedMatch = await Match.findOneAndUpdate(
      { matchId: doc.matchId },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (apiMatch.status !== 'FINISHED') continue;

    const predictions = await Prediction.find({ matchid: apiMatch.id });
    const unscored = predictions.filter(
      (p) => p.pointsAwarded === null || p.pointsAwarded === undefined,
    );
    const pendingScorer = predictions.filter((p) => p.scorerPending === true);
    if (unscored.length === 0 && pendingScorer.length === 0) continue;

    // Only hit the per-match endpoint when at least one player predicted a scorer.
    // We persist it on the Match doc so a re-run doesn't double-fetch.
    const needsScorer =
      unscored.some((p) => p.firstGoalScorer?.playerId) || pendingScorer.length > 0;
    let firstScorer = storedMatch?.firstGoalScorer?.playerId
      ? storedMatch.firstGoalScorer
      : null;
    if (!firstScorer) {
      firstScorer = resolveFirstScorerFromGoals(apiMatch.goals);
      if (firstScorer) {
        await Match.findOneAndUpdate(
          { matchId: apiMatch.id },
          { $set: { firstGoalScorer: firstScorer } },
        );
      }
    }
    if (needsScorer && !firstScorer) {
      firstScorer = await resolveFirstScorer(apiMatch.id);
      if (firstScorer) {
        await Match.findOneAndUpdate(
          { matchId: apiMatch.id },
          { $set: { firstGoalScorer: firstScorer } },
        );
      }
    }

    for (const pred of unscored) {
      const matchPoints = matchPointLogic(pred.score.home, pred.score.away, scoreHome, scoreAway);
      const hasScorerPrediction = pred.firstGoalScorer?.playerId != null;
      const scorerResolved = !hasScorerPrediction || !!firstScorer?.playerId;
      const scorerPoints = scorerResolved
        ? firstScorerPointLogic(
            pred.firstGoalScorer?.playerId ?? null,
            firstScorer?.playerId ?? null,
          )
        : 0;
      const points = matchPoints + scorerPoints;

      await incrementPlayerScore(pred.email, points);
      pred.pointsAwarded = points;
      pred.scorerPending = hasScorerPrediction && !scorerResolved;
      await pred.save();
      console.log(
        `🏅 ${pred.email}: ${pred.score.home}-${pred.score.away} vs ${scoreHome}-${scoreAway}` +
          ` → ${matchPoints}${scorerPoints ? ` + ${scorerPoints} scorer` : ''} = ${points} pts` +
          `${pred.scorerPending ? ' (scorer pending)' : ''}` +
          ` (match ${apiMatch.id})`,
      );
    }

    // Backfill scorer bonus for predictions previously scored with scorerPending.
    if (firstScorer?.playerId && pendingScorer.length > 0) {
      for (const pred of pendingScorer) {
        const scorerPoints = firstScorerPointLogic(
          pred.firstGoalScorer?.playerId ?? null,
          firstScorer.playerId,
        );

        if (scorerPoints > 0) {
          await incrementPlayerScore(pred.email, scorerPoints);
          pred.pointsAwarded = (pred.pointsAwarded ?? 0) + scorerPoints;
        }

        pred.scorerPending = false;
        await pred.save();
        console.log(
          `🎯 ${pred.email}: scorer backfill ${scorerPoints} pts (match ${apiMatch.id})`,
        );
      }
    }
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

async function runFinishedMatchSync() {
  console.log(`🔁 Finished-match sync starting for ${COMPETITIONS_TO_TRACK.join(', ')}`);
  for (const competition of COMPETITIONS_TO_TRACK) {
    await processCompetition(competition);
  }
  console.log('✅ Finished-match sync complete');
}

// Returns the first goal's scorer for a given football-data.org match id, or
// null if the match details / goals can't be retrieved. We treat the first
// entry of `goals[]` as authoritative — football-data.org returns goals in
// chronological order. Own goals count: whoever physically scored first.
async function resolveFirstScorer(matchId) {
  try {
    const data = await getMatch(matchId);
    return resolveFirstScorerFromGoals(data?.goals);
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[finished-cron] rate limit on /matches/${matchId}, deferring scorer bonus`);
    } else {
      console.error(`[finished-cron] failed to fetch scorers for ${matchId}:`, err.message);
    }
    return null;
  }
}

// Every 10 minutes
cron.schedule('*/10 * * * *', runFinishedMatchSync);

module.exports = { runFinishedMatchSync };
