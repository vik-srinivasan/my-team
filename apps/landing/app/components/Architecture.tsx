'use client';

import { motion, useReducedMotion } from 'motion/react';

// Architecture diagram: CLI + UI -> wrapper daemon -> captain -> specialists.
// Static SVG, deliberately monochrome with a single accent path showing the
// "active" data flow on first paint. Engineer is rendered as a stacked deck to
// signal that the captain can dispatch multiple engineers in parallel.

const VIEW_W = 980;
const VIEW_H = 540;

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
  { id: 'cli', x: 40, y: 100, w: 200, h: 70, title: 'team CLI', subtitle: 'commander + chalk' },
  { id: 'ui', x: 40, y: 190, w: 200, h: 70, title: 'Web UI', subtitle: 'React 19 + Vite · WIP' },
  {
    id: 'wrapper',
    x: 360,
    y: 140,
    w: 260,
    h: 120,
    title: 'Wrapper daemon',
    subtitle: 'HTTP + WebSocket • node-pty • chokidar',
    accent: true,
  },
  {
    id: 'captain',
    x: 740,
    y: 90,
    w: 200,
    h: 80,
    title: 'Captain',
    subtitle: 'claude (interactive)',
    accent: true,
  },
  {
    id: 'worktree',
    x: 360,
    y: 350,
    w: 260,
    h: 120,
    title: '~/team/sessions/<id>/',
    subtitle: 'git worktree + .team/',
    accent: true,
  },
];

interface Specialist {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly title: string;
}

// Four single-instance specialists arranged in a 2x2 grid to the left of the
// engineer (which gets its own larger, stacked panel to show parallelism).
const SPECIALISTS: readonly Specialist[] = [
  { id: 'scout', x: 660, y: 220, w: 110, h: 50, title: 'scout' },
  { id: 'tester', x: 780, y: 220, w: 110, h: 50, title: 'tester' },
  { id: 'reviewer', x: 660, y: 280, w: 110, h: 50, title: 'reviewer' },
  { id: 'git', x: 780, y: 280, w: 110, h: 50, title: 'git' },
];

// Engineer is intentionally larger and rendered as a stack of three cards to
// communicate "captain can dispatch N engineers in parallel".
const ENGINEER = {
  x: 700,
  y: 380,
  w: 200,
  h: 80,
  stackOffset: 5,
  stackCount: 3,
} as const;

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
  // Special-case the captain -> worktree edge (right-side box -> middle box) so
  // it routes cleanly down the right edge instead of crossing.
  if (edge.from === 'captain' && edge.to === 'worktree') {
    const startX = a.x;
    const startY = a.y + a.h / 2;
    const endX = b.x + b.w;
    const endY = b.y + b.h / 2;
    const midX = (startX + endX) / 2;
    const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
    return { d, mid: { x: midX, y: (startY + endY) / 2 } };
  }
  const midX = (ax + bx) / 2;
  const d = `M ${ax} ${ay} C ${midX} ${ay}, ${midX} ${by}, ${bx} ${by}`;
  return { d, mid: { x: midX, y: (ay + by) / 2 - 10 } };
}

// Path from the bottom of the Captain box to the top-center of a specialist.
function captainToSpecialistPath(target: { x: number; y: number; w: number }): string {
  const captain = findBox('captain');
  const startX = captain.x + captain.w / 2;
  const startY = captain.y + captain.h;
  const endX = target.x + target.w / 2;
  const endY = target.y;
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

// Engineer sits below the specialists grid, so the dispatch line leaves the
// right edge of the Captain, curves around the right side of the grid, and
// enters the engineer from the right. This avoids visually cutting through the
// other specialists.
function captainToEngineerPath(): string {
  const captain = findBox('captain');
  const startX = captain.x + captain.w; // right edge of Captain
  const startY = captain.y + captain.h / 2;
  const endX = ENGINEER.x + ENGINEER.w; // right edge of Engineer (front card)
  const endY = ENGINEER.y + ENGINEER.h / 2;
  const detourX = 955; // just inside the viewBox
  return `M ${startX} ${startY} C ${detourX} ${startY}, ${detourX} ${endY}, ${endX} ${endY}`;
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
              aria-label="Architecture diagram: CLI and Web UI connect to the wrapper daemon over HTTP and WebSocket. The daemon spawns a Captain Claude process and manages the worktree. The Captain dispatches Scout, Engineer, Tester, Reviewer, and Git specialists via the Task tool. Multiple Engineers can run in parallel."
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
                <marker
                  id="arrow-dim"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#404040" />
                </marker>
              </defs>

              {/* my-team header */}
              <g>
                <text
                  x={VIEW_W / 2}
                  y={42}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={22}
                  fontWeight={600}
                  fill="#0e7490"
                  letterSpacing="0.12em"
                >
                  MY-TEAM
                </text>
                <text
                  x={VIEW_W / 2}
                  y={62}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={10}
                  fill="#737373"
                  letterSpacing="0.18em"
                >
                  multi-agent orchestration
                </text>
                <line
                  x1={VIEW_W / 2 - 80}
                  y1={74}
                  x2={VIEW_W / 2 + 80}
                  y2={74}
                  stroke="#0e7490"
                  strokeOpacity={0.4}
                  strokeWidth={1}
                />
              </g>

              {/* Primary edges */}
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

              {/* Captain -> each specialist (subtle dispatch lines) */}
              {SPECIALISTS.map((s) => (
                <path
                  key={`dispatch-${s.id}`}
                  d={captainToSpecialistPath(s)}
                  fill="none"
                  stroke="#404040"
                  strokeOpacity={0.55}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  markerEnd="url(#arrow-dim)"
                />
              ))}

              {/* Captain -> engineer (accent, since engineer is the dispatch headliner).
                  Routes around the right side of the specialists grid. */}
              <path
                d={captainToEngineerPath()}
                fill="none"
                stroke="#22d3ee"
                strokeOpacity={0.65}
                strokeWidth={1.5}
                markerEnd="url(#arrow-accent)"
              />

              {/* "Task tool" label - sits on the captain -> engineer accent path,
                  on the curve apex (right of the specialists grid). Filled bg
                  cleanly masks the path beneath it. */}
              <g>
                <rect
                  x={915}
                  y={245}
                  width={62}
                  height={20}
                  fill="#0a0a0a"
                  stroke="#0e7490"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  rx={4}
                />
                <text
                  x={946}
                  y={259}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={10}
                  fill="#67e8f9"
                >
                  Task tool
                </text>
              </g>

              {/* Primary boxes */}
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

              {/* Single-instance specialists */}
              {SPECIALISTS.map((s) => (
                <g key={s.id}>
                  <rect
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    rx={6}
                    fill="#0a0a0a"
                    stroke="#3f3f3f"
                    strokeWidth={1}
                  />
                  <text
                    x={s.x + s.w / 2}
                    y={s.y + s.h / 2 + 4}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize={13}
                    fontWeight={600}
                    fill="#e5e5e5"
                  >
                    {s.title}
                  </text>
                </g>
              ))}

              {/* Engineer: stacked-card deck to convey "N parallel instances".
                  Render back cards first (largest offset), then front card. */}
              {Array.from({ length: ENGINEER.stackCount }).map((_, idx) => {
                // idx 0 is the back-most card; the last iteration is the front card.
                const depth = ENGINEER.stackCount - 1 - idx;
                if (depth === 0) return null; // front card drawn separately below
                const offset = depth * ENGINEER.stackOffset;
                const opacity = 0.35 + (ENGINEER.stackCount - depth) * 0.15;
                return (
                  <rect
                    key={`engineer-stack-${depth}`}
                    x={ENGINEER.x + offset}
                    y={ENGINEER.y + offset}
                    width={ENGINEER.w}
                    height={ENGINEER.h}
                    rx={8}
                    fill="#0a0a0a"
                    stroke="#0e7490"
                    strokeOpacity={opacity}
                    strokeWidth={1}
                  />
                );
              })}
              {/* Engineer front card */}
              <g>
                <rect
                  x={ENGINEER.x}
                  y={ENGINEER.y}
                  width={ENGINEER.w}
                  height={ENGINEER.h}
                  rx={8}
                  fill="#0a0a0a"
                  stroke="#0e7490"
                  strokeWidth={1.75}
                />
                <text
                  x={ENGINEER.x + ENGINEER.w / 2}
                  y={ENGINEER.y + ENGINEER.h / 2 - 2}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={16}
                  fontWeight={600}
                  fill="#e5e5e5"
                >
                  engineer
                </text>
                <text
                  x={ENGINEER.x + ENGINEER.w / 2}
                  y={ENGINEER.y + ENGINEER.h / 2 + 16}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={10}
                  fill="#67e8f9"
                >
                  ×N parallel
                </text>
              </g>
            </svg>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
