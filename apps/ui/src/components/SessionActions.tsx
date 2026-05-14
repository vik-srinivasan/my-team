import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionDetail } from '@my-team/shared/types';

import {
  approveSession,
  cleanSession,
  killSession,
  sendInput,
} from '../lib/api.js';
import { SESSIONS_QUERY_KEY } from '../hooks/useSessions.js';
import { sessionDetailQueryKey } from '../hooks/useSessionDetail.js';
import { useUiStore } from '../store.js';

export interface SessionActionsProps {
  session: SessionDetail;
}

/**
 * Right-hand action cluster on the session header.
 *
 * Buttons:
 * - Approve  — POSTs to `/approve` (wrapper writes "approved\n" to the
 *              captain's stdin).
 * - Kill     — POSTs to `/kill`.
 * - Purge    — kill + clean. Two requests serialised; on second-step
 *              failure the user keeps the half-killed session in the
 *              sidebar so they can debug.
 * - VS Code  — opens `vscode://file/<worktree_path>`. The `vscode://`
 *              URI is the official VS Code deep link (works in browser
 *              and Tauri WebView via OS protocol handler); decisions.md
 *              records the rationale.
 *
 * Send input: a tiny inline form posting `{text: <body>\n}` to
 *              `/input`. Enter submits, Shift+Enter inserts a newline
 *              into the textarea before send (consistent with the CLI's
 *              `team send` UX).
 */
export function SessionActions({ session }: SessionActionsProps): ReactElement {
  const queryClient = useQueryClient();
  const setSelectedSessionId = useUiStore((s) => s.setSelectedSessionId);
  const id = session.meta.id;

  const [text, setText] = useState('');
  const [pendingPurge, setPendingPurge] = useState(false);

  function invalidate(): void {
    queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: sessionDetailQueryKey(id) });
  }

  const approve = useMutation({
    mutationFn: () => approveSession(id),
    onSuccess: invalidate,
  });

  const kill = useMutation({
    mutationFn: () => killSession(id),
    onSuccess: invalidate,
  });

  const purge = useMutation({
    mutationFn: async () => {
      setPendingPurge(true);
      try {
        await killSession(id);
      } catch (err) {
        // If the session was already dead, fall through to clean — the
        // user's intent is "make it go away".
      }
      await cleanSession(id);
    },
    onSettled: () => {
      setPendingPurge(false);
      invalidate();
    },
    onSuccess: () => {
      // The current selection is gone — clear it so the workspace
      // returns to the "select a session" empty state.
      setSelectedSessionId(null);
    },
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      sendInput(id, body.endsWith('\n') ? body : `${body}\n`),
    onSuccess: () => {
      setText('');
    },
  });

  function handleSend(e: FormEvent): void {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    send.mutate(trimmed);
  }

  function openInVsCode(): void {
    // `vscode://file/<absolute-path>` is the documented deep link. The
    // path must start with `/` on macOS/Linux. On Windows VS Code
    // accepts `vscode://file/C:/...` (forward slashes work).
    const path = session.worktree_path;
    const url = `vscode://file${path.startsWith('/') ? '' : '/'}${path}`;
    window.open(url, '_self');
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => approve.mutate()}
          disabled={approve.isPending}
          className="rounded-sm bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {approve.isPending ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => kill.mutate()}
          disabled={kill.isPending}
          className="rounded-sm bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
        >
          {kill.isPending ? 'Killing…' : 'Kill'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Purge session ${id}? The worktree will be removed.`)) {
              purge.mutate();
            }
          }}
          disabled={pendingPurge}
          className="rounded-sm bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pendingPurge ? 'Purging…' : 'Purge'}
        </button>
        <button
          type="button"
          onClick={openInVsCode}
          title={session.worktree_path}
          className="rounded-sm bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          VS Code
        </button>
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2"
        aria-label="Send input to captain"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send to captain…"
          className="w-56 rounded-sm bg-neutral-900 border border-neutral-800 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <button
          type="submit"
          disabled={send.isPending || text.trim().length === 0}
          className="rounded-sm bg-neutral-100 text-neutral-900 px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-white"
        >
          {send.isPending ? 'Sending…' : 'Send'}
        </button>
      </form>

      {approve.isError || kill.isError || purge.isError || send.isError ? (
        <p className="text-[10px] text-red-400" role="alert">
          {(
            (approve.error as Error | null) ??
            (kill.error as Error | null) ??
            (purge.error as Error | null) ??
            (send.error as Error | null)
          )?.message ?? 'Action failed.'}
        </p>
      ) : null}
    </div>
  );
}
