import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { __test__ } from './GettingStarted';

const { CLI_GROUPS } = __test__;

// Subcommand names that ship from the CLI but intentionally are NOT shown on
// the public landing page. Keep this list small and explain each entry.
const HIDDEN_FROM_PANEL = new Set<string>([
  // No commands are intentionally hidden today; if one ever needs to be,
  // add it here with a one-line justification.
]);

// Map a `packages/cli/src/commands/<file>.ts` filename to the subcommand
// name the user types after `team`. The default is the basename, with two
// well-known overrides.
function fileToCommandName(file: string): string {
  const stem = file.replace(/\.ts$/, '');
  if (stem === 'help-info') return 'help';
  return stem;
}

function listCommandFiles(): string[] {
  // From the test file location, walk up to the repo root and into the CLI
  // commands directory. apps/landing/app/components/ -> repo root is 4 up.
  const commandsDir = resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'cli',
    'src',
    'commands',
  );
  return readdirSync(commandsDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
  );
}

function panelCommandNames(): Set<string> {
  const out = new Set<string>();
  for (const group of CLI_GROUPS) {
    for (const cmd of group.commands) {
      // Entries look like `team new "<title>"`, `team list`, `team status <id>`.
      // Strip the `team ` prefix and take the first word as the subcommand.
      const rest = cmd.name.replace(/^team\s+/, '');
      const sub = rest.split(/\s+/)[0];
      out.add(sub);
    }
  }
  return out;
}

describe('CLI_GROUPS', () => {
  it('covers every command file in packages/cli/src/commands/', () => {
    const expected = listCommandFiles()
      .map(fileToCommandName)
      .filter((name) => !HIDDEN_FROM_PANEL.has(name))
      .sort();
    const actual = [...panelCommandNames()].sort();
    const missing = expected.filter((name) => !actual.includes(name));
    expect(missing, `panel is missing entries for: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not list any subcommand that no longer exists in the CLI', () => {
    const known = new Set(listCommandFiles().map(fileToCommandName));
    const stale = [...panelCommandNames()].filter((name) => !known.has(name));
    expect(stale, `panel lists stale commands: ${stale.join(', ')}`).toEqual([]);
  });

  it('does not advertise the removed notifications --clear flag', () => {
    const notif = CLI_GROUPS.flatMap((g) => g.commands).find(
      (c) => c.name === 'team notifications',
    );
    expect(notif).toBeDefined();
    expect(notif?.flags ?? '').not.toMatch(/--clear/);
  });

  it('every entry has a non-empty name and description', () => {
    for (const group of CLI_GROUPS) {
      for (const cmd of group.commands) {
        expect(cmd.name.length).toBeGreaterThan(0);
        expect(cmd.description.length).toBeGreaterThan(0);
      }
    }
  });
});
