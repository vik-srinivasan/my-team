import { Command } from 'commander';
import { exec } from 'node:child_process';
import { api, ApiError } from '../api-client.js';

export function uiCommand(): Command {
  return new Command('ui')
    .description('Open the Viktown web dashboard in your browser')
    .action(async () => {
      const url = 'http://localhost:3001';

      // Check if daemon is running first
      try {
        await api.listSessions();
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          console.error('Daemon is not running. Start it first with: team start');
          process.exit(1);
        }
      }

      console.log(`Opening ${url} ...`);

      // macOS: open, Linux: xdg-open
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${cmd} ${url}`, (err) => {
        if (err) {
          console.error(`Could not open browser. Visit ${url} manually.`);
        }
      });
    });
}
