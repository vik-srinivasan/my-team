import { create } from 'zustand';

/**
 * The eight workspace tabs. Index 0 (`journal`) is the default selection
 * when a session is first opened — matches `team status` ordering.
 */
export type TabName =
  | 'journal'
  | 'tasks'
  | 'plan'
  | 'srd'
  | 'review'
  | 'diff'
  | 'terminal'
  | 'workflow';

export const TAB_NAMES: readonly TabName[] = [
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
 * (Cmd+1..8 in Phase 3) can read and update the selection without prop
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
  activeTab: 'journal',
  newSessionRequestNonce: 0,
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  requestNewSession: () =>
    set((state) => ({ newSessionRequestNonce: state.newSessionRequestNonce + 1 })),
}));
