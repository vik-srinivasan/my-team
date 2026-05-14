import { Command } from 'commander';
import chalk from 'chalk';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_PORT = 3737;
const DAEMON_BASE_URL = 'http://127.0.0.1:3001';

// Conservative MIME map covering everything Vite emits into dist/.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

export interface UiCommandOptions {
  readonly distDir?: string;
  readonly port?: number;
  readonly openBrowser?: boolean;
}

export interface UiServerHandle {
  readonly server: Server;
  readonly url: string;
  readonly close: () => Promise<void>;
}

/**
 * Resolve `apps/ui/dist` relative to the installed CLI.
 * The CLI lives at `<repo>/packages/cli/dist/commands/ui.js`, so we walk up
 * three levels to reach the repo root, then into `apps/ui/dist`.
 * In a globally-installed CLI scenario, this returns a path that won't exist;
 * the caller is expected to surface a friendly error in that case.
 */
export function resolveDistDir(): string {
  return resolve(__dirname, '..', '..', '..', '..', 'apps', 'ui', 'dist');
}

/**
 * Ping the wrapper daemon's health endpoint. Returns true on 200, false otherwise.
 * Network errors are treated as "not running".
 */
export async function isDaemonRunning(baseUrl: string = DAEMON_BASE_URL): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Spawn the wrapper daemon in the background and wait for /api/health to
 * succeed. Returns once the daemon is reachable, or throws after `timeoutMs`.
 */
export async function spawnDaemon(timeoutMs = 10_000): Promise<void> {
  const wrapperEntry = resolve(__dirname, '..', '..', '..', 'wrapper', 'dist', 'index.js');
  const child = spawn('node', [wrapperEntry], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isDaemonRunning()) return;
    await sleep(200);
  }
  throw new Error(`Wrapper daemon did not become ready within ${timeoutMs}ms.`);
}

/**
 * Boot a static file server on `port` rooted at `distDir`. SPA-style fallback
 * to `index.html` for unknown paths so client-side routing works.
 *
 * Returned handle exposes the underlying Server and a Promise-returning
 * `close()` for clean teardown (used by tests and SIGINT handlers).
 */
export async function startStaticServer(distDir: string, port: number = DEFAULT_PORT): Promise<UiServerHandle> {
  // Guard: dist must exist and contain index.html before we start listening.
  try {
    const s = await stat(distDir);
    if (!s.isDirectory()) {
      throw new Error(`Not a directory: ${distDir}`);
    }
    await stat(join(distDir, 'index.html'));
  } catch {
    throw new Error(
      `UI build not found at ${distDir}. Build it first:\n  pnpm --filter @my-team/ui build`,
    );
  }

  const server = createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      const filePath = await resolveFile(distDir, rawPath);
      const data = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`500 ${message}`);
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  return {
    server,
    url: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

/**
 * Open the user's default browser to `url`. On macOS uses `open`; falls back
 * to platform-specific commands elsewhere. Failure to open is non-fatal —
 * the URL is always printed.
 */
export function openInBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // Swallow — printing the URL is sufficient fallback.
  });
  child.unref();
}

export function uiCommand(): Command {
  return new Command('ui')
    .description('Serve the my-team web UI on http://localhost:3737 and open it in your browser')
    .option('--port <port>', `Port for the static server (default ${DEFAULT_PORT})`, String(DEFAULT_PORT))
    .option('--no-open', 'Do not open the default browser')
    .action(async (opts: { port?: string; open?: boolean }) => {
      const port = Number.parseInt(opts.port ?? String(DEFAULT_PORT), 10) || DEFAULT_PORT;
      const distDir = resolveDistDir();

      // 1. Make sure the wrapper daemon is up.
      if (!(await isDaemonRunning())) {
        console.log(chalk.dim('Wrapper daemon not running; starting it...'));
        try {
          await spawnDaemon();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(chalk.red(`Could not start wrapper daemon: ${message}`));
          console.error(chalk.dim('Try running `team start` in another terminal first.'));
          process.exit(1);
        }
      }

      // 2. Boot the static server.
      let handle: UiServerHandle;
      try {
        handle = await startStaticServer(distDir, port);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(message));
        process.exit(1);
      }

      console.log(chalk.green(`my-team UI running at ${handle.url}`));
      console.log(chalk.dim('Press Ctrl+C to stop.'));

      // 3. Optionally open the browser.
      if (opts.open !== false) {
        openInBrowser(handle.url);
      }

      // 4. Clean shutdown on SIGINT/SIGTERM.
      const shutdown = async (): Promise<void> => {
        try {
          await handle.close();
        } catch {
          // Force exit even if close errors.
        }
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}

// ── Internal helpers ──────────────────────────────────────────────────

async function resolveFile(distDir: string, urlPath: string): Promise<string> {
  // Strip leading slashes and any traversal attempts.
  const cleaned = normalize(urlPath).replace(/^(\.\.[\\/])+/g, '').replace(/^\/+/, '');
  let candidate = join(distDir, cleaned);

  // Ensure we stay inside distDir even if normalize() leaves traversal.
  if (!candidate.startsWith(distDir)) {
    candidate = join(distDir, 'index.html');
  }

  try {
    const s = await stat(candidate);
    if (s.isDirectory()) {
      return join(candidate, 'index.html');
    }
    return candidate;
  } catch {
    // SPA fallback: any unknown path serves index.html so client-side routing
    // can take over.
    return join(distDir, 'index.html');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Exports for testing ──────────────────────────────────────────────
export const __test__ = {
  resolveFile,
  DEFAULT_PORT,
};
