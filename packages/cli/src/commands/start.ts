import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function startCommand(): Command {
  return new Command('start')
    .description('Start the wrapper daemon in the foreground')
    .action(() => {
      const wrapperEntry = resolve(__dirname, '..', '..', '..', 'wrapper', 'dist', 'index.js');

      const child = spawn('node', [wrapperEntry], {
        stdio: 'inherit',
        env: { ...process.env },
      });

      child.on('error', (err) => {
        console.error(`Failed to start wrapper: ${err.message}`);
        process.exit(1);
      });

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });

      // Forward signals to child
      process.on('SIGINT', () => child.kill('SIGINT'));
      process.on('SIGTERM', () => child.kill('SIGTERM'));
    });
}
