/**
 * Unit tests for `agent-prompts/hooks/mark-must-ask.sh`.
 *
 * There is no precedent for shell-script tests in this repo, so this file
 * shells out to the script with a controlled `$CLAUDE_PROJECT_DIR` pointing
 * at a tmpdir we own, then reads back the mutated `state.json` and asserts.
 *
 * Covers the four acceptance-criteria cases from plan.md:
 *  (a) phase=executing + active_specialist=null + must_ask_pending=[]
 *      → pushes the generic safety-net entry.
 *  (b) phase=executing + active_specialist=engineer
 *      → no-op (long-running specialist owns the next move).
 *  (c) phase=done
 *      → no-op (session is no longer live).
 *  (d) must_ask_pending non-empty
 *      → no-op (captain pushed a specific summary; don't clobber).
 *
 * Plus regression guards for the silent no-op cases (missing state.json,
 * scout running).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// session-manager.ts lives in packages/wrapper/src — climb three levels to
// the repo root and reach the hook script under agent-prompts/hooks.
const HOOK_SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'agent-prompts',
  'hooks',
  'mark-must-ask.sh',
);

interface State {
  phase: string;
  active_specialist: string | null;
  review_iterations: number;
  max_review_iterations: number;
  last_checkpoint: string;
  blockers: string[];
  must_ask_pending: string[];
}

function baseState(overrides: Partial<State> = {}): State {
  return {
    phase: 'executing',
    active_specialist: null,
    review_iterations: 0,
    max_review_iterations: 8,
    last_checkpoint: '2026-05-12T00:00:00Z',
    blockers: [],
    must_ask_pending: [],
    ...overrides,
  };
}

describe('mark-must-ask.sh Stop hook', () => {
  let projectDir: string;
  let stateFile: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'mark-must-ask-'));
    await mkdir(join(projectDir, '.team'), { recursive: true });
    stateFile = join(projectDir, '.team', 'state.json');
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  async function writeState(state: State): Promise<void> {
    await writeFile(stateFile, JSON.stringify(state, null, 2));
  }

  async function readState(): Promise<State> {
    return JSON.parse(await readFile(stateFile, 'utf-8')) as State;
  }

  function runHook(): { status: number; stderr: string } {
    const result = spawnSync(HOOK_SCRIPT, [], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: 'utf-8',
    });
    return { status: result.status ?? -1, stderr: result.stderr };
  }

  it('pushes the generic safety-net entry when the session is idle', async () => {
    // Case (a): phase live, no specialist, pending empty → safety net fires.
    await writeState(baseState());

    const { status } = runHook();
    expect(status).toBe(0);

    const after = await readState();
    expect(after.must_ask_pending).toEqual(['captain awaiting user reply']);
    // Other fields preserved.
    expect(after.phase).toBe('executing');
    expect(after.active_specialist).toBeNull();
    expect(after.review_iterations).toBe(0);
    expect(after.last_checkpoint).toBe('2026-05-12T00:00:00Z');
  });

  it('skips when active_specialist=engineer (specialist owns the next move)', async () => {
    // Case (b): engineer is running → captain is not the bottleneck.
    await writeState(baseState({ active_specialist: 'engineer' }));

    const { status } = runHook();
    expect(status).toBe(0);

    const after = await readState();
    expect(after.must_ask_pending).toEqual([]);
    expect(after.active_specialist).toBe('engineer');
  });

  it('skips when active_specialist=tester', async () => {
    // Same family as engineer.
    await writeState(baseState({ active_specialist: 'tester' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('skips when active_specialist=reviewer', async () => {
    // Same family as engineer/tester.
    await writeState(baseState({ active_specialist: 'reviewer' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('flags even when scout is running (scout is concurrent with chat)', async () => {
    // scout is intentionally NOT in the specialist skip set — it runs
    // concurrently with the captain's chat, so a turn ending while scout is
    // in the background still means the user is the bottleneck.
    await writeState(baseState({ active_specialist: 'scout' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual([
      'captain awaiting user reply',
    ]);
  });

  it('skips when phase=done (session is no longer live)', async () => {
    // Case (c).
    await writeState(baseState({ phase: 'done' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('skips when phase=cleaned', async () => {
    await writeState(baseState({ phase: 'cleaned' }));
    runHook();
    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('skips when phase=killed', async () => {
    await writeState(baseState({ phase: 'killed' }));
    runHook();
    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('preserves an existing must_ask_pending entry without clobbering', async () => {
    // Case (d): captain already pushed a specific summary this turn. The
    // hook must NOT overwrite it with the generic message.
    await writeState(
      baseState({
        phase: 'planning',
        must_ask_pending: ['approve plan?'],
      }),
    );

    runHook();

    expect((await readState()).must_ask_pending).toEqual(['approve plan?']);
  });

  it('pushes entry when must_ask_pending key is entirely absent (not just empty array)', async () => {
    // The script uses `jq '.must_ask_pending | length'` — in jq, null|length == 0,
    // so a state.json that never had the key should behave the same as one with [].
    const stateWithoutPending = {
      phase: 'executing',
      active_specialist: null,
      review_iterations: 0,
      last_checkpoint: '2026-05-12T00:00:00Z',
      blockers: [],
      // must_ask_pending intentionally omitted
    };
    await writeFile(stateFile, JSON.stringify(stateWithoutPending, null, 2));

    const { status } = runHook();
    expect(status).toBe(0);

    const after = JSON.parse(await readFile(stateFile, 'utf-8')) as Record<string, unknown>;
    expect(after['must_ask_pending']).toEqual(['captain awaiting user reply']);
  });

  it('exits 0 silently when state.json is missing', async () => {
    // No state.json → hook should be a no-op, not an error.
    expect(existsSync(stateFile)).toBe(false);

    const { status } = runHook();
    expect(status).toBe(0);
    expect(existsSync(stateFile)).toBe(false);
  });

  it('exits 0 and leaves state.json untouched when JSON is malformed', async () => {
    await writeFile(stateFile, 'not valid json {');

    const { status } = runHook();
    expect(status).toBe(0);

    const raw = await readFile(stateFile, 'utf-8');
    expect(raw).toBe('not valid json {');
  });
});
