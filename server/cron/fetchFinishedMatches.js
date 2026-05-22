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
    data = await getMatches(competition);
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

    await Match.findOneAndUpdate(
      { matchId: doc.matchId },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (apiMatch.status !== 'FINISHED') continue;

    const predictions = await Prediction.find({ matchid: apiMatch.id });
    const unscored = predictions.filter(
      (p) => p.pointsAwarded === null || p.pointsAwarded === undefined,
    );
    if (unscored.length === 0) continue;

    // Only hit the per-match endpoint when at least one player predicted a scorer.
    // We persist it on the Match doc so a re-run doesn't double-fetch.
    const needsScorer = unscored.some((p) => p.firstGoalScorer?.playerId);
    let firstScorer = null;
    let scorerLookupFailed = false;
    if (needsScorer) {
      firstScorer = await resolveFirstScorer(apiMatch.id);
      if (firstScorer) {
        await Match.findOneAndUpdate(
          { matchId: apiMatch.id },
          { $set: { firstGoalScorer: firstScorer } },
        );
      } else {
        scorerLookupFailed = true;
      }
    }

    for (const pred of unscored) {
      // Defer this prediction if a scorer bonus is owed but we couldn't resolve
      // it yet — the next cron run will retry instead of locking in match-only
      // points forever.
      if (scorerLookupFailed && pred.firstGoalScorer?.playerId) continue;

      const matchPoints = matchPointLogic(pred.score.home, pred.score.away, scoreHome, scoreAway);
      const scorerPoints = firstScorerPointLogic(
        pred.firstGoalScorer?.playerId ?? null,
        firstScorer?.playerId ?? null,
      );
      const points = matchPoints + scorerPoints;

      await incrementPlayerScore(pred.email, points);
      pred.pointsAwarded = points;
      await pred.save();
      console.log(
        `🏅 ${pred.email}: ${pred.score.home}-${pred.score.away} vs ${scoreHome}-${scoreAway}` +
          ` → ${matchPoints}${scorerPoints ? ` + ${scorerPoints} scorer` : ''} = ${points} pts` +
          ` (match ${apiMatch.id})`,
      );
    }
  }
}

// Returns the first goal's scorer for a given football-data.org match id, or
// null if the match details / goals can't be retrieved. We treat the first
// entry of `goals[]` as authoritative — football-data.org returns goals in
// chronological order. Own goals count: whoever physically scored first.
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
      console.warn(`[finished-cron] rate limit on /matches/${matchId}, deferring scorer bonus`);
    } else {
      console.error(`[finished-cron] failed to fetch scorers for ${matchId}:`, err.message);
    }
    return null;
  }
}

// Every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log(`🔁 Finished-match cron starting for ${COMPETITIONS_TO_TRACK.join(', ')}`);
  for (const competition of COMPETITIONS_TO_TRACK) {
    await processCompetition(competition);
  }
  console.log('✅ Finished-match cron complete');
});
