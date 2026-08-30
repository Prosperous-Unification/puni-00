<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The printer, beside the parser

- [x] 1.1 `estimate-draft.ts`: `showTrio(days)` prints a stored estimate as the shorthand that would type it — `2/3/8`, `5` where all three agree, `''` where there is none — test: `estimate-draft.test.ts` `prints a trio as the shorthand that types it`, `collapses three equal points to the one number that stores them`, `says nothing about an estimate that does not exist`.
- [x] 1.2 The round trip, as a property over the cases the parser already has: `parseTrioShorthand(showTrio(d))` yields `d` — test: `what it prints is what the parser reads back`; negative: the collapse written as `String(optimistic)` for any trio whose optimistic point is smallest, watched failing on the trio it would have thrown away.

## 2. The table's folded cell

- [x] 2.1 `combinedValue` returns the stored shorthand rather than the final figure — test: `wbs-table.test.tsx` `keeps the trio in the cell once the estimate lands`, `takes one number as the estimator saying all three are the same` (now reading `5` back), and the existing `goes back to showing be-01's final figure once the trio lands` rewritten as the trio; negative: `showFinal` put back, watched failing.
- [x] 2.2 The derived figure beside the box, muted, `data-folded-final` — shown only where it differs from the shorthand, read off the row and not off the draft — test: `stands the PERT figure beside the trio it came from`, `says a flat trio once`, `keeps the stored figure beside a half-typed cell`; negatives: the difference test dropped (watched failing on `5 · 5`), and the figure read through `combinedValue` (watched failing on the half-typed case).
- [x] 2.3 A rolled-up parent's folded cell reads the same shape — the summed trio, with its figure beside it — test: `reads a parent's roll-up as a trio too`.

## 3. The phone card

- [x] 3.1 The card's figure box shows the shorthand (it already reads `combinedValue`) and grows the same muted figure beside it — test: `plan-cards.test.tsx` `keeps the trio in the phase box`, `stands the derived figure beside it`; negative: the span removed, watched failing.

## 4. Geometry, in a browser

- [x] 4.1 Chromium at 1280: a row whose folded cell holds `2/2/3 · 2.2` with an assignee is the same height as an unestimated row, and nothing in the cell runs past it — `e2e/layout.spec.ts`; negative: the wrapper's `flex` swapped for `block` so the figure wraps under the box, watched failing on the height. **jsdom computes no layout and cannot be this test's oracle** (`AGENTS.md`, R5 #14/#15).

## 5. Words and gate

- [x] 5.1 `CONTEXT.md`: **Trio shorthand** is what the cell shows as well as what it takes.
- [x] 5.2 `bunx nx run fe-01:{test,lint,typecheck}`, prettier, `openspec validate --all --json`, and the browser specs touched on `E2E_PORT_SHIFT=1000`.

## Notes on 4.1 and 5.2

- 4.1's browser case grew a second measurement while it was being written: the
  seeded `2/3/8 · 3.7` and `20/24/30 · 24.3`. The first fits at any type; the
  second is what made the figure's 10px load-bearing. See `verify.md`.
- 5.2 ran on `E2E_PORT_SHIFT=1001`, not 1000. 1000 maps gw-01 onto 4200, which
  is fe-01's own default port and was held by a running dev server. Same band,
  no collision; `verify.md` has the detail.
