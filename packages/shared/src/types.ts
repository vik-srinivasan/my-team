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

export interface WsTeamFileEvent {
  type: 'team_file';
  file: string;
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

export type WsClientEvent = WsClientInputEvent | WsClientResizeEvent;

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
