import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_BASE,
  ApiError,
  approveSession,
  archiveSession,
  cleanSession,
  createSession,
  getAgent,
  getDiff,
  getRecents,
  getSession,
  getTeamFile,
  getWorkflow,
  killSession,
  listAgents,
  listSessions,
  putAgent,
  putWorkflow,
  sendInput,
} from './api.js';

interface FetchCall {
  url: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

function record(): { calls: FetchCall[]; fetchMock: ReturnType<typeof vi.fn> } {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      headers,
    });
    return jsonResponse({ ok: true });
  });
  return { calls, fetchMock };
}

describe('apps/ui/src/lib/api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('request shape', () => {
    it('sends GET to /api/sessions without a body', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await listSessions();

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${API_BASE}/api/sessions`);
      expect(calls[0].method).toBe('GET');
      expect(calls[0].body).toBeUndefined();
    });

    it('POSTs createSession with JSON body and Content-Type header', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await createSession({ source_repo: '/tmp/repo', title: 'hello' });

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions`);
      expect(calls[0].method).toBe('POST');
      expect(calls[0].body).toEqual({ source_repo: '/tmp/repo', title: 'hello' });
      expect(calls[0].headers?.['Content-Type']).toBe('application/json');
    });

    it('DELETE /api/sessions/:id for cleanSession', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await cleanSession('abc-123');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/abc-123`);
      expect(calls[0].method).toBe('DELETE');
    });

    it('GET /api/sessions/:id for getSession', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await getSession('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1`);
      expect(calls[0].method).toBe('GET');
    });

    it('POST /api/sessions/:id/kill for killSession', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await killSession('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/kill`);
      expect(calls[0].method).toBe('POST');
    });

    it('POST /api/sessions/:id/approve for approveSession', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await approveSession('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/approve`);
      expect(calls[0].method).toBe('POST');
    });

    it('POST /api/sessions/:id/archive for archiveSession', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await archiveSession('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/archive`);
      expect(calls[0].method).toBe('POST');
    });

    it('POST /api/sessions/:id/input for sendInput', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await sendInput('s1', 'hello\n');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/input`);
      expect(calls[0].method).toBe('POST');
      expect(calls[0].body).toEqual({ text: 'hello\n' });
    });

    it('GET /api/sessions/:id/diff for getDiff', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await getDiff('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/diff`);
      expect(calls[0].method).toBe('GET');
    });

    it('GET /api/sessions/:id/team/:name returns plain text body for getTeamFile', async () => {
      const fetchMock = vi.fn(async () => textResponse('# Plan\nhello'));
      vi.stubGlobal('fetch', fetchMock);

      const body = await getTeamFile('s1', 'plan.md');

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_BASE}/api/sessions/s1/team/plan.md`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(body).toBe('# Plan\nhello');
    });

    it('GET /api/sessions/:id/agents for listAgents', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await listAgents('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/agents`);
      expect(calls[0].method).toBe('GET');
    });

    it('GET /api/sessions/:id/agents/:name for getAgent', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await getAgent('s1', 'engineer');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/agents/engineer`);
      expect(calls[0].method).toBe('GET');
    });

    it('PUT /api/sessions/:id/agents/:name with content body for putAgent', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await putAgent('s1', 'engineer', '# Engineer\n');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/agents/engineer`);
      expect(calls[0].method).toBe('PUT');
      expect(calls[0].body).toEqual({ content: '# Engineer\n' });
    });

    it('GET /api/sessions/:id/workflow for getWorkflow', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await getWorkflow('s1');

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/workflow`);
      expect(calls[0].method).toBe('GET');
    });

    it('PUT /api/sessions/:id/workflow with full body for putWorkflow', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await putWorkflow('s1', {
        disabled_specialists: ['designer'],
        forced_specialists: [],
        effort_override: 'thorough',
      });

      expect(calls[0].url).toBe(`${API_BASE}/api/sessions/s1/workflow`);
      expect(calls[0].method).toBe('PUT');
      expect(calls[0].body).toEqual({
        disabled_specialists: ['designer'],
        forced_specialists: [],
        effort_override: 'thorough',
      });
    });

    it('GET /api/repos/recents for getRecents', async () => {
      const { calls, fetchMock } = record();
      vi.stubGlobal('fetch', fetchMock);

      await getRecents();

      expect(calls[0].url).toBe(`${API_BASE}/api/repos/recents`);
      expect(calls[0].method).toBe('GET');
    });
  });

  describe('error handling', () => {
    it('parses ErrorResponse body into ApiError on non-2xx', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({ error: 'gone', code: 'SESSION_NOT_FOUND' }, 404),
        ),
      );

      await expect(getSession('missing')).rejects.toMatchObject({
        status: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'gone',
      });
    });

    it('falls back to status text when body is not JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('boom', { status: 500 })),
      );

      const err = await getSession('s1').catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).code).toBe('UNKNOWN');
    });

    it('throws CONNECTION_ERROR when fetch itself rejects', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      );

      const err = await listSessions().catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
      expect((err as ApiError).code).toBe('CONNECTION_ERROR');
    });
  });
});
