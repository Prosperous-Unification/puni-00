import type { ReactNode } from 'react';

export interface AppHeaderProps {
  /**
   * The project controls: the picker, with rename and new folded in beside it.
   *
   * A slot rather than a component of its own, because the picker is three
   * pieces of state deep in `ProjectPage` — the list, the selection, the
   * rename in progress — and hoisting them here to lay a row out would move
   * them further from the page that acts on them.
   */
  project: ReactNode;
  presence: ReactNode;
  account: ReactNode;
}

/**
 * The one bar the app's chrome fits in: brand, project, who else is here, and
 * the account.
 *
 * It replaces five stacked things — an `h1` with a margin, the "Signed in as …"
 * line, a "Projects" heading, the picker's own row and a "Working in …" line —
 * which together took about 190px off the top of every window. That number is
 * the whole reason this exists: what they cost was the table's, and
 * `e2e/header.spec.ts` measures what it got back.
 *
 * **One row is a claim this bar has to keep at every width in the fit matrix**,
 * and the layout is what keeps it rather than a hope: the brand and the two
 * fold-in buttons are `shrink-0`, the picker takes the slack with a `max-w`,
 * and the roster inside {@link import('../presence/presence-panel').PresencePanel}
 * is clipped rather than allowed to grow with the number of people. Nothing
 * here wraps. `keeps the header to one row at every laptop width` is the
 * assertion; the toolbar underneath still wraps, deliberately, and that is the
 * other spec's.
 *
 * It is a `<header>` outside `<main>` so it is a `banner` landmark — which is
 * what a browser test can find the bar by, and what a screen reader gets to
 * skip. Inside `<main>` the same element is no landmark at all.
 */
export function AppHeader({ project, presence, account }: AppHeaderProps): React.JSX.Element {
  return (
    <header className="border-border bg-background flex shrink-0 items-center gap-3 border-b px-4 py-1">
      <h1 className="shrink-0 text-sm font-semibold tracking-tight">WBS tool v2</h1>
      {project}
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {presence}
        {account}
      </div>
    </header>
  );
}
