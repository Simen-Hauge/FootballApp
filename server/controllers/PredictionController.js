const Prediction = require('../models/Prediction');
const Match = require('../models/Match');
const Player = require('../models/Player');
const Activity = require('../models/Activity');

// GET a single prediction for a match — always the caller's own prediction.
exports.getPrediction = async (req, res) => {
  const { matchid } = req.query;
  if (!matchid) {
    return res.status(400).json({ error: 'matchid required' });
  }

  try {
    const matchIdInt = parseInt(matchid, 10);
    const prediction = await Prediction.findOne({
      email: req.user.email,
      matchid: matchIdInt,
    });

    res.status(200).json(prediction || null);
  } catch (err) {
    console.error('❌ Error in getPrediction:', err);
    res.status(500).json({ error: 'Failed to fetch prediction' });
  }
};

// CREATE or UPDATE a prediction — owned by the caller.
exports.makePrediction = async (req, res) => {
  const { matchid, score, gamemode, firstGoalScorer } = req.body;

  try {
    const match = await Match.findOne({ matchId: matchid });
    if (match && new Date(match.kickoffDateTime) <= new Date()) {
      return res.status(403).json({ error: 'Predictions are locked — the match has already started.' });
    }

    const lcEmail = req.user.email;
    const wasFirstPrediction = !(await Prediction.exists({ email: lcEmail, matchid, gamemode }));

    const update = { score };
    if (firstGoalScorer !== undefined) {
      update.firstGoalScorer = firstGoalScorer
        ? {
            playerId: firstGoalScorer.playerId ?? null,
            playerName: firstGoalScorer.playerName ?? null,
          }
        : { playerId: null, playerName: null };
    }
    update.updatedAt = Date.now();

    const updated = await Prediction.findOneAndUpdate(
      { email: lcEmail, matchid, gamemode },
      { $set: update },
      { new: true, upsert: true }
    );

    if (wasFirstPrediction && match) {
      try {
        // Intentionally exclude `score` — broadcasting predictions before kickoff
        // would defeat the reveal-at-kickoff rule in getPredictionsForMatch.
        await Activity.create({
          email: lcEmail,
          type: 'PREDICTION_SAVED',
          gamemode: String(gamemode),
          payload: {
            matchid,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
          },
        });
      } catch (e) {
        console.warn('⚠️ Failed to write PREDICTION_SAVED activity:', e.message);
      }
    }

    res.status(200).json({
      message: 'Prediction saved',
      prediction: updated,
    });
  } catch (err) {
    console.error('❌ Error in makePrediction:', err);
    res.status(500).json({ error: 'Failed to save prediction' });
  }
};

// GET all predictions for a match — only revealed once kickoff has passed,
// so users can't copy each other's picks ahead of time.
exports.getPredictionsForMatch = async (req, res) => {
  try {
    const matchid = parseInt(req.params.matchId, 10);
    if (!matchid) return res.status(400).json({ error: 'matchId required' });

    const match = await Match.findOne({ matchId: matchid });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (new Date(match.kickoffDateTime) > new Date()) {
      return res.status(403).json({ error: 'Predictions are revealed at kickoff.' });
    }

    const predictions = await Prediction.find({ matchid });
    if (predictions.length === 0) return res.json([]);

    const emails = predictions.map((p) => p.email);
    const players = await Player.find({ email: { $in: emails } }).select('name email');
    const byEmail = new Map(players.map((p) => [p.email, p]));

    res.json(
      predictions.map((p) => {
        const player = byEmail.get(p.email);
        return {
          playerId: player?._id ?? null,
          name: player?.name ?? 'Unknown',
          score: p.score,
          firstGoalScorer: p.firstGoalScorer ?? null,
          pointsAwarded: p.pointsAwarded,
        };
      }),
    );
  } catch (err) {
    console.error('❌ getPredictionsForMatch error:', err);
    res.status(500).json({ error: 'Failed to fetch predictions for match' });
  }
};

// LIST predictions for the authenticated player, newest first.
exports.getPredictionHistory = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const filter = { email: req.user.email };
    if (req.query.gamemode) filter.gamemode = String(req.query.gamemode);

    const preds = await Prediction.find(filter).sort({ updatedAt: -1 }).limit(limit);

    const matchIds = [...new Set(preds.map((p) => p.matchid).filter(Boolean))];
    const matches = await Match.find({ matchId: { $in: matchIds } }).lean();
    const byId = new Map(matches.map((m) => [m.matchId, m]));

    res.json(
      preds.map((p) => ({
        id: p._id,
        matchid: p.matchid,
        score: p.score,
        firstGoalScorer: p.firstGoalScorer ?? null,
        pointsAwarded: p.pointsAwarded,
        gamemode: p.gamemode,
        updatedAt: p.updatedAt,
        match: byId.get(p.matchid) ?? null,
      })),
    );
  } catch (err) {
    console.error('❌ getPredictionHistory error:', err);
    res.status(500).json({ error: 'Failed to fetch prediction history' });
  }
};

// STORE a whole prediction table (per competition/season) — caller's own.
exports.storePlayersPredictionTable = async (req, res) => {
  const { competition, season, prediction } = req.body;

  try {
    const saved = await Prediction.findOneAndUpdate(
      { email: req.user.email, competition, season },
      { $set: { prediction } },
      { new: true, upsert: true }
    );

    res.json(saved);
  } catch (err) {
    console.error('❌ Backend error in storing prediction table:', err);
    res.status(500).json({ error: 'Failed to store table' });
  }
};

// GET a whole prediction table — caller's own.
exports.getPredictionTable = async (req, res) => {
  const { competition, season } = req.query;

  try {
    const table = await Prediction.findOne({ email: req.user.email, competition, season });
    if (!table) return res.status(404).json({ error: 'Predictions not found' });

    res.json(table.prediction);
  } catch (err) {
    console.error('❌ Error in getPredictionTable:', err);
    res.status(500).json({ error: 'Failed to fetch prediction table' });
  }
};
