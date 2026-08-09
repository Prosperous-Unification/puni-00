# Verification

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
     be-01 + libs (bun:test)   455 pass  0 fail  (47 files; was 434 on change/role-crud)
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

```
$ bun run tools/tool-git-hooks/src/hooks/migration-lint.ts \
    apps/be-01/drizzle/20260809090000_add_role_position/migration.sql \
    apps/be-01/drizzle/20260809090000_add_role_position/down.sql
exit 0
```

The forward script is `ALTER TABLE ... ADD COLUMN` plus an `UPDATE`, and
`down.sql` is beside it.

## The checks, and the faults that broke them

| Check                                                                          | Fault injected                                                                    | What the run reported                                                                                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles are read in role order (`repository/role.ts`)                            | the `orderBy` dropped from `listByProject`                                        | `reads a role added later last, however its name sorts` read `Analysis, Dev, QA` — the `(project_id, name)` index's own order                                                |
| The schedule's role order (`repository/project.ts`)                            | the `orderBy` dropped from `rolesOf`                                              | `reads the same order through the project, which is where the schedule asks` read `Analysis, Dev, QA`                                                                        |
| A leaf must have a slice (`service/schedule.ts`, `slicesOf`)                   | the throw replaced by an empty group                                              | `refuses a leaf it was handed no slice for` got a schedule back with that row at `earliestStart: Infinity`, `float: NaN`                                                     |
| …and the edge through it (`service/schedule.ts`, `keysOf`)                     | same fault, with a dependency onto the sliceless leaf                             | `refuses a dependency onto a leaf it has no slice for` got a plan back missing the row and ignoring the edge                                                                 |
| A slice belongs to a leaf (`service/schedule.ts`, `groupByWorkItem`)           | the `not a leaf` throw removed                                                    | `refuses a slice for a work item that is not a leaf` got a plan in which the parent had become a node with a duration of its own                                             |
| The edge lands on the first slice (`service/schedule.ts`)                      | edges moved to the first/last **estimated** slice — the roadmap's literal wording | `does not let an unestimated first role escape the wait` read `earliestStart: 0` for a row waiting on a 3-day predecessor; the differential read `4` for `4.666666666666667` |
| A slice's finish is anchored (`service/schedule.ts`)                           | `earliestFinish` written as `start + days`                                        | the differential failed at seed 260: `r0c0.latestStart` `10.666666666666666` became `10.666666666666668`                                                                     |
| A slice's late start is anchored (`service/schedule.ts`)                       | `latestStart` written as `finish - days`                                          | the differential failed at seed 255: `r2.latestStart` `0` became `6.661338147750939e-16` — a row that had no slack acquiring some                                            |
| Slack is derived, not aggregated (`service/schedule.ts`, the projection)       | `float` computed as `Math.min(...own.map((s) => s.float))`                        | the differential failed at seed 256: `r1.float` `12.333333333333332` became `12.33333333333333`                                                                              |
| An unestimated slice is unestimated (`service/schedule.ts`)                    | `estimated` hard-coded to `true`                                                  | the captured live plan came back with three rows claiming somebody had estimated them; `reports an unestimated leaf as unestimated` failed too                               |
| An unestimated slice is still a node (`service/schedule.ts`, `keysOf`)         | slices with no estimate filtered out of the graph                                 | the captured live plan's unestimated row went from `float: 4.5, critical: false` to `float: 0, critical: true`                                                               |
| The migration backfills the order (`20260809090000_add_role_position`)         | the `UPDATE` changed to `SET position = 0`                                        | `gives roles already in the database the order they were written in` failed with both roles at `0` — every existing project's order gone, silently                           |
| Estimates are read in role order (`repository/estimate.ts`)                    | the `orderBy` removed from `listByProject`                                        | `reads a work item's estimates in role order, not in the order the row ids happen to sort` handed back `QA` before `Dev` — the composite primary key's own order             |
| Two addends make the old sum's order harmless (`schedule-identity.test.ts`)    | the two-role corpus raised to three roles                                         | `answers what it answered for a two-role plan, however the old sum was ordered` failed at seed 2: `r0c0.duration` `9.333333333333334` became `9.333333333333332`             |
| The column's default keeps a swap serving (`20260809090000_add_role_position`) | `DEFAULT 0` removed from the `ADD COLUMN`                                         | `lets the outgoing release keep inserting roles against the migrated schema` failed on the old release's three-column `INSERT`: `NOT NULL constraint failed: role.position`  |

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
   dependencies, manual floors, PERT thirds — go through both, twice: once at
   two roles with the previous engine's totals summed in a **shuffled** order,
   and once at three with both sides in role order. Every field `toBe`-equal,
   not `toBeCloseTo`: slack is a column and `critical` is an exact comparison
   with zero.

   The two engines' inputs are derived from the plan **separately**. The first
   version of this file built the slices and the old engine's totals in one
   loop, which handed the oracle a sum added up in exactly the order the slices
   were made in — the one order it could not disagree with. The review found
   that; the generator now hands back estimates, and `slicesFrom` and
   `durationsFrom` are two functions with a seeded shuffle between them. A third
   test asserts the corpus contains the shapes the claims are about **and** that
   the shuffle really permutes, since one that never moved anything would make
   the first run a copy of the second.

3. **A live capture** (`service/live-plan-identity.test.ts`). A real project's
   `/work-items` response from 2026-08-09 — PERT, a start date, a two-deep
   branch, a dependency, estimated and unestimated rows, a critical row — goes
   back in through `WorkItemService.tree` and comes out with the numbers the
   server printed, calendar dates included. Repeated with a second role nobody
   has estimated, which is the zero-length-slice rule against real numbers.

## What is proven and what is bounded

**Proven, and this is the scope the claim is made at.** Every plan a **released
database** can hold comes out of the new engine bit for bit — no resource
constraint, and at most the `Dev` and `QA` a project could be given before this
release, because the write path for a third role is `role-crud`, this change's
base branch, in the same release train.

The scope is not a hedge, it is what the arithmetic supports. `durationsOf`
summed the estimate rows in whatever order the database handed them over — and
until this change nothing ordered them. Addition in doubles commutes but does
not associate, so:

- **two addends agree whatever the order**, which is why every existing plan is
  safe; and the differential **executes** that argument rather than asserting
  it, handing the previous engine a **shuffled** sum for its two-role corpus;
- **three do not.** Raising that corpus to three roles turns the run red at seed
  2: a work item's duration `9.333333333333334` became `9.333333333333332`.
  Watched, 2026-08-09. This is the class the review constructed, and the test can
  see it.

**Fixed rather than bounded.** From three roles on, the order is now **defined**:
`EstimateRepository.listByProject` orders by the role's position, the adapter
slices in the same order, and the spec carries a requirement for it. There is no
earlier number for a three-role plan to differ from, because there are no
three-role plans until this release lands. A second differential covers that
corpus with both sides in role order. Without the `ORDER BY` a project's finish
would depend on the query planner — a plan could end on a different day because
SQLite chose a different index — which is why that read is now a contract with a
watched negative test of its own. `design.md` D5a carries the argument.

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
