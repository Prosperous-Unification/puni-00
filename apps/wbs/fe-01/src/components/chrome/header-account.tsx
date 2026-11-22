import { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react';

import { useViewportWidth } from '@/lib/viewport-width';

import { useClosedOnDismiss } from '../wbs/close-on-dismiss';

/**
 * One persistent account/presence subtree: a compact native disclosure below 768px,
 * the existing inline row above it. The opaque account slot retains its authority owner.
 * Wide content is not registered as a dismissible peer. Breakpoint focus moves only
 * when its current owner would become hidden; the stable group is the wide focus target.
 */
export function HeaderAccount({
  presence,
  account,
}: {
  presence?: ReactNode;
  account: ReactNode;
}): React.JSX.Element {
  const compact = useViewportWidth() < 768;
  const closeOnDismiss = useClosedOnDismiss();
  const disclosure = useRef<HTMLDetailsElement | null>(null);
  const summary = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const previousCompact = useRef(compact);
  const rememberDisclosure = useCallback(
    (node: HTMLDetailsElement | null): void => {
      disclosure.current = node;
      if (compact) closeOnDismiss(node);
    },
    [compact, closeOnDismiss],
  );

  useLayoutEffect(() => {
    const panel = disclosure.current;
    const trigger = summary.current;
    const contents = content.current;
    if (panel === null || trigger === null || contents === null)
      throw new Error('The mounted header account disclosure is incomplete');
    const changed = previousCompact.current !== compact;
    previousCompact.current = compact;
    if (!changed) return;
    const focused = document.activeElement;
    panel.open = !compact;
    if (compact && contents.contains(focused)) trigger.focus();
    else if (!compact && focused === trigger) contents.focus();
  }, [compact]);

  return (
    <details
      ref={rememberDisclosure}
      open={!compact}
      data-header-account
      className="relative ml-auto min-w-0 shrink-0"
    >
      <summary
        ref={summary}
        aria-label="Account and organization"
        className="border-control-edge bg-background text-foreground hover:bg-accent focus-visible:ring-ring flex size-11 cursor-pointer list-none items-center justify-center rounded-md border outline-none focus-visible:ring-2 md:hidden [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="size-5"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      </summary>
      <div
        ref={content}
        role="group"
        aria-label="Account and organization controls"
        tabIndex={-1}
        className="border-border bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-1 flex w-max max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 rounded-md border p-2 shadow-md outline-none md:static md:mt-0 md:max-w-none md:flex-row md:items-center md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
      >
        {presence}
        {account}
      </div>
    </details>
  );
}
