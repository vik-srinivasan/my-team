import { Command } from 'commander';
import chalk from 'chalk';
import WebSocket from 'ws';

import type { WsServerEvent } from '@my-team/shared';

const WS_BASE = 'ws://127.0.0.1:3001';

export function attachCommand(): Command {
  return new Command('attach')
    .description('Attach to a session chat (raw terminal passthrough)')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      await attachToSession(id);
    });
}

export function attachToSession(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `${WS_BASE}/ws/sessions/${id}`;
    const ws = new WebSocket(url);

    ws.on('error', (err) => {
      console.error(chalk.red(`WebSocket error: ${err.message}`));
      reject(err);
    });

    ws.on('open', () => {
      // Put terminal into raw mode for proper TUI passthrough
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      // Identify ourselves to the wrapper before any other frame. This
      // is what gives the CLI priority over the web UI for resize
      // authority: while a `cli` client is attached, the wrapper drops
      // `resize` messages from `web` clients (see plan.md Track C and
      // packages/wrapper/src/api/websocket.ts). Sending this first
      // guarantees we're counted as a CLI client before our initial
      // resize is processed.
      ws.send(JSON.stringify({ type: 'hello', role: 'cli' }));

      // Send initial terminal size
      if (process.stdout.isTTY) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: process.stdout.columns,
          rows: process.stdout.rows,
        }));
      }

      // Forward resize events
      const onResize = (): void => {
        if (process.stdout.isTTY && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols: process.stdout.columns,
            rows: process.stdout.rows,
          }));
        }
      };
      process.stdout.on('resize', onResize);

      // Forward raw keystrokes to the PTY
      const onData = (data: Buffer): void => {
        if (ws.readyState !== WebSocket.OPEN) return;

        // Ctrl+] to detach (standard escape for terminal multiplexers)
        if (data.length === 1 && data[0] === 0x1d) {
          cleanup();
          return;
        }

        ws.send(JSON.stringify({ type: 'input', text: data.toString() }));
      };
      process.stdin.on('data', onData);

      const cleanup = (): void => {
        process.stdin.removeListener('data', onData);
        process.stdout.removeListener('resize', onResize);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        ws.close();
        console.log(chalk.dim('\nDetached from session. (Ctrl+] to detach)'));
        resolve();
      };
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as WsServerEvent;

        switch (event.type) {
          case 'output':
            // Write raw PTY output directly — preserves Claude Code's TUI
            process.stdout.write(event.text);
            break;
          case 'state':
          case 'specialist':
          case 'team_file':
          case 'diff':
            // Silently ignore non-output events in raw attach mode
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (process.stdin.isTTY && process.stdin.isRaw) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      console.log(chalk.dim('\nDisconnected from session.'));
      resolve();
    });
  });
}
