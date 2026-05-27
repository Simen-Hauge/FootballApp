const TournamentResult = require('../models/TournamentResult');

// GET the current authoritative tournament result (or null if not finalized).
// Public — anyone with an account can see the outcome once it's set.
exports.get = async (req, res) => {
  try {
    const { competition = 'WC', season = String(new Date().getFullYear()) } = req.query;
    const doc = await TournamentResult.findOne({ competition, season });
    res.json(doc || null);
  } catch (err) {
    console.error('❌ get tournament result error:', err);
    res.status(500).json({ error: 'Failed to load tournament result' });
  }
};

// PUT a manual override / initial value. Admin-only. Setting finalizedAt to a
// past date triggers the resolve cron to pay out points on its next pass.
// `source: 'manual'` prevents the auto-fetch cron from clobbering this value.
exports.upsertManual = async (req, res) => {
  try {
    const {
      competition = 'WC',
      season = String(new Date().getFullYear()),
      goldenBoot,
      topThreeTeamIds,
      topThreeTeamNames,
      finalize = false,
    } = req.body;

    if (topThreeTeamIds !== undefined) {
      if (!Array.isArray(topThreeTeamIds) || topThreeTeamIds.length > 3) {
        return res.status(400).json({ error: 'topThreeTeamIds must be an array of up to 3 ids' });
      }
    }

    const update = {
      source: 'manual',
      updatedAt: Date.now(),
    };
    if (goldenBoot !== undefined) {
      update.goldenBoot = {
        playerId: goldenBoot?.playerId ?? null,
        playerName: goldenBoot?.playerName ?? null,
        goals: goldenBoot?.goals ?? null,
      };
    }
    if (topThreeTeamIds !== undefined) update.topThreeTeamIds = topThreeTeamIds;
    if (topThreeTeamNames !== undefined) update.topThreeTeamNames = topThreeTeamNames;
    if (finalize) update.finalizedAt = new Date();

    const saved = await TournamentResult.findOneAndUpdate(
      { competition, season },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ message: 'Saved', result: saved });
  } catch (err) {
    console.error('❌ upsertManual tournament result error:', err);
    res.status(500).json({ error: 'Failed to save tournament result' });
  }
};
