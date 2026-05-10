import { describe, it, expect } from 'vitest';

import { phaseFriendlyLabel, phaseLabel, phaseDot } from './phase.js';

describe('phaseFriendlyLabel', () => {
  it('maps every canonical phase to its friendly sentence', () => {
    expect(phaseFriendlyLabel('created')).toBe('Just created');
    expect(phaseFriendlyLabel('scouting')).toBe('Scout is exploring');
    expect(phaseFriendlyLabel('planning')).toBe('Drafting plan');
    expect(phaseFriendlyLabel('awaiting_approval')).toBe(
      'Waiting for your approval',
    );
    expect(phaseFriendlyLabel('reviewing')).toBe('Reviewing code');
    expect(phaseFriendlyLabel('done')).toBe('Done');
    expect(phaseFriendlyLabel('blocked')).toBe('Blocked — needs you');
    expect(phaseFriendlyLabel('killed')).toBe('Killed');
    expect(phaseFriendlyLabel('cleaned')).toBe('Cleaned');
  });

  it('defaults executing to "Engineer is working" when no specialist is known', () => {
    expect(phaseFriendlyLabel('executing')).toBe('Engineer is working');
    expect(phaseFriendlyLabel('executing', null)).toBe('Engineer is working');
    expect(phaseFriendlyLabel('executing', '')).toBe('Engineer is working');
  });

  it('uses the active specialist (capitalized) when executing', () => {
    expect(phaseFriendlyLabel('executing', 'scout')).toBe('Scout is working');
    expect(phaseFriendlyLabel('executing', 'tester')).toBe('Tester is working');
    expect(phaseFriendlyLabel('executing', 'reviewer')).toBe(
      'Reviewer is working',
    );
  });

  it('falls back to phaseLabel for unknown or missing phases', () => {
    expect(phaseFriendlyLabel(undefined)).toBe('');
    expect(phaseFriendlyLabel(null)).toBe('');
    // Unknown phase strings round-trip through phaseLabel's raw fallback.
    expect(phaseFriendlyLabel('mystery')).toBe(phaseLabel('mystery'));
  });

  it('does not regress existing phaseDot lookups', () => {
    // Sanity: friendly-label additions left the dot table untouched.
    expect(phaseDot('done')).toContain('green');
    expect(phaseDot('blocked')).toContain('red');
  });
});
