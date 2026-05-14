import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  isTypingInEditor,
  tabForDigit,
  useKeyboardShortcuts,
} from './useKeyboardShortcuts.js';
import { useUiStore } from '../store.js';

/**
 * Helper that resets the global store between tests so a stale
 * `selectedSessionId` from a previous case doesn't leak through.
 */
function resetStore(): void {
  useUiStore.setState({
    selectedSessionId: null,
    activeTab: 'journal',
    newSessionRequestNonce: 0,
  });
}

describe('tabForDigit', () => {
  it('maps "1".."8" to tab names', () => {
    expect(tabForDigit('1')).toBe('journal');
    expect(tabForDigit('2')).toBe('tasks');
    expect(tabForDigit('3')).toBe('plan');
    expect(tabForDigit('4')).toBe('srd');
    expect(tabForDigit('5')).toBe('review');
    expect(tabForDigit('6')).toBe('diff');
    expect(tabForDigit('7')).toBe('terminal');
    expect(tabForDigit('8')).toBe('workflow');
  });

  it('returns null for out-of-range or non-numeric values', () => {
    expect(tabForDigit('0')).toBeNull();
    expect(tabForDigit('9')).toBeNull();
    expect(tabForDigit('a')).toBeNull();
    expect(tabForDigit('')).toBeNull();
  });
});

describe('isTypingInEditor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true when the active element is an <input>', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(isTypingInEditor(input)).toBe(true);
  });

  it('returns true when the active element is a <textarea>', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    expect(isTypingInEditor(ta)).toBe(true);
  });

  it('returns true when the target is contenteditable (focus-independent)', () => {
    // jsdom's `focus()` on a `<div contenteditable>` doesn't always move
    // `document.activeElement` (depends on focusability rules); the helper
    // falls back to the supplied `target` argument when `activeElement` is
    // the body, which is what we exercise here.
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    expect(isTypingInEditor(div)).toBe(true);
  });

  it('returns false when nothing focusable is focused', () => {
    expect(isTypingInEditor(null)).toBe(false);
  });
});

describe('useKeyboardShortcuts', () => {
  let onNewSession: ReturnType<typeof vi.fn>;
  let onCloseSession: ReturnType<typeof vi.fn>;
  let onShowHelp: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStore();
    onNewSession = vi.fn();
    onCloseSession = vi.fn();
    onShowHelp = vi.fn();
    // Mock macOS for deterministic ⌘ vs Ctrl behavior in tests.
    Object.defineProperty(window.navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function bind(): void {
    renderHook(() =>
      useKeyboardShortcuts({ onNewSession, onCloseSession, onShowHelp }),
    );
  }

  it('triggers onNewSession on ⌘N', async () => {
    bind();
    const user = userEvent.setup();
    await user.keyboard('{Meta>}n{/Meta}');
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it('triggers onShowHelp on ? without modifier', async () => {
    bind();
    const user = userEvent.setup();
    await user.keyboard('?');
    expect(onShowHelp).toHaveBeenCalledTimes(1);
  });

  it('triggers onCloseSession on ⌘W when a session is selected', async () => {
    act(() => {
      useUiStore.setState({ selectedSessionId: 's1' });
    });
    bind();
    const user = userEvent.setup();
    await user.keyboard('{Meta>}w{/Meta}');
    expect(onCloseSession).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger onCloseSession on ⌘W when no session is selected', async () => {
    bind();
    const user = userEvent.setup();
    await user.keyboard('{Meta>}w{/Meta}');
    expect(onCloseSession).not.toHaveBeenCalled();
  });

  it('switches active tab on ⌘1..⌘8', async () => {
    bind();
    const user = userEvent.setup();

    await user.keyboard('{Meta>}3{/Meta}');
    expect(useUiStore.getState().activeTab).toBe('plan');

    await user.keyboard('{Meta>}7{/Meta}');
    expect(useUiStore.getState().activeTab).toBe('terminal');

    await user.keyboard('{Meta>}1{/Meta}');
    expect(useUiStore.getState().activeTab).toBe('journal');
  });

  it('does NOT intercept shortcuts while the user is typing in an input', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    bind();
    const user = userEvent.setup();
    // Type ⌘N into the focused input — must not fire the handler.
    await user.keyboard('{Meta>}n{/Meta}');
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it('does NOT intercept ? while typing in a textarea', async () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    bind();
    const user = userEvent.setup();
    await user.keyboard('?');
    expect(onShowHelp).not.toHaveBeenCalled();
  });
});
