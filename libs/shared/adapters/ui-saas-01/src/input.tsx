import { cn } from '@ui/core-01';
import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * A native input's attributes, nothing more.
 *
 * Hyphenated `data-*` props pass without being declared here, since TypeScript
 * does not check a JSX attribute whose name is not an identifier; that is how
 * WBS's tool hints and project facts (`data-hint`, `data-fact-lead`) ride on a
 * kit input without the kit knowing about either.
 */
export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * A chrome text box.
 *
 * Chrome only, for {@link import('./button').Button}'s reason: an input inside
 * the WBS table is a cell, the host app's scoped reset does not reach it, and
 * that table's columns were sized around what a browser draws unaided.
 *
 * `w-full` is the registry's default and is kept, so this box fills whatever
 * it is put in. The places that need a narrower one — WBS's Find box and project
 * picker — pass a width class of their own rather than this component
 * growing a `size` variant nobody else would use.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
