import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'node:child_process';
import { api, ApiError } from '../api-client.js';

export function newCommand(): Command {
  return new Command('new')
    .description('Create a new session for the current repo')
    .argument('<title>', 'Session title')
    .option('--no-attach', 'Do not attach to the session after creation')
    .action(async (title: string, options: { attach: boolean }) => {
      // Detect source repo
      let sourceRepo: string;
      try {
        sourceRepo = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
      } catch {
        console.error(chalk.red('Error: Not inside a git repository.'));
        process.exit(1);
      }

      const spinner = ora('Creating session...').start();

      try {
        const session = await api.createSession(sourceRepo, title);
        spinner.succeed(chalk.green(`Session created: ${chalk.bold(session.id)}`));
        console.log(`  Title:    ${session.title}`);
        console.log(`  Worktree: ${session.worktree_path}`);
        console.log(`  Phase:    ${session.phase}`);

        if (options.attach) {
          console.log(chalk.dim('\nAttaching to session... (use Ctrl+C to detach)'));
          // Dynamic import to avoid loading ws unless needed
          const { attachToSession } = await import('./attach.js');
          await attachToSession(session.id);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red('Failed to create session'));
        }
        process.exit(1);
      }
    });
}
