const BASE_URL = 'http://127.0.0.1:3001';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError(0, 'Cannot connect to wrapper daemon. Is it running? Try: team start', 'CONNECTION_ERROR');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error', code: 'UNKNOWN' })) as { error: string; code: string };
    throw new ApiError(response.status, errorBody.error, errorBody.code);
  }

  return response.json() as Promise<T>;
}

export const api = {
  createSession: (source_repo: string, title: string) =>
    request<{ id: string; title: string; worktree_path: string; phase: string }>('POST', '/api/sessions', { source_repo, title }),

  listSessions: () =>
    request<Array<{ id: string; title: string; source_repo: string; phase: string; active_specialist: string | null; created_at: string }>>('GET', '/api/sessions'),

  getSession: (id: string) =>
    request<Record<string, unknown>>('GET', `/api/sessions/${id}`),

  sendInput: (id: string, text: string) =>
    request<{ ok: boolean }>('POST', `/api/sessions/${id}/input`, { text }),

  approveSession: (id: string) =>
    request<{ ok: boolean }>('POST', `/api/sessions/${id}/approve`),

  killSession: (id: string) =>
    request<{ ok: boolean }>('POST', `/api/sessions/${id}/kill`),

  cleanSession: (id: string) =>
    request<{ ok: boolean }>('DELETE', `/api/sessions/${id}`),

  archiveSession: (id: string) =>
    request<{ ok: boolean; archive_path: string }>('POST', `/api/sessions/${id}/archive`),

  getDiff: (id: string) =>
    request<{ diff: string }>('GET', `/api/sessions/${id}/diff`),

  getTeamFiles: (id: string) =>
    request<Record<string, unknown>>('GET', `/api/sessions/${id}/team`),

  getTeamFile: (id: string, file: string) =>
    request<string>('GET', `/api/sessions/${id}/team/${file}`),

  getNotifications: () =>
    request<Array<{ session_id: string; title: string; reason: string; timestamp: string }>>('GET', '/api/notifications'),

  clearNotifications: () =>
    request<{ ok: boolean; cleared: number }>('DELETE', '/api/notifications'),

  dismissNotification: (id: string) =>
    request<{ ok: boolean }>('DELETE', `/api/notifications/${id}`),
};
