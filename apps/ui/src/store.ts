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
 */
export interface UiState {
  selectedSessionId: string | null;
  activeTab: TabName;
  setSelectedSessionId: (id: string | null) => void;
  setActiveTab: (tab: TabName) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedSessionId: null,
  activeTab: 'journal',
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
