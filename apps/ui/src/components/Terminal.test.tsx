import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';

import { Terminal, type TerminalHandle } from './Terminal.js';

// Spy on the xterm constructor so we can assert which options the
// component passes in (convertEol, scrollback, etc.). We wrap the real
// constructor rather than replacing it so the rest of these tests
// continue to exercise real xterm behaviour in jsdom.
const xtermConstructorSpy = vi.fn<(opts: Record<string, unknown>) => void>();
vi.mock('@xterm/xterm', async () => {
  const actual =
    await vi.importActual<typeof import('@xterm/xterm')>('@xterm/xterm');
  class SpyTerminal extends actual.Terminal {
    constructor(opts: ConstructorParameters<typeof actual.Terminal>[0]) {
      xtermConstructorSpy(opts as Record<string, unknown>);
      super(opts);
    }
  }
  return { ...actual, Terminal: SpyTerminal };
});

/**
 * jsdom doesn't implement enough of the browser surface for xterm.js's
 * renderer:
 *   - `ResizeObserver` is missing (the component listens for container
 *     size changes).
 *   - `window.matchMedia` is missing (xterm uses it to detect HiDPI).
 *   - `HTMLCanvasElement.getContext` returns null without the optional
 *     `canvas` npm package.
 *
 * We stub all three to no-ops/identity. xterm degrades gracefully — the
 * DOM hierarchy + addons still mount and the imperative ref is wired,
 * which is what we care about asserting at this layer.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver ??=
    StubResizeObserver;

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  // jsdom's HTMLCanvasElement.getContext returns null — xterm's
  // CharSizeService crashes on the null return. Replace with a tiny
  // stub that's good enough for xterm to construct without throwing.
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (type: string) => unknown;
  };
  proto.getContext = function getContextStub(type: string): unknown {
    if (type === '2d') {
      return {
        measureText: (text: string) => ({ width: text.length * 7 }),
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {},
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        setTransform: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        fill: () => {},
        drawImage: () => {},
        font: '',
      };
    }
    return null;
  };
});

describe('Terminal', () => {
  it('mounts an xterm view into a container div and exposes the imperative ref', () => {
    const onData = vi.fn();
    const onResize = vi.fn();
    const ref = createRef<TerminalHandle>();

    const { container } = render(
      <Terminal ref={ref} onData={onData} onResize={onResize} />,
    );

    // Container element exists.
    const host = container.querySelector('[data-testid="xterm-container"]');
    expect(host).not.toBeNull();
    expect(ref.current).not.toBeNull();

    // The imperative API is wired up.
    expect(typeof ref.current!.write).toBe('function');
    expect(typeof ref.current!.clear).toBe('function');
    expect(typeof ref.current!.size).toBe('function');

    // size() returns sane defaults even in jsdom (xterm falls back to 80x24
    // when the container has no measurable extent).
    const size = ref.current!.size();
    expect(size.cols).toBeGreaterThan(0);
    expect(size.rows).toBeGreaterThan(0);
  });

  it('the ref-exposed write() does not throw', () => {
    const ref = createRef<TerminalHandle>();
    render(<Terminal ref={ref} onData={() => {}} onResize={() => {}} />);
    expect(() => ref.current!.write('hello\n')).not.toThrow();
  });

  it('the ref-exposed clear() does not throw', () => {
    const ref = createRef<TerminalHandle>();
    render(<Terminal ref={ref} onData={() => {}} onResize={() => {}} />);
    expect(() => ref.current!.clear()).not.toThrow();
  });

  it('constructs xterm with convertEol: false so the PTY-emitted \\r\\n is not double-translated', () => {
    xtermConstructorSpy.mockClear();
    render(<Terminal onData={() => {}} onResize={() => {}} />);
    expect(xtermConstructorSpy).toHaveBeenCalledTimes(1);
    const opts = xtermConstructorSpy.mock.calls[0][0];
    expect(opts).toMatchObject({ convertEol: false });
  });
});
