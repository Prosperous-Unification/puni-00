import { Link } from '@tanstack/react-router';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The pages of the signed-in region, and a mark on the one that is showing.
 *
 * Real links rather than buttons that navigate: an address is the whole reason
 * `docs/adr/0004-the-signed-in-region-gets-a-router.md` exists, and a `<button>`
 * cannot be middle-clicked, copied, or opened in a second tab.
 *
 * `aria-current="page"` is the router's own doing — `Link` stamps it on the
 * active one, and that is the whole reason these are `Link`s rather than
 * anchors with an `href`. There is deliberately **no** `activeOptions={{ exact:
 * true }}` on the plan's link: `/` and `/directory` are siblings under the root
 * route rather than parent and child, so `Link` never reads the plan as active
 * on the directory. The option was written, and removing it was watched
 * changing nothing — a guard whose failure cannot be observed is a claim, so it
 * is not here. `app-router.test.tsx`'s `marks only the page that is showing`
 * asserts both ends of the mark and was watched failing against a plain anchor.
 */
export function PageNav({ organization = false }: { organization?: boolean }) {
  // `text-foreground` because these are `<a href>`s: `buttonVariants` names no
  // colour for `ghost` at rest, and `styles.css`'s reset gives `color: inherit`
  // to form controls and not to links — so each of these kept whatever the user
  // agent paints an unstyled link, which is not a token and never was.
  //
  // Which colour that is depends on `color-scheme`, and both were measured.
  // With none declared it was `-webkit-link` blue, `rgb(0, 0, 238)`, at 2.14:1
  // against the dark `--background` — all but gone. With `color-scheme: dark`
  // in place it is `rgb(158, 158, 255)` at 8.0:1, which is legible and still
  // wrong: a periwinkle in a header whose every other word is `--foreground`.
  // So this is not a contrast fix and `dark-mode.spec.ts` does not assert it as
  // one — it asserts the link is the palette's own ink, which is a claim that
  // can fail. Both numbers: `openspec/changes/dark-mode/verify.md`.
  //
  // The mark is keyed on `aria-current`, the attribute the router stamps: a
  // 2px bar in the ink along the link's foot, as a tab is marked (square
  // there, so the bar runs straight; no weight change, which would move the
  // links beside it from page to page). A bar rather than the pressed
  // toggle's fill, because the project's Plan · Board toggle stands in the
  // same header filled, and a filled page and a filled view read as one control. The ink stands far above 3:1 on the
  // header in both palettes. It was `activeProps` naming `bg-accent`, which
  // never painted — `buttonVariants`' `bg-transparent` came later in the
  // stylesheet — and would have stood 1.07:1 off white if it had (UI review
  // F-155). `no-underline` because these are shaped as the header's buttons,
  // and no button in it is underlined.
  const shape = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'text-foreground shrink-0 no-underline max-md:min-h-11',
    'aria-[current=page]:rounded-b-none aria-[current=page]:shadow-[inset_0_-2px_0_var(--foreground)]',
  );
  return (
    <nav aria-label="Pages" className="flex shrink-0 items-center gap-1">
      {/*
        `Project`, the page: what it shows is one project, as its Plan or its
        Board. Named `Plan` it was a third control of that name in one header,
        and on the Board it was marked current beside an unpressed `Plan`
        toggle (UI review F-169). Proof: named `Plan`, `header.spec.ts` `names
        the page so that the nav and the Plan · Board toggle agree on the Board`
        failed on `Expected: 0 · Received: 1` (watched 2026-10-18).
      */}
      <Link to="/" className={shape}>
        Project
      </Link>
      <Link to="/directory" className={shape}>
        Directory
      </Link>
      <Link to="/spaces" className={shape}>
        Spaces
      </Link>
      {organization && (
        <Link to="/organization" className={shape}>
          Organization
        </Link>
      )}
    </nav>
  );
}
