import { useSessionStore } from '../store.js';

const PIPELINE = [
  { key: 'scout', label: 'Scout' },
  { key: 'engineer', label: 'Eng' },
  { key: 'tester', label: 'Test' },
  { key: 'reviewer', label: 'Rev' },
  { key: 'git', label: 'Git' },
] as const;

function getStatus(
  agent: string,
  active: string | null,
  phase: string,
): 'active' | 'done' | 'idle' {
  if (active === agent) return 'active';
  // Consider agents "done" if we're past their phase
  if (phase === 'done' || phase === 'cleaned') return 'done';
  return 'idle';
}

export function AgentList() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const phase = sessionState?.phase ?? 'created';
  const active = sessionState?.active_specialist ?? null;

  return (
    <div className="border-t border-zinc-800 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`h-1.5 w-1.5 rounded-full ${
          phase === 'done' || phase === 'cleaned' ? 'bg-green-400' :
          phase === 'killed' ? 'bg-zinc-500' :
          'bg-blue-400 animate-pulse'
        }`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Captain</span>
      </div>
      <div className="flex items-center gap-0.5">
        {PIPELINE.map((agent, i) => {
          const status = getStatus(agent.key, active, phase);
          return (
            <div key={agent.key} className="flex items-center">
              <div
                className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                  status === 'active'
                    ? 'bg-blue-600/30 text-blue-300 font-medium'
                    : status === 'done'
                      ? 'bg-zinc-800 text-zinc-500'
                      : 'bg-zinc-800/50 text-zinc-600'
                }`}
              >
                {agent.label}
              </div>
              {i < PIPELINE.length - 1 && (
                <span className="text-zinc-700 text-xs mx-0.5">›</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
