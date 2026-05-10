import type { RightTab } from '../store.js';
import { useSessionStore } from '../store.js';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'diff', label: 'Diff' },
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'journal', label: 'Journal' },
  { id: 'decisions', label: 'Decisions' },
];

function classifyLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-zinc-400';
  if (line.startsWith('+')) return 'text-green-400 bg-green-950/30';
  if (line.startsWith('-')) return 'text-red-400 bg-red-950/30';
  if (line.startsWith('@@')) return 'text-cyan-400';
  if (line.startsWith('diff ')) return 'text-zinc-300 font-semibold mt-4';
  return 'text-zinc-400';
}

export function DiffPanel() {
  const diff = useSessionStore((s) => s.diff);
  const rightTab = useSessionStore((s) => s.rightTab);
  const setRightTab = useSessionStore((s) => s.setRightTab);

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
        {diff ? (
          <pre className="font-mono text-xs leading-5">
            {diff.split('\n').map((line, i) => (
              <div key={i} className={`px-2 ${classifyLine(line)}`}>
                {line || '\u00A0'}
              </div>
            ))}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">No changes yet</p>
        )}
      </div>
    </div>
  );
}
