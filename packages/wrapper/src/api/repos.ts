import { Router, type Request, type Response } from 'express';
import type { Logger } from 'pino';

import type { RecentRepo, RecentReposResponse, ErrorResponse } from '@my-team/shared';
import { readRegistry, DEFAULT_REGISTRY_PATH, MyTeamError } from '@my-team/shared';

/**
 * Compact a `RepoRecord` into the `RecentRepo` shape the UI consumes.
 * Drops `first_used` and `last_session_id` — neither is shown in the
 * New Session modal, and surfacing fewer fields keeps the contract
 * stable if the on-disk registry shape grows.
 */
function toRecentRepo(record: {
  path: string;
  basename: string;
  last_used: string;
  session_count: number;
}): RecentRepo {
  return {
    path: record.path,
    basename: record.basename,
    last_used: record.last_used,
    session_count: record.session_count,
  };
}

/**
 * Routes under `/api/repos`. Currently exposes a single endpoint backing
 * the UI's New Session modal repo picker; more (e.g., a "resolve
 * shortcut" endpoint) can land here later.
 */
export function createReposRouter(log: Logger): Router {
  const router = Router();

  // GET /api/repos/recents
  router.get('/recents', async (_req: Request, res: Response) => {
    try {
      const registryPath = process.env['MY_TEAM_REGISTRY_PATH'] ?? DEFAULT_REGISTRY_PATH;
      const registry = await readRegistry(registryPath);
      const repos = registry.repos.map(toRecentRepo);
      const response: RecentReposResponse = { repos };
      res.json(response);
    } catch (err) {
      if (err instanceof MyTeamError) {
        res.status(500).json({
          error: err.message,
          code: err.code,
        } satisfies ErrorResponse);
        return;
      }
      log.error({ err }, 'Failed to read recents registry');
      res.status(500).json({
        error: 'Failed to read recents registry',
        code: 'INTERNAL_ERROR',
      } satisfies ErrorResponse);
    }
  });

  return router;
}
