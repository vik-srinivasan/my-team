// Pure tab-state for the GettingStarted section. Lives outside the .tsx so it
// can be unit-tested without React or a DOM.

export interface Tab {
  readonly id: string;
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
}

export const TABS = [
  {
    id: 'setup',
    label: 'Setup',
    eyebrow: '01 / SETUP',
    title: 'Install in two minutes',
  },
  {
    id: 'repo',
    label: 'In a repo',
    eyebrow: '02 / FIRST RUN',
    title: 'Spin up your first session',
  },
  {
    id: 'cli',
    label: 'CLI',
    eyebrow: '03 / COMMANDS',
    title: 'The full team CLI',
  },
  {
    id: 'remote',
    label: 'Remote',
    eyebrow: '04 / REMOTE',
    title: 'Walk away. Come back. Catch up.',
  },
  {
    id: 'worktree',
    label: 'Worktree',
    eyebrow: '05 / WORKTREE',
    title: 'Inspect what the team is doing',
  },
  {
    id: 'agent',
    label: 'Launch with agent',
    eyebrow: '06 / AGENT',
    title: 'Hand it to your coding agent',
  },
] as const satisfies readonly Tab[];

export type TabId = (typeof TABS)[number]['id'];

export const DEFAULT_TAB: TabId = 'setup';

export function isValidTab(id: string): id is TabId {
  return TABS.some((tab) => tab.id === id);
}
