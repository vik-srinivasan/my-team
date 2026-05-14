import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiError, getTeamFile } from '../lib/api.js';

/**
 * Fetches a single `.team/<file>` body via `GET /api/sessions/:id/team/:file`.
 * The wrapper serves markdown as `text/plain` and JSON as JSON; this hook
 * always surfaces the body as a string (caller can `JSON.parse` itself).
 *
 * Returns `null` data when the file is missing (the wrapper currently
 * returns 404 for absent JSON files like `pr.url`). Useful for surfaces
 * like `SessionHeader` that only conditionally render based on file
 * existence.
 */
export function useTeamFile(
  id: string | null,
  file: string,
): UseQueryResult<string | null, unknown> {
  return useQuery<string | null, unknown>({
    queryKey: ['team-file', id, file],
    queryFn: async () => {
      if (id === null) return null;
      try {
        return await getTeamFile(id, file);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: id !== null,
    // Most team files are streamed in real-time over the WS; for the
    // small set surfaced here (e.g. pr.url), a 30s background refetch
    // is plenty and keeps the daemon load low.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
