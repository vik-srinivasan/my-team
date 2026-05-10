import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';

import { ClaudeProcessError } from '@viktown/shared';

export interface CaptainProcessEvents {
  data: (text: string) => void;
  exit: (code: number) => void;
}

export class CaptainProcess extends EventEmitter<CaptainProcessEvents> {
  private ptyProcess: pty.IPty;
  private _running: boolean = true;

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get running(): boolean {
    return this._running;
  }

  constructor(ptyProcess: pty.IPty) {
    super();
    this.ptyProcess = ptyProcess;

    this.ptyProcess.onData((data) => {
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
  cols?: number;
  rows?: number;
}

export async function spawnCaptain(options: SpawnCaptainOptions): Promise<CaptainProcess> {
  const { worktreePath, captainPromptPath, cols = 120, rows = 40 } = options;

  let captainPrompt: string;
  try {
    captainPrompt = await readFile(captainPromptPath, 'utf-8');
  } catch (err) {
    throw new ClaudeProcessError(
      `Failed to read captain prompt at ${captainPromptPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const ptyProcess = pty.spawn('claude', [
    '--append-system-prompt', captainPrompt,
  ], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: worktreePath,
    env: {
      ...process.env,
      // Ensure claude sees the worktree as its working directory
    },
  });

  return new CaptainProcess(ptyProcess);
}
