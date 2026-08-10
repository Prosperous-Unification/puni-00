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

## 1. The split in `table-frame.ts`

- [x] 1.1 `indentFor` splits into `numberIndentFor` (capped at
      `DEEPEST_INDENT`, byte-for-byte today's behaviour) and
      `hierarchyIndentFor` (uncapped, `depth * INDENT_STEP`), plus
      `cardIndentFor` capped at a new `CARD_DEEPEST_INDENT = 6` — each JSDoc
      naming which consumers take it and why — test: `table-frame.test.ts`
      cases for both functions to depth 6, their difference (zero to the cap,
      one step per level past it), and the card cap; negative: the capped
      `Math.min` put on `hierarchyIndentFor` → the depth-6 stepping test
      watched failing on `expected +0 to be 12` (`3 failed | 32 passed`),
      then restored, `Proof:` comments on the function and in the test

## 2. The table's two cells

- [x] 2.1 `wbs-table.tsx`: the Number cell's `paddingLeft` becomes
      `numberIndentFor(row.depth)` and the Name cell's wrapper carries the
      difference between the two indents — test: `wbs-table.test.tsx`, a
      chain built through the UI to depth 6 asserting both cells' inline
      padding at depths 1, 4, 5 and 6 (the Name-share test named in its
      `Proof:`); negative: the Name wrapper's share put back to
      `paddingLeft: 0` (the shipped state) → watched failing on the depth-5
      pair, `'0px'` where `'12px'` was owed, then restored, `Proof:` on the
      wrapper style

## 3. The Gantt label rail

- [x] 3.1 `gantt-panel.tsx`: the rail's `paddingLeft` becomes the uncapped
      indent plus its 8px — test: `gantt-panel.test.tsx`, labels at depth
      0/4/5/6; negative: the rail pointed back at the capped
      `numberIndentFor` → watched failing on `expected '56px' to be '68px'`
      at depth 5, then restored, `Proof:` in the test

## 4. The mobile cards

- [x] 4.1 `plan-cards.tsx`: the card's `marginLeft` becomes
      `cardIndentFor(depth)` — test: `plan-cards.test.tsx`, an eight-row
      chain to depth 7 at the phone width; negative: the cards pointed at the
      uncapped `hierarchyIndentFor` → watched failing on
      `expected '84px' to be '72px'` at depth 7, then restored, `Proof:` in
      the test

## 5. The browser measurements — CI's `pixels` job

- [x] 5.1 `e2e/layout.spec.ts`: the deep-plan fixture grows to depth 6 (two
      more chains), and the fixture asserts the **sum** — the Number cell's
      used padding plus the Name box's offset from its own cell's edge —
      strictly increasing at every level to depth 6, each half equal to its
      function's arithmetic; then opens the Gantt panel and asserts the rail
      labels' uncapped edge at every depth. Written here; **proven by the
      PR's `pixels` CI job** — this host has no browser, so no local run is
      claimed (R5)
- [x] 5.2 The `NUMBER_ENVELOPE` proof (the envelope-fitting e2e test) is
      untouched beyond the `indentFor` → `numberIndentFor` rename; its
      assertions are unchanged and CI keeps it green
- [x] 5.3 The `pixels` CI job green on the PR — the depth-6 sum, the rail
      edge, and the envelope, all measured in Chromium. Observed on PR #33:
      `pixels pass 5m38s`, 2026-08-10

## 6. Gate

- [x] 6.1 `bunx nx format:check --all`, the run-many gate
      (`test lint typecheck build`) and `openspec validate --all --json`
      green; `verify.md` records the commands, their output, and the
      failure-proof table naming every injected fault above and the test that
      observed it
- [ ] 6.2 Deploy to dev and Dany looks — a plan six deep, every level visibly
      deeper than its parent, in the table, on the chart's rail, and on a
      phone's cards
