import { api } from './client';

export interface PlayerSession {
  id: string;
  email: string;
  name: string;
  token: string;
  points?: number;
}

interface ApiPlayer {
  id: string;
  email: string;
  name: string;
  points?: number;
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

interface RequestCodeResponse {
  message: string;
  ttlSeconds: number;
}

function toSession(p: ApiPlayer, token: string): PlayerSession {
  return { id: String(p.id), email: p.email, name: p.name, token, points: p.points };
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

// Wipes the caller's account + all owned data. Identity comes from the JWT
// stored on the api client — no need to pass an id.
export async function deleteAccount(): Promise<void> {
  await api.delete('/api/account');
}
