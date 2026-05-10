import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { api, ApiError } from '../api-client.js';

export function openCommand(): Command {
  return new Command('open')
    .description('Open a session worktree in VS Code')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const session = await api.getSession(id) as Record<string, unknown>;
        const worktreePath = session.worktree_path as string;

        console.log(`Opening ${worktreePath} in VS Code...`);
        exec(`code ${worktreePath}`, (err) => {
          if (err) {
            console.error(chalk.red(`Could not open VS Code. Run manually: code ${worktreePath}`));
          }
        });
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to open session'));
        }
        process.exit(1);
      }
    });
}
