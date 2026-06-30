const Prediction = require('../models/Prediction');
const GroupStandingPrediction = require('../models/GroupStandingPrediction');
const TournamentPrediction = require('../models/TournamentPrediction');

const TOURNAMENT_COMPETITION_BY_GAMEMODE = {
  '3': 'WC',
  '4': 'CL',
};

function mergeRowsIntoMap(rows, pointsByEmail) {
  for (const row of rows) {
    const email = String(row?._id || '').toLowerCase();
    if (!email) continue;
    const points = Number(row?.points ?? 0);
    if (!Number.isFinite(points)) continue;
    pointsByEmail.set(email, (pointsByEmail.get(email) || 0) + points);
  }
}

function buildEmailMatch(emails) {
  if (!Array.isArray(emails) || emails.length === 0) return {};
  return {
    email: {
      $in: emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean),
    },
  };
}

async function getGamemodePointsByEmail({ gamemode, emails } = {}) {
  const normalizedGamemode = String(gamemode || '').trim();
  if (!normalizedGamemode) return new Map();

  const emailMatch = buildEmailMatch(emails);
  const pointsByEmail = new Map();

  const [matchRows, wcGroupRows, tournamentRows] = await Promise.all([
    Prediction.aggregate([
      { $match: { ...emailMatch, gamemode: normalizedGamemode, pointsAwarded: { $ne: null } } },
      { $group: { _id: '$email', points: { $sum: '$pointsAwarded' } } },
    ]),
    normalizedGamemode === '3'
      ? GroupStandingPrediction.aggregate([
          { $match: { ...emailMatch, competition: 'WC', pointsAwarded: { $ne: null } } },
          { $group: { _id: '$email', points: { $sum: '$pointsAwarded' } } },
        ])
      : Promise.resolve([]),
    TOURNAMENT_COMPETITION_BY_GAMEMODE[normalizedGamemode]
      ? TournamentPrediction.aggregate([
          { $match: { ...emailMatch, competition: TOURNAMENT_COMPETITION_BY_GAMEMODE[normalizedGamemode] } },
          {
            $project: {
              email: 1,
              total: {
                $add: [
                  { $ifNull: ['$pointsAwarded.goldenBoot', 0] },
                  { $ifNull: ['$pointsAwarded.topThree', 0] },
                ],
              },
            },
          },
          { $match: { total: { $gt: 0 } } },
          { $group: { _id: '$email', points: { $sum: '$total' } } },
        ])
      : Promise.resolve([]),
  ]);

  mergeRowsIntoMap(matchRows, pointsByEmail);
  mergeRowsIntoMap(wcGroupRows, pointsByEmail);
  mergeRowsIntoMap(tournamentRows, pointsByEmail);

  return pointsByEmail;
}

module.exports = { getGamemodePointsByEmail };