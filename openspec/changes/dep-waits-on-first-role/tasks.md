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

## 1. The engine joins the anchor, and the docs stop saying "whole"

- [x] 1.1 `schedule-shapes.test.ts`: the four spec scenarios as tests, watched
      failing under the last-slice rule first — `waits for the first role, not
the last` (A: 3d Dev + 2d QA, B→A: B starts day 3, A's QA 3→5, watched
      failing on `expected 5 to be 3`), `an unestimated first role does not
escape the wait` (already green under both rules — kept as the guard
      that the successor side did not move), `a zero-length anchor clears
immediately` (B starts day 0), `a branch releases at its anchors`
      (P1 2d+3d, P2 4d+1d, Q→P: Q starts day 4, P's projection reaches 5).
      Then the join in `schedule.ts` flips from `endsOf(predecessorId).last`
      to `.first`, and all four are watched green.
- [x] 1.2 The words follow the code, same slice as the flip: the `schedule()`
      JSDoc contract paragraph ("the whole of 010 before 020" → the anchor
      rule, including the parent expansion reading), the edge-join comment at
      the adjacency loop, and the anchoring corollary ("only the last has an
      external successor" — now false; the invariant that holds is that
      external edges still _arrive_ only at first slices, per design.md D5).
      `repository/schema.ts`'s dependency-table JSDoc gets the same reword.
      `CONTEXT.md`: **Dependency** reworded, **Anchor slice** added (terms
      only, per config — as they resolve, not batched).
- [x] 1.3 Negative proof for the rule itself: with the join reverted to
      `.last`, `waits for the first role, not the last` and `a branch releases
at its anchors` watched failing on their pinned starts; restored with
      `Proof:` comments naming the revert.

## 2. What the oracle still proves, and the property it never could

- [ ] 2.1 `schedule-identity.test.ts`: the multi-role parity runs (two-role,
      three-role) drop their generated edges — parity vs the pre-slice oracle
      now holds only where the rules coincide (design.md D7). A single-role
      parity run **keeps** its edges (first slice is last slice; watched green
      unchanged). Each narrowed run's comment states why the scope narrowed,
      dated.
- [ ] 2.2 The anchor property, on the generated multi-role plans: doubling
      every predecessor's non-first slice durations moves no successor's
      start. Negative: with the join reverted to `.last`, watched failing on
      a moved start; restored with a `Proof:` comment.
- [ ] 2.3 `live-plan-identity.test.ts` / `fixtures/live-plan-2026-08-09.json`:
      run the captured plan through the new engine. If any number moves, the
      moved fields are re-derived and updated **in the fixture**, and the test
      gains a comment naming each moved row and the anchor that moved it; if
      none moves (no dependency in the capture has a multi-role predecessor),
      a comment states that instead — silence is not an answer either way.
- [ ] 2.4 Downstream service tests (`work-item.service.test.ts`,
      `schedule-shapes.test.ts` floors-compose cases, `dependency.test.ts`):
      audit every failure, update only numbers that encoded last-slice waits,
      each with the rule named in an adjacent comment. A failure that is not
      explained by the anchor rule is a defect, not an update.

## 3. The arrow leaves the anchor

- [ ] 3.1 `gantt-geometry.test.ts`: the three spec scenarios watched failing
      first — `the arrow does not overshoot a parallel successor` (fromFinish
      day 3, not 5), `an arrow from a branch leaves its latest anchor`
      (day 4, parent's row index), `a zero-length anchor draws from its own
day` (the `fromStart === fromFinish` calendar reading, which already
      exists for projections, now exercised by an anchor). Then the geometry:
      arrows take `fromStart`/`fromFinish` from the predecessor's anchor —
      selected from the payload's slices (leaf: its first slice; parent: the
      latest-finishing anchor among its leaves), never recomputed from
      estimates (design.md D6). The parent case needs the full row set, which
      the geometry's caller holds and the shown-rows plan does not — the seam
      (an anchor map passed in, or the full tree) is the implementer's call;
      a collapsed predecessor branch must still anchor correctly, and there
      is a test with the predecessor's leaves absent from `plan.rows`.
- [ ] 3.2 R5 on the selection: a dependency whose predecessor has no slice in
      the payload at all is a broken promise — throw into the error boundary,
      never skip the arrow silently (the existing "not among rows = collapsed,
      skip" rule stays for _rows_; a row present with no slice anywhere is the
      fault). Negative: the throw removed, test watched passing on a chart
      quietly short one arrow; restored with a `Proof:` comment.

## 4. Verify

- [ ] 4.1 `verify.md`: the gate (`bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck`, openspec validate), the
      failure-proof table — every fault injected in 1.3, 2.2, 3.1, 3.2 with
      the test that observed it and the observed output — and the standing
      note that `build` and e2e are CI's on this host.
