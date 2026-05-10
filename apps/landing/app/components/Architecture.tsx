'use client';

import { motion, useReducedMotion } from 'motion/react';

// Architecture diagram: CLI + UI → wrapper daemon → captain → specialists.
// Static SVG, deliberately monochrome with a single accent path showing the
// "active" data flow on first paint.

const VIEW_W = 980;
const VIEW_H = 460;

interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly accent?: boolean;
}

const BOXES: readonly Box[] = [
  { id: 'cli', x: 40, y: 40, w: 200, h: 70, title: 'team CLI', subtitle: 'commander + chalk' },
  { id: 'ui', x: 40, y: 130, w: 200, h: 70, title: 'Web UI', subtitle: 'React 19 + Vite' },
  {
    id: 'wrapper',
    x: 360,
    y: 80,
    w: 260,
    h: 120,
    title: 'Wrapper daemon',
    subtitle: 'HTTP + WebSocket • node-pty • chokidar',
    accent: true,
  },
  {
    id: 'captain',
    x: 740,
    y: 30,
    w: 200,
    h: 80,
    title: 'Captain',
    subtitle: 'claude (interactive)',
    accent: true,
  },
  {
    id: 'specialists',
    x: 740,
    y: 130,
    w: 200,
    h: 80,
    title: 'Specialists',
    subtitle: 'scout · engineer · tester · reviewer · git',
  },
  {
    id: 'worktree',
    x: 360,
    y: 280,
    w: 260,
    h: 120,
    title: '~/team/sessions/<id>/',
    subtitle: 'git worktree + .team/',
    accent: true,
  },
];

interface Edge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly accent?: boolean;
}

const EDGES: readonly Edge[] = [
  { from: 'cli', to: 'wrapper', label: 'HTTP', accent: true },
  { from: 'ui', to: 'wrapper', label: 'WebSocket' },
  { from: 'wrapper', to: 'captain', label: 'spawn', accent: true },
  { from: 'captain', to: 'specialists', label: 'Task tool' },
  { from: 'wrapper', to: 'worktree', label: 'manage' },
  { from: 'captain', to: 'worktree' },
];

function findBox(id: string): Box {
  const b = BOXES.find((box) => box.id === id);
  if (!b) throw new Error(`Unknown box: ${id}`);
  return b;
}

function edgePath(edge: Edge): { readonly d: string; readonly mid: { x: number; y: number } } {
  const a = findBox(edge.from);
  const b = findBox(edge.to);
  const ax = a.x + a.w;
  const ay = a.y + a.h / 2;
  const bx = b.x;
  const by = b.y + b.h / 2;
  // Special-case the captain → worktree edge (right-side box → middle box) so
  // it routes cleanly down the right edge instead of crossing.
  if (edge.from === 'captain' && edge.to === 'worktree') {
    const startX = a.x + a.w / 2;
    const startY = a.y + a.h;
    const endX = b.x + b.w;
    const endY = b.y + b.h / 2;
    const d = `M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX + 60} ${endY}, ${endX} ${endY}`;
    return { d, mid: { x: (startX + endX) / 2 + 30, y: (startY + endY) / 2 } };
  }
  const midX = (ax + bx) / 2;
  const d = `M ${ax} ${ay} C ${midX} ${ay}, ${midX} ${by}, ${bx} ${by}`;
  return { d, mid: { x: midX, y: (ay + by) / 2 - 10 } };
}

export default function Architecture() {
  const reduced = useReducedMotion();

  return (
    <section className="relative py-24 md:py-32 border-t border-[color:var(--color-border)]">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            Architecture
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            A daemon, a captain, and the file system as the database.
          </h2>
          <p className="mt-4 text-[color:var(--color-muted)] leading-relaxed">
            The wrapper is a long-running Node process that owns sessions and child
            <code className="font-mono text-[color:var(--color-text)]"> claude </code>
            processes. The captain dispatches specialists via Claude Code&apos;s built-in Task
            tool — same token budget, same working directory.
          </p>
        </div>

        <motion.div
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mt-12 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 backdrop-blur"
        >
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="block min-w-[760px] w-full h-auto p-4"
              role="img"
              aria-label="Architecture diagram: CLI and Web UI connect to the wrapper daemon over HTTP and WebSocket. The daemon spawns a Captain Claude process and manages the worktree. The Captain dispatches Scout, Engineer, Tester, Reviewer, and Git specialists."
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#525252" />
                </marker>
                <marker
                  id="arrow-accent"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
                </marker>
              </defs>

              {EDGES.map((edge, i) => {
                const { d, mid } = edgePath(edge);
                const stroke = edge.accent ? '#22d3ee' : '#525252';
                const strokeOpacity = edge.accent ? 0.7 : 0.4;
                return (
                  <g key={i}>
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeOpacity={strokeOpacity}
                      strokeWidth={1.5}
                      markerEnd={`url(#${edge.accent ? 'arrow-accent' : 'arrow'})`}
                    />
                    {edge.label && (
                      <g>
                        <rect
                          x={mid.x - 28}
                          y={mid.y - 9}
                          width={56}
                          height={18}
                          fill="#0a0a0a"
                          rx={3}
                        />
                        <text
                          x={mid.x}
                          y={mid.y + 4}
                          textAnchor="middle"
                          fontFamily="var(--font-mono)"
                          fontSize={10}
                          fill={edge.accent ? '#67e8f9' : '#a3a3a3'}
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {BOXES.map((box) => (
                <g key={box.id}>
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    rx={8}
                    fill="#0a0a0a"
                    stroke={box.accent ? '#0e7490' : '#3f3f3f'}
                    strokeWidth={box.accent ? 1.5 : 1}
                  />
                  <text
                    x={box.x + box.w / 2}
                    y={box.y + (box.subtitle ? box.h / 2 - 4 : box.h / 2 + 4)}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize={14}
                    fontWeight={600}
                    fill="#e5e5e5"
                  >
                    {box.title}
                  </text>
                  {box.subtitle && (
                    <text
                      x={box.x + box.w / 2}
                      y={box.y + box.h / 2 + 14}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={10}
                      fill="#737373"
                    >
                      {box.subtitle}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
