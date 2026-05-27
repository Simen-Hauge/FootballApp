const P = require('./pointsConfig');

function tablePointLogic(predictedIndex, trueIndex) {
  const difference = Math.abs(predictedIndex - trueIndex);

  if (difference === 0) return P.groupStanding.exactPosition;
  if (difference === 1) return P.groupStanding.offByOne;
  if (difference === 2) return P.groupStanding.offByTwo;
  return P.groupStanding.offByThreeOrMore;
}

function matchPointLogic(predictedHomeScore, predictedAwayScore, actualHomeScore, actualAwayScore) {
  // Guard against null/undefined (not falsy 0)
  if (
    predictedHomeScore === null || predictedHomeScore === undefined ||
    predictedAwayScore === null || predictedAwayScore === undefined ||
    actualHomeScore === null || actualHomeScore === undefined ||
    actualAwayScore === null || actualAwayScore === undefined
  ) {
    return P.match.miss;
  }

  const predictedOutcome = predictedHomeScore > predictedAwayScore ? 'H'
                          : predictedHomeScore < predictedAwayScore ? 'A'
                          : 'D';
  const actualOutcome = actualHomeScore > actualAwayScore ? 'H'
                       : actualHomeScore < actualAwayScore ? 'A'
                       : 'D';

  if (predictedHomeScore === actualHomeScore && predictedAwayScore === actualAwayScore) {
    return P.match.exactScore;
  }
  if (predictedOutcome === actualOutcome) {
    return P.match.correctOutcome;
  }
  if ((predictedHomeScore - predictedAwayScore) === (actualHomeScore - actualAwayScore)) {
    return P.match.correctGoalDifference;
  }
  if (predictedHomeScore === actualHomeScore || predictedAwayScore === actualAwayScore) {
    return P.match.oneTeamScoreCorrect;
  }
  return P.match.miss;
}

// Awards firstGoalScorer.exact pts if the predicted first goal scorer matches
// the actual first scorer. playerId is the football-data.org player id
// (numeric). Returns 0 when either side is missing — that way matches without
// a scorer prediction or unresolved goal data simply contribute nothing.
function firstScorerPointLogic(predictedScorerId, actualScorerId) {
  if (predictedScorerId === null || predictedScorerId === undefined) return P.firstGoalScorer.miss;
  if (actualScorerId === null || actualScorerId === undefined) return P.firstGoalScorer.miss;
  return predictedScorerId === actualScorerId ? P.firstGoalScorer.exact : P.firstGoalScorer.miss;
}

// Awards goldenBoot.exact pts if the predicted player id matches the actual
// tournament top scorer. Both sides numeric (football-data.org player id).
function goldenBootPointLogic(predictedPlayerId, actualPlayerId) {
  if (predictedPlayerId === null || predictedPlayerId === undefined) return P.goldenBoot.miss;
  if (actualPlayerId === null || actualPlayerId === undefined) return P.goldenBoot.miss;
  return predictedPlayerId === actualPlayerId ? P.goldenBoot.exact : P.goldenBoot.miss;
}

// Awards exact-position points first (champion/finalist/third), then a
// "team-in-top-3 but wrong slot" bonus for each of the user's three picks
// that landed in the actual top 3 in a different position. Inputs are
// 3-element arrays of teamIds (or null entries if user didn't fill every slot).
function topThreePointLogic(predictedTopThree, actualTopThree) {
  if (!Array.isArray(predictedTopThree) || !Array.isArray(actualTopThree)) return 0;
  if (actualTopThree.length < 3) return 0;

  const exactRewards = [P.topThree.champion, P.topThree.finalist, P.topThree.third];
  let total = 0;
  const actualSet = new Set(actualTopThree.filter((id) => id !== null && id !== undefined));

  for (let i = 0; i < 3; i++) {
    const predicted = predictedTopThree[i];
    if (predicted === null || predicted === undefined) continue;
    if (predicted === actualTopThree[i]) {
      total += exactRewards[i];
    } else if (actualSet.has(predicted)) {
      total += P.topThree.teamInTopThreeBonus;
    }
  }
  return total;
}

exports.matchPointLogic = matchPointLogic;
exports.tablePointLogic = tablePointLogic;
exports.firstScorerPointLogic = firstScorerPointLogic;
exports.goldenBootPointLogic = goldenBootPointLogic;
exports.topThreePointLogic = topThreePointLogic;
