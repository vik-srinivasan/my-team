import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { PlanTab } from './PlanTab.js';
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

describe('PlanTab', () => {
  it('renders the empty state when no plan content is present', () => {
    const Wrapper = wrap(makeSocket());
    render(
      <Wrapper>
        <PlanTab />
      </Wrapper>,
    );

    expect(screen.getByText(/No plan yet/i)).toBeInTheDocument();
  });

  it('renders plan markdown including fenced code blocks', () => {
    const Wrapper = wrap(
      makeSocket({
        teamFiles: {
          plan: '# Plan\n\nA short plan.\n\n```ts\nconst x: number = 1;\n```',
        },
      }),
    );

    render(
      <Wrapper>
        <PlanTab />
      </Wrapper>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByText('A short plan.')).toBeInTheDocument();
    expect(screen.getByText(/const x: number = 1;/)).toBeInTheDocument();
  });
});
