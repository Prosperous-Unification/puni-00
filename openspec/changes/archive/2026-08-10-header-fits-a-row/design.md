# Design

Two things here are not obvious: **which component lays the bar out**, given
that the picker's state is three `useState`s deep in a page, and **why the
frame's height is a flex remainder rather than the viewport arithmetic it
replaces** — including one thing about `100vh` that only a browser said.

## Who lays out the bar

The bar holds four things owned by three different places: the brand (nobody's),
the project picker (`ProjectPage`'s — the list, the selection, the rename in
progress and the search overlay are four pieces of state that only it has), and
presence and the account (`App`'s — both need the session).

Three arrangements were possible.

| arrangement                                                 | what it costs                                                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App` lays out the bar, project state hoisted into it       | `load`, `create`, `commitOrCancelRename`, the remembered id and the picker's overlay all move up. Twenty tests in `project-page.test.tsx` follow them. A refactor `X` is for. |
| `App` lays out the bar, `ProjectPage` portals its picker in | A DOM portal into a sibling landmark, so the markup no longer says where anything is. Clever, and unreadable at the next change.                                              |
| **`ProjectPage` lays out the bar, `App` passes two nodes**  | The page that owns the widest control owns the row it sits in; what belongs to the session arrives as `presence` and `account`. **Chosen.**                                   |

The two props are `ReactNode` rather than the components themselves, and that is
not a style preference: `PresencePanel` opens a gateway socket on mount, so a
page that constructed its own would open one in every test that renders the page
— twenty of them, against a gateway that is not running.

`ProjectPage` returns a fragment: the `<header>` and then `<main>`. The header
has to be **outside** `<main>` or it is not a `banner` landmark at all, which is
what a browser test finds the bar by and what a screen reader gets to skip.

## The frame's height

`TABLE_FRAME` was `maxHeight: calc(100vh - 16rem)`, and `16rem` was an estimate
of the chrome above it. Estimates are wrong in both directions and this one was
wrong in both: at 1280×800 the frame stopped **112px above the bottom of the
window** while the page scrolled **196px** vertically behind it, because the real
chrome was 340px rather than 256.

It is now `flex: 1 1 0%` in a chain that starts at the window:

```
<div class="flex h-full flex-col">          app.tsx      — one window tall
  <header class="shrink-0">                 app-header   — takes what it needs
  <main class="flex min-h-0 flex-1 flex-col">project-page — takes the rest
    <section class="flex min-h-0 flex-1 flex-col">wbs-table
      <div class="mb-1.5 shrink-0">          the toolbar, which still wraps
      <div data-table-frame style={TABLE_FRAME}>  — 1 1 0%: whatever is left
```

Every link is load-bearing and each one fails differently:

- **`min-h-0`** on the two middle boxes. A flex item's `min-height` is `auto`,
  which refuses to shrink below its content — so without it the chain falls back
  to the table's own height, the frame never scrolls, and the sticky heading row
  rides up the page. That is the failure `table-frame.ts` has always described.
- **`flex-basis: 0`** rather than `auto` on the frame. With `auto` the basis is
  the frame's content, and "the remainder" becomes "the content, shrunk if it
  has to be", which is the same estimate one layer along.
- **`h-full`, not `h-screen`.** This is the one a browser had to say. `vh` is a
  fraction of the initial containing block and **CSS `zoom` does not scale it**:
  at `html { zoom: 1.25 }` — the proxy both browser specs read 125% through —
  `100vh` is still 800 units, which paint as 1000px in an 800px window and
  scroll the page by exactly 200. Measured. A percentage resolves against the
  real box at every zoom, so `styles.css` gives `html`, `body` and `#root` a
  height of 100% and the app's wrapper is `h-full`.
- **Nothing hides the overflow.** A window too short for the frame's `minHeight`
  leaves the page scrolling, which is the honest fallback; clipping would put
  rows below a fold nothing could reach.

The unit test can only read the declaration back. That the declaration produces
669px of frame at 1280×800, where the estimate produced 544, is
`e2e/header.spec.ts`'s — only a browser lays a flex chain out.

## What the one-row check can and cannot see

`keeps the header to one row` reads two numbers, and it reads two because the
first one alone is a check that cannot fail for this bar.

The bar is `flex-nowrap`. A `flex-nowrap` row with too much in it does not become
two rows — it runs past its own right edge. So the wrap oracle (content height
against the tallest child) stayed green under `flex-wrap` **and** a doubled
brand, watched. `scrollWidth - clientWidth` is the half that sees the real mode,
and it took three added controls to move it: the picker and the roster give way
first, which is about 460px of slack at 900 and is the design working.

Both halves are kept. The wrap half is not decoration — it is what sees the
`flex-wrap` somebody adds to "fix" an overfull bar, which would push the toolbar
and the table down instead.
