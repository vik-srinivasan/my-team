import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

/**
 * Imperative handle exposed by {@link CaptainTerminal}. The WebSocket hook
 * uses this to push raw PTY bytes into the terminal as they arrive — no
 * intermediate buffering, no ANSI stripping. xterm.js handles CR / cursor
 * movement / SGR colors natively.
 */
export interface CaptainTerminalHandle {
  write: (data: string) => void;
  clear: () => void;
}

/**
 * Zinc-dark palette tuned to match the surrounding chrome (zinc-950 bg,
 * zinc-200 text). Background is set to a value just slightly lighter than
 * the parent so the terminal block reads as a distinct surface.
 */
const TERMINAL_THEME = {
  background: '#09090b', // zinc-950
  foreground: '#e4e4e7', // zinc-200
  cursor: '#e4e4e7',
  cursorAccent: '#09090b',
  selectionBackground: '#3f3f46', // zinc-700
  black: '#18181b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
} as const;

/**
 * Mounts an xterm.js Terminal that fills its container and exposes a
 * `write(bytes)` handle for the WebSocket layer. Resizes via ResizeObserver
 * + FitAddon. Read-only for now — input does not feed back to the captain
 * PTY (the chat input box in the wrapper handles that).
 */
export const CaptainTerminal = forwardRef<CaptainTerminalHandle>(
  function CaptainTerminal(_props, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: false,
        disableStdin: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: TERMINAL_THEME,
        allowProposedApi: false,
      });

      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      term.open(container);

      // Initial fit after the container has size.
      try {
        fit.fit();
      } catch {
        // The container may not have measurable dimensions yet on first
        // paint; the ResizeObserver below will fire when it does.
      }

      termRef.current = term;
      fitRef.current = fit;

      const observer = new ResizeObserver(() => {
        if (!fitRef.current) return;
        try {
          fitRef.current.fit();
        } catch {
          // Swallow: container can transiently have 0×0 during layout.
        }
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => {
          termRef.current?.write(data);
        },
        clear: () => {
          termRef.current?.clear();
        },
      }),
      [],
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
        <div
          ref={containerRef}
          className="min-h-0 flex-1 px-2 py-2"
          aria-label="Captain terminal output"
        />
      </div>
    );
  },
);
