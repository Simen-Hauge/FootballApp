const mongoose = require('mongoose');

// One-time codes for email-based sign-in. The TTL index on `expiresAt` lets
// Mongo evict expired docs automatically — no cron needed. We store only a
// bcrypt hash of the code, never the code itself, so a DB dump doesn't let
// someone log in as another user.
const EmailCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  consumedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// TTL: Mongo deletes the doc as soon as `expiresAt` is in the past.
EmailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailCode', EmailCodeSchema);
