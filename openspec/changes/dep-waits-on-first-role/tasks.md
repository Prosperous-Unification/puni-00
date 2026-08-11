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

- [x] 2.1 `schedule-identity.test.ts`: the multi-role parity runs (two-role,
      three-role) drop their generated edges — parity vs the pre-slice oracle
      now holds only where the rules coincide (design.md D7). A single-role
      parity run **keeps** its edges (first slice is last slice; watched green
      unchanged). Each narrowed run's comment states why the scope narrowed,
      dated.
- [x] 2.2 The anchor property, on the generated multi-role plans: doubling
      every predecessor's non-first slice durations moves no successor's
      start. Negative: with the join reverted to `.last`, watched failing on
      a moved start; restored with a `Proof:` comment.
- [x] 2.3 `live-plan-identity.test.ts` / `fixtures/live-plan-2026-08-09.json`:
      run the captured plan through the new engine. If any number moves, the
      moved fields are re-derived and updated **in the fixture**, and the test
      gains a comment naming each moved row and the anchor that moved it; if
      none moves (no dependency in the capture has a multi-role predecessor),
      a comment states that instead — silence is not an answer either way.
- [x] 2.4 Downstream service tests (`work-item.service.test.ts`,
      `schedule-shapes.test.ts` floors-compose cases, `dependency.test.ts`):
      audit every failure, update only numbers that encoded last-slice waits,
      each with the rule named in an adjacent comment. A failure that is not
      explained by the anchor rule is a defect, not an update.

## 3. The arrow leaves the anchor

- [x] 3.1 `gantt-geometry.test.ts`: the three spec scenarios watched failing
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
- [x] 3.2 R5 on the selection: a dependency whose predecessor has no slice in
      the payload at all is a broken promise — throw into the error boundary,
      never skip the arrow silently (the existing "not among rows = collapsed,
      skip" rule stays for _rows_; a row present with no slice anywhere is the
      fault). Negative: the throw removed, test watched passing on a chart
      quietly short one arrow; restored with a `Proof:` comment.

## 4. Verify

- [x] 4.1 `verify.md`: the gate (`bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck`, openspec validate), the
      failure-proof table — every fault injected in 1.3, 2.2, 3.1, 3.2 with
      the test that observed it and the observed output — and the standing
      note that `build` and e2e are CI's on this host.

## 5. The anchor is the first _estimated_ slice (Dany, 2026-08-11)

An independent probe found the rule as first shipped switches every dependency
off in a project that lists a role nobody estimates: `[Design, Dev, QA]` with
`Design` blank makes every anchor zero days long, and a fifteen-day three-item
chain came back with all three rows on day zero. Dany's decision on being shown
it: "first in list of project roles, then first that is estimated".

- [x] 5.1 `schedule-shapes.test.ts`: the probe as a regression —
      `a chain does not collapse because a project lists a role nobody
estimated`, three roles, `c1 → c2 → c3` of 4-day Dev, asserting 0→4,
      4→8, 8→12 — plus `walks past an unestimated role to the first one
somebody estimated` (the old `a zero-length anchor clears immediately`,
      reversed), `anchors a predecessor nobody estimated at all on its
finish`, `carries an unestimated predecessor's own wait through to its
successor` and `a branch anchors each leaf on its own first estimate`.
      All four watched failing on the first-slice-plain rule before the walk
      landed. Then `schedule.ts`: `anchorNode` beside `firstNode`, the first
      slice with `days !== null` and the last node where there is none.
- [x] 5.2 Negative on the walk: `anchorNodeOf` replaced by `firstNodeOf` and
      the four tests above watched failing with their observed values, and
      `anchorNode` set to the last node — the whole-item rule — watched
      failing on the tests that predate this decision. Both recorded as
      `Proof:` comments at the adjacency loop.
- [x] 5.3 `schedule-leveling.test.ts`: the rule with a person in the plan,
      which had no coverage at all. `holds a successor to the anchor a person
pushed` (successor released at the **levelled** anchor finish, `boundBy`
      the dependency), `queues a predecessor's later role against its own
successor's work` (the contention class this change created —
      `resourcePredecessorId` asserted, watched flipping to `predecessor`/
      `null` under the whole-item rule), and `tail`'s start pinned in `reports
the least slack of a work item whose slices a person pushed apart`,
      which moved 8 → 1 under this change with nothing asserting on it.
- [x] 5.4 `schedule-identity.test.ts`: the corpus coverage the narrowing cost,
      paid back as invariants over the same thousand plans — successor starts
      no earlier than the latest anchor finish among its predecessors, no
      negative float, projections span their slices — with the corpus half
      asserted (edges whose predecessor's anchor is not its first slice > 0).
      Watched failing at seed 21 under the first-slice rule. The growth
      property's anchor identification follows the engine's walk.
- [x] 5.5 fe: `anchorSpanOf` walks to the first slice the payload marks
      `estimated`, last where none is, pinned by `an arrow leaves the first
estimated role, not the unestimated one in front of it` and watched
      failing on `own.at(0)`. The hover card's `predecessor` sentence stops
      saying "to finish" and names the anchor. Stale contract on
      `wbs-api.ts`'s `addDependency` updated.
- [x] 5.6 Spec, design and glossary: the estimated-anchor rule with the
      zero-day nuance stated, the fall-through specced as a scenario, D1
      rewritten so the first version's blast radius is the recorded motivation
      rather than a deleted mistake, and D5 naming two inert-today
      consequences — trailing slices taking the project's `latestFinish`, and
      `critical-snap`'s non-tiling arm becoming the ordinary case.

## 6. Rebase onto main

- [x] 6.1 Rebased onto `main` @ `e0bfcef` (#41, #42, #43 merged). Six
      collision points; `schedule-identity.test.ts` resolved keeping main's
      snapped oracle beside this branch's growth property, and
      `schedule-priority.test.ts`'s pre-priority pin re-derived where the
      anchor rule moves it, with the move recorded beside the pin. Full gate
      green after.
