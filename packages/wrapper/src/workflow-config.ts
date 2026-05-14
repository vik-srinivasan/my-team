import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkflowConfig, EffortLevel } from '@my-team/shared';
import { InvalidWorkflowConfigError, KNOWN_CONDITIONAL_SPECIALISTS } from '@my-team/shared';

import type { SessionLookup } from './agent-prompts.js';

const KNOWN_NAMES: ReadonlySet<string> = new Set(KNOWN_CONDITIONAL_SPECIALISTS);
const KNOWN_EFFORTS: ReadonlySet<EffortLevel> = new Set<EffortLevel>([
  'light',
  'standard',
  'thorough',
]);

const DEFAULTS: WorkflowConfig = {
  disabled_specialists: [],
  forced_specialists: [],
};

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function configPath(worktreePath: string): string {
  return join(worktreePath, '.team', 'workflow.json');
}

/**
 * Validate a workflow config received from a client. Throws
 * `InvalidWorkflowConfigError` with a specific message on the first
 * problem found.
 */
export function validateWorkflowConfig(value: unknown): WorkflowConfig {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidWorkflowConfigError('Workflow config must be an object.');
  }
  const obj = value as Record<string, unknown>;

  for (const field of ['disabled_specialists', 'forced_specialists'] as const) {
    if (!Array.isArray(obj[field])) {
      throw new InvalidWorkflowConfigError(`Field '${field}' must be an array of strings.`);
    }
    for (const name of obj[field] as unknown[]) {
      if (typeof name !== 'string') {
        throw new InvalidWorkflowConfigError(`Field '${field}' must contain strings only.`);
      }
      if (!KNOWN_NAMES.has(name)) {
        throw new InvalidWorkflowConfigError(
          `Unknown specialist '${name}' in '${field}'. Allowed: ${[...KNOWN_NAMES].join(', ')}.`,
        );
      }
    }
  }

  // Disallow the same specialist appearing in both lists — the captain
  // wouldn't know which side wins, and "force" vs "disable" is a clear
  // user error rather than a sensible override.
  const disabled = new Set(obj['disabled_specialists'] as string[]);
  for (const forced of obj['forced_specialists'] as string[]) {
    if (disabled.has(forced)) {
      throw new InvalidWorkflowConfigError(
        `Specialist '${forced}' cannot appear in both disabled_specialists and forced_specialists.`,
      );
    }
  }

  let effort_override: EffortLevel | undefined;
  if ('effort_override' in obj && obj['effort_override'] !== undefined) {
    const raw = obj['effort_override'];
    if (typeof raw !== 'string' || !KNOWN_EFFORTS.has(raw as EffortLevel)) {
      throw new InvalidWorkflowConfigError(
        `Invalid effort_override '${String(raw)}'. Allowed: light | standard | thorough.`,
      );
    }
    effort_override = raw as EffortLevel;
  }

  const config: WorkflowConfig = {
    disabled_specialists: [...new Set(obj['disabled_specialists'] as string[])],
    forced_specialists: [...new Set(obj['forced_specialists'] as string[])],
  };
  if (effort_override !== undefined) {
    config.effort_override = effort_override;
  }
  return config;
}

/**
 * Read `.team/workflow.json` from the session worktree. Returns the
 * defaults `{ disabled_specialists: [], forced_specialists: [] }` if
 * the file is absent. Throws `InvalidWorkflowConfigError` if the file
 * exists but is malformed.
 */
export async function getWorkflowConfig(
  sessions: SessionLookup,
  sessionId: string,
): Promise<WorkflowConfig> {
  const session = sessions.getSession(sessionId);
  const path = configPath(session.worktree_path);

  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { ...DEFAULTS };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InvalidWorkflowConfigError(
      `Malformed workflow.json at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return validateWorkflowConfig(parsed);
}

/**
 * Validate + write `.team/workflow.json` for a session. Creates the
 * `.team/` directory if needed. Returns the saved (normalised) config
 * so the client sees exactly what landed on disk.
 */
export async function putWorkflowConfig(
  sessions: SessionLookup,
  sessionId: string,
  config: unknown,
): Promise<WorkflowConfig> {
  const session = sessions.getSession(sessionId);
  const normalised = validateWorkflowConfig(config);
  const path = configPath(session.worktree_path);
  await mkdir(join(session.worktree_path, '.team'), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalised, null, 2)}\n`, 'utf-8');
  return normalised;
}
