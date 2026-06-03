const cron = require('node-cron');
const Match = require('../models/Match');
const { getMatches, COMPETITIONS_TO_TRACK, isRateLimit } = require('../utils/footballDataClient');
const { mapApiMatchToDoc } = require('../utils/matchMapper');

// Matches that are live or done are owned by the finished-match cron (it writes
// scores and awards points). This job only touches not-yet-played fixtures, so
// it can never clobber a score or re-trigger a payout.
const LIVE_OR_FINAL = new Set(['IN_PLAY', 'PAUSED', 'FINISHED']);

// Upserts every upcoming/scheduled fixture for a competition. This is what makes
// the World Cup knockout bracket (Round of 16, QF, SF, Final) appear on its own:
// football-data.org only publishes those fixtures once the group stage resolves,
// and the finished-match cron skips non-final matches, so without this they'd
// never land in our DB until they kicked off — too late for users to predict.
// Upserting (not just inserting) also refreshes kickoff time, stage/group, and
// the TBD→real-team swap as the bracket fills in.
async function syncCompetition(competition) {
  let data;
  try {
    data = await getMatches(competition);
  } catch (err) {
    if (isRateLimit(err)) {
      console.warn(`[fixture-cron] rate limit hit for ${competition}, skipping`);
      return 0;
    }
    console.error(`[fixture-cron] failed to fetch ${competition}:`, err.message);
    return 0;
  }

  let upserted = 0;
  for (const apiMatch of data.matches || []) {
    if (LIVE_OR_FINAL.has(apiMatch.status)) continue;

    const doc = mapApiMatchToDoc(apiMatch, competition);
    await Match.findOneAndUpdate(
      { matchId: doc.matchId },
      { $set: doc },
      { upsert: true, setDefaultsOnInsert: true },
    );
    upserted += 1;
  }

  if (upserted > 0) {
    console.log(`🗓️  [fixture-cron] synced ${upserted} upcoming ${competition} fixtures`);
  }
  return upserted;
}

async function syncAllFixtures() {
  console.log(`🔁 Fixture-sync cron starting for ${COMPETITIONS_TO_TRACK.join(', ')}`);
  let total = 0;
  for (const competition of COMPETITIONS_TO_TRACK) {
    total += await syncCompetition(competition);
  }
  console.log(`✅ Fixture-sync cron complete (${total} fixtures upserted)`);
  return total;
}

// Every 6 hours. Fixtures change far less often than scores, and the knockout
// bracket only needs to land a day or two before those matches are played, so a
// 6h cadence keeps API usage minimal (3 calls/run) while staying well ahead.
cron.schedule('0 */6 * * *', syncAllFixtures);

module.exports = { syncAllFixtures, syncCompetition };
