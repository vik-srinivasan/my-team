import { useState } from 'react';

import type { TeamFileName } from '@my-team/shared';
import { useSessionStore } from '../store.js';

const TABS: ReadonlyArray<{ key: TeamFileName; label: string }> = [
  { key: 'plan', label: 'Plan' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'journal', label: 'Journal' },
  { key: 'review', label: 'Review' },
];

/**
 * Right-rail panel showing the live contents of `.team/{plan,tasks,
 * journal,review}.md`. Contents arrive over the session WebSocket as
 * `team_file` events and are stored in `useSessionStore`. Read-only —
 * the captain is the writer.
 */
export function ArtifactPanel() {
  const [active, setActive] = useState<TeamFileName>('plan');
  const teamFiles = useSessionStore((s) => s.teamFiles);
  const body = teamFiles[active];

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="flex shrink-0 border-b border-zinc-800">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                isActive
                  ? 'border-b-2 border-blue-500 text-zinc-200'
                  : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {body.length === 0 ? (
          <p className="text-xs text-zinc-600">
            No {active} content yet.
          </p>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
            {body}
          </pre>
        )}
      </div>
    </div>
  );
}
