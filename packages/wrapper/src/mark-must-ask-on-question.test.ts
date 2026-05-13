/**
 * Unit tests for `agent-prompts/hooks/mark-must-ask-on-question.sh`.
 *
 * Shells out to the script with a controlled `$CLAUDE_PROJECT_DIR` pointing
 * at a tmpdir we own, then reads back (or confirms unchanged) the `state.json`
 * and asserts the expected behaviour.
 *
 * Key difference vs mark-must-ask.sh: this hook is a PreToolUse hook matched
 * on `AskUserQuestion`. It does NOT skip based on `active_specialist` —
 * the captain can open an AskUserQuestion form while a specialist is running
 * concurrently. So engineer/tester/reviewer in active_specialist should NOT
 * prevent the hook from writing.
 *
 * Cases covered:
 *  (a) No state.json → silent exit 0, no file created.
 *  (b) phase=done → silent exit 0, file unchanged.
 *  (c) must_ask_pending already non-empty → silent exit 0, file unchanged.
 *  (d) phase=executing + active_specialist=scout + must_ask_pending=[]
 *      → rewrites with ["user question pending"].
 *  (e) phase=scouting + active_specialist=null + must_ask_pending=[]
 *      → rewrites with ["user question pending"].
 *  (f) active_specialist=engineer + must_ask_pending=[]
 *      → DOES rewrite (unlike mark-must-ask.sh).
 *  (g) active_specialist=tester + must_ask_pending=[]
 *      → DOES rewrite.
 *  (h) active_specialist=reviewer + must_ask_pending=[]
 *      → DOES rewrite.
 *  (i) phase=killed → silent exit 0, file unchanged.
 *  (j) phase=cleaned → silent exit 0, file unchanged.
 *  (k) malformed JSON → silent exit 0, file unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Climb three levels (packages/wrapper/src → packages/wrapper → packages → repo root)
// and resolve the hook script path under agent-prompts/hooks.
const HOOK_SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'agent-prompts',
  'hooks',
  'mark-must-ask-on-question.sh',
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

describe('mark-must-ask-on-question.sh PreToolUse hook', () => {
  let projectDir: string;
  let stateFile: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'mark-must-ask-on-question-'));
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

  // ── (a) No state.json ─────────────────────────────────────────────────

  it('exits 0 silently when state.json is missing — no file created', () => {
    expect(existsSync(stateFile)).toBe(false);

    const { status } = runHook();
    expect(status).toBe(0);
    expect(existsSync(stateFile)).toBe(false);
  });

  // ── (b) Terminal phases — skip ────────────────────────────────────────

  it('skips when phase=done, file unchanged', async () => {
    await writeState(baseState({ phase: 'done' }));

    const { status } = runHook();
    expect(status).toBe(0);

    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('skips when phase=killed, file unchanged', async () => {
    await writeState(baseState({ phase: 'killed' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual([]);
  });

  it('skips when phase=cleaned, file unchanged', async () => {
    await writeState(baseState({ phase: 'cleaned' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual([]);
  });

  // ── (c) must_ask_pending already non-empty — skip ─────────────────────

  it('skips when must_ask_pending is already non-empty', async () => {
    await writeState(
      baseState({
        phase: 'executing',
        must_ask_pending: ['approve plan?'],
      }),
    );

    runHook();

    // Original entry preserved, generic one not appended.
    expect((await readState()).must_ask_pending).toEqual(['approve plan?']);
  });

  // ── (d) Normal write path — scout running ──────────────────────────────

  it('pushes "user question pending" when scout is active_specialist', async () => {
    // Case (d): captain asked a question while scout runs concurrently.
    await writeState(baseState({ active_specialist: 'scout' }));

    const { status } = runHook();
    expect(status).toBe(0);

    const after = await readState();
    expect(after.must_ask_pending).toEqual(['user question pending']);
    // Other fields must be preserved.
    expect(after.phase).toBe('executing');
    expect(after.active_specialist).toBe('scout');
    expect(after.review_iterations).toBe(0);
    expect(after.last_checkpoint).toBe('2026-05-12T00:00:00Z');
  });

  // ── (e) Normal write path — no active_specialist ──────────────────────

  it('pushes "user question pending" for phase=scouting + active_specialist=null', async () => {
    await writeState(baseState({ phase: 'scouting', active_specialist: null }));

    const { status } = runHook();
    expect(status).toBe(0);

    expect((await readState()).must_ask_pending).toEqual(['user question pending']);
  });

  // ── (f)(g)(h) Specialist running — unlike mark-must-ask.sh, this hook DOES write ──

  it('writes even when active_specialist=engineer (no specialist-skip for PreToolUse hook)', async () => {
    // mark-must-ask.sh skips on engineer/tester/reviewer; this hook must NOT —
    // the captain can open AskUserQuestion while those specialists run concurrently.
    await writeState(baseState({ active_specialist: 'engineer' }));

    const { status } = runHook();
    expect(status).toBe(0);

    expect((await readState()).must_ask_pending).toEqual(['user question pending']);
  });

  it('writes even when active_specialist=tester', async () => {
    await writeState(baseState({ active_specialist: 'tester' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual(['user question pending']);
  });

  it('writes even when active_specialist=reviewer', async () => {
    await writeState(baseState({ active_specialist: 'reviewer' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual(['user question pending']);
  });

  it('writes even when active_specialist=tester+reviewer', async () => {
    await writeState(baseState({ active_specialist: 'tester+reviewer' }));

    runHook();

    expect((await readState()).must_ask_pending).toEqual(['user question pending']);
  });

  // ── (k) Malformed JSON — silent no-op ─────────────────────────────────

  it('exits 0 and leaves file untouched when state.json is malformed JSON', async () => {
    await writeFile(stateFile, 'not valid json {');

    const { status } = runHook();
    expect(status).toBe(0);

    const raw = await readFile(stateFile, 'utf-8');
    expect(raw).toBe('not valid json {');
  });

  // ── Idempotency guard ─────────────────────────────────────────────────

  it('is idempotent: running twice does not duplicate the entry', async () => {
    await writeState(baseState());

    runHook();
    runHook();

    // After two runs the entry appears exactly once.
    expect((await readState()).must_ask_pending).toEqual(['user question pending']);
  });

  // ── must_ask_pending key absent ───────────────────────────────────────

  it('pushes entry when must_ask_pending key is absent from state.json', async () => {
    // jq null|length == 0, so a missing key is treated like an empty array.
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
    expect(after['must_ask_pending']).toEqual(['user question pending']);
  });
});
