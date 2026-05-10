import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { homedir } from 'node:os';

import type { RepoRecord, RepoRegistry, SessionMeta } from './types.js';
import { RepoRegistryError } from './errors.js';

export const DEFAULT_REGISTRY_PATH = join(homedir(), 'team', 'recents.json');

export type ShortcutResolution =
  | { kind: 'none' }
  | { kind: 'one'; path: string }
  | { kind: 'ambiguous'; candidates: string[] };

const EMPTY_REGISTRY: RepoRegistry = { version: 1, repos: [] };

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

export async function readRegistry(registryPath: string = DEFAULT_REGISTRY_PATH): Promise<RepoRegistry> {
  let raw: string;
  try {
    raw = await readFile(registryPath, 'utf-8');
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { version: 1, repos: [] };
    }
    throw new RepoRegistryError(
      `Failed to read registry at ${registryPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new RepoRegistryError(
      `Malformed registry JSON at ${registryPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('repos' in parsed) ||
    !Array.isArray((parsed as { repos: unknown }).repos)
  ) {
    throw new RepoRegistryError(`Registry at ${registryPath} is missing required fields`);
  }

  return parsed as RepoRegistry;
}

export async function writeRegistry(
  registry: RepoRegistry,
  registryPath: string = DEFAULT_REGISTRY_PATH,
): Promise<void> {
  const sorted: RepoRegistry = {
    ...registry,
    repos: [...registry.repos].sort((a, b) => b.last_used.localeCompare(a.last_used)),
  };
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
}

export async function recordSessionStart(
  meta: SessionMeta,
  registryPath: string = DEFAULT_REGISTRY_PATH,
): Promise<void> {
  const registry = await readRegistry(registryPath);
  const now = new Date().toISOString();
  const idx = registry.repos.findIndex((r) => r.path === meta.source_repo);

  if (idx >= 0) {
    const existing = registry.repos[idx] as RepoRecord;
    registry.repos[idx] = {
      ...existing,
      last_used: now,
      session_count: existing.session_count + 1,
      last_session_id: meta.id,
    };
  } else {
    const record: RepoRecord = {
      path: meta.source_repo,
      basename: basename(meta.source_repo),
      first_used: now,
      last_used: now,
      session_count: 1,
      last_session_id: meta.id,
    };
    registry.repos.push(record);
  }

  await writeRegistry(registry, registryPath);
}

export async function resolveShortcut(
  shortcut: string,
  registryPath: string = DEFAULT_REGISTRY_PATH,
): Promise<ShortcutResolution> {
  const registry = await readRegistry(registryPath).catch(() => EMPTY_REGISTRY);
  const matches = registry.repos.filter((r) => r.basename === shortcut);
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length === 1) {
    return { kind: 'one', path: (matches[0] as RepoRecord).path };
  }
  return { kind: 'ambiguous', candidates: matches.map((m) => m.path) };
}
