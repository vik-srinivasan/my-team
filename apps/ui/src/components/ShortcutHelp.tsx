import { useEffect, type ReactElement } from 'react';

import { TAB_NAMES } from '../store.js';
import { TAB_LABELS } from './SessionWorkspace.js';
import { isMac } from '../hooks/useKeyboardShortcuts.js';

/**
 * Help overlay surfaced when the user presses `?`. Lists every shortcut
 * the `useKeyboardShortcuts` hook handles, with the modifier key resolved
 * to ⌘ on macOS / Ctrl elsewhere. Escape (or clicking the backdrop) closes.
 *
 * Implemented as a controlled component so the host (App) keeps the
 * open/closed flag in local state and the hook stays UI-agnostic.
 */
export interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutLine {
  keys: string;
  label: string;
}

function shortcutLines(): ShortcutLine[] {
  const mod = isMac() ? '⌘' : 'Ctrl';
  const lines: ShortcutLine[] = [
    { keys: `${mod}+N`, label: 'New session' },
    { keys: `${mod}+W`, label: 'Close current session' },
  ];
  for (let i = 0; i < TAB_NAMES.length; i++) {
    const name = TAB_NAMES[i];
    if (name === undefined) continue;
    lines.push({ keys: `${mod}+${i + 1}`, label: `Open ${TAB_LABELS[name]} tab` });
  }
  lines.push({ keys: '?', label: 'Show this help' });
  lines.push({ keys: 'Esc', label: 'Close this help' });
  return lines;
}

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps): ReactElement | null {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const lines = shortcutLines();

  return (
    <div
      data-testid="shortcut-help"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-md border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Keyboard shortcuts</h2>
          <button
            type="button"
            data-testid="shortcut-help-close"
            onClick={onClose}
            aria-label="Close shortcut help"
            className="text-neutral-500 hover:text-neutral-200"
          >
            ✕
          </button>
        </header>
        <ul className="divide-y divide-neutral-800">
          {lines.map((line) => (
            <li
              key={line.keys}
              className="flex items-center justify-between py-1.5 text-xs"
            >
              <span className="text-neutral-300">{line.label}</span>
              <kbd className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">
                {line.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
