import { EventEmitter } from 'node:events';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Logger } from 'pino';

import type {
  Session,
  SessionMeta,
  SessionState,
  SessionSummary,
  SessionDetail,
  TeamFiles,
  WsServerEvent,
} from '@viktown/shared';
import {
  generateSessionId,
  SessionNotFoundError,
  SessionActiveError,
  SessionProcessDeadError,
} from '@viktown/shared';

import {
  createWorktree,
  removeWorktree,
  archiveSession as archiveWorktree,
  resolveRepoRoot,
  getWorktreePath,
} from './worktree.js';
import { spawnCaptain, type CaptainProcess } from './claude-process.js';
import {
  readAllTeamFiles,
  readTeamState,
  watchTeamFiles,
  type TeamFileWatcher,
} from './team-files.js';

const NOTIFICATIONS_DIR = join(homedir(), 'team', 'notifications');

interface SessionManagerEventMap {
  event: [sessionId: string, event: WsServerEvent];
}

interface ManagedSession {
  session: Session;
  captain: CaptainProcess | null;
  watcher: TeamFileWatcher | null;
  lastDiff: string;
  diffTimer: ReturnType<typeof setTimeout> | null;
}

export class SessionManager extends EventEmitter<SessionManagerEventMap> {
  private sessions = new Map<string, ManagedSession>();
  private log: Logger;
  private captainPromptPath: string;

  constructor(log: Logger, captainPromptPath: string) {
    super();
    this.log = log;
    this.captainPromptPath = captainPromptPath;
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

    // Spawn captain
    const captain = await spawnCaptain({
      worktreePath,
      captainPromptPath: this.captainPromptPath,
      sessionId,
      cols,
      rows,
    });

    session.pid = captain.pid;

    // Capture remote control URL when detected
    captain.on('remoteUrl', (url) => {
      this.log.info({ sessionId, remoteUrl: url }, 'Remote control URL detected');
      const managed = this.sessions.get(sessionId);
      if (managed) {
        managed.session.remote_url = url;
      }
      this.emitEvent(sessionId, { type: 'remote_url', url });
    });

    // Forward captain output as WS events immediately (no buffering —
    // buffering can split ANSI escape sequences mid-sequence, causing garbled TUI output)
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

    // Watch .team/ files for changes
    const watcher = watchTeamFiles(worktreePath, (filename, content) => {
      this.log.debug({ sessionId, filename }, 'Team file changed');

      // Emit team_file event
      this.emitEvent(sessionId, { type: 'team_file', file: filename, content });

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

            // Handle done state — auto-cleanup after grace period
            if (oldState.phase !== 'done' && newState.phase === 'done') {
              this.scheduleCleanup(sessionId);
            }

            managed.session.state = newState;
            this.emitEvent(sessionId, { type: 'state', state: newState });
          }
        } catch {
          this.log.warn({ sessionId }, 'Failed to parse state.json update');
        }
      }
    });

    const managed: ManagedSession = {
      session,
      captain,
      watcher,
      lastDiff: '',
      diffTimer: null,
    };
    this.sessions.set(sessionId, managed);

    this.log.info({ sessionId, pid: captain.pid }, 'Session created');
    return session;
  }

  getSession(id: string): Session {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }
    return managed.session;
  }

  async getSessionDetail(id: string): Promise<SessionDetail> {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }

    const team = await readAllTeamFiles(managed.session.worktree_path);
    return { ...managed.session, team };
  }

  listSessions(): SessionSummary[] {
    return Array.from(this.sessions.values()).map(({ session }) => ({
      id: session.meta.id,
      title: session.meta.title,
      source_repo: session.meta.source_repo,
      phase: session.state.phase,
      active_specialist: session.state.active_specialist,
      created_at: session.meta.created_at,
      last_checkpoint: session.state.last_checkpoint,
      must_ask_count: session.state.must_ask_pending.length,
    }));
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

  private scheduleCleanup(sessionId: string): void {
    const GRACE_PERIOD = 30_000; // 30 seconds
    this.log.info({ sessionId, gracePeriodMs: GRACE_PERIOD }, 'Scheduling auto-cleanup for done session');

    setTimeout(async () => {
      const managed = this.sessions.get(sessionId);
      if (!managed) return;

      // Wait for captain to exit if still running
      if (managed.captain?.running) {
        this.log.info({ sessionId }, 'Waiting for captain to exit before cleanup');
        await new Promise<void>((resolve) => {
          managed.captain!.on('exit', () => resolve());
          // Safety timeout — don't wait forever
          setTimeout(resolve, 10_000);
        });
      }

      try {
        await this.cleanSession(sessionId);
        this.log.info({ sessionId }, 'Auto-cleanup completed for done session');
      } catch (err) {
        this.log.error({ sessionId, err }, 'Auto-cleanup failed');
      }
    }, GRACE_PERIOD);
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
