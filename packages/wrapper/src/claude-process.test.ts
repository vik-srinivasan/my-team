import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('CaptainProcess (unbuffered)', () => {
  let mockPty: ReturnType<typeof createMockPty>;
  let captain: CaptainProcess;

  beforeEach(() => {
    mockPty = createMockPty();
    // Disable the line buffer so existing test contracts (raw passthrough)
    // remain meaningful. Buffer behavior is exercised in its own block.
    captain = new CaptainProcess(mockPty, { bufferLines: false });
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

describe('CaptainProcess line buffer', () => {
  let mockPty: ReturnType<typeof createMockPty>;
  let captain: CaptainProcess;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPty = createMockPty();
    captain = new CaptainProcess(mockPty, { bufferLines: true, flushMs: 50 });
    handler = vi.fn();
    captain.on('data', handler);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a partial line until a newline arrives', () => {
    mockPty._emitData('a');
    mockPty._emitData('b');
    expect(handler).not.toHaveBeenCalled();

    mockPty._emitData('\n');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('ab\n');
  });

  it('emits everything up to the last newline as one chunk', () => {
    mockPty._emitData('line one\nline two\npartial');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('line one\nline two\n');
  });

  it('flushes a stalled partial line after the idle timeout', () => {
    mockPty._emitData('still typing');
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('still typing');
  });

  it('does not flush twice when the buffer is already empty', () => {
    mockPty._emitData('full line\n');
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('flushes any tail buffer on exit', () => {
    mockPty._emitData('goodbye');
    expect(handler).not.toHaveBeenCalled();
    mockPty._emitExit(0);
    // The buffered tail must surface before listeners tear down.
    expect(handler).toHaveBeenCalledWith('goodbye');
  });

  it('flushes any tail buffer on kill', () => {
    mockPty._emitData('cut short');
    captain.kill();
    expect(handler).toHaveBeenCalledWith('cut short');
  });

  it('resets the idle timer on each new chunk', () => {
    mockPty._emitData('typ');
    vi.advanceTimersByTime(40);
    mockPty._emitData('ing');
    vi.advanceTimersByTime(40);
    // 80ms total elapsed but timer was reset at 40ms — no flush yet.
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('typing');
  });

  it('still detects the remote control URL on the raw chunk', () => {
    const urlHandler = vi.fn();
    captain.on('remoteUrl', urlHandler);
    mockPty._emitData('Open https://claude.ai/code/abc123 to control\n');
    expect(urlHandler).toHaveBeenCalledWith('https://claude.ai/code/abc123');
  });
});
