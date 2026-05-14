import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SessionMeta } from '@my-team/shared';
import { InvalidWorkflowConfigError, SessionNotFoundError } from '@my-team/shared';

import {
  getWorkflowConfig,
  putWorkflowConfig,
  validateWorkflowConfig,
} from './workflow-config.js';
import type { SessionLookup } from './agent-prompts.js';

interface TestEnv {
  worktreePath: string;
  sessions: SessionLookup;
  meta: SessionMeta;
  cleanupRoot: string;
}

async function makeEnv(): Promise<TestEnv> {
  const cleanupRoot = await mkdtemp(join(tmpdir(), 'my-team-workflow-'));
  const worktreePath = join(cleanupRoot, 'worktree');
  await mkdir(worktreePath, { recursive: true });

  const meta: SessionMeta = {
    id: 'test-session',
    title: 'test',
    source_repo: cleanupRoot,
    source_branch: 'main',
    session_branch: 'my-team/test-session',
    created_at: new Date().toISOString(),
  };
  const sessions: SessionLookup = {
    getSession: (id: string): { meta: SessionMeta; worktree_path: string } => {
      if (id !== 'test-session') throw new SessionNotFoundError(id);
      return { meta, worktree_path: worktreePath };
    },
  };
  return { worktreePath, sessions, meta, cleanupRoot };
}

const ENVS: string[] = [];

async function freshEnv(): Promise<TestEnv> {
  const env = await makeEnv();
  ENVS.push(env.cleanupRoot);
  return env;
}

afterEach(async () => {
  for (const root of ENVS.splice(0)) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

// ── validateWorkflowConfig ──────────────────────────────────────────

describe('validateWorkflowConfig', () => {
  it('accepts a minimal valid config and normalises duplicates', () => {
    const out = validateWorkflowConfig({
      disabled_specialists: ['designer', 'designer', 'runner'],
      forced_specialists: ['auditor'],
    });
    expect(out.disabled_specialists.sort()).toEqual(['designer', 'runner']);
    expect(out.forced_specialists).toEqual(['auditor']);
    expect(out.effort_override).toBeUndefined();
  });

  it('accepts a config with effort_override set', () => {
    const out = validateWorkflowConfig({
      disabled_specialists: [],
      forced_specialists: [],
      effort_override: 'thorough',
    });
    expect(out.effort_override).toBe('thorough');
  });

  it.each([
    ['null', null],
    ['number', 42],
    ['string', 'not-an-object'],
  ])('rejects non-object root: %s', (_label, raw) => {
    expect(() => validateWorkflowConfig(raw)).toThrow(InvalidWorkflowConfigError);
  });

  it('rejects when disabled_specialists is not an array', () => {
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: 'designer',
        forced_specialists: [],
      }),
    ).toThrow(InvalidWorkflowConfigError);
  });

  it('rejects unknown specialist names in disabled_specialists', () => {
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: ['engineer'], // always-on; not a toggleable conditional
        forced_specialists: [],
      }),
    ).toThrow(InvalidWorkflowConfigError);
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: ['gremlin'],
        forced_specialists: [],
      }),
    ).toThrow(InvalidWorkflowConfigError);
  });

  it('rejects unknown specialist names in forced_specialists', () => {
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: [],
        forced_specialists: ['tester'],
      }),
    ).toThrow(InvalidWorkflowConfigError);
  });

  it('rejects non-string entries inside the arrays', () => {
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: [42],
        forced_specialists: [],
      }),
    ).toThrow(InvalidWorkflowConfigError);
  });

  it('rejects effort_override that is not one of the allowed levels', () => {
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: [],
        forced_specialists: [],
        effort_override: 'medium',
      }),
    ).toThrow(InvalidWorkflowConfigError);
  });

  it('rejects the same specialist appearing in both lists', () => {
    expect(() =>
      validateWorkflowConfig({
        disabled_specialists: ['designer'],
        forced_specialists: ['designer'],
      }),
    ).toThrow(InvalidWorkflowConfigError);
  });

  it('allows all five conditional specialists in either list', () => {
    const all = ['designer', 'runner', 'auditor', 'documenter', 'debugger'];
    const inDisabled = validateWorkflowConfig({
      disabled_specialists: all,
      forced_specialists: [],
    });
    expect(inDisabled.disabled_specialists.sort()).toEqual([...all].sort());
    const inForced = validateWorkflowConfig({
      disabled_specialists: [],
      forced_specialists: all,
    });
    expect(inForced.forced_specialists.sort()).toEqual([...all].sort());
  });

  it('treats explicit effort_override: undefined as absent', () => {
    const out = validateWorkflowConfig({
      disabled_specialists: [],
      forced_specialists: [],
      effort_override: undefined,
    });
    expect(out.effort_override).toBeUndefined();
  });
});

// ── getWorkflowConfig ───────────────────────────────────────────────

describe('getWorkflowConfig', () => {
  it('returns defaults when workflow.json is absent', async () => {
    const env = await freshEnv();
    const config = await getWorkflowConfig(env.sessions, 'test-session');
    expect(config).toEqual({
      disabled_specialists: [],
      forced_specialists: [],
    });
  });

  it('reads + parses workflow.json when present', async () => {
    const env = await freshEnv();
    const teamDir = join(env.worktreePath, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(
      join(teamDir, 'workflow.json'),
      JSON.stringify({
        disabled_specialists: ['designer'],
        forced_specialists: ['auditor'],
        effort_override: 'light',
      }),
    );

    const config = await getWorkflowConfig(env.sessions, 'test-session');
    expect(config.disabled_specialists).toEqual(['designer']);
    expect(config.forced_specialists).toEqual(['auditor']);
    expect(config.effort_override).toBe('light');
  });

  it('throws InvalidWorkflowConfigError on malformed JSON', async () => {
    const env = await freshEnv();
    const teamDir = join(env.worktreePath, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(join(teamDir, 'workflow.json'), 'not json');
    await expect(getWorkflowConfig(env.sessions, 'test-session')).rejects.toBeInstanceOf(
      InvalidWorkflowConfigError,
    );
  });

  it('throws InvalidWorkflowConfigError on a file that parses but fails schema', async () => {
    const env = await freshEnv();
    const teamDir = join(env.worktreePath, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(
      join(teamDir, 'workflow.json'),
      JSON.stringify({
        disabled_specialists: ['engineer'], // not a conditional
        forced_specialists: [],
      }),
    );
    await expect(getWorkflowConfig(env.sessions, 'test-session')).rejects.toBeInstanceOf(
      InvalidWorkflowConfigError,
    );
  });

  it('throws SessionNotFoundError for an unknown session', async () => {
    const env = await freshEnv();
    await expect(getWorkflowConfig(env.sessions, 'nope')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });
});

// ── putWorkflowConfig ──────────────────────────────────────────────

describe('putWorkflowConfig', () => {
  it('writes the file to .team/workflow.json, creating the dir if needed', async () => {
    const env = await freshEnv();
    const saved = await putWorkflowConfig(env.sessions, 'test-session', {
      disabled_specialists: ['designer'],
      forced_specialists: [],
      effort_override: 'thorough',
    });
    expect(saved.disabled_specialists).toEqual(['designer']);
    expect(saved.effort_override).toBe('thorough');

    const onDisk = JSON.parse(
      await readFile(join(env.worktreePath, '.team', 'workflow.json'), 'utf-8'),
    );
    expect(onDisk).toEqual({
      disabled_specialists: ['designer'],
      forced_specialists: [],
      effort_override: 'thorough',
    });
  });

  it('rejects an invalid config without touching disk', async () => {
    const env = await freshEnv();
    await expect(
      putWorkflowConfig(env.sessions, 'test-session', {
        disabled_specialists: ['engineer'],
        forced_specialists: [],
      }),
    ).rejects.toBeInstanceOf(InvalidWorkflowConfigError);
    // No file should have been created.
    await expect(
      readFile(join(env.worktreePath, '.team', 'workflow.json'), 'utf-8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('round-trips: get returns what put just wrote', async () => {
    const env = await freshEnv();
    await putWorkflowConfig(env.sessions, 'test-session', {
      disabled_specialists: ['runner'],
      forced_specialists: ['auditor'],
    });
    const got = await getWorkflowConfig(env.sessions, 'test-session');
    expect(got).toEqual({
      disabled_specialists: ['runner'],
      forced_specialists: ['auditor'],
    });
  });
});
