import { DEFAULT_POINTS_CONFIG } from '@/api/pointsConfig';
import type { ApiStandingGroup, ApiTeam } from '@/api/wc';

export interface GroupStandingBreakdownRow {
  teamId: number;
  team: ApiTeam;
  predictedPosition: number;
  actualPosition: number | null;
  points: number;
}

export function groupStandingSlotPoints(predictedPosition: number, actualPosition: number | null): number {
  if (actualPosition == null) return 0;
  const difference = Math.abs(predictedPosition - actualPosition);
  if (difference === 0) return DEFAULT_POINTS_CONFIG.groupStanding.exactPosition;
  if (difference === 1) return DEFAULT_POINTS_CONFIG.groupStanding.offByOne;
  if (difference === 2) return DEFAULT_POINTS_CONFIG.groupStanding.offByTwo;
  return DEFAULT_POINTS_CONFIG.groupStanding.offByThreeOrMore;
}

export function calculateGroupStandingBreakdown(
  predictedTeamIds: number[],
  group: ApiStandingGroup,
): GroupStandingBreakdownRow[] {
  const actualPositions = new Map(group.table.map((row, index) => [row.team.id, index + 1] as const));
  const teamsById = new Map(group.table.map((row) => [row.team.id, row.team] as const));

  return predictedTeamIds
    .map((teamId, index) => {
      const team = teamsById.get(teamId);
      if (!team) return null;
      const actualPosition = actualPositions.get(teamId) ?? null;
      return {
        teamId,
        team,
        predictedPosition: index + 1,
        actualPosition,
        points: groupStandingSlotPoints(index + 1, actualPosition),
      };
    })
    .filter(Boolean) as GroupStandingBreakdownRow[];
}

export function sumGroupStandingBreakdown(rows: GroupStandingBreakdownRow[]): number {
  return rows.reduce((total, row) => total + row.points, 0);
}