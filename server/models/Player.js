const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  // Password is optional now — OTP sign-in is the primary path and OAuth
  // (Sign in with Apple) doesn't store one. Legacy password-based login still
  // works for accounts created before the OTP migration.
  password: { type: String, default: null },
  // Set the moment a player completes an OTP verification (or signs in via a
  // pre-existing password account, which is grandfathered as verified).
  // Anything else (null) means the email hasn't been proven to belong to them.
  verifiedAt: { type: Date, default: null },
  points: { type: Number, default: 0 },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
});

module.exports = mongoose.model('Player', PlayerSchema);
