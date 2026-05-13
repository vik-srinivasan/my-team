// Pure state machine + geometry for AgentFlow. Lives outside the .tsx file so
// it can be unit-tested without a DOM.

export interface FlowState {
  readonly index: number;
  readonly leg: 'dispatch' | 'arrive' | 'return';
}

export type FlowAction = { readonly type: 'advance' };

export const INITIAL_FLOW_STATE: FlowState = { index: 0, leg: 'dispatch' };

export function flowReducer(
  state: FlowState,
  action: FlowAction,
  specialistCount: number,
): FlowState {
  if (action.type !== 'advance') return state;
  if (state.leg === 'dispatch') return { ...state, leg: 'arrive' };
  if (state.leg === 'arrive') return { ...state, leg: 'return' };
  // return → next specialist's dispatch (loop)
  const nextIndex = (state.index + 1) % specialistCount;
  return { index: nextIndex, leg: 'dispatch' };
}

export interface NodePoint {
  readonly x: number;
  readonly y: number;
}

export interface ArcConfig {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly startDeg: number;
  readonly endDeg: number;
}

export function arcPoints(count: number, arc: ArcConfig): readonly NodePoint[] {
  if (count <= 0) return [];
  const points: NodePoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const deg = arc.startDeg + (arc.endDeg - arc.startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    points.push({
      x: arc.centerX + arc.radius * Math.cos(rad),
      y: arc.centerY + arc.radius * Math.sin(rad),
    });
  }
  return points;
}

export interface EdgePathInput {
  readonly from: NodePoint;
  readonly to: NodePoint;
  readonly curl?: number;
}

export function quadraticEdgePath({ from, to, curl = 24 }: EdgePathInput): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = midX + nx * curl;
  const cy = midY + ny * curl;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}
