import { Command } from 'commander';
import chalk from 'chalk';
import { readRegistry } from '@viktown/shared';

function formatRelative(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return `${s.slice(0, len - 1)}…`;
}

export function listPastCommand(): Command {
  return new Command('list-past')
    .description('List past source repos used to start sessions')
    .option('--json', 'Output JSON instead of a table')
    .action(async (options: { json?: boolean }) => {
      try {
        const overridePath = process.env['VIKTOWN_REGISTRY_PATH'];
        const registry = await readRegistry(overridePath);

        if (options.json) {
          process.stdout.write(`${JSON.stringify(registry.repos, null, 2)}\n`);
          return;
        }

        if (registry.repos.length === 0) {
          process.stdout.write(
            `${chalk.dim('No past sessions yet. Run `team new <title>` inside a repo to start one.')}\n`,
          );
          return;
        }

        const header = chalk.bold(
          `${'BASENAME'.padEnd(20)} ${'PATH'.padEnd(50)} ${'LAST USED'.padEnd(14)} ${'COUNT'.padEnd(5)}`,
        );
        process.stdout.write(`${header}\n`);

        for (const repo of registry.repos) {
          const basename = truncate(repo.basename, 18).padEnd(20);
          const path = truncate(repo.path, 48).padEnd(50);
          const lastUsed = formatRelative(repo.last_used).padEnd(14);
          const count = String(repo.session_count).padEnd(5);
          process.stdout.write(`${basename} ${path} ${lastUsed} ${count}\n`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(chalk.red(`Failed to read recents registry: ${message}`));
        process.exit(1);
      }
    });
}
