import type { ReactElement } from 'react';

/**
 * Minimal shimmer block. Tailwind's `animate-pulse` + a dimmed background
 * is enough — we don't pull in a skeleton library for two screens worth
 * of placeholders.
 *
 * Use `<Skeleton className="h-4 w-32" />` to control the rendered size;
 * an extra `rounded` is layered on by default and can be replaced via the
 * caller's `className` (Tailwind's last-wins merge handles overrides on
 * the same property).
 */
export interface SkeletonProps {
  /** Extra classes to set size, shape, and spacing for the shimmer block. */
  className?: string;
  /** Optional accessible label; defaults to `Loading…`. */
  ariaLabel?: string;
}

export function Skeleton({
  className = '',
  ariaLabel = 'Loading…',
}: SkeletonProps): ReactElement {
  return (
    <div
      data-testid="skeleton"
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={`animate-pulse bg-zinc-800/50 rounded ${className}`}
    />
  );
}

/**
 * A small group of stacked skeleton rows — handy for list-style placeholders
 * (sidebar items, tab list rows). `count` defaults to 3.
 */
export interface SkeletonListProps {
  count?: number;
  rowClassName?: string;
  containerClassName?: string;
}

export function SkeletonList({
  count = 3,
  rowClassName = 'h-10 w-full',
  containerClassName = 'space-y-2 p-3',
}: SkeletonListProps): ReactElement {
  return (
    <div data-testid="skeleton-list" className={containerClassName}>
      {Array.from({ length: count }).map((_, idx) => (
        <Skeleton key={idx} className={rowClassName} />
      ))}
    </div>
  );
}
