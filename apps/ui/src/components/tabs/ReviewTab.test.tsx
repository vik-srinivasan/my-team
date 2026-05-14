import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { ReviewTab, splitReviewPasses } from './ReviewTab.js';
import { SessionSocketProvider } from '../SessionContext.js';
import type { UseSessionWebSocketResult } from '../../hooks/useSessionWebSocket.js';

function makeSocket(overrides: Partial<UseSessionWebSocketResult> = {}): UseSessionWebSocketResult {
  return {
    state: null,
    output: null,
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

describe('splitReviewPasses', () => {
  it('returns an empty array for whitespace-only input', () => {
    expect(splitReviewPasses('')).toEqual([]);
    expect(splitReviewPasses('   \n  ')).toEqual([]);
  });

  it('splits on `# Review pass <N>` headers, keeping each section\'s heading in its body', () => {
    const md = [
      '# Review pass 1',
      '',
      'first body',
      '',
      '# Review pass 2',
      '',
      'second body',
    ].join('\n');

    const sections = splitReviewPasses(md);
    expect(sections.map((s) => s.passNumber)).toEqual([1, 2]);
    expect(sections[0].body).toContain('# Review pass 1');
    expect(sections[0].body).toContain('first body');
    expect(sections[1].body).toContain('# Review pass 2');
    expect(sections[1].body).toContain('second body');
  });
});

describe('ReviewTab', () => {
  it('renders the empty state when no review content is present', () => {
    const Wrapper = wrap(makeSocket());
    render(
      <Wrapper>
        <ReviewTab />
      </Wrapper>,
    );

    expect(screen.getByText(/No review yet/i)).toBeInTheDocument();
  });

  it('expands the latest review pass by default and collapses older ones', () => {
    const Wrapper = wrap(
      makeSocket({
        teamFiles: {
          review: '# Review pass 1\n\nold pass\n\n# Review pass 2\n\nlatest pass',
        },
      }),
    );

    const view = render(
      <Wrapper>
        <ReviewTab />
      </Wrapper>,
    );

    const oldSection = view.getByTestId('review-section-1') as HTMLDetailsElement;
    const newSection = view.getByTestId('review-section-2') as HTMLDetailsElement;

    expect(newSection.open).toBe(true);
    expect(oldSection.open).toBe(false);
  });

  it('renders flat markdown when no `# Review pass` header is present', () => {
    const Wrapper = wrap(
      makeSocket({ teamFiles: { review: '## Summary\n\nLooks fine.' } }),
    );
    render(
      <Wrapper>
        <ReviewTab />
      </Wrapper>,
    );

    expect(screen.getByText('Looks fine.')).toBeInTheDocument();
  });
});
