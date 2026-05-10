import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function cleanCommand(): Command {
  return new Command('clean')
    .description('Remove a session worktree (archives .team/ first)')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        await api.cleanSession(id);
        console.log(chalk.green(`Session ${id} cleaned. Archive preserved at ~/team/archives/${id}/`));
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to clean session'));
        }
        process.exit(1);
      }
    });
}
