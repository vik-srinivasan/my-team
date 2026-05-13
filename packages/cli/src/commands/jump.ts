import { Command } from 'commander';
import chalk from 'chalk';
import { access } from 'node:fs/promises';
import { resolveSessionDir } from '../session-paths.js';

export function jumpCommand(): Command {
  return new Command('jump')
    .description('Print the worktree path for a session (use with: cd "$(team jump <id>)")')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      const worktree = resolveSessionDir(id);
      try {
        await access(worktree);
      } catch {
        console.error(
          chalk.red(`Session '${id}' not found. Run 'team list' to see active sessions.`),
        );
        process.exit(1);
      }
      // Bare path on stdout — no chalk. Shell evals `cd "$(team jump <id>)"`
      // and ANSI escape codes would break it.
      console.log(worktree);
    });
}
