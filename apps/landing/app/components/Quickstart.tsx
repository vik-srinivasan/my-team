'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Copy, Github, BookOpen } from 'lucide-react';

interface CodeStep {
  readonly index: number;
  readonly label: string;
  readonly command: string;
  readonly note: string;
}

const STEPS: readonly CodeStep[] = [
  {
    index: 1,
    label: 'Clone',
    command: 'git clone https://github.com/vik-srinivasan/viktown.git',
    note: 'Public repo. No auth needed.',
  },
  {
    index: 2,
    label: 'Install',
    command: 'cd viktown && ./setup.sh',
    note: 'Builds packages, links the team CLI globally. Needs Node 22 and pnpm 11.',
  },
  {
    index: 3,
    label: 'Ship',
    command: 'team new "Add user authentication"',
    note: 'From inside any git repo. Creates a worktree, spawns the captain, drops you into chat.',
  },
];

const GITHUB_URL = 'https://github.com/vik-srinivasan/viktown';
const README_URL = 'https://github.com/vik-srinivasan/viktown#readme';

export default function Quickstart() {
  const reduced = useReducedMotion();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (step: CodeStep) => {
    try {
      await navigator.clipboard.writeText(step.command);
      setCopiedIndex(step.index);
      setTimeout(() => {
        setCopiedIndex((current) => (current === step.index ? null : current));
      }, 1500);
    } catch {
      // Clipboard API unavailable (insecure context, etc) — silently no-op.
      // The user can still select the text manually.
    }
  };

  return (
    <section
      id="quickstart"
      className="relative py-24 md:py-32 border-t border-[color:var(--color-border)]"
    >
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            Quickstart
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            Three commands. Then walk away.
          </h2>
        </div>

        <ol className="mt-12 space-y-4">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.index}
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: reduced ? 0 : 0.05 * i }}
              className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 backdrop-blur"
            >
              <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-3 md:min-w-[140px]">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/10 font-mono text-xs text-[color:var(--color-accent-bright)]"
                    aria-hidden="true"
                  >
                    {String(step.index).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-sm text-[color:var(--color-text)]">
                    {step.label}
                  </span>
                </div>

                <div className="flex flex-1 items-center gap-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2.5">
                  <span
                    className="select-none font-mono text-xs text-[color:var(--color-dim)]"
                    aria-hidden="true"
                  >
                    $
                  </span>
                  <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-[color:var(--color-text)]">
                    {step.command}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopy(step)}
                    className="inline-flex items-center gap-1.5 rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--color-muted)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text)]"
                    aria-label={`Copy command: ${step.command}`}
                  >
                    {copiedIndex === step.index ? (
                      <>
                        <Check size={12} aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} aria-hidden="true" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <p className="border-t border-[color:var(--color-border)]/70 bg-[color:var(--color-surface)]/30 px-5 py-2.5 font-mono text-xs text-[color:var(--color-dim)]">
                {step.note}
              </p>
            </motion.li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--color-accent-bright)] hover:text-[color:var(--color-bg)]"
          >
            <Github size={16} aria-hidden="true" />
            GitHub
          </a>
          <a
            href={README_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-5 py-2.5 text-sm font-medium text-[color:var(--color-text)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface)]"
          >
            <BookOpen size={16} aria-hidden="true" />
            Read the full README
          </a>
        </div>
      </div>
    </section>
  );
}
