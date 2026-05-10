import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function purgeCommand(): Command {
  return new Command('purge')
    .description('Kill and clean a session in one step (terminates captain + removes worktree)')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        await api.killSession(id);
        await api.cleanSession(id);
        console.log(chalk.green(`Purged ${id}: session killed and worktree removed.`));
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to purge session'));
        }
        process.exit(1);
      }
    });
}
