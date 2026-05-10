import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IPty } from 'node-pty';
import { CaptainProcess } from './claude-process.js';

function createMockPty(): IPty & {
  _emitData: (text: string) => void;
  _emitExit: (code: number) => void;
} {
  let dataHandler: ((data: string) => void) | null = null;
  let exitHandler: ((e: { exitCode: number; signal?: number }) => void) | null = null;

  return {
    pid: 12345,
    cols: 120,
    rows: 40,
    handleFlowControl: false,
    onData(cb: (data: string) => void) {
      dataHandler = cb;
      return { dispose: () => {} };
    },
    onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
      exitHandler = cb;
      return { dispose: () => {} };
    },
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),
    process: 'claude',
    _emitData(text: string) {
      dataHandler?.(text);
    },
    _emitExit(code: number) {
      exitHandler?.({ exitCode: code });
    },
  };
}

describe('CaptainProcess', () => {
  let mockPty: ReturnType<typeof createMockPty>;
  let captain: CaptainProcess;

  beforeEach(() => {
    mockPty = createMockPty();
    captain = new CaptainProcess(mockPty);
  });

  it('exposes pid from pty process', () => {
    expect(captain.pid).toBe(12345);
  });

  it('starts in running state', () => {
    expect(captain.running).toBe(true);
  });

  it('forwards data events from pty', () => {
    const handler = vi.fn();
    captain.on('data', handler);
    mockPty._emitData('hello world');
    expect(handler).toHaveBeenCalledWith('hello world');
  });

  it('emits exit event and sets running to false', () => {
    const handler = vi.fn();
    captain.on('exit', handler);
    mockPty._emitExit(0);
    expect(handler).toHaveBeenCalledWith(0);
    expect(captain.running).toBe(false);
  });

  it('writes input to pty', () => {
    captain.write('test input\n');
    expect(mockPty.write).toHaveBeenCalledWith('test input\n');
  });

  it('throws when writing to exited process', () => {
    mockPty._emitExit(0);
    expect(() => captain.write('test')).toThrow('Cannot write to exited process');
  });

  it('kills the pty process', () => {
    captain.kill();
    expect(mockPty.kill).toHaveBeenCalled();
    expect(captain.running).toBe(false);
  });

  it('does not double-kill', () => {
    captain.kill();
    captain.kill();
    expect(mockPty.kill).toHaveBeenCalledTimes(1);
  });

  it('resizes the pty', () => {
    captain.resize(200, 50);
    expect(mockPty.resize).toHaveBeenCalledWith(200, 50);
  });
});
