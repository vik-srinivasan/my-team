// ── Session Phases ──────────────────────────────────────────────────

export type SessionPhase =
  | 'created'
  | 'scouting'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'reviewing'
  | 'done'
  | 'blocked'
  | 'killed'
  | 'cleaned';

// ── .team/ file schemas ─────────────────────────────────────────────

export interface SessionMeta {
  id: string;
  title: string;
  source_repo: string;
  source_branch: string;
  session_branch: string;
  created_at: string;
}

export interface SessionState {
  phase: SessionPhase;
  active_specialist: string | null;
  review_iterations: number;
  max_review_iterations: number;
  last_checkpoint: string;
  blockers: string[];
  must_ask_pending: string[];
}

export interface TeamFiles {
  meta: SessionMeta;
  state: SessionState;
  srd: string;
  plan: string;
  context: string;
  tasks: string;
  journal: string;
  review: string;
  decisions: string;
}

// ── Session (runtime) ───────────────────────────────────────────────

export interface Session {
  meta: SessionMeta;
  state: SessionState;
  worktree_path: string;
  pid: number | null;
  started_at: string;
  remote_url: string | null;
}

// ── WebSocket events ────────────────────────────────────────────────

export interface WsOutputEvent {
  type: 'output';
  text: string;
}

export interface WsStateEvent {
  type: 'state';
  state: SessionState;
}

export type TeamFileName = 'plan' | 'tasks' | 'journal' | 'review';

export interface WsTeamFileEvent {
  type: 'team_file';
  name: TeamFileName;
  content: string;
}

export interface WsDiffEvent {
  type: 'diff';
  diff: string;
}

export type SpecialistStatus = 'started' | 'finished';

export interface WsSpecialistEvent {
  type: 'specialist';
  name: string;
  status: SpecialistStatus;
}

export interface WsRemoteUrlEvent {
  type: 'remote_url';
  url: string;
}

export type WsServerEvent =
  | WsOutputEvent
  | WsStateEvent
  | WsTeamFileEvent
  | WsDiffEvent
  | WsSpecialistEvent
  | WsRemoteUrlEvent;

export interface WsClientInputEvent {
  type: 'input';
  text: string;
}

export interface WsClientResizeEvent {
  type: 'resize';
  cols: number;
  rows: number;
}

/**
 * Identifies the client role on first WS message after connect. The
 * wrapper uses this to enforce CLI-priority resize authority: while any
 * `cli` client is attached to a session, `web` clients' resize messages
 * are dropped (the CLI is the "true" view; the web UI is a viewer).
 *
 * Backwards-compatible: legacy clients that don't send a hello are
 * treated as `web`.
 */
export type WsClientRole = 'web' | 'cli';

export interface WsClientHelloEvent {
  type: 'hello';
  role: WsClientRole;
}

export type WsClientEvent =
  | WsClientInputEvent
  | WsClientResizeEvent
  | WsClientHelloEvent;

// ── HTTP API types ──────────────────────────────────────────────────

export interface CreateSessionRequest {
  source_repo: string;
  title: string;
  cols?: number;
  rows?: number;
}

export interface CreateSessionResponse {
  id: string;
  title: string;
  worktree_path: string;
  phase: SessionPhase;
  remote_url: string | null;
}

export interface SessionSummary {
  id: string;
  title: string;
  source_repo: string;
  phase: SessionPhase;
  active_specialist: string | null;
  created_at: string;
  last_checkpoint: string;
  must_ask_count: number;
}

export interface SessionDetail extends Session {
  team: TeamFiles;
}

export interface SendInputRequest {
  text: string;
}

export interface DiffResponse {
  diff: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
}

// ── Recents registry ────────────────────────────────────────────────

export interface RepoRecord {
  path: string;
  basename: string;
  first_used: string;
  last_used: string;
  session_count: number;
  last_session_id: string;
}

export interface RepoRegistry {
  version: 1;
  repos: RepoRecord[];
}

/**
 * Compact shape of the recents registry surfaced by the wrapper's
 * `GET /api/repos/recents` endpoint and consumed by the UI's
 * New Session modal. Mirrors `RepoRecord` minus the bookkeeping fields
 * the UI doesn't need.
 */
export interface RecentRepo {
  path: string;
  basename: string;
  last_used: string;
  session_count: number;
}

export interface RecentReposResponse {
  repos: RecentRepo[];
}

// ── Agent prompts (Workflow tab) ────────────────────────────────────

/**
 * Where an agent-prompt body was resolved from.
 *
 * - `session` — the session's own `<worktree>/.claude/agents/<name>.md`
 *   (highest priority; the user's editable copy via the UI Workflow tab).
 * - `repo` — the source repo's `<repo>/.claude/agents/<name>.md`.
 * - `user` — the per-user `~/.claude/agents/<name>.md`.
 * - `default` — the packaged my-team default at
 *   `<repo-root>/agent-prompts/<name>.md`.
 */
export type AgentSource = 'session' | 'repo' | 'user' | 'default';

export interface AgentPrompt {
  /** kebab-case agent name (e.g. `engineer`, `tester`). */
  name: string;
  /** Whether ANY layer (session/repo/user/default) has this prompt on disk. */
  exists: boolean;
  /** The layer the prompt body would currently come from, if any. */
  source: AgentSource | null;
}

export interface AgentListResponse {
  agents: AgentPrompt[];
}

export interface AgentPromptResponse {
  name: string;
  content: string;
  source: AgentSource;
}

export interface PutAgentPromptRequest {
  content: string;
}

// ── Workflow config (per-session .team/workflow.json) ───────────────

/**
 * Effort level the captain applies to the session. Mirrors the
 * captain.md vocabulary. Set on the session via the Workflow tab to
 * override what `plan.md` already records.
 */
export type EffortLevel = 'light' | 'standard' | 'thorough';

/**
 * Per-session overrides the captain honors when deciding which
 * conditional specialists to dispatch. Lives at
 * `<worktree>/.team/workflow.json` and is read by the captain via the
 * "Workflow config overrides" section of `agent-prompts/captain.md`.
 */
export interface WorkflowConfig {
  /** Conditional specialist names the captain MUST skip. */
  disabled_specialists: string[];
  /** Conditional specialist names the captain MUST dispatch even if the trigger doesn't fire. */
  forced_specialists: string[];
  /** Replaces the plan.md effort level for dispatch-table decisions. */
  effort_override?: EffortLevel;
}

/** Names of every conditional specialist this config can toggle. */
export const KNOWN_CONDITIONAL_SPECIALISTS = [
  'designer',
  'runner',
  'auditor',
  'documenter',
  'debugger',
] as const;

export type ConditionalSpecialistName = (typeof KNOWN_CONDITIONAL_SPECIALISTS)[number];
