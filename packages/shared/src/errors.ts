export class MyTeamError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MyTeamError';
    this.code = code;
  }
}

export class SessionNotFoundError extends MyTeamError {
  constructor(id: string) {
    super(`Session not found: ${id}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class SessionActiveError extends MyTeamError {
  constructor(id: string) {
    super(`Session is still active: ${id}. Kill it first.`, 'SESSION_ACTIVE');
    this.name = 'SessionActiveError';
  }
}

export class SessionProcessDeadError extends MyTeamError {
  constructor(id: string) {
    super(`Session '${id}' exists but its captain process is not running.`, 'SESSION_PROCESS_DEAD');
    this.name = 'SessionProcessDeadError';
  }
}

/**
 * The session's worktree directory exists on disk, but it is not in a
 * resumable state — typically because `.team/meta.json` is missing,
 * unreadable, or contains invalid JSON. Distinct from `SessionNotFoundError`
 * (worktree absent) so callers can give the right guidance: a missing
 * worktree warrants `team list` to find a real ID; a corrupt one warrants
 * `team purge` to clean it up.
 */
export class SessionCorruptError extends MyTeamError {
  constructor(id: string, reason?: string) {
    const detail = reason ? ` (${reason})` : '';
    super(
      `Session '${id}' worktree is corrupt or not resumable${detail}. Consider 'team purge ${id}'.`,
      'SESSION_CORRUPT',
    );
    this.name = 'SessionCorruptError';
  }
}

export class NotAGitRepoError extends MyTeamError {
  constructor(path: string) {
    super(`Not a git repository: ${path}`, 'NOT_A_GIT_REPO');
    this.name = 'NotAGitRepoError';
  }
}

export class WorktreeError extends MyTeamError {
  constructor(message: string) {
    super(message, 'WORKTREE_ERROR');
    this.name = 'WorktreeError';
  }
}

export class ClaudeProcessError extends MyTeamError {
  constructor(message: string) {
    super(message, 'CLAUDE_PROCESS_ERROR');
    this.name = 'ClaudeProcessError';
  }
}

export class RepoRegistryError extends MyTeamError {
  constructor(message: string) {
    super(message, 'REPO_REGISTRY_ERROR');
    this.name = 'RepoRegistryError';
  }
}

export class EmptyProjectInitError extends MyTeamError {
  constructor(message: string) {
    super(message, 'EMPTY_PROJECT_INIT_ERROR');
    this.name = 'EmptyProjectInitError';
  }
}
