import { describe, it, expect } from 'vitest';
import {
  arcPoints,
  flowReducer,
  INITIAL_FLOW_STATE,
  quadraticEdgePath,
} from './agent-flow-state';

describe('flowReducer', () => {
  it('advances dispatch → arrive', () => {
    const next = flowReducer(INITIAL_FLOW_STATE, { type: 'advance' }, 5);
    expect(next).toEqual({ index: 0, leg: 'arrive' });
  });

  it('advances arrive → return', () => {
    const next = flowReducer({ index: 2, leg: 'arrive' }, { type: 'advance' }, 5);
    expect(next).toEqual({ index: 2, leg: 'return' });
  });

  it('advances return → next dispatch and increments index', () => {
    const next = flowReducer({ index: 2, leg: 'return' }, { type: 'advance' }, 5);
    expect(next).toEqual({ index: 3, leg: 'dispatch' });
  });

  it('wraps the index back to 0 when returning from the last specialist', () => {
    const next = flowReducer({ index: 4, leg: 'return' }, { type: 'advance' }, 5);
    expect(next).toEqual({ index: 0, leg: 'dispatch' });
  });

  it('completes a full loop in count * 3 advances', () => {
    const count = 5;
    let state = INITIAL_FLOW_STATE;
    for (let i = 0; i < count * 3; i++) {
      state = flowReducer(state, { type: 'advance' }, count);
    }
    expect(state).toEqual(INITIAL_FLOW_STATE);
  });
});

describe('arcPoints', () => {
  it('returns an empty array for zero count', () => {
    expect(arcPoints(0)).toEqual([]);
  });

  it('places a single point at the midpoint angle', () => {
    const [point] = arcPoints(1, {
      centerX: 0,
      centerY: 0,
      radius: 100,
      startDeg: 0,
      endDeg: 90,
    });
    // Midpoint of 0..90 is 45deg → (cos45, sin45) ≈ (70.71, 70.71)
    expect(point.x).toBeCloseTo(70.71, 1);
    expect(point.y).toBeCloseTo(70.71, 1);
  });

  it('distributes N points evenly across the arc', () => {
    const points = arcPoints(5, {
      centerX: 0,
      centerY: 0,
      radius: 100,
      startDeg: -90,
      endDeg: 90,
    });
    expect(points).toHaveLength(5);
    // First point at -90deg → (0, -100)
    expect(points[0].x).toBeCloseTo(0, 1);
    expect(points[0].y).toBeCloseTo(-100, 1);
    // Middle point at 0deg → (100, 0)
    expect(points[2].x).toBeCloseTo(100, 1);
    expect(points[2].y).toBeCloseTo(0, 1);
    // Last point at 90deg → (0, 100)
    expect(points[4].x).toBeCloseTo(0, 1);
    expect(points[4].y).toBeCloseTo(100, 1);
  });
});

describe('quadraticEdgePath', () => {
  it('produces a quadratic bezier between two points', () => {
    const d = quadraticEdgePath({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, curl: 0 });
    expect(d).toMatch(/^M 0 0 Q .* 100 0$/);
  });

  it('curls the control point perpendicular to the segment', () => {
    const d = quadraticEdgePath({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, curl: 20 });
    // Perpendicular to a horizontal segment is vertical. Control point should
    // be at (50, ±20).
    const match = /Q\s+([-\d.]+)\s+([-\d.]+)\s+/.exec(d);
    expect(match).not.toBeNull();
    if (!match) return;
    const cx = Number(match[1]);
    const cy = Number(match[2]);
    expect(cx).toBeCloseTo(50, 1);
    expect(Math.abs(cy)).toBeCloseTo(20, 1);
  });
});
