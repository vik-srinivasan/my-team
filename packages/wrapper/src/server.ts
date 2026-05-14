import type { Server } from 'node:http';

import express from 'express';
import cors from 'cors';
import type { Logger } from 'pino';

import type { SessionManager } from './session-manager.js';
import { createSessionsRouter } from './api/sessions.js';
import { createNotificationsRouter } from './api/notifications.js';

export interface ServerOptions {
  sessionManager: SessionManager;
  log: Logger;
  host?: string;
  port?: number;
}

/**
 * Origins the wrapper's HTTP API accepts for cross-origin requests.
 *
 * - `http://localhost:3737` — the web fallback (`team ui` static server).
 * - `tauri://localhost` — the Tauri v2 WebView in the macOS .app build.
 *
 * Everything else (including `http://localhost:5173` for `vite dev`) is
 * rejected at the CORS layer. The WebSocket upgrade path does NOT use this
 * middleware: the `ws` library accepts any Origin by default, so the
 * upgrade endpoint is currently origin-unchecked. Acceptable while the
 * wrapper is bound to 127.0.0.1; harden in a follow-up if we ever expose
 * the daemon over a non-loopback interface.
 */
export const ALLOWED_ORIGINS = [
  'http://localhost:3737',
  'tauri://localhost',
] as const;

export function createServer(options: ServerOptions): {
  app: express.Express;
  start: () => Promise<Server>;
} {
  const { sessionManager, log, host = '127.0.0.1', port = 3001 } = options;

  const app = express();
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin requests (no Origin header — e.g., curl, server-side
        // fetches) are allowed unconditionally. Cross-origin browsers send
        // an Origin header and must match the allowlist.
        if (!origin) {
          callback(null, true);
          return;
        }
        if ((ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    log.debug({ method: req.method, url: req.url }, 'request');
    next();
  });

  // Routes
  app.use('/api/sessions', createSessionsRouter(sessionManager, log));
  app.use('/api/notifications', createNotificationsRouter(log));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const start = (): Promise<Server> => {
    return new Promise((resolve) => {
      const server = app.listen(port, host, () => {
        log.info({ host, port }, 'Wrapper daemon listening');
        resolve(server);
      });
    });
  };

  return { app, start };
}
