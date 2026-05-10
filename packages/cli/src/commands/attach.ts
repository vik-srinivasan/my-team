import { Command } from 'commander';
import chalk from 'chalk';
import WebSocket from 'ws';
import { createInterface } from 'node:readline';

import type { WsServerEvent } from '@viktown/shared';

const WS_BASE = 'ws://127.0.0.1:3001';

export function attachCommand(): Command {
  return new Command('attach')
    .description('Attach to a session chat')
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
      // Set up stdin for sending messages
      const rl = createInterface({
        input: process.stdin,
        terminal: false,
      });

      rl.on('line', (line) => {
        ws.send(JSON.stringify({ type: 'input', text: line + '\n' }));
      });

      // Handle Ctrl+C to detach
      process.on('SIGINT', () => {
        console.log(chalk.dim('\nDetaching...'));
        ws.close();
        rl.close();
        resolve();
      });
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as WsServerEvent;

        switch (event.type) {
          case 'output':
            process.stdout.write(event.text);
            break;
          case 'state':
            console.log(chalk.dim(`\n[state: ${event.state.phase}]`));
            break;
          case 'specialist':
            if (event.status === 'started') {
              console.log(chalk.cyan(`\n[${event.name} started]`));
            } else {
              console.log(chalk.green(`\n[${event.name} finished]`));
            }
            break;
          case 'team_file':
            // Silently ignore team file updates in CLI
            break;
          case 'diff':
            // Silently ignore diff updates in CLI
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      console.log(chalk.dim('\nDisconnected from session.'));
      resolve();
    });
  });
}
