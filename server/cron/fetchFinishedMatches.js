const cron = require('node-cron');
const Match = require('../models/Match');
const Prediction = require('../models/Prediction');
const { matchPointLogic, firstScorerPointLogic } = require('../utils/calculatePoints');
const { incrementPlayerScore } = require('../controllers/PlayerController');
const { getMatch, getMatches, COMPETITIONS_TO_TRACK, isRateLimit } = require('../utils/footballDataClient');
const { mapApiMatchToDoc, deriveStoredScore } = require('../utils/matchMapper');

const FINAL_STATUSES = new Set(['FINISHED', 'IN_PLAY', 'PAUSED']);

// How many days back to fetch from the API. Covers typical gaps between cron
// runs and short server outages without re-pulling hundreds of old matches.
const SYNC_WINDOW_DAYS = 4;

function toDateStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function processCompetition(competition) {
  // Pre-flight: check whether there is anything to do before hitting the API.
  //
  // Unscored work: predictions attached to already-finished matches that still
  // have pointsAwarded=null or scorerPending=true.
  //
  // Status-update work: matches we know about that kicked off in the past but
  // whose DB status hasn't been flipped to 'finished' yet.
  const finishedMatchIds = await Match
    .find({ competition, status: 'finished' })
    .distinct('matchId');

  const unscoredCount = finishedMatchIds.length
    ? await Prediction.countDocuments({
        matchid: { $in: finishedMatchIds },
        $or: [{ pointsAwarded: null }, { scorerPending: true }],
      })
    : 0;

  const pendingStatusUpdate = await Match.countDocuments({
    competition,
    status: { $in: ['not started', 'ongoing'] },
    kickoffDateTime: { $lte: new Date() },
  });

  if (unscoredCount === 0 && pendingStatusUpdate === 0) {
    console.log(`[finished-cron] ${competition}: nothing to do, skipping API call`);
    return;
  }

  // Only pull the recent window — avoids re-fetching hundreds of old results.
  const dateFrom = toDateStr(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const dateTo   = toDateStr(Date.now() + 24 * 60 * 60 * 1000); // +1 day buffer

  let data;
  try {
    data = await getMatches(competition, { dateFrom, dateTo }, { unfoldGoals: true });
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[finished-cron] rate limit hit for ${competition}, skipping`);
      return;
    }
    console.error(`[finished-cron] failed to fetch ${competition}:`, err.message);
    return;
  }

  // Track which matchIds we handle here so the backfill below can skip them.
  const handledInWindow = new Set();

  for (const apiMatch of (data.matches || []).filter(m => FINAL_STATUSES.has(m.status))) {
    handledInWindow.add(apiMatch.id);

    const doc = mapApiMatchToDoc(apiMatch, competition);
    const resolvedScore = deriveStoredScore(apiMatch.score);
    const scoreHome = resolvedScore.home ?? 0;
    const scoreAway = resolvedScore.away ?? 0;

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

  // Backfill scorer for scorerPending predictions on matches outside the
  // fetch window (e.g. older matches the API window no longer covers).
  await backfillOldPendingScorers(competition, handledInWindow);
}

// Resolves scorerPending predictions for matches that are no longer in the
// rolling fetch window. Uses the stored Match.firstGoalScorer when available,
// otherwise falls back to a targeted per-match API call.
async function backfillOldPendingScorers(competition, alreadyHandled) {
  const competitionMatchIds = await Match
    .find({ competition })
    .distinct('matchId');

  const oldMatchIds = competitionMatchIds.filter(id => !alreadyHandled.has(id));
  if (oldMatchIds.length === 0) return;

  const pendingPreds = await Prediction.find({
    matchid: { $in: oldMatchIds },
    scorerPending: true,
  });
  if (pendingPreds.length === 0) return;

  // Group by matchId to minimise DB + API round-trips.
  const byMatch = new Map();
  for (const pred of pendingPreds) {
    if (!byMatch.has(pred.matchid)) byMatch.set(pred.matchid, []);
    byMatch.get(pred.matchid).push(pred);
  }

  for (const [matchId, preds] of byMatch) {
    const storedMatch = await Match.findOne({ matchId }).lean();
    if (!storedMatch) continue;

    let firstScorer = storedMatch.firstGoalScorer?.playerId
      ? storedMatch.firstGoalScorer
      : null;

    if (!firstScorer) {
      firstScorer = await resolveFirstScorer(matchId);
      if (firstScorer) {
        await Match.findOneAndUpdate(
          { matchId },
          { $set: { firstGoalScorer: firstScorer } },
        );
      }
    }

    if (!firstScorer?.playerId) continue;

    for (const pred of preds) {
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
        `🎯 [${competition}] ${pred.email}: old scorer backfill ${scorerPoints} pts (match ${matchId})`,
      );
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
