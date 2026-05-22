const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  matchId: { type: Number, required: true, unique: true },
  competition: { type: String, required: true, index: true },
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  homeTeamId: { type: Number, default: null },
  awayTeamId: { type: Number, default: null },
  homeCrest: { type: String, default: null },
  awayCrest: { type: String, default: null },
  score: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  firstGoalScorer: {
    playerId: { type: Number, default: null },
    playerName: { type: String, default: null },
    minute: { type: Number, default: null },
  },
  kickoffDateTime: { type: Date, required: true, index: true },
  matchweek: { type: Number, default: null },
  stage: { type: String, default: null },
  group: { type: String, default: null },
  status: { type: String, default: 'not started' },
  fetchedAt: { type: Date, default: Date.now },
});

MatchSchema.index({ competition: 1, matchweek: 1 });
MatchSchema.index({ competition: 1, stage: 1 });
MatchSchema.index({ competition: 1, kickoffDateTime: 1 });

module.exports = mongoose.model('Match', MatchSchema);
