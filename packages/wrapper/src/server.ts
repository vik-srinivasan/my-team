import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
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

export function createServer(options: ServerOptions): {
  app: express.Express;
  start: () => Promise<Server>;
} {
  const { sessionManager, log, host = '127.0.0.1', port = 3001 } = options;

  const app = express();
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

  // Serve UI static files (production build)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const uiDistPath = resolve(__dirname, '../../ui/dist');
  if (existsSync(uiDistPath)) {
    app.use(express.static(uiDistPath));
    // SPA fallback — serve index.html for non-API routes
    app.use((_req, res, next) => {
      if (_req.path.startsWith('/api') || _req.path.startsWith('/ws')) {
        next();
        return;
      }
      res.sendFile(join(uiDistPath, 'index.html'));
    });
    log.info({ path: uiDistPath }, 'Serving UI static files');
  }

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
