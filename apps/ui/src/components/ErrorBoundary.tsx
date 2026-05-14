import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

/**
 * Minimal class-based error boundary — React still requires class
 * components for `componentDidCatch` / `getDerivedStateFromError`. Used to
 * isolate each tab plus the sidebar and workspace, so a crash in one
 * surface doesn't blank the whole app.
 *
 * The fallback shows the error message and a Reset button that bumps an
 * internal key, re-mounting the children so the user can retry without
 * reloading the page.
 */
export interface ErrorBoundaryProps {
  /** Human label for the broken surface — e.g. `Journal tab`, `Sidebar`. */
  label?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Bumped on Reset so React unmounts/remounts the children subtree. */
  resetKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Stay loud in the dev console but don't blow up tests in CI noise.
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      // eslint-disable-next-line no-console -- dev-only diagnostic
      console.error(
        `[ErrorBoundary${this.props.label ? ' ' + this.props.label : ''}]`,
        error,
        info.componentStack,
      );
    }
  }

  handleReset = (): void => {
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render(): ReactNode {
    const { error, resetKey } = this.state;
    const { label, children } = this.props;
    if (error !== null) {
      return (
        <div
          role="alert"
          data-testid="error-boundary-fallback"
          className="flex h-full w-full items-center justify-center p-6"
        >
          <div className="max-w-md w-full rounded-sm border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
            <p className="font-semibold text-red-100">
              Something broke rendering {label ?? 'this tab'}.
            </p>
            <pre
              data-testid="error-boundary-message"
              className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-black/30 p-2 font-mono text-[11px] text-red-300/90"
            >
              {error.message}
            </pre>
            <button
              type="button"
              data-testid="error-boundary-reset"
              onClick={this.handleReset}
              className="mt-3 rounded-sm border border-red-700 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-900/40"
            >
              Reset
            </button>
          </div>
        </div>
      );
    }
    // Bump the key on reset so the children subtree fully remounts; this
    // clears any internal state in the broken component that may have
    // triggered the throw in the first place.
    return <BoundaryChildren key={resetKey}>{children}</BoundaryChildren>;
  }
}

function BoundaryChildren({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}
