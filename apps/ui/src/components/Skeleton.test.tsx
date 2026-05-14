import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Skeleton, SkeletonList } from './Skeleton.js';

describe('Skeleton', () => {
  it('renders a single shimmer block with default classes', () => {
    render(<Skeleton />);
    const node = screen.getByTestId('skeleton');
    expect(node).toBeInTheDocument();
    expect(node.className).toContain('animate-pulse');
    expect(node.className).toContain('bg-zinc-800/50');
    expect(node.className).toContain('rounded');
  });

  it('merges caller className for sizing', () => {
    render(<Skeleton className="h-8 w-32" />);
    const node = screen.getByTestId('skeleton');
    expect(node.className).toContain('h-8');
    expect(node.className).toContain('w-32');
  });

  it('uses aria-busy for assistive tech', () => {
    render(<Skeleton ariaLabel="Loading sessions" />);
    const node = screen.getByTestId('skeleton');
    expect(node).toHaveAttribute('aria-busy', 'true');
    expect(node).toHaveAttribute('aria-label', 'Loading sessions');
  });
});

describe('SkeletonList', () => {
  it('renders 3 rows by default', () => {
    render(<SkeletonList />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
  });

  it('renders the requested count', () => {
    render(<SkeletonList count={5} />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(5);
  });
});
