import { describe, it, expect } from 'vitest';

import { buildCaptainSettings } from './session-manager.js';

describe('buildCaptainSettings', () => {
  it('writes the UserPromptSubmit hook in the shape Claude Code expects', () => {
    const hookPath = '/abs/path/to/agent-prompts/hooks/clear-must-ask.sh';
    const settings = buildCaptainSettings(hookPath);

    expect(settings).toEqual({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: hookPath,
              },
            ],
          },
        ],
      },
    });
  });

  it('uses the exact absolute path it was given (no relative resolution)', () => {
    // Regression guard: the captain may chdir, so a relative hook path would
    // silently fail. The wrapper resolves the path against its install root
    // and hands it in pre-resolved — buildCaptainSettings must not mangle it.
    const hookPath = '/Users/example/my-team/agent-prompts/hooks/clear-must-ask.sh';
    const settings = buildCaptainSettings(hookPath);

    const hooks = settings['hooks'] as {
      UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>;
    };
    expect(hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(hookPath);
  });

  it('produces JSON that survives a round-trip through JSON.stringify', () => {
    // The wrapper writes this verbatim to .claude/settings.json. Make sure
    // it's plain JSON-serialisable (no functions, no symbols, no undefined).
    const hookPath = '/tmp/hook.sh';
    const serialised = JSON.stringify(buildCaptainSettings(hookPath));
    const parsed = JSON.parse(serialised);

    expect(parsed).toEqual(buildCaptainSettings(hookPath));
  });
});
