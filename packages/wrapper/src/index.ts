import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';

import { SessionManager } from './session-manager.js';
import { createServer } from './server.js';
import { setupWebSocket } from './api/websocket.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CAPTAIN_PROMPT_PATH = resolve(__dirname, '..', '..', '..', 'agent-prompts', 'captain.md');

const HOST = '127.0.0.1';
const PORT = 3001;

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
});

const sessionManager = new SessionManager(log, CAPTAIN_PROMPT_PATH);
const { app, start } = createServer({ sessionManager, log, host: HOST, port: PORT });

const httpServer = await start();
const wss = setupWebSocket(httpServer, sessionManager, log);

log.info('Viktown wrapper daemon started');

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Shutting down...');

  await sessionManager.shutdownAll();

  wss.close(() => {
    httpServer.close(() => {
      log.info('Wrapper daemon stopped');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    log.warn('Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
