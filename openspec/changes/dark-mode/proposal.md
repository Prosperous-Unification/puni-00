<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`styles.css` has carried a whole `.dark` token set since the scaffold, and
nothing has ever put that class on the document: no control, no
`prefers-color-scheme` rule, no remembered answer. A reader whose machine is set
to dark gets the light page anyway.

Forcing the class by hand shows why it was never shipped, and the reason all but
one of the defects share is that the root declares no `color-scheme`. Without it
the browser still thinks a near-black page is a light one and paints its own
defaults for it: an unstyled `<button>` takes the light `ButtonFace`,
`rgb(239, 239, 239)`, so the Gantt's row labels and `Log out` measure
**1.10:1**, and an unstyled link takes `-webkit-link` blue at **2.14:1**. The
one defect that is nobody's default is the deps picker's option list, a
hard-coded `#fff` card at **1.05:1**.

Declaring `color-scheme` fixes the ratios by itself — the same unstyled button
then reads at 5.13:1 and the same link at 8.0:1 — and leaves both surfaces
painted colours the palette does not name. Those are worth removing on their own
terms, and the checks that cover them say so rather than pretending to be about
contrast; a first draft that asserted them as ratios could not fail.

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
