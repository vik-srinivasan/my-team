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

export class AgentNotFoundError extends MyTeamError {
  constructor(name: string) {
    super(`Agent prompt not found: ${name}`, 'AGENT_NOT_FOUND');
    this.name = 'AgentNotFoundError';
  }
}

export class InvalidAgentNameError extends MyTeamError {
  constructor(name: string) {
    super(
      `Invalid agent name: '${name}'. Must match /^[a-z][a-z0-9-]*$/.`,
      'INVALID_AGENT_NAME',
    );
    this.name = 'InvalidAgentNameError';
  }
}

export class InvalidWorkflowConfigError extends MyTeamError {
  constructor(message: string) {
    super(message, 'INVALID_WORKFLOW_CONFIG');
    this.name = 'InvalidWorkflowConfigError';
  }
}
