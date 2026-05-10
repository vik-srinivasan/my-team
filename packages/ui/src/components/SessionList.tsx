import { useState, useMemo } from 'react';
import { Plus, AlertCircle } from 'lucide-react';

import type { SessionSummary } from '@my-team/shared';
import { useSessionStore } from '../store.js';
import { NewSessionModal } from './NewSessionModal.js';
import { api } from '../api.js';
import { phaseFriendlyLabel } from '../lib/phase.js';
import { getAttention, type Attention } from '../lib/attention.js';

/**
 * Map the derived attention state to a single Tailwind background class used
 * by the prominent left-edge status indicator. Red beats yellow beats green.
 */
function attentionDotClass(attention: Attention): string {
  if (attention.critical) return 'bg-red-500';
  if (attention.hasUpdate) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface DecoratedSession {
  session: SessionSummary;
  attention: Attention;
}

/** Sort: critical first, then unread updates, then most recent activity. */
function sortSessions(decorated: DecoratedSession[]): DecoratedSession[] {
  return [...decorated].sort((a, b) => {
    if (a.attention.critical !== b.attention.critical) {
      return a.attention.critical ? -1 : 1;
    }
    if (a.attention.hasUpdate !== b.attention.hasUpdate) {
      return a.attention.hasUpdate ? -1 : 1;
    }
    // Recency: most recent activity first. Fall back to created_at.
    const aTime = a.session.last_checkpoint || a.session.created_at;
    const bTime = b.session.last_checkpoint || b.session.created_at;
    return bTime.localeCompare(aTime);
  });
}

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const selectSession = useSessionStore((s) => s.selectSession);
  const addSession = useSessionStore((s) => s.addSession);
  const lastViewed = useSessionStore((s) => s.lastViewed);
  const [modalOpen, setModalOpen] = useState(false);

  const decorated = useMemo<DecoratedSession[]>(() => {
    const annotated = sessions.map((session) => ({
      session,
      attention: getAttention(session, lastViewed),
    }));
    return sortSessions(annotated);
  }, [sessions, lastViewed]);

  const handleCreate = async (sourceRepo: string, title: string) => {
    const created = await api.sessions.create({ source_repo: sourceRepo, title });
    const now = new Date().toISOString();
    addSession({
      id: created.id,
      title,
      source_repo: sourceRepo,
      phase: created.phase,
      active_specialist: null,
      created_at: now,
      last_checkpoint: now,
      must_ask_count: 0,
    });
    selectSession(created.id);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Sessions
        </h2>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="New session"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {decorated.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-600">No sessions yet</p>
        ) : (
          decorated.map(({ session: s, attention }) => {
            const isSelected = selectedId === s.id;
            const ageSource = s.last_checkpoint || s.created_at;
            return (
              <button
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={`w-full px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-zinc-800 border-l-2 border-blue-500'
                    : 'border-l-2 border-transparent hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ring-2 ring-zinc-950 ${attentionDotClass(
                      attention,
                    )} ${attention.critical ? 'animate-pulse' : ''}`}
                    title={
                      attention.critical
                        ? attention.reason ?? 'Needs attention'
                        : attention.hasUpdate
                        ? 'New activity'
                        : 'Running smoothly'
                    }
                  />
                  <span className="truncate text-sm font-medium text-zinc-200">{s.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-zinc-600">
                    {timeAgo(ageSource)}
                  </span>
                </div>
                <div className="mt-1 ml-[1.375rem] flex items-center gap-2 text-xs text-zinc-500">
                  <span className="truncate">
                    {phaseFriendlyLabel(s.phase, s.active_specialist)}
                  </span>
                  {attention.critical && attention.reason && (
                    <span
                      className="ml-auto flex items-center gap-1 rounded-full border border-red-700/50 bg-red-900/40 px-1.5 py-0.5 text-[10px] font-medium text-red-300"
                      title={attention.reason}
                    >
                      <AlertCircle size={10} />
                      {attention.reason}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
      <NewSessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
