import { Command } from 'commander';
import chalk from 'chalk';
import { readTeamFile } from '../session-paths.js';

export function planCommand(): Command {
  return new Command('plan')
    .description("Pretty-print a session's .team/plan.md with header highlights")
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      const raw = await readTeamFile(id, 'plan.md');
      if (raw === null) {
        console.log(chalk.dim(`No plan file for ${id}.`));
        return;
      }
      if (raw.trim().length === 0) {
        console.log(chalk.dim('Plan file is empty.'));
        return;
      }
      console.log(renderPlan(raw));
    });
}

export function renderPlan(raw: string): string {
  return raw
    .split('\n')
    .map(renderLine)
    .join('\n');
}

function renderLine(line: string): string {
  if (/^#\s+/.test(line)) return chalk.bold.cyan(line);
  if (/^##\s+/.test(line)) return chalk.bold.magenta(line);
  if (/^###\s+/.test(line)) return chalk.bold.yellow(line);
  if (/^####\s+/.test(line)) return chalk.bold(line);
  return line;
}

export const __test__ = { renderPlan };
