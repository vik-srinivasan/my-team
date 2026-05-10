import { create } from 'zustand';

import type {
  SessionSummary,
  SessionState,
  SessionPhase,
} from '@viktown/shared';

export type RightTab = 'diff' | 'plan' | 'review' | 'journal' | 'decisions';

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

  // Chat messages (for selected session)
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  appendToMessage: (id: string, text: string) => void;
  clearMessages: () => void;

  // Team files (for selected session)
  teamFiles: Record<string, string>;
  setTeamFile: (file: string, content: string) => void;
  setTeamFiles: (files: Record<string, string>) => void;

  // Diff (for selected session)
  diff: string;
  setDiff: (diff: string) => void;

  // Right column tab
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
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
      teamFiles: {},
      diff: '',
      sessionState: null,
    }),

  sessionState: null,
  setSessionState: (state) =>
    set((s) => {
      // Also update the session list entry
      const sessions = s.sessions.map((sess) =>
        sess.id === s.selectedSessionId
          ? { ...sess, phase: state.phase, active_specialist: state.active_specialist }
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

  teamFiles: {},
  setTeamFile: (file, content) =>
    set((s) => ({ teamFiles: { ...s.teamFiles, [file]: content } })),
  setTeamFiles: (files) => set({ teamFiles: files }),

  diff: '',
  setDiff: (diff) => set({ diff }),

  rightTab: 'diff',
  setRightTab: (tab) => set({ rightTab: tab }),
}));
