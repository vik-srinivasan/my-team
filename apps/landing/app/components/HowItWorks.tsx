'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight, FolderTree } from 'lucide-react';

interface TerminalLine {
  readonly kind: 'prompt' | 'output' | 'system' | 'success';
  readonly text: string;
}

const TERMINAL_LINES: readonly TerminalLine[] = [
  { kind: 'prompt', text: 'team new "Add user authentication"' },
  { kind: 'system', text: '[viktown] creating worktree at ~/team/sessions/calm-river-12' },
  { kind: 'system', text: '[viktown] spawning captain (claude-opus-4)…' },
  {
    kind: 'output',
    text:
      'captain › I\'ll scout the repo, draft a plan, and check in. Anything specific to call out?',
  },
  { kind: 'prompt', text: '> JWT, please. RS256.' },
  { kind: 'output', text: 'captain › Got it. Dispatching scout.' },
  { kind: 'system', text: '[scout] reading 47 files in src/auth, src/middleware…' },
  { kind: 'output', text: 'captain › Plan ready. Approve to dispatch the team?' },
  { kind: 'prompt', text: 'approve' },
  { kind: 'system', text: '[engineer] feat(auth): add JWT signing service' },
  { kind: 'system', text: '[tester] 14 specs passing, 1 flake fixed' },
  { kind: 'system', text: '[reviewer] approved — 0 blocking, 2 suggestions' },
  { kind: 'success', text: '[git] PR opened → github.com/you/repo/pull/482' },
];

interface FileNode {
  readonly name: string;
  readonly comment?: string;
  readonly children?: readonly FileNode[];
}

const FILE_TREE: readonly FileNode[] = [
  {
    name: '.team/',
    children: [
      { name: 'meta.json', comment: 'session id, branch, source repo' },
      { name: 'plan.md', comment: 'captain\'s plan — approved by you' },
      { name: 'context.md', comment: 'scout\'s codebase notes' },
      { name: 'tasks.md', comment: 'todo list for the team' },
      { name: 'journal.md', comment: 'append-only log of every step' },
      { name: 'review.md', comment: 'reviewer findings, severity-bucketed' },
      { name: 'decisions.md', comment: 'design choices logged inline' },
      { name: 'state.json', comment: 'phase, active specialist, errors' },
    ],
  },
];

function lineColor(kind: TerminalLine['kind']) {
  switch (kind) {
    case 'prompt':
      return 'text-[color:var(--color-text)]';
    case 'output':
      return 'text-[color:var(--color-text)]';
    case 'system':
      return 'text-[color:var(--color-muted)]';
    case 'success':
      return 'text-emerald-400';
  }
}

function linePrefix(kind: TerminalLine['kind']) {
  if (kind === 'prompt') return '$ ';
  if (kind === 'output') return '  ';
  return '  ';
}

function renderTree(nodes: readonly FileNode[], depth = 0): React.ReactNode {
  return nodes.map((node, i) => {
    const isLast = i === nodes.length - 1;
    const indent = '  '.repeat(depth);
    const branch = depth === 0 ? '' : isLast ? '└─ ' : '├─ ';
    return (
      <div key={`${depth}-${node.name}`} className="grid grid-cols-[1fr_auto] gap-6">
        <span>
          <span className="text-[color:var(--color-dim)]">{indent + branch}</span>
          <span className="text-[color:var(--color-text)]">{node.name}</span>
        </span>
        {node.comment && (
          <span className="text-[color:var(--color-dim)]"># {node.comment}</span>
        )}
        {node.children && <div className="col-span-2">{renderTree(node.children, depth + 1)}</div>}
      </div>
    );
  });
}

export default function HowItWorks() {
  const reduced = useReducedMotion();
  const initial = reduced ? { opacity: 1 } : { opacity: 0, y: 24 };

  return (
    <section className="relative py-24 md:py-32 border-t border-[color:var(--color-border)]">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            How it works
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            One command. A worktree, a team, and a journal you can read.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={initial}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur"
          >
            <header className="flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
                ~/code/wyvern
              </span>
            </header>
            <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-7">
              {TERMINAL_LINES.map((line, idx) => (
                <div key={idx} className={lineColor(line.kind)}>
                  <span className="select-none text-[color:var(--color-dim)]">
                    {linePrefix(line.kind)}
                  </span>
                  {line.text}
                </div>
              ))}
            </pre>
          </motion.div>

          <motion.div
            initial={initial}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: reduced ? 0 : 0.1 }}
            className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur"
          >
            <header className="flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2.5">
              <div className="flex items-center gap-2 text-[color:var(--color-muted)]">
                <FolderTree size={14} aria-hidden="true" />
                <span className="font-mono text-[11px]">.team/</span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
                shared state
              </span>
            </header>
            <div className="p-5 font-mono text-[12.5px] leading-7">{renderTree(FILE_TREE)}</div>
            <footer className="border-t border-[color:var(--color-border)] px-5 py-3 text-xs text-[color:var(--color-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <ChevronRight size={12} aria-hidden="true" />
                Every agent reads and writes here. You can too.
              </span>
            </footer>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
