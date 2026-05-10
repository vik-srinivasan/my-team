import { create } from 'zustand';

import type {
  SessionSummary,
  SessionState,
  SessionPhase,
} from '@viktown/shared';

const LAST_VIEWED_KEY = 'viktown.lastViewed.v1';

export interface ChatMessage {
  id: string;
  role: 'user' | 'captain' | 'system';
  text: string;
  timestamp: string;
}

export interface SessionStore {
  // Session list
  sessions: SessionSummary[];
  setSessions: (sessions: SessionSummary[]) => void;
  addSession: (session: SessionSummary) => void;
  updateSessionPhase: (id: string, phase: SessionPhase) => void;

  // Selected session
  selectedSessionId: string | null;
  selectSession: (id: string | null) => void;

  // Session state (for selected session)
  sessionState: SessionState | null;
  setSessionState: (state: SessionState) => void;

  // Captain output messages (for selected session)
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  appendToMessage: (id: string, text: string) => void;
  clearMessages: () => void;

  // Remote control URL
  remoteUrl: string | null;
  setRemoteUrl: (url: string) => void;

  // Last-viewed timestamps per session, persisted to localStorage.
  lastViewed: Record<string, string>;
  markViewed: (id: string) => void;
}

function loadLastViewed(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LAST_VIEWED_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') result[k] = v;
      }
      return result;
    }
    return {};
  } catch {
    // Private mode, quota exceeded, malformed JSON — start clean.
    return {};
  }
}

function persistLastViewed(value: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify(value));
  } catch {
    // Best effort — ignore quota / private-mode errors.
  }
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((s) => ({ sessions: [...s.sessions, session] })),
  updateSessionPhase: (id, phase) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, phase } : sess,
      ),
    })),

  selectedSessionId: null,
  selectSession: (id) =>
    set({
      selectedSessionId: id,
      messages: [],
      sessionState: null,
      remoteUrl: null,
    }),

  sessionState: null,
  setSessionState: (state) =>
    set((s) => {
      // Also update the session list entry
      const sessions = s.sessions.map((sess) =>
        sess.id === s.selectedSessionId
          ? {
              ...sess,
              phase: state.phase,
              active_specialist: state.active_specialist,
              last_checkpoint: state.last_checkpoint,
              must_ask_count: state.must_ask_pending.length,
            }
          : sess,
      );
      return { sessionState: state, sessions };
    }),

  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToMessage: (id, text) =>
    set((s) => ({
      messages: s.messages.map((msg) =>
        msg.id === id ? { ...msg, text: msg.text + text } : msg,
      ),
    })),
  clearMessages: () => set({ messages: [] }),

  remoteUrl: null,
  setRemoteUrl: (url) => set({ remoteUrl: url }),

  lastViewed: loadLastViewed(),
  markViewed: (id) =>
    set((s) => {
      const next = { ...s.lastViewed, [id]: new Date().toISOString() };
      persistLastViewed(next);
      return { lastViewed: next };
    }),
}));
