import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_PROMPTS_DIR = resolve(__dirname, '..', '..', '..', 'agent-prompts');

// Allowed values per CLAUDE.md / SPEC.md / context.md conventions.
const ALLOWED_MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable']);
const RECOGNIZED_TOOLS = new Set([
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'Task',
  'WebFetch',
  'WebSearch',
  // Notebooks
  'NotebookEdit',
  'NotebookRead',
  // MCP-style tools (none currently used; reserved)
]);

// The six standardized opening section headers, in this exact order.
const STANDARDIZED_HEADERS = [
  '## Intro',
  '## Your team',
  '## Effort level',
  '## Your mission',
  '## Before you start',
  '## Your workflow',
];

interface AgentPromptFile {
  path: string;
  name: string; // filename without .md
  body: string;
}

function loadAgentPromptFiles(): AgentPromptFile[] {
  const entries = readdirSync(AGENT_PROMPTS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => ({
      path: join(AGENT_PROMPTS_DIR, e.name),
      name: e.name.replace(/\.md$/, ''),
      body: readFileSync(join(AGENT_PROMPTS_DIR, e.name), 'utf-8'),
    }));
}

interface Frontmatter {
  raw: string;
  fields: Array<{ key: string; value: string }>;
}

function parseFrontmatter(body: string): Frontmatter | null {
  // Strict: must start with --- on the very first line.
  if (!body.startsWith('---\n')) return null;
  const end = body.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const raw = body.slice(4, end);
  const fields: Array<{ key: string; value: string }> = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    const idx = line.indexOf(':');
    if (idx === -1) {
      // malformed line — surface it by representing as a field with empty key
      fields.push({ key: '__malformed__', value: line });
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields.push({ key, value });
  }
  return { raw, fields };
}

const files = loadAgentPromptFiles();

// Sanity check — the suite has at least the 10 agents the SRD enumerates.
describe('agent-prompts/ directory shape', () => {
  it('contains every always-on + conditional agent plus the captain', () => {
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(
      [
        'auditor',
        'captain',
        'debugger',
        'designer',
        'documenter',
        'engineer',
        'reviewer',
        'runner',
        'scout',
        'tester',
      ].sort(),
    );
  });
});

// ── Per-specialist tests (all .md files EXCEPT captain.md) ───────────
//
// Captain has no frontmatter — it is the orchestrator prompt fed to the
// wrapper, not a dispatchable subagent. We validate captain separately
// below.

const specialistFiles = files.filter((f) => f.name !== 'captain');

describe.each(specialistFiles.map((f) => [f.name, f] as const))(
  'agent-prompts/%s.md',
  (_name, file) => {
    const fm = parseFrontmatter(file.body);

    it('has YAML frontmatter delimited by --- lines', () => {
      expect(fm, `${file.path} has no parseable frontmatter`).not.toBeNull();
    });

    it('frontmatter contains exactly the four required fields in order: name, description, model, tools', () => {
      if (!fm) throw new Error('no frontmatter');
      const keys = fm.fields.map((f) => f.key);
      expect(keys).toEqual(['name', 'description', 'model', 'tools']);
    });

    it('frontmatter `name` matches the filename without extension', () => {
      if (!fm) throw new Error('no frontmatter');
      const nameField = fm.fields.find((f) => f.key === 'name');
      expect(nameField?.value).toBe(basename(file.path).replace(/\.md$/, ''));
    });

    it('frontmatter `description` is a non-empty single-line string', () => {
      if (!fm) throw new Error('no frontmatter');
      const desc = fm.fields.find((f) => f.key === 'description');
      expect(desc?.value, `${file.name} description is empty`).toBeTruthy();
      expect(desc!.value.length).toBeGreaterThan(10);
      expect(desc!.value).not.toContain('\n');
    });

    it('frontmatter `model` is one of sonnet | opus | haiku | fable', () => {
      if (!fm) throw new Error('no frontmatter');
      const model = fm.fields.find((f) => f.key === 'model');
      expect(ALLOWED_MODELS.has(model?.value ?? '')).toBe(true);
    });

    it('frontmatter `tools` is a comma-separated list of recognized tool names', () => {
      if (!fm) throw new Error('no frontmatter');
      const tools = fm.fields.find((f) => f.key === 'tools');
      expect(tools?.value, `${file.name} has no tools field`).toBeTruthy();
      const parsed = tools!.value.split(',').map((t) => t.trim()).filter(Boolean);
      expect(parsed.length).toBeGreaterThan(0);
      for (const tool of parsed) {
        expect(
          RECOGNIZED_TOOLS.has(tool),
          `${file.name}: tool '${tool}' is not a recognized Claude Code tool`,
        ).toBe(true);
      }
      // No duplicates.
      expect(new Set(parsed).size).toBe(parsed.length);
    });

    it('body (after frontmatter) contains the six standardized opening headers in order', () => {
      // Slice off the frontmatter to inspect the prompt body.
      if (!fm) throw new Error('no frontmatter');
      const bodyStart = file.body.indexOf('\n---\n', 4) + 5;
      const body = file.body.slice(bodyStart);
      assertHeadersInOrder(file.name, body);
    });
  },
);

// ── Captain: same standardized headers, no frontmatter ──────────────

describe('agent-prompts/captain.md', () => {
  const captain = files.find((f) => f.name === 'captain');
  if (!captain) throw new Error('captain.md missing');

  it('does NOT have YAML frontmatter (captain is the orchestrator, not a subagent)', () => {
    // Captain is loaded directly by the wrapper, not picked up by Claude
    // Code's subagent dispatcher, so it intentionally has no frontmatter.
    expect(parseFrontmatter(captain.body)).toBeNull();
  });

  it('starts with the canonical title heading', () => {
    expect(captain.body.split('\n')[0]).toBe('# Captain — Session Orchestrator');
  });

  it('contains the six standardized opening section headers in order', () => {
    assertHeadersInOrder(captain.name, captain.body);
  });
});

// ── Designer-specific regression test ───────────────────────────────
//
// The designer specialist was previously granted the `Edit` tool, which
// let it surgically modify source files despite prose saying it should
// only critique. This guard locks the fix in place — any future
// reintroduction of `Edit` to designer's tool grants must fail this
// test loudly.

describe('agent-prompts/designer.md tool grants', () => {
  it('designer tool grants do not include Edit (prevents source-edit regression)', () => {
    const designer = files.find((f) => f.name === 'designer');
    if (!designer) throw new Error('designer.md missing');
    const fm = parseFrontmatter(designer.body);
    if (!fm) throw new Error('designer.md has no parseable frontmatter');
    const tools = fm.fields.find((f) => f.key === 'tools');
    expect(tools?.value, 'designer has no tools field').toBeTruthy();
    const parsed = tools!.value.split(',').map((t) => t.trim()).filter(Boolean);
    expect(parsed).not.toContain('Edit');
    expect(parsed).toContain('Write');
  });
});

function assertHeadersInOrder(agentName: string, body: string): void {
  let cursor = 0;
  for (const header of STANDARDIZED_HEADERS) {
    // Match on a line-starting basis (avoid matching '## Intro' inside a
    // bullet or quote).
    const idx = body.indexOf(`\n${header}\n`, cursor);
    // For the very first header it may be at position 0 too — try both.
    const firstIdx = body.startsWith(`${header}\n`) && cursor === 0 ? 0 : idx;
    expect(
      firstIdx,
      `${agentName}: header '${header}' missing or out of order (cursor=${cursor})`,
    ).toBeGreaterThanOrEqual(0);
    cursor = firstIdx + header.length;
  }
}
