import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createSession, getRecents } from '../lib/api.js';
import { SESSIONS_QUERY_KEY } from '../hooks/useSessions.js';

export interface NewSessionModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

/**
 * Modal form for `POST /api/sessions`. Repo picker is populated by the
 * recents endpoint (Engineer 1's `/api/repos/recents`). A free-text
 * fallback below the dropdown lets the user paste an absolute path when
 * the repo isn't in recents (the spec calls a native picker a stretch
 * goal for v1; deferred to a follow-up).
 *
 * The `--new`, `--github`, `--public` checkboxes are surfaced but the
 * wrapper's `POST /api/sessions` body doesn't accept those fields today
 * (only `source_repo` and `title`). They're stored in component state and
 * disabled with a tooltip until the wrapper grows support — captain
 * already orchestrates the github/public side via session-level state.
 * The checkboxes render as visual placeholders so users see the surface
 * area is planned.
 */
export function NewSessionModal({ onClose, onCreated }: NewSessionModalProps): ReactElement {
  const queryClient = useQueryClient();
  const recents = useQuery({
    queryKey: ['recents'],
    queryFn: getRecents,
  });

  const [repoChoice, setRepoChoice] = useState<string>('');
  const [repoOverride, setRepoOverride] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [newBranch, setNewBranch] = useState(false);
  const [github, setGithub] = useState(false);
  const [publicRepo, setPublicRepo] = useState(false);

  // Default the repo dropdown to the most-recently-used repo once recents loads.
  useEffect(() => {
    if (repoChoice === '' && recents.data && recents.data.repos.length > 0) {
      setRepoChoice(recents.data.repos[0].path);
    }
  }, [recents.data, repoChoice]);

  // When the recents query fails (daemon down, network glitch, etc.) auto-flip
  // the select to the "paste path" option so the user gets a usable input
  // instead of being stuck on a stale "Loading recents…" placeholder.
  useEffect(() => {
    if (recents.isError && repoChoice === '') {
      setRepoChoice('__custom__');
    }
  }, [recents.isError, repoChoice]);

  // After the auto-flip above renders, move focus into the path-override
  // input so the user can start typing without an extra click. Only runs
  // once per error transition (we depend on `recents.isError` flipping
  // and the input being mounted).
  const repoOverrideRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (recents.isError && repoChoice === '__custom__' && repoOverrideRef.current) {
      repoOverrideRef.current.focus();
    }
  }, [recents.isError, repoChoice]);

  const mutation = useMutation({
    mutationFn: ({ source_repo, title: t }: { source_repo: string; title: string }) =>
      createSession({ source_repo, title: t }),
    onSuccess: (response) => {
      // Invalidate the list so the sidebar repaints with the new row right away.
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      onCreated(response.id);
    },
  });

  const trimmedTitle = title.trim();
  const titleError = titleTouched && trimmedTitle.length === 0 ? 'Title is required.' : null;
  const sourceRepo = repoChoice === '__custom__' ? repoOverride.trim() : repoChoice;
  const repoError =
    sourceRepo.length === 0 ? 'Pick a repo or paste an absolute path.' : null;
  const canSubmit =
    trimmedTitle.length > 0 && sourceRepo.length > 0 && !mutation.isPending;

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    setTitleTouched(true);
    if (!canSubmit) return;
    mutation.mutate({ source_repo: sourceRepo, title: trimmedTitle });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label="New session"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-md bg-neutral-900 border border-neutral-700 p-5 text-neutral-100 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>
        <h2 className="text-lg font-semibold mb-4">New session</h2>

        <label className="block text-sm">
          <span className="text-neutral-300">Source repo</span>
          <select
            value={repoChoice}
            onChange={(e) => setRepoChoice(e.target.value)}
            data-testid="repo-select"
            data-recents-state={
              recents.isError
                ? 'error'
                : recents.isLoading
                  ? 'loading'
                  : 'ready'
            }
            className="mt-1 w-full rounded-sm bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-sm text-neutral-100"
          >
            {recents.isLoading ? <option value="">Loading recents…</option> : null}
            {recents.isError ? (
              <option value="" disabled>
                Recents unavailable — paste a path below
              </option>
            ) : null}
            {recents.data?.repos.map((repo) => (
              <option key={repo.path} value={repo.path}>
                {repo.basename} — {repo.path}
              </option>
            ))}
            <option value="__custom__">Paste path…</option>
          </select>
          {recents.isError ? (
            <span
              data-testid="recents-error"
              className="mt-1 block text-xs text-neutral-500"
            >
              Couldn't reach the wrapper daemon. Paste an absolute path
              below to continue.
            </span>
          ) : null}
        </label>

        {repoChoice === '__custom__' ? (
          <label className="block text-sm mt-3">
            <span className="text-neutral-300">Absolute path to repo</span>
            <input
              ref={repoOverrideRef}
              type="text"
              value={repoOverride}
              onChange={(e) => setRepoOverride(e.target.value)}
              placeholder="/Users/you/code/my-project"
              data-testid="repo-override-input"
              className="mt-1 w-full rounded-sm bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-sm font-mono"
            />
          </label>
        ) : null}

        <label className="block text-sm mt-3">
          <span className="text-neutral-300">
            Title <span className="text-red-400">*</span>
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            placeholder="add login screen"
            aria-invalid={titleError !== null}
            className="mt-1 w-full rounded-sm bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-sm"
          />
          {titleError ? (
            <span className="block mt-1 text-xs text-red-400">{titleError}</span>
          ) : null}
        </label>

        <fieldset className="mt-5">
          <legend className="text-xs uppercase tracking-wider text-neutral-500">
            Options
          </legend>
          <div className="mt-3 space-y-1.5 text-sm">
            <OptionCheckbox
              flag="--new"
              description="(create a new source branch first)"
              checked={newBranch}
              onChange={setNewBranch}
              disabled={false}
            />
            <OptionCheckbox
              flag="--github"
              description="(push branch and open a PR)"
              checked={github}
              onChange={setGithub}
              disabled={false}
            />
            <OptionCheckbox
              flag="--public"
              description="(set the GitHub repo public)"
              checked={publicRepo}
              onChange={setPublicRepo}
              disabled={false}
            />
          </div>
        </fieldset>

        {mutation.isError ? (
          <p className="mt-3 text-xs text-red-400" role="alert">
            {(mutation.error as Error)?.message ?? 'Failed to create session.'}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-neutral-700 bg-transparent px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || repoError !== null}
            className="rounded-sm bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface OptionCheckboxProps {
  flag: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}

/**
 * Single options-row in the modal. The flag token (`--new` / `--github` /
 * `--public`) renders as a tinted `<code>` element so it visually pops as a
 * literal token, while the descriptor stays in muted body type. The
 * disabled state grays out both the checkbox AND the flag so the row reads
 * uniformly inert — previously only the checkbox communicated disabled
 * while the flag stayed at full weight.
 */
function OptionCheckbox({
  flag,
  description,
  checked,
  onChange,
  disabled,
}: OptionCheckboxProps): ReactElement {
  return (
    <label
      className={`flex items-center gap-2 ${
        disabled ? 'text-neutral-600' : 'text-neutral-400'
      }`}
      data-testid="option-row"
      data-disabled={disabled ? 'true' : 'false'}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-neutral-200 disabled:opacity-50"
      />
      <span>
        <code
          data-testid="option-flag"
          className={`font-mono ${
            disabled ? 'text-neutral-600' : 'text-cyan-300'
          }`}
        >
          {flag}
        </code>{' '}
        {description}
      </span>
    </label>
  );
}
