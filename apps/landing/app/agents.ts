// Shared agent metadata used across AgentFlow, FlowNarrative, and other components.
// Colors are tuned against the deep-teal accent — distinct hues, all dark-mode legible.

export type AgentId = 'captain' | 'scout' | 'engineer' | 'tester' | 'reviewer';

export interface Agent {
  readonly id: AgentId;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly color: string;
  readonly status: string;
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
  },
  {
    id: 'scout',
    label: 'Scout',
    title: 'Scout',
    description:
      'Read-only. Maps the codebase before any code is written, surfacing the files, conventions, and gotchas that will shape the plan.',
    color: '#a78bfa',
    status: 'Scouting codebase…',
  },
  {
    id: 'engineer',
    label: 'Engineer',
    title: 'Engineer',
    description:
      'Implements the plan task by task. Writes unit tests beside the code, commits to the session branch, leaves a journal entry for the next agent.',
    color: '#34d399',
    status: 'Implementing…',
  },
  {
    id: 'tester',
    label: 'Tester',
    title: 'Tester',
    description:
      'Adds integration coverage, runs the full suite, files reproducible bug reports as severity-bucketed findings.',
    color: '#fbbf24',
    status: 'Testing…',
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    title: 'Reviewer',
    description:
      'Quality gate. Reads the diff, checks for blocking issues, leaves Suggestions, and either approves or sends fixes back to the engineer.',
    color: '#f472b6',
    status: 'Reviewing…',
  },
] as const;

export const SPECIALISTS: readonly Agent[] = AGENTS.filter((a) => a.id !== 'captain');
