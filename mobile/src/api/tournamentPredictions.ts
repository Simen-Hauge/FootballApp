import { api } from './client';

export interface GoldenBootPick {
  playerId: number | null;
  playerName: string | null;
  teamId: number | null;
}

export interface TopThreePick {
  rank: 1 | 2 | 3;
  teamId: number | null;
  teamName: string | null;
}

export interface TournamentPrediction {
  _id?: string;
  email: string;
  competition: string;
  season: string;
  goldenBoot: GoldenBootPick;
  topThree: TopThreePick[];
  pointsAwarded?: {
    goldenBoot: number | null;
    topThree: number | null;
  };
  updatedAt?: string;
}

export interface TournamentPredictionResponse {
  prediction: TournamentPrediction | null;
  locked: boolean;
}

export interface TournamentResult {
  competition: string;
  season: string;
  goldenBoot: { playerId: number | null; playerName: string | null; goals: number | null };
  topThreeTeamIds: number[];
  topThreeTeamNames: string[];
  source: 'auto' | 'manual';
  finalizedAt: string | null;
  resolvedAt: string | null;
}

export const tournamentPredictionsApi = {
  get: (competition = 'WC', season?: string) =>
    api.get<TournamentPredictionResponse>('/api/wc/tournament-predictions', {
      competition,
      ...(season ? { season } : {}),
    }),

  save: (params: {
    competition?: string;
    season?: string;
    goldenBoot?: GoldenBootPick | null;
    topThree?: TopThreePick[];
  }) =>
    api.put<{ message: string; prediction: TournamentPrediction }>(
      '/api/wc/tournament-predictions',
      params,
    ),

  getResult: (competition = 'WC', season?: string) =>
    api.get<TournamentResult | null>('/api/wc/tournament-results', {
      competition,
      ...(season ? { season } : {}),
    }),
};
