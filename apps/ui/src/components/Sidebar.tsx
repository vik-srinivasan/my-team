import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { useSessions } from '../hooks/useSessions.js';
import { useUiStore } from '../store.js';
import { SidebarItem } from './SidebarItem.js';
import { NewSessionModal } from './NewSessionModal.js';
import { SkeletonList } from './Skeleton.js';

/**
 * Fixed-width left rail. Header has a search box and a "+ New session"
 * button; body is the attention-sorted session list. Width matches the
 * spec at 280px so designer's screenshots line up with `apps/landing/`.
 */
export function Sidebar(): ReactElement {
  const { attentionSorted, isLoading, isError } = useSessions();
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);
  const setSelectedSessionId = useUiStore((s) => s.setSelectedSessionId);
  const newSessionRequestNonce = useUiStore((s) => s.newSessionRequestNonce);

  const [query, setQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  // Open the New Session modal when any external surface bumps the nonce
  // (today: the ⌘N keyboard shortcut). The initial 0 nonce is ignored;
  // every subsequent change toggles the modal open.
  useEffect(() => {
    if (newSessionRequestNonce > 0) {
      setShowNewModal(true);
    }
  }, [newSessionRequestNonce]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return attentionSorted;
    return attentionSorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.source_repo.toLowerCase().includes(q),
    );
  }, [attentionSorted, query]);

  return (
    <aside
      data-testid="sidebar"
      className="w-[280px] shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col h-full"
    >
      <header className="p-3 border-b border-neutral-800 flex items-center gap-2">
        <input
          type="search"
          aria-label="Search sessions"
          placeholder="Search sessions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-0 rounded-sm bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          aria-label="New session"
          title="New session"
          className="shrink-0 rounded-sm bg-neutral-900 text-neutral-300 px-2 py-1 text-sm font-medium hover:bg-neutral-800 hover:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto" data-testid="sidebar-list">
        {isLoading ? (
          <SkeletonList
            count={4}
            rowClassName="h-12 w-full"
            containerClassName="space-y-2 p-3"
          />
        ) : filtered.length === 0 && query.length === 0 ? (
          // Show the "no sessions yet" hint even when the daemon is down so
          // first-time users see something useful instead of a wall of red.
          // The daemon-state pill at the bottom carries the error signal.
          <p className="p-4 text-sm text-neutral-500">
            No sessions yet. Click + to create one.
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">No sessions match "{query}".</p>
        ) : (
          <ul className="py-1">
            {filtered.map((session) => (
              <li key={session.id}>
                <SidebarItem
                  session={session}
                  selected={session.id === selectedSessionId}
                  onSelect={setSelectedSessionId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <DaemonStatusRow isError={isError} isLoading={isLoading} />

      {showNewModal ? (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setSelectedSessionId(id);
            setShowNewModal(false);
          }}
        />
      ) : null}
    </aside>
  );
}

/**
 * Small status pill at the bottom of the sidebar. Surfaces wrapper-daemon
 * reachability as a colored dot + short caption rather than swallowing the
 * session list when the daemon is unreachable. Keep the copy short — the
 * full instructions live in `apps/ui/README.md`.
 */
function DaemonStatusRow({
  isError,
  isLoading,
}: {
  isError: boolean;
  isLoading: boolean;
}): ReactElement {
  if (isError) {
    return (
      <div
        data-testid="daemon-status"
        data-status="error"
        className="border-t border-neutral-800 px-3 py-2 flex items-center gap-2 text-xs text-neutral-400"
        role="status"
      >
        <span
          aria-hidden
          className="size-2 rounded-full bg-red-500 shrink-0"
        />
        <span>
          Wrapper daemon unreachable. Run{' '}
          <code className="rounded-sm bg-neutral-900 px-1 py-0.5 text-[11px] text-neutral-200">
            team start
          </code>
          .
        </span>
      </div>
    );
  }
  return (
    <div
      data-testid="daemon-status"
      data-status={isLoading ? 'connecting' : 'connected'}
      className="border-t border-neutral-800 px-3 py-2 flex items-center gap-2 text-xs text-neutral-500"
      role="status"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full shrink-0 ${
          isLoading ? 'bg-yellow-500' : 'bg-green-500'
        }`}
      />
      <span>{isLoading ? 'Connecting to daemon…' : 'Daemon connected'}</span>
    </div>
  );
}
