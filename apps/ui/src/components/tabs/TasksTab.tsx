import type { ComponentPropsWithoutRef, ReactElement } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSessionSocket } from '../SessionContext.js';
import { EmptyState, markdownComponents } from '../../lib/markdown.js';

/**
 * Live view of `.team/tasks.md`.
 *
 * `remark-gfm` parses `- [ ]` / `- [x]` into a `<ul class="contains-task-list">`
 * containing `<li class="task-list-item"><input disabled type="checkbox" [checked]>`.
 * The default native checkbox is read-only and visually washed-out against
 * our dark surface, so we:
 *
 *   - drop the `<input>` entirely (`input: () => null`),
 *   - detect task rows via the `node.properties.className` on `li` (since
 *     `react-markdown` v9 doesn't surface the `checked` prop directly on
 *     custom `li` components — that was a v6 API), and
 *   - prepend a styled glyph that mirrors how `team tasks` renders in the
 *     terminal (filled square = done, empty square = open).
 *
 * Non-task lists (regular bullets) keep the default bullet styling from
 * `markdownComponents`.
 */
type LiProps = ComponentPropsWithoutRef<'li'> & ExtraProps;

interface HastProperties {
  className?: ReadonlyArray<string> | string;
  checked?: boolean;
  [key: string]: unknown;
}

interface HastElementLike {
  type: 'element';
  tagName: string;
  properties?: HastProperties;
  children?: HastNodeLike[];
}

interface HastTextLike {
  type: 'text';
  value: string;
}

type HastNodeLike = HastElementLike | HastTextLike;

/**
 * Read the `task-list-item` class off a hast `li` element and, if present,
 * extract the `checked` boolean from its first `<input>` child.
 *
 * Exported so `TasksTab.test.tsx` can exercise the discriminator without
 * rendering through react-markdown.
 */
export function readTaskState(node: HastElementLike | undefined): {
  isTask: boolean;
  checked: boolean;
} {
  if (node === undefined || node.tagName !== 'li') {
    return { isTask: false, checked: false };
  }
  const cls = node.properties?.className;
  const classes = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(' ') : [];
  if (!classes.includes('task-list-item')) {
    return { isTask: false, checked: false };
  }
  // The first element child is the disabled <input type="checkbox"> remark-gfm
  // emits. Its `checked` hast property is the source of truth for `[x]` vs `[ ]`.
  const input = (node.children ?? []).find(
    (c): c is HastElementLike => c.type === 'element' && c.tagName === 'input',
  );
  const checked = input?.properties?.checked === true;
  return { isTask: true, checked };
}

function CheckboxGlyph({ checked }: { checked: boolean }): ReactElement {
  return (
    <span
      aria-hidden
      role="presentation"
      data-checked={checked}
      data-testid={checked ? 'task-checkbox-checked' : 'task-checkbox-unchecked'}
      className={`mr-2 inline-flex size-4 shrink-0 -translate-y-px items-center justify-center rounded-sm border align-middle ${
        checked
          ? 'border-green-500 bg-green-500/15 text-green-400'
          : 'border-neutral-600 bg-transparent text-transparent'
      }`}
    >
      {checked ? (
        <svg
          viewBox="0 0 14 14"
          fill="none"
          className="size-3"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 7.5 6 10.5 11 4.5" />
        </svg>
      ) : null}
    </span>
  );
}

const tasksComponents: Components = {
  ...markdownComponents,
  // Hide the disabled native checkbox emitted by remark-gfm — we render our
  // own glyph below.
  input: () => null,
  li: ({ children, node, ...rest }: LiProps) => {
    const { isTask, checked } = readTaskState(
      // `node` is typed as `Element` from `hast` but the actual shape matches
      // our `HastElementLike` interface. Cast through `unknown` to avoid
      // pulling the full hast type into UI code.
      node as unknown as HastElementLike | undefined,
    );
    if (isTask) {
      return (
        <li
          {...rest}
          data-task-status={checked ? 'done' : 'open'}
          className="flex items-start gap-1 leading-relaxed list-none -ml-5"
        >
          <CheckboxGlyph checked={checked} />
          <span className={checked ? 'text-neutral-500 line-through' : 'text-neutral-200'}>
            {children}
          </span>
        </li>
      );
    }
    return (
      <li {...rest} className="leading-relaxed">
        {children}
      </li>
    );
  },
};

export function TasksTab(): ReactElement {
  const { teamFiles } = useSessionSocket();
  const content = teamFiles.tasks ?? '';

  if (content.trim() === '') {
    return <EmptyState>No tasks yet.</EmptyState>;
  }

  return (
    <div className="h-full overflow-auto px-6 py-4">
      <article className="mx-auto max-w-3xl">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={tasksComponents}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
