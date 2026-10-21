import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts in favour of the last one.
 *
 * `clsx` does the joining (strings, arrays, conditional objects) and
 * `tailwind-merge` the resolving: `cn('px-2', 'px-4')` is `px-4`, not both.
 * That second half is what every kit primitive relies on when a caller passes
 * `className` over a variant table — the caller's `border-0` has to beat the
 * variant's `border`, and plain concatenation would leave the stylesheet's
 * order to decide. The one `cn` for every kit lives here so the merge rules
 * cannot drift between two copies.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
