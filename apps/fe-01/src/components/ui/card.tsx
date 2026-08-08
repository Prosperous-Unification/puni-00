import { type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * A panel with a border and a shadow, for chrome that stands apart from the
 * page rather than flowing down it.
 *
 * The auth screen is what it was vendored for: a signed-out page whose only
 * content is one form reads as unfinished when that form is loose on a white
 * background.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-card text-card-foreground rounded-lg border shadow-sm', className)}
      {...props}
    />
  );
}

/** The card's heading block. */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-0', className)} {...props} />;
}

/** The card's title. A heading level is the caller's to pick, so this is a `div`. */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-lg leading-none font-semibold', className)} {...props} />;
}

/** The sentence under the title. */
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

/** The card's body. */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}

/** The card's actions, along the bottom. */
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 p-6 pt-0', className)} {...props} />;
}
