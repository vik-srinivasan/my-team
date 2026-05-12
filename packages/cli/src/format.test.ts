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
  it('phase=awaiting_approval -> approve', () => {
    const a = getAttention({ phase: 'awaiting_approval', must_ask_count: 0 });
    expect(a.critical).toBe(true);
    expect(a.label).toBe('approve');
    expect(a.glyph).toBe(ATTN_GLYPHS.needsInput);
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

  it('awaiting_approval wins over must_ask_count', () => {
    expect(
      getAttention({ phase: 'awaiting_approval', must_ask_count: 5 }).label,
    ).toBe('approve');
  });

  it('blocked wins over must_ask_count', () => {
    expect(
      getAttention({ phase: 'blocked', must_ask_count: 5 }).label,
    ).toBe('blocked');
  });
});
