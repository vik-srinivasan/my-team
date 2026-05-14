import { EventEmitter } from 'node:events';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, appendFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Logger } from 'pino';

import type {
  Session,
  SessionMeta,
  SessionState,
  SessionSummary,
  SessionDetail,
  TeamFileName,
  TeamFiles,
  WsServerEvent,
} from '@my-team/shared';
import {
  generateSessionId,
  recordSessionStart,
  SessionNotFoundError,
  SessionActiveError,
  SessionCorruptError,
  SessionProcessDeadError,
} from '@my-team/shared';

import { existsSync } from 'node:fs';

import {
  createWorktree,
  removeWorktree,
  archiveSession as archiveWorktree,
  resolveRepoRoot,
  getWorktreePath,
  sessionsDir,
} from './worktree.js';
import { spawnCaptain, type CaptainProcess } from './claude-process.js';
import {
  readAllTeamFiles,
  readTeamState,
  readTeamMeta,
  watchTeamFiles,
  type TeamFileWatcher,
} from './team-files.js';

const NOTIFICATIONS_DIR = join(homedir(), 'team', 'notifications');

// Map of .team/ markdown filenames to the canonical TeamFileName broadcast
// on `team_file` WebSocket events. Only these four files trigger a broadcast;
// state.json/meta.json/context.md/decisions.md are intentionally excluded.
// srd.md is also excluded — it's authored once during planning and never
// streamed, so live broadcast adds no value.
const BROADCAST_FILES: Record<string, TeamFileName> = {
  'plan.md': 'plan',
  'tasks.md': 'tasks',
  'journal.md': 'journal',
  'review.md': 'review',
};

interface SessionManagerEventMap {
  event: [sessionId: string, event: WsServerEvent];
}

/**
 * Returns the canonical `phase` for a `SessionState` whose `phase` is the
 * stale `awaiting_approval` value left over from before the captain
 * dispatched a real specialist. Returns `null` when no healing is
 * warranted — i.e., when `phase` is not `awaiting_approval`, or when
 * `active_specialist` is not one of the real specialists.
 *
 * Mapping mirrors `effectivePhase()` in the CLI's `format.ts`:
 *   - engineer                                       → executing
 *   - tester | reviewer | tester+reviewer            → reviewing
 *   - scout                                          → scouting
 *
 * Exported so tests can hit the pure function without booting a
 * `SessionManager`.
 */
export function healedPhaseFor(
  state: Pick<SessionState, 'phase' | 'active_specialist'>,
): SessionState['phase'] | null {
  if (state.phase !== 'awaiting_approval') return null;
  switch (state.active_specialist) {
    case 'engineer':
      return 'executing';
    case 'tester':
    case 'reviewer':
    case 'tester+reviewer':
      return 'reviewing';
    case 'scout':
      return 'scouting';
    default:
      return null;
  }
}

interface ManagedSession {
  session: Session;
  captain: CaptainProcess | null;
  watcher: TeamFileWatcher | null;
  lastDiff: string;
  diffTimer: ReturnType<typeof setTimeout> | null;
}

export interface CaptainHookPaths {
  /** Absolute path to the `UserPromptSubmit` hook script (clears `must_ask_pending`). */
  clearMustAskHookPath: string;
  /** Absolute path to the `Stop` hook script (auto-pushes a generic must_ask entry). */
  stopHookPath: string;
  /**
   * Absolute path to the `PreToolUse` hook script (auto-pushes a generic
   * must_ask entry the instant an `AskUserQuestion` form opens, so the
   * `team watch` AT column lights up while the user is mid-answer — the
   * `Stop` hook can't cover this because the captain's turn is still open
   * while `AskUserQuestion` is mid-call).
   */
  askQuestionHookPath: string;
}

/**
 * Builds the `.claude/settings.json` payload installed in every captain
 * worktree. Wires three hooks:
 *
 * - `UserPromptSubmit` clears `must_ask_pending` the instant the user
 *   replies, so the `team watch` AT column drops as soon as the user is
 *   no longer the bottleneck.
 * - `Stop` runs at the end of every captain assistant turn. If the
 *   captain forgot to push a specific summary AND no long-running
 *   specialist owns the next move, the hook pushes a generic safety-net
 *   entry into `must_ask_pending` so the AT column still lights up.
 * - `PreToolUse` matched on `AskUserQuestion` fires the moment the
 *   captain opens an `AskUserQuestion` form, *before* the question is
 *   shown to the user. The `Stop` hook can't cover this case — the
 *   captain's turn is still open while the question is mid-call — so
 *   without this hook the AT column stays calm while the user is
 *   composing an answer.
 *
 * Exported (not free-standing inside the class) so tests can assert the
 * exact shape without touching the rest of `SessionManager`.
 */
export function buildCaptainSettings(
  paths: CaptainHookPaths,
): Record<string, unknown> {
  return {
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: paths.clearMustAskHookPath,
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
              command: paths.stopHookPath,
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
              command: paths.askQuestionHookPath,
            },
          ],
        },
      ],
    },
  };
}

export class SessionManager extends EventEmitter<SessionManagerEventMap> {
  private sessions = new Map<string, ManagedSession>();
  private log: Logger;
  private captainPromptPath: string;
  private clearMustAskHookPath: string;
  private stopHookPath: string;
  private askQuestionHookPath: string;

  constructor(
    log: Logger,
    captainPromptPath: string,
    clearMustAskHookPath: string,
    stopHookPath: string,
    askQuestionHookPath: string,
  ) {
    super();
    this.log = log;
    this.captainPromptPath = captainPromptPath;
    this.clearMustAskHookPath = clearMustAskHookPath;
    this.stopHookPath = stopHookPath;
    this.askQuestionHookPath = askQuestionHookPath;
  }

  async createSession(sourceRepo: string, title: string, cols?: number, rows?: number): Promise<Session> {
    const repoRoot = await resolveRepoRoot(sourceRepo);
    const existingIds = new Set(this.sessions.keys());
    const sessionId = generateSessionId(existingIds);

    this.log.info({ sessionId, title, sourceRepo: repoRoot }, 'Creating session');

    // Create worktree and initialize .team/ files
    const { worktreePath, meta } = await createWorktree(repoRoot, sessionId, title);

    // Read initial state
    const state = await readTeamState(worktreePath);

    const session: Session = {
      meta,
      state,
      worktree_path: worktreePath,
      pid: null,
      started_at: new Date().toISOString(),
      remote_url: null,
    };

    // Pre-trust the worktree directory so Claude Code skips the interactive trust dialog
    await this.preTrustDirectory(worktreePath);

    // Install the per-worktree Claude Code hook config (UserPromptSubmit ->
    // clear must_ask_pending). Must run before the captain spawns so the
    // hook is picked up by Claude Code's first config load.
    await this.writeCaptainHooks(worktreePath);

    // Spawn captain
    const captain = await spawnCaptain({
      worktreePath,
      captainPromptPath: this.captainPromptPath,
      sessionId,
      cols,
      rows,
    });

    session.pid = captain.pid;

    this.attachCaptainHandlers(sessionId, captain);
    const watcher = this.attachTeamFileWatcher(sessionId, worktreePath);

    const managed: ManagedSession = {
      session,
      captain,
      watcher,
      lastDiff: '',
      diffTimer: null,
    };
    this.sessions.set(sessionId, managed);

    // Record this session against the recents registry. Best-effort —
    // a failed write must not block session creation.
    try {
      const overridePath = process.env['MY_TEAM_REGISTRY_PATH'];
      await recordSessionStart(meta, overridePath);
    } catch (err) {
      this.log.warn({ sessionId, err }, 'Failed to update recents registry');
    }

    this.log.info({ sessionId, pid: captain.pid }, 'Session created');
    return session;
  }

  /**
   * Resumes an existing session whose worktree survived on disk but whose
   * captain process is no longer running. Mirrors the spawn-side path of
   * {@link createSession}: pre-trusts the directory, rewrites captain hooks,
   * appends a `Session resumed` journal entry BEFORE spawning (so the
   * captain reads it on startup), spawns the captain, wires the event
   * handlers and watcher, then inserts the entry into the in-memory Map.
   *
   * Throws:
   *   - `SessionNotFoundError` — worktree directory absent.
   *   - `SessionCorruptError` — worktree present but `.team/meta.json` is
   *     missing or unreadable.
   *   - `SessionActiveError` — the captain is already running in this
   *     daemon's memory (no double-spawn).
   */
  async resumeSession(id: string, cols?: number, rows?: number): Promise<Session> {
    const worktreePath = getWorktreePath(id);
    if (!existsSync(worktreePath)) {
      throw new SessionNotFoundError(id);
    }

    let meta;
    try {
      meta = await readTeamMeta(worktreePath);
    } catch (err) {
      throw new SessionCorruptError(id, err instanceof Error ? err.message : String(err));
    }

    // Refuse double-spawn — a live captain already owns this worktree.
    const existing = this.sessions.get(id);
    if (existing?.captain?.running) {
      throw new SessionActiveError(id);
    }

    this.log.info({ sessionId: id, worktreePath }, 'Resuming session');

    // Mirror createSession pre-flight: pre-trust + hooks. Worktrees from
    // earlier versions of my-team may have stale or missing settings.
    await this.preTrustDirectory(worktreePath);
    await this.writeCaptainHooks(worktreePath);

    // Append a `Session resumed` journal entry BEFORE spawning so the
    // captain reads it on startup. Best-effort: a journal append failure
    // does not block the resume — it's just an observability loss.
    const timestamp = new Date().toISOString();
    try {
      await appendFile(
        join(worktreePath, '.team', 'journal.md'),
        `\n## ${timestamp} — wrapper\nSession resumed.\n`,
      );
    } catch (err) {
      this.log.warn({ id, err }, 'Failed to append resume journal entry');
    }

    // Best-effort read of current state from disk for the in-memory copy.
    // If state.json is missing or corrupt, fall back to a minimal default —
    // the captain will rewrite it on its first checkpoint anyway.
    let state: SessionState;
    try {
      state = await readTeamState(worktreePath);
    } catch {
      state = {
        phase: 'blocked',
        active_specialist: null,
        review_iterations: 0,
        max_review_iterations: 8,
        last_checkpoint: timestamp,
        blockers: ['state.json unreadable at resume; captain will reinitialize'],
        must_ask_pending: [],
      };
    }

    const session: Session = {
      meta,
      state,
      worktree_path: worktreePath,
      pid: null,
      started_at: timestamp,
      remote_url: null,
    };

    // Stop any stale watcher from a prior in-memory entry (e.g. session
    // was killed and is now being resumed) before we wire a new one.
    if (existing?.watcher) {
      await existing.watcher.close();
    }

    const captain = await spawnCaptain({
      worktreePath,
      captainPromptPath: this.captainPromptPath,
      sessionId: id,
      cols,
      rows,
    });
    session.pid = captain.pid;

    this.attachCaptainHandlers(id, captain);
    const watcher = this.attachTeamFileWatcher(id, worktreePath);

    const managed: ManagedSession = {
      session,
      captain,
      watcher,
      lastDiff: '',
      diffTimer: null,
    };
    this.sessions.set(id, managed);

    // Keep the recents registry accurate — surface the just-resumed session
    // in `team list-past` ordering.
    try {
      const overridePath = process.env['MY_TEAM_REGISTRY_PATH'];
      await recordSessionStart(meta, overridePath);
    } catch (err) {
      this.log.warn({ id, err }, 'Failed to update recents registry on resume');
    }

    this.log.info({ id, pid: captain.pid }, 'Session resumed');
    return session;
  }

  /**
   * Wires the standard captain event handlers (remoteUrl, data, exit) for
   * a freshly-spawned captain. Mutates `this.sessions` on event delivery,
   * so the entry must be inserted into the Map either before or
   * immediately after this call (createSession / resumeSession both do).
   */
  private attachCaptainHandlers(sessionId: string, captain: CaptainProcess): void {
    captain.on('remoteUrl', (url) => {
      this.log.info({ sessionId, remoteUrl: url }, 'Remote control URL detected');
      const managed = this.sessions.get(sessionId);
      if (managed) {
        managed.session.remote_url = url;
      }
      this.emitEvent(sessionId, { type: 'remote_url', url });
    });

    captain.on('data', (text) => {
      this.emitEvent(sessionId, { type: 'output', text });
    });

    captain.on('exit', (code) => {
      this.log.info({ sessionId, code }, 'Captain process exited');
      const managed = this.sessions.get(sessionId);
      if (managed) {
        managed.session.pid = null;
        managed.captain = null;

        // If captain crashed unexpectedly (non-zero exit, not killed/done), set blocked
        const phase = managed.session.state.phase;
        if (code !== 0 && phase !== 'killed' && phase !== 'done' && phase !== 'cleaned') {
          managed.session.state.phase = 'blocked';
          managed.session.state.blockers = [
            ...managed.session.state.blockers,
            `Captain process crashed with exit code ${code}`,
          ];
          this.emitEvent(sessionId, { type: 'state', state: managed.session.state });
          this.writeNotification(sessionId, managed.session.meta.title, managed.session.state.blockers);
        }
      }
    });
  }

  /**
   * Sets up the `.team/` file watcher with the standard broadcast +
   * state.json + specialist + blocked notification handlers. Returns the
   * watcher handle so the caller can persist it on the ManagedSession.
   */
  private attachTeamFileWatcher(sessionId: string, worktreePath: string): TeamFileWatcher {
    return watchTeamFiles(worktreePath, (filename, content) => {
      this.log.debug({ sessionId, filename }, 'Team file changed');

      // Emit team_file event for the four broadcast markdown files.
      const broadcastName = BROADCAST_FILES[filename];
      if (broadcastName) {
        this.emitEvent(sessionId, { type: 'team_file', name: broadcastName, content });
      }

      // Schedule a debounced diff recalculation on any file change
      this.scheduleDiffEmit(sessionId);

      // If state.json changed, update in-memory state and emit events
      if (filename === 'state.json') {
        try {
          const newState = JSON.parse(content) as SessionState;
          const managed = this.sessions.get(sessionId);
          if (managed) {
            const oldState = managed.session.state;

            // Detect specialist changes and emit specialist events
            if (oldState.active_specialist !== newState.active_specialist) {
              if (oldState.active_specialist) {
                this.emitEvent(sessionId, {
                  type: 'specialist',
                  name: oldState.active_specialist,
                  status: 'finished',
                });
              }
              if (newState.active_specialist) {
                this.emitEvent(sessionId, {
                  type: 'specialist',
                  name: newState.active_specialist,
                  status: 'started',
                });
              }
            }

            // Handle blocked state — write notification
            if (oldState.phase !== 'blocked' && newState.phase === 'blocked') {
              this.writeNotification(sessionId, managed.session.meta.title, newState.blockers);
            }

            managed.session.state = newState;
            this.emitEvent(sessionId, { type: 'state', state: newState });
          }
        } catch {
          this.log.warn({ sessionId }, 'Failed to parse state.json update');
        }
      }
    });
  }

  getSession(id: string): Session {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }
    return managed.session;
  }

  /**
   * Emit one `team_file` event per broadcast file (plan/tasks/journal/review)
   * for the given session. Used to hydrate newly-connected WebSocket clients.
   * Missing files emit empty content. Best-effort: a read error is logged
   * and the event is emitted with empty content rather than thrown.
   */
  async emitInitialTeamFiles(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new SessionNotFoundError(sessionId);
    }

    const teamDir = join(managed.session.worktree_path, '.team');
    await Promise.all(
      Object.entries(BROADCAST_FILES).map(async ([filename, name]) => {
        let content = '';
        try {
          content = await readFile(join(teamDir, filename), 'utf-8');
        } catch (err) {
          // File doesn't exist yet — emit empty content. Other read errors
          // (e.g., permission) are logged but still emit empty content so
          // the client hydrates rather than hanging.
          const error = err as NodeJS.ErrnoException;
          if (error.code !== 'ENOENT') {
            this.log.warn({ sessionId, filename, err }, 'Failed to read team file for initial emit');
          }
        }
        this.emitEvent(sessionId, { type: 'team_file', name, content });
      }),
    );
  }

  async getSessionDetail(id: string): Promise<SessionDetail> {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }

    // Refresh in-memory state from disk in case chokidar missed an event.
    await this.refreshStateFromDisk(managed);

    const team = await readAllTeamFiles(managed.session.worktree_path);
    return { ...managed.session, team };
  }

  async listSessions(): Promise<SessionSummary[]> {
    const managed = Array.from(this.sessions.values());

    // Refresh every session's state from disk first — fsevents on macOS
    // can drop chokidar events, so we don't trust in-memory state for the
    // list view.
    await Promise.all(managed.map((m) => this.refreshStateFromDisk(m)));

    const summaries: SessionSummary[] = managed.map(({ session }) => ({
      id: session.meta.id,
      title: session.meta.title,
      source_repo: session.meta.source_repo,
      phase: session.state.phase,
      active_specialist: session.state.active_specialist,
      created_at: session.meta.created_at,
      last_checkpoint: session.state.last_checkpoint,
      must_ask_count: session.state.must_ask_pending.length,
    }));

    // Hydrate orphan sessions from disk — worktrees that survived a daemon
    // restart and aren't in the in-memory Map. In-memory entries win on
    // conflict (the loop below skips IDs already in `inMemoryIds`).
    const inMemoryIds = new Set(summaries.map((s) => s.id));
    const diskSummaries = await this.scanDiskSessions(inMemoryIds);
    summaries.push(...diskSummaries);

    return summaries;
  }

  /**
   * Scans `~/team/sessions/` for worktree directories not already tracked
   * in memory and returns a `SessionSummary` for each one with readable
   * `.team/meta.json` and `.team/state.json`. Silently skips:
   *   - non-directory entries
   *   - sessions whose ID is already in `inMemoryIds`
   *   - sessions missing `meta.json` or `state.json`
   *   - sessions with corrupt JSON
   *
   * Disk-only sessions are surfaced as-is with no live captain — callers
   * can use `team resume <id>` to bring them back.
   */
  private async scanDiskSessions(inMemoryIds: Set<string>): Promise<SessionSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(sessionsDir());
    } catch {
      // sessions dir doesn't exist (no sessions ever created) — silently
      // return empty. This is the expected case on a fresh install.
      return [];
    }

    const results = await Promise.all(
      entries.map(async (id) => {
        if (inMemoryIds.has(id)) return null;

        const worktreePath = join(sessionsDir(), id);
        try {
          const s = await stat(worktreePath);
          if (!s.isDirectory()) return null;
        } catch {
          return null;
        }

        try {
          const [meta, state] = await Promise.all([
            readTeamMeta(worktreePath),
            readTeamState(worktreePath),
          ]);
          const summary: SessionSummary = {
            id: meta.id,
            title: meta.title,
            source_repo: meta.source_repo,
            phase: state.phase,
            active_specialist: state.active_specialist,
            created_at: meta.created_at,
            last_checkpoint: state.last_checkpoint,
            must_ask_count: state.must_ask_pending.length,
          };
          return summary;
        } catch {
          // Missing or corrupt meta.json / state.json — skip silently.
          // A corrupt worktree must not break `list` for healthy ones.
          return null;
        }
      }),
    );

    return results.filter((s): s is SessionSummary => s !== null);
  }

  // Reads state.json from disk and updates the in-memory copy. Silent no-op
  // on read/parse failure — fall back to whatever in-memory state we have.
  //
  // Side-effect: auto-heals the stale `awaiting_approval` + real
  // `active_specialist` pattern. The captain is supposed to advance
  // `phase` to `executing`/`reviewing`/`scouting` when it dispatches a
  // specialist, but it sometimes forgets — leaving `phase` stuck at
  // `awaiting_approval` with `active_specialist` already set. That
  // pattern lights up the AT column red (and shows PHASE=approve)
  // forever. We detect it here, rewrite state.json to the canonical
  // phase derived from `active_specialist`, and log a warn so we can see
  // how often captains drop the ball. Healing is best-effort: any write
  // error is swallowed (matches the existing silent-on-failure contract).
  private async refreshStateFromDisk(managed: ManagedSession): Promise<void> {
    try {
      const fresh = await readTeamState(managed.session.worktree_path);

      const targetPhase = healedPhaseFor(fresh);
      if (targetPhase !== null) {
        const fromPhase = fresh.phase;
        const specialist = fresh.active_specialist;
        fresh.phase = targetPhase;
        try {
          const statePath = join(managed.session.worktree_path, '.team', 'state.json');
          await writeFile(statePath, JSON.stringify(fresh, null, 2));
          this.log.warn(
            {
              sessionId: managed.session.meta.id,
              from: fromPhase,
              to: targetPhase,
              specialist,
            },
            'Auto-healed stale phase on disk',
          );
        } catch {
          // Best-effort: if the write fails, keep the in-memory mutation
          // so list/detail returns the healed phase to clients, but
          // don't throw — disk state is allowed to drift transiently.
        }
      }

      managed.session.state = fresh;
    } catch {
      // ignore — disk state unreadable, keep in-memory copy
    }
  }

  sendInput(id: string, text: string): void {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }
    if (!managed.captain || !managed.captain.running) {
      throw new SessionProcessDeadError(id);
    }
    managed.captain.write(text);
  }

  resizeCaptain(id: string, cols: number, rows: number): void {
    const managed = this.sessions.get(id);
    if (!managed?.captain?.running) return;
    managed.captain.resize(cols, rows);
  }

  approveSession(id: string): void {
    this.sendInput(id, 'approved\n');
  }

  async killSession(id: string): Promise<void> {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }

    this.log.info({ id }, 'Killing session');

    // Kill captain process
    if (managed.captain) {
      managed.captain.kill();
      managed.captain = null;
    }

    // Stop watcher
    if (managed.watcher) {
      await managed.watcher.close();
      managed.watcher = null;
    }

    // Update state in memory
    managed.session.state.phase = 'killed';
    managed.session.pid = null;

    // Persist killed state to disk
    const teamDir = join(managed.session.worktree_path, '.team');
    const timestamp = new Date().toISOString();
    try {
      await writeFile(
        join(teamDir, 'state.json'),
        JSON.stringify({ ...managed.session.state }, null, 2),
      );
      await appendFile(
        join(teamDir, 'journal.md'),
        `\n## ${timestamp} — wrapper\nSession killed by user.\n`,
      );
    } catch (err) {
      this.log.warn({ id, err }, 'Failed to persist killed state to disk');
    }
  }

  async cleanSession(id: string): Promise<void> {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }

    if (managed.captain?.running) {
      throw new SessionActiveError(id);
    }

    // Archive first
    await this.archiveSession(id);

    // Remove worktree
    await removeWorktree(managed.session.meta.source_repo, id);

    // Remove from registry
    if (managed.watcher) {
      await managed.watcher.close();
    }
    this.sessions.delete(id);

    this.log.info({ id }, 'Session cleaned');
  }

  async archiveSession(id: string): Promise<string> {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }
    return archiveWorktree(id);
  }

  async getDiff(id: string): Promise<string> {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }

    const { execSync } = await import('node:child_process');
    try {
      const diff = execSync(
        `git diff ${managed.session.meta.source_branch}...HEAD`,
        { cwd: managed.session.worktree_path, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
      );
      return diff;
    } catch {
      return '';
    }
  }

  getCaptainProcess(id: string): CaptainProcess | null {
    return this.sessions.get(id)?.captain ?? null;
  }

  async shutdownAll(): Promise<void> {
    this.log.info('Shutting down all sessions');
    const promises: Promise<void>[] = [];
    for (const [id, managed] of this.sessions) {
      if (managed.captain?.running) {
        managed.captain.kill();
      }
      if (managed.watcher) {
        promises.push(managed.watcher.close());
      }
    }
    await Promise.all(promises);
    this.sessions.clear();
  }

  private scheduleDiffEmit(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;

    if (managed.diffTimer) clearTimeout(managed.diffTimer);
    managed.diffTimer = setTimeout(async () => {
      managed.diffTimer = null;
      try {
        const diff = await this.getDiff(sessionId);
        if (diff !== managed.lastDiff) {
          managed.lastDiff = diff;
          this.emitEvent(sessionId, { type: 'diff', diff });
        }
      } catch {
        // Session may have been cleaned up
      }
    }, 500);
  }

  private emitEvent(sessionId: string, event: WsServerEvent): void {
    this.emit('event', sessionId, event);
  }

  private async preTrustDirectory(dirPath: string): Promise<void> {
    const configPath = join(homedir(), '.claude.json');
    let config: Record<string, unknown> = {};
    try {
      const raw = await readFile(configPath, 'utf-8');
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // File doesn't exist or isn't valid JSON — start fresh
    }

    const projects = (config['projects'] ?? {}) as Record<string, Record<string, unknown>>;
    const entry = projects[dirPath] ?? {};
    entry['hasTrustDialogAccepted'] = true;
    entry['hasTrustDialogHooksAccepted'] = true;
    projects[dirPath] = entry;
    config['projects'] = projects;

    await writeFile(configPath, JSON.stringify(config, null, 2));
    this.log.debug({ dirPath }, 'Pre-trusted worktree directory in ~/.claude.json');
  }

  /**
   * Writes the worktree-local `.claude/settings.json` that registers all
   * three captain hooks:
   *
   * - `UserPromptSubmit` clears `must_ask_pending` on every user reply, so
   *   the `team watch` AT column drops the moment the user is no longer
   *   the bottleneck.
   * - `Stop` auto-pushes a generic safety-net `must_ask_pending` entry at
   *   the end of every captain turn that ends idle, so the AT column is
   *   reliable even when the captain forgets to push a specific summary.
   * - `PreToolUse` (matcher `AskUserQuestion`) auto-pushes a generic entry
   *   the instant the captain opens an `AskUserQuestion` form, so the AT
   *   column lights up while the user is composing an answer — the `Stop`
   *   hook can't cover this because the turn is still open mid-call.
   *
   * All command paths are absolute (resolved from the wrapper install
   * root) so they work regardless of the captain's cwd.
   */
  private async writeCaptainHooks(worktreePath: string): Promise<void> {
    const settingsDir = join(worktreePath, '.claude');
    const settingsPath = join(settingsDir, 'settings.json');
    const settings = buildCaptainSettings({
      clearMustAskHookPath: this.clearMustAskHookPath,
      stopHookPath: this.stopHookPath,
      askQuestionHookPath: this.askQuestionHookPath,
    });

    await mkdir(settingsDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2));
    this.log.debug(
      {
        worktreePath,
        clearMustAskHookPath: this.clearMustAskHookPath,
        stopHookPath: this.stopHookPath,
        askQuestionHookPath: this.askQuestionHookPath,
      },
      'Wrote captain UserPromptSubmit + Stop + PreToolUse hook config',
    );
  }

  private async writeNotification(
    sessionId: string,
    title: string,
    blockers: string[],
  ): Promise<void> {
    try {
      await mkdir(NOTIFICATIONS_DIR, { recursive: true });
      const notification = {
        session_id: sessionId,
        title,
        reason: blockers.join('; ') || 'Session blocked',
        timestamp: new Date().toISOString(),
      };
      await writeFile(
        join(NOTIFICATIONS_DIR, `${sessionId}.json`),
        JSON.stringify(notification, null, 2),
      );
      this.log.info({ sessionId }, 'Notification written for blocked session');
    } catch (err) {
      this.log.error({ sessionId, err }, 'Failed to write notification');
    }
  }
}
