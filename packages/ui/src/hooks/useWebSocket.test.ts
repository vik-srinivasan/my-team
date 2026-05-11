import { describe, it, expect } from 'vitest';

import {
  stripAnsi,
  cleanCaptainOutput,
  isMeaningfulText,
  joinChunks,
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

  it('simulates terminal CR-overwrite (only the last segment of a line survives)', () => {
    expect(stripAnsi('working\rdone\n')).toBe('done');
  });

  it('handles multi-segment CR overwrites within a single line', () => {
    // Three overwrites: "a", then "b", then "c" — the on-screen result
    // after all rewrites is just "c". A trailing line keeps its own content.
    expect(stripAnsi('a\rb\rc\nd')).toBe('c\nd');
  });

  it('overwrites a spinner status with the actual content', () => {
    // Real-world shape: a long "thinking…" status followed by an updated
    // status, then the real content line. Only "real content" should remain.
    const raw = 'thinking with xhigh effort\r30s thinking with xhigh effort\rreal content\n';
    expect(stripAnsi(raw)).toBe('real content');
  });

  it('keeps lines without CR intact', () => {
    expect(stripAnsi('alpha\nbeta\ngamma')).toBe('alpha\nbeta\ngamma');
  });

  it('preserves the last segment when CR appears at the start of a line', () => {
    expect(stripAnsi('\rhello')).toBe('hello');
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
    '↑ 1.4k tokens',
    '12345 tokens',
    '(ctrl+o to expand)',
    '   (ctrl+o   to   expand)',
    '└ tool call frame leftover',
    '┃ sidebar frame leftover',
    '│ vertical bar leftover',
    '[38;5;7m residual color',
    '[0m  ',
    // Claude Code spinner verbs (rotating vocabulary).
    'Billowing…',
    'Pondering…',
    'Cogitating...',
    'Ruminating',
    'Deliberating on the plan',
    'Simmering',
    'Osmosing',
    'Musing',
    'Mulling things over',
    // Status counters.
    '1 active',
    '3 active',
    '1 Cactive', // PTY corruption variant
    'thinking on 3',
    'thinking on 12',
    // Status footer "(Ns ↑ Nk tokens · thought for Ns)".
    '(24s ↑ 1.4k tokens · thought for 1s)',
    '(2s · 0 tokens)',
    // Unicode spinner glyph cluster lines.
    '✲ ✺ ✣',
    '✲   ✺   ↳',
    '◆ ►► ·· 12',
    '⏵ ⠋ ⠙',
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

  // Regression: the contemplating-spinner regex used to match "complete"
  // and related "compl*" words, silently dropping legitimate captain output.
  // See review pass 1 — these must always pass through the filter.
  it.each([
    'complete',
    'completed',
    'completing',
    'completes',
    'completion',
    'The implementation is complete.',
    'All tasks are now completed.',
    'We are completing the final task.',
    'This is a template literal in TypeScript.',
    'The feature is fully implemented.',
    'Use a compatible Node version.',
  ])('does NOT drop legitimate word: %j', (line) => {
    expect(pipeline(line)).toBe(line);
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

describe('joinChunks: streaming append-merge', () => {
  it('returns the new chunk verbatim when prev is empty', () => {
    expect(joinChunks('', 'hello')).toBe('hello');
  });

  it('appends after a trailing newline without adding extra separator', () => {
    expect(joinChunks('para one\n', 'para two')).toBe('para one\npara two');
  });

  it('appends after a trailing space without adding extra separator', () => {
    expect(joinChunks('the quick ', 'brown fox')).toBe('the quick brown fox');
  });

  it('inserts a single space when prev ends mid-word and next starts mid-word', () => {
    expect(joinChunks('the quick', 'brown fox')).toBe('the quick brown fox');
  });

  it('does not insert space before sentence-ending punctuation', () => {
    expect(joinChunks('the quick brown fox', '.')).toBe('the quick brown fox.');
    expect(joinChunks('hello', ', world')).toBe('hello, world');
  });

  it('forces a newline boundary before a markdown heading', () => {
    expect(joinChunks('intro text', '# Heading')).toBe('intro text\n\n# Heading');
  });

  it('forces a newline boundary before a list bullet', () => {
    expect(joinChunks('intro', '- first item')).toBe('intro\n\n- first item');
  });

  it('forces a newline boundary before a fenced code block', () => {
    expect(joinChunks('intro', '```ts')).toBe('intro\n\n```ts');
  });

  it('uses single newline when prev already ends with one', () => {
    expect(joinChunks('intro\n', '# Heading')).toBe('intro\n\n# Heading');
  });

  it('does not duplicate newlines when prev already ends with a blank line', () => {
    expect(joinChunks('intro\n\n', '# Heading')).toBe('intro\n\n# Heading');
  });

  it('treats numbered list openers as block starters', () => {
    expect(joinChunks('summary', '1. first')).toBe('summary\n\n1. first');
  });

  it('does not fragment streamed words into per-chunk paragraphs', () => {
    // Simulates the broken case where every PTY-sized chunk used to get
    // a leading "\n". With joinChunks each chunk lands on the same line.
    let acc = '';
    for (const chunk of ['Plan ', 'approved,', ' dispatching ', 'engineer.']) {
      acc = joinChunks(acc, chunk);
    }
    expect(acc).toBe('Plan approved, dispatching engineer.');
    // No newlines were introduced — this would have been the old bug.
    expect(acc.split('\n').length).toBe(1);
  });

  it('joins word-sized chunks without runtogether or fragmenting', () => {
    let acc = '';
    for (const chunk of ['The', 'wrapper', 'spawns', 'claude', 'via', 'node-pty.']) {
      acc = joinChunks(acc, chunk);
    }
    expect(acc).toBe('The wrapper spawns claude via node-pty.');
  });

  it('keeps a heading on its own paragraph even when streamed', () => {
    let acc = '';
    acc = joinChunks(acc, 'Intro paragraph.');
    acc = joinChunks(acc, '# Section');
    acc = joinChunks(acc, 'Body of section.');
    expect(acc).toBe('Intro paragraph.\n\n# Section\n\nBody of section.');
  });
});

describe('full pipeline on realistic PTY chunks', () => {
  it('survives a CR-overwriting spinner followed by real content', () => {
    const raw = 'Billowing…\r30s thinking with xhigh effort\rThe plan is approved.';
    expect(pipeline(raw)).toBe('The plan is approved.');
  });

  it('drops a multi-line spinner+counter+footer block', () => {
    const raw = [
      '✲ Billowing…',
      '1 active',
      'thinking on 3',
      '(24s ↑ 1.4k tokens · thought for 1s)',
    ].join('\n');
    expect(pipeline(raw)).toBe('');
  });

  it('preserves real content interleaved with spinner garbage', () => {
    const raw = [
      '✲ Billowing…',
      '# Section heading',
      '1 active',
      'A real sentence about the plan.',
      '(24s ↑ 1.4k tokens · thought for 1s)',
      'Another real sentence.',
    ].join('\n');
    const out = pipeline(raw);
    expect(out).toContain('# Section heading');
    expect(out).toContain('A real sentence about the plan.');
    expect(out).toContain('Another real sentence.');
    expect(out).not.toMatch(/Billowing/i);
    expect(out).not.toMatch(/active/i);
    expect(out).not.toMatch(/tokens/);
  });
});
