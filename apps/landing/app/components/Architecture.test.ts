import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Architecture component', () => {
  it('renders Captain at the centre with sub-agents fanning out', () => {
    const archPath = join(__dirname, 'Architecture.tsx');
    const archContent = readFileSync(archPath, 'utf-8');

    // Verify Captain is positioned at centre (x:360, y:90)
    expect(archContent).toContain('x: 360');
    expect(archContent).toContain('y: 90');

    // Verify all sub-agents are present with their produces labels
    expect(archContent).toContain('scout');
    expect(archContent).toContain('context.md');
    expect(archContent).toContain('engineer');
    expect(archContent).toContain('commits');
    expect(archContent).toContain('tester');
    expect(archContent).toContain('test runs');
    expect(archContent).toContain('reviewer');
    expect(archContent).toContain('review.md');
    expect(archContent).toContain('git');
    expect(archContent).toContain('pushes');
    expect(archContent).toContain('opens PR');

    // Verify agent row is at y:290
    expect(archContent).toContain('AGENT_ROW_Y = 290');

    // Verify infra elements are demoted at y:530
    expect(archContent).toContain('INFRA_ROW_Y = 530');
    expect(archContent).toContain('team CLI');
    expect(archContent).toContain('Web UI');
    expect(archContent).toContain('Wrapper daemon');
  });

  it('renders dispatch and result paths showing agent communication', () => {
    const archPath = join(__dirname, 'Architecture.tsx');
    const archContent = readFileSync(archPath, 'utf-8');

    // Verify dispatch and result paths
    expect(archContent).toContain('Dispatch: Captain bottom-centre');
    expect(archContent).toContain('Result: agent top-right');
    expect(archContent).toContain('Task tool');
  });

  it('renders engineer with stack visual (×N parallel)', () => {
    const archPath = join(__dirname, 'Architecture.tsx');
    const archContent = readFileSync(archPath, 'utf-8');

    // Verify engineer stack rendering
    expect(archContent).toContain('STACK_COUNT');
    expect(archContent).toContain('agent.stack');
    expect(archContent).toContain('×N parallel');
  });

  it('renders infra lane as secondary with dim styling', () => {
    const archPath = join(__dirname, 'Architecture.tsx');
    const archContent = readFileSync(archPath, 'utf-8');

    // Verify infra lane label and dim styling
    expect(archContent).toContain('INFRA · HOW THE CAPTAIN GETS BOOTED');
    expect(archContent).toContain('stroke="#262626"'); // dim colour for infra
  });

  it('has proper SVG accessibility attributes', () => {
    const archPath = join(__dirname, 'Architecture.tsx');
    const archContent = readFileSync(archPath, 'utf-8');

    // Verify SVG has accessibility attributes
    expect(archContent).toContain('role="img"');
    expect(archContent).toContain('aria-label');
    expect(archContent).toContain('Architecture diagram');
  });
});
