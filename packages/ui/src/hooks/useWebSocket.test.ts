import { describe, it, expect } from 'vitest';

import {
  stripAnsi,
  cleanCaptainOutput,
  isMeaningfulText,
} from './useWebSocket.js';

/**
 * The full pipeline matches what the WS handler runs:
 *   raw PTY chunk -> stripAnsi -> cleanCaptainOutput -> isMeaningfulText
 * Any noisy fixture should end up as empty text, or be rejected by
 * isMeaningfulText. Any meaningful fixture should survive both stages.
 */
function pipeline(raw: string): string {
  return cleanCaptainOutput(stripAnsi(raw));
}

describe('stripAnsi', () => {
  it('removes SGR color codes', () => {
    expect(stripAnsi('\x1b[31mhello\x1b[0m')).toBe('hello');
  });

  it('removes OSC window title sequences', () => {
    expect(stripAnsi('\x1b]0;the title\x07hello')).toBe('hello');
  });

  it('drops carriage returns used for spinner overwrites', () => {
    expect(stripAnsi('working\rdone\n')).toBe('workingdone');
  });
});

describe('cleanCaptainOutput drops PTY noise', () => {
  it.each([
    '>>bypasspermissionson',
    '>> bypass permissions on',
    '   bypass permissions on  (shift+tab to cycle)',
    'shift+tab to cycle',
    'esc to interrupt',
    'esctointerrupt',
    'RemoteControlactive',
    'Remote Control active',
    'Contemplating...',
    'Conplating...',
    'Complating',
    'thinking with xhigh effort',
    'thinking with high effort',
    'thought for 12s',
    '↓ 1,234 tokens',
    '↓ 12k tokens',
    '12345 tokens',
    '(ctrl+o to expand)',
    '   (ctrl+o   to   expand)',
    '└ tool call frame leftover',
    '┃ sidebar frame leftover',
    '│ vertical bar leftover',
    '[38;5;7m residual color',
    '[0m  ',
  ])('drops noisy line: %j', (line) => {
    expect(pipeline(line)).toBe('');
  });

  it('drops embedded ESC[ fragments even mid-line', () => {
    expect(cleanCaptainOutput('keep me\n\x1b[31mthrow this away')).toBe(
      'keep me',
    );
  });

  it('collapses noise mixed with real content', () => {
    const input = [
      '# Heading',
      '↓ 1,234 tokens',
      'Contemplating...',
      'Real paragraph that should survive.',
      '└ tool frame leftover',
      '(ctrl+o to expand)',
      'Another sentence with content.',
    ].join('\n');

    const out = pipeline(input);
    expect(out).toContain('# Heading');
    expect(out).toContain('Real paragraph that should survive.');
    expect(out).toContain('Another sentence with content.');
    expect(out).not.toMatch(/tokens/);
    expect(out).not.toMatch(/Contemplating/i);
    expect(out).not.toMatch(/ctrl\+o/);
    expect(out).not.toMatch(/^└/m);
  });
});

describe('cleanCaptainOutput preserves real content', () => {
  it.each([
    '# Heading One',
    '## A sub-heading',
    '```ts',
    '```',
    'A normal sentence about the implementation plan.',
    '- list bullet with words',
    'See [link text](https://example.com) for details.',
    'The wrapper spawns claude via node-pty.',
  ])('keeps meaningful line: %j', (line) => {
    expect(pipeline(line)).toBe(line);
  });

  it('keeps markdown headers untouched', () => {
    const md = '# Plan\n\nFirst we will scout the repo, then we plan.';
    expect(pipeline(md)).toBe(md);
  });
});

describe('isMeaningfulText', () => {
  it('accepts markdown headers even if short', () => {
    expect(isMeaningfulText('# Hi')).toBe(true);
    expect(isMeaningfulText('### Section')).toBe(true);
  });

  it('accepts code fences', () => {
    expect(isMeaningfulText('```')).toBe(true);
    expect(isMeaningfulText('```typescript')).toBe(true);
  });

  it('rejects empty/whitespace and tiny fragments', () => {
    expect(isMeaningfulText('')).toBe(false);
    expect(isMeaningfulText('   ')).toBe(false);
    expect(isMeaningfulText('ab')).toBe(false);
    expect(isMeaningfulText('--')).toBe(false);
  });

  it('accepts ordinary sentences', () => {
    expect(isMeaningfulText('Plan approved, dispatching engineer.')).toBe(true);
  });
});
