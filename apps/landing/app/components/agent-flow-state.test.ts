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
    expect(
      arcPoints(0, { centerX: 0, centerY: 0, radius: 100, startDeg: 0, endDeg: 90 }),
    ).toEqual([]);
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

  it('places 4 cardinal points around a full circle (AgentFlow inner orbit geometry)', () => {
    // Inner orbit in AgentFlow uses startDeg: -90, endDeg: 180, count: 4 →
    // top, right, bottom, left. arcPoints includes both endpoints, so the
    // 270° span gives 90° between each adjacent pair.
    const points = arcPoints(4, {
      centerX: 100,
      centerY: 100,
      radius: 50,
      startDeg: -90,
      endDeg: 180,
    });
    expect(points).toHaveLength(4);
    // Top: (100, 50)
    expect(points[0].x).toBeCloseTo(100, 1);
    expect(points[0].y).toBeCloseTo(50, 1);
    // Right: (150, 100)
    expect(points[1].x).toBeCloseTo(150, 1);
    expect(points[1].y).toBeCloseTo(100, 1);
    // Bottom: (100, 150)
    expect(points[2].x).toBeCloseTo(100, 1);
    expect(points[2].y).toBeCloseTo(150, 1);
    // Left: (50, 100)
    expect(points[3].x).toBeCloseTo(50, 1);
    expect(points[3].y).toBeCloseTo(100, 1);
  });

  it('places 5 evenly-spaced points around a full circle (AgentFlow outer orbit geometry)', () => {
    // Outer orbit uses startDeg: -54, endDeg: 234, count: 5 — 72° between
    // each pair, offset 36° from the inner orbit so the rings interleave.
    const points = arcPoints(5, {
      centerX: 0,
      centerY: 0,
      radius: 100,
      startDeg: -54,
      endDeg: 234,
    });
    expect(points).toHaveLength(5);
    // Each adjacent pair sits 72° apart on the circle.
    const angles = points.map((p) => (Math.atan2(p.y, p.x) * 180) / Math.PI);
    for (let i = 1; i < angles.length; i++) {
      // Normalize to a positive 0..360 difference.
      let diff = angles[i] - angles[i - 1];
      while (diff < 0) diff += 360;
      while (diff > 360) diff -= 360;
      expect(diff).toBeCloseTo(72, 1);
    }
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
