# Verification

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
     be-01 + libs (bun:test)   451 pass  0 fail  (47 files; was 434 on change/role-crud)
     fe-01 (vitest)            612 pass  0 fail  (25 files, not one of them edited)

$ bunx nx run-many -t test --parallel=2 --skip-nx-cache
NX   Successfully ran target test for 21 projects

$ bunx openspec validate --all --json
41 items, 41 passed, 0 failed — schedule-on-item-role valid
```

**Not run, deliberately:** `bun run e2e`. This change is be-01 only and no fe-01
file is touched — which is itself part of the claim: the projection keeps the
wire shape, so the client had nothing to adapt to. The worktree has no dev stack
or chromium either.

The migration lint runs (this change adds a `.sql` pair) and passes: the forward
script is `ALTER TABLE ... ADD COLUMN` plus an `UPDATE`, and `down.sql` exists.

## The checks, and the faults that broke them

| Check                                                                    | Fault injected                                                                    | What the run reported                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles are read in role order (`repository/role.ts`)                      | the `orderBy` dropped from `listByProject`                                        | `reads a role added later last, however its name sorts` read `Analysis, Dev, QA` — the `(project_id, name)` index's own order                                                |
| The schedule's role order (`repository/project.ts`)                      | the `orderBy` dropped from `rolesOf`                                              | `reads the same order through the project, which is where the schedule asks` read `Analysis, Dev, QA`                                                                        |
| A leaf must have a slice (`service/schedule.ts`, `slicesOf`)             | the throw replaced by an empty group                                              | `refuses a leaf it was handed no slice for` got a schedule back with that row at `earliestStart: Infinity`, `float: NaN`                                                     |
| …and the edge through it (`service/schedule.ts`, `keysOf`)               | same fault, with a dependency onto the sliceless leaf                             | `refuses a dependency onto a leaf it has no slice for` got a plan back missing the row and ignoring the edge                                                                 |
| A slice belongs to a leaf (`service/schedule.ts`, `groupByWorkItem`)     | the `not a leaf` throw removed                                                    | `refuses a slice for a work item that is not a leaf` got a plan in which the parent had become a node with a duration of its own                                             |
| The edge lands on the first slice (`service/schedule.ts`)                | edges moved to the first/last **estimated** slice — the roadmap's literal wording | `does not let an unestimated first role escape the wait` read `earliestStart: 0` for a row waiting on a 3-day predecessor; the differential read `4` for `4.666666666666667` |
| A slice's finish is anchored (`service/schedule.ts`)                     | `earliestFinish` written as `start + days`                                        | the differential failed at seed 260: `r0c0.latestStart` `10.666666666666666` became `10.666666666666668`                                                                     |
| A slice's late start is anchored (`service/schedule.ts`)                 | `latestStart` written as `finish - days`                                          | the differential failed at seed 255: `r2.latestStart` `0` became `6.661338147750939e-16` — a row that had no slack acquiring some                                            |
| Slack is derived, not aggregated (`service/schedule.ts`, the projection) | `float` computed as `Math.min(...own.map((s) => s.float))`                        | the differential failed at seed 256: `r1.float` `12.333333333333332` became `12.33333333333333`                                                                              |
| An unestimated slice is unestimated (`service/schedule.ts`)              | `estimated` hard-coded to `true`                                                  | the captured live plan came back with three rows claiming somebody had estimated them; `reports an unestimated leaf as unestimated` failed too                               |
| An unestimated slice is still a node (`service/schedule.ts`, `keysOf`)   | slices with no estimate filtered out of the graph                                 | the captured live plan's unestimated row went from `float: 4.5, critical: false` to `float: 0, critical: true`                                                               |

Every row was watched failing and then watched passing again on the same file,
2026-08-09.

## What the identity claim rests on

Three oracles, because one of them alone would be a fixture written by the same
hand as the change:

1. **The existing suite.** `service/schedule.test.ts` is unedited below its
   imports — 18 assertions written against the previous engine — and reaches the
   new planner through a single-role adapter at the top of the file.
2. **A differential against the previous engine**
   (`service/schedule-identity.test.ts`). The 2026-08-08 pass is copied verbatim
   as the oracle, and a thousand seeded plans — trees three deep, parents,
   dependencies, manual floors, one to three roles, PERT thirds — go through
   both. Every field `toBe`-equal, not `toBeCloseTo`: slack is a column and
   `critical` is an exact comparison with zero. A second test asserts the corpus
   contains those shapes, so a green run cannot be an empty one.
3. **A live capture** (`service/live-plan-identity.test.ts`). A real project's
   `/work-items` response from 2026-08-09 — PERT, a start date, a two-deep
   branch, a dependency, estimated and unestimated rows, a critical row — goes
   back in through `WorkItemService.tree` and comes out with the numbers the
   server printed, calendar dates included. Repeated with a second role nobody
   has estimated, which is the zero-length-slice rule against real numbers.

## What is proven and what is bounded

**Proven.** No plan without a resource constraint moves — and until leveling
lands, that is every plan.

**Bounded, and stated rather than hidden.** A leaf estimated in **three or more**
roles is summed in role order where `durationsOf` summed in estimate-row order.
Addition commutes, so one or two roles give the same double either way;
association does not, so three can differ in the last bit. No project has ever
held three roles — the write path for a third shipped yesterday in `role-crud` —
and the differential covers up to three roles with the estimates in role order,
which is the order a reader thinks in. `design.md` D5 carries the same note.

**Vacuous, and recorded as such.** The perturbation `tasks.md` planned for §3 —
reversing a work item's slice order — cannot fail against the existing fixtures,
because those fixtures are single-role. Role order is proven by
`runs them in the order they are given, which is the project's role order`
instead. Likewise the three floating-point perturbations are invisible to the
live capture: its estimated rows hold one role each, so anchoring and
accumulating agree. Two faults it _can_ see were injected instead, and both are
in the table above.

**Not observable at all in this change.** Role order changes no number the wire
carries: the projection is a min and a max over the slices, and reordering them
moves neither. It is proven at the repository (both readers) and at the planner
(slice starts), and it becomes visible to a reader when the Gantt draws a bar per
slice.

## The role order decision

The roadmap left it open — `role.position`, or infer the order the rows were
seeded in. The schema comment left by `role-crud` says role order is not a
contract yet and that "`role.position` arrives with the schedule change that
needs one". It is not merely uncontracted; the inference is already wrong:

```
$ bun -e '... EXPLAIN QUERY PLAN SELECT id, project_id, name FROM role WHERE project_id = ?'
SEARCH role USING INDEX role_project_name (project_id=?)
rows: [{"id":"r3","name":"Analysis"},{"id":"r1","name":"Dev"},{"id":"r2","name":"QA"}]
```

Inserted `Dev`, `QA`, `Analysis`; read back alphabetically. So the column ships,
additive, with a default so an outgoing release can still insert a role during a
swap, backfilled from the rowid so every existing project keeps the order it was
seeded with. `down.sql` drops it and says what is lost.
