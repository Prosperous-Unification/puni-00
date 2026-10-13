import type { ReactNode } from 'react';

export interface AppHeaderProps {
  /**
   * The way between the two pages, and the mark on the one that is showing.
   *
   * On both pages and identical on both, which is why it comes from router
   * context rather than from either page.
   */
  nav?: ReactNode;
  /**
   * The project controls: the picker, with rename and new folded in beside it.
   *
   * A slot rather than a component of its own, because the picker is three
   * pieces of state deep in `ProjectPage` — the list, the selection, the
   * rename in progress — and hoisting them here to lay a row out would move
   * them further from the page that acts on them.
   *
   * Optional because the directory page has none: a control that belongs to a
   * project is **absent** off the project rather than drawn dead.
   */
  project?: ReactNode;
  /** Who else is in the project. Absent off the project, for the same reason. */
  presence?: ReactNode;
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
 * **Below 900px it is two rows, and from 900 it is one.** Row one is the
 * pages and the account (with who else is here); row two is the project
 * controls, which take `order-last basis-full` there — so a phone and a narrow
 * tablet read the same bar, and a page with no project (Directory, Spaces) is
 * one row at every width rather than a row of pages over a band holding only
 * the account (UI review F-047). It was three rows on a phone — brand and
 * pages, project, then presence and account — 137px before the plan began
 * (F-010).
 *
 * **One row from 900 is a claim this bar has to keep, and a readable picker is
 * the other half of it** (F-011). Through 2026-10-13 the row was kept by the
 * picker giving way to nothing: at 1024 it showed `PUN`, at 900 it was 0px
 * wide, and the roster beside the account clipped to the first letter of a
 * name. The picker now has a floor (`min-w-36`, with an ellipsis), and the bar
 * makes the room by three things that collapse at named breakpoints instead:
 * the brand is visually hidden below `lg` (it stays the page's `h1`), the two
 * project buttons say `Rename` and `New project` below `xl`, and the roster
 * collapses to a dot and a count below `xl`
 * ({@link import('../presence/presence-panel').PresencePanel}). The fit is
 * measured in `e2e/header.spec.ts` at 1280, 1024 and 900.
 *
 * It is a `<header>` outside `<main>` so it is a `banner` landmark — which is
 * what a browser test can find the bar by, and what a screen reader gets to
 * skip. Inside `<main>` the same element is no landmark at all.
 */
export function AppHeader({ nav, project, presence, account }: AppHeaderProps): React.JSX.Element {
  return (
    <header className="border-border bg-background flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1 min-[900px]:flex-nowrap">
      <h1 className="shrink-0 text-sm font-semibold tracking-tight max-lg:sr-only">WBS tool v2</h1>
      {nav}
      {project}
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {presence}
        {account}
      </div>
    </header>
  );
}
