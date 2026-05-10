import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Detailed status for one session')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const session = await api.getSession(id) as Record<string, unknown>;
        const meta = session.meta as Record<string, string>;
        const state = session.state as Record<string, unknown>;

        console.log(chalk.bold(`Session: ${meta.id}`));
        console.log(`  Title:      ${meta.title}`);
        console.log(`  Source:     ${meta.source_repo}`);
        console.log(`  Branch:     ${meta.session_branch}`);
        console.log(`  Phase:      ${state.phase}`);
        console.log(`  Specialist: ${state.active_specialist ?? chalk.dim('none')}`);
        console.log(`  Reviews:    ${state.review_iterations}/${state.max_review_iterations}`);
        console.log(`  Created:    ${meta.created_at}`);

        const remoteUrl = session.remote_url as string | null;
        if (remoteUrl) {
          console.log(`  Remote:     ${chalk.cyan(remoteUrl)}`);
        }

        const blockers = state.blockers as string[];
        if (blockers.length > 0) {
          console.log(chalk.red(`  Blockers:   ${blockers.join(', ')}`));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to get session status'));
        }
        process.exit(1);
      }
    });
}
