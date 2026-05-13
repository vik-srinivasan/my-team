'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CORE_SPECIALISTS, OPTIONAL_SPECIALISTS, SPECIALISTS } from '../agents';
import {
  arcPoints,
  flowReducer,
  INITIAL_FLOW_STATE,
  quadraticEdgePath,
  type FlowAction,
  type FlowState,
} from './agent-flow-state';

// Two-orbit layout — the captain at the centre, the four core specialists
// on a tighter inner orbit at full size + solid stroke, and the five optional
// specialists on a wider outer orbit at smaller size + dashed/dimmed stroke.
// The visual hierarchy mirrors the reality of dispatch: core agents fire on
// every session, optional ones only when their triggers fire.
const VIEW_W = 760;
const VIEW_H = 520;
const CAPTAIN = { x: VIEW_W / 2, y: VIEW_H / 2 } as const;

const CORE_RADIUS = 140;
const OPTIONAL_RADIUS = 225;

const CORE_NODE_R = 28;
const OPTIONAL_NODE_R = 20;

// Inner orbit: 4 core agents distributed every 90°, starting at the top.
// Outer orbit: 5 optional agents distributed every 72°, offset by 36° from
// the inner ring so the outer nodes sit between the inner cardinal positions
// (no radial stacking).
const CORE_NODES = arcPoints(CORE_SPECIALISTS.length, {
  centerX: CAPTAIN.x,
  centerY: CAPTAIN.y,
  radius: CORE_RADIUS,
  startDeg: -90,
  endDeg: -90 + 270, // 4 cardinal points spaced 90° apart (top, right, bottom, left)
});

const OPTIONAL_NODES = arcPoints(OPTIONAL_SPECIALISTS.length, {
  centerX: CAPTAIN.x,
  centerY: CAPTAIN.y,
  radius: OPTIONAL_RADIUS,
  startDeg: -54, // -90 + 36° offset
  endDeg: -54 + 288, // 5 points spaced 72° apart, offset 36° from the inner ring
});

// `arcPoints` includes both endpoints, so a "full circle" needs (count - 1)
// gaps. With 4 inner agents at 90° spacing the arc spans 270°; with 5 outer
// agents at 72° spacing the arc spans 288°. The math above is the clearest
// way to express that without polluting `agent-flow-state.ts` with a second
// helper.

const CORE_EDGES: readonly string[] = CORE_NODES.map((node) =>
  quadraticEdgePath({ from: CAPTAIN, to: node, curl: 16 }),
);

const OPTIONAL_EDGES: readonly string[] = OPTIONAL_NODES.map((node) =>
  quadraticEdgePath({ from: CAPTAIN, to: node, curl: 24 }),
);

// Combined node + edge tables in SPECIALISTS order, so the dispatch animation
// can iterate the same flat list it always has. The dispatch loop visits the
// 4 core agents first (matching SPECIALISTS order), then the 5 optional ones.
interface SpecialistNode {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly fontSize: number;
  readonly isCore: boolean;
  readonly path: string;
}

const SPECIALIST_NODES: readonly SpecialistNode[] = SPECIALISTS.map((agent) => {
  if (agent.core) {
    const idx = CORE_SPECIALISTS.findIndex((a) => a.id === agent.id);
    const node = CORE_NODES[idx];
    return {
      x: node.x,
      y: node.y,
      r: CORE_NODE_R,
      fontSize: 11,
      isCore: true,
      path: CORE_EDGES[idx],
    };
  }
  const idx = OPTIONAL_SPECIALISTS.findIndex((a) => a.id === agent.id);
  const node = OPTIONAL_NODES[idx];
  return {
    x: node.x,
    y: node.y,
    r: OPTIONAL_NODE_R,
    fontSize: 10,
    isCore: false,
    path: OPTIONAL_EDGES[idx],
  };
});

const DISPATCH_MS = 900;
const ARRIVE_MS = 600;
const RETURN_MS = 700;

function legDuration(leg: FlowState['leg']): number {
  if (leg === 'dispatch') return DISPATCH_MS;
  if (leg === 'arrive') return ARRIVE_MS;
  return RETURN_MS;
}

const reducer = (state: FlowState, action: FlowAction): FlowState =>
  flowReducer(state, action, SPECIALISTS.length);

export default function AgentFlow() {
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(reducer, INITIAL_FLOW_STATE);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced || paused) return;
    timerRef.current = setTimeout(
      () => dispatch({ type: 'advance' }),
      legDuration(state.leg),
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, reduced, paused]);

  const activeSpecialist = SPECIALISTS[state.index];
  const activeSpecialistNode = SPECIALIST_NODES[state.index];
  const activePath = activeSpecialistNode.path;
  const dotIsTraveling = state.leg !== 'arrive';

  const visitedSet = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i <= state.index; i++) set.add(i);
    return set;
  }, [state.index]);

  return (
    <div
      className="relative w-full"
      role="img"
      aria-label="Animated diagram showing the Captain agent at the centre. Four core specialists (scout, engineer, tester, reviewer) sit on a tight inner orbit at full size and run on every session. Five optional specialists (debugger, designer, runner, auditor, documenter) sit on a wider outer orbit at reduced size with dashed strokes and dispatch only when their triggers fire."
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
        // The arrive-pulse ring scales optional nodes to 2.2× radius. The
        // bottom-most outer node sits at y≈485, so the pulse can reach
        // y≈529 — 9px outside the 520-tall viewBox. `overflow="visible"`
        // prevents silent clipping without compromising the pulse scale.
        overflow="visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="captain-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#0e7490" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
          </radialGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={CAPTAIN.x} cy={CAPTAIN.y} r={90} fill="url(#captain-glow)" />

        {/* Faint orbit guides — keep the two-ring relationship legible even
            when the dispatch dot is between hops. */}
        <circle
          cx={CAPTAIN.x}
          cy={CAPTAIN.y}
          r={CORE_RADIUS}
          fill="none"
          stroke="#303030"
          strokeWidth={1}
        />
        <circle
          cx={CAPTAIN.x}
          cy={CAPTAIN.y}
          r={OPTIONAL_RADIUS}
          fill="none"
          stroke="#282828"
          strokeWidth={1}
          strokeDasharray="3 4"
        />

        {/* Base connectors — solid for core, dashed/dimmed for optional. */}
        <g>
          {SPECIALIST_NODES.map((node, i) => (
            <path
              key={`base-${SPECIALISTS[i].id}`}
              d={node.path}
              fill="none"
              stroke={node.isCore ? '#262626' : '#1f1f1f'}
              strokeWidth={node.isCore ? 1.5 : 1}
              strokeOpacity={node.isCore ? 1 : 0.7}
              strokeDasharray={node.isCore ? undefined : '4 3'}
              strokeLinecap="round"
            />
          ))}
        </g>

        {!reduced && activePath && (
          <g>
            <motion.path
              key={`active-${state.index}-${state.leg}`}
              d={activePath}
              fill="none"
              stroke={activeSpecialist.color}
              strokeOpacity={0.6}
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: state.leg === 'return' ? 0 : 1,
                opacity: state.leg === 'arrive' ? 0.9 : 0.6,
              }}
              transition={{
                duration: legDuration(state.leg) / 1000,
                ease: 'easeInOut',
              }}
            />
          </g>
        )}

        {/* Captain node */}
        <g>
          <circle
            cx={CAPTAIN.x}
            cy={CAPTAIN.y}
            r={42}
            fill="#0a0a0a"
            stroke="#22d3ee"
            strokeWidth={1.5}
          />
          <circle
            cx={CAPTAIN.x}
            cy={CAPTAIN.y}
            r={42}
            fill="none"
            stroke="#22d3ee"
            strokeOpacity={0.25}
            strokeWidth={6}
            filter="url(#soft-glow)"
          />
          <text
            x={CAPTAIN.x}
            y={CAPTAIN.y - 4}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={13}
            fontWeight={600}
            fill="#e5e5e5"
          >
            captain
          </text>
          <text
            x={CAPTAIN.x}
            y={CAPTAIN.y + 12}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={9}
            fill="#737373"
            letterSpacing="0.05em"
          >
            ORCHESTRATOR
          </text>
        </g>

        {/* Specialist nodes */}
        {SPECIALIST_NODES.map((node, i) => {
          const agent = SPECIALISTS[i];
          const isActive = i === state.index;
          const isArriving = isActive && state.leg === 'arrive';
          const wasVisited = visitedSet.has(i);
          return (
            <g key={agent.id} transform={`translate(${node.x}, ${node.y})`}>
              {!reduced && isArriving && (
                <motion.circle
                  cx={0}
                  cy={0}
                  r={node.r}
                  fill="none"
                  stroke={agent.color}
                  strokeWidth={2}
                  initial={{ opacity: 0.8, scale: 0.8 }}
                  animate={{ opacity: 0, scale: 2.2 }}
                  transition={{ duration: ARRIVE_MS / 1000, ease: 'easeOut' }}
                />
              )}
              <circle
                cx={0}
                cy={0}
                r={node.r}
                fill="#0a0a0a"
                stroke={agent.color}
                strokeOpacity={
                  node.isCore
                    ? wasVisited
                      ? 0.85
                      : 0.4
                    : wasVisited
                      ? 0.7
                      : 0.3
                }
                strokeWidth={node.isCore ? 1.5 : 1}
                strokeDasharray={node.isCore ? undefined : '4 3'}
              />
              <text
                textAnchor="middle"
                y={node.isCore ? 2 : 3}
                fontFamily="var(--font-mono)"
                fontSize={node.fontSize}
                fontWeight={600}
                fill={
                  node.isCore
                    ? wasVisited
                      ? '#e5e5e5'
                      : '#a3a3a3'
                    : wasVisited
                      ? '#d4d4d4'
                      : '#8a8a8a'
                }
              >
                {agent.label.toLowerCase()}
              </text>
              <text
                textAnchor="middle"
                y={node.isCore ? 13 : 12}
                fontFamily="var(--font-mono)"
                fontSize={6}
                letterSpacing="0.06em"
                fill={node.isCore ? '#525252' : '#444444'}
              >
                {node.isCore ? 'CORE' : 'OPTIONAL'}
              </text>
            </g>
          );
        })}

        {/* Traveling dot */}
        {!reduced && dotIsTraveling && activePath && (
          <motion.circle
            key={`dot-${state.index}-${state.leg}`}
            r={5}
            fill={activeSpecialist.color}
            filter="url(#soft-glow)"
            initial={{
              offsetDistance: state.leg === 'dispatch' ? '0%' : '100%',
              opacity: 0,
            }}
            animate={{
              offsetDistance: state.leg === 'dispatch' ? '100%' : '0%',
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: legDuration(state.leg) / 1000,
              ease: 'easeInOut',
              opacity: { times: [0, 0.15, 0.85, 1] },
            }}
            style={{
              offsetPath: `path('${activePath}')`,
              offsetRotate: '0deg',
            }}
          />
        )}

      </svg>

      {/* Static fallback caption — only rendered for reduced-motion users so
          they get the same dispatch-model summary the animation conveys. */}
      {reduced && (
        <p className="mt-3 px-2 text-center font-mono text-xs leading-relaxed text-[color:var(--color-muted)]">
          captain orchestrates 4 core agents (scout, engineer, tester, reviewer) and
          dispatches up to 5 optional ones (debugger, designer, runner, auditor,
          documenter) when triggers fire.
        </p>
      )}

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: activeSpecialist.color,
            boxShadow: reduced ? 'none' : `0 0 12px ${activeSpecialist.color}`,
          }}
          aria-hidden="true"
        />
        <span className="font-mono text-[color:var(--color-muted)]" aria-live="polite">
          {reduced ? '4 core + 5 optional. One pull request.' : activeSpecialist.status}
        </span>
      </div>
    </div>
  );
}
