<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The strip, in jsdom

- [x] 1.1 `wbs-table.tsx`: the chips and the box move into an inner strip
      (`data-depends-strip`) inside the deps wrapper — `overflow: hidden` and
      the unconditional edge fade always; one nowrap flex line at rest,
      wrapping as before while the picker owns the cell; chip spacing moves
      from the chips' CSS margin to the strip's `gap` (`styles.css`); the
      wrapper keeps `position: relative` and loses `whiteSpace: 'normal'`,
      its rationale comment replaced by one naming both supersessions —
      tests (`wbs-table.test.tsx`, watched failing first):
      `clamps the chips and the box onto one nowrap line at rest`,
      `keeps the truncation fade on the strip, rest and open alike`,
      `keeps both popovers out of the clipper`;
      negatives: the rest branch's nowrap forced to `wrap` → the rest test
      watched failing; the fade deleted → the fade test watched failing at
      rest; the fade made conditional on the closed picker → the fade test
      watched failing with the picker open; the listbox moved inside the
      strip → the clipper test watched failing; each restored with a
      `Proof:` comment

## 2. What the strip made stale

- [x] 2.1 `dependsCellOf` in `wbs-table.test.tsx` reaches the wrapper through
      the `<td>` rather than as the box's parent (the box's parent is now the
      strip, which carries no hover handler); the chip-wrap comments in
      `e2e/layout.spec.ts` (`controlBoxes`, the deep-plan fixture) say
      "clipped behind the strip" instead of "wrap onto a second line" — the
      existing card, description, tab-order and popover-exemption tests stay
      green, unchanged

## 3. The browser measurements — CI's `pixels` job

- [x] 3.1 New `e2e/deps-cell.spec.ts`: the deep-plan fixture's shape — seven
      chips on one row, a chipless row beside it — asserting (a) the
      seven-chip row's height equals the chipless row's, with the strip
      really clipping (`scrollWidth > clientWidth`) and every chip laid out
      with real area first (R5 #16), and (b) a clipped chip invisible at
      rest: past the strip's visible edge and `elementFromPoint` at its
      centre answering something else, with the same probe on an unclipped
      chip answering the chip itself. Written here; **proven by the PR's
      `pixels` CI job** — this host has no browser, so no local run is
      claimed (R5)
- [x] 3.2 The `pixels` CI job green on the PR — the row height, the clip and
      the existing layout/hover suites, all measured in Chromium. Observed on
      PR #35: `pixels pass 5m29s`, 114 e2e tests, both `deps-cell.spec.ts`
      tests green by name in the job log, 2026-08-10

## 4. Review fixes (codex + agy, 2026-08-10, decisions made by the coordinator)

- [x] 4.a The fade becomes **rest-only** — applied when `picker === null`, a
      state condition, never a measurement (the plan's "unconditional" claim
      was wrong in this implementation: the box's `width: 100%` puts the
      focus ring, caret and typed text under the mask while the picker is
      open, and a short row's placeholder tail under it at rest — the tail
      stays, recorded in the delta spec as known and cosmetic, awaiting eyes
      on dev). Test renamed to `keeps the truncation fade on the rested
strip, and off the open one`, asserting the fade present at rest and
      **absent** with the picker open; negatives re-watched: the fade
      deleted → red at rest; applied unconditionally → red with the picker
      open
- [x] 4.b Clipped chips out of the tab order at rest: `tabIndex={-1}` on the
      chip ✕ buttons while `picker === null`, focusable again with the
      picker open (strip wrapped, chips visible) — test: `keeps clipped
chips out of the tab order at rest`, both states; negative: the
      condition dropped → watched failing on `expected +0 to be -1`
- [x] 4.c The strip pins `direction: 'ltr'` — the mask fades a physical
      right edge, and a logical-direction mask is not portable gradient
      syntax — asserted in the one-line-rest test
- [x] 4.d The one-line-rest jsdom fixture bumped to seven chips (the
      deep-plan shape), all seven asserted inside the strip

## 5. Gate

- [x] 5.1 `bunx nx format:check --all`, the run-many gate
      (`test lint typecheck build`) and
      `bunx @fission-ai/openspec@1.3.0 validate --all --json` green;
      `verify.md` records the commands, their output, and the failure-proof
      table naming every injected fault above and the test that observed it
- [ ] 5.2 Deploy to dev and Dany looks — a dependency-heavy plan whose rows
      all sit at one height, the fade saying "there is more", the hover card
      saying what
