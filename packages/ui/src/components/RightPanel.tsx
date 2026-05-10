import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

import type { RightTab } from '../store.js';
import { useSessionStore } from '../store.js';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'diff', label: 'Diff' },
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'journal', label: 'Journal' },
  { id: 'decisions', label: 'Decisions' },
];

const TAB_FILE_MAP: Record<string, string> = {
  plan: 'plan.md',
  review: 'review.md',
  journal: 'journal.md',
  decisions: 'decisions.md',
};

// ── Diff parsing ──

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
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-zinc-500';
  if (line.startsWith('+')) return 'text-green-300 bg-green-950/40';
  if (line.startsWith('-')) return 'text-red-300 bg-red-950/40';
  if (line.startsWith('@@')) return 'text-cyan-400 font-medium';
  if (line.startsWith('diff ')) return 'text-zinc-200 font-semibold pt-3 border-t border-zinc-800 mt-3';
  return 'text-zinc-400';
}

// ── Components ──

function DiffContent({ content }: { content: string }) {
  return (
    <pre className="font-mono text-xs leading-relaxed">
      {content.split('\n').map((line, i) => (
        <div key={i} className={`px-3 ${classifyLine(line)}`}>
          {line || '\u00A0'}
        </div>
      ))}
    </pre>
  );
}

function DiffView() {
  const diff = useSessionStore((s) => s.diff);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const files = useMemo(() => parseDiffFiles(diff), [diff]);
  const focusedContent = selectedFile
    ? files.find((f) => f.path === selectedFile)?.content ?? diff
    : diff;

  if (!diff) {
    return <p className="p-4 text-sm text-zinc-500">No changes yet</p>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* File list */}
      {files.length > 0 && (
        <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedFile(null)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                selectedFile === null
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              All ({files.length})
            </button>
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
                  selectedFile === file.path
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                <span className={`font-bold ${STATUS_COLORS[file.status]}`}>{file.status}</span>
                <span className="truncate max-w-36">{file.path.split('/').pop()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <DiffContent content={focusedContent} />
      </div>
    </div>
  );
}

function MarkdownView({ content, tab }: { content: string; tab: string }) {
  if (!content) {
    return <p className="p-4 text-sm text-zinc-500">No {tab} content yet</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-code:text-cyan-300 prose-pre:bg-zinc-800/50 prose-pre:border prose-pre:border-zinc-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export function RightPanel() {
  const rightTab = useSessionStore((s) => s.rightTab);
  const setRightTab = useSessionStore((s) => s.setRightTab);
  const teamFiles = useSessionStore((s) => s.teamFiles);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-zinc-800 px-2 py-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              rightTab === tab.id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {rightTab === 'diff' ? (
        <DiffView />
      ) : (
        <MarkdownView
          content={teamFiles[TAB_FILE_MAP[rightTab] ?? ''] ?? ''}
          tab={rightTab}
        />
      )}
    </div>
  );
}
