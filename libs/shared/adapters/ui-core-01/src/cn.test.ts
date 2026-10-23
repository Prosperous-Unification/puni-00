import { describe, expect, it } from 'bun:test';

import { cn } from './cn';

describe('cn', () => {
  it('joins conditional inputs the way clsx does', () => {
    expect(cn('a', { b: true, c: false }, ['d'])).toBe('a b d');
  });

  it('lets a later Tailwind utility beat an earlier one in the same group', () => {
    // Proof: with `twMerge` removed and `clsx` alone, this read `border border-0` (2026-10-21).
    expect(cn('border px-2', 'border-0 px-4')).toBe('border-0 px-4');
  });

  it('keeps utilities from different groups', () => {
    expect(cn('rounded-md', 'text-sm')).toBe('rounded-md text-sm');
  });
});
