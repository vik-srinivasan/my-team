'use client';

import { motion, useReducedMotion } from 'motion/react';
import { AGENTS, type Agent } from '../agents';

// Continuous 1..10 numbering across both groups so the captain is "01" and
// the documenter is "10" — keeps the reading order intuitive.
const CAPTAIN = AGENTS.find((a) => a.id === 'captain');
const CORE = AGENTS.filter((a) => a.id !== 'captain' && a.core);
const OPTIONAL = AGENTS.filter((a) => a.id !== 'captain' && !a.core);

interface AgentCardProps {
  readonly agent: Agent;
  readonly index: number;
  readonly number: number;
  readonly variant: 'captain' | 'core' | 'optional';
  readonly reduced: boolean | null;
}

function AgentCard({ agent, index, number, variant, reduced }: AgentCardProps) {
  const offsetSide = index % 2 === 0 ? 'md:ml-0 md:mr-auto' : 'md:ml-auto md:mr-0';
  const initial = reduced ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, y: 24 };

  return (
    <motion.li
      key={agent.id}
      initial={initial}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: reduced ? 0 : 0.05 * index }}
      className={`relative flex max-w-2xl flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 p-6 md:p-8 backdrop-blur ${offsetSide}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs"
          style={{
            backgroundColor: `${agent.color}1f`,
            color: agent.color,
            border: `1px solid ${agent.color}55`,
          }}
          aria-hidden="true"
        >
          {String(number).padStart(2, '0')}
        </span>
        <h3
          className="font-mono text-sm tracking-wide uppercase"
          style={{ color: agent.color }}
        >
          {agent.title}
        </h3>
        {variant !== 'captain' && (
          <span
            className={
              variant === 'core'
                ? 'inline-flex items-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text)]'
                : 'inline-flex items-center rounded-full border border-dashed border-[color:var(--color-border-strong)] bg-transparent px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]'
            }
          >
            {variant}
          </span>
        )}
      </div>
      <p className="text-pretty text-[color:var(--color-text)] leading-relaxed">
        {agent.description}
      </p>
    </motion.li>
  );
}

function GroupHeading({
  eyebrow,
  count,
  blurb,
}: {
  readonly eyebrow: string;
  readonly count: number;
  readonly blurb: string;
}) {
  return (
    <div className="mt-16 mb-8 max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
        {eyebrow} · {count}
      </p>
      <p className="mt-2 text-[color:var(--color-muted)] leading-relaxed">{blurb}</p>
    </div>
  );
}

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

        {/* Captain — stands alone as the orchestrator. */}
        {CAPTAIN && (
          <ol className="mt-16 space-y-10 md:space-y-14">
            <AgentCard
              agent={CAPTAIN}
              index={0}
              number={1}
              variant="captain"
              reduced={reduced}
            />
          </ol>
        )}

        {/* Core specialists — fire on every session. */}
        <GroupHeading
          eyebrow="Core specialists"
          count={CORE.length}
          blurb="Dispatched on every session, in order, no triggers required. They turn a single command into a planned, tested, reviewed pull request."
        />
        <ol className="space-y-10 md:space-y-14">
          {CORE.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={i}
              number={i + 2} // captain is 01, scout is 02, ...
              variant="core"
              reduced={reduced}
            />
          ))}
        </ol>

        {/* Optional specialists — dispatched only when their triggers fire. */}
        <GroupHeading
          eyebrow="Optional specialists"
          count={OPTIONAL.length}
          blurb="Dispatched only when the captain detects their trigger — a UI change for the designer, a stalled engineer for the debugger, sensitive files for the auditor, and so on."
        />
        <ol className="space-y-10 md:space-y-14">
          {OPTIONAL.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={i}
              number={i + 2 + CORE.length} // continue numbering after core
              variant="optional"
              reduced={reduced}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
