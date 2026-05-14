import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { DiffTab } from './DiffTab.js';
import { SessionSocketProvider } from '../SessionContext.js';
import type { UseSessionWebSocketResult } from '../../hooks/useSessionWebSocket.js';
import { parseUnifiedDiff, truncateLines } from '../../lib/diff.js';
import { useUiStore } from '../../store.js';

function makeSocket(overrides: Partial<UseSessionWebSocketResult> = {}): UseSessionWebSocketResult {
  return {
    state: null,
    output: null,
    recentOutput: [],
    teamFiles: {},
    lastDiff: null,
    lastSpecialistEvent: null,
    remoteUrl: null,
    status: 'open',
    send: () => {},
    ...overrides,
  };
}

function wrap(socket: UseSessionWebSocketResult): (props: { children: ReactNode }) => ReactElement {
  return ({ children }) => (
    <SessionSocketProvider value={socket}>{children}</SessionSocketProvider>
  );
}

const SAMPLE_DIFF = `diff --git a/src/a.ts b/src/a.ts
index 0000000..1111111 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
 export { x };
diff --git a/src/b.css b/src/b.css
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/b.css
@@ -0,0 +1,2 @@
+.foo { color: red; }
+.bar { color: blue; }
`;

describe('parseUnifiedDiff (lib/diff)', () => {
  it('splits unified-diff text into per-file slices with +/- counts', () => {
    const files = parseUnifiedDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(2);

    const [a, b] = files;
    expect(a.path).toBe('src/a.ts');
    expect(a.additions).toBe(2);
    expect(a.deletions).toBe(1);
    expect(a.oldValue).toContain('const y = 2;');
    expect(a.newValue).toContain('const z = 4;');

    expect(b.path).toBe('src/b.css');
    expect(b.added).toBe(true);
    expect(b.additions).toBe(2);
    expect(b.deletions).toBe(0);
  });

  it('returns an empty array for blank input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('   \n  ')).toEqual([]);
  });
});

describe('truncateLines', () => {
  it('returns the input unchanged when under the cap', () => {
    expect(truncateLines('a\nb\nc', 10)).toBe('a\nb\nc');
  });

  it('appends a sentinel when the body exceeds the cap', () => {
    const body = Array.from({ length: 1500 }, (_, i) => `line${i}`).join('\n');
    const out = truncateLines(body, 1000);
    const lines = out.split('\n');
    expect(lines).toHaveLength(1001);
    expect(lines[1000]).toMatch(/500 more lines hidden/);
  });
});

describe('DiffTab', () => {
  beforeEach(() => {
    // jsdom: ResizeObserver isn't implemented; react-diff-viewer-continued
    // uses it for sticky-header sizing.
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);

    // Pick a session id so DiffTab doesn't bail out on null.
    useUiStore.setState({ selectedSessionId: 'test-session' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ selectedSessionId: null });
  });

  it('renders the empty state when no diff is present', () => {
    const Wrapper = wrap(makeSocket({ lastDiff: '' }));
    render(
      <Wrapper>
        <DiffTab />
      </Wrapper>,
    );

    expect(screen.getByText(/No diff yet/i)).toBeInTheDocument();
  });

  it('renders one collapsible block per file in the diff', () => {
    const Wrapper = wrap(makeSocket({ lastDiff: SAMPLE_DIFF }));
    const view = render(
      <Wrapper>
        <DiffTab />
      </Wrapper>,
    );

    expect(view.getByTestId('diff-file-count').textContent).toContain('2 files');
    expect(view.getByTestId('diff-file-src/a.ts')).toBeInTheDocument();
    expect(view.getByTestId('diff-file-src/b.css')).toBeInTheDocument();
  });

  it('toggles between unified and side-by-side via the view selector', () => {
    const Wrapper = wrap(makeSocket({ lastDiff: SAMPLE_DIFF }));
    const view = render(
      <Wrapper>
        <DiffTab />
      </Wrapper>,
    );

    const unifiedBtn = view.getByTestId('diff-view-unified');
    const splitBtn = view.getByTestId('diff-view-split');

    expect(unifiedBtn.getAttribute('aria-pressed')).toBe('true');
    expect(splitBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(splitBtn);

    expect(splitBtn.getAttribute('aria-pressed')).toBe('true');
    expect(unifiedBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a "Show full diff" toggle for files over 1000 lines and bypasses the cap on click', () => {
    // Build a synthetic diff whose new file is 1500 lines long. Using
    // `parse-diff`-compatible unified format so our parser sees it.
    const headerLines = [
      'diff --git a/big.ts b/big.ts',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/big.ts',
      '@@ -0,0 +1,1500 @@',
    ];
    const body = Array.from({ length: 1500 }, (_, i) => `+line ${i}`).join('\n');
    const bigDiff = `${headerLines.join('\n')}\n${body}\n`;

    const Wrapper = wrap(makeSocket({ lastDiff: bigDiff }));
    const view = render(
      <Wrapper>
        <DiffTab />
      </Wrapper>,
    );

    const showFull = view.getByTestId('diff-show-full-big.ts');
    expect(showFull).toBeInTheDocument();
    expect(view.getByText(/Truncated at 1000 lines/i)).toBeInTheDocument();

    fireEvent.click(showFull);

    // After clicking, the truncation banner disappears.
    expect(view.queryByTestId('diff-show-full-big.ts')).toBeNull();
    expect(view.queryByText(/Truncated at 1000 lines/i)).toBeNull();
  });
});
