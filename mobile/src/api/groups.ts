import { api } from './client';

export interface GroupSummary {
  _id: string;
  groupName: string;
  tournament: string;
  gamemode: number;
  owner: string;
  joinCode: string;
}

export interface GroupMember {
  _id: string;
  name: string;
  email: string;
  points: number;
}

export interface GroupDetail {
  id: string;
  groupName: string;
  tournament: string;
  owner: string;
  gamemode: number;
  joinCode: string;
  members: GroupMember[];
}

export interface CreateGroupInput {
  groupName: string;
  tournament: string;
  gamemode: number;
  email: string;
}

export const groupsApi = {
  listMine: (email: string) =>
    api.get<GroupSummary[]>(`/api/groups/player/${encodeURIComponent(email.toLowerCase())}`),
  get: (id: string) => api.get<GroupDetail>(`/api/groups/${id}`),
  create: (input: CreateGroupInput) =>
    api.post<{ message: string; group: GroupSummary }>('/api/groups/createGroup', input),
  join: (input: { joinCode: string; email: string }) =>
    api.post<{ message: string; group: GroupSummary }>('/api/groups/join', {
      joinCode: input.joinCode.trim().toUpperCase(),
      email: input.email.toLowerCase(),
    }),
  resetScores: (groupId: string) => api.post(`/api/groups/${groupId}/resetPlayerScores`, {}),
  removePlayer: (groupId: string, email: string) =>
    api.post(`/api/groups/${groupId}/removePlayer`, { email: email.toLowerCase() }),
  transferOwnership: (groupId: string, email: string) =>
    api.post<{ message: string; group: GroupSummary }>(
      `/api/groups/${groupId}/transferOwnership`,
      { email: email.toLowerCase() },
    ),
  rename: (groupId: string, email: string, groupName: string) =>
    api.patch<{ message: string; group: GroupSummary }>(`/api/groups/${groupId}`, {
      email: email.toLowerCase(),
      groupName: groupName.trim(),
    }),
  remove: (groupId: string, email: string) =>
    api.delete<{ message: string }>(`/api/groups/${groupId}`, { email: email.toLowerCase() }),
};
