<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it. Source plan: docs/plans/2026-08-10-ux-batch-and-roadmap.md, U1.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Standing rule for this change

Every negative below is written and **watched failing** before the line it
guards is believed (`P phases-ui`, `T1 column-widths-drag`: the order is the
whole point). jsdom negatives are watched locally; the browser negatives are
watched in CI's `pixels` job, because this machine cannot launch Chromium
(missing system libraries) and local browser results are not proof of record
here anyway. Each guard carries a `Proof:` comment naming the injected fault
and the test that observed it — written only after the observation.

## 1. The frame layout resolves a dragged Name

- [x] 1.1 `widthFor` resolves a flexible column's override before consulting
      the width table, and **keeps throwing** for a flexible column with no
      override — its recorded reason ("a sentinel would let the pinned-offset
      arithmetic add a number the browser never uses") stands — test:
      `table-frame.test.ts` `resolves a dragged width for the flexible column…`
      plus the kept throw case; negative: the throw replaced by
      `FLEXIBLE_FLOOR` for the no-override state → watched failing
- [x] 1.2 `floorFor` grows an **explicit flexible arm** returning
      `FLEXIBLE_FLOOR` — retiring the shipped negative "refuses the flexible
      column a width and a floor alike" by flipping it to prove the resolved
      floor, and keeping `flexibleCellStyle`'s floor and `floorFor`'s the same
      constant — test: floor is 200 in both plan states, `clampColumnWidth`
      clamps a Name drag to `[200, 600]`; negative (named fault 1): the
      flexible arm removed → `floorFor('name')` throws out of the clamp,
      watched failing
- [x] 1.3 `ResolvedColumn` says both answers: `width` (the resolved width — the
      override for a dragged flexible column, `undefined` for an undragged one)
      and `colWidth` (what the `<col>` declares — `undefined` for every
      flexible member, dragged or not). `frameLayout`'s minimum counts the
      override in place of `FLEXIBLE_FLOOR`; `foldedTableMinWidth` moves with
      it — test: the four-consumer override case extended to Name (colgroup
      via `colWidth`, minimum, folded minimum, pinned); negatives: `colWidth`
      handed the override → watched failing; the minimum left counting
      `FLEXIBLE_FLOOR` under an override → watched failing
- [x] 1.4 `pinnedGeometryFor` carries the override as the pinned Name cell's
      width and keys its refusal on **flexibility**, not on a missing width: a
      column pinned behind the flexible one stays refused with an override in
      force, because Name keeps absorbing viewport excess and its laid-out
      width is not a number an offset may be summed from — test: the refusal
      case run with a Name override; negative: the refusal keyed back on
      `width === undefined` → `depends` pinned behind a dragged Name resolves
      a plausible offset, watched failing
- [x] 1.5 `flexibleCellStyle` takes the layout state and declares the override
      as the cell's `width` floor: `minWidth` becomes the override where one is
      in force (`pinnedCellStyle` carries the `width` half, from the same
      resolution) — test: both states asserted; `sizableColumn` answers `true`
      for a flexible column — test: flipped case

## 2. The handle, on Name too

- [x] 2.1 `resizeHandleFor` renders the handle on every leaf column — the
      undefined-width suppression retired — and `ColumnResizeHandle` takes
      `width: number | undefined`: for Name with no override the gesture's
      `fromWidth` is captured **once** from the header cell's rendered width
      at pointerdown (the one measurement in the gesture; jsdom measures every
      box at 0 and falls back to `FLEXIBLE_FLOOR`) — tests: the handle-set
      case flipped to all leaf columns; `widthFromDrag('name', …)` clamp
      cases; negative: the suppression restored → the handle-set case watched
      failing on Name missing
- [x] 2.2 The `<colgroup>` reads `colWidth`, so `<col name>` stays unsized
      with an override in force, and the Name cells carry `width` (pinned
      style) + `minWidth` (flexible style) — tests: `wbs-table.test.tsx`
      asserts the header and body Name cells' inline styles under a stored
      override, and the table `min-width` counting it; the colgroup case
      re-pointed at `colWidth`

## 3. Storage: a `name` entry under the same claim rules

- [x] 3.1 `rememberedWidthOverrides` needs no new lines — `sizableColumn` now
      admits `name` and the existing range check reads Name's own
      `floorFor`/`WIDEST_COLUMN` — but the behaviour is proven, not inferred:
      a stored `name` at 300 applies, at 150 and at 1e9 each dropped alone —
      negative (named fault 2): the sanitizer made to accept a flexible
      column's entry without the range check → the out-of-bounds cases watched
      failing with the width laid out

## 4. Reset stays `forgetWidthOverrides`

- [x] 4.1 One reset forgets Name with the rest and the Name cells return to
      the flexible remainder — test: stored Name override, reset pressed,
      cell styles back to floor-only and the key gone

## 5. The browser decides the excess-width branch

- [x] 5.1 `e2e/layout.spec.ts`: drag Name's real header edge at `NARROW` with
      the frame scrolled — the laid-out width follows the clamp from the
      measured 200px floor, the `<col>` stays unsized, the pins in front hold
      — fault: Name's gesture made inert with the strip still rendered
      (jsdom watched green locally under the same fault, 368/368; the R5
      #14/#15/#16 class), watched red in CI's `pixels` with the gate left in
      place: `Expected: 260 / Received: 200`, run 31430846444, 2026-08-10
- [x] 5.2 `e2e/layout.spec.ts`: the excess-width measurement at the widest
      header-matrix viewport (1512×982) with a Name override in force —
      Number on its 93px envelope, dates on 114, `<col name>` unsized —
      fault (named fault 3): `<col name>` sized from the override → the extra
      viewport distributed across every column, Number off 93, watched red in
      CI: `Expected: 93 / Received: 103.484375`, run 31430848363, 2026-08-10.
      **This measurement decided task 5's branch, and the cell-width design
      lost**: Chromium distributed the slack across every sized column even
      with `<col name>` unsized and the override on the Name cells (`Expected:
93 / Received: 103.484375`, run 31430669282). The winner is the named
      fallback — the table's own width set to the resolved sum while a
      flexible override is in force (`tableWidthStyle`) — and the losing
      branch (the cell `width` declaration, the pinned Name width) is
      deleted, not left as dead config
- [x] 5.3 The existing envelope, fit-matrix and handle-set browser cases stay
      green, the handle-set case now expecting Name handled — observed in the
      same `pixels` runs: 115 of 116 passing with the one failure being 5.2's
      deciding measurement

## 6. Gate

- [x] 6.1 `bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck` and
      `bunx @fission-ai/openspec@1.3.0 validate --all --json` green locally;
      verify.md records the commands, their output, and the failure-proof
      table naming the injected fault and the observing test for every
      negative above. The final head's `gate`/`pixels` conclusions are
      reported on the PR — a run that post-dates this file cannot be quoted
      inside it
- [ ] 6.2 Deploy to dev and Dany looks — the feel of a dragged Name is a
      judgement call about a table. Not doable from this worktree; the branch
      goes up as a PR
