import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { RightTab } from '../store.js';
import { useSessionStore } from '../store.js';

const TAB_FILE_MAP: Record<string, string> = {
  plan: 'plan.md',
  review: 'review.md',
  journal: 'journal.md',
  decisions: 'decisions.md',
};

const TABS: { id: RightTab; label: string }[] = [
  { id: 'diff', label: 'Diff' },
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'journal', label: 'Journal' },
  { id: 'decisions', label: 'Decisions' },
];

export function TeamArtifactPanel() {
  const rightTab = useSessionStore((s) => s.rightTab);
  const teamFiles = useSessionStore((s) => s.teamFiles);
  const setRightTab = useSessionStore((s) => s.setRightTab);

  const fileName = TAB_FILE_MAP[rightTab] ?? '';
  const content = teamFiles[fileName] ?? '';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`rounded px-2 py-1 text-xs ${
              rightTab === tab.id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {content ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No {rightTab} content yet</p>
        )}
      </div>
    </div>
  );
}
