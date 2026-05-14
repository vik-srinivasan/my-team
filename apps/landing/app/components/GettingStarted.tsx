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
      { name: 'team start', description: 'Start the wrapper daemon in the foreground.' },
      {
        name: 'team ui',
        flags: '--port <port> --no-open',
        description: 'Serve the my-team web UI on localhost:3737 and open it in the browser.',
      },
    ],
  },
  {
    id: 'sessions',
    heading: 'Sessions',
    commands: [
      {
        name: 'team new "<title>"',
        flags: '--no-attach --new --github --public',
        description:
          'Create a session for the cwd repo, a known basename, or a fresh project.',
      },
      {
        name: 'team list',
        flags: '-a --json',
        description: 'List active sessions with an attention-first overview.',
      },
      {
        name: 'team list-past',
        flags: '--json',
        description: 'List past source repos used to start sessions.',
      },
      {
        name: 'team watch',
        flags: '--interval <s>',
        description: 'Re-render team list on an interval (top-like view).',
      },
      {
        name: 'team status <id>',
        flags: '--json',
        description: 'Full triage view for a single session.',
      },
      {
        name: 'team attach <id>',
        description: 'Attach to the captain chat (Ctrl+] to detach).',
      },
      {
        name: 'team jump <id>',
        description: 'Print the worktree path. Pair with: cd "$(team jump <id>)".',
      },
      { name: 'team open <id>', description: 'Open the worktree in VS Code.' },
    ],
  },
  {
    id: 'inspect',
    heading: 'Inspect',
    commands: [
      {
        name: 'team journal <id>',
        flags: '-n <count> --all -f',
        description: "Show entries from a session's .team/journal.md.",
      },
      {
        name: 'team tasks <id>',
        description: "Pretty-print a session's .team/tasks.md with checkbox highlights.",
      },
      {
        name: 'team plan <id>',
        description: "Pretty-print a session's .team/plan.md with header highlights.",
      },
      {
        name: 'team srd <id>',
        description: "Pretty-print a session's .team/srd.md with header highlights.",
      },
      {
        name: 'team diff <id>',
        description: "Show a session's diff vs its source branch (piped through $PAGER).",
      },
      {
        name: 'team logs <id>',
        flags: '-n <count> -f',
        description: "Tail the wrapper's pino log for a session.",
      },
      {
        name: 'team notifications',
        description: 'List pending notifications for blocked sessions.',
      },
      { name: 'team help', description: 'Workflow + command reference, plus daemon status.' },
    ],
  },
  {
    id: 'cleanup',
    heading: 'Cleanup & Remote',
    commands: [
      { name: 'team kill <id>', description: 'Terminate the session; worktree preserved.' },
      {
        name: 'team resume <id>',
        description: 'Re-spawn a captain on an orphan session whose worktree survived.',
      },
      {
        name: 'team archive <id>',
        description: 'Copy .team/ to ~/team/archives/<id>/.',
      },
      { name: 'team clean <id>', description: 'Archive then remove the worktree.' },
      { name: 'team purge <id>', description: 'Kill plus clean in one step.' },
    ],
  },
];

// Exported for the regression-guard test that checks the CLI tab covers
// every command file in packages/cli/src/commands/.
export const __test__ = { CLI_GROUPS };

function CliPanel() {
  return (
    <div className="space-y-8">
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

      <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 p-5">
        <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--color-accent-bright)]">
          Shell integration
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted)]">
          Drop this in your{' '}
          <code className="font-mono text-[color:var(--color-text)]">~/.zshrc</code> or{' '}
          <code className="font-mono text-[color:var(--color-text)]">~/.bashrc</code> to
          jump into any session by id with{' '}
          <code className="font-mono text-[color:var(--color-text)]">tj &lt;id&gt;</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 font-mono text-[12.5px] leading-7 text-[color:var(--color-text)]">
          tj() {'{'} cd &quot;$(team jump &quot;$1&quot;)&quot;; {'}'}
        </pre>
      </div>
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
        On the go? Drive the session from your phone with Claude Code&apos;s
        remote-control feature — it talks to the same captain.
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

function RemotePanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="text-[color:var(--color-muted)] leading-relaxed">
          The captain is a daemon, not a foreground process. Detach, switch laptops,
          pull it up on your phone — the work keeps moving. Use Claude Code&apos;s
          remote-control feature to drive a session from anywhere, or from any
          terminal with access to the daemon run{' '}
          <code className="font-mono text-[color:var(--color-text)]">team list</code>{' '}
          and <code className="font-mono text-[color:var(--color-text)]">team attach &lt;id&gt;</code>{' '}
          to drop back into the captain&apos;s chat.
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
  { name: 'srd.md', description: 'session requirements doc (captain drafts with you)' },
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
              team journal &lt;id&gt;
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
