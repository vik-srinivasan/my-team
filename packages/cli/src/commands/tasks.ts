import { Command } from 'commander';
import chalk from 'chalk';
import { readTeamFile } from '../session-paths.js';
import { countTasks } from './status.js';

export function tasksCommand(): Command {
  return new Command('tasks')
    .description("Pretty-print a session's .team/tasks.md with checkbox highlights")
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const raw = await readTeamFile(id, 'tasks.md');
        if (raw === null) {
          console.log(chalk.dim(`No tasks file for ${id}.`));
          return;
        }
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          console.log(chalk.dim('Tasks file is empty.'));
          return;
        }
        console.log(renderTasks(raw));
        const { done, total } = countTasks(raw);
        if (total > 0) {
          const pct = Math.round((done / total) * 100);
          console.log();
          console.log(chalk.dim(`${done} / ${total} done (${pct}%)`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to read tasks: ${message}`));
        process.exit(1);
      }
    });
}

export function renderTasks(raw: string): string {
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    out.push(renderLine(line));
  }
  return out.join('\n');
}

function renderLine(line: string): string {
  if (/^#\s+/.test(line)) return chalk.bold.cyan(line);
  if (/^##\s+/.test(line)) return chalk.bold.magenta(line);
  if (/^###\s+/.test(line)) return chalk.bold.yellow(line);

  const checked = /^(\s*[-*]\s+)\[(x|X)\](\s+.*)$/.exec(line);
  if (checked) {
    return `${checked[1]}${chalk.green('[x]')}${chalk.dim(checked[3])}`;
  }
  const unchecked = /^(\s*[-*]\s+)\[\s\](\s+.*)$/.exec(line);
  if (unchecked) {
    return `${unchecked[1]}${chalk.yellow('[ ]')}${unchecked[2]}`;
  }
  return line;
}

export const __test__ = { renderTasks };
