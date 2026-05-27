import { api } from './client';
import type { Gamemode } from '@/gamemode/types';

export interface PlayerSession {
  id: string;
  email: string;
  name: string;
  token: string;
  points?: number;
  enabledGamemodes?: Gamemode[];
}

interface ApiPlayer {
  id: string;
  email: string;
  name: string;
  points?: number;
  enabledGamemodes?: Gamemode[];
}

interface AuthResponse {
  message: string;
  token: string;
  player: ApiPlayer;
}

interface ProfileResponse {
  message: string;
  player: ApiPlayer;
}

interface MeResponse {
  player: ApiPlayer;
}

interface RequestCodeResponse {
  message: string;
  ttlSeconds: number;
}

function toSession(p: ApiPlayer, token: string): PlayerSession {
  return {
    id: String(p.id),
    email: p.email,
    name: p.name,
    token,
    points: p.points,
    enabledGamemodes: p.enabledGamemodes,
  };
}

export type { RequestCodeResponse };

export async function requestSignInCode(email: string): Promise<RequestCodeResponse> {
  return api.post<RequestCodeResponse>('/api/auth/request-code', {
    email: email.trim().toLowerCase(),
  });
}

export async function verifySignInCode(email: string, code: string): Promise<PlayerSession> {
  const data = await api.post<AuthResponse>('/api/auth/verify-code', {
    email: email.trim().toLowerCase(),
    code: code.trim(),
  });
  return toSession(data.player, data.token);
}

export async function updateProfile(name: string): Promise<ApiPlayer> {
  const data = await api.put<ProfileResponse>('/api/players/profile', {
    name: name.trim(),
  });
  return data.player;
}

// Refreshes the caller's profile from the server. Used on app start so the
// per-user `enabledGamemodes` allowlist stays current without re-signing in.
export async function fetchMe(): Promise<ApiPlayer> {
  const data = await api.get<MeResponse>('/api/account/me');
  return data.player;
}

// Wipes the caller's account + all owned data. Identity comes from the JWT
// stored on the api client — no need to pass an id.
export async function deleteAccount(): Promise<void> {
  await api.delete('/api/account');
}
