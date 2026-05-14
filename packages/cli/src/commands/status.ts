import { Command } from 'commander';
import chalk from 'chalk';
import type { SessionMeta, SessionState } from '@my-team/shared';
import { humanizeAgo, getAttention, abbreviatePhase, visibleLength } from '@my-team/shared';
import { api, ApiError } from '../api-client.js';
import { readTeamFile } from '../session-paths.js';

interface StatusOptions {
  json?: boolean;
}

interface TaskCounts {
  done: number;
  total: number;
}

interface ReviewSummary {
  present: boolean;
  status: 'approved' | 'changes_requested' | 'pending' | 'unknown';
  blockers: number;
}

interface JournalEntry {
  timestamp: string;
  author: string;
  body: string;
}

export function statusCommand(): Command {
  return new Command('status')
    .description('Show a full triage view for a single session')
    .argument('<id>', 'Session ID')
    .option('--json', 'Output as JSON instead of formatted text')
    .action(async (id: string, options: StatusOptions) => {
      try {
        const session = await api.getSession(id) as Record<string, unknown>;
        const meta = session.meta as SessionMeta;
        const state = session.state as SessionState;
        // The wrapper's claude-process URL regex can capture OSC 8 hyperlink
        // escape sequences (BEL-delimited), so strip anything at or after
        // the first BEL byte before display.
        const rawRemoteUrl = (session.remote_url as string | null) ?? null;
        const remoteUrl = rawRemoteUrl?.split('\x07')[0] ?? null;
        // Worktree path lives on the top-level Session object; meta.source_repo
        // is the user's source repo, not the session worktree. Fall back to
        // source_repo only when the API doesn't return a worktree_path.
        const worktreePath = (session.worktree_path as string | undefined) ?? meta.source_repo;

        // Read .team/ artefacts from the local worktree.
        const [tasksRaw, planRaw, reviewRaw, journalRaw, prUrlRaw] = await Promise.all([
          readTeamFile(id, 'tasks.md'),
          readTeamFile(id, 'plan.md'),
          readTeamFile(id, 'review.md'),
          readTeamFile(id, 'journal.md'),
          readTeamFile(id, 'pr.url'),
        ]);

        const tasks = countTasks(tasksRaw);
        const planPresent = (planRaw ?? '').trim().length > 0;
        const review = summarizeReview(reviewRaw);
        const latest = latestJournalEntry(journalRaw);
        const prUrl = prUrlRaw?.trim() || remoteUrl;
        const mustAskCount = state.must_ask_pending?.length ?? 0;
        const attention = getAttention({ phase: state.phase, must_ask_count: mustAskCount });

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                meta,
                state,
                worktree_path: worktreePath,
                pr_url: prUrl,
                tasks,
                plan_present: planPresent,
                review,
                latest_journal: latest,
                attention: {
                  glyph: attention.glyph,
                  label: attention.label,
                  critical: attention.critical,
                },
                must_ask_pending: state.must_ask_pending ?? [],
              },
              null,
              2,
            ),
          );
          return;
        }

        renderStatus({
          meta,
          state,
          worktreePath,
          prUrl,
          tasks,
          planPresent,
          review,
          latest,
          attention,
          mustAskPending: state.must_ask_pending ?? [],
        });
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to get session status'));
        }
        process.exit(1);
      }
    });
}

interface RenderArgs {
  meta: SessionMeta;
  state: SessionState;
  worktreePath: string;
  prUrl: string | null;
  tasks: TaskCounts;
  planPresent: boolean;
  review: ReviewSummary;
  latest: JournalEntry | null;
  attention: ReturnType<typeof getAttention>;
  mustAskPending: string[];
}

function renderStatus(a: RenderArgs): void {
  const { meta, state, worktreePath, prUrl, tasks, planPresent, review, latest, attention, mustAskPending } = a;

  const heading = `${chalk.bold(meta.id)} · ${meta.title}`;
  console.log(heading);
  // Use the visible (ANSI-stripped) width of the heading — chalk.bold adds
  // escape bytes to .length that would otherwise inflate the separator.
  console.log(chalk.dim('─'.repeat(Math.min(60, Math.max(visibleLength(heading), 20)))));

  const phaseLabel = abbreviatePhase(state.phase);
  console.log(
    `${label('Phase:')}      ${phaseLabel}` +
      `   ${label('Specialist:')} ${state.active_specialist ?? chalk.dim('—')}`,
  );

  if (attention.critical) {
    const text = `${attention.glyph} ${attention.label}`;
    console.log(`${label('Attention:')}  ${chalk.red(text)}`);
  }

  const checkpointAgo = state.last_checkpoint ? humanizeAgo(state.last_checkpoint) + ' ago' : chalk.dim('—');
  console.log(
    `${label('Checkpoint:')} ${checkpointAgo}` +
      `   ${label('Review iter:')} ${state.review_iterations} / ${state.max_review_iterations}`,
  );

  console.log(`${label('Worktree:')}   ${chalk.dim(worktreePath)}`);
  console.log(`${label('Branch:')}     ${meta.session_branch}`);
  if (prUrl) console.log(`${label('PR:')}         ${chalk.cyan(prUrl)}`);

  console.log();

  if (tasks.total > 0) {
    const pct = tasks.total === 0 ? 0 : Math.round((tasks.done / tasks.total) * 100);
    console.log(`${label('Tasks:')}      ${tasks.done} / ${tasks.total} done (${pct}%)`);
  } else {
    console.log(`${label('Tasks:')}      ${chalk.dim('no tasks file')}`);
  }
  console.log(`${label('Plan:')}       ${planPresent ? 'present' : chalk.dim('missing')}`);
  console.log(`${label('Review:')}     ${renderReview(review)}`);

  if (state.blockers && state.blockers.length > 0) {
    console.log();
    console.log(chalk.red('Blockers:'));
    for (const b of state.blockers) console.log(`  • ${b}`);
  }

  if (mustAskPending.length > 0) {
    console.log();
    console.log(chalk.bold('Pending questions:'));
    for (const q of mustAskPending) console.log(`  • ${q}`);
  }

  if (latest) {
    console.log();
    console.log(chalk.bold('Recent journal:'));
    const short = latest.body.split('\n').slice(0, 4).join('\n');
    const time = formatJournalTime(latest.timestamp);
    console.log(`  ${chalk.dim(time)}  ${chalk.cyan(latest.author)}`);
    for (const line of short.split('\n')) {
      if (line.trim()) console.log(`  ${line}`);
    }
  }
}

function label(s: string): string {
  return chalk.dim(s);
}

function renderReview(r: ReviewSummary): string {
  if (!r.present) return chalk.dim('—');
  if (r.status === 'approved') return chalk.green(`Approved · ${r.blockers} blockers`);
  if (r.status === 'changes_requested') return chalk.yellow(`Changes requested · ${r.blockers} blockers`);
  if (r.status === 'pending') return chalk.dim('Pending');
  return chalk.dim('present');
}

// ── Parsing helpers ────────────────────────────────────────────────────

export function countTasks(raw: string | null): TaskCounts {
  if (!raw) return { done: 0, total: 0 };
  let done = 0;
  let total = 0;
  for (const line of raw.split('\n')) {
    const m = /^\s*[-*]\s+\[( |x|X)\]/.exec(line);
    if (!m) continue;
    total++;
    if (m[1] === 'x' || m[1] === 'X') done++;
  }
  return { done, total };
}

export function summarizeReview(raw: string | null): ReviewSummary {
  if (!raw || raw.trim().length === 0) {
    return { present: false, status: 'unknown', blockers: 0 };
  }
  const text = raw.toLowerCase();
  // Count "blocking" sections (e.g. `## Blocking — reviewer` headers, or
  // bullets in a Blocking section). This is best-effort; the review schema
  // is informal markdown.
  const blockerMatches = text.match(/^##\s*blocking/gm) ?? [];
  const explicitBlockers = (text.match(/^\s*[-*]\s*\*?\*?blocking/gm) ?? []).length;
  const blockers = Math.max(blockerMatches.length, explicitBlockers);

  let status: ReviewSummary['status'] = 'unknown';
  if (/\bapproved\b/.test(text) && blockers === 0) status = 'approved';
  else if (blockers > 0 || /changes\s+requested/.test(text)) status = 'changes_requested';
  else if (text.length > 0) status = 'pending';

  return { present: true, status, blockers };
}

export function latestJournalEntry(raw: string | null): JournalEntry | null {
  if (!raw) return null;
  // Entries look like:
  //   ## 2026-05-12T09:17:00Z — captain
  //   body text...
  //   (blank line, then next ##)
  const entries: JournalEntry[] = [];
  const lines = raw.split('\n');
  let current: JournalEntry | null = null;
  for (const line of lines) {
    const header = /^##\s+(\S+)\s+[—-]\s+(.+?)\s*$/.exec(line);
    if (header) {
      if (current) entries.push(current);
      current = { timestamp: header[1], author: header[2], body: '' };
      continue;
    }
    if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) entries.push(current);
  if (entries.length === 0) return null;
  const last = entries[entries.length - 1];
  last.body = last.body.trim();
  return last;
}

function formatJournalTime(ts: string): string {
  // Render `HH:MM` from an ISO timestamp; passthrough on failure.
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── Test exports ────────────────────────────────────────────────────────

export const __test__ = {
  countTasks,
  summarizeReview,
  latestJournalEntry,
};
