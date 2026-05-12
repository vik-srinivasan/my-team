'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Terminal,
  FolderTree,
  ChevronRight,
  Download,
  Check,
  Copy,
  Smartphone,
} from 'lucide-react';
import {
  TABS,
  DEFAULT_TAB,
  type TabId,
} from './getting-started-state';

// ---------- Shared mini-components ----------

interface TerminalBlockProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function TerminalBlock({ title, children }: TerminalBlockProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur">
      <header className="flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
          {title}
        </span>
      </header>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-7 text-[color:var(--color-text)]">
        {children}
      </pre>
    </div>
  );
}

interface CardProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function Card({ title, children }: CardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur">
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
          {title}
        </span>
      </header>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------- Setup panel ----------

interface Prereq {
  readonly label: string;
  readonly check: string;
}

const PREREQS: readonly Prereq[] = [
  { label: 'Node 22+', check: 'node -v' },
  { label: 'pnpm 11+', check: 'pnpm -v' },
  { label: '`claude` CLI installed', check: 'claude --version' },
  { label: 'GitHub CLI authenticated', check: 'gh auth status' },
];

function SetupPanel() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Prerequisites">
          <ul className="space-y-3 text-sm text-[color:var(--color-text)]">
            {PREREQS.map((p) => (
              <li key={p.label} className="flex flex-col gap-1">
                <span>{p.label}</span>
                <code className="font-mono text-xs text-[color:var(--color-muted)]">
                  {p.check}
                </code>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Install">
          <pre className="overflow-x-auto font-mono text-[12.5px] leading-7 text-[color:var(--color-text)]">
            <span className="text-[color:var(--color-dim)]">$ </span>
            git clone https://github.com/vik-srinivasan/my-team.git ~/.my-team
            {'\n'}
            <span className="text-[color:var(--color-dim)]">$ </span>
            cd ~/.my-team && ./setup.sh
            {'\n'}
            <span className="text-[color:var(--color-dim)]">$ </span>
            team --help
          </pre>
        </Card>
      </div>

      <p className="font-mono text-xs leading-relaxed text-[color:var(--color-muted)]">
        If <code className="text-[color:var(--color-text)]">team</code> isn&apos;t found, add
        pnpm&apos;s global bin to PATH:{' '}
        <code className="text-[color:var(--color-text)]">
          echo &apos;export PATH=&quot;$(pnpm bin -g):$PATH&quot;&apos; &gt;&gt; ~/.zshrc
        </code>
      </p>
    </div>
  );
}

// ---------- In a repo panel ----------

function RepoPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TerminalBlock title="terminal 1 — daemon">
        <span className="text-[color:var(--color-dim)]">$ </span>team start{'\n'}
        <span className="text-[color:var(--color-muted)]">
          {'▸'} wrapper listening on http://127.0.0.1:3001
        </span>
        {'\n'}
        <span className="text-[color:var(--color-muted)]">{'▸'} ready</span>
      </TerminalBlock>

      <TerminalBlock title="terminal 2 — your repo">
        <span className="text-[color:var(--color-dim)]">$ </span>cd ~/code/my-app{'\n'}
        <span className="text-[color:var(--color-dim)]">$ </span>team new &quot;Add password
        reset flow&quot;{'\n'}
        <span className="text-[color:var(--color-muted)]">
          {'▸'} session: brave-otter-12
        </span>
        {'\n'}
        <span className="text-[color:var(--color-muted)]">
          {'▸'} branch:  my-team/brave-otter-12
        </span>
        {'\n'}
        <span className="text-[color:var(--color-muted)]">
          {'▸'} worktree: ~/team/sessions/brave-otter-12
        </span>
        {'\n\n'}
        <span className="text-[color:var(--color-accent-bright)]">captain {'▸'} </span>
        Got it. I&apos;ll scout the auth files first, then plan.{'\n'}
        {'         '}Should reset tokens expire in 1h or 24h?{'\n\n'}
        <span className="text-[color:var(--color-text)]">you     {'▸'} </span>
        1h, and invalidate after first use.{'\n\n'}
        <span className="text-[color:var(--color-accent-bright)]">captain {'▸'} </span>
        Approved. Dispatching engineer + tester in parallel.
      </TerminalBlock>
    </div>
  );
}

// ---------- CLI panel ----------

interface CliCommand {
  readonly name: string;
  readonly flags?: string;
  readonly description: string;
}

interface CliGroup {
  readonly id: string;
  readonly heading: string;
  readonly commands: readonly CliCommand[];
}

const CLI_GROUPS: readonly CliGroup[] = [
  {
    id: 'daemon',
    heading: 'Daemon',
    commands: [
      { name: 'team start', description: 'Start the wrapper daemon (foreground).' },
      { name: 'team ui', description: 'Open the dashboard at http://127.0.0.1:3001.' },
    ],
  },
  {
    id: 'sessions',
    heading: 'Sessions',
    commands: [
      {
        name: 'team new "<title>"',
        flags: '--no-attach --new --github --public',
        description: 'Create a session in the cwd repo.',
      },
      { name: 'team list', description: 'Table of all sessions.' },
      {
        name: 'team list-past',
        flags: '--json',
        description: 'List past source repos.',
      },
      { name: 'team status <id>', description: 'Phase, active specialist, blockers.' },
      {
        name: 'team attach <id>',
        description: 'Re-attach the captain chat (Ctrl+] to detach).',
      },
      { name: 'team open <id>', description: 'Open the worktree in VS Code.' },
    ],
  },
  {
    id: 'inspect',
    heading: 'Inspect',
    commands: [
      { name: 'team logs <id>', description: 'Print the journal for a session.' },
      {
        name: 'team notifications',
        flags: '--clear',
        description: 'Show blocked-session alerts.',
      },
      { name: 'team help', description: 'Workflow summary.' },
    ],
  },
  {
    id: 'cleanup',
    heading: 'Cleanup & Remote',
    commands: [
      { name: 'team kill <id>', description: 'Terminate the session; worktree preserved.' },
      {
        name: 'team archive <id>',
        description: 'Copy .team/ to ~/team/archives/<id>/.',
      },
      { name: 'team clean <id>', description: 'Archive then remove the worktree.' },
      { name: 'team purge <id>', description: 'Kill plus clean in one step.' },
    ],
  },
];

function CliPanel() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {CLI_GROUPS.map((group) => (
        <div key={group.id}>
          <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--color-accent-bright)]">
            {group.heading}
          </h3>
          <ul className="mt-3 space-y-2">
            {group.commands.map((cmd) => (
              <li
                key={cmd.name}
                className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <code className="font-mono text-[13px] text-[color:var(--color-text)]">
                    {cmd.name}
                  </code>
                  {cmd.flags && (
                    <code className="font-mono text-[11px] text-[color:var(--color-dim)]">
                      {cmd.flags}
                    </code>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
                  {cmd.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------- Remote panel ----------

interface RemoteStep {
  readonly index: number;
  readonly text: React.ReactNode;
}

const REMOTE_STEPS: readonly RemoteStep[] = [
  {
    index: 1,
    text: (
      <>
        Detach with{' '}
        <code className="font-mono text-[color:var(--color-text)]">Ctrl+]</code> — the
        captain keeps working.
      </>
    ),
  },
  {
    index: 2,
    text: (
      <>
        Re-attach from any terminal:{' '}
        <code className="font-mono text-[color:var(--color-text)]">team attach &lt;id&gt;</code>.
      </>
    ),
  },
  {
    index: 3,
    text: (
      <>
        Or open the dashboard:{' '}
        <code className="font-mono text-[color:var(--color-text)]">team ui</code> →{' '}
        <code className="font-mono text-[color:var(--color-text)]">http://127.0.0.1:3001</code>.
      </>
    ),
  },
  {
    index: 4,
    text: (
      <>
        Check{' '}
        <code className="font-mono text-[color:var(--color-text)]">team notifications</code>{' '}
        to see if the captain is blocked waiting on you.
      </>
    ),
  },
];

function MockQrCode() {
  // Geometric placeholder. NOT a scannable code — purely decorative.
  // 21×21 grid; three finder patterns at corners; deterministic body fill.
  const size = 21;
  const cell = 5;
  const total = size * cell;
  const finders: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];

  const isFinder = (x: number, y: number) =>
    finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

  // Deterministic-looking body squares.
  const bodyCells: ReadonlyArray<readonly [number, number]> = (() => {
    const acc: Array<readonly [number, number]> = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFinder(x, y)) continue;
        // Cheap deterministic hash, biased ~38% on.
        const v = (x * 7 + y * 13 + ((x * y) % 5)) % 10;
        if (v < 4) acc.push([x, y]);
      }
    }
    return acc;
  })();

  return (
    <svg
      role="img"
      aria-label="Mock QR code preview"
      viewBox={`0 0 ${total} ${total}`}
      fill="currentColor"
      className="h-[120px] w-[120px] rounded-md border border-[color:var(--color-border)] bg-white p-1.5 text-[color:var(--color-bg)]"
    >
      {/* Body cells */}
      {bodyCells.map(([x, y]) => (
        <rect
          key={`b-${x}-${y}`}
          x={x * cell}
          y={y * cell}
          width={cell}
          height={cell}
        />
      ))}
      {/* Finder patterns: outer 7×7 dark, inner 5×5 white cutout, inner 3×3 dark */}
      {finders.map(([fx, fy]) => (
        <g key={`f-${fx}-${fy}`}>
          <rect
            x={fx * cell}
            y={fy * cell}
            width={7 * cell}
            height={7 * cell}
          />
          <rect
            x={(fx + 1) * cell}
            y={(fy + 1) * cell}
            width={5 * cell}
            height={5 * cell}
            className="fill-white"
          />
          <rect
            x={(fx + 2) * cell}
            y={(fy + 2) * cell}
            width={3 * cell}
            height={3 * cell}
          />
        </g>
      ))}
    </svg>
  );
}

function RemotePanel() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-[color:var(--color-muted)] leading-relaxed">
            The captain is a daemon, not a foreground process. Detach, switch laptops,
            come back later — the work keeps moving.
          </p>
          <ol className="mt-6 space-y-4">
            {REMOTE_STEPS.map((step) => (
              <li key={step.index} className="flex gap-4">
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/10 font-mono text-xs text-[color:var(--color-accent-bright)]"
                  aria-hidden="true"
                >
                  {String(step.index).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed text-[color:var(--color-text)]">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <TerminalBlock title="detach + re-attach">
          <span className="text-[color:var(--color-text)]">you     {'▸'} </span>^]{'\n'}
          <span className="text-[color:var(--color-muted)]">
            {'▸'} detached. session brave-otter-12 still running.
          </span>
          {'\n\n'}
          <span className="text-[color:var(--color-dim)]">(later, from your laptop)</span>
          {'\n\n'}
          <span className="text-[color:var(--color-dim)]">$ </span>team attach
          brave-otter-12{'\n'}
          <span className="text-[color:var(--color-muted)]">
            {'▸'} re-attaching to brave-otter-12 …
          </span>
          {'\n\n'}
          <span className="text-[color:var(--color-accent-bright)]">captain {'▸'} </span>
          Welcome back. Reviewer is wrapping up; I&apos;ll{'\n'}
          {'         '}push the PR when it lands.
        </TerminalBlock>
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur">
        <header className="flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-5 py-2.5">
          <div className="flex items-center gap-2 text-[color:var(--color-muted)]">
            <Smartphone size={14} aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Or hand it off to your phone.
            </span>
          </div>
        </header>
        <div className="grid gap-6 p-5 md:grid-cols-[auto_1fr] md:items-center">
          <MockQrCode />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-[color:var(--color-muted)]">
              When you start a session, my-team prints a remote-control link and QR
              code. Scan it on your phone to monitor progress, read the journal, and
              chat with the captain from anywhere.
            </p>
            <div className="flex flex-col gap-1.5">
              <code className="inline-flex w-fit items-center rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2.5 py-1 font-mono text-[12.5px] text-[color:var(--color-text)]">
                team://remote/brave-otter-12
              </code>
              <p className="font-mono text-[11px] text-[color:var(--color-dim)]">
                Opens the dashboard scoped to that session, with chat and journal tail.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Worktree panel ----------

interface TeamFileEntry {
  readonly name: string;
  readonly description: string;
}

const TEAM_FILES: readonly TeamFileEntry[] = [
  { name: 'meta.json', description: 'session id, title, source repo, branch' },
  { name: 'state.json', description: 'phase, active specialist, blockers' },
  { name: 'plan.md', description: "captain's plan (you approve it)" },
  { name: 'context.md', description: "scout's notes" },
  { name: 'tasks.md', description: 'checklist with @role assignments' },
  { name: 'journal.md', description: 'append-only log of every step' },
  { name: 'review.md', description: 'reviewer findings' },
  { name: 'decisions.md', description: 'design choices noted inline' },
];

function WorktreePanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur">
        <header className="flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[color:var(--color-muted)]">
            <FolderTree size={14} aria-hidden="true" />
            <span className="font-mono text-[11px]">
              ~/team/sessions/&lt;id&gt;/.team/
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
            what the team writes
          </span>
        </header>
        <div className="p-5 font-mono text-[12.5px] leading-7">
          {TEAM_FILES.map((file, i) => {
            const isLast = i === TEAM_FILES.length - 1;
            const branch = isLast ? '└─ ' : '├─ ';
            return (
              <div
                key={file.name}
                className="grid grid-cols-[1fr_auto] gap-6"
              >
                <span>
                  <span className="text-[color:var(--color-dim)]">{branch}</span>
                  <span className="text-[color:var(--color-text)]">{file.name}</span>
                </span>
                <span className="text-[color:var(--color-dim)]"># {file.description}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--color-accent-bright)]">
          How to peek
        </h3>
        <ul className="mt-3 space-y-3">
          <li className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-3 py-2">
            <code className="font-mono text-[13px] text-[color:var(--color-text)]">
              team open &lt;id&gt;
            </code>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
              Open the worktree in VS Code.
            </p>
          </li>
          <li className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-3 py-2">
            <code className="font-mono text-[13px] text-[color:var(--color-text)]">
              cd ~/team/sessions/&lt;id&gt; && cat .team/plan.md
            </code>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
              Read the plan straight off disk.
            </p>
          </li>
          <li className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-3 py-2">
            <code className="font-mono text-[13px] text-[color:var(--color-text)]">
              team logs &lt;id&gt;
            </code>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
              Print the journal without leaving your shell.
            </p>
          </li>
        </ul>
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
          <ChevronRight size={12} aria-hidden="true" />
          Every agent reads and writes here. You can too.
        </p>
      </div>
    </div>
  );
}

// ---------- Agent panel ----------

const SETUP_DOC_PATH = '/my-team-setup.md';

const AGENT_COMPATIBILITY = [
  'Claude Code',
  'Cursor',
  'Codex',
  'any markdown-aware agent',
] as const;

function AgentPanel() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      // Clipboard API unavailable — render-safe no-op.
      return;
    }
    try {
      const res = await fetch(SETUP_DOC_PATH);
      if (!res.ok) return;
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Swallow — fetch or clipboard failed; the download link still works.
    }
  };

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-[color:var(--color-muted)] leading-relaxed">
        Skip the manual install. Hand the setup guide below to any coding agent —
        Claude Code, Cursor, Codex, or anything that follows a markdown spec — and it
        will install and verify my-team for you, then hand it back ready to use.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={SETUP_DOC_PATH}
          download="my-team-setup.md"
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--color-accent-bright)] hover:text-[color:var(--color-bg)]"
        >
          <Download size={16} aria-hidden="true" />
          Download my-team-setup.md
        </a>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-5 py-2.5 text-sm font-medium text-[color:var(--color-text)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface)]"
          aria-label="Copy my-team-setup.md contents to clipboard"
        >
          {copied ? (
            <>
              <Check size={16} aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={16} aria-hidden="true" />
              <span>Copy contents</span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
          Compatible with
        </span>
        {AGENT_COMPATIBILITY.map((name) => (
          <span
            key={name}
            className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--color-dim)]"
          >
            {name}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 backdrop-blur">
        <header className="flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-dim)]">
            tell your agent
          </span>
        </header>
        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-7 text-[color:var(--color-text)]">
          <span className="text-[color:var(--color-text)]">you {'▸'} </span>
          Read my-team-setup.md and follow it. Confirm with me{'\n'}
          {'      '}before installing anything.
        </pre>
      </div>
    </div>
  );
}

// ---------- Section ----------

function renderPanel(id: TabId): React.ReactNode {
  switch (id) {
    case 'setup':
      return <SetupPanel />;
    case 'repo':
      return <RepoPanel />;
    case 'cli':
      return <CliPanel />;
    case 'remote':
      return <RemotePanel />;
    case 'worktree':
      return <WorktreePanel />;
    case 'agent':
      return <AgentPanel />;
  }
}

export default function GettingStarted() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<TabId>(DEFAULT_TAB);
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <section
      id="get-started"
      className="relative py-24 md:py-32 border-t border-[color:var(--color-border)]"
    >
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            Get started
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            Install, run, inspect — or hand it to your agent.
          </h2>
          <p className="mt-4 text-[color:var(--color-muted)] leading-relaxed">
            From zero to a running team session, plus everything you need to come back
            later and pick up where the captain left off.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Get started"
          className="mt-12 flex flex-wrap gap-1 border-b border-[color:var(--color-border)]"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`get-started-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`get-started-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(tab.id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] transition-colors ${
                  isActive
                    ? 'border-[color:var(--color-accent-bright)] text-[color:var(--color-text)]'
                    : 'border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]'
                }`}
              >
                <Terminal size={12} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-dim)]">
            {activeTab.eyebrow}
          </p>
          <h3 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--color-text)]">
            {activeTab.title}
          </h3>

          <motion.div
            key={activeTab.id}
            role="tabpanel"
            id={`get-started-panel-${activeTab.id}`}
            aria-labelledby={`get-started-tab-${activeTab.id}`}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.35, ease: 'easeOut' }}
            className="mt-6"
          >
            {renderPanel(activeTab.id)}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
