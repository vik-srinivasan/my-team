import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

import { SessionList } from './components/SessionList.js';
import { AgentList } from './components/AgentList.js';
import {
  CaptainTerminal,
  type CaptainTerminalHandle,
} from './components/CaptainTerminal.js';
import { ArtifactPanel } from './components/ArtifactPanel.js';
import { NotificationBanner } from './components/NotificationBanner.js';
import { useSession } from './hooks/useSession.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useSessionStore } from './store.js';
import { phaseDot, phaseLabel } from './lib/phase.js';
import { api } from './api.js';

/** Viewport width at which the ArtifactPanel moves from right-rail to a
 * collapsible bottom accordion. Matches Tailwind's `xl` breakpoint feel
 * but anchored to the 1100px figure called out in the plan. */
const WIDE_LAYOUT_BREAKPOINT = 1100;

function useIsWideLayout(): boolean {
  const [isWide, setIsWide] = useState(() =>
    typeof window === 'undefined'
      ? true
      : window.innerWidth >= WIDE_LAYOUT_BREAKPOINT,
  );

  useEffect(() => {
    const onResize = () => {
      setIsWide(window.innerWidth >= WIDE_LAYOUT_BREAKPOINT);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isWide;
}

export function App() {
  useSession();
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const sessionState = useSessionStore((s) => s.sessionState);
  const remoteUrl = useSessionStore((s) => s.remoteUrl);

  const selectedSession = sessions.find((s) => s.id === selectedId);
  const phase = sessionState?.phase ?? selectedSession?.phase ?? '';
  const isAwaitingApproval = sessionState?.phase === 'awaiting_approval';

  const isWide = useIsWideLayout();
  const [artifactsOpen, setArtifactsOpen] = useState(true);

  const termRef = useRef<CaptainTerminalHandle | null>(null);
  const writeToTerminal = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  // Clear the terminal whenever the user switches sessions so we don't
  // bleed PTY bytes from session A into session B's pane.
  useEffect(() => {
    termRef.current?.clear();
  }, [selectedId]);

  useWebSocket(selectedId, writeToTerminal);

  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      await api.sessions.approve(selectedId);
    } catch {
      // Surfacing approval failures is handled by the captain output
      // itself; the wrapper logs the rejection and the user will see it.
    }
  };

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

              {/* Inline approve banner — only when needed */}
              {isAwaitingApproval && (
                <div className="flex shrink-0 items-center justify-between border-b border-amber-600/40 bg-amber-900/20 px-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-amber-200">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    Captain is awaiting approval to begin execution.
                  </div>
                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 transition-colors"
                  >
                    <Check size={14} />
                    Approve
                  </button>
                </div>
              )}

              {/* Terminal + artifacts layout */}
              {isWide ? (
                <div className="flex min-h-0 flex-1">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <CaptainTerminal ref={termRef} />
                  </div>
                  <div className="flex min-h-0 w-[38%] min-w-[360px] flex-col">
                    <ArtifactPanel />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col">
                    <CaptainTerminal ref={termRef} />
                  </div>
                  <div className="flex shrink-0 flex-col border-t border-zinc-800">
                    <button
                      onClick={() => setArtifactsOpen((v) => !v)}
                      className="flex items-center gap-2 bg-zinc-900 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:bg-zinc-800/80 transition-colors"
                    >
                      {artifactsOpen ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      Team artifacts
                    </button>
                    {artifactsOpen && (
                      <div className="flex min-h-0 h-72 flex-col">
                        <ArtifactPanel />
                      </div>
                    )}
                  </div>
                </div>
              )}
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
