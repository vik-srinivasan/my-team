import { useEffect, useReducer, useRef } from 'react';
import type {
  SessionState,
  TeamFileName,
  WsClientEvent,
  WsSpecialistEvent,
} from '@my-team/shared';

import {
  connectSessionSocket,
  type SessionSocket,
  type SessionSocketStatus,
} from '../lib/ws.js';

/**
 * Snapshot exposed by `useSessionWebSocket`. Every tab subscribes to this
 * shape via React Context (see `SessionWorkspace.tsx`) and reads only the
 * slices it needs.
 */
export interface SessionSocketSnapshot {
  /** Latest `state.json` payload pushed over the WS. `null` until the
   *  wrapper emits its first `state` event. */
  state: SessionState | null;
  /** Most recent terminal output frame. Tabs that need the full backlog
   *  (the terminal tab) should subscribe via the imperative `subscribe`
   *  method on `useSessionWebSocket` — for now this is just the latest
   *  chunk so non-terminal consumers can show a "captain is writing…"
   *  indicator without buffering megabytes. */
  output: string | null;
  /** Hydrated copies of every `.team/<name>.md` file the wrapper streams.
   *  Filled by the initial-emit on connect and updated as captain writes. */
  teamFiles: Partial<Record<TeamFileName, string>>;
  /** Latest unified-diff payload (debounced server-side). */
  lastDiff: string | null;
  /** Latest specialist start/finish event. */
  lastSpecialistEvent: WsSpecialistEvent | null;
  /** Captain remote-control URL once the captain emits it. */
  remoteUrl: string | null;
  /** Underlying socket status — `connecting` | `open` | `closed`. */
  status: SessionSocketStatus;
}

const INITIAL_SNAPSHOT: SessionSocketSnapshot = {
  state: null,
  output: null,
  teamFiles: {},
  lastDiff: null,
  lastSpecialistEvent: null,
  remoteUrl: null,
  status: 'connecting',
};

type Action =
  | { kind: 'reset' }
  | { kind: 'state'; state: SessionState }
  | { kind: 'output'; text: string }
  | { kind: 'team_file'; name: TeamFileName; content: string }
  | { kind: 'diff'; diff: string }
  | { kind: 'specialist'; event: WsSpecialistEvent }
  | { kind: 'remote_url'; url: string }
  | { kind: 'status'; status: SessionSocketStatus };

function reduce(state: SessionSocketSnapshot, action: Action): SessionSocketSnapshot {
  switch (action.kind) {
    case 'reset':
      return INITIAL_SNAPSHOT;
    case 'state':
      return { ...state, state: action.state };
    case 'output':
      return { ...state, output: action.text };
    case 'team_file':
      return {
        ...state,
        teamFiles: { ...state.teamFiles, [action.name]: action.content },
      };
    case 'diff':
      return { ...state, lastDiff: action.diff };
    case 'specialist':
      return { ...state, lastSpecialistEvent: action.event };
    case 'remote_url':
      return { ...state, remoteUrl: action.url };
    case 'status':
      return { ...state, status: action.status };
  }
}

/**
 * Public return value. Wraps the reducer snapshot plus the imperative
 * `send` so terminal-style tabs can forward keystrokes and resizes.
 */
export interface UseSessionWebSocketResult extends SessionSocketSnapshot {
  send: (event: WsClientEvent) => void;
}

/**
 * Subscribes to `ws://127.0.0.1:3001/ws/sessions/:id` for the supplied
 * session, decodes events into a reducer-managed snapshot, and tears the
 * socket down on unmount or when `id` changes.
 *
 * Pass `null` to disconnect without connecting (e.g. when no session is
 * selected). The returned `send` becomes a no-op in that case.
 */
export function useSessionWebSocket(id: string | null): UseSessionWebSocketResult {
  const [snapshot, dispatch] = useReducer(reduce, INITIAL_SNAPSHOT);
  const socketRef = useRef<SessionSocket | null>(null);

  useEffect(() => {
    dispatch({ kind: 'reset' });
    if (id === null) {
      socketRef.current = null;
      return undefined;
    }

    const sock = connectSessionSocket(id, {
      onState: (state) => dispatch({ kind: 'state', state }),
      onOutput: (text) => dispatch({ kind: 'output', text }),
      onTeamFile: (name, content) => dispatch({ kind: 'team_file', name, content }),
      onDiff: (diff) => dispatch({ kind: 'diff', diff }),
      onSpecialist: (event) => dispatch({ kind: 'specialist', event }),
      onRemoteUrl: (url) => dispatch({ kind: 'remote_url', url }),
      onStatus: (status) => dispatch({ kind: 'status', status }),
    });
    socketRef.current = sock;

    return () => {
      sock.close();
      socketRef.current = null;
    };
  }, [id]);

  return {
    ...snapshot,
    send: (event: WsClientEvent) => {
      socketRef.current?.send(event);
    },
  };
}
