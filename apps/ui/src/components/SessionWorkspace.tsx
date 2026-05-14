import type { ReactElement } from 'react';

import { useSessionDetail } from '../hooks/useSessionDetail.js';
import { useSessionWebSocket } from '../hooks/useSessionWebSocket.js';
import { TAB_NAMES, useUiStore, type TabName } from '../store.js';
import { SessionHeader } from './SessionHeader.js';
import { SessionSocketProvider } from './SessionContext.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { JournalTab } from './tabs/JournalTab.js';
import { TasksTab } from './tabs/TasksTab.js';
import { PlanTab } from './tabs/PlanTab.js';
import { SrdTab } from './tabs/SrdTab.js';
import { ReviewTab } from './tabs/ReviewTab.js';
import { DiffTab } from './tabs/DiffTab.js';
import { TerminalTab } from './tabs/TerminalTab.js';
import { WorkflowTab } from './tabs/WorkflowTab.js';

export const TAB_LABELS: Record<TabName, string> = {
  journal: 'Journal',
  tasks: 'Tasks',
  plan: 'Plan',
  srd: 'SRD',
  review: 'Review',
  diff: 'Diff',
  terminal: 'Terminal',
  workflow: 'Workflow',
};

function renderTab(tab: TabName): ReactElement {
  switch (tab) {
    case 'journal':
      return <JournalTab />;
    case 'tasks':
      return <TasksTab />;
    case 'plan':
      return <PlanTab />;
    case 'srd':
      return <SrdTab />;
    case 'review':
      return <ReviewTab />;
    case 'diff':
      return <DiffTab />;
    case 'terminal':
      return <TerminalTab />;
    case 'workflow':
      return <WorkflowTab />;
  }
}

/**
 * Right-hand pane. Owns:
 * - The session detail fetch (`useSessionDetail`).
 * - The single WebSocket subscription per session (`useSessionWebSocket`).
 * - Tab row + active tab content.
 *
 * The WS snapshot is broadcast to descendant tabs via `SessionSocketProvider`
 * so each tab subscribes via `useSessionSocket()` without opening its own
 * connection.
 */
export function SessionWorkspace(): ReactElement {
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Always-call both hooks regardless of selection so React's hook order
  // stays stable; each hook handles `null` internally by no-oping.
  const detail = useSessionDetail(selectedSessionId);
  const socket = useSessionWebSocket(selectedSessionId);

  if (selectedSessionId === null) {
    return (
      <section
        className="flex-1 flex flex-col items-center justify-center gap-3 bg-neutral-950"
        data-testid="workspace-empty"
      >
        <p className="text-lg text-neutral-300">
          Select a session from the sidebar.
        </p>
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <kbd className="rounded-sm border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
            ⌘N
          </kbd>
          <span>new session</span>
        </p>
      </section>
    );
  }

  if (detail.isLoading) {
    return (
      <section className="flex-1 flex items-center justify-center text-neutral-500 text-sm bg-neutral-950">
        Loading session…
      </section>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <section className="flex-1 flex items-center justify-center text-red-400 text-sm bg-neutral-950 p-6 text-center">
        Failed to load session {selectedSessionId}.
        <br />
        {(detail.error as Error | undefined)?.message ?? 'Unknown error.'}
      </section>
    );
  }

  return (
    <SessionSocketProvider value={socket}>
      <section className="flex-1 flex flex-col bg-neutral-950 min-w-0">
        <SessionHeader session={detail.data} />

        <nav
          role="tablist"
          aria-label="Session tabs"
          className="flex border-b border-neutral-800 bg-neutral-950 px-2 overflow-x-auto"
        >
          {TAB_NAMES.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tab-panel-${tab}`}
                onClick={() => setActiveTab(tab)}
                data-testid={`tab-${tab}`}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? 'border-neutral-100 text-neutral-100'
                    : 'border-transparent text-neutral-500 hover:text-neutral-200'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </nav>

        <div
          id={`tab-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="flex-1 overflow-auto bg-neutral-950"
        >
          {/* `key` re-mounts the boundary (and the underlying tab) when
              switching tabs so a crash on one tab doesn't leak its fallback
              into the next. */}
          <ErrorBoundary
            key={activeTab}
            label={`${TAB_LABELS[activeTab]} tab`}
          >
            {renderTab(activeTab)}
          </ErrorBoundary>
        </div>
      </section>
    </SessionSocketProvider>
  );
}
