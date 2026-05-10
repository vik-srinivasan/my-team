import { EventEmitter } from 'node:events';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
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

  async createSession(sourceRepo: string, title: string): Promise<Session> {
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
    };

    // Spawn captain
    const captain = await spawnCaptain({
      worktreePath,
      captainPromptPath: this.captainPromptPath,
    });

    session.pid = captain.pid;

    // Forward captain output as WS events
    captain.on('data', (text) => {
      this.emitEvent(sessionId, { type: 'output', text });
    });

    captain.on('exit', (code) => {
      this.log.info({ sessionId, code }, 'Captain process exited');
      const managed = this.sessions.get(sessionId);
      if (managed) {
        managed.session.pid = null;
        managed.captain = null;
      }
    });

    // Watch .team/ files for changes
    const watcher = watchTeamFiles(worktreePath, (filename, content) => {
      this.log.debug({ sessionId, filename }, 'Team file changed');

      // Emit team_file event
      this.emitEvent(sessionId, { type: 'team_file', file: filename, content });

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

    const managed: ManagedSession = { session, captain, watcher };
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
    }));
  }

  sendInput(id: string, text: string): void {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new SessionNotFoundError(id);
    }
    if (!managed.captain || !managed.captain.running) {
      throw new SessionNotFoundError(id); // Process not running
    }
    managed.captain.write(text);
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

    // Update state
    managed.session.state.phase = 'killed';
    managed.session.pid = null;
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

  private emitEvent(sessionId: string, event: WsServerEvent): void {
    this.emit('event', sessionId, event);
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
