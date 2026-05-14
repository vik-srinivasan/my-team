import { dirname, basename } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

/**
 * Returns the session id that `cwd` lives inside, if any.
 *
 * A worktree path looks like `<...>/team/sessions/<id>/<...>`. We walk
 * upward from `cwd` looking for the segment whose parent is named
 * `sessions` and whose grandparent is named `team`. The child segment
 * directly under `team/sessions` is the session id.
 *
 * Returns `null` when `cwd` is not inside a my-team worktree, which is
 * the common case when running `team purge --orphans` from outside any
 * session.
 */
export function currentSessionIdFromCwd(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const parent = dirname(current);
    if (parent === current) return null; // hit filesystem root
    if (basename(parent) === 'sessions' && basename(dirname(parent)) === 'team') {
      return basename(current);
    }
    current = parent;
  }
}

export function purgeCommand(): Command {
  return new Command('purge')
    .description('Kill and clean a session (or every disk-only orphan with --orphans)')
    .argument('[id]', 'Session ID (required unless --orphans is set)')
    .option('--orphans', 'Purge every disk-only session, skipping live captains and the current session')
    .action(async (id: string | undefined, opts: { orphans?: boolean }) => {
      if (!opts.orphans && !id) {
        console.error(chalk.red('Either provide a session <id> or pass --orphans.'));
        process.exit(1);
      }

      if (opts.orphans) {
        const currentId = currentSessionIdFromCwd(process.cwd());
        const exclude = currentId ? [currentId] : [];
        try {
          const summary = await api.purgeOrphans(exclude);
          const live = summary.skipped.filter((s) => s.reason === 'live captain').length;
          const current = summary.skipped.filter((s) => s.reason === 'current session').length;
          const errors = summary.skipped.filter((s) => s.reason.startsWith('error: '));

          console.log(
            chalk.green(
              `Purged ${summary.purged.length} session${summary.purged.length === 1 ? '' : 's'}, ` +
                `skipped ${summary.skipped.length} (live: ${live}, current: ${current}, errors: ${errors.length})`,
            ),
          );
          if (errors.length > 0) {
            console.log(chalk.yellow('\nErrors:'));
            for (const e of errors) {
              console.log(`  ${chalk.red(e.id)}: ${e.reason.replace(/^error: /, '')}`);
            }
          }
        } catch (err) {
          if (err instanceof ApiError) {
            console.error(chalk.red(err.message));
          } else {
            console.error(chalk.red('Failed to purge orphans'));
          }
          process.exit(1);
        }
        return;
      }

      // Single-session purge path
      try {
        await api.killSession(id!);
        await api.cleanSession(id!);
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
