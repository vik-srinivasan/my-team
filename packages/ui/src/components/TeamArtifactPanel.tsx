import { useSessionStore } from '../store.js';

const TAB_FILE_MAP: Record<string, string> = {
  plan: 'plan.md',
  review: 'review.md',
  journal: 'journal.md',
  decisions: 'decisions.md',
};

export function TeamArtifactPanel() {
  const rightTab = useSessionStore((s) => s.rightTab);
  const teamFiles = useSessionStore((s) => s.teamFiles);
  const setRightTab = useSessionStore((s) => s.setRightTab);

  const fileName = TAB_FILE_MAP[rightTab] ?? '';
  const content = teamFiles[fileName] ?? '';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
        <TabButton label="Diff" onClick={() => setRightTab('diff')} />
        <TabButton label="Plan" active={rightTab === 'plan'} onClick={() => setRightTab('plan')} />
        <TabButton label="Review" active={rightTab === 'review'} onClick={() => setRightTab('review')} />
        <TabButton label="Journal" active={rightTab === 'journal'} onClick={() => setRightTab('journal')} />
        <TabButton label="Decisions" active={rightTab === 'decisions'} onClick={() => setRightTab('decisions')} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {content ? (
          <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-300">
            {content}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">No {rightTab} content yet</p>
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs ${
        active
          ? 'bg-zinc-700 text-zinc-100'
          : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}
