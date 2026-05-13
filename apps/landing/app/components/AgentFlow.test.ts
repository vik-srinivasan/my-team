import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SPECIALISTS, CORE_SPECIALISTS, OPTIONAL_SPECIALISTS } from '../agents';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowPath = join(__dirname, 'AgentFlow.tsx');
const flowContent = readFileSync(flowPath, 'utf-8');

// Helper: extract the numeric value from `const NAME = <number>;` in the source.
function extractConst(name: string): number {
  const m = flowContent.match(new RegExp(`const\\s+${name}\\s*=\\s*(-?[\\d.]+)`));
  if (!m) throw new Error(`could not find numeric const ${name} in AgentFlow.tsx`);
  return Number(m[1]);
}

describe('AgentFlow two-orbit layout', () => {
  it('uses exactly 9 specialists (4 core + 5 optional) to populate SPECIALIST_NODES', () => {
    // SPECIALISTS from agents.ts is the source of truth — verify AgentFlow
    // pulls from it and the total is 9.
    expect(SPECIALISTS).toHaveLength(9);
    expect(CORE_SPECIALISTS).toHaveLength(4);
    expect(OPTIONAL_SPECIALISTS).toHaveLength(5);
    // AgentFlow maps over SPECIALISTS to build SPECIALIST_NODES — confirm the
    // import is present in the source.
    expect(flowContent).toContain(
      "import { CORE_SPECIALISTS, OPTIONAL_SPECIALISTS, SPECIALISTS } from '../agents'",
    );
  });

  it('defines two distinct orbit radii (inner core < outer optional)', () => {
    const coreRadius = extractConst('CORE_RADIUS');
    const optionalRadius = extractConst('OPTIONAL_RADIUS');
    expect(coreRadius).toBe(140);
    expect(optionalRadius).toBe(225);
    expect(coreRadius).toBeLessThan(optionalRadius);
  });

  it('uses a larger node radius for core agents than for optional agents', () => {
    const coreR = extractConst('CORE_NODE_R');
    const optionalR = extractConst('OPTIONAL_NODE_R');
    expect(coreR).toBe(28);
    expect(optionalR).toBe(20);
    expect(coreR).toBeGreaterThan(optionalR);
  });

  it('centres the captain at half the viewBox dimensions', () => {
    const viewW = extractConst('VIEW_W');
    const viewH = extractConst('VIEW_H');
    expect(viewW).toBe(760);
    expect(viewH).toBe(520);
    // Captain must be at (VIEW_W / 2, VIEW_H / 2) — the source expresses this
    // as a formula, so look for VIEW_W / 2 in the CAPTAIN definition.
    expect(flowContent).toContain('VIEW_W / 2');
    expect(flowContent).toContain('VIEW_H / 2');
  });

  it('applies strokeDasharray only to optional specialist circles, not core ones', () => {
    // The JSX in AgentFlow renders <circle strokeDasharray={node.isCore ? undefined : '4 3'}>
    // for each specialist. This is the key visual cue that separates the two orbits.
    expect(flowContent).toContain("strokeDasharray={node.isCore ? undefined : '4 3'}");
    // Core nodes must NOT get a dashed stroke — the only dashed-stroke
    // expression for specialist circles conditions on !isCore.
    expect(flowContent).not.toContain("strokeDasharray={node.isCore ? '4 3' : undefined}");
  });

  it('applies reduced opacity to optional specialist circles', () => {
    // Optional nodes use lower strokeOpacity values: visited=0.7, unvisited=0.3
    // vs core visited=0.85, unvisited=0.4. The branching is on node.isCore.
    expect(flowContent).toContain('node.isCore');
    expect(flowContent).toContain('0.85');
    expect(flowContent).toContain('0.7');
    // Unvisited opacities are also lower for optional.
    expect(flowContent).toContain('0.4');
    expect(flowContent).toContain('0.3');
  });

  it('uses a smaller font size for optional node labels than core node labels', () => {
    // Core nodes: fontSize: 11, optional nodes: fontSize: 10. This reinforces
    // the visual weight difference at the label level.
    expect(flowContent).toContain('fontSize: 11');
    expect(flowContent).toContain('fontSize: 10');
  });

  it('renders the outer orbit guide with a dashed stroke pattern', () => {
    // The faint orbit ring for optional specialists uses strokeDasharray="3 4"
    // so it reads as secondary even when no nodes are active.
    expect(flowContent).toContain('strokeDasharray="3 4"');
  });

  it('includes the reduced-motion fallback text naming both core and optional agents', () => {
    // When reduced motion is on, a static text caption replaces the animation.
    // It must enumerate both groups so reduced-motion users get the full model.
    expect(flowContent).toContain('4 core agents');
    expect(flowContent).toContain('5 optional ones');
    expect(flowContent).toContain('scout, engineer, tester, reviewer');
    expect(flowContent).toContain('debugger, designer, runner, auditor, documenter');
  });

  it('has the aria-label describing the two-orbit layout', () => {
    // Accessibility: the role="img" wrapper must describe what a sighted user
    // sees — captain at centre, inner ring of 4 core, outer ring of 5 optional.
    expect(flowContent).toContain('role="img"');
    expect(flowContent).toContain('inner orbit');
    expect(flowContent).toContain('outer orbit');
    expect(flowContent).toContain('Four core specialists');
    expect(flowContent).toContain('Five optional specialists');
  });
});
