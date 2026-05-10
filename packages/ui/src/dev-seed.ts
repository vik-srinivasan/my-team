import type { SessionSummary } from '@my-team/shared';
import { useSessionStore } from './store.js';

/**
 * Seed mock sessions into the store for local UI development.
 *
 * Only run from the entrypoint when `import.meta.env.DEV` is true and
 * the URL contains `?seed=1` so it never fires against real data.
 *
 * The seed is intentionally varied to exercise:
 *   - critical badge (awaiting_approval, blocked, pending must-asks)
 *   - unread dot (last_checkpoint > lastViewed[id])
 *   - the "all clear" case
 *   - a terminal `done` session
 */
const NOW = Date.now();

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

const SEED_SESSIONS: SessionSummary[] = [
  {
    id: 'amber-fox-12',
    title: 'Add fog of war to map renderer',
    source_repo: '/repos/strategy-game',
    phase: 'awaiting_approval',
    active_specialist: 'captain',
    created_at: iso(-30 * 60_000),
    last_checkpoint: iso(-2 * 60_000),
    must_ask_count: 0,
  },
  {
    id: 'blocked-bear-44',
    title: 'Migrate auth to passkeys',
    source_repo: '/repos/auth-service',
    phase: 'blocked',
    active_specialist: null,
    created_at: iso(-3 * 60 * 60_000),
    last_checkpoint: iso(-15 * 60_000),
    must_ask_count: 0,
  },
  {
    id: 'curious-cat-08',
    title: 'Refactor billing webhooks',
    source_repo: '/repos/payments',
    phase: 'executing',
    active_specialist: 'engineer',
    created_at: iso(-90 * 60_000),
    last_checkpoint: iso(-45 * 1_000),
    must_ask_count: 2,
  },
  {
    id: 'drowsy-deer-31',
    title: 'Reduce bundle size on landing page',
    source_repo: '/repos/marketing-site',
    phase: 'reviewing',
    active_specialist: 'reviewer',
    created_at: iso(-2 * 60 * 60_000),
    last_checkpoint: iso(-8 * 60_000),
    must_ask_count: 0,
  },
  {
    id: 'eager-eel-77',
    title: 'Ship dark-mode polish',
    source_repo: '/repos/dashboard',
    phase: 'done',
    active_specialist: null,
    created_at: iso(-26 * 60 * 60_000),
    last_checkpoint: iso(-25 * 60 * 60_000),
    must_ask_count: 0,
  },
];

/**
 * Pre-populate the store with mock sessions and mark the older ones as
 * already viewed so that only the freshly-checkpointed sessions show
 * the unread dot.
 */
export function seedDevData(): void {
  const store = useSessionStore.getState();
  store.setSessions(SEED_SESSIONS);
  // Mark the older / terminal sessions as already viewed so the unread
  // dot only fires on the recently-active ones.
  store.markViewed('drowsy-deer-31');
  store.markViewed('eager-eel-77');
}
