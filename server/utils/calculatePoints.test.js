const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  matchPointLogic,
  tablePointLogic,
  firstScorerPointLogic,
  goldenBootPointLogic,
  topThreePointLogic,
} = require('./calculatePoints');
const P = require('./pointsConfig');

describe('matchPointLogic — per-match score prediction (PL, WC, CL)', () => {
  test('exact score wins exactScore points', () => {
    assert.equal(matchPointLogic(2, 1, 2, 1), P.match.exactScore);
    assert.equal(matchPointLogic(0, 0, 0, 0), P.match.exactScore);
    assert.equal(matchPointLogic(4, 4, 4, 4), P.match.exactScore);
  });

  test('correct outcome (home win) without exact score', () => {
    assert.equal(matchPointLogic(3, 0, 2, 1), P.match.correctOutcome);
  });

  test('correct outcome (away win) without exact score', () => {
    assert.equal(matchPointLogic(0, 2, 1, 3), P.match.correctOutcome);
  });

  test('correct outcome (draw) without exact score', () => {
    assert.equal(matchPointLogic(1, 1, 2, 2), P.match.correctOutcome);
  });

  test('wrong outcome but correct goal difference', () => {
    // Predicted home -1, actual home -1, but outcomes flipped (home vs away win).
    assert.equal(matchPointLogic(0, 1, 1, 2), P.match.correctOutcome);
    // True "GD only" case: predicted home-by-1 win, actual away-by-1 win.
    // Outcomes differ AND |diff| matches → falls to oneTeamScoreCorrect or miss?
    // 2-1 predicted vs 1-2 actual: predicted H, actual A (wrong outcome);
    // GD = +1 vs -1 (not equal); home-score 2 vs 1 (no match); away 1 vs 2 (no match) → miss.
    assert.equal(matchPointLogic(2, 1, 1, 2), P.match.miss);
  });

  test('one team score correct (predicted home score matches)', () => {
    // 2-0 predicted, 2-3 actual: home score equal, outcomes differ, GDs differ.
    assert.equal(matchPointLogic(2, 0, 2, 3), P.match.oneTeamScoreCorrect);
  });

  test('one team score correct (predicted away score matches)', () => {
    // 0-1 predicted, 3-1 actual: away score equal, outcomes differ, GDs differ.
    assert.equal(matchPointLogic(0, 1, 3, 1), P.match.oneTeamScoreCorrect);
  });

  test('miss — wrong outcome, wrong GD, no shared score', () => {
    assert.equal(matchPointLogic(0, 3, 4, 1), P.match.miss);
  });

  test('null prediction (user did not submit) → miss', () => {
    assert.equal(matchPointLogic(null, null, 2, 1), P.match.miss);
    assert.equal(matchPointLogic(2, null, 2, 1), P.match.miss);
    assert.equal(matchPointLogic(null, 1, 2, 1), P.match.miss);
  });

  test('undefined prediction → miss', () => {
    assert.equal(matchPointLogic(undefined, undefined, 2, 1), P.match.miss);
  });

  test('actual score missing (match unresolved) → miss', () => {
    assert.equal(matchPointLogic(2, 1, null, null), P.match.miss);
    assert.equal(matchPointLogic(2, 1, undefined, undefined), P.match.miss);
  });

  test('0 is a valid prediction — not treated as falsy/missing', () => {
    // Regression: an earlier signature could treat 0 as "no prediction".
    assert.equal(matchPointLogic(0, 0, 0, 0), P.match.exactScore);
    assert.equal(matchPointLogic(0, 1, 0, 1), P.match.exactScore);
  });

  test('exact score takes precedence over outcome/GD/one-team rules', () => {
    // Exact match for a 1-1 also satisfies "correct outcome" and "GD" — must return exactScore.
    assert.equal(matchPointLogic(1, 1, 1, 1), P.match.exactScore);
    assert.notEqual(P.match.exactScore, P.match.correctOutcome); // sanity for the assertion above
  });
});

describe('firstScorerPointLogic — first goal scorer bonus (all gamemodes)', () => {
  test('exact match awards firstGoalScorer.exact', () => {
    assert.equal(firstScorerPointLogic(123, 123), P.firstGoalScorer.exact);
  });

  test('wrong player → miss', () => {
    assert.equal(firstScorerPointLogic(123, 456), P.firstGoalScorer.miss);
  });

  test('no prediction → miss (not penalised)', () => {
    assert.equal(firstScorerPointLogic(null, 456), P.firstGoalScorer.miss);
    assert.equal(firstScorerPointLogic(undefined, 456), P.firstGoalScorer.miss);
  });

  test('no actual scorer (e.g. 0-0 match) → miss even if user predicted', () => {
    assert.equal(firstScorerPointLogic(123, null), P.firstGoalScorer.miss);
    assert.equal(firstScorerPointLogic(123, undefined), P.firstGoalScorer.miss);
  });

  test('both missing → miss', () => {
    assert.equal(firstScorerPointLogic(null, null), P.firstGoalScorer.miss);
  });

  test('strict equality — string "123" does not match number 123', () => {
    // The cron stores numeric ids; a string here would indicate a bug upstream.
    assert.equal(firstScorerPointLogic('123', 123), P.firstGoalScorer.miss);
  });
});

describe('tablePointLogic — group-standing position (WC group stage)', () => {
  test('exact position', () => {
    assert.equal(tablePointLogic(1, 1), P.groupStanding.exactPosition);
    assert.equal(tablePointLogic(4, 4), P.groupStanding.exactPosition);
  });

  test('off by one', () => {
    assert.equal(tablePointLogic(1, 2), P.groupStanding.offByOne);
    assert.equal(tablePointLogic(3, 2), P.groupStanding.offByOne);
  });

  test('off by two', () => {
    assert.equal(tablePointLogic(1, 3), P.groupStanding.offByTwo);
    assert.equal(tablePointLogic(4, 2), P.groupStanding.offByTwo);
  });

  test('off by three or more', () => {
    assert.equal(tablePointLogic(1, 4), P.groupStanding.offByThreeOrMore);
    assert.equal(tablePointLogic(8, 1), P.groupStanding.offByThreeOrMore);
  });

  test('symmetric — direction of error does not matter', () => {
    assert.equal(tablePointLogic(2, 3), tablePointLogic(3, 2));
    assert.equal(tablePointLogic(1, 4), tablePointLogic(4, 1));
  });
});

describe('goldenBootPointLogic — tournament top scorer (WC, CL)', () => {
  test('correct player → goldenBoot.exact', () => {
    assert.equal(goldenBootPointLogic(99, 99), P.goldenBoot.exact);
  });

  test('wrong player → miss', () => {
    assert.equal(goldenBootPointLogic(99, 42), P.goldenBoot.miss);
  });

  test('no prediction → miss', () => {
    assert.equal(goldenBootPointLogic(null, 42), P.goldenBoot.miss);
    assert.equal(goldenBootPointLogic(undefined, 42), P.goldenBoot.miss);
  });

  test('unresolved actual → miss', () => {
    assert.equal(goldenBootPointLogic(99, null), P.goldenBoot.miss);
  });
});

describe('topThreePointLogic — tournament top-3 podium (WC, CL)', () => {
  test('all three exact', () => {
    const expected =
      P.topThree.champion + P.topThree.finalist + P.topThree.third;
    assert.equal(topThreePointLogic([10, 20, 30], [10, 20, 30]), expected);
  });

  test('only champion correct', () => {
    // Predicted: 10 champ, 99 finalist, 88 third. Actual: 10/20/30.
    // 99 and 88 are not in actual top 3, so no bonuses.
    assert.equal(topThreePointLogic([10, 99, 88], [10, 20, 30]), P.topThree.champion);
  });

  test('only finalist correct', () => {
    assert.equal(topThreePointLogic([99, 20, 88], [10, 20, 30]), P.topThree.finalist);
  });

  test('only third correct', () => {
    assert.equal(topThreePointLogic([99, 88, 30], [10, 20, 30]), P.topThree.third);
  });

  test('team in top-3 but wrong slot — bonus per pick, not double-counted with exact', () => {
    // Predicted [20, 10, 30]: 20 is actual 2nd → in top 3 but at wrong slot (bonus);
    //                         10 is actual 1st → in top 3 but at wrong slot (bonus);
    //                         30 is actual 3rd → exact match (third reward).
    const expected =
      P.topThree.teamInTopThreeBonus * 2 + P.topThree.third;
    assert.equal(topThreePointLogic([20, 10, 30], [10, 20, 30]), expected);
  });

  test('exact champion never also pays the wrong-slot bonus', () => {
    // Predicted [10, 20, 30] vs [10, 20, 30]: champion is exact, must not also be counted
    // toward teamInTopThreeBonus. Confirms the else-if branch.
    const exactAll =
      P.topThree.champion + P.topThree.finalist + P.topThree.third;
    assert.equal(topThreePointLogic([10, 20, 30], [10, 20, 30]), exactAll);
  });

  test('null slots in prediction are skipped (no negative score)', () => {
    // User only picked a champion.
    assert.equal(topThreePointLogic([10, null, null], [10, 20, 30]), P.topThree.champion);
  });

  test('all three wrong, none in actual top-3 → 0', () => {
    assert.equal(topThreePointLogic([1, 2, 3], [10, 20, 30]), 0);
  });

  test('non-array input → 0 (defensive)', () => {
    assert.equal(topThreePointLogic(null, [10, 20, 30]), 0);
    assert.equal(topThreePointLogic([10, 20, 30], null), 0);
    assert.equal(topThreePointLogic('not-an-array', [10, 20, 30]), 0);
  });

  test('actual top-3 has fewer than 3 entries → 0 (tournament not resolved)', () => {
    assert.equal(topThreePointLogic([10, 20, 30], [10, 20]), 0);
    assert.equal(topThreePointLogic([10, 20, 30], []), 0);
  });
});

// Combine the primitives into the per-gamemode scoring that the cron jobs
// actually execute. Each scenario mirrors a realistic round of play to catch
// regressions where one rule starts double-counting or stops contributing.
describe('Gamemode scenarios — combined scoring per gamemode', () => {
  describe('Premier League — match + (optional) scorer per match, no tournament-wide payout', () => {
    test('exact score with correct scorer pick', () => {
      const matchPts = matchPointLogic(2, 1, 2, 1);
      const scorerPts = firstScorerPointLogic(123, 123);
      assert.equal(matchPts + scorerPts, P.match.exactScore + P.firstGoalScorer.exact);
    });

    test('correct outcome, no scorer prediction', () => {
      const matchPts = matchPointLogic(3, 0, 2, 1);
      const scorerPts = firstScorerPointLogic(null, 456);
      assert.equal(matchPts + scorerPts, P.match.correctOutcome);
    });

    test('miss everything', () => {
      const matchPts = matchPointLogic(0, 3, 4, 0);
      const scorerPts = firstScorerPointLogic(111, 222);
      assert.equal(matchPts + scorerPts, 0);
    });
  });

  describe('World Cup — match + scorer per match, group-standing per slot, tournament golden boot + top-3', () => {
    test('group-stage round: one match scored + one group standing slot resolved', () => {
      const matchPts = matchPointLogic(1, 1, 1, 1); // exact draw
      const scorerPts = firstScorerPointLogic(7, 7); // correct first scorer
      const standingPts = tablePointLogic(2, 1); // off by one
      const expected = P.match.exactScore + P.firstGoalScorer.exact + P.groupStanding.offByOne;
      assert.equal(matchPts + scorerPts + standingPts, expected);
    });

    test('tournament finale: golden boot wrong, top-3 partial', () => {
      const gbPts = goldenBootPointLogic(11, 22); // wrong
      const t3Pts = topThreePointLogic([10, 20, 99], [10, 20, 30]); // 1st + 2nd exact, 3rd missed
      assert.equal(gbPts + t3Pts, P.topThree.champion + P.topThree.finalist);
    });

    test('end-to-end perfect tournament resolution', () => {
      const gbPts = goldenBootPointLogic(99, 99);
      const t3Pts = topThreePointLogic([10, 20, 30], [10, 20, 30]);
      const expected =
        P.goldenBoot.exact +
        P.topThree.champion +
        P.topThree.finalist +
        P.topThree.third;
      assert.equal(gbPts + t3Pts, expected);
    });
  });

  describe('Champions League — knockout: match + scorer per match, tournament golden boot + top-3 (no group standings)', () => {
    test('knockout match: correct outcome only, no scorer prediction', () => {
      const matchPts = matchPointLogic(2, 1, 3, 0);
      const scorerPts = firstScorerPointLogic(null, 9);
      assert.equal(matchPts + scorerPts, P.match.correctOutcome);
    });

    test('tournament resolution: champion correct, finalist in top-3 but wrong slot, golden boot correct', () => {
      const gbPts = goldenBootPointLogic(42, 42);
      // Predicted finalist (20) actually finished 3rd → wrong-slot bonus.
      // Predicted third (30) actually finished 2nd → wrong-slot bonus.
      const t3Pts = topThreePointLogic([10, 20, 30], [10, 30, 20]);
      const expected =
        P.goldenBoot.exact +
        P.topThree.champion +
        P.topThree.teamInTopThreeBonus * 2;
      assert.equal(gbPts + t3Pts, expected);
    });
  });
});
