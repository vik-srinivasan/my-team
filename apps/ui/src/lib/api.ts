import { MyTeamError } from '@my-team/shared/errors';
import type {
  AgentListResponse,
  AgentPromptResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  DiffResponse,
  ErrorResponse,
  RecentReposResponse,
  SessionDetail,
  SessionSummary,
  WorkflowConfig,
} from '@my-team/shared/types';

/**
 * Wrapper daemon base URL. The wrapper hard-codes port 3001 and binds to
 * `127.0.0.1` only; both Tauri and the web fallback hit the same host.
 */
export const API_BASE = 'http://127.0.0.1:3001';

/**
 * Thrown by every `apps/ui/src/lib/api.ts` function on a non-2xx response.
 * Parses the wrapper's `ErrorResponse` body when present so callers can
 * branch on `err.code` rather than parsing strings.
 */
export class ApiError extends MyTeamError {
  readonly status: number;

  constructor(status: number, message: string, code: string) {
    super(message, code);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface JsonRequestInit {
  method: string;
  body?: unknown;
  /** When set, parse the response as plain text rather than JSON. */
  expect?: 'json' | 'text';
}

async function request<T>(path: string, init: JsonRequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const options: RequestInit = {
    method: init.method,
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  };

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    throw new ApiError(
      0,
      `Cannot reach wrapper daemon at ${API_BASE}. Is it running? Try: team start`,
      'CONNECTION_ERROR',
    );
  }

  if (!response.ok) {
    let body: ErrorResponse | null = null;
    try {
      body = (await response.json()) as ErrorResponse;
    } catch {
      // Body wasn't JSON; fall through with generic error.
    }
    throw new ApiError(
      response.status,
      body?.error ?? `Request failed: ${response.status} ${response.statusText}`,
      body?.code ?? 'UNKNOWN',
    );
  }

  if (init.expect === 'text') {
    return (await response.text()) as unknown as T;
  }
  return (await response.json()) as T;
}

// ── Sessions ──────────────────────────────────────────────────────────

export function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions', { method: 'GET' });
}

export function getSession(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`, { method: 'GET' });
}

export function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>('/api/sessions', { method: 'POST', body });
}

export function killSession(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${id}/kill`, { method: 'POST' });
}

export function cleanSession(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' });
}

export function archiveSession(id: string): Promise<{ ok: boolean; archive_path: string }> {
  return request<{ ok: boolean; archive_path: string }>(`/api/sessions/${id}/archive`, {
    method: 'POST',
  });
}

export function sendInput(id: string, text: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${id}/input`, {
    method: 'POST',
    body: { text },
  });
}

export function approveSession(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/sessions/${id}/approve`, { method: 'POST' });
}

export function getDiff(id: string): Promise<DiffResponse> {
  return request<DiffResponse>(`/api/sessions/${id}/diff`, { method: 'GET' });
}

/**
 * Returns the raw plain-text body of a `.team/<name>` file. The wrapper
 * serves markdown files as `text/plain`, so callers receive a `string`.
 * For JSON files the wrapper returns JSON; this helper still surfaces
 * the body as a string so callers can `JSON.parse` themselves if needed.
 */
export function getTeamFile(id: string, name: string): Promise<string> {
  return request<string>(`/api/sessions/${id}/team/${name}`, {
    method: 'GET',
    expect: 'text',
  });
}

// ── Agent prompts (Workflow tab) ───────────────────────────────────────

export function listAgents(id: string): Promise<AgentListResponse> {
  return request<AgentListResponse>(`/api/sessions/${id}/agents`, { method: 'GET' });
}

export function getAgent(id: string, name: string): Promise<AgentPromptResponse> {
  return request<AgentPromptResponse>(`/api/sessions/${id}/agents/${name}`, { method: 'GET' });
}

export function putAgent(id: string, name: string, content: string): Promise<AgentPromptResponse> {
  return request<AgentPromptResponse>(`/api/sessions/${id}/agents/${name}`, {
    method: 'PUT',
    body: { content },
  });
}

// ── Workflow config (Workflow tab) ─────────────────────────────────────

export function getWorkflow(id: string): Promise<WorkflowConfig> {
  return request<WorkflowConfig>(`/api/sessions/${id}/workflow`, { method: 'GET' });
}

export function putWorkflow(id: string, config: WorkflowConfig): Promise<WorkflowConfig> {
  return request<WorkflowConfig>(`/api/sessions/${id}/workflow`, {
    method: 'PUT',
    body: config,
  });
}

// ── Recents (New Session modal) ────────────────────────────────────────

export function getRecents(): Promise<RecentReposResponse> {
  return request<RecentReposResponse>('/api/repos/recents', { method: 'GET' });
}
