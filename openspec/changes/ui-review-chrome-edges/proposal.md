# One edge for controls, one for surfaces, and no platform frames

## Why

Round 6 of the UI review (puni-plan `ui-review/findings.md`) found the chrome's
edges drawn by three different rules. Outline buttons drew the 3:1
`--control-edge` while the toolbar's disclosures, selects and text boxes kept the
1.2:1 `--input` hairline (F-152, F-137). Bare buttons and fieldsets kept the
platform's bevel and groove (F-153). A bare `border` drew in the text's ink, so
cards, popovers and dialogs wore the brightest line on the dark page (F-154). The
header's page links marked no current page and kept the link underline (F-155).
On a phone, the Plan · Board · Plan actions row mixed 12px and 14px words (F-160)
and the Plan actions sheet started its labels at two x positions (F-161).

## What Changes

- `--input` is retired: every control box (button, text box, select, summary)
  draws `--control-edge`, at least 3:1 against its ground in both palettes.
- The base layer gives every border outside the grid `--border` as its default
  colour, and zeroes the platform's frame on bare `button` and `fieldset`. Every
  control that relied on the old defaults (phone card sheets, onboarding,
  organization choice, the Board, sign-out failure, the Gantt marker list and
  the fault cards' Reload) names its edge or is a `<Button>`.
- The current page's header link carries a 2px ink bar; no page link is
  underlined.
- The phone's view toggle takes Plan actions' 14px.
- Every Plan actions row reserves a glyph column, so every label starts at one x.

## Non-goals

- The card face and the grid keep their own edges: the base layer's guard stops
  at `[data-grid]`, and `[data-plan-cards] button` keeps `--border` (F-170). The
  card's sheets render outside the grid and are on the control edge.
- No change to the Gantt strip's metrics (decision D5); only its edge colour.

## Impact

`apps/wbs/fe-01` only: `styles.css`, `components/chrome/page-nav.tsx`,
`components/ui/{button,input,control}`, every chrome file that named
`border-input`, `components/wbs/{plan-toolbar,project-page,gantt-panel}.tsx`.
