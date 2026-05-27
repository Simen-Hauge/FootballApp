const TournamentPrediction = require('../models/TournamentPrediction');
const Match = require('../models/Match');

// Returns true once the earliest match in a competition has kicked off.
// Tournament-wide picks lock at that moment — no edits afterwards.
async function isTournamentLocked(competition) {
  const earliest = await Match.findOne({ competition })
    .sort({ kickoffDateTime: 1 })
    .select('kickoffDateTime')
    .lean();
  if (!earliest) return false;
  return new Date(earliest.kickoffDateTime) <= new Date();
}

// GET the caller's tournament prediction + the current lock state. The lock
// flag lets the mobile UI disable editing without needing a separate call.
exports.getMine = async (req, res) => {
  try {
    const { competition = 'WC', season = String(new Date().getFullYear()) } = req.query;

    const [doc, locked] = await Promise.all([
      TournamentPrediction.findOne({
        email: req.user.email,
        competition,
        season,
      }),
      isTournamentLocked(competition),
    ]);

    res.json({ prediction: doc, locked });
  } catch (err) {
    console.error('❌ getMine tournament prediction error:', err);
    res.status(500).json({ error: 'Failed to load tournament prediction' });
  }
};

// UPSERT golden boot + top three picks. Blocks edits once the tournament
// has started so users can't change picks after seeing results.
exports.upsert = async (req, res) => {
  try {
    const {
      competition = 'WC',
      season = String(new Date().getFullYear()),
      goldenBoot,
      topThree,
    } = req.body;

    if (await isTournamentLocked(competition)) {
      return res.status(403).json({
        error: 'Tournament predictions are locked — the tournament has already started.',
      });
    }

    const update = { updatedAt: Date.now() };

    if (goldenBoot !== undefined) {
      update.goldenBoot = goldenBoot
        ? {
            playerId: goldenBoot.playerId ?? null,
            playerName: goldenBoot.playerName ?? null,
            teamId: goldenBoot.teamId ?? null,
          }
        : { playerId: null, playerName: null, teamId: null };
    }

    if (topThree !== undefined) {
      if (!Array.isArray(topThree) || topThree.length > 3) {
        return res.status(400).json({ error: 'topThree must be an array of up to 3 picks' });
      }
      // Normalize to a strict [rank 1, rank 2, rank 3] shape so missing slots
      // round-trip as nulls instead of disappearing from the array.
      update.topThree = [1, 2, 3].map((rank) => {
        const pick = topThree.find((p) => p && p.rank === rank);
        return {
          rank,
          teamId: pick?.teamId ?? null,
          teamName: pick?.teamName ?? null,
        };
      });
    }

    const updated = await TournamentPrediction.findOneAndUpdate(
      { email: req.user.email, competition, season },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.json({ message: 'Saved', prediction: updated });
  } catch (err) {
    console.error('❌ upsert tournament prediction error:', err);
    res.status(500).json({ error: 'Failed to save tournament prediction' });
  }
};

exports.isTournamentLocked = isTournamentLocked;
