import { createContext, useContext, type ReactNode } from 'react';

import type { UseSessionWebSocketResult } from '../hooks/useSessionWebSocket.js';

/**
 * Per-tab access to the session WebSocket snapshot. `SessionWorkspace`
 * mounts the hook exactly once for the selected session and broadcasts
 * the result down via this context so each tab can subscribe without
 * opening its own socket.
 */
const SessionSocketContext = createContext<UseSessionWebSocketResult | null>(null);

export function SessionSocketProvider({
  value,
  children,
}: {
  value: UseSessionWebSocketResult;
  children: ReactNode;
}) {
  return (
    <SessionSocketContext.Provider value={value}>
      {children}
    </SessionSocketContext.Provider>
  );
}

/**
 * Read the session socket snapshot from context. Throws if used outside
 * the `SessionWorkspace` tree so tabs fail loudly rather than rendering
 * stale data.
 */
export function useSessionSocket(): UseSessionWebSocketResult {
  const value = useContext(SessionSocketContext);
  if (value === null) {
    throw new Error(
      'useSessionSocket() called outside <SessionSocketProvider>. ' +
        'Wrap tab content in <SessionWorkspace> or pass the snapshot explicitly.',
    );
  }
  return value;
}
