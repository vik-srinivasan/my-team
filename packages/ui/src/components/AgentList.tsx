import { useSessionStore } from '../store.js';

const AGENTS = ['captain', 'scout', 'engineer', 'tester', 'reviewer', 'git'] as const;

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'text-green-400';
    case 'done':
      return 'text-zinc-400';
    case 'blocked':
      return 'text-amber-400';
    default:
      return 'text-zinc-600';
  }
}

function getAgentStatus(
  agentName: string,
  activeSpecialist: string | null,
  phase: string,
): string {
  if (agentName === 'captain') {
    return phase === 'done' || phase === 'cleaned' ? 'done' : 'active';
  }
  if (activeSpecialist === agentName) return 'active';
  if (phase === 'done' || phase === 'cleaned') return 'done';
  return 'idle';
}

export function AgentList() {
  const sessionState = useSessionStore((s) => s.sessionState);

  return (
    <div className="border-t border-zinc-800">
      <div className="px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Agents
        </h2>
      </div>
      <div className="pb-2">
        {AGENTS.map((agent) => {
          const status = getAgentStatus(
            agent,
            sessionState?.active_specialist ?? null,
            sessionState?.phase ?? 'created',
          );
          return (
            <div
              key={agent}
              className="flex items-center gap-2 px-3 py-1 text-sm"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === 'active' ? 'bg-green-400' : status === 'done' ? 'bg-zinc-500' : 'bg-zinc-700'
                }`}
              />
              <span className="text-zinc-300">{agent}</span>
              <span className={`ml-auto text-xs ${statusColor(status)}`}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
