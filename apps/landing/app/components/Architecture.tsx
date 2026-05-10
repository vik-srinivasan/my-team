'use client';

import { motion, useReducedMotion } from 'motion/react';

// Architecture diagram: Captain at the centre with sub-agents fanning out.
// Each sub-agent has a labelled "produces" edge showing what it returns to
// Captain (context.md, commits, suite, review.md, PR). The CLI / Web UI /
// Wrapper / sessions infra is rendered as a thin secondary lane below — real
// but visually demoted, since the headline is the agent fan-out.

const VIEW_W = 980;
const VIEW_H = 640;

// ---------- Captain (centre stage) ----------
const CAPTAIN = {
  x: 360,
  y: 90,
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

// Layout for the agent row.
const AGENT_ROW_Y = 290;
const AGENT_W = 150;
const AGENT_H = 70;
const AGENT_GAP = 22;
const AGENT_ROW_TOTAL_W = SUB_AGENTS.length * AGENT_W + (SUB_AGENTS.length - 1) * AGENT_GAP;
const AGENT_ROW_X = (VIEW_W - AGENT_ROW_TOTAL_W) / 2;

function agentX(index: number): number {
  return AGENT_ROW_X + index * (AGENT_W + AGENT_GAP);
}

// ---------- Infra lane (demoted) ----------
interface InfraNode {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
}

const INFRA: readonly InfraNode[] = [
  { id: 'cli', title: 'team CLI', subtitle: 'commander + chalk' },
  { id: 'ui', title: 'Web UI', subtitle: 'React 19 · WIP' },
  { id: 'wrapper', title: 'Wrapper daemon', subtitle: 'HTTP · WebSocket · node-pty' },
  { id: 'worktree', title: '~/team/sessions/<id>/', subtitle: 'git worktree + .team/' },
];

const INFRA_ROW_Y = 530;
const INFRA_W = 200;
const INFRA_H = 56;
const INFRA_GAP = 20;
const INFRA_ROW_TOTAL_W = INFRA.length * INFRA_W + (INFRA.length - 1) * INFRA_GAP;
const INFRA_ROW_X = (VIEW_W - INFRA_ROW_TOTAL_W) / 2;

function infraX(index: number): number {
  return INFRA_ROW_X + index * (INFRA_W + INFRA_GAP);
}

// Engineer stack visuals (×N parallel)
const STACK_OFFSET = 4;
const STACK_COUNT = 3;

export default function Architecture() {
  const reduced = useReducedMotion();

  // Captain anchor points.
  const captainCx = CAPTAIN.x + CAPTAIN.w / 2;
  const captainBottom = CAPTAIN.y + CAPTAIN.h;
  const captainLeft = CAPTAIN.x;
  const captainRight = CAPTAIN.x + CAPTAIN.w;
  const captainCy = CAPTAIN.y + CAPTAIN.h / 2;

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
            Same token budget, same working tree. The CLI, web UI, and wrapper daemon below are
            how the captain gets booted.
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
              aria-label="Architecture diagram: the Captain sits at the centre and dispatches five sub-agents — scout (produces context.md), engineer ×N parallel (commits to the session branch), tester (runs the suite and files bugs), reviewer (produces review.md), and git (pushes and opens the PR). Each sub-agent returns its artifact back to Captain via the Task tool. Below the agent row, a thin infra lane shows the team CLI and Web UI feeding the wrapper daemon, which spawns Captain and manages the session worktree."
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

              {/* Header */}
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
                  captain · scout · engineer · tester · reviewer · git
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

              {/* ---------- Captain ↔ Sub-agents (the headline) ---------- */}

              {/* Dispatch + return paths between Captain and each sub-agent.
                  Two parallel curves per agent: dispatch (accent, downward to
                  agent top-left) and result (dim, upward from agent top-right
                  back to Captain). */}
              {SUB_AGENTS.map((agent, i) => {
                const ax = agentX(i);
                const agentTop = AGENT_ROW_Y;
                const agentLeftX = ax + AGENT_W * 0.35;
                const agentRightX = ax + AGENT_W * 0.65;

                // Dispatch: Captain bottom-centre -> agent top-left
                const dispatchStartX = captainCx - 30 + i * 12 - SUB_AGENTS.length * 6;
                const dispatchD =
                  `M ${dispatchStartX} ${captainBottom} ` +
                  `C ${dispatchStartX} ${captainBottom + 60}, ` +
                  `${agentLeftX} ${agentTop - 60}, ` +
                  `${agentLeftX} ${agentTop}`;

                // Result: agent top-right -> Captain bottom (slight offset right)
                const resultEndX = captainCx + 30 - i * 12 + SUB_AGENTS.length * 6;
                const resultD =
                  `M ${agentRightX} ${agentTop} ` +
                  `C ${agentRightX} ${agentTop - 60}, ` +
                  `${resultEndX} ${captainBottom + 60}, ` +
                  `${resultEndX} ${captainBottom}`;

                return (
                  <g key={`flow-${agent.id}`}>
                    {/* dispatch */}
                    <path
                      d={dispatchD}
                      fill="none"
                      stroke="#22d3ee"
                      strokeOpacity={0.55}
                      strokeWidth={1.25}
                      markerEnd="url(#arrow-accent)"
                    />
                    {/* result */}
                    <path
                      d={resultD}
                      fill="none"
                      stroke="#525252"
                      strokeOpacity={0.55}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      markerEnd="url(#arrow)"
                    />
                  </g>
                );
              })}

              {/* "Task tool" label sitting on the dispatch fan, just below Captain. */}
              <g>
                <rect
                  x={captainCx - 38}
                  y={captainBottom + 18}
                  width={76}
                  height={20}
                  fill="#0a0a0a"
                  stroke="#0e7490"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  rx={4}
                />
                <text
                  x={captainCx}
                  y={captainBottom + 32}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={10}
                  fill="#67e8f9"
                >
                  Task tool
                </text>
              </g>

              {/* Captain box */}
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
                    {/* Produces label sits just below the card */}
                    <text
                      x={ax + AGENT_W / 2}
                      y={ay + AGENT_H + 18}
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

              {/* Divider between agent fan-out and the demoted infra lane */}
              <line
                x1={60}
                y1={INFRA_ROW_Y - 50}
                x2={VIEW_W - 60}
                y2={INFRA_ROW_Y - 50}
                stroke="#262626"
                strokeWidth={1}
                strokeDasharray="4 6"
              />
              <text
                x={VIEW_W / 2}
                y={INFRA_ROW_Y - 32}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fill="#525252"
                letterSpacing="0.18em"
              >
                INFRA · HOW THE CAPTAIN GETS BOOTED
              </text>

              {/* ---------- Infra lane (demoted) ---------- */}

              {/* Infra connector lines: cli/ui -> wrapper -> worktree, plus
                  wrapper -> Captain (the spawn). All thin and dim. */}
              {(() => {
                const cliY = INFRA_ROW_Y + INFRA_H / 2;
                const cliRightX = infraX(0) + INFRA_W;
                const uiRightX = infraX(1) + INFRA_W;
                const wrapperLeftX = infraX(2);
                const wrapperRightX = infraX(2) + INFRA_W;
                const wrapperCx = infraX(2) + INFRA_W / 2;
                const wrapperTop = INFRA_ROW_Y;
                const worktreeLeftX = infraX(3);

                // cli -> wrapper (short straight-ish curve)
                const cliToWrapper =
                  `M ${cliRightX} ${cliY} ` +
                  `C ${(cliRightX + wrapperLeftX) / 2} ${cliY}, ` +
                  `${(cliRightX + wrapperLeftX) / 2} ${cliY}, ` +
                  `${wrapperLeftX} ${cliY}`;
                // ui -> wrapper
                const uiToWrapper =
                  `M ${uiRightX} ${cliY} ` +
                  `C ${(uiRightX + wrapperLeftX) / 2} ${cliY}, ` +
                  `${(uiRightX + wrapperLeftX) / 2} ${cliY}, ` +
                  `${wrapperLeftX} ${cliY}`;
                // wrapper -> worktree
                const wrapperToWorktree =
                  `M ${wrapperRightX} ${cliY} ` +
                  `C ${(wrapperRightX + worktreeLeftX) / 2} ${cliY}, ` +
                  `${(wrapperRightX + worktreeLeftX) / 2} ${cliY}, ` +
                  `${worktreeLeftX} ${cliY}`;
                // wrapper -> Captain (spawn) — long upward curve from wrapper top to Captain bottom-left/right
                const spawnD =
                  `M ${wrapperCx} ${wrapperTop} ` +
                  `C ${wrapperCx} ${wrapperTop - 80}, ` +
                  `${captainLeft - 20} ${captainBottom + 80}, ` +
                  `${captainLeft} ${captainBottom - 14}`;

                return (
                  <g>
                    <path
                      d={cliToWrapper}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.7}
                      strokeWidth={1}
                      markerEnd="url(#arrow-dim)"
                    />
                    <path
                      d={uiToWrapper}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.7}
                      strokeWidth={1}
                      markerEnd="url(#arrow-dim)"
                    />
                    <path
                      d={wrapperToWorktree}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.7}
                      strokeWidth={1}
                      markerEnd="url(#arrow-dim)"
                    />
                    {/* spawn arrow up to Captain */}
                    <path
                      d={spawnD}
                      fill="none"
                      stroke="#404040"
                      strokeOpacity={0.55}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      markerEnd="url(#arrow-dim)"
                    />
                    {/* spawn label */}
                    <g>
                      <rect
                        x={captainLeft - 60}
                        y={captainCy - 9}
                        width={48}
                        height={18}
                        fill="#0a0a0a"
                        rx={3}
                      />
                      <text
                        x={captainLeft - 36}
                        y={captainCy + 4}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontSize={9}
                        fill="#737373"
                      >
                        spawn
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* Infra boxes */}
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
                      stroke="#262626"
                      strokeWidth={1}
                    />
                    <text
                      x={x + INFRA_W / 2}
                      y={y + (node.subtitle ? 24 : INFRA_H / 2 + 4)}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={12}
                      fontWeight={500}
                      fill="#a3a3a3"
                    >
                      {node.title}
                    </text>
                    {node.subtitle && (
                      <text
                        x={x + INFRA_W / 2}
                        y={y + 42}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontSize={9}
                        fill="#525252"
                      >
                        {node.subtitle}
                      </text>
                    )}
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
