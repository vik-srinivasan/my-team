import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Logger } from 'pino';

import type {
  CreateSessionResponse,
  SessionSummary,
  DiffResponse,
  ErrorResponse,
} from '@my-team/shared';
import { MyTeamError } from '@my-team/shared';

import type { SessionManager } from '../session-manager.js';
import {
  adaptSessionLookup,
  listAgents,
  getAgent,
  putAgent,
} from '../agent-prompts.js';
import { getWorkflowConfig, putWorkflowConfig } from '../workflow-config.js';

const CreateSessionSchema = z.object({
  source_repo: z.string().min(1),
  title: z.string().min(1),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
});

const SendInputSchema = z.object({
  text: z.string(),
});

const PutAgentSchema = z.object({
  content: z.string(),
});

const SessionIdParamSchema = z.object({
  id: z.string().min(1, 'session id is required'),
});

const PurgeOrphansSchema = z.object({
  exclude: z.array(z.string()).optional(),
});

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function handleError(res: Response, err: unknown, log: Logger): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: err.issues.map((e) => e.message).join(', '),
      code: 'VALIDATION_ERROR',
    } satisfies ErrorResponse);
    return;
  }

  if (err instanceof MyTeamError) {
    const statusCode = err.code === 'SESSION_NOT_FOUND' ? 404
      : err.code === 'AGENT_NOT_FOUND' ? 404
      : err.code === 'INVALID_AGENT_NAME' ? 400
      : err.code === 'INVALID_WORKFLOW_CONFIG' ? 400
      : err.code === 'SESSION_ACTIVE' ? 409
      : err.code === 'SESSION_PROCESS_DEAD' ? 409
      : err.code === 'SESSION_CORRUPT' ? 422
      : err.code === 'NOT_A_GIT_REPO' ? 400
      : 500;
    res.status(statusCode).json({
      error: err.message,
      code: err.code,
    } satisfies ErrorResponse);
    return;
  }

  log.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  } satisfies ErrorResponse);
}

export function createSessionsRouter(
  sessionManager: SessionManager,
  log: Logger,
): Router {
  const router = Router();

  // POST /api/sessions
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = CreateSessionSchema.parse(req.body);
      const session = await sessionManager.createSession(body.source_repo, body.title, body.cols, body.rows);
      const response: CreateSessionResponse = {
        id: session.meta.id,
        title: session.meta.title,
        worktree_path: session.worktree_path,
        phase: session.state.phase,
        remote_url: session.remote_url,
      };
      res.status(201).json(response);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // GET /api/sessions
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const sessions: SessionSummary[] = await sessionManager.listSessions();
      res.json(sessions);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // POST /api/sessions/purge-orphans
  //
  // Registered ABOVE the `/:id` routes so Express doesn't treat
  // `purge-orphans` as a session id. Body accepts `{ exclude?: string[] }`
  // — the CLI passes the current session id in `exclude` so the bulk
  // purge doesn't delete the worktree it's running inside.
  router.post('/purge-orphans', async (req: Request, res: Response) => {
    try {
      const body = PurgeOrphansSchema.parse(req.body ?? {});
      const summary = await sessionManager.purgeOrphans({ exclude: body.exclude });
      res.json(summary);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // GET /api/sessions/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const detail = await sessionManager.getSessionDetail(param(req, 'id'));
      res.json(detail);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // POST /api/sessions/:id/input
  router.post('/:id/input', (req: Request, res: Response) => {
    try {
      const body = SendInputSchema.parse(req.body);
      sessionManager.sendInput(param(req, 'id'), body.text);
      res.status(202).json({ ok: true });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // POST /api/sessions/:id/approve
  router.post('/:id/approve', (req: Request, res: Response) => {
    try {
      sessionManager.approveSession(param(req, 'id'));
      res.status(202).json({ ok: true });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // POST /api/sessions/:id/kill
  router.post('/:id/kill', async (req: Request, res: Response) => {
    try {
      await sessionManager.killSession(param(req, 'id'));
      res.status(202).json({ ok: true });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // POST /api/sessions/:id/resume
  router.post('/:id/resume', async (req: Request, res: Response) => {
    try {
      const { id } = SessionIdParamSchema.parse({ id: param(req, 'id') });
      const session = await sessionManager.resumeSession(id);
      const response: SessionSummary = {
        id: session.meta.id,
        title: session.meta.title,
        source_repo: session.meta.source_repo,
        phase: session.state.phase,
        active_specialist: session.state.active_specialist,
        created_at: session.meta.created_at,
        last_checkpoint: session.state.last_checkpoint,
        must_ask_count: session.state.must_ask_pending.length,
      };
      res.status(200).json(response);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // DELETE /api/sessions/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await sessionManager.cleanSession(param(req, 'id'));
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // POST /api/sessions/:id/archive
  router.post('/:id/archive', async (req: Request, res: Response) => {
    try {
      const archivePath = await sessionManager.archiveSession(param(req, 'id'));
      res.json({ ok: true, archive_path: archivePath });
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // GET /api/sessions/:id/diff
  router.get('/:id/diff', async (req: Request, res: Response) => {
    try {
      const diff = await sessionManager.getDiff(param(req, 'id'));
      const response: DiffResponse = { diff };
      res.json(response);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // GET /api/sessions/:id/team
  router.get('/:id/team', async (req: Request, res: Response) => {
    try {
      const detail = await sessionManager.getSessionDetail(param(req, 'id'));
      res.json(detail.team);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // GET /api/sessions/:id/team/:file
  router.get('/:id/team/:file', async (req: Request, res: Response) => {
    try {
      const detail = await sessionManager.getSessionDetail(param(req, 'id'));
      const filename = param(req, 'file');
      const teamFiles = detail.team;
      const key = filename.replace('.json', '').replace('.md', '') as keyof typeof teamFiles;
      if (key in teamFiles) {
        const content = teamFiles[key];
        if (typeof content === 'string') {
          res.type('text/plain').send(content);
        } else {
          res.json(content);
        }
      } else {
        res.status(404).json({ error: `Team file not found: ${filename}`, code: 'NOT_FOUND' });
      }
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // ── Agent prompt CRUD (Workflow tab) ──────────────────────────────
  //
  // The captain's prompt + each specialist's `.md` lives on disk in four
  // layers: session → repo → user → packaged default. The UI lets the
  // user edit the session layer; the rest is read-only fallback.

  const sessionLookup = adaptSessionLookup(sessionManager);

  // GET /api/sessions/:id/agents
  router.get('/:id/agents', async (req: Request, res: Response) => {
    try {
      const data = await listAgents(sessionLookup, param(req, 'id'));
      res.json(data);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // GET /api/sessions/:id/agents/:name
  router.get('/:id/agents/:name', async (req: Request, res: Response) => {
    try {
      const data = await getAgent(sessionLookup, param(req, 'id'), param(req, 'name'));
      res.json(data);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // PUT /api/sessions/:id/agents/:name
  router.put('/:id/agents/:name', async (req: Request, res: Response) => {
    try {
      const body = PutAgentSchema.parse(req.body);
      const data = await putAgent(
        sessionLookup,
        param(req, 'id'),
        param(req, 'name'),
        body.content,
      );
      res.json(data);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // ── Workflow config (Workflow tab) ────────────────────────────────
  //
  // Per-session overrides for conditional-specialist dispatch + effort
  // level. Stored at `<worktree>/.team/workflow.json`. The captain reads
  // this file before dispatching designer / runner / auditor /
  // documenter / debugger (see `agent-prompts/captain.md`).

  // GET /api/sessions/:id/workflow
  router.get('/:id/workflow', async (req: Request, res: Response) => {
    try {
      const config = await getWorkflowConfig(sessionLookup, param(req, 'id'));
      res.json(config);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  // PUT /api/sessions/:id/workflow
  router.put('/:id/workflow', async (req: Request, res: Response) => {
    try {
      const saved = await putWorkflowConfig(sessionLookup, param(req, 'id'), req.body);
      res.json(saved);
    } catch (err) {
      handleError(res, err, log);
    }
  });

  return router;
}
