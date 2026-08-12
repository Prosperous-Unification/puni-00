<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`styles.css` has carried a whole `.dark` token set since the scaffold, and
nothing has ever put that class on the document: no control, no
`prefers-color-scheme` rule, no remembered answer. A reader whose machine is set
to dark gets the light page anyway.

Forcing the class by hand shows why it was never shipped. Three surfaces are
unreadable in dark, and two of them are one fault: a `<button>` naming no
background keeps the user agent's `ButtonFace`, `rgb(239, 239, 239)`, which
follows no token. The Gantt's row labels and `Log out` measure **1.10:1**. The
header's page links are `-webkit-link` blue at **2.14:1**, and the deps picker's
option list is a hard-coded `#fff` card at **1.05:1**.

## What Changes

**A theme setting**

- From: no setting; the palette is whatever `styles.css` defaults to
- To: three answers — system, light, dark — remembered per browser in
  `wbs.theme`, applied as `.dark` on the root, with `system` following
  `prefers-color-scheme` live while the page is open
- Impact: non-breaking; a browser that has never answered starts on `system`

**A control in the account menu**

- From: the menu holds `Log out` alone
- To: one row of three `menuitemradio`s above it, reached by the arrows
- Impact: the menu still opens onto `Log out`

**The dark palette's own defects**

- From: three surfaces painted colours no token names
- To: every surface takes its colour from the palette, and `color-scheme`
  follows the class so native scrollbars, carets and date pickers do too
- Impact: light is unchanged, except that a raw `<button>` no longer paints
  itself grey

## Non-Goals

- No per-project or per-account theme. A palette answers about this screen.
- No third palette, no accent colours, no contrast-preference support.
- No change to what any surface is for — only to the colour it is painted.

## Constraints

- The class must be on the root before the first paint, or a remembered dark
  page flashes white on every load. React mounts one paint too late.
- `color-scheme` is declared beside the tokens, not written from JavaScript: a
  second declaration of the palette can disagree with the class.
- Contrast is a browser fact. jsdom computes no colours (R5 #14–16).

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the app has a remembered theme choice, offered in the account
  menu, and the dark palette is legible everywhere the light one is

## Domain Terms

`Theme choice` and `Palette`, added to `CONTEXT.md`.

## Decisions Recorded

none — reversible. The alternatives (a two-state switch, a settings page) were
rejected on the constraints above.

## Impact

`apps/fe-01` only: `lib/theme.ts` and `chrome/theme-choice.tsx` (new),
`account-menu.tsx`, `app.tsx`, `page-nav.tsx`, `styles.css`, `index.html`, the
deps picker's inline styles in `wbs-table.tsx`, `vitest.setup.ts`, and the
browser gate. No be-01, no gw-01, no migration, no deploy step.
