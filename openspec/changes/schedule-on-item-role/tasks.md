## 1. Role order is stored

- [ ] 1.1 `role.position`: an additive migration with its `down.sql`, the
      column on the schema and the `Role` type, `RoleRepository.listByProject`
      and `ProjectRepository.rolesOf` ordered by it, `add` appending at
      `max + 10` inside its transaction, and the seed writing `Dev` at 10 and
      `QA` at 20 — test, against real SQLite: a project holding `Dev` and `QA`
      that gains `Analysis` reads `Dev, QA, Analysis` from both readers, and a
      new project reads `Dev, QA`.
- [ ] 1.2 **Negative test, watched failing:** the `ORDER BY` dropped from
      `listByProject` and from `rolesOf`, and both order tests fail reading
      `Analysis, Dev, QA` — the `(project_id, name)` index's order, which is
      what the database returns when nobody says otherwise.
- [ ] 1.3 The in-memory role and project fixtures sort the same way, because a
      fixture laxer than production lets a test pass against an order
      production does not produce.

## 2. The planner works in slices

- [ ] 2.1 `Slice`, `ScheduledSlice`, `sliceKey` and a `schedule` that plans
      slices and returns them alongside the projection — tests: two roles run
      one after the other in role order; an unestimated slice is zero-length,
      unestimated, and orders the slice behind it; a dependency joins the
      predecessor's last slice to the successor's first; a not-before floor
      lands on the first slice; a leaf with no role at all still schedules.
- [ ] 2.2 The projection — test: the row spans its slices, is critical when one
      of them is, and reports their total as its duration.
- [ ] 2.3 **Negative test, watched failing:** the dependency edge moved to the
      successor's first _estimated_ slice — the roadmap's literal wording — and
      `an unestimated first role does not escape the wait` fails with the row
      starting at day 0 instead of behind its predecessor.
- [ ] 2.4 **Negative test, watched failing:** the planner's refusal of a leaf it
      was handed no slice for, and of a slice for a work item that is not a
      leaf — both faults injected into the adapter's output, both observed.

## 3. Identity: the existing fixtures, unchanged

- [ ] 3.1 `schedule.test.ts` keeps every expectation it has, byte for byte, and
      reaches the new planner through a four-line single-role adapter at the
      top of the file — test: the whole existing suite, green, unedited below
      the imports.
- [ ] 3.2 **Perturbation, watched failing:** the intra-item chain reversed, and
      the fixtures go red — the suite can see the engine break.

## 4. Identity: a differential against the previous engine

- [ ] 4.1 The 2026-08-08 engine copied verbatim into
      `schedule-identity.test.ts` as the oracle, and a seeded generator of
      random plans — trees, parents, dependencies, not-before floors, one to
      three roles, PERT finals — asserting every field of every row is
      `toBe`-equal through both engines.
- [ ] 4.2 **Perturbation, watched failing:** each of the three anchored
      arithmetic sites (slice finish, slice late start, the projection's float)
      replaced by its textbook form, and the differential goes red on the last
      bits.

## 5. Identity: the live oracle

- [ ] 5.1 A captured `/api/projects/:id/work-items` response from a real
      project — PERT, a start date, parents, a dependency, estimated and
      unestimated rows — replayed through `WorkItemService.tree` and asserted
      field by field against what the live server answered, including the
      calendar dates, and again with a second role nobody has estimated.
- [ ] 5.2 **Perturbation, watched failing:** the same three sites, and the
      oracle goes red.

## 6. The wire, unchanged

- [ ] 6.1 `work-item.service` reads the project's roles, builds the slices and
      projects them — test: the existing service and controller suites, whose
      dates and schedules are the contract, green untouched.
- [ ] 6.2 `CONTEXT.md` gains `Slice`, `Role order` and `Projection`; the
      schema's "role order is not a contract" comments are corrected in the
      same change as the behaviour.

## 7. Gate

- [ ] 7.1 The format check, the run-many gate and the OpenSpec validation —
      recorded in `verify.md` with the failure-proof table. No e2e: this change
      is server-only.
