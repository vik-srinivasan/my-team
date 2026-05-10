import { useSessionStore } from '../store.js';

export function DiffPanel() {
  const diff = useSessionStore((s) => s.diff);
  const setRightTab = useSessionStore((s) => s.setRightTab);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
        <TabButton label="Diff" active onClick={() => setRightTab('diff')} />
        <TabButton label="Plan" onClick={() => setRightTab('plan')} />
        <TabButton label="Review" onClick={() => setRightTab('review')} />
        <TabButton label="Journal" onClick={() => setRightTab('journal')} />
        <TabButton label="Decisions" onClick={() => setRightTab('decisions')} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {diff ? (
          <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-300">
            {diff}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">No changes yet</p>
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
