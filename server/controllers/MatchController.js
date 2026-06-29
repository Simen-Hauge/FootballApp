const Match = require('../models/Match');
const { getMatches, isRateLimit } = require('../utils/footballDataClient');
const { mapApiMatchToDoc } = require('../utils/matchMapper');

async function upsertNewMatches(apiMatches, competition) {
  if (!apiMatches?.length) return [];
  const ids = apiMatches.map((m) => m.id);
  const existing = await Match.find({ matchId: { $in: ids } }, { matchId: 1 }).lean();
  const existingIds = new Set(existing.map((m) => m.matchId));

  const newDocs = apiMatches
    .filter((m) => !existingIds.has(m.id))
    .map((m) => mapApiMatchToDoc(m, competition));

  if (newDocs.length > 0) {
    await Match.insertMany(newDocs, { ordered: false });
    console.log(`💾 Saved ${newDocs.length} new ${competition} matches`);
  }
  return newDocs;
}

async function upsertMatches(apiMatches, competition) {
  if (!apiMatches?.length) return [];

  await Match.bulkWrite(
    apiMatches.map((m) => ({
      updateOne: {
        filter: { matchId: m.id },
        update: { $set: mapApiMatchToDoc(m, competition) },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  return Match.find({ matchId: { $in: apiMatches.map((m) => m.id) } });
}

function handleApiError(err, res) {
  if (isRateLimit(err)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }
  console.error('❌ Error fetching matches:', err.message);
  return res.status(500).json({ error: 'Failed to fetch matches' });
}

exports.getMatchesByDate = async (req, res) => {
  const { date, competition = 'PL' } = req.query;
  if (!date) return res.status(400).json({ error: 'Missing date' });

  try {
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const cached = await Match.find({
      competition,
      kickoffDateTime: { $gte: startOfDay, $lte: endOfDay },
    });

    if (cached.length > 0) {
      console.log(`✅ Serving ${cached.length} ${competition} matches from cache (by-date ${date})`);
      return res.json(cached);
    }

    const data = await getMatches(competition, { dateFrom: date, dateTo: date });
    const newMatches = await upsertNewMatches(data.matches, competition);
    res.json([...cached, ...newMatches]);
  } catch (err) {
    return handleApiError(err, res);
  }
};

exports.getMatchesByMatchweek = async (req, res) => {
  const { competition = 'PL', matchweek } = req.query;
  if (!matchweek) return res.status(400).json({ error: 'Missing matchweek' });

  try {
    const mwInt = parseInt(matchweek, 10);
    const cached = await Match.find({ competition, matchweek: mwInt });

    if (cached.length > 0) {
      console.log(`✅ Serving ${cached.length} ${competition} matches from cache (mw ${mwInt})`);
      return res.json(cached);
    }

    const data = await getMatches(competition, { matchday: mwInt });
    const newMatches = await upsertNewMatches(data.matches, competition);
    res.json([...cached, ...newMatches]);
  } catch (err) {
    return handleApiError(err, res);
  }
};

exports.getMatchesByStage = async (req, res) => {
  const { competition = 'WC', stage } = req.query;
  if (!stage) return res.status(400).json({ error: 'Missing stage' });

  try {
    const cached = await Match.find({ competition, stage }).sort({ kickoffDateTime: 1 });

    const data = await getMatches(competition, { stage });
    await upsertMatches(data.matches, competition);

    const fresh = await Match.find({ competition, stage }).sort({ kickoffDateTime: 1 });
    console.log(`✅ Serving ${fresh.length} ${competition} matches after refresh (stage ${stage})`);
    res.json(fresh);
  } catch (err) {
    const cached = await Match.find({ competition, stage }).sort({ kickoffDateTime: 1 });
    if (cached.length > 0) {
      console.warn(
        `⚠️ getMatchesByStage(${competition}, ${stage}) fell back to cache: ${err.message}`,
      );
      return res.json(cached);
    }
    return handleApiError(err, res);
  }
};

// Refresh the local cache for a competition by pulling everything from
// football-data.org and upserting any not-yet-stored matches. Used as a
// fallback when /next or /upcoming finds an empty cache so tournament
// competitions (WC, CL) work without a manual seed step.
async function refreshCompetitionCache(competition) {
  try {
    const data = await getMatches(competition);
    const apiMatches = (data.matches || []).filter((m) =>
      ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED'].includes(m.status),
    );
    if (apiMatches.length === 0) return;

    await upsertMatches(apiMatches, competition);
    console.log(`💾 Cache refresh: upserted ${apiMatches.length} ${competition} matches`);
  } catch (err) {
    console.error(`⚠️ refreshCompetitionCache(${competition}) failed:`, err.message);
  }
}

// Next upcoming (not-started) match for a competition. Single doc.
exports.getNextMatch = async (req, res) => {
  const { competition = 'PL' } = req.query;
  try {
    const findUpcoming = () =>
      Match.findOne({
        competition,
        status: 'not started',
        kickoffDateTime: { $gte: new Date() },
      }).sort({ kickoffDateTime: 1 });

    let match = await findUpcoming();
    if (!match) {
      await refreshCompetitionCache(competition);
      match = await findUpcoming();
    }
    if (!match) return res.status(404).json({ error: 'No upcoming matches' });
    res.json(match);
  } catch (err) {
    console.error('❌ getNextMatch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch next match' });
  }
};

// Upcoming + live matches for a competition, soonest first. Used by Matchday list.
exports.getUpcomingMatches = async (req, res) => {
  const { competition = 'PL' } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  try {
    const findUpcoming = () =>
      Match.find({
        competition,
        status: { $in: ['not started', 'ongoing'] },
      })
        .sort({ kickoffDateTime: 1 })
        .limit(limit);

    let matches = await findUpcoming();
    if (matches.length === 0) {
      await refreshCompetitionCache(competition);
      matches = await findUpcoming();
    }
    res.json(matches);
  } catch (err) {
    console.error('❌ getUpcomingMatches error:', err.message);
    res.status(500).json({ error: 'Failed to fetch upcoming matches' });
  }
};

exports.getMatchById = async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId, 10);
    if (!matchId) return res.status(400).json({ error: 'matchId required' });
    const match = await Match.findOne({ matchId });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    console.error('❌ Error fetching match by id:', err);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
};

exports.getCurrentMatchweek = async (req, res) => {
  try {
    const { kickoffDateTime, competition = 'PL' } = req.query;
    const date = new Date(kickoffDateTime);

    const match = await Match.findOne({
      competition,
      kickoffDateTime: { $gte: date },
      matchweek: { $ne: null },
    }).sort({ kickoffDateTime: 1 });

    if (!match) {
      return res.status(404).json({ error: 'No upcoming matches found' });
    }
    res.json({ matchweek: match.matchweek });
  } catch (err) {
    console.error('❌ Error in getCurrentMatchweek:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};
