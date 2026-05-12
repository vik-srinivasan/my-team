import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionMeta } from '@my-team/shared';
import { resolveSessionDir } from '../session-paths.js';

export function diffCommand(): Command {
  return new Command('diff')
    .description("Show a session's diff vs its source branch (piped through $PAGER)")
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      const worktree = resolveSessionDir(id);
      try {
        await access(worktree);
      } catch {
        console.error(chalk.red(`Worktree for ${id} not found at ${worktree}`));
        process.exit(1);
      }

      let meta: SessionMeta;
      try {
        const raw = await readFile(join(worktree, '.team', 'meta.json'), 'utf8');
        meta = JSON.parse(raw) as SessionMeta;
      } catch {
        console.error(chalk.red(`Could not read .team/meta.json for ${id}.`));
        process.exit(1);
      }

      const base = meta.source_branch;
      // Use git's `--` separator-friendly arg form. spawn with an array
      // means no shell interpolation, so the worktree path is safe even
      // if it ever contained spaces or shell metacharacters.
      const args = ['-C', worktree, 'diff', '--color=always', `${base}...HEAD`];

      await runWithPager('git', args);
    });
}

async function runWithPager(cmd: string, args: string[]): Promise<void> {
  const useTty = process.stdout.isTTY;
  if (!useTty) {
    // No pager when stdout is piped — just stream git output through.
    await runStreaming(cmd, args, process.stdout);
    return;
  }

  const pagerEnv = process.env.PAGER?.trim();
  const pager = pagerEnv && pagerEnv.length > 0 ? pagerEnv : 'less -R';
  const [pagerCmd, ...pagerArgs] = pager.split(/\s+/);

  const git = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
  const pagerProc = spawn(pagerCmd, pagerArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

  git.stdout.pipe(pagerProc.stdin);

  git.on('error', (err) => {
    console.error(chalk.red(`Failed to run git: ${err.message}`));
  });
  pagerProc.on('error', (err) => {
    console.error(chalk.red(`Failed to run pager '${pager}': ${err.message}`));
  });

  await new Promise<void>((resolve) => {
    let pagerDone = false;
    let gitDone = false;
    const check = (): void => {
      if (pagerDone && gitDone) resolve();
    };
    git.on('close', () => {
      gitDone = true;
      check();
    });
    pagerProc.on('close', () => {
      pagerDone = true;
      check();
    });
  });
}

async function runStreaming(cmd: string, args: string[], out: NodeJS.WritableStream): Promise<void> {
  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
  proc.stdout.pipe(out, { end: false });
  await new Promise<void>((resolve) => proc.on('close', () => resolve()));
}
