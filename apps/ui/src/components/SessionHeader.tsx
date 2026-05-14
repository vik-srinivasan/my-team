import type { ReactElement } from 'react';
import { effectivePhase } from '@my-team/shared/format';
import type { SessionDetail } from '@my-team/shared/types';

import { phaseDotClass } from './SidebarItem.js';
import { SessionActions } from './SessionActions.js';

export interface SessionHeaderProps {
  session: SessionDetail;
}

/**
 * Top-of-workspace strip. Shows the title, ID, current phase chip, and
 * branch/repo metadata. The PR-link button called out in the spec is
 * deferred until the wrapper exposes `.team/pr.url` — see decisions log.
 */
export function SessionHeader({ session }: SessionHeaderProps): ReactElement {
  const phase = effectivePhase({
    phase: session.state.phase,
    active_specialist: session.state.active_specialist,
  });
  const meta = session.meta;

  return (
    <header
      data-testid="session-header"
      className="border-b border-neutral-800 bg-neutral-950 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2 rounded-full shrink-0 ${phaseDotClass(phase)}`}
            />
            <h1 className="text-base font-semibold text-neutral-100 truncate">
              {meta.title}
            </h1>
            <span className="rounded-sm bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
              {phase}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 font-mono">
            <span>{meta.id}</span>
            <span className="text-neutral-700">·</span>
            <span title={meta.source_repo}>{shortRepo(meta.source_repo)}</span>
            <span className="text-neutral-700">·</span>
            <span title={`${meta.source_branch} → ${meta.session_branch}`}>
              {meta.source_branch} → {meta.session_branch}
            </span>
          </div>
        </div>
        <SessionActions session={session} />
      </div>
    </header>
  );
}

/** Last two path components of the source repo for a compact display. */
function shortRepo(repoPath: string): string {
  const parts = repoPath.split('/').filter(Boolean);
  if (parts.length <= 2) return repoPath;
  return `…/${parts.slice(-2).join('/')}`;
}
