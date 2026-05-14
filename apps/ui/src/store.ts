import { create } from 'zustand';

/**
 * The nine workspace tabs. Index 0 (`chat`) is the default selection
 * when a session is first opened — the Chat tab is the primary way to
 * talk to the captain. The legacy ordering had `journal` first.
 */
export type TabName =
  | 'chat'
  | 'journal'
  | 'tasks'
  | 'plan'
  | 'srd'
  | 'review'
  | 'diff'
  | 'terminal'
  | 'workflow';

export const TAB_NAMES: readonly TabName[] = [
  'chat',
  'journal',
  'tasks',
  'plan',
  'srd',
  'review',
  'diff',
  'terminal',
  'workflow',
] as const;

/**
 * Ephemeral UI state — nothing here is persisted. Lives in a Zustand
 * store so the sidebar, workspace, and any future global UI control
 * (Cmd+1..9 in Phase 3) can read and update the selection without prop
 * drilling.
 *
 * `newSessionRequestNonce` is a write-only "doorbell": components that
 * own the modal (Sidebar) subscribe to it and open the modal on every
 * bump. Counter-not-flag so two presses in a row still re-open if the
 * user dismissed in between.
 */
export interface UiState {
  selectedSessionId: string | null;
  activeTab: TabName;
  newSessionRequestNonce: number;
  setSelectedSessionId: (id: string | null) => void;
  setActiveTab: (tab: TabName) => void;
  requestNewSession: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedSessionId: null,
  activeTab: 'chat',
  newSessionRequestNonce: 0,
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  requestNewSession: () =>
    set((state) => ({ newSessionRequestNonce: state.newSessionRequestNonce + 1 })),
}));
