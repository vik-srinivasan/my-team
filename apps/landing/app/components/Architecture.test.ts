import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const archPath = join(__dirname, 'Architecture.tsx');
const archContent = readFileSync(archPath, 'utf-8');

// Helper: pull the numeric value out of a `const NAME = <number>;` line.
function constNumber(name: string): number {
  const m = archContent.match(new RegExp(`${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (!m) throw new Error(`could not find numeric const ${name}`);
  return Number(m[1]);
}

describe('Architecture component', () => {
  it('places infra strip above Captain above the agent fan-out', () => {
    const infraY = constNumber('INFRA_ROW_Y');
    const captainY = constNumber('CAPTAIN_Y');
    const agentY = constNumber('AGENT_ROW_Y');

    // Reading order: infra (top) → captain → agents (bottom)
    expect(infraY).toBeLessThan(captainY);
    expect(captainY).toBeLessThan(agentY);
  });

  it('renders Captain centred horizontally as the visual anchor', () => {
    // Captain is still defined as a centred 260-wide box at x:360
    expect(archContent).toContain('x: 360');
    expect(archContent).toContain('w: 260');
  });

  it('renders the four always-on sub-agents with their produces labels', () => {
    expect(archContent).toContain('scout');
    expect(archContent).toContain('context.md');
    expect(archContent).toContain('engineer');
    expect(archContent).toContain('commits');
    expect(archContent).toContain('tester');
    expect(archContent).toContain('test runs');
    expect(archContent).toContain('reviewer');
    expect(archContent).toContain('review.md');
  });

  it('renders the five conditional sub-agents flagged via the conditional field', () => {
    // Each new specialist appears in the SUB_AGENTS array and gets a
    // conditional: true flag so the rendered box can use a dashed stroke.
    expect(archContent).toContain('debugger');
    expect(archContent).toContain('designer');
    expect(archContent).toContain('runner');
    expect(archContent).toContain('auditor');
    expect(archContent).toContain('documenter');
    // The conditional flag drives the dashed stroke + 'conditional' label.
    expect(archContent).toContain('conditional: true');
    expect(archContent).toContain('agent.conditional');
  });

  it('renders the three infra nodes (CLI → wrapper → sessions) and not Web UI', () => {
    expect(archContent).toContain('team CLI');
    expect(archContent).toContain('Wrapper daemon');
    expect(archContent).toContain('~/team/sessions/<id>/');
    // Web UI was removed in round 4.
    expect(archContent).not.toContain('Web UI');
  });

  it('renders bidirectional dispatch arrows showing Captain ↔ agent communication', () => {
    // Round 5: a single bidirectional accent-blue curve per agent (arrowheads
    // at both ends) replaces the round-4 separate dispatch + return curves.
    expect(archContent).toContain('Dispatch curves');
    expect(archContent).toContain('Task tool');
    // Each dispatch path must carry both marker-start and marker-end so it
    // reads as Captain ↔ agent. React lower-cases marker attributes as
    // markerStart / markerEnd in JSX. The single `arrow-accent` marker uses
    // orient="auto-start-reverse" so it auto-flips when used as marker-start.
    expect(archContent).toContain('markerStart="url(#arrow-accent)"');
    expect(archContent).toContain('markerEnd="url(#arrow-accent)"');
    // The legacy mirrored marker is gone — `arrow-accent` is the sole accent
    // arrowhead marker.
    expect(archContent).not.toContain('arrow-accent-start');
    // The round-4 per-agent return curves and "→ artifacts" label are gone.
    expect(archContent).not.toContain('Per-agent return curves');
    expect(archContent).not.toContain('return-${agent.id}');
    expect(archContent).not.toContain('→ artifacts');
  });

  it('renders engineer with stack visual (×N parallel)', () => {
    expect(archContent).toContain('STACK_COUNT');
    expect(archContent).toContain('agent.stack');
    expect(archContent).toContain('×N parallel');
  });

  it('keeps the infra lane label above its divider', () => {
    expect(archContent).toContain('INFRA · HOW THE CAPTAIN GETS BOOTED');
    // Round 4: infra boxes share Captain's accent-blue stroke (#0e7490).
    expect(archContent).toContain('stroke="#0e7490"');
  });

  it('renders a downward spawn arrow from infra to Captain', () => {
    // Spawn label still present, and the arrow points down (wrapperBottom → captainTop).
    expect(archContent).toContain('spawn');
    expect(archContent).toContain('wrapperBottom');
    expect(archContent).toContain('captainTop');
  });

  it('aligns all "→ produces" labels at a single y baseline', () => {
    // Single shared constant means every produces label sits on the same line.
    expect(archContent).toContain('PRODUCES_LABEL_Y');
    // Every produces label should reference the shared constant (and not a
    // per-agent calculation), so all labels share one y baseline.
    expect(archContent).toContain('y={PRODUCES_LABEL_Y}');
  });

  it('has proper SVG accessibility attributes reflecting the new reading order', () => {
    expect(archContent).toContain('role="img"');
    expect(archContent).toContain('aria-label');
    // aria-label should describe the new top-to-bottom order: infra → captain → agents
    expect(archContent).toMatch(/infra strip[\s\S]*Captain[\s\S]*sub-agents/);
    // Round 5: aria-label calls out the bidirectional arrow per agent.
    expect(archContent).toContain('bidirectional');
  });
});
