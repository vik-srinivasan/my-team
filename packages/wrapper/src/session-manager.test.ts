import { describe, it, expect } from 'vitest';

import { buildCaptainSettings } from './session-manager.js';

describe('buildCaptainSettings', () => {
  const PATHS = {
    clearMustAskHookPath: '/abs/path/to/agent-prompts/hooks/clear-must-ask.sh',
    stopHookPath: '/abs/path/to/agent-prompts/hooks/mark-must-ask.sh',
  } as const;

  it('writes the UserPromptSubmit and Stop hooks in the shape Claude Code expects', () => {
    const settings = buildCaptainSettings(PATHS);

    expect(settings).toEqual({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: PATHS.clearMustAskHookPath,
              },
            ],
          },
        ],
        Stop: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: PATHS.stopHookPath,
              },
            ],
          },
        ],
      },
    });
  });

  it('uses the exact absolute paths it was given (no relative resolution)', () => {
    // Regression guard: the captain may chdir, so a relative hook path would
    // silently fail. The wrapper resolves the paths against its install root
    // and hands them in pre-resolved — buildCaptainSettings must not mangle them.
    const paths = {
      clearMustAskHookPath:
        '/Users/example/my-team/agent-prompts/hooks/clear-must-ask.sh',
      stopHookPath: '/Users/example/my-team/agent-prompts/hooks/mark-must-ask.sh',
    };
    const settings = buildCaptainSettings(paths);

    const hooks = settings['hooks'] as {
      UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>;
      Stop: Array<{ hooks: Array<{ command: string }> }>;
    };
    expect(hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(
      paths.clearMustAskHookPath,
    );
    expect(hooks.Stop[0]?.hooks[0]?.command).toBe(paths.stopHookPath);
  });

  it('registers the Stop hook alongside UserPromptSubmit (both keys present)', () => {
    // The Stop hook is the safety net for end-of-turn AT signalling; both
    // hooks must be present, neither replaces the other.
    const settings = buildCaptainSettings(PATHS);
    const hooks = settings['hooks'] as Record<string, unknown>;
    expect(Object.keys(hooks).sort()).toEqual(['Stop', 'UserPromptSubmit']);
  });

  it('produces JSON that survives a round-trip through JSON.stringify', () => {
    // The wrapper writes this verbatim to .claude/settings.json. Make sure
    // it's plain JSON-serialisable (no functions, no symbols, no undefined).
    const serialised = JSON.stringify(buildCaptainSettings(PATHS));
    const parsed = JSON.parse(serialised);

    expect(parsed).toEqual(buildCaptainSettings(PATHS));
  });
});
