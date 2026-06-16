// models/Prediction.js
const mongoose = require('mongoose');

const PredictionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true }, // tie to Player.email
  matchid: { type: Number }, // from football-data.org
  score: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  firstGoalScorer: {
    playerId: { type: Number, default: null },
    playerName: { type: String, default: null },
  },
  pointsAwarded: { type: Number, default: null },
  // True when match points were awarded but scorer bonus is deferred because
  // first-goal scorer data was unavailable at scoring time.
  scorerPending: { type: Boolean, default: false },
  gamemode: { type: String }, // e.g., "classic" or "fantasy"

  // optional: storing whole table per season
  competition: { type: String },
  season: { type: String },
  prediction: { type: mongoose.Schema.Types.Mixed }, // can hold whole JSON

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// update timestamps automatically
PredictionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Prediction', PredictionSchema);
