import { Command } from 'commander';
import chalk from 'chalk';
import { readTeamFile } from '../session-paths.js';

export function srdCommand(): Command {
  return new Command('srd')
    .description("Pretty-print a session's .team/srd.md with header highlights")
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      try {
        const raw = await readTeamFile(id, 'srd.md');
        if (raw === null) {
          console.log(chalk.dim(`No SRD file for ${id}.`));
          return;
        }
        if (raw.trim().length === 0) {
          console.log(chalk.dim('SRD file is empty.'));
          return;
        }
        console.log(renderSrd(raw));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to read SRD: ${message}`));
        process.exit(1);
      }
    });
}

export function renderSrd(raw: string): string {
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

export const __test__ = { renderSrd };
