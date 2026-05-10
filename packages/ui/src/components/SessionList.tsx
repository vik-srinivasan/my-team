import { useState } from 'react';
import { Plus } from 'lucide-react';

import { useSessionStore } from '../store.js';
import { NewSessionModal } from './NewSessionModal.js';
import { api } from '../api.js';

const PHASE_COLORS: Record<string, string> = {
  created: 'bg-zinc-700',
  scouting: 'bg-cyan-800',
  planning: 'bg-cyan-800',
  awaiting_approval: 'bg-amber-800',
  executing: 'bg-blue-800',
  reviewing: 'bg-purple-800',
  done: 'bg-green-800',
  blocked: 'bg-red-800',
  killed: 'bg-zinc-700',
  cleaned: 'bg-zinc-700',
};

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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Sessions
        </h2>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="New session"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-zinc-500">No sessions</p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                selectedId === s.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <div className="truncate font-medium">{s.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                <span
                  className={`rounded px-1.5 py-0.5 text-zinc-200 ${PHASE_COLORS[s.phase] ?? 'bg-zinc-700'}`}
                >
                  {s.phase.replace('_', ' ')}
                </span>
                <span className="truncate">{s.source_repo.split('/').pop()}</span>
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
