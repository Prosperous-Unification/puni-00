# The chrome fits one row, and the table gets the rest

## Why

Five stacked things sat above every plan: a brand heading, a "Signed in as …"
line, a "Projects" heading, the picker's own row and a "Working in …" line. They
cost about 190px of every window, and the table's frame did not even get that
back — it was capped at `calc(100vh - 16rem)`, an estimate of the chrome written
in `table-frame.ts` with its own comment calling it approximate. Measured at
1280×800 on `F shadcn-foundation`: the frame is **544px**, it stops 112px short
of the bottom of the window, and the page scrolls vertically by 196px behind it.

This is `H header-fits-a-row` in
`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`, and Dany's **P2.1**.

## What Changes

**One bar.** Brand, the project picker with rename and new folded in beside it,
who else is online, and an account menu replacing the "Signed in as / Log out"
pair. It is a `<header>` outside `<main>`, so it is a landmark. Rename and New
project become icon buttons keeping the accessible names eleven tests find them
by.

**The `16rem` dies.** `<main>` down to the frame is one column-flex chain, and
the frame takes the real remainder with `flex: 1 1 0%`. The page is one window
tall by percentage rather than by `100vh`, which CSS `zoom` does not scale.

**Assertions where there were none.** Nothing in the repository named the
presence panel's heading, the log-out control, or the page's landmarks. The
change that moves them writes them, per `F`'s rule.

## Non-Goals

- **No reconnect for presence.** The socket still does not come back; the
  caveat moves into the header unchanged and is pinned by a test.
- **No new face.** `--font-sans` stays `sans-serif`. `F` left the re-measure of
  `not-before` to whichever change moves the type; this one does not move it.
- **No change to the toolbar's wrapping**, which `T` and `F` both kept.
- **No Radix menu.** The account menu is hand rolled, like the grid's ⋯ menu.

## Capabilities

### Modified Capabilities

- `frontend-foundation`: the chrome is one header bar and the table's frame is
  the window's remainder.

## Domain Terms

- header bar
- account menu

## Decisions Recorded

`design.md` — why the page that owns the picker lays out the bar, and why the
frame's height is a flex remainder rather than a viewport calculation.

## Impact

fe-01 only. `app.tsx`, `project-page.tsx`, `presence-panel.tsx`,
`wbs-table.tsx`'s toolbar, `table-frame.ts`, `styles.css`, two new files under
`src/components/chrome/`. No new dependency, no be-01 change, no migration.
