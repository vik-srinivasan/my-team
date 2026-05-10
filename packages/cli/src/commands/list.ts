import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

function formatAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function phaseColor(phase: string): string {
  switch (phase) {
    case 'executing': return chalk.yellow(phase);
    case 'done': return chalk.green(phase);
    case 'blocked': return chalk.red(phase);
    case 'killed': return chalk.gray(phase);
    case 'planning':
    case 'awaiting_approval': return chalk.cyan(phase);
    default: return phase;
  }
}

export function listCommand(): Command {
  return new Command('list')
    .description('List all sessions')
    .action(async () => {
      try {
        const sessions = await api.listSessions();

        if (sessions.length === 0) {
          console.log(chalk.dim('No active sessions.'));
          return;
        }

        // Header
        console.log(
          chalk.bold(
            `${'ID'.padEnd(22)} ${'TITLE'.padEnd(30)} ${'PHASE'.padEnd(20)} ${'REPO'.padEnd(20)} ${'AGE'.padEnd(5)}`
          )
        );

        for (const s of sessions) {
          const repoName = s.source_repo.split('/').pop() ?? s.source_repo;
          console.log(
            `${s.id.padEnd(22)} ${s.title.slice(0, 28).padEnd(30)} ${phaseColor(s.phase).padEnd(20)} ${repoName.slice(0, 18).padEnd(20)} ${formatAge(s.created_at)}`
          );
        }
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to list sessions'));
        }
        process.exit(1);
      }
    });
}
