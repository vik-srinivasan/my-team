import { SessionList } from './components/SessionList.js';
import { AgentList } from './components/AgentList.js';
import { Chat } from './components/Chat.js';
import { DiffPanel } from './components/DiffPanel.js';
import { TeamArtifactPanel } from './components/TeamArtifactPanel.js';
import { useSessionStore } from './store.js';

export function App() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const rightTab = useSessionStore((s) => s.rightTab);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left column */}
      <div className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <SessionList />
        {selectedId && <AgentList />}
      </div>

      {/* Middle column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedId ? (
          <Chat />
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            Select or create a session to begin
          </div>
        )}
      </div>

      {/* Right column */}
      <div className="flex w-[480px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
        {selectedId ? (
          rightTab === 'diff' ? (
            <DiffPanel />
          ) : (
            <TeamArtifactPanel />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            No session selected
          </div>
        )}
      </div>
    </div>
  );
}
