import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { TasksTab } from './TasksTab.js';
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

describe('TasksTab', () => {
  it('renders the empty state when no tasks content has streamed yet', () => {
    const Wrapper = wrap(makeSocket());
    render(
      <Wrapper>
        <TasksTab />
      </Wrapper>,
    );

    expect(screen.getByText(/No tasks yet\./i)).toBeInTheDocument();
  });

  it('renders [x] as a filled checkbox glyph and [ ] as an empty one', () => {
    const Wrapper = wrap(
      makeSocket({
        teamFiles: {
          tasks: [
            '## Engineering',
            '',
            '- [x] @engineer ship the thing',
            '- [ ] @engineer ship the other thing',
          ].join('\n'),
        },
      }),
    );

    const view = render(
      <Wrapper>
        <TasksTab />
      </Wrapper>,
    );

    // remark-gfm's default <input type="checkbox"> must be suppressed —
    // we render our own glyph instead.
    expect(view.container.querySelector('input[type="checkbox"]')).toBeNull();

    const checked = view.getAllByTestId('task-checkbox-checked');
    const unchecked = view.getAllByTestId('task-checkbox-unchecked');
    expect(checked).toHaveLength(1);
    expect(unchecked).toHaveLength(1);

    // Each completed row should carry the data-task-status="done" marker so
    // future styling (line-through, dimming) can reliably target it.
    const doneItems = view.container.querySelectorAll('[data-task-status="done"]');
    const openItems = view.container.querySelectorAll('[data-task-status="open"]');
    expect(doneItems).toHaveLength(1);
    expect(openItems).toHaveLength(1);
  });

  it('preserves the section heading from the markdown source', () => {
    const Wrapper = wrap(
      makeSocket({
        teamFiles: {
          tasks: '## Testing\n\n- [ ] @tester a thing',
        },
      }),
    );

    render(
      <Wrapper>
        <TasksTab />
      </Wrapper>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Testing' })).toBeInTheDocument();
  });

  it('keeps non-task bulleted lists rendered with bullets', () => {
    // We hide the bullet only on task-list rows; nested standard `<ul>`s
    // should still render markers.
    const Wrapper = wrap(
      makeSocket({
        teamFiles: {
          tasks: '- regular bullet one\n- regular bullet two',
        },
      }),
    );
    const view = render(
      <Wrapper>
        <TasksTab />
      </Wrapper>,
    );
    const items = view.container.querySelectorAll('li');
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const li of Array.from(items)) {
      expect(li.dataset.taskStatus).toBeUndefined();
    }
  });
});
