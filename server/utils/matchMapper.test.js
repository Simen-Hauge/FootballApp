const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { deriveStoredScore, mapApiMatchToDoc } = require('./matchMapper');

describe('deriveStoredScore', () => {
  test('prefers regular time over full time for knockout matches', () => {
    assert.deepEqual(
      deriveStoredScore({
        regularTime: { home: 1, away: 1 },
        fullTime: { home: 2, away: 1 },
        extraTime: { home: 2, away: 1 },
        penalties: { home: 4, away: 3 },
      }),
      { home: 1, away: 1 },
    );
  });

  test('falls back to full time when regular time is unavailable', () => {
    assert.deepEqual(
      deriveStoredScore({
        fullTime: { home: 3, away: 2 },
      }),
      { home: 3, away: 2 },
    );
  });

  test('falls back to half time when later scores are missing', () => {
    assert.deepEqual(
      deriveStoredScore({
        halfTime: { home: 1, away: 0 },
      }),
      { home: 1, away: 0 },
    );
  });
});

describe('mapApiMatchToDoc', () => {
  test('stores knockout results using the 90-minute score', () => {
    const doc = mapApiMatchToDoc({
      id: 42,
      utcDate: '2026-06-30T18:00:00.000Z',
      status: 'FINISHED',
      stage: 'LAST_16',
      homeTeam: { id: 1, shortName: 'NOR' },
      awayTeam: { id: 2, shortName: 'SWE' },
      score: {
        regularTime: { home: 1, away: 1 },
        fullTime: { home: 2, away: 1 },
        extraTime: { home: 2, away: 1 },
        penalties: { home: 4, away: 3 },
      },
    }, 'WC');

    assert.deepEqual(doc.score, { home: 1, away: 1 });
    assert.equal(doc.status, 'finished');
  });
});