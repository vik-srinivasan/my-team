import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { Logger } from 'pino';

import type { WsClientEvent, WsServerEvent } from '@viktown/shared';
import type { SessionManager } from '../session-manager.js';

export function setupWebSocket(
  httpServer: HttpServer,
  sessionManager: SessionManager,
  log: Logger,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Map sessionId -> set of connected WebSocket clients
  const sessionClients = new Map<string, Set<WebSocket>>();

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

    // Handle client messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WsClientEvent;
        if (message.type === 'input') {
          sessionManager.sendInput(sessionId, message.text);
        }
      } catch (err) {
        log.warn({ sessionId, err }, 'Invalid WebSocket message from client');
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      log.info({ sessionId }, 'WebSocket client disconnected');
      sessionClients.get(sessionId)?.delete(ws);
      if (sessionClients.get(sessionId)?.size === 0) {
        sessionClients.delete(sessionId);
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
