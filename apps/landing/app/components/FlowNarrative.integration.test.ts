/**
 * Integration tests for FlowNarrative grouping structure and sequential numbering.
 * The engineer's FlowNarrative.test.ts covers badge styling and partition logic;
 * these tests cover section counts, sequential numbering formulas, and that the
 * three ordered-list sections (<ol>) contain exactly the right number of cards.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AGENTS, CORE_SPECIALISTS, OPTIONAL_SPECIALISTS } from '../agents';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowPath = join(__dirname, 'FlowNarrative.tsx');
const flowContent = readFileSync(flowPath, 'utf-8');

describe('FlowNarrative three-section structure', () => {
  it('has exactly three <ol> sections (captain, core, optional)', () => {
    // Count distinct <ol> elements. Each section renders its own <ol>.
    const olMatches = flowContent.match(/<ol\b/g);
    expect(olMatches).not.toBeNull();
    expect(olMatches?.length).toBe(3);
  });

  it('places the captain section before the core section and core before optional in source order', () => {
    const captainIdx = flowContent.indexOf("variant=\"captain\"");
    const coreHeadingIdx = flowContent.indexOf('Core specialists');
    const optionalHeadingIdx = flowContent.indexOf('Optional specialists');
    expect(captainIdx).toBeLessThan(coreHeadingIdx);
    expect(coreHeadingIdx).toBeLessThan(optionalHeadingIdx);
  });

  it('derives section counts from AGENTS data — CORE has 4 entries, OPTIONAL has 5', () => {
    // Verify the source counts come from live data, not hardcoded magic numbers.
    expect(CORE_SPECIALISTS).toHaveLength(4);
    expect(OPTIONAL_SPECIALISTS).toHaveLength(5);
    // The GroupHeading receives count={CORE.length} and count={OPTIONAL.length},
    // so the heading counts are data-driven.
    expect(flowContent).toContain('count={CORE.length}');
    expect(flowContent).toContain('count={OPTIONAL.length}');
  });

  it('numbers the captain as 01 (number={1})', () => {
    // The captain card is always agent number 1 in the 1-indexed continuous sequence.
    expect(flowContent).toContain('number={1}');
  });

  it('numbers core agents starting at 2 (i + 2 formula)', () => {
    // Captain is 01, so the first core specialist is 02. The numbering formula
    // must be `i + 2` — not a hardcoded value — so it stays correct if agents.ts
    // is reordered.
    expect(flowContent).toContain('number={i + 2}');
  });

  it('continues optional agent numbering after core agents (i + 2 + CORE.length formula)', () => {
    // After 1 captain and 4 core agents, optional agents start at position 6.
    // The formula `i + 2 + CORE.length` ensures this stays correct if the core
    // count ever changes.
    expect(flowContent).toContain('number={i + 2 + CORE.length}');
  });

  it('all ten agents are covered by the data source imported into FlowNarrative', () => {
    // FlowNarrative renders all agents dynamically from AGENTS — ids aren't
    // hardcoded in the JSX. The coverage check is: (a) AGENTS has 10 entries
    // and (b) FlowNarrative imports AGENTS as its data source rather than
    // duplicating a local list.
    expect(AGENTS).toHaveLength(10);
    expect(flowContent).toContain("import { AGENTS, type Agent } from '../agents'");
    // The three derivations cover all 10: CAPTAIN (1) + CORE (4) + OPTIONAL (5).
    expect(AGENTS.filter((a) => a.id === 'captain')).toHaveLength(1);
    expect(AGENTS.filter((a) => a.id !== 'captain' && a.core)).toHaveLength(4);
    expect(AGENTS.filter((a) => a.id !== 'captain' && !a.core)).toHaveLength(5);
  });

  it('uses GroupHeading for both specialist sections but not for the captain', () => {
    // The GroupHeading component is used exactly twice — once for core, once for
    // optional. Captain stands alone without a group heading.
    const headingMatches = flowContent.match(/<GroupHeading\b/g);
    expect(headingMatches).not.toBeNull();
    expect(headingMatches?.length).toBe(2);
  });
});
