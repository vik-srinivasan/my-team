// Shared agent metadata used across AgentFlow, FlowNarrative, and other components.
// Colors are tuned against the deep-teal accent — distinct hues, all dark-mode legible.

export type AgentId =
  | 'captain'
  | 'scout'
  | 'engineer'
  | 'tester'
  | 'reviewer'
  | 'debugger'
  | 'designer'
  | 'runner'
  | 'auditor'
  | 'documenter';

export interface Agent {
  readonly id: AgentId;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly color: string;
  readonly status: string;
  /**
   * `true` for the four core specialists dispatched on every session
   * (scout, engineer, tester, reviewer). `false` for the five conditional
   * specialists dispatched only when their triggers fire (debugger, designer,
   * runner, auditor, documenter). The captain is the orchestrator and is
   * neither — `false` keeps the typing clean and is filtered out of
   * SPECIALISTS anyway.
   */
  readonly core: boolean;
}

export const AGENTS: readonly Agent[] = [
  {
    id: 'captain',
    label: 'Captain',
    title: 'The Captain',
    description:
      'The conversational anchor. Plans the work with you, dispatches specialists, ferries feedback between them, decides when the session is done.',
    color: '#22d3ee',
    status: 'Coordinating…',
    core: false,
  },
  {
    id: 'scout',
    label: 'Scout',
    title: 'Scout',
    description:
      'Read-only. Maps the codebase before any code is written, surfacing the files, conventions, and gotchas that will shape the plan.',
    color: '#a78bfa',
    status: 'Scouting codebase…',
    core: true,
  },
  {
    id: 'engineer',
    label: 'Engineer',
    title: 'Engineer',
    description:
      'Implements the plan task by task. Writes unit tests beside the code, commits to the session branch, leaves a journal entry for the next agent.',
    color: '#34d399',
    status: 'Implementing…',
    core: true,
  },
  {
    id: 'tester',
    label: 'Tester',
    title: 'Tester',
    description:
      'Adds integration coverage, runs the full suite, files reproducible bug reports as severity-bucketed findings.',
    color: '#fbbf24',
    status: 'Testing…',
    core: true,
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    title: 'Reviewer',
    description:
      'Quality gate. Reads the diff, checks for blocking issues, leaves Suggestions, and either approves or sends fixes back to the engineer.',
    color: '#f472b6',
    status: 'Reviewing…',
    core: true,
  },
  {
    id: 'debugger',
    label: 'Debugger',
    title: 'Debugger',
    description:
      'Investigation mode. When the engineer stalls on a failing test or unexplained behaviour, the debugger reproduces minimally, forms a hypothesis, and hands findings back via the journal.',
    color: '#f87171',
    status: 'Investigating…',
    core: false,
  },
  {
    id: 'designer',
    label: 'Designer',
    title: 'Designer',
    description:
      'Screenshot-driven visual critique for UI sessions. Boots a dev server, captures key views, calls out hierarchy and spacing issues, hands the engineer a revision list.',
    color: '#c084fc',
    status: 'Critiquing…',
    core: false,
  },
  {
    id: 'runner',
    label: 'Runner',
    title: 'Runner',
    description:
      'End-to-end behaviour check. Boots the actual feature like a real caller — dev server, CLI, function — inspects the response, flags any mismatch with the SRD or plan.',
    color: '#60a5fa',
    status: 'Running e2e…',
    core: false,
  },
  {
    id: 'auditor',
    label: 'Auditor',
    title: 'Auditor',
    description:
      'Narrow security pass on auth, payments, PII, and migrations. Walks OWASP top-10 categories against sensitive files in the diff and appends findings under a Security audit section in review.md.',
    color: '#fb923c',
    status: 'Auditing…',
    core: false,
  },
  {
    id: 'documenter',
    label: 'Documenter',
    title: 'Documenter',
    description:
      'Keeps README, CHANGELOG, AGENTS, and docs/ in sync after the engineer commits. Reads the diff for public-surface changes, updates the affected docs, commits separately.',
    color: '#94a3b8',
    status: 'Updating docs…',
    core: false,
  },
] as const;

export const SPECIALISTS: readonly Agent[] = AGENTS.filter((a) => a.id !== 'captain');

/**
 * The four specialists dispatched on every session.
 */
export const CORE_SPECIALISTS: readonly Agent[] = SPECIALISTS.filter((a) => a.core);

/**
 * The five specialists dispatched only when their triggers fire.
 */
export const OPTIONAL_SPECIALISTS: readonly Agent[] = SPECIALISTS.filter((a) => !a.core);
