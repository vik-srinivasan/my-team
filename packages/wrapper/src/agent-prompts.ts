import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import type {
  AgentListResponse,
  AgentPrompt,
  AgentPromptResponse,
  AgentSource,
  SessionMeta,
} from '@my-team/shared';
import {
  AgentNotFoundError,
  InvalidAgentNameError,
  SessionNotFoundError,
} from '@my-team/shared';

import { getWorktreePath } from './worktree.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Packaged-default agent prompts ship at `<repo-root>/agent-prompts/<name>.md`,
 * three levels above the compiled wrapper at
 * `packages/wrapper/dist/agent-prompts.js`. Source builds at
 * `packages/wrapper/src/agent-prompts.ts` resolve to the same place because
 * `__dirname` is one segment deeper at compile-time (../../..).
 */
const PACKAGED_DEFAULTS_DIR = resolve(__dirname, '..', '..', '..', 'agent-prompts');
const USER_AGENTS_DIR = join(homedir(), '.claude', 'agents');

/**
 * The nine specialists the captain dispatches plus the captain itself.
 * The Workflow tab always shows entries for these regardless of which
 * layers actually have a `.md` on disk — `exists: false` means the user
 * is editing a brand-new override.
 *
 * Keep in sync with `agent-prompts/` on disk.
 */
const DEFAULT_AGENT_NAMES = [
  'captain',
  'scout',
  'engineer',
  'tester',
  'reviewer',
  'designer',
  'runner',
  'auditor',
  'documenter',
  'debugger',
] as const;

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Validate an agent name against the wrapper's allowlist regex and throw
 * `InvalidAgentNameError` on mismatch. Prevents path traversal (no `..`,
 * no `/`, no leading dot) on the route inputs.
 */
export function assertValidAgentName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new InvalidAgentNameError(name);
  }
}

interface ResolvedLayer {
  source: AgentSource;
  path: string;
}

/**
 * Ordered fallback layers for reading a named agent prompt. Order matters:
 * the first layer with a file on disk wins.
 */
function candidateLayers(
  worktreePath: string,
  sourceRepo: string,
  name: string,
): ResolvedLayer[] {
  return [
    { source: 'session', path: join(worktreePath, '.claude', 'agents', `${name}.md`) },
    { source: 'repo', path: join(sourceRepo, '.claude', 'agents', `${name}.md`) },
    { source: 'user', path: join(USER_AGENTS_DIR, `${name}.md`) },
    { source: 'default', path: join(PACKAGED_DEFAULTS_DIR, `${name}.md`) },
  ];
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return null;
    throw err;
  }
}

async function listMdNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((e) => e.endsWith('.md'))
      .map((e) => e.replace(/\.md$/, ''));
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw err;
  }
}

/**
 * Minimal session-lookup contract used by the agent-prompts module. The
 * wrapper passes a real `SessionManager` at runtime; tests can stub this.
 */
export interface SessionLookup {
  /** Returns the session's meta + worktree path, or throws `SessionNotFoundError`. */
  getSession(id: string): { meta: SessionMeta; worktree_path: string };
}

/**
 * List the agents available for a session. The returned list always
 * contains an entry for each of the 10 default agents (captain + 9
 * specialists), plus any extra `.md` files found in the session
 * worktree's `.claude/agents/` directory. For each entry, `source` is
 * the layer that would currently supply the body (session → repo →
 * user → default), and `exists` is true iff ANY layer has it.
 */
export async function listAgents(
  sessions: SessionLookup,
  sessionId: string,
): Promise<AgentListResponse> {
  const session = sessions.getSession(sessionId);
  const { worktree_path: worktreePath, meta } = session;
  const sourceRepo = meta.source_repo;

  // Discover extras in the worktree's session-layer dir.
  const sessionDir = join(worktreePath, '.claude', 'agents');
  const sessionNames = await listMdNames(sessionDir);

  const names = new Set<string>([...DEFAULT_AGENT_NAMES, ...sessionNames]);

  const agents: AgentPrompt[] = [];
  for (const name of names) {
    if (!NAME_PATTERN.test(name)) continue; // skip anything weird in the dir
    const layers = candidateLayers(worktreePath, sourceRepo, name);
    let source: AgentSource | null = null;
    for (const layer of layers) {
      const body = await readIfExists(layer.path);
      if (body !== null) {
        source = layer.source;
        break;
      }
    }
    agents.push({ name, exists: source !== null, source });
  }

  // Stable alphabetical order so the UI doesn't shuffle on each fetch.
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return { agents };
}

/**
 * Read a single agent prompt for a session, walking the fallback layers
 * until a body is found. Throws `AgentNotFoundError` if no layer has it.
 */
export async function getAgent(
  sessions: SessionLookup,
  sessionId: string,
  name: string,
): Promise<AgentPromptResponse> {
  assertValidAgentName(name);
  const session = sessions.getSession(sessionId);
  const { worktree_path: worktreePath, meta } = session;
  const layers = candidateLayers(worktreePath, meta.source_repo, name);

  for (const layer of layers) {
    const body = await readIfExists(layer.path);
    if (body !== null) {
      return { name, content: body, source: layer.source };
    }
  }
  throw new AgentNotFoundError(name);
}

/**
 * Write an agent prompt for a session. Always writes to the session
 * worktree's `.claude/agents/<name>.md`, creating the directory if
 * needed. Returns the saved body tagged with `source: 'session'` so the
 * client sees the new effective layer immediately.
 */
export async function putAgent(
  sessions: SessionLookup,
  sessionId: string,
  name: string,
  content: string,
): Promise<AgentPromptResponse> {
  assertValidAgentName(name);
  const session = sessions.getSession(sessionId);
  const { worktree_path: worktreePath } = session;
  const dir = join(worktreePath, '.claude', 'agents');
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${name}.md`);
  await writeFile(filePath, content, 'utf-8');
  return { name, content, source: 'session' };
}

/**
 * Convenience wrapper that adapts a `SessionManager`-like object to the
 * `SessionLookup` interface used by the module. The wrapper's
 * `SessionManager.getSession(id)` already returns the right shape and
 * throws `SessionNotFoundError`, so this is just a runtime guard for
 * code paths that pass in something narrower.
 */
export function adaptSessionLookup<T extends { getSession(id: string): unknown }>(
  manager: T,
): SessionLookup {
  return {
    getSession(id: string): { meta: SessionMeta; worktree_path: string } {
      const session = manager.getSession(id);
      if (
        typeof session !== 'object' ||
        session === null ||
        !('meta' in session) ||
        !('worktree_path' in session)
      ) {
        throw new SessionNotFoundError(id);
      }
      return session as { meta: SessionMeta; worktree_path: string };
    },
  };
}

// Re-export getWorktreePath under a clearer alias for tests/callers that
// want the canonical session worktree without instantiating a manager.
export { getWorktreePath };
