const { tablePointLogic } = require('./calculatePoints');

function normalizeGroupCode(groupCode) {
  const raw = String(groupCode || '').trim();
  if (!raw) return null;

  const letter = raw
    .replace(/^GROUP_/i, '')
    .replace(/^Group\s+/i, '')
    .trim();

  if (!letter) return null;
  return `GROUP_${letter.toUpperCase()}`;
}

function extractGroupStandings(standings) {
  const groups = new Map();

  for (const entry of Array.isArray(standings) ? standings : []) {
    if (entry?.type !== 'TOTAL' || !entry?.group || !Array.isArray(entry.table)) continue;

    const groupCode = normalizeGroupCode(entry.group);
    if (!groupCode) continue;

    const rankedTeamIds = entry.table
      .slice()
      .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
      .map((row) => Number(row?.team?.id))
      .filter((id) => Number.isFinite(id));

    if (rankedTeamIds.length === 0) continue;
    groups.set(groupCode, rankedTeamIds);
  }

  return groups;
}

function calculateGroupStandingPoints(predictedTeamIds, actualTeamIds) {
  if (!Array.isArray(predictedTeamIds) || !Array.isArray(actualTeamIds)) return 0;

  const actualPositions = new Map();
  actualTeamIds.forEach((teamId, index) => {
    const normalized = Number(teamId);
    if (Number.isFinite(normalized)) {
      actualPositions.set(normalized, index + 1);
    }
  });

  let total = 0;
  predictedTeamIds.forEach((teamId, index) => {
    const normalized = Number(teamId);
    const actualIndex = actualPositions.get(normalized);
    if (!Number.isFinite(normalized) || actualIndex == null) return;
    total += tablePointLogic(index + 1, actualIndex);
  });

  return total;
}

module.exports = {
  normalizeGroupCode,
  extractGroupStandings,
  calculateGroupStandingPoints,
};