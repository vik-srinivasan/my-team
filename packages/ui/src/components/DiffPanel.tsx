import { useState, useMemo } from 'react';

import type { RightTab } from '../store.js';
import { useSessionStore } from '../store.js';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'diff', label: 'Diff' },
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'journal', label: 'Journal' },
  { id: 'decisions', label: 'Decisions' },
];

interface DiffFile {
  path: string;
  status: 'M' | 'A' | 'D';
  content: string;
}

function parseDiffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const parts = diff.split(/^diff --git /m);

  for (const part of parts) {
    if (!part.trim()) continue;

    const lines = part.split('\n');
    // First line: "a/path b/path"
    const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const path = headerMatch[2];
    let status: 'M' | 'A' | 'D' = 'M';
    if (part.includes('new file mode')) status = 'A';
    else if (part.includes('deleted file mode')) status = 'D';

    files.push({ path, status, content: 'diff --git ' + part });
  }

  return files;
}

const STATUS_COLORS: Record<string, string> = {
  M: 'text-yellow-400',
  A: 'text-green-400',
  D: 'text-red-400',
};

function classifyLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-zinc-400';
  if (line.startsWith('+')) return 'text-green-400 bg-green-950/30';
  if (line.startsWith('-')) return 'text-red-400 bg-red-950/30';
  if (line.startsWith('@@')) return 'text-cyan-400';
  if (line.startsWith('diff ')) return 'text-zinc-300 font-semibold mt-4';
  return 'text-zinc-400';
}

function DiffContent({ content }: { content: string }) {
  return (
    <pre className="font-mono text-xs leading-5">
      {content.split('\n').map((line, i) => (
        <div key={i} className={`px-2 ${classifyLine(line)}`}>
          {line || '\u00A0'}
        </div>
      ))}
    </pre>
  );
}

export function DiffPanel() {
  const diff = useSessionStore((s) => s.diff);
  const rightTab = useSessionStore((s) => s.rightTab);
  const setRightTab = useSessionStore((s) => s.setRightTab);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const files = useMemo(() => parseDiffFiles(diff), [diff]);

  const focusedContent = selectedFile
    ? files.find((f) => f.path === selectedFile)?.content ?? diff
    : diff;

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

      {/* File tree */}
      {files.length > 0 && (
        <div className="border-b border-zinc-800 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedFile(null)}
              className={`rounded px-2 py-0.5 text-xs ${
                selectedFile === null
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              All files ({files.length})
            </button>
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${
                  selectedFile === file.path
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                <span className={`font-bold ${STATUS_COLORS[file.status]}`}>
                  {file.status}
                </span>
                <span className="truncate max-w-48">
                  {file.path.split('/').pop()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {diff ? (
          <DiffContent content={focusedContent} />
        ) : (
          <p className="text-sm text-zinc-500">No changes yet</p>
        )}
      </div>
    </div>
  );
}
