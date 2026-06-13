import { api } from './client';

export interface PointsConfig {
  match: {
    exactScore: number;
    correctOutcome: number;
    correctGoalDifference: number;
    oneTeamScoreCorrect: number;
    miss: number;
  };
  firstGoalScorer: { exact: number; miss: number };
  groupStanding: {
    exactPosition: number;
    offByOne: number;
    offByTwo: number;
    offByThreeOrMore: number;
  };
  goldenBoot: { exact: number; miss: number };
  topThree: {
    champion: number;
    finalist: number;
    third: number;
    teamInTopThreeBonus: number;
  };
}

// Fallback baked into the bundle so the popup still renders if the network
// call fails — kept in sync with server/utils/pointsConfig.js manually.
export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  match: { exactScore: 5, correctOutcome: 2, correctGoalDifference: 1, oneTeamScoreCorrect: 1, miss: 0 },
  firstGoalScorer: { exact: 5, miss: 0 },
  groupStanding: { exactPosition: 3, offByOne: 2, offByTwo: 1, offByThreeOrMore: 0 },
  goldenBoot: { exact: 15, miss: 0 },
  topThree: { champion: 10, finalist: 6, third: 4, teamInTopThreeBonus: 2 },
};

let cached: PointsConfig | null = null;
let inflight: Promise<PointsConfig> | null = null;

export async function getPointsConfig(): Promise<PointsConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = api
    .get<PointsConfig>('/api/points-config')
    .then((cfg) => {
      cached = cfg;
      return cfg;
    })
    .catch(() => DEFAULT_POINTS_CONFIG)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
