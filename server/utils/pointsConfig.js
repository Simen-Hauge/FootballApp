// Single source of truth for every point value in the app. Mirrored to the
// mobile client via GET /api/points-config so the "How points work" popup
// stays in sync with the scoring logic automatically.

const POINTS_CONFIG = {
  match: {
    exactScore: 5,
    correctOutcome: 2,
    correctGoalDifference: 1,
    oneTeamScoreCorrect: 1,
    miss: 0,
  },
  firstGoalScorer: {
    exact: 5,
    miss: 0,
  },
  groupStanding: {
    exactPosition: 3,
    offByOne: 2,
    offByTwo: 1,
    offByThreeOrMore: 0,
  },
  goldenBoot: {
    exact: 15,
    miss: 0,
  },
  topThree: {
    champion: 10,        // 1st place correct
    finalist: 6,         // 2nd place correct
    third: 4,            // 3rd place correct
    teamInTopThreeBonus: 2, // any of user's three teams ends up in actual top 3 but in wrong slot
  },
};

module.exports = POINTS_CONFIG;
