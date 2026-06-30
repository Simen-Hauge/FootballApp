const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const P = require('./pointsConfig');
const {
  normalizeGroupCode,
  extractGroupStandings,
  calculateGroupStandingPoints,
} = require('./groupStandingScoring');

describe('normalizeGroupCode', () => {
  test('normalizes football-data and legacy labels to a stable GROUP_* code', () => {
    assert.equal(normalizeGroupCode('GROUP_A'), 'GROUP_A');
    assert.equal(normalizeGroupCode('Group A'), 'GROUP_A');
    assert.equal(normalizeGroupCode(' a '), 'GROUP_A');
  });

  test('returns null for empty input', () => {
    assert.equal(normalizeGroupCode(null), null);
    assert.equal(normalizeGroupCode(''), null);
  });
});

describe('extractGroupStandings', () => {
  test('keeps TOTAL group tables and sorts them by table position', () => {
    const groups = extractGroupStandings([
      {
        type: 'TOTAL',
        group: 'Group A',
        table: [
          { position: 2, team: { id: 20 } },
          { position: 1, team: { id: 10 } },
          { position: 4, team: { id: 40 } },
          { position: 3, team: { id: 30 } },
        ],
      },
      {
        type: 'HOME',
        group: 'Group A',
        table: [{ position: 1, team: { id: 999 } }],
      },
    ]);

    assert.deepEqual(groups.get('GROUP_A'), [10, 20, 30, 40]);
    assert.equal(groups.size, 1);
  });
});

describe('calculateGroupStandingPoints', () => {
  test('adds per-slot points using the shared tablePointLogic rules', () => {
    const points = calculateGroupStandingPoints([10, 30, 20, 40], [10, 20, 30, 40]);
    const expected =
      P.groupStanding.exactPosition +
      P.groupStanding.offByOne +
      P.groupStanding.offByOne +
      P.groupStanding.exactPosition;

    assert.equal(points, expected);
  });

  test('ignores predicted teams that are not present in the final group table', () => {
    const points = calculateGroupStandingPoints([999, 20, 30, 40], [10, 20, 30, 40]);
    assert.equal(
      points,
      P.groupStanding.exactPosition +
        P.groupStanding.exactPosition +
        P.groupStanding.exactPosition,
    );
  });
});