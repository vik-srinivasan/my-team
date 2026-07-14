import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { ClaudeProcessError } from '@my-team/shared';

interface CaptainProcessEventMap {
  data: [text: string];
  exit: [code: number];
  remoteUrl: [url: string];
}

/** How long to hold a partial line before flushing on the idle timer. */
const LINE_FLUSH_MS = 50;

/**
 * Model alias the captain runs on. Pinned to the fable tier — Anthropic's
 * most capable model, tuned for long-horizon agentic work — so the
 * orchestrator gets the strongest planning/coordination available. Passed
 * to the `claude` CLI via `--model`. The CLI accepts the short alias
 * `fable` (see `claude --help`); use the full name `claude-fable-5` only if
 * a future CLI drops the alias.
 */
export const CAPTAIN_MODEL = 'fable';

/**
 * Reasoning effort the captain runs at. Fable's thinking is always on;
 * `xhigh` gives the orchestrator the deepest deliberation short of `max`.
 */
export const CAPTAIN_EFFORT = 'xhigh';

export interface CaptainProcessOptions {
  /**
   * Buffer PTY output until a newline or `flushMs` of idle time. Reduces
   * the chance that a single logical line is split across multiple
   * WebSocket events, which would force the client into much harder
   * ANSI/CR-overwrite reassembly. Defaults to true.
   */
  bufferLines?: boolean;
  /** Idle flush timeout in milliseconds. Defaults to {@link LINE_FLUSH_MS}. */
  flushMs?: number;
}

export class CaptainProcess extends EventEmitter<CaptainProcessEventMap> {
  private ptyProcess: pty.IPty;
  private _running: boolean = true;
  private _remoteUrl: string | null = null;
  private _urlDetected: boolean = false;
  private bufferLines: boolean;
  private flushMs: number;
  private lineBuffer: string = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get running(): boolean {
    return this._running;
  }

  get remoteUrl(): string | null {
    return this._remoteUrl;
  }

  constructor(ptyProcess: pty.IPty, options: CaptainProcessOptions = {}) {
    super();
    this.ptyProcess = ptyProcess;
    this.bufferLines = options.bufferLines ?? true;
    this.flushMs = options.flushMs ?? LINE_FLUSH_MS;

    this.ptyProcess.onData((data) => {
      // Scan early output for remote control URL on the raw byte stream
      // so we don't miss URLs that span buffer boundaries — but the URL
      // itself never contains a newline so any single chunk should hold it.
      if (!this._urlDetected) {
        const match = data.match(/https:\/\/claude\.ai\/code\/[^\s\x1b)]+/);
        if (match) {
          this._remoteUrl = match[0];
          this._urlDetected = true;
          this.emit('remoteUrl', this._remoteUrl);
        }
      }
      this.handleData(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._running = false;
      // Make sure any final unterminated line reaches listeners before
      // they tear down. Otherwise a process that exits without a trailing
      // newline could leak its last words.
      this.flushBuffer();
      this.emit('exit', exitCode);
    });
  }

  /**
   * Coalesce PTY output into newline-terminated emissions. Holds a tail
   * partial line for up to `flushMs` before emitting it anyway so we
   * don't stall when the captain produces a prompt with no trailing newline.
   */
  private handleData(data: string): void {
    if (!this.bufferLines) {
      this.emit('data', data);
      return;
    }

    this.lineBuffer += data;
    const lastNewline = this.lineBuffer.lastIndexOf('\n');
    if (lastNewline !== -1) {
      // Emit everything up to and including the last newline as one chunk.
      const ready = this.lineBuffer.slice(0, lastNewline + 1);
      this.lineBuffer = this.lineBuffer.slice(lastNewline + 1);
      this.emit('data', ready);
    }

    // (Re)arm the idle flush so a stalled partial line still surfaces.
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.lineBuffer.length > 0) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushBuffer();
      }, this.flushMs);
    }
  }

  /** Emit any pending partial line and clear timers. Idempotent. */
  private flushBuffer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.lineBuffer.length > 0) {
      const pending = this.lineBuffer;
      this.lineBuffer = '';
      this.emit('data', pending);
    }
  }

  write(input: string): void {
    if (!this._running) {
      throw new ClaudeProcessError('Cannot write to exited process');
    }
    this.ptyProcess.write(input);
  }

  kill(): void {
    if (this._running) {
      this.flushBuffer();
      this.ptyProcess.kill();
      this._running = false;
    }
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }
}

export interface SpawnCaptainOptions {
  worktreePath: string;
  captainPromptPath: string;
  sessionId?: string;
  cols?: number;
  rows?: number;
  /** Pass-through to {@link CaptainProcess} buffering. */
  bufferLines?: boolean;
  flushMs?: number;
}

export async function spawnCaptain(options: SpawnCaptainOptions): Promise<CaptainProcess> {
  const {
    worktreePath,
    captainPromptPath,
    sessionId,
    cols = 120,
    rows = 40,
    bufferLines,
    flushMs,
  } = options;

  let captainPrompt: string;
  try {
    captainPrompt = await readFile(captainPromptPath, 'utf-8');
  } catch (err) {
    throw new ClaudeProcessError(
      `Failed to read captain prompt at ${captainPromptPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Resolve full path to claude — node-pty doesn't always inherit shell PATH
  let claudeBin = 'claude';
  try {
    claudeBin = execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    // Fall back to bare name and hope it's on PATH
  }

  const args = [
    '--model', CAPTAIN_MODEL,
    '--append-system-prompt', captainPrompt,
    '--dangerously-skip-permissions',
    '--remote-control', sessionId ?? 'my-team-captain',
    '--effort', CAPTAIN_EFFORT,
  ];

  const ptyProcess = pty.spawn(claudeBin, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: worktreePath,
    env: {
      ...process.env,
    },
  });

  return new CaptainProcess(ptyProcess, { bufferLines, flushMs });
}
