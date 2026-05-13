import { describe, it, expect } from 'vitest';

import { buildCaptainSettings } from './session-manager.js';

describe('buildCaptainSettings', () => {
  const PATHS = {
    clearMustAskHookPath: '/abs/path/to/agent-prompts/hooks/clear-must-ask.sh',
    stopHookPath: '/abs/path/to/agent-prompts/hooks/mark-must-ask.sh',
    askQuestionHookPath:
      '/abs/path/to/agent-prompts/hooks/mark-must-ask-on-question.sh',
  } as const;

  it('writes the UserPromptSubmit, Stop, and PreToolUse hooks in the shape Claude Code expects', () => {
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
        PreToolUse: [
          {
            matcher: 'AskUserQuestion',
            hooks: [
              {
                type: 'command',
                command: PATHS.askQuestionHookPath,
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
      askQuestionHookPath:
        '/Users/example/my-team/agent-prompts/hooks/mark-must-ask-on-question.sh',
    };
    const settings = buildCaptainSettings(paths);

    const hooks = settings['hooks'] as {
      UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>;
      Stop: Array<{ hooks: Array<{ command: string }> }>;
      PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
    };
    expect(hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(
      paths.clearMustAskHookPath,
    );
    expect(hooks.Stop[0]?.hooks[0]?.command).toBe(paths.stopHookPath);
    expect(hooks.PreToolUse[0]?.matcher).toBe('AskUserQuestion');
    expect(hooks.PreToolUse[0]?.hooks[0]?.command).toBe(
      paths.askQuestionHookPath,
    );
  });

  it('registers all three hook keys (UserPromptSubmit, Stop, PreToolUse)', () => {
    // The Stop hook is the safety net for end-of-turn AT signalling, the
    // PreToolUse hook covers AskUserQuestion (the Stop hook can't fire
    // mid-call); all three must be present, none replaces the others.
    const settings = buildCaptainSettings(PATHS);
    const hooks = settings['hooks'] as Record<string, unknown>;
    expect(Object.keys(hooks).sort()).toEqual([
      'PreToolUse',
      'Stop',
      'UserPromptSubmit',
    ]);
  });

  it('produces JSON that survives a round-trip through JSON.stringify', () => {
    // The wrapper writes this verbatim to .claude/settings.json. Make sure
    // it's plain JSON-serialisable (no functions, no symbols, no undefined).
    const serialised = JSON.stringify(buildCaptainSettings(PATHS));
    const parsed = JSON.parse(serialised);

    expect(parsed).toEqual(buildCaptainSettings(PATHS));
  });
});
