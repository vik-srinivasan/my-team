import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pino from 'pino';
import {
  SessionActiveError,
  SessionCorruptError,
  SessionNotFoundError,
} from '@my-team/shared';

import { buildCaptainSettings, healedPhaseFor, SessionManager } from './session-manager.js';

// Mock claude process so tests don't actually spawn claude (mirrors server.test.ts).
vi.mock('./claude-process.js', async () => {
  const { EventEmitter } = await import('node:events');

  class MockCaptainProcess extends EventEmitter {
    pid = 99999;
    running = true;

    write = vi.fn();
    kill = vi.fn(() => {
      this.running = false;
    });
    resize = vi.fn();
  }

  return {
    CaptainProcess: MockCaptainProcess,
    spawnCaptain: vi.fn(async () => new MockCaptainProcess()),
  };
});

describe('buildCaptainSettings', () => {
  const PATHS = {
    clearMustAskHookPath: '/abs/path/to/agent-prompts/hooks/clear-must-ask.sh',
    stopHookPath: '/abs/path/to/agent-prompts/hooks/mark-must-ask.sh',
    askQuestionHookPath:
      '/abs/path/to/agent-prompts/hooks/mark-must-ask-on-question.sh',
  } as const;

  it('writes the UserPromptSubmit, Stop, and PreToolUse hooks in the shape Claude Code expects', () => {
    const settings = buildCaptainSettings(PATHS);

    expect(settings).toEqual({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: PATHS.clearMustAskHookPath,
              },
            ],
          },
        ],
        Stop: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: PATHS.stopHookPath,
              },
            ],
          },
        ],
        PreToolUse: [
          {
            matcher: 'AskUserQuestion',
            hooks: [
              {
                type: 'command',
                command: PATHS.askQuestionHookPath,
              },
            ],
          },
        ],
      },
    });
  });

  it('uses the exact absolute paths it was given (no relative resolution)', () => {
    // Regression guard: the captain may chdir, so a relative hook path would
    // silently fail. The wrapper resolves the paths against its install root
    // and hands them in pre-resolved — buildCaptainSettings must not mangle them.
    const paths = {
      clearMustAskHookPath:
        '/Users/example/my-team/agent-prompts/hooks/clear-must-ask.sh',
      stopHookPath: '/Users/example/my-team/agent-prompts/hooks/mark-must-ask.sh',
      askQuestionHookPath:
        '/Users/example/my-team/agent-prompts/hooks/mark-must-ask-on-question.sh',
    };
    const settings = buildCaptainSettings(paths);

    const hooks = settings['hooks'] as {
      UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>;
      Stop: Array<{ hooks: Array<{ command: string }> }>;
      PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
    };
    expect(hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(
      paths.clearMustAskHookPath,
    );
    expect(hooks.Stop[0]?.hooks[0]?.command).toBe(paths.stopHookPath);
    expect(hooks.PreToolUse[0]?.matcher).toBe('AskUserQuestion');
    expect(hooks.PreToolUse[0]?.hooks[0]?.command).toBe(
      paths.askQuestionHookPath,
    );
  });

  it('registers all three hook keys (UserPromptSubmit, Stop, PreToolUse)', () => {
    // The Stop hook is the safety net for end-of-turn AT signalling, the
    // PreToolUse hook covers AskUserQuestion (the Stop hook can't fire
    // mid-call); all three must be present, none replaces the others.
    const settings = buildCaptainSettings(PATHS);
    const hooks = settings['hooks'] as Record<string, unknown>;
    expect(Object.keys(hooks).sort()).toEqual([
      'PreToolUse',
      'Stop',
      'UserPromptSubmit',
    ]);
  });

  it('produces JSON that survives a round-trip through JSON.stringify', () => {
    // The wrapper writes this verbatim to .claude/settings.json. Make sure
    // it's plain JSON-serialisable (no functions, no symbols, no undefined).
    const serialised = JSON.stringify(buildCaptainSettings(PATHS));
    const parsed = JSON.parse(serialised);

    expect(parsed).toEqual(buildCaptainSettings(PATHS));
  });
});

describe('healedPhaseFor', () => {
  it('returns null when phase is not awaiting_approval', () => {
    // No matter the specialist, healing only kicks in for the stale
    // awaiting_approval pattern.
    expect(
      healedPhaseFor({ phase: 'executing', active_specialist: 'engineer' }),
    ).toBeNull();
    expect(
      healedPhaseFor({ phase: 'reviewing', active_specialist: 'reviewer' }),
    ).toBeNull();
    expect(
      healedPhaseFor({ phase: 'done', active_specialist: null }),
    ).toBeNull();
    expect(
      healedPhaseFor({ phase: 'blocked', active_specialist: 'engineer' }),
    ).toBeNull();
  });

  it('returns null when active_specialist is null or not a real specialist', () => {
    // awaiting_approval is the captain's legitimate idle state when no
    // specialist owns the next move — don't heal that.
    expect(
      healedPhaseFor({ phase: 'awaiting_approval', active_specialist: null }),
    ).toBeNull();
    expect(
      healedPhaseFor({ phase: 'awaiting_approval', active_specialist: '' }),
    ).toBeNull();
    expect(
      healedPhaseFor({ phase: 'awaiting_approval', active_specialist: 'captain' }),
    ).toBeNull();
  });

  it('maps engineer to executing', () => {
    expect(
      healedPhaseFor({
        phase: 'awaiting_approval',
        active_specialist: 'engineer',
      }),
    ).toBe('executing');
  });

  it('maps tester/reviewer/tester+reviewer to reviewing', () => {
    expect(
      healedPhaseFor({
        phase: 'awaiting_approval',
        active_specialist: 'tester',
      }),
    ).toBe('reviewing');
    expect(
      healedPhaseFor({
        phase: 'awaiting_approval',
        active_specialist: 'reviewer',
      }),
    ).toBe('reviewing');
    expect(
      healedPhaseFor({
        phase: 'awaiting_approval',
        active_specialist: 'tester+reviewer',
      }),
    ).toBe('reviewing');
  });

  it('maps scout to scouting', () => {
    expect(
      healedPhaseFor({
        phase: 'awaiting_approval',
        active_specialist: 'scout',
      }),
    ).toBe('scouting');
  });
});

describe('refreshStateFromDisk auto-heal integration', () => {
  let tempRepo: string;
  let sessionsRootDir: string;
  let sessionManager: SessionManager;
  let captainPromptPath: string;
  let clearMustAskHookPath: string;
  let stopHookPath: string;
  let askQuestionHookPath: string;

  beforeAll(async () => {
    tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'sm-heal-test-')));
    execSync('git init', { cwd: tempRepo });
    execSync('git checkout -b main', { cwd: tempRepo });
    execSync('echo "hello" > test.txt', { cwd: tempRepo });
    execSync('git add .', { cwd: tempRepo });
    execSync('git commit -m "init"', { cwd: tempRepo });

    captainPromptPath = join(tempRepo, 'captain.md');
    execSync(`echo "# Captain" > "${captainPromptPath}"`, { cwd: tempRepo });
    clearMustAskHookPath = join(tempRepo, 'clear-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${clearMustAskHookPath}"`, { cwd: tempRepo });
    stopHookPath = join(tempRepo, 'mark-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${stopHookPath}"`, { cwd: tempRepo });
    askQuestionHookPath = join(tempRepo, 'mark-must-ask-on-question.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${askQuestionHookPath}"`, { cwd: tempRepo });

    // Isolate sessions root so we don't pollute / collide with the user's
    // real ~/team/sessions/. Must be set before SessionManager.createSession
    // runs (worktree paths are resolved from this env var).
    sessionsRootDir = await mkdtemp(join(tmpdir(), 'sm-heal-sessions-'));
    process.env['MY_TEAM_SESSIONS_DIR'] = sessionsRootDir;
  });

  afterAll(async () => {
    await sessionManager.shutdownAll();
    await rm(tempRepo, { recursive: true, force: true });
    await rm(sessionsRootDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_SESSIONS_DIR'];
  });

  it('auto-heals stale awaiting_approval+engineer on listSessions, persists to disk, and logs warn', async () => {
    // Create a real logger with a spy on warn so we can assert the heal log fires.
    const warnSpy = vi.fn();
    const log = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: 'silent',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Isolate the recents registry so this test doesn't touch the real one.
    const registryDir = await mkdtemp(join(tmpdir(), 'sm-heal-registry-'));
    const registryPath = join(registryDir, 'recents.json');
    const origEnv = process.env['MY_TEAM_REGISTRY_PATH'];
    process.env['MY_TEAM_REGISTRY_PATH'] = registryPath;

    try {
      sessionManager = new SessionManager(
        log,
        captainPromptPath,
        clearMustAskHookPath,
        stopHookPath,
        askQuestionHookPath,
      );

      // Create a real session (captain is mocked to be a no-op).
      const session = await sessionManager.createSession(tempRepo, 'Heal Test');
      const worktreePath = session.worktree_path;
      const sessionId = session.meta.id;

      // Write stale state.json: phase=awaiting_approval + active_specialist=engineer.
      const stateFile = join(worktreePath, '.team', 'state.json');
      const staleState = {
        phase: 'awaiting_approval',
        active_specialist: 'engineer',
        review_iterations: 0,
        max_review_iterations: 8,
        last_checkpoint: '2026-05-12T00:00:00.000Z',
        blockers: [],
        must_ask_pending: [],
      };
      await writeFile(stateFile, JSON.stringify(staleState, null, 2));

      // listSessions() calls refreshStateFromDisk() on every managed session.
      const summaries = await sessionManager.listSessions();
      const row = summaries.find((s) => s.id === sessionId);

      // In-memory state reported by listSessions must show the healed phase.
      expect(row?.phase).toBe('executing');

      // The stale state.json on disk must have been rewritten with the healed phase.
      const onDisk = JSON.parse(await readFile(stateFile, 'utf-8')) as { phase: string };
      expect(onDisk.phase).toBe('executing');

      // The warn logger must have been called with the heal context.
      expect(warnSpy).toHaveBeenCalled();
      const warnCall = warnSpy.mock.calls.find(
        (args: unknown[]) => typeof args[1] === 'string' && (args[1] as string).includes('stale'),
      ) ?? warnSpy.mock.calls[0];
      expect(warnCall).toBeTruthy();
      // The first arg is the object with context; assert key fields.
      const warnCtx = warnCall[0] as { from?: string; to?: string; specialist?: string };
      expect(warnCtx.from).toBe('awaiting_approval');
      expect(warnCtx.to).toBe('executing');
      expect(warnCtx.specialist).toBe('engineer');

      // Clean up session worktree
      await sessionManager.killSession(sessionId);
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
      } catch {
        // best effort
      }
    } finally {
      if (origEnv !== undefined) {
        process.env['MY_TEAM_REGISTRY_PATH'] = origEnv;
      } else {
        delete process.env['MY_TEAM_REGISTRY_PATH'];
      }
      await rm(registryDir, { recursive: true, force: true });
    }
  });
});

// ── listSessions disk-merge + resumeSession ─────────────────────────
//
// These tests share a temp sessions root + temp git repo set up before
// each test. The SessionManager is constructed fresh per test for full
// isolation. spawnCaptain is mocked at the module boundary (see top of
// file).

describe('SessionManager — listSessions disk-merge + resumeSession', () => {
  let tempRepo: string;
  let sessionsRootDir: string;
  let registryDir: string;
  let captainPromptPath: string;
  let clearMustAskHookPath: string;
  let stopHookPath: string;
  let askQuestionHookPath: string;
  let manager: SessionManager;

  beforeAll(async () => {
    tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'sm-resume-test-')));
    execSync('git init', { cwd: tempRepo });
    execSync('git checkout -b main', { cwd: tempRepo });
    execSync('echo "hello" > test.txt', { cwd: tempRepo });
    execSync('git add .', { cwd: tempRepo });
    execSync('git commit -m "init"', { cwd: tempRepo });

    captainPromptPath = join(tempRepo, 'captain.md');
    execSync(`echo "# Captain" > "${captainPromptPath}"`, { cwd: tempRepo });
    clearMustAskHookPath = join(tempRepo, 'clear-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${clearMustAskHookPath}"`, { cwd: tempRepo });
    stopHookPath = join(tempRepo, 'mark-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${stopHookPath}"`, { cwd: tempRepo });
    askQuestionHookPath = join(tempRepo, 'mark-must-ask-on-question.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${askQuestionHookPath}"`, { cwd: tempRepo });

    registryDir = await mkdtemp(join(tmpdir(), 'sm-resume-registry-'));
    process.env['MY_TEAM_REGISTRY_PATH'] = join(registryDir, 'recents.json');
  });

  beforeEach(async () => {
    // Fresh temp sessions root per test — guarantees the disk-merge sees
    // exactly the worktrees this test creates.
    sessionsRootDir = await mkdtemp(join(tmpdir(), 'sm-resume-sessions-'));
    process.env['MY_TEAM_SESSIONS_DIR'] = sessionsRootDir;

    const log = pino({ level: 'silent' });
    manager = new SessionManager(
      log,
      captainPromptPath,
      clearMustAskHookPath,
      stopHookPath,
      askQuestionHookPath,
    );
  });

  afterEach(async () => {
    await manager.shutdownAll();
    await rm(sessionsRootDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_SESSIONS_DIR'];
  });

  afterAll(async () => {
    await rm(tempRepo, { recursive: true, force: true });
    await rm(registryDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_REGISTRY_PATH'];
  });

  /**
   * Writes a fake orphan session worktree directly to the temp sessions
   * root (no real git worktree), so the disk-merge test doesn't need the
   * full createWorktree path. Returns the synthetic worktreePath.
   */
  async function writeOrphan(
    id: string,
    overrides: {
      phase?: string;
      title?: string;
      mustAsk?: string[];
      lastCheckpoint?: string;
    } = {},
  ): Promise<string> {
    const worktreePath = join(sessionsRootDir, id);
    const teamDir = join(worktreePath, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(
      join(teamDir, 'meta.json'),
      JSON.stringify(
        {
          id,
          title: overrides.title ?? `Orphan ${id}`,
          source_repo: tempRepo,
          source_branch: 'main',
          session_branch: `my-team/${id}`,
          created_at: '2026-05-12T10:00:00.000Z',
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(teamDir, 'state.json'),
      JSON.stringify(
        {
          phase: overrides.phase ?? 'executing',
          active_specialist: null,
          review_iterations: 0,
          max_review_iterations: 8,
          last_checkpoint: overrides.lastCheckpoint ?? '2026-05-12T10:30:00.000Z',
          blockers: [],
          must_ask_pending: overrides.mustAsk ?? [],
        },
        null,
        2,
      ),
    );
    await writeFile(join(teamDir, 'journal.md'), '');
    return worktreePath;
  }

  describe('listSessions disk-merge', () => {
    it('merges disk-only orphan sessions with in-memory sessions', async () => {
      // One orphan on disk, no live captain in memory.
      await writeOrphan('orphan-alpha-1', { phase: 'blocked', title: 'Alpha' });

      const summaries = await manager.listSessions();
      const orphan = summaries.find((s) => s.id === 'orphan-alpha-1');

      expect(orphan).toBeDefined();
      expect(orphan?.title).toBe('Alpha');
      expect(orphan?.phase).toBe('blocked');
      expect(orphan?.source_repo).toBe(tempRepo);
      expect(orphan?.must_ask_count).toBe(0);
    });

    it('emits the disk-side last_checkpoint and must_ask_count', async () => {
      await writeOrphan('orphan-beta-2', {
        lastCheckpoint: '2026-05-12T11:11:11.000Z',
        mustAsk: ['Q1', 'Q2', 'Q3'],
      });

      const summaries = await manager.listSessions();
      const row = summaries.find((s) => s.id === 'orphan-beta-2');

      expect(row?.last_checkpoint).toBe('2026-05-12T11:11:11.000Z');
      expect(row?.must_ask_count).toBe(3);
    });

    it('skips silently when meta.json is missing or unreadable', async () => {
      // Worktree dir + .team/ but no meta.json.
      const id = 'corrupt-no-meta-3';
      const teamDir = join(sessionsRootDir, id, '.team');
      await mkdir(teamDir, { recursive: true });
      await writeFile(
        join(teamDir, 'state.json'),
        JSON.stringify({
          phase: 'executing',
          active_specialist: null,
          review_iterations: 0,
          max_review_iterations: 8,
          last_checkpoint: '2026-05-12T10:00:00.000Z',
          blockers: [],
          must_ask_pending: [],
        }),
      );

      const summaries = await manager.listSessions();
      expect(summaries.find((s) => s.id === id)).toBeUndefined();
    });

    it('skips silently when state.json contains invalid JSON', async () => {
      const id = 'corrupt-bad-state-4';
      const teamDir = join(sessionsRootDir, id, '.team');
      await mkdir(teamDir, { recursive: true });
      await writeFile(
        join(teamDir, 'meta.json'),
        JSON.stringify({
          id,
          title: 't',
          source_repo: tempRepo,
          source_branch: 'main',
          session_branch: `my-team/${id}`,
          created_at: '2026-05-12T10:00:00.000Z',
        }),
      );
      await writeFile(join(teamDir, 'state.json'), '{not valid json');

      const summaries = await manager.listSessions();
      expect(summaries.find((s) => s.id === id)).toBeUndefined();
    });

    it('returns an empty list when the sessions dir does not exist', async () => {
      // Point env var at a path that doesn't exist.
      process.env['MY_TEAM_SESSIONS_DIR'] = join(sessionsRootDir, 'does-not-exist');
      const summaries = await manager.listSessions();
      expect(summaries).toEqual([]);
    });
  });

  describe('resumeSession', () => {
    it('happy path: spawns captain, writes journal entry, returns Session', async () => {
      const id = 'orphan-resume-5';
      const worktreePath = await writeOrphan(id, { phase: 'reviewing' });

      const session = await manager.resumeSession(id);

      // Returned session matches the on-disk meta + state.
      expect(session.meta.id).toBe(id);
      expect(session.meta.title).toBe(`Orphan ${id}`);
      expect(session.state.phase).toBe('reviewing');
      expect(session.worktree_path).toBe(worktreePath);
      expect(session.pid).not.toBeNull();

      // Journal got the resume entry.
      const journal = await readFile(join(worktreePath, '.team', 'journal.md'), 'utf-8');
      expect(journal).toContain('Session resumed.');
      expect(journal).toContain('— wrapper');

      // After resume, listSessions surfaces it as in-memory (not disk-only).
      const summaries = await manager.listSessions();
      const row = summaries.find((s) => s.id === id);
      expect(row).toBeDefined();
      expect(row?.phase).toBe('reviewing');

      // `.claude/settings.json` was rewritten (hooks installed).
      const settings = JSON.parse(
        await readFile(join(worktreePath, '.claude', 'settings.json'), 'utf-8'),
      ) as { hooks: Record<string, unknown> };
      expect(settings.hooks).toBeDefined();
      expect(Object.keys(settings.hooks).sort()).toEqual([
        'PreToolUse',
        'Stop',
        'UserPromptSubmit',
      ]);
    });

    it('appends the journal entry BEFORE spawning the captain', async () => {
      // Sequencing contract: the captain reads its journal on startup, so
      // the entry must be present before spawn returns.
      const id = 'orphan-resume-order-6';
      const worktreePath = await writeOrphan(id);

      // Reorder via a spawnCaptain spy: snapshot the journal contents
      // inside the mock, then assert the snapshot already contains the
      // resume entry.
      const mod = await import('./claude-process.js');
      const spawn = vi.mocked(mod.spawnCaptain);
      let journalAtSpawn = '';
      spawn.mockImplementationOnce(async () => {
        journalAtSpawn = await readFile(
          join(worktreePath, '.team', 'journal.md'),
          'utf-8',
        );
        const { EventEmitter } = await import('node:events');
        class P extends EventEmitter {
          pid = 12345;
          running = true;
          write = vi.fn();
          kill = vi.fn();
          resize = vi.fn();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new P() as any;
      });

      await manager.resumeSession(id);

      expect(journalAtSpawn).toContain('Session resumed.');
    });

    it('throws SessionActiveError when captain is already running', async () => {
      // Create a live session first (captain mocked = always running).
      const live = await manager.createSession(tempRepo, 'Live Resume Test');
      const id = live.meta.id;

      await expect(manager.resumeSession(id)).rejects.toBeInstanceOf(SessionActiveError);
    });

    it('throws SessionNotFoundError when worktree directory is absent', async () => {
      await expect(
        manager.resumeSession('does-not-exist-7'),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it('throws SessionCorruptError when meta.json is missing', async () => {
      // Worktree exists but meta.json is absent.
      const id = 'corrupt-no-meta-8';
      const teamDir = join(sessionsRootDir, id, '.team');
      await mkdir(teamDir, { recursive: true });
      await writeFile(
        join(teamDir, 'state.json'),
        JSON.stringify({
          phase: 'executing',
          active_specialist: null,
          review_iterations: 0,
          max_review_iterations: 8,
          last_checkpoint: '2026-05-12T10:00:00.000Z',
          blockers: [],
          must_ask_pending: [],
        }),
      );

      await expect(manager.resumeSession(id)).rejects.toBeInstanceOf(SessionCorruptError);
      await expect(manager.resumeSession(id)).rejects.toMatchObject({
        code: 'SESSION_CORRUPT',
      });
    });

    it('throws SessionCorruptError when meta.json contains invalid JSON', async () => {
      const id = 'corrupt-bad-meta-9';
      const teamDir = join(sessionsRootDir, id, '.team');
      await mkdir(teamDir, { recursive: true });
      await writeFile(join(teamDir, 'meta.json'), '{not valid json');
      await writeFile(
        join(teamDir, 'state.json'),
        JSON.stringify({
          phase: 'executing',
          active_specialist: null,
          review_iterations: 0,
          max_review_iterations: 8,
          last_checkpoint: '2026-05-12T10:00:00.000Z',
          blockers: [],
          must_ask_pending: [],
        }),
      );

      await expect(manager.resumeSession(id)).rejects.toBeInstanceOf(SessionCorruptError);
    });

    it('allows resume when prior in-memory entry exists but captain is no longer running (e.g. killed)', async () => {
      // Create + kill a session — entry stays in the Map with captain=null.
      const live = await manager.createSession(tempRepo, 'Kill-then-Resume');
      const id = live.meta.id;
      await manager.killSession(id);

      // Resume must succeed (no SessionActiveError) since captain.running is false.
      const resumed = await manager.resumeSession(id);
      expect(resumed.meta.id).toBe(id);
      expect(resumed.pid).not.toBeNull();
    });
  });
});

// ── Disk-only orphan session operations ─────────────────────────────────────
//
// Tests for killSession / cleanSession / purgeOrphans on sessions that exist
// only on disk (no in-memory Map entry). These exercises the hydrateFromDisk
// fallback path added in commit 63e793a.

describe('SessionManager — disk-only orphan kill/clean/purgeOrphans', () => {
  let tempRepo: string;
  let sessionsRootDir: string;
  let archivesRootDir: string;
  let registryDir: string;
  let captainPromptPath: string;
  let clearMustAskHookPath: string;
  let stopHookPath: string;
  let askQuestionHookPath: string;
  let manager: SessionManager;

  beforeAll(async () => {
    tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'sm-orphan-test-')));
    execSync('git init', { cwd: tempRepo });
    execSync('git checkout -b main', { cwd: tempRepo });
    execSync('echo "hello" > test.txt', { cwd: tempRepo });
    execSync('git add .', { cwd: tempRepo });
    execSync('git commit -m "init"', { cwd: tempRepo });

    captainPromptPath = join(tempRepo, 'captain.md');
    execSync(`echo "# Captain" > "${captainPromptPath}"`, { cwd: tempRepo });
    clearMustAskHookPath = join(tempRepo, 'clear-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${clearMustAskHookPath}"`, { cwd: tempRepo });
    stopHookPath = join(tempRepo, 'mark-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${stopHookPath}"`, { cwd: tempRepo });
    askQuestionHookPath = join(tempRepo, 'mark-must-ask-on-question.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${askQuestionHookPath}"`, { cwd: tempRepo });

    registryDir = await mkdtemp(join(tmpdir(), 'sm-orphan-registry-'));
    process.env['MY_TEAM_REGISTRY_PATH'] = join(registryDir, 'recents.json');
  });

  beforeEach(async () => {
    // Fresh temp sessions + archives root per test.
    sessionsRootDir = await mkdtemp(join(tmpdir(), 'sm-orphan-sessions-'));
    archivesRootDir = await mkdtemp(join(tmpdir(), 'sm-orphan-archives-'));
    process.env['MY_TEAM_SESSIONS_DIR'] = sessionsRootDir;
    process.env['MY_TEAM_ARCHIVES_DIR'] = archivesRootDir;

    const log = pino({ level: 'silent' });
    manager = new SessionManager(
      log,
      captainPromptPath,
      clearMustAskHookPath,
      stopHookPath,
      askQuestionHookPath,
    );
  });

  afterEach(async () => {
    await manager.shutdownAll();
    await rm(sessionsRootDir, { recursive: true, force: true });
    await rm(archivesRootDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_SESSIONS_DIR'];
    delete process.env['MY_TEAM_ARCHIVES_DIR'];
  });

  afterAll(async () => {
    await rm(tempRepo, { recursive: true, force: true });
    await rm(registryDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_REGISTRY_PATH'];
  });

  /**
   * Writes a minimal disk-only orphan session (no real git worktree) into the
   * temp sessions root. Returns the worktree path.
   *
   * When `deletedSourceRepo` is true, a temporary git repo is created and then
   * immediately deleted so that cleanSession exercises the NotAGitRepoError
   * fallback path (fs.rm). When false (the default), tempRepo is used as the
   * source_repo, but note that `cleanSession` will throw WorktreeError on such
   * orphans until the WorktreeError fallback bug is fixed — use
   * `deletedSourceRepo: true` for any test that calls cleanSession.
   */
  async function writeDiskOrphan(
    id: string,
    opts: { phase?: string; sourceRepo?: string; deletedSourceRepo?: boolean } = {},
  ): Promise<string> {
    let sourceRepo = opts.sourceRepo ?? tempRepo;

    if (opts.deletedSourceRepo) {
      // Create a throwaway git repo and immediately delete it so
      // resolveRepoRoot will throw NotAGitRepoError for this orphan.
      const throwaway = await realpath(await mkdtemp(join(tmpdir(), 'sm-throwaway-')));
      execSync('git init', { cwd: throwaway });
      execSync('git checkout -b main', { cwd: throwaway });
      execSync('echo "x" > x.txt', { cwd: throwaway });
      execSync('git add .', { cwd: throwaway });
      execSync('git commit -m "init"', { cwd: throwaway });
      sourceRepo = throwaway;
      // Delete it so the source_repo reference in meta.json is dead.
      await rm(throwaway, { recursive: true, force: true });
    }

    const worktreePath = join(sessionsRootDir, id);
    const teamDir = join(worktreePath, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(
      join(teamDir, 'meta.json'),
      JSON.stringify({
        id,
        title: `Disk Orphan ${id}`,
        source_repo: sourceRepo,
        source_branch: 'main',
        session_branch: `my-team/${id}`,
        created_at: '2026-05-12T10:00:00.000Z',
      }, null, 2),
    );
    await writeFile(
      join(teamDir, 'state.json'),
      JSON.stringify({
        phase: opts.phase ?? 'executing',
        active_specialist: null,
        review_iterations: 0,
        max_review_iterations: 8,
        last_checkpoint: '2026-05-12T10:30:00.000Z',
        blockers: [],
        must_ask_pending: [],
      }, null, 2),
    );
    await writeFile(join(teamDir, 'journal.md'), '');
    return worktreePath;
  }

  // ── killSession on disk-only ─────────────────────────────────────────────

  it('killSession on a disk-only session does NOT throw and writes phase=killed to state.json', async () => {
    const id = 'disk-kill-1';
    // killSession only reads state.json/meta.json and writes to .team/ — it
    // does NOT call removeWorktree so using tempRepo as source_repo is fine.
    const worktreePath = await writeDiskOrphan(id, { phase: 'executing' });

    // No in-memory entry — purely disk-only.
    await expect(manager.killSession(id)).resolves.toBeUndefined();

    // state.json on disk must now show phase='killed'.
    const state = JSON.parse(
      await readFile(join(worktreePath, '.team', 'state.json'), 'utf-8'),
    ) as { phase: string };
    expect(state.phase).toBe('killed');
  });

  it('killSession on a disk-only session appends a journal entry', async () => {
    const id = 'disk-kill-journal-2';
    // Same: killSession never calls removeWorktree, so tempRepo is fine.
    const worktreePath = await writeDiskOrphan(id);

    await manager.killSession(id);

    const journal = await readFile(join(worktreePath, '.team', 'journal.md'), 'utf-8');
    expect(journal).toContain('— wrapper');
    expect(journal).toContain('killed');
  });

  it('killSession throws SessionNotFoundError when worktree directory does not exist', async () => {
    await expect(manager.killSession('no-such-orphan-3')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  // ── cleanSession on disk-only ────────────────────────────────────────────

  it('cleanSession on a disk-only session archives .team/ then removes the worktree dir', async () => {
    // Use `deletedSourceRepo: true` so resolveRepoRoot throws NotAGitRepoError,
    // triggering the fs.rm fallback path in cleanSession.
    // (Sessions where source_repo exists but the path is not a registered git
    // worktree currently throw WorktreeError — see review.md for the bug.)
    const id = 'disk-clean-4';
    const worktreePath = await writeDiskOrphan(id, { deletedSourceRepo: true });

    await expect(manager.cleanSession(id)).resolves.toBeUndefined();

    // Worktree directory must be gone via the fs.rm fallback.
    expect(existsSync(worktreePath)).toBe(false);

    // Archive must have been created (the .team/ dir existed, so archiveWorktree ran first).
    const archiveDir = join(archivesRootDir, id);
    expect(existsSync(archiveDir)).toBe(true);
    expect(existsSync(join(archiveDir, 'meta.json'))).toBe(true);
    expect(existsSync(join(archiveDir, 'state.json'))).toBe(true);
  });

  it('cleanSession throws SessionNotFoundError when worktree directory does not exist', async () => {
    await expect(manager.cleanSession('ghost-session-5')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  // ── cleanSession fallback when source_repo is deleted ───────────────────

  it('cleanSession falls back to fs.rm when source_repo directory has been deleted', async () => {
    // Create a fake source repo dir that we will delete before calling clean.
    const fakeSourceRepo = await realpath(await mkdtemp(join(tmpdir(), 'sm-orphan-src-')));
    execSync('git init', { cwd: fakeSourceRepo });
    execSync('git checkout -b main', { cwd: fakeSourceRepo });
    execSync('echo "x" > x.txt', { cwd: fakeSourceRepo });
    execSync('git add .', { cwd: fakeSourceRepo });
    execSync('git commit -m "init"', { cwd: fakeSourceRepo });

    const id = 'disk-clean-fallback-6';
    const worktreePath = await writeDiskOrphan(id, { sourceRepo: fakeSourceRepo });

    // Delete the source repo so resolveRepoRoot will throw NotAGitRepoError.
    await rm(fakeSourceRepo, { recursive: true, force: true });

    // cleanSession must NOT throw — it must fall back to fs.rm.
    await expect(manager.cleanSession(id)).resolves.toBeUndefined();

    // Worktree dir must be removed by the fallback path.
    expect(existsSync(worktreePath)).toBe(false);
  });

  // ── purgeOrphans ─────────────────────────────────────────────────────────

  it('purgeOrphans skips ids in exclude and skips sessions with a live captain', async () => {
    // Three disk-only orphans with deleted source_repos so cleanSession uses
    // the NotAGitRepoError fallback path (the source_repo-exists-but-not-a-
    // registered-worktree path is a known bug filed in review.md).
    await writeDiskOrphan('orphan-1', { deletedSourceRepo: true });
    await writeDiskOrphan('orphan-2', { deletedSourceRepo: true });
    await writeDiskOrphan('orphan-3', { deletedSourceRepo: true });

    // One live in-memory session (captain.running = true via the mock).
    const live = await manager.createSession(tempRepo, 'Live Session');
    const liveId = live.meta.id;

    const result = await manager.purgeOrphans({ exclude: ['orphan-1'] });

    // orphan-1 must be skipped (excluded).
    expect(result.skipped.some((s) => s.id === 'orphan-1' && s.reason === 'current session')).toBe(
      true,
    );

    // liveId must be skipped (live captain).
    expect(result.skipped.some((s) => s.id === liveId && s.reason === 'live captain')).toBe(true);

    // orphan-2 and orphan-3 must be purged.
    expect(result.purged).toContain('orphan-2');
    expect(result.purged).toContain('orphan-3');

    // orphan-1 and liveId must NOT be in purged.
    expect(result.purged).not.toContain('orphan-1');
    expect(result.purged).not.toContain(liveId);
  });

  it('purgeOrphans records per-session errors in skipped instead of aborting', async () => {
    // Two good orphans (with deleted source repos so cleanSession succeeds).
    await writeDiskOrphan('good-orphan-a', { deletedSourceRepo: true });
    await writeDiskOrphan('good-orphan-b', { deletedSourceRepo: true });

    // One orphan that was never registered as a real git worktree but whose
    // source_repo is still on disk. Post-fix, the WorktreeError → fs.rm
    // fallback in cleanSession drains this orphan correctly, so it lands in
    // `purged` (it used to abort to `skipped`; see review.md / journal).
    await writeDiskOrphan('unregistered-orphan', { sourceRepo: tempRepo });

    // To exercise the "per-session error in skipped, batch keeps going" path
    // we need a session that scanDiskSessions CAN enumerate but that fails
    // unrecoverably during kill/clean. Pre-creating the archive destination
    // as a regular FILE (where archiveSession expects a directory) makes
    // `cp(teamDir, archiveDir, { recursive: true })` throw with EEXIST /
    // ENOTDIR. The error is NOT a NotAGitRepoError or WorktreeError, so the
    // new cleanSession fallback intentionally re-throws it and purgeOrphans
    // records it in `skipped`.
    const errorId = 'archive-collision-orphan';
    await writeDiskOrphan(errorId, { deletedSourceRepo: true });
    const archiveCollisionPath = join(archivesRootDir, errorId);
    await writeFile(archiveCollisionPath, 'pre-existing file, not a directory');

    const result = await manager.purgeOrphans();

    // The two known-good orphans plus the now-fixed unregistered orphan
    // should all be purged. The batch must NOT abort on the error orphan.
    expect(result.purged).toContain('good-orphan-a');
    expect(result.purged).toContain('good-orphan-b');
    expect(result.purged).toContain('unregistered-orphan');

    // The archive-collision orphan should appear in skipped with an error
    // reason and the batch must have continued past it.
    const errorEntry = result.skipped.find((s) => s.id === errorId);
    expect(errorEntry).toBeDefined();
    expect(errorEntry?.reason).toMatch(/^error: /);

    // No good orphan may appear in skipped.
    expect(result.skipped.some((s) => s.id === 'good-orphan-a')).toBe(false);
    expect(result.skipped.some((s) => s.id === 'good-orphan-b')).toBe(false);
    expect(result.skipped.some((s) => s.id === 'unregistered-orphan')).toBe(false);
  });
});
