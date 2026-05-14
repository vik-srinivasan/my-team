import { describe, it, expect } from 'vitest';
import chalk from 'chalk';
import {
  stripAnsi,
  visibleLength,
  padEndVisible,
  truncate,
  humanizeAgo,
  abbreviatePhase,
  phaseColor,
  getAttention,
  effectivePhase,
  ATTN_GLYPHS,
} from './format.js';

describe('stripAnsi / visibleLength', () => {
  it('removes ANSI color codes', () => {
    const coloured = chalk.red('hello');
    expect(stripAnsi(coloured)).toBe('hello');
  });

  it('measures visible length of coloured strings', () => {
    expect(visibleLength(chalk.bold.cyan('hi'))).toBe(2);
  });

  it('leaves plain strings untouched', () => {
    expect(stripAnsi('plain')).toBe('plain');
    expect(visibleLength('plain')).toBe(5);
  });

  it('returns visible width unaffected by chalk.bold (regression: status heading separator)', () => {
    // status.ts uses visibleLength(heading) to size the `─` underline.
    // chalk.bold adds ~9 bytes of ANSI escapes to .length without changing
    // the visible width; if visibleLength regressed to .length the bar
    // would render ~9 cols too wide.
    const heading = `${chalk.bold('mild-moon-80')} · review iter 1`;
    expect(visibleLength(heading)).toBe('mild-moon-80 · review iter 1'.length);
    // Sanity: with chalk enabled, .length is strictly larger.
    if (chalk.level > 0) {
      expect(heading.length).toBeGreaterThan(visibleLength(heading));
    }
  });
});

describe('padEndVisible', () => {
  it('pads plain strings to width', () => {
    expect(padEndVisible('ab', 5)).toBe('ab   ');
  });

  it('pads coloured strings on visible length, not byte length', () => {
    const coloured = chalk.red('ab');
    const padded = padEndVisible(coloured, 5);
    // Visible width is 5 even though byte length is more.
    expect(visibleLength(padded)).toBe(5);
    // Original color sequence should still be present.
    expect(stripAnsi(padded)).toBe('ab   ');
  });

  it('returns original string when already at or over width', () => {
    expect(padEndVisible('abcde', 5)).toBe('abcde');
    expect(padEndVisible('abcdef', 5)).toBe('abcdef');
  });
});

describe('truncate', () => {
  it('returns input unchanged when shorter than limit', () => {
    expect(truncate('hi', 5)).toBe('hi');
  });

  it('truncates with ellipsis when longer', () => {
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
  });

  it('handles width 1 as just the ellipsis', () => {
    expect(truncate('hello', 1)).toBe('…');
  });

  it('returns empty string for width 0', () => {
    expect(truncate('hello', 0)).toBe('');
  });
});

describe('humanizeAgo', () => {
  it('formats minutes', () => {
    const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(humanizeAgo(iso)).toBe('5m');
  });

  it('formats hours', () => {
    const iso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(humanizeAgo(iso)).toBe('3h');
  });

  it('formats days', () => {
    const iso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(humanizeAgo(iso)).toBe('2d');
  });

  it('handles sub-minute ages', () => {
    const iso = new Date(Date.now() - 5_000).toISOString();
    expect(humanizeAgo(iso)).toBe('<1m');
  });

  it('handles bad input safely', () => {
    expect(humanizeAgo('not-a-date')).toBe('0m');
  });
});

describe('abbreviatePhase / phaseColor', () => {
  it('abbreviates the documented phases', () => {
    expect(abbreviatePhase('awaiting_approval')).toBe('approve');
    expect(abbreviatePhase('executing')).toBe('exec');
    expect(abbreviatePhase('reviewing')).toBe('review');
    expect(abbreviatePhase('scouting')).toBe('scout');
    expect(abbreviatePhase('planning')).toBe('plan');
    expect(abbreviatePhase('blocked')).toBe('block');
  });

  it('passes unknown / unchanged phases through', () => {
    expect(abbreviatePhase('done')).toBe('done');
    expect(abbreviatePhase('created')).toBe('created');
    expect(abbreviatePhase('killed')).toBe('killed');
    expect(abbreviatePhase('cleaned')).toBe('cleaned');
  });

  it('colours phases and embeds the abbreviated label', () => {
    expect(stripAnsi(phaseColor('executing'))).toBe('exec');
    expect(stripAnsi(phaseColor('done'))).toBe('done');
    expect(stripAnsi(phaseColor('blocked'))).toBe('block');
  });
});

describe('getAttention parity with UI attention.ts priority order', () => {
  it('phase=awaiting_approval with no must_ask -> idle (not critical)', () => {
    // awaiting_approval is no longer a forced AT-critical signal — must_ask
    // pending is the canonical demand-for-user-input.
    const a = getAttention({ phase: 'awaiting_approval', must_ask_count: 0 });
    expect(a.critical).toBe(false);
    expect(a.glyph).toBe(ATTN_GLYPHS.idle);
    expect(a.label).toBe('');
  });

  it('phase=blocked -> blocked (with warning glyph)', () => {
    const a = getAttention({ phase: 'blocked', must_ask_count: 0 });
    expect(a.critical).toBe(true);
    expect(a.label).toBe('blocked');
    expect(a.glyph).toBe(ATTN_GLYPHS.blocked);
  });

  it('must_ask_count > 0 -> ask (N)', () => {
    expect(getAttention({ phase: 'executing', must_ask_count: 1 }).label).toBe('ask');
    expect(getAttention({ phase: 'executing', must_ask_count: 3 }).label).toBe('ask (3)');
  });

  it('phase=done -> done (✓, not critical)', () => {
    const a = getAttention({ phase: 'done', must_ask_count: 0 });
    expect(a.critical).toBe(false);
    expect(a.done).toBe(true);
    expect(a.glyph).toBe(ATTN_GLYPHS.done);
  });

  it('idle / running -> blank glyph and no label', () => {
    const a = getAttention({ phase: 'executing', must_ask_count: 0 });
    expect(a.critical).toBe(false);
    expect(a.glyph).toBe(ATTN_GLYPHS.idle);
    expect(a.label).toBe('');
  });

  it('awaiting_approval with must_ask_count falls through to must_ask label', () => {
    // awaiting_approval no longer pre-empts must_ask — the user-facing label
    // matches the actual ask-pending count.
    expect(
      getAttention({ phase: 'awaiting_approval', must_ask_count: 5 }).label,
    ).toBe('ask (5)');
  });

  it('blocked wins over must_ask_count', () => {
    expect(
      getAttention({ phase: 'blocked', must_ask_count: 5 }).label,
    ).toBe('blocked');
  });

  // Regression guard: must_ask_count > 0 must light the AT column in EVERY
  // non-terminal phase, not just the ones whose phase column already signals.
  // If someone refactors getAttention's phase precedence (e.g., adds an early
  // return for 'executing' or 'planning'), these cases catch it.
  describe('ask (N) regardless of phase', () => {
    for (const phase of ['created', 'planning', 'executing'] as const) {
      it(`phase=${phase} + must_ask_count=1 -> needsInput glyph + ask label`, () => {
        const a = getAttention({ phase, must_ask_count: 1 });
        expect(a.glyph).toBe(ATTN_GLYPHS.needsInput);
        expect(a.critical).toBe(true);
        expect(a.done).toBe(false);
        // Label starts with "ask" — exact format (`ask` vs `ask (1)`) is
        // covered by the earlier must_ask_count case; here we only defend
        // the cross-phase contract.
        expect(a.label.startsWith('ask')).toBe(true);
      });

      it(`phase=${phase} + must_ask_count=3 -> ask (3)`, () => {
        const a = getAttention({ phase, must_ask_count: 3 });
        expect(a.glyph).toBe(ATTN_GLYPHS.needsInput);
        expect(a.critical).toBe(true);
        expect(a.label).toBe('ask (3)');
      });
    }
  });

  it('awaiting_approval + must_ask_count=0 -> idle, no glyph (not critical)', () => {
    // The new contract: awaiting_approval is no longer a forced AT-critical
    // signal. Without must_ask_pending, this session is calm.
    const a = getAttention({ phase: 'awaiting_approval', must_ask_count: 0 });
    expect(a.critical).toBe(false);
    expect(a.glyph).toBe(ATTN_GLYPHS.idle);
    expect(a.label).toBe('');
    expect(a.done).toBe(false);
  });

  it('awaiting_approval + must_ask_count=1 -> critical, label ask', () => {
    // Genuine user-input demand even in awaiting_approval state.
    const a = getAttention({ phase: 'awaiting_approval', must_ask_count: 1 });
    expect(a.critical).toBe(true);
    expect(a.glyph).toBe(ATTN_GLYPHS.needsInput);
    expect(a.label).toBe('ask');
    expect(a.done).toBe(false);
  });
});

describe('effectivePhase', () => {
  it('active_specialist=engineer -> executing', () => {
    expect(effectivePhase({ phase: 'awaiting_approval', active_specialist: 'engineer' })).toBe('executing');
  });

  it('active_specialist=tester -> reviewing', () => {
    expect(effectivePhase({ phase: 'awaiting_approval', active_specialist: 'tester' })).toBe('reviewing');
  });

  it('active_specialist=reviewer -> reviewing', () => {
    expect(effectivePhase({ phase: 'awaiting_approval', active_specialist: 'reviewer' })).toBe('reviewing');
  });

  it('active_specialist=tester+reviewer -> reviewing', () => {
    expect(effectivePhase({ phase: 'awaiting_approval', active_specialist: 'tester+reviewer' })).toBe('reviewing');
  });

  it('active_specialist=scout -> scouting', () => {
    expect(effectivePhase({ phase: 'awaiting_approval', active_specialist: 'scout' })).toBe('scouting');
  });

  it('active_specialist=null -> awaiting_approval (pass-through)', () => {
    // No specialist running: return the raw phase as-is.
    expect(effectivePhase({ phase: 'awaiting_approval', active_specialist: null })).toBe('awaiting_approval');
  });

  it('phase=executing + active_specialist=null -> executing (pass-through)', () => {
    // Non-stale phase with no specialist: return raw phase.
    expect(effectivePhase({ phase: 'executing', active_specialist: null })).toBe('executing');
  });
});
