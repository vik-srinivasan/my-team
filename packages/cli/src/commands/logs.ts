import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function logsCommand(): Command {
  return new Command('logs')
    .description('Print recent journal entries')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const teamFiles = await api.getTeamFiles(id) as Record<string, unknown>;
        const journal = teamFiles.journal as string;

        if (!journal || journal.trim() === '') {
          console.log(chalk.dim('No journal entries yet.'));
          return;
        }

        console.log(journal);
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to get logs'));
        }
        process.exit(1);
      }
    });
}
