import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { Logger } from 'pino';

import type { WsClientEvent, WsClientRole, WsServerEvent } from '@my-team/shared';
import type { SessionManager } from '../session-manager.js';

/**
 * Per-socket bookkeeping the WS layer needs but the `ws` library doesn't
 * expose natively. Stored in a `WeakMap` keyed by the WebSocket instance
 * so each socket carries its own role + the session it belongs to
 * without us having to mutate the `WebSocket` shape with `as any` casts.
 */
interface ClientMeta {
  sessionId: string;
  role: WsClientRole;
}

export function setupWebSocket(
  httpServer: HttpServer,
  sessionManager: SessionManager,
  log: Logger,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Map sessionId -> set of connected WebSocket clients
  const sessionClients = new Map<string, Set<WebSocket>>();

  // Per-socket metadata (role + sessionId). Lives in a WeakMap so it's
  // collected when the socket goes away — no manual cleanup required
  // beyond what the close handler already does for sessionClients.
  const clientMeta = new WeakMap<WebSocket, ClientMeta>();

  /**
   * Count of `cli` clients currently attached to each session. While
   * this is > 0, the wrapper drops `resize` messages from `web` clients
   * (CLI-priority resize authority, SRD §7 / plan Track C). When the
   * count returns to 0, `web` resizes are accepted again so a browser-
   * only session still resizes naturally.
   */
  const cliClientCounts = new Map<string, number>();

  /**
   * Last forwarded resize dimensions per session, used to dedupe
   * back-to-back identical resize messages (a single window-resize on a
   * FitAddon-driven client can emit a small burst of identical frames).
   */
  const lastForwardedResize = new Map<string, { cols: number; rows: number }>();

  function incrementCliCount(sessionId: string): void {
    cliClientCounts.set(sessionId, (cliClientCounts.get(sessionId) ?? 0) + 1);
  }

  function decrementCliCount(sessionId: string): void {
    const current = cliClientCounts.get(sessionId) ?? 0;
    if (current <= 1) {
      cliClientCounts.delete(sessionId);
    } else {
      cliClientCounts.set(sessionId, current - 1);
    }
  }

  // Handle HTTP upgrade
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/ws\/sessions\/([^/]+)$/);

    if (!match) {
      socket.destroy();
      return;
    }

    const sessionId = match[1];

    // Verify session exists
    try {
      sessionManager.getSession(sessionId);
    } catch {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, sessionId);
    });
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket, _request: unknown, sessionId: string) => {
    log.info({ sessionId }, 'WebSocket client connected');

    // Track this client
    if (!sessionClients.has(sessionId)) {
      sessionClients.set(sessionId, new Set());
    }
    sessionClients.get(sessionId)!.add(ws);

    // Default role: `web`. Clients that send a `hello` with `role:'cli'`
    // before any other message flip themselves to `cli`. Backwards-
    // compatible: a legacy client that never sends a hello stays `web`.
    clientMeta.set(ws, { sessionId, role: 'web' });

    // Hydrate the new client with initial `team_file` events so the artifact
    // panes render the current .team/ contents immediately on connect. The
    // event handler below broadcasts to all currently-connected clients,
    // including this one. Best-effort — a failed initial emit shouldn't
    // sever the connection.
    sessionManager.emitInitialTeamFiles(sessionId).catch((err) => {
      log.warn({ sessionId, err }, 'Failed to emit initial team_file events');
    });

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WsClientEvent;
        if (message.type === 'hello') {
          const meta = clientMeta.get(ws);
          if (meta === undefined) return;
          const previousRole = meta.role;
          meta.role = message.role;
          if (previousRole !== 'cli' && message.role === 'cli') {
            incrementCliCount(sessionId);
          } else if (previousRole === 'cli' && message.role !== 'cli') {
            decrementCliCount(sessionId);
          }
          log.debug(
            { sessionId, role: message.role },
            'WebSocket client identified itself',
          );
          return;
        }
        if (message.type === 'input') {
          sessionManager.sendInput(sessionId, message.text);
          return;
        }
        if (message.type === 'resize') {
          const meta = clientMeta.get(ws);
          const role = meta?.role ?? 'web';
          const cliAttached = (cliClientCounts.get(sessionId) ?? 0) > 0;

          // CLI-priority authority: drop `web` resizes while a CLI
          // client is also attached. The CLI's SIGWINCH listener
          // becomes the single source of truth for PTY dimensions and
          // the web UI's FitAddon stops competing for the same PTY.
          if (role === 'web' && cliAttached) {
            log.debug(
              { sessionId, cols: message.cols, rows: message.rows },
              'Dropping web client resize while CLI is attached',
            );
            return;
          }

          // Dedupe identical-dimension resize forwards (no-op resize
          // spam guard). A FitAddon refit can fire a small burst of
          // resize events with the same cols/rows after a single
          // window-resize; we only need to forward the first one.
          const last = lastForwardedResize.get(sessionId);
          if (last && last.cols === message.cols && last.rows === message.rows) {
            return;
          }
          lastForwardedResize.set(sessionId, {
            cols: message.cols,
            rows: message.rows,
          });
          sessionManager.resizeCaptain(sessionId, message.cols, message.rows);
        }
      } catch (err) {
        log.warn({ sessionId, err }, 'Invalid WebSocket message from client');
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      log.info({ sessionId }, 'WebSocket client disconnected');
      const meta = clientMeta.get(ws);
      if (meta?.role === 'cli') {
        decrementCliCount(sessionId);
      }
      clientMeta.delete(ws);
      sessionClients.get(sessionId)?.delete(ws);
      if (sessionClients.get(sessionId)?.size === 0) {
        sessionClients.delete(sessionId);
        // No more clients for this session — clear the dedupe cache so
        // a future client doesn't have its first resize swallowed by a
        // stale last-forwarded value.
        lastForwardedResize.delete(sessionId);
      }
    });
  });

  // Forward session events to connected WebSocket clients
  sessionManager.on('event', (sessionId: string, event: WsServerEvent) => {
    const clients = sessionClients.get(sessionId);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  return wss;
}
