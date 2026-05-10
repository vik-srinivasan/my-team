export class ViktownError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ViktownError';
    this.code = code;
  }
}

export class SessionNotFoundError extends ViktownError {
  constructor(id: string) {
    super(`Session not found: ${id}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class SessionActiveError extends ViktownError {
  constructor(id: string) {
    super(`Session is still active: ${id}. Kill it first.`, 'SESSION_ACTIVE');
    this.name = 'SessionActiveError';
  }
}

export class SessionProcessDeadError extends ViktownError {
  constructor(id: string) {
    super(`Session '${id}' exists but its captain process is not running.`, 'SESSION_PROCESS_DEAD');
    this.name = 'SessionProcessDeadError';
  }
}

export class NotAGitRepoError extends ViktownError {
  constructor(path: string) {
    super(`Not a git repository: ${path}`, 'NOT_A_GIT_REPO');
    this.name = 'NotAGitRepoError';
  }
}

export class WorktreeError extends ViktownError {
  constructor(message: string) {
    super(message, 'WORKTREE_ERROR');
    this.name = 'WorktreeError';
  }
}

export class ClaudeProcessError extends ViktownError {
  constructor(message: string) {
    super(message, 'CLAUDE_PROCESS_ERROR');
    this.name = 'ClaudeProcessError';
  }
}

export class RepoRegistryError extends ViktownError {
  constructor(message: string) {
    super(message, 'REPO_REGISTRY_ERROR');
    this.name = 'RepoRegistryError';
  }
}

export class EmptyProjectInitError extends ViktownError {
  constructor(message: string) {
    super(message, 'EMPTY_PROJECT_INIT_ERROR');
    this.name = 'EmptyProjectInitError';
  }
}
