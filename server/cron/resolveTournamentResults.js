const cron = require('node-cron');
const Match = require('../models/Match');
const GroupStandingPrediction = require('../models/GroupStandingPrediction');
const TournamentResult = require('../models/TournamentResult');
const TournamentPrediction = require('../models/TournamentPrediction');
const { goldenBootPointLogic, topThreePointLogic } = require('../utils/calculatePoints');
const {
  normalizeGroupCode,
  extractGroupStandings,
  calculateGroupStandingPoints,
} = require('../utils/groupStandingScoring');
const { incrementPlayerScore } = require('../controllers/PlayerController');
const {
  getStandings,
  getScorers,
  COMPETITIONS_TO_TRACK,
  isRateLimit,
} = require('../utils/footballDataClient');

// Competitions to attempt tournament-wide scoring for. WC + CL have a defined
// finish (knockout final), PL does not, so it's excluded.
const TOURNAMENT_COMPETITIONS = ['WC', 'CL'];

// Returns true once every match in the competition has FINISHED status —
// our trigger for considering the tournament complete enough to auto-resolve.
async function isTournamentComplete(competition) {
  const total = await Match.countDocuments({ competition });
  if (total === 0) return false;
  const finished = await Match.countDocuments({ competition, status: 'finished' });
  return finished === total;
}

async function isGroupStageComplete(competition) {
  const total = await Match.countDocuments({ competition, group: { $ne: null } });
  if (total === 0) return false;

  const finished = await Match.countDocuments({
    competition,
    group: { $ne: null },
    status: 'finished',
  });
  return finished === total;
}

async function payoutWorldCupGroupStandings() {
  const predictions = await GroupStandingPrediction.find({
    competition: 'WC',
    pointsAwarded: null,
  });
  if (predictions.length === 0) return 0;

  const complete = await isGroupStageComplete('WC');
  if (!complete) return 0;

  let standingsData;
  try {
    standingsData = await getStandings('WC');
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn('[tournament-cron] rate limit on WC group standings, retrying next cycle');
    } else {
      console.error('[tournament-cron] failed to fetch WC group standings:', err.message);
    }
    return 0;
  }

  const actualGroups = extractGroupStandings(standingsData?.standings);
  if (actualGroups.size === 0) return 0;

  let scored = 0;
  for (const pred of predictions) {
    const actualOrder = actualGroups.get(normalizeGroupCode(pred.groupCode));
    if (!actualOrder) continue;

    const points = calculateGroupStandingPoints(pred.rankedTeamIds, actualOrder);
    if (points > 0) {
      await incrementPlayerScore(pred.email, points);
    }

    pred.pointsAwarded = points;
    await pred.save();
    scored += 1;
    console.log(
      `🏁 ${pred.email}: group ${pred.groupCode} ${points} pts (WC group standings)`,
    );
  }

  return scored;
}

// Attempts to pull final top scorer + top-3 standings from football-data.org.
// Returns null on any failure so the caller can decide whether to skip the
// cycle or fall back to a manual override. We only treat the response as
// authoritative if both pieces are present.
async function autoFetchResult(competition) {
  let scorersData;
  let standingsData;
  try {
    [scorersData, standingsData] = await Promise.all([
      getScorers(competition, { limit: 1 }),
      getStandings(competition),
    ]);
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[tournament-cron] rate limit on ${competition}, retrying next cycle`);
    } else {
      console.error(`[tournament-cron] auto-fetch failed for ${competition}:`, err.message);
    }
    return null;
  }

  const top = Array.isArray(scorersData?.scorers) && scorersData.scorers[0];
  if (!top?.player?.id) return null;
  const goldenBoot = {
    playerId: top.player.id,
    playerName: top.player.name ?? null,
    goals: top.goals ?? null,
  };

  // Knockout tournaments expose the final ranking as a TOTAL standings group
  // labelled "FINAL" or similar. We take the first table in any non-group
  // stage and grab positions 1–3. If we can't find one with 3 rows, bail.
  const candidate = (standingsData?.standings || []).find((g) => {
    if (g.type !== 'TOTAL') return false;
    if (g.group) return false;
    return Array.isArray(g.table) && g.table.length >= 3;
  });
  if (!candidate) return null;
  const topThreeRows = candidate.table.slice(0, 3);
  const topThreeTeamIds = topThreeRows.map((row) => row.team?.id).filter((id) => id != null);
  const topThreeTeamNames = topThreeRows.map((row) => row.team?.name ?? null);
  if (topThreeTeamIds.length !== 3) return null;

  return { goldenBoot, topThreeTeamIds, topThreeTeamNames };
}

// Pays out points to every prediction that hasn't been scored yet for the
// given finalized TournamentResult. Idempotent: predictions with non-null
// pointsAwarded.goldenBoot / pointsAwarded.topThree are left alone.
async function payoutPoints(result) {
  const predictions = await TournamentPrediction.find({
    competition: result.competition,
    season: result.season,
  });
  if (predictions.length === 0) return 0;

  const actualGoldenBootId = result.goldenBoot?.playerId ?? null;
  const actualTopThree = result.topThreeTeamIds || [];

  let scored = 0;
  for (const pred of predictions) {
    const predictedTopThree = [1, 2, 3].map((rank) => {
      const slot = (pred.topThree || []).find((p) => p.rank === rank);
      return slot?.teamId ?? null;
    });

    const needsGoldenBoot = pred.pointsAwarded?.goldenBoot == null;
    const needsTopThree = pred.pointsAwarded?.topThree == null;
    if (!needsGoldenBoot && !needsTopThree) continue;

    let delta = 0;
    if (needsGoldenBoot) {
      const pts = goldenBootPointLogic(pred.goldenBoot?.playerId ?? null, actualGoldenBootId);
      pred.pointsAwarded.goldenBoot = pts;
      delta += pts;
    }
    if (needsTopThree) {
      const pts = topThreePointLogic(predictedTopThree, actualTopThree);
      pred.pointsAwarded.topThree = pts;
      delta += pts;
    }

    if (delta > 0) {
      await incrementPlayerScore(pred.email, delta);
    }
    await pred.save();
    scored += 1;
    console.log(
      `🏆 ${pred.email}: golden boot ${pred.pointsAwarded.goldenBoot ?? '—'} pts, top 3 ${pred.pointsAwarded.topThree ?? '—'} pts (${result.competition}/${result.season})`,
    );
  }
  return scored;
}

async function processCompetition(competition) {
  if (competition === 'WC') {
    await payoutWorldCupGroupStandings();
  }

  const season = String(new Date().getFullYear());
  let result = await TournamentResult.findOne({ competition, season });

  // Manual overrides are sticky — never overwrite them with auto-fetch data,
  // but still pay out points if not done yet.
  if (result?.source !== 'manual') {
    const complete = await isTournamentComplete(competition);
    if (!complete && !result?.finalizedAt) {
      return; // wait until the tournament has finished
    }
    const auto = await autoFetchResult(competition);
    if (auto) {
      result = await TournamentResult.findOneAndUpdate(
        { competition, season },
        {
          $set: {
            goldenBoot: auto.goldenBoot,
            topThreeTeamIds: auto.topThreeTeamIds,
            topThreeTeamNames: auto.topThreeTeamNames,
            source: 'auto',
            finalizedAt: result?.finalizedAt || new Date(),
            updatedAt: Date.now(),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    }
  }

  if (!result?.finalizedAt) return;

  const scored = await payoutPoints(result);
  if (scored > 0 && !result.resolvedAt) {
    result.resolvedAt = new Date();
    await result.save();
  }
}

// Every 30 minutes — checks if any tracked tournament is ready to be scored.
cron.schedule('*/30 * * * *', async () => {
  console.log(`🔁 Tournament-resolve cron starting for ${TOURNAMENT_COMPETITIONS.join(', ')}`);
  for (const competition of TOURNAMENT_COMPETITIONS) {
    if (!COMPETITIONS_TO_TRACK.includes(competition)) continue;
    try {
      await processCompetition(competition);
    } catch (err) {
      console.error(`[tournament-cron] unexpected error for ${competition}:`, err.message);
    }
  }
  console.log('✅ Tournament-resolve cron complete');
});

module.exports = {
  processCompetition,
  normalizeGroupCode,
  extractGroupStandings,
  calculateGroupStandingPoints,
};
