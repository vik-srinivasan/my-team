import { useEffect } from 'react';

import { TAB_NAMES, useUiStore, type TabName } from '../store.js';

/**
 * Shortcut payload exposed back to the host component so it can drive UI
 * controlled by global state (the New Session modal, the help overlay).
 *
 * Mod = ⌘ on macOS, Ctrl on every other platform. We detect via the
 * `navigator.platform` test rather than the trickier `navigator.userAgentData`
 * because the platform check is universally supported and works for the
 * Tauri WebView too.
 */
export interface KeyboardShortcutsOptions {
  /** Called when ⌘N / Ctrl+N is pressed. The host opens the New Session modal. */
  onNewSession: () => void;
  /**
   * Called when ⌘W / Ctrl+W is pressed AND a session is currently selected.
   * If no session is selected, the handler does not intercept the event so
   * the browser's native close-tab continues to work. The host clears the
   * `selectedSessionId` in response.
   */
  onCloseSession: () => void;
  /** Called when ?  (Shift+/) is pressed — opens the help overlay. */
  onShowHelp: () => void;
}

/**
 * Returns `true` if the keyboard target is something the user is actively
 * typing into (so we shouldn't intercept). Codemirror and Monaco render an
 * inner `<div contenteditable>`, so we treat any contenteditable as an
 * editor too. The check runs against `document.activeElement` rather than
 * `event.target` because some libraries (codemirror) reparent focus into a
 * detached contenteditable mid-keydown.
 */
export function isTypingInEditor(target: EventTarget | null): boolean {
  // Prefer `document.activeElement` (the platform-level focus) but fall
  // back to the event target when activeElement is the document body
  // (which `jsdom` and some browsers report when no element is focused).
  let candidate: Element | EventTarget | null = null;
  if (typeof document !== 'undefined') {
    const active = document.activeElement;
    if (active !== null && active !== document.body) candidate = active;
  }
  if (candidate === null) candidate = target;
  if (candidate === null || !(candidate instanceof HTMLElement)) return false;
  const tag = candidate.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Check both the property (`isContentEditable`) and the attribute
  // (`contenteditable`) — jsdom doesn't always sync the two, and we want
  // to catch contenteditable nodes whether they're focused or not.
  if (candidate.isContentEditable) return true;
  const ce = candidate.getAttribute('contenteditable');
  if (ce !== null && ce !== 'false' && ce !== 'inherit') return true;
  // CodeMirror 6 wraps its editing surface in a div[role=textbox]; some
  // versions also set `cm-content` as a class. Belt-and-braces.
  if (candidate.getAttribute('role') === 'textbox') return true;
  if (candidate.classList.contains('cm-content')) return true;
  return false;
}

/**
 * Returns true if the host platform is macOS — we use the ⌘ key there and
 * Ctrl on every other platform. This runs in the renderer (browser + Tauri
 * WebView); for Tauri-macOS the WebView reports `MacIntel` like Safari.
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform ?? '');
}

/**
 * Maps the tab digit keys (1..N, where N === `TAB_NAMES.length`) to the
 * names defined in `TAB_NAMES`. Exported so tests can drive it without
 * binding the listener. There are nine tabs today (chat is the new
 * leftmost), so 1..9 are valid.
 */
export function tabForDigit(digit: string): TabName | null {
  const idx = Number.parseInt(digit, 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= TAB_NAMES.length) return null;
  return TAB_NAMES[idx] ?? null;
}

/**
 * Global keyboard shortcut binding. Attaches a single `keydown` listener at
 * the window level for the lifetime of the calling component (usually `App`).
 *
 * Bindings:
 * - **Mod+N**: open New Session modal
 * - **Mod+W**: clear `selectedSessionId` (when one is selected)
 * - **Mod+1..9**: jump to tab chat/journal/tasks/plan/srd/review/diff/terminal/workflow
 * - **?  (Shift+/):** open the shortcut help overlay
 *
 * When the user is typing in an `<input>` / `<textarea>` / contenteditable
 * (e.g. the CodeMirror prompt editor on the Workflow tab), shortcuts are
 * NOT intercepted so typing remains uninterrupted.
 *
 * Mod+W is special: if no session is selected, the handler returns early
 * so the browser's native close-tab continues to function (web mode only —
 * Tauri's WebView doesn't dispatch the OS-level shortcut to the page).
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions): void {
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isTypingInEditor(event.target)) return;

      const mod = isMac() ? event.metaKey : event.ctrlKey;

      // ?  → help overlay. Shift+/ produces '?' on US layouts but we also
      // accept literal '?' for non-US layouts that emit it directly. No
      // mod key required.
      if (event.key === '?' && !mod) {
        event.preventDefault();
        options.onShowHelp();
        return;
      }

      if (!mod) return;

      // ⌘/Ctrl + N — new session.
      if (event.key.toLowerCase() === 'n' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        options.onNewSession();
        return;
      }

      // ⌘/Ctrl + W — close detail. Only intercept when a session is selected;
      // otherwise let the browser's native close-tab through. We read the
      // store inside the handler so the latest selection wins after a
      // re-render without re-binding the listener.
      if (event.key.toLowerCase() === 'w' && !event.shiftKey && !event.altKey) {
        const selected = useUiStore.getState().selectedSessionId;
        if (selected === null) return;
        event.preventDefault();
        options.onCloseSession();
        return;
      }

      // ⌘/Ctrl + 1..N — jump to tab (N === TAB_NAMES.length). The keypad
      // digits also map. With the Chat tab added as the new leftmost
      // entry, this is now 1..9.
      const tab = tabForDigit(event.key);
      if (tab !== null) {
        event.preventDefault();
        setActiveTab(tab);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [options, setActiveTab]);
}
