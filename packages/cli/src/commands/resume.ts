import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

/**
 * `team resume <id>` — bring an orphan session back to life.
 *
 * Re-spawns a captain on the existing worktree. The captain reads its
 * own `.team/journal.md` + `state.json` + `tasks.md` + `srd.md` +
 * `plan.md` to pick up where it left off. A fresh `Session resumed`
 * journal entry is appended by the wrapper before spawn.
 *
 * Errors:
 *   - SESSION_NOT_FOUND  (404) — no worktree at ~/team/sessions/<id>.
 *   - SESSION_ACTIVE     (409) — captain already running in this daemon.
 *   - SESSION_CORRUPT    (422) — worktree present but meta.json unreadable.
 *   - any other failure is reported with its message.
 *
 * Always `process.exit(1)` on error.
 */
export function resumeCommand(): Command {
  return new Command('resume')
    .description('Resume an existing session whose captain is no longer running')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        await api.resumeSession(id);
        console.log(chalk.green(`Resumed ${id}`));
        console.log(chalk.dim(`Attach with: team attach ${id}`));
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === 'SESSION_ACTIVE') {
            console.error(
              chalk.red(`Session ${id} is already running. Nothing to resume.`),
            );
          } else {
            console.error(chalk.red(err.message));
          }
        } else {
          console.error(chalk.red(`Failed to resume session ${id}`));
        }
        process.exit(1);
      }
    });
}
