import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowPath = join(__dirname, 'FlowNarrative.tsx');
const flowContent = readFileSync(flowPath, 'utf-8');

describe('FlowNarrative component', () => {
  it('groups agents into captain, core specialists, and optional specialists', () => {
    expect(flowContent).toContain('Core specialists');
    expect(flowContent).toContain('Optional specialists');
    // Captain is rendered outside the two specialist groupings.
    expect(flowContent).toContain("AGENTS.find((a) => a.id === 'captain')");
  });

  it('partitions specialists by the shared core flag (no hardcoded id lists)', () => {
    // The split is driven by `agent.core`, not by hardcoded id arrays in
    // FlowNarrative. This keeps agents.ts as the single source of truth.
    expect(flowContent).toContain("a.id !== 'captain' && a.core");
    expect(flowContent).toContain("a.id !== 'captain' && !a.core");
  });

  it('renders a core/optional badge on each specialist card', () => {
    // The variant prop drives the badge styling — solid pill for core,
    // dashed-bordered pill for optional. Both variant values are passed
    // explicitly in the JSX, and the styling branches on `variant === 'core'`.
    expect(flowContent).toContain('variant="core"');
    expect(flowContent).toContain('variant="optional"');
    expect(flowContent).toContain("variant === 'core'");
    expect(flowContent).toContain('border-dashed');
  });

  it('keeps a one-line blurb under each group heading', () => {
    expect(flowContent).toContain('Dispatched on every session');
    expect(flowContent).toContain('Dispatched only when');
  });

  it('renders captain card without a core/optional badge', () => {
    // Captains are orchestrators, not specialists; the card uses the
    // 'captain' variant and the badge block is gated on `variant !== 'captain'`.
    expect(flowContent).toContain('variant="captain"');
    expect(flowContent).toContain("variant !== 'captain'");
  });
});
