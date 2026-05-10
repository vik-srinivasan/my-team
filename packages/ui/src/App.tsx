import { ExternalLink } from 'lucide-react';

import { SessionList } from './components/SessionList.js';
import { AgentList } from './components/AgentList.js';
import { OutputLog } from './components/OutputLog.js';
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

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="flex w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
          <SessionList />
          {selectedId && <AgentList />}
        </div>

        {/* Main pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedId && selectedSession ? (
            <>
              {/* Header bar */}
              <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
                <span className={`h-2 w-2 rounded-full ${phaseDot(phase)}`} />
                <span className="text-sm font-medium text-zinc-200">
                  {selectedSession.title}
                </span>
                <span className="text-xs text-zinc-500">
                  {phaseLabel(phase)}
                </span>
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

              <OutputLog />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
              Select or create a session to begin
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
