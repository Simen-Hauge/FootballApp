const bcrypt = require('bcryptjs');
const Player = require('../models/Player');
const Group = require('../models/Group');
const Prediction = require('../models/Prediction');
const GroupStandingPrediction = require('../models/GroupStandingPrediction');
const EmailCode = require('../models/EmailCode');
const Activity = require('../models/Activity');
const { signToken } = require('../middleware/auth');

// GET all players. Emails removed — they're PII and not needed by clients.
exports.getAllPlayers = async (req, res) => {
  try {
    const players = await Player.find({}).select('name points');
    res.json(
      players.map((p) => ({
        id: p._id,
        name: p.name,
        points: p.points || 0,
      })),
    );
  } catch (err) {
    console.error('❌ getAllPlayers error:', err);
    res.status(500).json({ error: 'Failed to get all players' });
  }
};

// GET leaderboard. Without `gamemode` query → global (sums Player.points).
// With `gamemode` query (e.g. ?gamemode=2 for PL, ?gamemode=3 for WC) → aggregates
// pointsAwarded across Prediction docs filtered by that gamemode.
exports.getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const gamemode = req.query.gamemode != null ? String(req.query.gamemode) : null;

    if (!gamemode) {
      const players = await Player.find({})
        .select('name points')
        .sort({ points: -1, name: 1 })
        .limit(limit);
      return res.json(
        players.map((p, i) => ({
          rank: i + 1,
          id: p._id,
          name: p.name,
          points: p.points || 0,
        })),
      );
    }

    const Prediction = require('../models/Prediction');
    const rows = await Prediction.aggregate([
      { $match: { gamemode, pointsAwarded: { $ne: null } } },
      { $group: { _id: '$email', points: { $sum: '$pointsAwarded' } } },
      { $sort: { points: -1, _id: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'players',
          localField: '_id',
          foreignField: 'email',
          as: 'player',
        },
      },
      { $unwind: { path: '$player', preserveNullAndEmptyArrays: true } },
    ]);

    res.json(
      rows.map((r, i) => ({
        rank: i + 1,
        id: r.player?._id ?? r._id,
        name: r.player?.name ?? 'Unknown',
        points: r.points,
      })),
    );
  } catch (err) {
    console.error('❌ getLeaderboard error:', err);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
};

// GET players by groupId. Authenticated callers only; emails still returned
// because group members can see each other's contact-style identity in-app.
exports.getPlayersByGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const players = await Player.find({ groups: groupId }).select('name email points');
    res.json(players);
  } catch (err) {
    console.error('❌ getPlayersByGroup error:', err);
    res.status(500).json({ error: 'Failed to get players by group' });
  }
};

// SIGNUP — returns a session token; do not log incoming credentials.
exports.createPlayer = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const lcEmail = String(email).toLowerCase();
    const existing = await Player.findOne({ email: lcEmail });
    if (existing) {
      return res.status(409).json({ error: 'Player already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newPlayer = new Player({
      email: lcEmail,
      name,
      password: hashed,
      points: 0,
      groups: [],
    });
    await newPlayer.save();

    const token = signToken(newPlayer);
    res.status(201).json({
      message: 'Player registered',
      token,
      player: { id: newPlayer._id, email: newPlayer.email, name: newPlayer.name, points: newPlayer.points },
    });
  } catch (err) {
    console.error('❌ Signup error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};


// LOGIN — issues a JWT.
exports.loginPlayer = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const player = await Player.findOne({ email: String(email).toLowerCase() });
    if (!player) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, player.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(player);
    res.status(200).json({
      message: 'Login successful',
      token,
      player: { id: player._id, email: player.email, name: player.name, points: player.points },
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Failed to login player' });
  }
};

// UPDATE PROFILE (name) — identity comes from the JWT, never the body.
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });

    const player = await Player.findOneAndUpdate(
      { email: req.user.email },
      { $set: { name: trimmed } },
      { new: true },
    );
    if (!player) return res.status(404).json({ error: 'Player not found' });

    res.json({
      message: 'Profile updated',
      player: { id: player._id, email: player.email, name: player.name, points: player.points },
    });
  } catch (err) {
    console.error('❌ updateProfile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// UPDATE PASSWORD — identity from JWT; still require current password.
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const player = await Player.findOne({ email: req.user.email });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const valid = await bcrypt.compare(currentPassword, player.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    player.password = await bcrypt.hash(newPassword, 10);
    await player.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('❌ updatePassword error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
};

// Internal-only helper used by the scoring cron. Not exposed via HTTP.
async function incrementPlayerScore(email, points) {
  const result = await Player.updateOne({ email }, { $inc: { points } });
  return result;
}

// Cascade-delete the authenticated user's account along with all data they own
// or are referenced from. Required for App Store guideline 5.1.1(v): users
// must be able to delete their account in-app, and the deletion must actually
// remove their data.
//
// What gets wiped:
//   - Predictions (by email)
//   - GroupStandingPredictions (by email)
//   - EmailCodes (by email — any pending OTP sessions)
//   - Activities (by email — anything they generated)
//   - Group memberships (Group.players references)
//   - Groups they own:
//       - if there are other members → transfer ownership (highest-points
//         remaining player, alphabetical tiebreak)
//       - if they're the only member → delete the group entirely
//   - Player document
//
// No DB transaction — Mongo transactions require a replica set and aren't
// load-bearing here. Order matters: dependencies first, Player last. If a
// later step throws, the user is partially deleted; acceptable because they
// can retry and the operation is idempotent (each delete-by-email is safe to
// re-run).
async function cascadeDeleteAccount({ playerId, email }) {
  await Prediction.deleteMany({ email });
  await GroupStandingPrediction.deleteMany({ email });
  await EmailCode.deleteMany({ email });
  await Activity.deleteMany({ email });

  // Remove from any group's player list (groups they don't own).
  await Group.updateMany({ players: playerId }, { $pull: { players: playerId } });

  // Handle groups they own — operate on the post-removal player list.
  const ownedGroups = await Group.find({ owner: email });
  for (const group of ownedGroups) {
    if (!group.players || group.players.length === 0) {
      await Group.deleteOne({ _id: group._id });
      continue;
    }
    // Promote the highest-scoring remaining member, alphabetical tiebreak.
    // Keeps the leadership decision deterministic and predictable.
    const candidates = await Player.find({ _id: { $in: group.players } })
      .select('email name points')
      .sort({ points: -1, name: 1 });
    const heir = candidates[0];
    if (!heir) {
      await Group.deleteOne({ _id: group._id });
      continue;
    }
    group.owner = heir.email;
    await group.save();
  }

  await Player.deleteOne({ _id: playerId });
}

// DELETE /api/account — wipes the authenticated user's account. Identity comes
// from the JWT, never from the URL.
exports.deleteAccount = async (req, res) => {
  try {
    const player = await Player.findById(req.user.id).select('_id email');
    if (!player) return res.status(404).json({ error: 'Account not found' });

    await cascadeDeleteAccount({ playerId: player._id, email: player.email });
    res.json({ message: 'Account deleted' });
  } catch (err) {
    console.error('❌ deleteAccount error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

// DELETE /api/players/:id — legacy route kept so the deployed web client
// doesn't 404. Validates caller identity and forwards to the same cascade.
exports.deletePlayer = async (req, res) => {
  try {
    if (String(req.params.id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'You can only delete your own account' });
    }
    const player = await Player.findById(req.user.id).select('_id email');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    await cascadeDeleteAccount({ playerId: player._id, email: player.email });
    res.json({ message: 'Player deleted' });
  } catch (err) {
    console.error('❌ deletePlayer error:', err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
};

exports.incrementPlayerScore = incrementPlayerScore;
