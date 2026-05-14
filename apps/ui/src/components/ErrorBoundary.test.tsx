import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ErrorBoundary } from './ErrorBoundary.js';

/**
 * Component that throws on the first render and never again — used to
 * verify that Reset re-mounts the subtree cleanly. The `crash` flag lives
 * in a module-level closure so the wrapper can toggle it from outside.
 */
let shouldCrash = true;
function Crashy(): ReactElement {
  if (shouldCrash) {
    throw new Error('boom from Crashy');
  }
  return <p data-testid="crashy-ok">recovered</p>;
}

/**
 * Component that crashes only if its `key` value matches; tests can flip a
 * controlled crash from the outside without relying on module state.
 */
function CrashOnDemand({ crash }: { crash: boolean }): ReactElement {
  if (crash) throw new Error('boom on demand');
  return <p data-testid="ok">ok</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldCrash = true;
    // Silence the noisy console.error / React's "uncaught" warnings.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when they do not throw', () => {
    render(
      <ErrorBoundary label="test">
        <p data-testid="child">hello</p>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('catches an error and shows the fallback with the error message', () => {
    render(
      <ErrorBoundary label="Journal tab">
        <Crashy />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText(/Something broke rendering Journal tab/i)).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent('boom from Crashy');
  });

  it('falls back to "this tab" when no label is provided', () => {
    render(
      <ErrorBoundary>
        <Crashy />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something broke rendering this tab/i)).toBeInTheDocument();
  });

  it('reset re-mounts the children subtree', () => {
    render(
      <ErrorBoundary label="reset">
        <Crashy />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();

    // Stop throwing before the user clicks Reset.
    shouldCrash = false;
    fireEvent.click(screen.getByTestId('error-boundary-reset'));

    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
    expect(screen.getByTestId('crashy-ok')).toBeInTheDocument();
  });

  it('isolates sibling boundaries — a crash in one does not break the other', () => {
    function Harness(): ReactElement {
      const [crashLeft] = useState(true);
      return (
        <div>
          <ErrorBoundary label="left">
            <CrashOnDemand crash={crashLeft} />
          </ErrorBoundary>
          <ErrorBoundary label="right">
            <CrashOnDemand crash={false} />
          </ErrorBoundary>
        </div>
      );
    }
    render(<Harness />);
    // Left side broken, right side intact.
    expect(screen.getByText(/Something broke rendering left/i)).toBeInTheDocument();
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });
});
