import { create } from 'zustand';

import type {
  SessionSummary,
  SessionState,
  SessionPhase,
  TeamFileName,
} from '@my-team/shared';

import { loadLastViewed, persistLastViewed } from './lib/last-viewed.js';

/** Live contents of the four watched `.team/*.md` files, by name. */
export type TeamFiles = Record<TeamFileName, string>;

const EMPTY_TEAM_FILES: TeamFiles = {
  plan: '',
  tasks: '',
  journal: '',
  review: '',
};

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

  // Live `.team/*.md` contents broadcast by the wrapper.
  teamFiles: TeamFiles;
  setTeamFile: (name: TeamFileName, content: string) => void;

  // Remote control URL
  remoteUrl: string | null;
  setRemoteUrl: (url: string) => void;

  // Last-viewed timestamps per session, persisted to localStorage.
  lastViewed: Record<string, string>;
  markViewed: (id: string) => void;
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
      sessionState: null,
      remoteUrl: null,
      teamFiles: { ...EMPTY_TEAM_FILES },
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

  teamFiles: { ...EMPTY_TEAM_FILES },
  setTeamFile: (name, content) =>
    set((s) => ({ teamFiles: { ...s.teamFiles, [name]: content } })),

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
