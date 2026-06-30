import { api } from './client';

export interface ApiTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}

export interface ApiStandingRow {
  position: number;
  team: ApiTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface ApiStandingGroup {
  stage: string;
  group: string | null;
  type: 'TOTAL' | 'HOME' | 'AWAY';
  table: ApiStandingRow[];
}

interface StandingsResponse {
  competition: string;
  season: unknown;
  standings: ApiStandingGroup[];
}

/**
 * Returns one entry per WC group (A–L), each with the 4 teams in their current
 * football-data.org standings order. Filters to `type === 'TOTAL'` so we don't
 * see home/away splits.
 */
export async function getWorldCupGroupStandings(): Promise<ApiStandingGroup[]> {
  const data = await api.get<StandingsResponse>('/api/standings/WC');
  return (data.standings || [])
    .filter((g) => g.type === 'TOTAL' && g.group)
    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
}

/** Convert "GROUP_A" or "Group A" → "A" for display. */
export function groupLetter(groupCode: string | null): string {
  if (!groupCode) return '';
  return groupCode.replace(/^GROUP_/i, '').replace(/^Group\s+/i, '').trim();
}

// ---- Teams (full list per competition) ----

export interface CompetitionTeam {
  competition: string;
  teamId: number;
  teamName: string;
  prevSeasonRank: number | null;
  logo?: string | null;
}

export async function getCompetitionTeams(competition = 'WC'): Promise<CompetitionTeam[]> {
  return api.get<CompetitionTeam[]>(`/api/teams/${competition}`);
}

// ---- Group-stage prediction persistence ----

export interface ServerGroupPrediction {
  _id: string;
  email: string;
  competition: string;
  groupCode: string;
  rankedTeamIds: number[];
  pointsAwarded?: number | null;
}

export interface GroupPredictionsResponse {
  predictions: ServerGroupPrediction[];
  locked: boolean;
}

function normalizeGroupPredictionsResponse(data: unknown): GroupPredictionsResponse {
  if (Array.isArray(data)) {
    return { predictions: data as ServerGroupPrediction[], locked: false }; // legacy server shape
  }

  if (data && typeof data === 'object') {
    const maybe = data as Partial<GroupPredictionsResponse>;
    return {
      predictions: Array.isArray(maybe.predictions) ? maybe.predictions : [],
      locked: Boolean(maybe.locked),
    };
  }

  return { predictions: [], locked: false };
}

export const wcGroupPredictionsApi = {
  list: async (email: string, competition = 'WC') =>
    normalizeGroupPredictionsResponse(
      await api.get<GroupPredictionsResponse | ServerGroupPrediction[]>('/api/wc/group-predictions', {
        email,
        competition,
      }),
    ),

  bulkSave: (email: string, predictions: Record<string, number[]>, competition = 'WC') =>
    api.put<{ message: string; count: number }>('/api/wc/group-predictions/bulk', {
      email,
      competition,
      predictions,
    }),
};
