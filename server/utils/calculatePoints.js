function tablePointLogic (predictedIndex, trueIndex) {
    
    const difference = Math.abs(predictedIndex - trueIndex)

    if (difference === 0) return 3;
    else if (difference === 1) return 2;
    else if (difference === 2) return 1;
    else return 0;
}


function matchPointLogic(predictedHomeScore, predictedAwayScore, actualHomeScore, actualAwayScore) {
  // ✅ Guard against null/undefined (not falsy 0)
  if (
    predictedHomeScore === null || predictedHomeScore === undefined ||
    predictedAwayScore === null || predictedAwayScore === undefined ||
    actualHomeScore === null || actualHomeScore === undefined ||
    actualAwayScore === null || actualAwayScore === undefined
  ) {
    return 0;
  }

  const predictedOutcome = predictedHomeScore > predictedAwayScore ? 'H'
                          : predictedHomeScore < predictedAwayScore ? 'A'
                          : 'D';
  const actualOutcome = actualHomeScore > actualAwayScore ? 'H'
                       : actualHomeScore < actualAwayScore ? 'A'
                       : 'D';

  if (predictedHomeScore === actualHomeScore && predictedAwayScore === actualAwayScore) return 3;

  if (predictedOutcome === actualOutcome) return 2;

  if ((predictedHomeScore - predictedAwayScore) === (actualHomeScore - actualAwayScore)) return 1;

  if (predictedHomeScore === actualHomeScore || predictedAwayScore === actualAwayScore) return 1;

  return 0;
}

// 5 points if the predicted first goal scorer matches the actual first scorer.
// playerId is the football-data.org player id (numeric). Returns 0 when either
// side is missing — that way matches without a scorer prediction or unresolved
// goal data simply contribute nothing.
function firstScorerPointLogic(predictedScorerId, actualScorerId) {
  if (predictedScorerId === null || predictedScorerId === undefined) return 0;
  if (actualScorerId === null || actualScorerId === undefined) return 0;
  return predictedScorerId === actualScorerId ? 5 : 0;
}

exports.matchPointLogic = matchPointLogic;
exports.tablePointLogic = tablePointLogic;
exports.firstScorerPointLogic = firstScorerPointLogic;