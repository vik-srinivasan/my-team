'use client';

import { motion, useReducedMotion } from 'motion/react';
import { AGENTS } from '../agents';

export default function FlowNarrative() {
  const reduced = useReducedMotion();

  return (
    <section className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            The flow
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            One captain, a roster of specialists, one shared workspace.
          </h2>
          <p className="mt-4 text-[color:var(--color-muted)] leading-relaxed">
            Each session is a git worktree on its own branch. Four specialists are always on;
            five more are dispatched conditionally when their triggers fire. Agents communicate
            exclusively through files in{' '}
            <code className="font-mono text-[color:var(--color-text)]">.team/</code> — srd, plan,
            tasks, journal, review. No hidden state, no chatter you can&apos;t inspect.
          </p>
        </div>

        <ol className="mt-16 space-y-10 md:space-y-14">
          {AGENTS.map((agent, i) => {
            const offsetSide = i % 2 === 0 ? 'md:ml-0 md:mr-auto' : 'md:ml-auto md:mr-0';
            const initial = reduced ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, y: 24 };
            return (
              <motion.li
                key={agent.id}
                initial={initial}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: reduced ? 0 : 0.05 * i }}
                className={`relative flex max-w-2xl flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 p-6 md:p-8 backdrop-blur ${offsetSide}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs"
                    style={{
                      backgroundColor: `${agent.color}1f`,
                      color: agent.color,
                      border: `1px solid ${agent.color}55`,
                    }}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3
                    className="font-mono text-sm tracking-wide uppercase"
                    style={{ color: agent.color }}
                  >
                    {agent.title}
                  </h3>
                </div>
                <p className="text-pretty text-[color:var(--color-text)] leading-relaxed">
                  {agent.description}
                </p>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
