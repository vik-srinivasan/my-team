'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Github } from 'lucide-react';
import AgentFlow from './AgentFlow';

const GITHUB_URL = 'https://github.com/vik-srinivasan/my-team';

export default function Hero() {
  const reduced = useReducedMotion();
  const baseTransition = reduced ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' as const };

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 mesh-bg" aria-hidden="true" />
      <div className="absolute inset-0 grid-bg opacity-40" aria-hidden="true" />
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[color:var(--color-border-strong)] to-transparent"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1100px] px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={baseTransition}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 px-3 py-1 font-mono text-xs text-[color:var(--color-muted)] backdrop-blur"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent-bright)]"
                aria-hidden="true"
              />
              v0.1 — local-only, runs on your Mac
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...baseTransition, delay: reduced ? 0 : 0.05 }}
              className="mt-6 text-balance text-[clamp(2.6rem,6vw,4.5rem)] font-semibold leading-[1.05] tracking-tight"
            >
              <span className="gradient-text">my-team: Multi-Agent orchestration</span>
              <br />
              <span className="text-[color:var(--color-text)]">for Claude Code.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...baseTransition, delay: reduced ? 0 : 0.12 }}
              className="mt-6 max-w-xl text-pretty text-lg text-[color:var(--color-muted)] leading-relaxed"
            >
              Spin up a team of AI specialists that plan, code, test, review, and ship a PR — all
              from one command.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...baseTransition, delay: reduced ? 0 : 0.16 }}
              className="mt-5 max-w-2xl text-pretty text-[color:var(--color-muted)] leading-relaxed"
            >
              I built this because I wanted a more structured way to work with Claude Code — one
              that felt like collaborating with a coworker engineer instead of pair-programming
              with a single thread. It&apos;s now how I ship 95% of the time: hand a team a task,
              approve the plan, walk away to a PR.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...baseTransition, delay: reduced ? 0 : 0.2 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="group inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--color-accent-bright)] hover:text-[color:var(--color-bg)]"
              >
                <Github size={16} aria-hidden="true" />
                View on GitHub
                <ArrowRight
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
              <a
                href="#quickstart"
                className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-5 py-2.5 text-sm font-medium text-[color:var(--color-text)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface)]"
              >
                Quickstart
              </a>
            </motion.div>

            <motion.dl
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...baseTransition, delay: reduced ? 0 : 0.3 }}
              className="mt-10 grid grid-cols-3 gap-6 max-w-md font-mono text-xs"
            >
              <div>
                <dt className="text-[color:var(--color-dim)]">agents</dt>
                <dd className="mt-1 text-2xl text-[color:var(--color-text)]">6</dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-dim)]">setup</dt>
                <dd className="mt-1 text-2xl text-[color:var(--color-text)]">1 cmd</dd>
              </div>
              <div>
                <dt className="text-[color:var(--color-dim)]">output</dt>
                <dd className="mt-1 text-2xl text-[color:var(--color-text)]">1 PR</dd>
              </div>
            </motion.dl>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...baseTransition, delay: reduced ? 0 : 0.15, duration: reduced ? 0 : 0.8 }}
            className="relative"
          >
            <div className="relative rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 p-6 backdrop-blur">
              <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-dim)]">
                <span>session.dispatch.loop</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-amber-300">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
                    aria-hidden="true"
                  />
                  work in progress
                </span>
              </div>
              <AgentFlow />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
