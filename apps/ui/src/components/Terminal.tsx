import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactElement,
} from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  /** Append raw bytes (possibly containing ANSI escapes) to the terminal. */
  write(text: string): void;
  /** Wipe the buffer and reset the cursor. */
  clear(): void;
  /** Read the current grid size — useful right after mount to send an
   *  initial `resize` frame before the first PTY output arrives. */
  size(): { cols: number; rows: number };
}

export interface TerminalProps {
  /** Called for every keystroke / paste / control character the user enters.
   *  Forwarded verbatim — xterm has already serialised the input into the
   *  PTY-style byte stream expected by the wrapper's `input` event. */
  onData(text: string): void;
  /** Called whenever the visible grid size changes (window resize, fit). */
  onResize(cols: number, rows: number): void;
}

const TERMINAL_THEME = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#404040',
  black: '#0a0a0a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e5e5e5',
  brightBlack: '#525252',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
};

/**
 * Vanilla-xterm wrapper with React lifecycle. Instantiates an `xterm.js`
 * `Terminal` once on mount, attaches it to the wrapping `div`, wires
 * `onData` + `onResize`, and tears everything down on unmount.
 *
 * The terminal grid auto-fits its parent via `FitAddon`; ResizeObserver
 * + a debounced rAF tick handle container size changes without spamming
 * the wrapper with `resize` frames. Window resizes also trigger a refit
 * so the parent doesn't need to forward them manually.
 *
 * Imperative API (via ref): `write()` to append output, `clear()` to wipe,
 * `size()` for the current cols/rows.
 */
export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { onData, onResize },
  ref,
): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Hold the latest callbacks in refs so the mount effect can stay
  // dependency-free and we don't tear down + recreate the xterm instance
  // whenever the parent re-renders with a new closure.
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  onDataRef.current = onData;
  onResizeRef.current = onResize;

  useImperativeHandle(
    ref,
    () => ({
      write(text: string): void {
        termRef.current?.write(text);
      },
      clear(): void {
        termRef.current?.clear();
      },
      size(): { cols: number; rows: number } {
        const t = termRef.current;
        if (t === null) return { cols: 80, rows: 24 };
        return { cols: t.cols, rows: t.rows };
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const term = new XTerm({
      theme: TERMINAL_THEME,
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      // The PTY (`xterm-256color`) already emits `\r\n` for line breaks.
      // Letting xterm convert `\n` → `\r\n` on top of that produces `\r\r\n`,
      // which breaks every CR-based overwrite the Claude Code TUI relies on
      // for spinners and the bottom status bar. Keep this disabled.
      convertEol: false,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();

    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    // Initial fit — defer one frame so the container has measured.
    let initialFitFrame: number | null = requestAnimationFrame(() => {
      initialFitFrame = null;
      try {
        fit.fit();
      } catch {
        // Container is detached or hidden — ignore. Subsequent observer
        // ticks will pick up the right size once it's visible.
      }
      onResizeRef.current(term.cols, term.rows);
    });

    const dataSub = term.onData((text) => onDataRef.current(text));
    const resizeSub = term.onResize(({ cols, rows }) => {
      onResizeRef.current(cols, rows);
    });

    // Debounced refit on container size change.
    let refitFrame: number | null = null;
    const scheduleRefit = (): void => {
      if (refitFrame !== null) return;
      refitFrame = requestAnimationFrame(() => {
        refitFrame = null;
        try {
          fit.fit();
        } catch {
          // ignored — container detached
        }
      });
    };

    const observer = new ResizeObserver(scheduleRefit);
    observer.observe(container);

    const handleWindowResize = (): void => scheduleRefit();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      observer.disconnect();
      if (initialFitFrame !== null) cancelAnimationFrame(initialFitFrame);
      if (refitFrame !== null) cancelAnimationFrame(refitFrame);
      dataSub.dispose();
      resizeSub.dispose();
      links.dispose();
      fit.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="xterm-container"
      className="w-full h-full bg-[#0a0a0a] overflow-hidden"
    />
  );
});
