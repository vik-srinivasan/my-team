import { useCallback, useState, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Sidebar } from './components/Sidebar.js';
import { SessionWorkspace } from './components/SessionWorkspace.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ShortcutHelp } from './components/ShortcutHelp.js';
import { useUiStore } from './store.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';

/**
 * Build the QueryClient once per app instance. Long-default staleTime so
 * polled queries (sessions list, session detail) don't refetch on every
 * mount when the user toggles tabs.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Per-hook `refetchInterval` overrides staleTime; the 30s here just
        // prevents tab-switch storms.
        staleTime: 30_000,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function App(): ReactElement {
  // Lazy-init pattern: only build one QueryClient even under React 19
  // double-invoke StrictMode.
  const [client] = useState<QueryClient>(() => createQueryClient());
  const [helpOpen, setHelpOpen] = useState(false);

  const setSelectedSessionId = useUiStore((s) => s.setSelectedSessionId);
  const requestNewSession = useUiStore((s) => s.requestNewSession);

  const onNewSession = useCallback(() => {
    requestNewSession();
  }, [requestNewSession]);
  const onCloseSession = useCallback(() => {
    setSelectedSessionId(null);
  }, [setSelectedSessionId]);
  const onShowHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);

  useKeyboardShortcuts({ onNewSession, onCloseSession, onShowHelp });

  return (
    <QueryClientProvider client={client}>
      <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans">
        {/* Each top-level surface gets its own boundary so a crash in
            one (e.g. WS subscription throws) doesn't blank the rest of
            the app. */}
        <ErrorBoundary label="Sidebar">
          <Sidebar />
        </ErrorBoundary>
        <ErrorBoundary label="Session workspace">
          <SessionWorkspace />
        </ErrorBoundary>
        <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </QueryClientProvider>
  );
}
