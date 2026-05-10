import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function archiveCommand(): Command {
  return new Command('archive')
    .description('Archive a session .team/ directory')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const result = await api.archiveSession(id);
        console.log(chalk.green(`Session ${id} archived to ${result.archive_path}`));
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to archive session'));
        }
        process.exit(1);
      }
    });
}
