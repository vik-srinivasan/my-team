import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function killCommand(): Command {
  return new Command('kill')
    .description('Terminate a session')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        await api.killSession(id);
        console.log(chalk.green(`Session ${id} killed. Worktree preserved.`));
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to kill session'));
        }
        process.exit(1);
      }
    });
}
