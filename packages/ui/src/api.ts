import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionSummary,
  SessionDetail,
  DiffResponse,
  TeamFiles,
} from '@my-team/shared';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  sessions: {
    list(): Promise<SessionSummary[]> {
      return request('/sessions');
    },

    get(id: string): Promise<SessionDetail> {
      return request(`/sessions/${id}`);
    },

    create(body: CreateSessionRequest): Promise<CreateSessionResponse> {
      return request('/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    sendInput(id: string, text: string): Promise<void> {
      return request(`/sessions/${id}/input`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
    },

    approve(id: string): Promise<void> {
      return request(`/sessions/${id}/approve`, { method: 'POST' });
    },

    kill(id: string): Promise<void> {
      return request(`/sessions/${id}/kill`, { method: 'POST' });
    },

    clean(id: string): Promise<void> {
      return request(`/sessions/${id}`, { method: 'DELETE' });
    },

    archive(id: string): Promise<void> {
      return request(`/sessions/${id}/archive`, { method: 'POST' });
    },

    diff(id: string): Promise<DiffResponse> {
      return request(`/sessions/${id}/diff`);
    },

    team(id: string): Promise<TeamFiles> {
      return request(`/sessions/${id}/team`);
    },

    teamFile(id: string, file: string): Promise<string> {
      return fetch(`${BASE}/sessions/${id}/team/${file}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
    },
  },
};
