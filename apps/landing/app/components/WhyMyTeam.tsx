'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Users, Zap, Coffee } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

interface ValueProp {
  readonly id: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly title: string;
  readonly body: string;
}

const VALUE_PROPS: readonly ValueProp[] = [
  {
    id: 'team',
    icon: Users,
    title: 'Team-grade output',
    body: 'Specialists scout, build, test, and review in sequence — not one agent guessing.',
  },
  {
    id: 'tokens',
    icon: Zap,
    title: 'Lighter tokens',
    body: 'Each agent sees only its slice, so total spend stays well below mega-prompt runs.',
  },
  {
    id: 'handsoff',
    icon: Coffee,
    title: 'Walk away',
    body: 'Approve the plan once. Come back to a tested, reviewed, preview-deployed PR.',
  },
];

export default function WhyMyTeam() {
  const reduced = useReducedMotion();
  const initial = reduced ? { opacity: 1 } : { opacity: 0, y: 24 };

  return (
    <section className="relative py-24 md:py-32 border-t border-[color:var(--color-border)]">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            Why my-team
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            A whole team, on tap.
          </h2>
          <p className="mt-4 text-[color:var(--color-muted)] leading-relaxed">
            The shape of the work matches the shape of a real engineering team — split scope, lower
            cost, hands-off shipping.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {VALUE_PROPS.map((prop, i) => {
            const Icon = prop.icon;
            return (
              <motion.div
                key={prop.id}
                initial={initial}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: reduced ? 0 : i * 0.08 }}
                className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 backdrop-blur p-6"
              >
                <Icon
                  width={20}
                  height={20}
                  aria-hidden="true"
                  className="text-[color:var(--color-accent-bright)]"
                />
                <h3 className="mt-4 text-lg font-semibold">{prop.title}</h3>
                <p className="mt-2 text-sm text-[color:var(--color-muted)] leading-relaxed">
                  {prop.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
