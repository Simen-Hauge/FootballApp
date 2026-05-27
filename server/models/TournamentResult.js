const mongoose = require('mongoose');

// Stores the authoritative tournament outcome (Golden Boot + Top 3) used to
// score every TournamentPrediction. One doc per (competition, season).
// `source` distinguishes auto-fetched results from manual admin overrides;
// once `finalizedAt` is set the resolve cron will pay out and lock in points.
const TournamentResultSchema = new mongoose.Schema({
  competition: { type: String, required: true },
  season: { type: String, required: true },

  goldenBoot: {
    playerId: { type: Number, default: null },
    playerName: { type: String, default: null },
    goals: { type: Number, default: null },
  },

  // [firstPlaceTeamId, secondPlaceTeamId, thirdPlaceTeamId]
  topThreeTeamIds: { type: [Number], default: [] },
  topThreeTeamNames: { type: [String], default: [] },

  source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  finalizedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null }, // when points were paid out

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TournamentResultSchema.index({ competition: 1, season: 1 }, { unique: true });

module.exports = mongoose.model('TournamentResult', TournamentResultSchema);
