import { ExternalLink } from 'lucide-react';

import { SessionList } from './components/SessionList.js';
import { AgentList } from './components/AgentList.js';
import { Chat } from './components/Chat.js';
import { RightPanel } from './components/RightPanel.js';
import { NotificationBanner } from './components/NotificationBanner.js';
import { useSession } from './hooks/useSession.js';
import { useSessionStore } from './store.js';
import { phaseDot, phaseLabel } from './lib/phase.js';

export function App() {
  useSession();
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const sessionState = useSessionStore((s) => s.sessionState);
  const remoteUrl = useSessionStore((s) => s.remoteUrl);

  const selectedSession = sessions.find((s) => s.id === selectedId);
  const phase = sessionState?.phase ?? selectedSession?.phase ?? '';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <NotificationBanner />

      {/* Header bar */}
      {selectedId && selectedSession && (
        <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${phaseDot(phase)}`} />
            <span className="text-sm font-medium text-zinc-200">
              {selectedSession.title}
            </span>
            <span className="text-xs text-zinc-500">
              {phaseLabel(phase)}
            </span>
          </div>
          <span className="text-xs text-zinc-600">{selectedSession.id}</span>
          <div className="ml-auto flex items-center gap-3">
            {remoteUrl && (
              <a
                href={remoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-blue-600/20 px-2.5 py-1 text-xs text-blue-400 hover:bg-blue-600/30 transition-colors"
              >
                <ExternalLink size={12} />
                Remote Control
              </a>
            )}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left column */}
        <div className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
          <SessionList />
          {selectedId && <AgentList />}
        </div>

        {/* Middle column - Chat */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedId ? (
            <Chat />
          ) : (
            <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">
              Select or create a session to begin
            </div>
          )}
        </div>

        {/* Right column - Artifacts */}
        {selectedId && (
          <div className="flex w-[520px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
            <RightPanel />
          </div>
        )}
      </div>
    </div>
  );
}
