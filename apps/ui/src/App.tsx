import { useState, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Sidebar } from './components/Sidebar.js';
import { SessionWorkspace } from './components/SessionWorkspace.js';

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

  return (
    <QueryClientProvider client={client}>
      <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans">
        <Sidebar />
        <SessionWorkspace />
      </div>
    </QueryClientProvider>
  );
}
