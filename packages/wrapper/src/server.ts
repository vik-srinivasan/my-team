import type { Server } from 'node:http';

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
