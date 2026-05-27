const mongoose = require('mongoose');

// One document per (email, competition, season) holding a user's tournament-
// wide picks: Golden Boot + Top 3 teams. Per-pick `pointsAwarded` lets us
// resolve and surface each scoring slice independently once results are in.
const TournamentPredictionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  competition: { type: String, required: true }, // e.g. 'WC'
  season: { type: String, required: true },      // e.g. '2026'

  goldenBoot: {
    playerId: { type: Number, default: null },
    playerName: { type: String, default: null },
    teamId: { type: Number, default: null },
  },

  // Indexed 0..2 = 1st..3rd place predictions
  topThree: [
    {
      _id: false,
      rank: { type: Number, required: true },     // 1, 2, or 3
      teamId: { type: Number, default: null },
      teamName: { type: String, default: null },
    },
  ],

  pointsAwarded: {
    goldenBoot: { type: Number, default: null },
    topThree: { type: Number, default: null },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TournamentPredictionSchema.index(
  { email: 1, competition: 1, season: 1 },
  { unique: true },
);

module.exports = mongoose.model('TournamentPrediction', TournamentPredictionSchema);
