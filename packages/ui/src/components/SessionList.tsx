import { useSessionStore } from '../store.js';

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const selectSession = useSessionStore((s) => s.selectSession);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Sessions
        </h2>
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
                <span className="rounded bg-zinc-800 px-1.5 py-0.5">
                  {s.phase}
                </span>
                <span className="truncate">{s.source_repo.split('/').pop()}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
