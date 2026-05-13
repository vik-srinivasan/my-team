'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { SPECIALISTS } from '../agents';
import {
  arcPoints,
  flowReducer,
  INITIAL_FLOW_STATE,
  quadraticEdgePath,
  type FlowAction,
  type FlowState,
} from './agent-flow-state';

const VIEW_W = 620;
const VIEW_H = 460;
const CAPTAIN = { x: 150, y: VIEW_H / 2 } as const;

const SPECIALIST_NODES = arcPoints(SPECIALISTS.length, {
  centerX: CAPTAIN.x,
  centerY: CAPTAIN.y,
  radius: 230,
  startDeg: -56,
  endDeg: 56,
});

const EDGE_PATHS: readonly string[] = SPECIALIST_NODES.map((node) =>
  quadraticEdgePath({ from: CAPTAIN, to: node }),
);

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
  const activeNode = SPECIALIST_NODES[state.index];
  const activePath = EDGE_PATHS[state.index];
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
      aria-label="Animated diagram showing the Captain agent dispatching to Scout, Engineer, Tester, and Reviewer specialists in sequence."
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
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

        <g>
          {EDGE_PATHS.map((d, i) => (
            <path
              key={`base-${SPECIALISTS[i].id}`}
              d={d}
              fill="none"
              stroke="#262626"
              strokeWidth={1.5}
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
                  r={28}
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
                r={28}
                fill="#0a0a0a"
                stroke={agent.color}
                strokeOpacity={wasVisited ? 0.85 : 0.4}
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                y={4}
                fontFamily="var(--font-mono)"
                fontSize={11}
                fontWeight={600}
                fill={wasVisited ? '#e5e5e5' : '#a3a3a3'}
              >
                {agent.label.toLowerCase()}
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

        {/* Static fallback labels (visible when reduce-motion + always for accessibility) */}
        {reduced && (
          <g>
            <text
              x={CAPTAIN.x}
              y={VIEW_H - 12}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={10}
              fill="#a3a3a3"
            >
              captain → scout · engineer · tester · reviewer
            </text>
          </g>
        )}

        {/* Reference active node — keeps the variable used in production builds */}
        {!reduced && activeNode && (
          <circle cx={activeNode.x} cy={activeNode.y} r={0} fill="transparent" />
        )}
      </svg>

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
          {reduced ? 'Five agents. One pull request.' : activeSpecialist.status}
        </span>
      </div>
    </div>
  );
}
