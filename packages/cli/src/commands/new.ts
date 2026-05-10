import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveShortcut, EmptyProjectInitError } from '@my-team/shared';
import { api, ApiError } from '../api-client.js';

interface NewOptions {
  attach: boolean;
  new?: boolean;
  github?: boolean;
  public?: boolean;
}

function detectCwdRepo(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
}

async function bootstrapProject(name: string, withGitHub: boolean, isPublic: boolean): Promise<string> {
  const targetDir = resolve(process.cwd(), name);

  if (existsSync(targetDir)) {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new EmptyProjectInitError(
        `Directory ${targetDir} already exists and is not empty. Refusing to overwrite.`,
      );
    }
  } else {
    await mkdir(targetDir, { recursive: true });
  }

  try {
    execSync('git init -b main', { cwd: targetDir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: targetDir, stdio: 'pipe' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EmptyProjectInitError(`git init/commit failed in ${targetDir}: ${message}`);
  }

  if (withGitHub) {
    const visibility = isPublic ? '--public' : '--private';
    const result = spawnSync(
      'gh',
      ['repo', 'create', name, '--source=.', '--remote=origin', '--push', visibility],
      { cwd: targetDir, stdio: 'inherit', shell: false },
    );
    if (result.error) {
      throw new EmptyProjectInitError(`gh repo create failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new EmptyProjectInitError(`gh repo create failed with exit code ${result.status}`);
    }
  }

  return targetDir;
}

export function newCommand(): Command {
  return new Command('new')
    .description('Create a new session for a repo (current dir, a known basename, or a fresh project)')
    .argument('<arg1>', 'Session title, source-repo basename shortcut, or new project name')
    .argument('[arg2]', 'Session title when arg1 is a shortcut or --new project name')
    .option('--no-attach', 'Do not attach to the session after creation')
    .option('--new', 'Bootstrap a brand-new project at ./<arg1> (git init + initial commit)')
    .option('--github', 'When used with --new, also create a GitHub repo and push')
    .option('--public', 'When used with --github, create a public repo (default: private)')
    .action(async (arg1: string, arg2: string | undefined, options: NewOptions) => {
      let sourceRepo: string;
      let title: string;

      if (options.new) {
        // Bootstrap path: arg1 is the project name, arg2 (if present) is the session title.
        const spinner = ora(`Bootstrapping ${arg1}/...`).start();
        try {
          sourceRepo = await bootstrapProject(arg1, options.github === true, options.public === true);
          spinner.succeed(chalk.green(`Bootstrapped ${chalk.bold(sourceRepo)}`));
        } catch (err) {
          spinner.fail(chalk.red(err instanceof Error ? err.message : 'Bootstrap failed'));
          process.exit(1);
        }
        title = arg2 ?? arg1;
      } else if (arg2 !== undefined) {
        // Shortcut form: arg1 is a basename, arg2 is the title.
        const registryPath = process.env['VIKTOWN_REGISTRY_PATH'];
        const resolution = await resolveShortcut(arg1, registryPath).catch(() => ({ kind: 'none' as const }));
        if (resolution.kind === 'one') {
          sourceRepo = resolution.path;
          title = arg2;
        } else if (resolution.kind === 'ambiguous') {
          console.error(
            chalk.red(`Shortcut '${arg1}' is ambiguous. Be more specific (use the full path):`),
          );
          for (const candidate of resolution.candidates) {
            console.error(chalk.red(`  ${candidate}`));
          }
          process.exit(1);
        } else {
          // No match — fall back to single-arg behaviour and warn.
          console.error(
            chalk.dim(`No past repo named '${arg1}' — treating as session title and using cwd.`),
          );
          try {
            sourceRepo = detectCwdRepo();
          } catch {
            console.error(chalk.red('Error: Not inside a git repository.'));
            process.exit(1);
          }
          title = arg1;
        }
      } else {
        // Single-arg legacy form: arg1 is the title, cwd must be a git repo.
        try {
          sourceRepo = detectCwdRepo();
        } catch {
          console.error(chalk.red('Error: Not inside a git repository.'));
          process.exit(1);
        }
        title = arg1;
      }

      const spinner = ora('Creating session...').start();

      try {
        const cols = process.stdout.isTTY ? process.stdout.columns : undefined;
        const rows = process.stdout.isTTY ? process.stdout.rows : undefined;
        const session = await api.createSession(sourceRepo, title, cols, rows);
        spinner.succeed(chalk.green(`Session created: ${chalk.bold(session.id)}`));
        console.log(`  Title:    ${session.title}`);
        console.log(`  Repo:     ${sourceRepo}`);
        console.log(`  Worktree: ${session.worktree_path}`);
        console.log(`  Phase:    ${session.phase}`);

        if (options.attach) {
          console.log(chalk.dim('\nAttaching to session... (Ctrl+] to detach)'));
          // Dynamic import to avoid loading ws unless needed
          const { attachToSession } = await import('./attach.js');
          await attachToSession(session.id);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red('Failed to create session'));
        }
        process.exit(1);
      }
    });
}
