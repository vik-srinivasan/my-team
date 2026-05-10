import { useState } from 'react';
import { Plus } from 'lucide-react';

import { useSessionStore } from '../store.js';
import { NewSessionModal } from './NewSessionModal.js';
import { api } from '../api.js';

const PHASE_DOT: Record<string, string> = {
  created: 'bg-zinc-400',
  scouting: 'bg-cyan-400',
  planning: 'bg-cyan-400',
  awaiting_approval: 'bg-amber-400 animate-pulse',
  executing: 'bg-blue-400 animate-pulse',
  reviewing: 'bg-purple-400 animate-pulse',
  done: 'bg-green-400',
  blocked: 'bg-red-400 animate-pulse',
  killed: 'bg-zinc-500',
  cleaned: 'bg-zinc-600',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const selectSession = useSessionStore((s) => s.selectSession);
  const addSession = useSessionStore((s) => s.addSession);
  const [modalOpen, setModalOpen] = useState(false);

  const handleCreate = async (sourceRepo: string, title: string) => {
    const created = await api.sessions.create({ source_repo: sourceRepo, title });
    addSession({
      id: created.id,
      title,
      source_repo: sourceRepo,
      phase: created.phase,
      active_specialist: null,
      created_at: new Date().toISOString(),
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
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-600">No sessions yet</p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`w-full px-3 py-2 text-left transition-colors ${
                selectedId === s.id
                  ? 'bg-zinc-800 border-l-2 border-blue-500'
                  : 'border-l-2 border-transparent hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PHASE_DOT[s.phase] ?? 'bg-zinc-500'}`} />
                <span className="truncate text-sm font-medium text-zinc-200">{s.title}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-600">{timeAgo(s.created_at)}</span>
              </div>
              <div className="mt-0.5 ml-3.5 flex items-center gap-2 text-xs text-zinc-500">
                <span>{s.phase.replace('_', ' ')}</span>
                {s.active_specialist && (
                  <span className="text-cyan-500">{s.active_specialist}</span>
                )}
              </div>
            </button>
          ))
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
