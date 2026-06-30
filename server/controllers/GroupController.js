const Group = require('../models/Group');
const Player = require('../models/Player');
const { generateUniqueJoinCode } = require('../utils/joinCode');
const { getGamemodePointsByEmail } = require('../utils/scoreAggregation');

function isMember(group, playerId) {
  return group.players.some((id) => String(id) === String(playerId));
}

// GET groups for the requested email. Authenticated users can only request
// their own groups — refusing arbitrary lookups closes both the IDOR and the
// joinCode-disclosure-by-email-enumeration paths.
exports.getGroupsByPlayerEmail = async (req, res) => {
  try {
    const requested = String(req.params.email || '').toLowerCase();
    if (requested !== req.user.email) {
      return res.status(403).json({ error: 'You can only list your own groups' });
    }

    const player = await Player.findOne({ email: requested })
      .populate('groups', 'groupName tournament gamemode owner joinCode');

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(player.groups || []);
  } catch (err) {
    console.error('❌ Error fetching player groups:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET single group. Only members see the joinCode; non-members get a
// metadata-only view (still useful for "preview a group before joining"
// flows). No side-effecting backfill — codes are generated at create time.
// Points are aggregated per group/gamemode, not global.
exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await Group.findById(id).populate('players', 'name email _id');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const member = group.players.some((p) => p.email === req.user.email);
    const gamemode = String(group.gamemode);
    const pointsByEmail = await getGamemodePointsByEmail({
      gamemode,
      emails: group.players.map((p) => p.email),
    });

    const membersWithPoints = group.players.map((p) => ({
      _id: p._id,
      name: p.name,
      email: p.email,
      points: pointsByEmail.get(p.email) || 0,
    }));

    res.json({
      id: group._id,
      groupName: group.groupName,
      tournament: group.tournament,
      owner: group.owner,
      gamemode: group.gamemode,
      joinCode: member ? group.joinCode : undefined,
      members: member ? membersWithPoints : membersWithPoints.map((p) => ({ _id: p._id, name: p.name, points: p.points })),
    });
  } catch (err) {
    console.error('❌ Error fetching group by ID:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST create group — actor identity comes from the JWT.
exports.createGroup = async (req, res) => {
  try {
    const { groupName, tournament, gamemode } = req.body;

    if (!groupName || !tournament) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cleanEmail = req.user.email;
    const trimmedName = groupName.trim();

    const existing = await Group.findOne({ groupName: trimmedName });
    if (existing) {
      return res.status(409).json({ error: 'Group name already taken' });
    }

    const player = await Player.findOne({ email: cleanEmail });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const joinCode = await generateUniqueJoinCode(Group);

    const newGroup = new Group({
      groupName: trimmedName,
      tournament,
      gamemode,
      owner: cleanEmail,
      joinCode,
      players: [player._id],
    });
    await newGroup.save();

    player.groups.push(newGroup._id);
    await player.save();

    res.status(201).json({
      message: 'Group registered',
      group: serializeGroup(newGroup),
    });
  } catch (err) {
    console.error('❌ Error creating group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST join group by code — caller joins themselves.
exports.joinGroupByCode = async (req, res) => {
  try {
    const { joinCode } = req.body;
    if (!joinCode) {
      return res.status(400).json({ error: 'joinCode required' });
    }

    const code = String(joinCode).trim().toUpperCase();
    const player = await Player.findOne({ email: req.user.email });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const group = await Group.findOne({ joinCode: code });
    if (!group) return res.status(404).json({ error: 'Invalid join code' });

    if (isMember(group, player._id)) {
      return res.status(200).json({ message: 'Already a member', group: serializeGroup(group) });
    }

    group.players.push(player._id);
    await group.save();

    player.groups.push(group._id);
    await player.save();

    res.status(200).json({ message: 'Joined group', group: serializeGroup(group) });
  } catch (err) {
    console.error('❌ Error joining group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST add player to group — owner only.
exports.addPlayerToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: 'Only the owner can add players' });
    }

    const player = await Player.findOne({ email: String(email).toLowerCase() });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    if (!player.groups.includes(group._id)) {
      player.groups.push(group._id);
      await player.save();
    }
    if (!isMember(group, player._id)) {
      group.players.push(player._id);
      await group.save();
    }

    res.json({ message: `Player ${player.email} added to group ${group.groupName}` });
  } catch (err) {
    console.error('❌ Error adding player to group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST remove a player — either the owner removing someone, or a member
// removing themselves.
exports.removePlayerFromGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    const targetEmail = String(email || req.user.email).toLowerCase();

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isOwner = group.owner.toLowerCase() === req.user.email;
    const isSelf = targetEmail === req.user.email;
    if (!isOwner && !isSelf) {
      return res.status(403).json({ error: 'Only the owner can remove other players' });
    }

    const player = await Player.findOne({ email: targetEmail });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    await Player.updateOne({ _id: player._id }, { $pull: { groups: group._id } });
    await Group.updateOne({ _id: group._id }, { $pull: { players: player._id } });

    res.json({ message: `Player ${player.email} removed from group ${group.groupName}` });
  } catch (err) {
    console.error('❌ Error removing player from group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH group (owner: rename)
exports.renameGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName } = req.body;

    if (!groupName) return res.status(400).json({ error: 'groupName required' });
    const trimmed = String(groupName).trim();
    if (!trimmed) return res.status(400).json({ error: 'Group name cannot be empty' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: 'Only the owner can rename this group' });
    }

    const conflict = await Group.findOne({ groupName: trimmed, _id: { $ne: groupId } });
    if (conflict) return res.status(409).json({ error: 'Group name already taken' });

    group.groupName = trimmed;
    await group.save();
    res.json({ message: 'Group renamed', group: serializeGroup(group) });
  } catch (err) {
    console.error('❌ Error renaming group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE group (owner only)
exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: 'Only the owner can delete this group' });
    }

    await Player.updateMany({ groups: groupId }, { $pull: { groups: groupId } });
    await Group.deleteOne({ _id: groupId });
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('❌ Error deleting group:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST transfer ownership to another member — owner only. The target must
// already be in the group. The caller loses owner privileges in the same
// request, so the UI should refetch and the previous owner falls back to
// regular-member powers (they can still leave on their own).
exports.transferOwnership = async (req, res) => {
  try {
    const { groupId } = req.params;
    const targetEmail = String(req.body?.email || '').toLowerCase();
    if (!targetEmail) return res.status(400).json({ error: 'Target email required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: 'Only the owner can transfer ownership' });
    }
    if (targetEmail === group.owner.toLowerCase()) {
      return res.status(400).json({ error: 'You are already the owner' });
    }

    const target = await Player.findOne({ email: targetEmail });
    if (!target) return res.status(404).json({ error: 'Player not found' });
    if (!isMember(group, target._id)) {
      return res.status(400).json({ error: 'That player is not in this group' });
    }

    group.owner = target.email;
    await group.save();

    res.json({ message: 'Ownership transferred', group: serializeGroup(group) });
  } catch (err) {
    console.error('❌ Error transferring ownership:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST reset all member scores — owner only.
exports.resetPlayerScores = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.owner.toLowerCase() !== req.user.email) {
      return res.status(403).json({ error: 'Only the owner can reset scores' });
    }

    await Player.updateMany({ groups: groupId }, { $set: { points: 0 } });
    res.json({ message: 'Player scores reset to 0' });
  } catch (err) {
    console.error('❌ Error resetting player scores:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Matches the mobile `GroupSummary` shape used by listMine — `_id`, not `id`.
// getGroupById has its own serializer that returns `id` for `GroupDetail`;
// don't conflate the two.
function serializeGroup(group) {
  return {
    _id: group._id,
    groupName: group.groupName,
    tournament: group.tournament,
    gamemode: group.gamemode,
    owner: group.owner,
    joinCode: group.joinCode,
  };
}
