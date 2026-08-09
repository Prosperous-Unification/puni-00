## 1. Role order is stored

- [x] 1.1 `role.position`: an additive migration with its `down.sql`, the
      column on the schema and the `Role` type, `RoleRepository.listByProject`
      and `ProjectRepository.rolesOf` ordered by it, `add` appending at
      `max + 10` inside its transaction, and the seed writing `Dev` at 10 and
      `QA` at 20 — test, against real SQLite: a project holding `Dev` and `QA`
      that gains `Analysis` reads `Dev, QA, Analysis` from both readers, and a
      new project reads `Dev, QA`.
- [x] 1.2 **Negative test, watched failing:** the `ORDER BY` dropped from
      `listByProject` and from `rolesOf`, and both order tests fail reading
      `Analysis, Dev, QA` — the `(project_id, name)` index's order, which is
      what the database returns when nobody says otherwise.
- [x] 1.3 The in-memory role and project fixtures sort the same way, because a
      fixture laxer than production lets a test pass against an order
      production does not produce.
- [x] 1.4 **Unplanned:** the backfill had no test, and it is the only part of
      the migration that touches data anybody already has. It is reached by
      rolling back to the migration before it, writing roles the way the
      previous release wrote them and migrating forward again — negative test
      watched failing with the `UPDATE` set to a constant, both roles landing
      at position 0.

## 2. The planner works in slices

- [x] 2.1 `Slice`, `ScheduledSlice`, `sliceKey` and a `schedule` that plans
      slices and returns them alongside the projection — tests: two roles run
      one after the other in role order; an unestimated slice is zero-length,
      unestimated, and orders the slice behind it; a dependency joins the
      predecessor's last slice to the successor's first; a not-before floor
      lands on the first slice; a leaf with no role at all still schedules.
- [x] 2.2 The projection — test: the row spans its slices, is critical when one
      of them is, and reports their total as its duration.
- [x] 2.3 **Negative test, watched failing:** the dependency edge moved to the
      successor's first _estimated_ slice — the roadmap's literal wording — and
      `does not let an unestimated first role escape the wait` fails with the
      row's first slice sitting on day 0 instead of behind its predecessor.
      The differential goes red on the same fault.
- [x] 2.4 **Negative tests, both watched failing:** `slicesOf` returning an
      empty group instead of throwing, and a leaf comes back with a start of
      `Infinity` and a float of `NaN`; the same fault with an edge onto that
      leaf, and the plan comes back missing a row rather than refusing.
- [x] 2.5 **Unplanned, found by 2.4:** the first version mapped an edge end
      through `?? leafId`, so a leaf with no slice became a node the sort had
      never heard of — and an unreachable node is how the sort reports a
      **cycle**. The fault answered "your dependencies run in a circle" for a
      graph with one edge in it. The fallback is gone; the keys are read
      through the throwing accessor, and the test asserts the refusal names
      the slice rather than a cycle.

## 3. Identity: the existing fixtures, unchanged

- [x] 3.1 `schedule.test.ts` keeps every expectation it has, byte for byte, and
      reaches the new planner through a single-role adapter at the top of the
      file — the whole existing suite, green, unedited below the imports.
- [x] 3.2 **Perturbation:** the planned one — reversing the intra-item chain —
      is **vacuous here** and is recorded as such: these fixtures are
      single-role, so there is no chain to reverse. Role order is proven by
      `runs them in the order they are given` instead, and the fixtures are
      watched failing on the edge-endpoint fault from 2.3.

## 4. Identity: a differential against the previous engine

- [x] 4.1 The 2026-08-08 engine copied verbatim into
      `schedule-identity.test.ts` as the oracle, and a seeded generator of
      random plans — trees, parents, dependencies, not-before floors, one to
      three roles, PERT finals — asserting every field of every row is
      `toBe`-equal through both engines, over a thousand plans. A second test
      asserts the corpus actually contains those shapes, so a green run is not
      an empty one.
- [x] 4.2 **Perturbation, all three watched failing:** each anchored
      arithmetic site (slice finish, slice late start, the projection's float)
      replaced by its textbook form, and the differential goes red on the last
      bits.

## 5. Identity: the live oracle

- [x] 5.1 A captured `/api/projects/:id/work-items` response from a real
      project — PERT, a start date, a two-deep branch, a dependency, estimated
      and unestimated rows — replayed through `WorkItemService.tree` and
      asserted field by field against what the live server answered, calendar
      dates included, and again with a second role nobody has estimated.
- [x] 5.2 **Perturbation, watched failing:** the three FP sites are invisible
      to this plan and it says so — its estimated rows hold one role each.
      What it does see is watched instead: an unestimated slice claiming
      somebody looked, and unestimated slices dropped from the graph, which
      turned a row with 4.5 days of slack into a critical one.

## 6. The wire, unchanged

- [x] 6.1 `work-item.service` reads the project's roles, builds the slices and
      projects them — the existing service and controller suites, whose dates
      and schedules are the contract, green untouched. fe-01 is not edited.
- [x] 6.2 `CONTEXT.md` gains `Slice`, `Role order` and `Projection`; the
      schema's and the repository's "role order is not a contract" comments are
      corrected in the same change as the behaviour.

## 7. Review round two (codex, 2026-08-09)

- [x] 7.1 **HIGH — the identity claim was wider than its arithmetic.** The old
      adapter summed estimates in whatever order `EstimateRepository` returned
      (no `ORDER BY`), and the differential built both engines' inputs in one
      loop, so the oracle was handed a sum in the one order it could not
      disagree with. Three parts: `listByProject` orders by role position
      through a join; the claim is re-scoped in the spec and `design.md` D5a to
      plans a **released** database can hold — at most two roles, where addition
      commutes — with three-role order **defined** from birth rather than
      changed; and the differential derives its two inputs separately, feeding
      the old engine a seeded **shuffle** for the two-role corpus.
- [x] 7.2 **Negative tests, all watched failing:** the `orderBy` removed from
      `listByProject`, and `reads a work item's estimates in role order` handed
      back `QA` before `Dev`; the two-role corpus raised to three roles, and the
      shuffled differential failed at seed 2 with a duration of
      `9.333333333333334` becoming `9.333333333333332` — the class the review
      constructed, now visible to the test.
- [x] 7.3 **MEDIUM — the migration's `DEFAULT 0` had no proof.** A test runs the
      **outgoing** release's three-column `INSERT` against the migrated schema.
      Watched failing with `DEFAULT 0` removed: `NOT NULL constraint failed:
role.position`, on that statement — a role add answering 500 for the
      length of a swap.
- [x] 7.4 **Unplanned, found by 7.1:** nine test files seeded roles with no
      `position` at all (test projects are not typechecked), so they landed on
      the column's default and every one of them sorted equal. Seeded properly.

## 8. Gate

- [x] 8.1 The format check, the run-many gate and the OpenSpec validation —
      recorded in `verify.md` with the failure-proof table. No e2e: this change
      is server-only.
