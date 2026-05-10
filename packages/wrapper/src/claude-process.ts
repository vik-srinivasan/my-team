import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { ClaudeProcessError } from '@viktown/shared';

interface CaptainProcessEventMap {
  data: [text: string];
  exit: [code: number];
  remoteUrl: [url: string];
}

export class CaptainProcess extends EventEmitter<CaptainProcessEventMap> {
  private ptyProcess: pty.IPty;
  private _running: boolean = true;
  private _remoteUrl: string | null = null;
  private _urlDetected: boolean = false;

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get running(): boolean {
    return this._running;
  }

  get remoteUrl(): string | null {
    return this._remoteUrl;
  }

  constructor(ptyProcess: pty.IPty) {
    super();
    this.ptyProcess = ptyProcess;

    this.ptyProcess.onData((data) => {
      // Scan early output for remote control URL
      if (!this._urlDetected) {
        const match = data.match(/https:\/\/claude\.ai\/code\/[^\s\x1b)]+/);
        if (match) {
          this._remoteUrl = match[0];
          this._urlDetected = true;
          this.emit('remoteUrl', this._remoteUrl);
        }
      }
      this.emit('data', data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._running = false;
      this.emit('exit', exitCode);
    });
  }

  write(input: string): void {
    if (!this._running) {
      throw new ClaudeProcessError('Cannot write to exited process');
    }
    this.ptyProcess.write(input);
  }

  kill(): void {
    if (this._running) {
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
}

export async function spawnCaptain(options: SpawnCaptainOptions): Promise<CaptainProcess> {
  const { worktreePath, captainPromptPath, sessionId, cols = 120, rows = 40 } = options;

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
    '--append-system-prompt', captainPrompt,
    '--dangerously-skip-permissions',
    '--remote-control', sessionId ?? 'viktown-captain',
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

  return new CaptainProcess(ptyProcess);
}
