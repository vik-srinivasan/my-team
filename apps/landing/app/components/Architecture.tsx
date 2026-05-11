'use client';

import { motion, useReducedMotion } from 'motion/react';

// Architecture diagram (round-5 layout):
//   1. Infra strip (CLI → Wrapper daemon → sessions worktree) sits at the top —
//      shorter than the rest but with the same accent-blue stroke as Captain
//      so it reads as the boot path that produces the headline.
//   2. A dashed divider with the label "INFRA · HOW THE CAPTAIN GETS BOOTED"
//      separates infra from the headline.
//   3. The Wrapper daemon spawns Captain via a downward dashed arrow.
//   4. Captain sits centred underneath, the visual anchor.
//   5. Five sub-agents fan out below Captain. Each agent has a single
//      bidirectional accent-blue arrow connecting it to Captain — the arrow
//      reads as Captain ↔ agent (dispatch out, artifact back) without
//      needing two separate curves.
//
// Reading order: infra strip → divider → Captain → agent fan-out.

const VIEW_W = 980;
const VIEW_H = 720;

// ---------- Infra lane (top, demoted) ----------
interface InfraNode {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
}

const INFRA: readonly InfraNode[] = [
  { id: 'cli', title: 'team CLI', subtitle: 'commander + chalk' },
  { id: 'wrapper', title: 'Wrapper daemon', subtitle: 'HTTP · WS · node-pty' },
  { id: 'worktree', title: '~/team/sessions/<id>/', subtitle: 'git worktree + .team/' },
];

const INFRA_ROW_Y = 60;
const INFRA_W = 200;
const INFRA_H = 50;
const INFRA_GAP = 32;
const INFRA_ROW_TOTAL_W = INFRA.length * INFRA_W + (INFRA.length - 1) * INFRA_GAP;
const INFRA_ROW_X = (VIEW_W - INFRA_ROW_TOTAL_W) / 2;

function infraX(index: number): number {
  return INFRA_ROW_X + index * (INFRA_W + INFRA_GAP);
}

// ---------- Captain (centre stage, below infra) ----------
const CAPTAIN_Y = 218;
const CAPTAIN = {
  x: 360,
  y: CAPTAIN_Y,
  w: 260,
  h: 86,
} as const;

// ---------- Sub-agents (fan-out below Captain) ----------
interface SubAgent {
  readonly id: string;
  readonly title: string;
  readonly produces: string;
  readonly stack?: boolean; // render as a deck (engineer ×N)
}

const SUB_AGENTS: readonly SubAgent[] = [
  { id: 'scout', title: 'scout', produces: 'context.md' },
  { id: 'engineer', title: 'engineer', produces: 'commits', stack: true },
  { id: 'tester', title: 'tester', produces: 'test runs · bugs' },
  { id: 'reviewer', title: 'reviewer', produces: 'review.md' },
  { id: 'git', title: 'git', produces: 'pushes · opens PR' },
];

// Layout for the agent row — pushed further down for breathing room.
const AGENT_ROW_Y = 510;
const AGENT_W = 150;
const AGENT_H = 70;
const AGENT_GAP = 22;
const AGENT_ROW_TOTAL_W = SUB_AGENTS.length * AGENT_W + (SUB_AGENTS.length - 1) * AGENT_GAP;
const AGENT_ROW_X = (VIEW_W - AGENT_ROW_TOTAL_W) / 2;
const PRODUCES_LABEL_Y = AGENT_ROW_Y + AGENT_H + 22;

function agentX(index: number): number {
  return AGENT_ROW_X + index * (AGENT_W + AGENT_GAP);
}

// Engineer stack visuals (×N parallel)
const STACK_OFFSET = 4;
const STACK_COUNT = 3;

export default function Architecture() {
  const reduced = useReducedMotion();

  // Captain anchor points.
  const captainCx = CAPTAIN.x + CAPTAIN.w / 2;
  const captainTop = CAPTAIN.y;
  const captainBottom = CAPTAIN.y + CAPTAIN.h;

  // Infra divider y (dashed line + label sit just above it).
  const dividerY = 134;

  return (
    <section className="relative py-24 md:py-32 border-t border-[color:var(--color-border)]">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--color-accent-bright)]">
            Architecture
          </p>
          <h2 className="mt-3 text-balance text-3xl md:text-4xl font-semibold tracking-tight">
            Captain coordinates a team of specialists.
          </h2>
          <p className="mt-4 text-[color:var(--color-muted)] leading-relaxed">
            The captain is a long-running Claude Code process that dispatches sub-agents via
            the built-in <code className="font-mono text-[color:var(--color-text)]">Task</code>{' '}
            tool and reads their artifacts back from the session&apos;s{' '}
            <code className="font-mono text-[color:var(--color-text)]">.team/</code> directory.
            Same token budget, same working tree. The infra strip up top — CLI, wrapper
            daemon, worktree — is how the captain gets booted.
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
              aria-label="Architecture diagram (top to bottom): a three-box infra strip — team CLI, Wrapper daemon, sessions worktree — sits at the top with the same accent-blue stroke as Captain. The Wrapper daemon spawns the Captain below it. The Captain — the visual anchor — then connects to five sub-agents that fan out beneath it via the Task tool: scout (produces context.md), engineer ×N parallel (commits to the session branch), tester (runs the suite and files bugs), reviewer (produces review.md), and git (pushes and opens the PR). Each sub-agent is connected to Captain by a single bidirectional accent-blue arrow representing dispatch out and artifact back along the same line."
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

              {/* ---------- 1. Infra strip (top, demoted) ---------- */}

              {/* Infra connector lines: cli -> wrapper -> worktree.
                  Thin and dim; the boxes themselves carry the accent. */}
              {(() => {
                const cy = INFRA_ROW_Y + INFRA_H / 2;
                const cliRightX = infraX(0) + INFRA_W;
                const wrapperLeftX = infraX(1);
                const wrapperRightX = infraX(1) + INFRA_W;
                const worktreeLeftX = infraX(2);

                const straight = (x1: number, x2: number) =>
                  `M ${x1} ${cy} L ${x2} ${cy}`;

                return (
                  <g>
                    <path
                      d={straight(cliRightX, wrapperLeftX)}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.7}
                      strokeWidth={1}
                      markerEnd="url(#arrow-dim)"
                    />
                    <path
                      d={straight(wrapperRightX, worktreeLeftX)}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.7}
                      strokeWidth={1}
                      markerEnd="url(#arrow-dim)"
                    />
                  </g>
                );
              })()}

              {/* Infra boxes — accent-blue stroke matches Captain so the boot
                  path reads as the same family. Smaller than Captain so it
                  still reads as subordinate. */}
              {INFRA.map((node, i) => {
                const x = infraX(i);
                const y = INFRA_ROW_Y;
                return (
                  <g key={`infra-${node.id}`}>
                    <rect
                      x={x}
                      y={y}
                      width={INFRA_W}
                      height={INFRA_H}
                      rx={6}
                      fill="#0a0a0a"
                      stroke="#0e7490"
                      strokeWidth={1.25}
                    />
                    <text
                      x={x + INFRA_W / 2}
                      y={y + 22}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={11}
                      fontWeight={500}
                      fill="#e5e5e5"
                    >
                      {node.title}
                    </text>
                    {node.subtitle && (
                      <text
                        x={x + INFRA_W / 2}
                        y={y + 38}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontSize={9}
                        fill="#67e8f9"
                      >
                        {node.subtitle}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* ---------- 2. Divider between infra and headline ---------- */}
              <text
                x={VIEW_W / 2}
                y={dividerY - 10}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fill="#525252"
                letterSpacing="0.18em"
              >
                INFRA · HOW THE CAPTAIN GETS BOOTED
              </text>
              <line
                x1={60}
                y1={dividerY}
                x2={VIEW_W - 60}
                y2={dividerY}
                stroke="#262626"
                strokeWidth={1}
                strokeDasharray="4 6"
              />

              {/* ---------- 3. Spawn arrow from Wrapper down to Captain ---------- */}
              {(() => {
                const wrapperCx = infraX(1) + INFRA_W / 2;
                const wrapperBottom = INFRA_ROW_Y + INFRA_H;
                // Vertical drop from wrapper, slight curve into captain top.
                const spawnD =
                  `M ${wrapperCx} ${wrapperBottom} ` +
                  `C ${wrapperCx} ${wrapperBottom + 60}, ` +
                  `${captainCx} ${captainTop - 60}, ` +
                  `${captainCx} ${captainTop - 2}`;

                // Label sits ON the line, mid-way, with a bg chip.
                const labelY = (wrapperBottom + captainTop) / 2;
                return (
                  <g>
                    <path
                      d={spawnD}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.7}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      markerEnd="url(#arrow-dim)"
                    />
                    <rect
                      x={captainCx - 22}
                      y={labelY - 10}
                      width={44}
                      height={18}
                      fill="#0a0a0a"
                      rx={3}
                    />
                    <text
                      x={captainCx}
                      y={labelY + 3}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={9}
                      fill="#737373"
                    >
                      spawn
                    </text>
                  </g>
                );
              })()}

              {/* ---------- 4. Captain (the visual anchor) ---------- */}
              <g>
                <rect
                  x={CAPTAIN.x}
                  y={CAPTAIN.y}
                  width={CAPTAIN.w}
                  height={CAPTAIN.h}
                  rx={10}
                  fill="#0a0a0a"
                  stroke="#0e7490"
                  strokeWidth={2}
                />
                <text
                  x={captainCx}
                  y={CAPTAIN.y + 36}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={20}
                  fontWeight={700}
                  fill="#e5e5e5"
                  letterSpacing="0.04em"
                >
                  Captain
                </text>
                <text
                  x={captainCx}
                  y={CAPTAIN.y + 56}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={11}
                  fill="#67e8f9"
                >
                  orchestrator · reads .team/
                </text>
                <text
                  x={captainCx}
                  y={CAPTAIN.y + 72}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={10}
                  fill="#737373"
                >
                  claude (interactive)
                </text>
              </g>

              {/* ---------- 5. Captain ↔ Sub-agents (the headline) ----------

                  Routing: a single bidirectional accent-blue curve per agent
                  leaves Captain's BOTTOM edge from a tight INNER band
                  (anchorSpan ≈ 120) and lands on each agent's TOP-CENTRE.
                  Arrowheads at BOTH ends (marker-start at Captain, marker-end
                  at the agent) make the line read as Captain ↔ agent —
                  dispatch out, artifact back along the same line. */}

              {/* Task tool chip — sits ON the dispatch fan, just below Captain. */}
              {(() => {
                const chipW = 78;
                const chipH = 20;
                const chipY = captainBottom + 14;
                return (
                  <g>
                    <rect
                      x={captainCx - chipW / 2}
                      y={chipY}
                      width={chipW}
                      height={chipH}
                      fill="#0a0a0a"
                      stroke="#0e7490"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      rx={4}
                    />
                    <text
                      x={captainCx}
                      y={chipY + chipH - 6}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={10}
                      fill="#67e8f9"
                    >
                      Task tool
                    </text>
                  </g>
                );
              })()}

              {/* Dispatch curves — fan out from a tight INNER band of
                  Captain's bottom edge to each agent top-centre. Each curve
                  carries an arrowhead at BOTH ends (marker-start at Captain,
                  marker-end at the agent) so it reads as a single
                  bidirectional Captain ↔ agent line. */}
              {SUB_AGENTS.map((agent, i) => {
                const ax = agentX(i);
                const agentTopCx = ax + AGENT_W / 2;
                const agentTop = AGENT_ROW_Y;

                // Inner band: 120px wide, centred under Captain.
                const dispatchAnchorSpan = 120;
                const t = SUB_AGENTS.length === 1 ? 0.5 : i / (SUB_AGENTS.length - 1);
                const dispatchStartX =
                  captainCx - dispatchAnchorSpan / 2 + dispatchAnchorSpan * t;

                // Dispatch leaves agent top at centre.
                const midY = (captainBottom + agentTop) / 2;
                const dispatchD =
                  `M ${dispatchStartX} ${captainBottom} ` +
                  `C ${dispatchStartX} ${midY}, ` +
                  `${agentTopCx} ${midY}, ` +
                  `${agentTopCx} ${agentTop}`;

                return (
                  <path
                    key={`dispatch-${agent.id}`}
                    d={dispatchD}
                    fill="none"
                    stroke="#22d3ee"
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                    markerStart="url(#arrow-accent)"
                    markerEnd="url(#arrow-accent)"
                  />
                );
              })}

              {/* Sub-agent boxes (with engineer rendered as a stack). */}
              {SUB_AGENTS.map((agent, i) => {
                const ax = agentX(i);
                const ay = AGENT_ROW_Y;

                return (
                  <g key={`agent-${agent.id}`}>
                    {/* Stack cards (engineer only) */}
                    {agent.stack &&
                      Array.from({ length: STACK_COUNT - 1 }).map((_, sIdx) => {
                        const depth = STACK_COUNT - 1 - sIdx;
                        const offset = depth * STACK_OFFSET;
                        const opacity = 0.3 + (STACK_COUNT - depth) * 0.18;
                        return (
                          <rect
                            key={`stack-${agent.id}-${depth}`}
                            x={ax + offset}
                            y={ay + offset}
                            width={AGENT_W}
                            height={AGENT_H}
                            rx={8}
                            fill="#0a0a0a"
                            stroke="#0e7490"
                            strokeOpacity={opacity}
                            strokeWidth={1}
                          />
                        );
                      })}

                    {/* Front card */}
                    <rect
                      x={ax}
                      y={ay}
                      width={AGENT_W}
                      height={AGENT_H}
                      rx={8}
                      fill="#0a0a0a"
                      stroke={agent.stack ? '#0e7490' : '#3f3f3f'}
                      strokeWidth={agent.stack ? 1.75 : 1}
                    />
                    <text
                      x={ax + AGENT_W / 2}
                      y={ay + 28}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={15}
                      fontWeight={600}
                      fill="#e5e5e5"
                    >
                      {agent.title}
                    </text>
                    {agent.stack && (
                      <text
                        x={ax + AGENT_W / 2}
                        y={ay + 44}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontSize={9}
                        fill="#67e8f9"
                      >
                        ×N parallel
                      </text>
                    )}
                    {/* Produces label — all aligned at PRODUCES_LABEL_Y */}
                    <text
                      x={ax + AGENT_W / 2}
                      y={PRODUCES_LABEL_Y}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={10}
                      fill="#a3a3a3"
                    >
                      → {agent.produces}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
