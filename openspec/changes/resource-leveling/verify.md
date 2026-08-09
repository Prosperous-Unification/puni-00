# Verification

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
     be-01 (bun:test)          480 pass  0 fail  (49 files; was 469 on
                                                  change/schedule-on-item-role)
     every bun:test project    917 pass  0 fail
     fe-01 (vitest)            612 pass  0 fail  (25 files, not one of them edited)

$ bunx nx run-many -t test --parallel=2 --skip-nx-cache
NX   Successfully ran target test for 21 projects

$ bunx openspec validate --all --json
42 items, 42 passed, 0 failed — resource-leveling valid
```

**Not run, deliberately:** `bun run e2e`. be-01 only, and fe-01 is provably
untouched — `git diff change/schedule-on-item-role -- apps/fe-01` is **0 lines**.
The projection keeps the wire shape and the one new field rides the tree's
existing spread through the controller, so the client had nothing to adapt to.
The worktree has no dev stack or chromium either.

No migration and no schema change, so the migration lint has nothing to say
about this change.

## The perf budget

`service/schedule-benchmark.test.ts`, inside the ordinary `bun test` run:
20 phases × 10 work items × 3 roles = **220 rows, 600 slices**, 60-odd
dependencies (some declared between phases, expanding to every pair of leaves
beneath them), eight people, and `waitingForPerson` of 159 — leveling binds in
the fixture, which a second test asserts so the benchmark cannot be timing the
pass that already existed.

```
best of five runs, after a warm one:  2.9 ms   (budget: 10 ms)
```

Falsifiable, and watched failing twice: with the fixture at four times the size
(880 rows, 2,400 slices) the same assertion read **18.6 ms**, and with the
eligible set scanned linearly instead of held in a heap, **32.3 ms**.

## The checks, and the faults that broke them

| Check                                                              | Fault injected                                                                  | What the run reported                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A person's queue is a floor (`schedule.ts`, `placeSlices`)         | the person floor dropped from the floor list                                    | nine leveling tests failed; `runs two work items assigned to one person one after the other` put `b` at 0→2 while `kat` was on `a` until day 3                      |
| …and the floor is where the slice **landed**                       | the queue recorded from that slice's **critical-path** finish — v1's one re-run | `does not re-overlap a person downstream of a dependency push` failed **alone**: `r` came back at 5→7 on top of `q` at 4→6, `boundBy: 'predecessor'`                |
| The priority is soonest-then-tightest (`schedule.ts`, `goesFirst`) | the first two comparisons deleted, leaving the plan's own order                 | `gives the queue to the slice that can start soonest, before the one with less slack` put `kat` on a slice she could not begin for three days; the project ran to 7 |
| A tie is not a person waiting (`schedule.ts`, `placeSlices`)       | `floor.at < start` instead of `<=`, so a later floor takes a tie                | `names the predecessor, not the person, when the two land on the same day` read `boundBy: 'person'` for a row whose assignee was free the moment it could start     |
| A zero-length slice takes no queue place                           | the length dropped from the condition                                           | `gives a slice nobody has estimated no place in the queue` put an empty `QA` at day 5 and took its work item's finish from 3 to 5 with it                           |
| Slack counts the people (`schedule.ts`, the augmented graph)       | the backward pass run over the plan's edges alone                               | `counts the person behind a slice as a reason it cannot slip` reported three days of slack on a slice whose assignee goes straight from it onto the critical path   |
| The projection aggregates when the slices do not tile              | `tiles` forced to `true`                                                        | `reports the least slack of a work item whose slices a person pushed apart` read a slack of 5 on a row holding a critical slice                                     |
| …and reads the ends when they do                                   | `tiles` forced to `false`                                                       | the differential failed at seed 256: `r1.float` `12.333333333333332` became `12.33333333333333`                                                                     |
| The assumed assignee is a queue (`work-item.service.ts`)           | the `assumedAssignee` fallback dropped from the adapter                         | `queues every phase of a work item its one assignee is assumed to be doing` finished the work item on day 3, its `QA` running while its own assignee was elsewhere  |
| The pass refuses a cycle (`schedule.ts`, `placeSlices`)            | the leftover-slices throw deleted                                               | `throws on a cyclic graph rather than returning a schedule` failed with `no placement for slice a\0role-dev` — an untyped error, which `tree` rethrows as a 500     |
| `written` is reached at all (`schedule.ts`)                        | the same fault                                                                  | that error came **from** `written`, which is where the fail-closed read stopped a plan being scheduled around missing placements                                    |
| The write path still refuses loops (`schedule.ts`, `topological`)  | the `topological` throw deleted                                                 | six `canDepend` tests failed, `refuses an edge whose expansion closes a cycle through a parent` among them                                                          |
| A slice's finish is anchored (`schedule.ts`, `placeSlices`)        | written as `start + (offsets[at + 1] - offsets[at])`                            | the differential failed at seed 260: `r0c0.latestStart` `10.666666666666666` became `10.666666666666668`                                                            |
| A slice's late start is anchored (`schedule.ts`, `lateTimes`)      | written as `finish - (offsets[at + 1] - offsets[at])`                           | the differential failed at seed 255: `r2.latestStart` `0` became `6.661338147750939e-16` — a row that had no slack acquiring some                                   |
| The differential runs through the **leveller**                     | slices with no person given one shared queue                                    | the differential failed at seed 1 (`r0c0g0.earliestStart` `0` became `3.3333333333333335`) and both live-plan tests failed with it                                  |
| The budget is a measurement (`schedule-benchmark.test.ts`)         | the fixture at 4×; separately, the heap replaced by a linear scan               | `schedules 600 slices in under 10ms` read 18.6 ms and 32.3 ms                                                                                                       |

Every row was watched failing and then watched passing again on the same file,
2026-08-09.

## What the identity claim rests on

The same three oracles `schedule-on-item-role` built, all of them now running
through the levelled engine with every slice carrying `personId: null`:

1. **The existing suite.** `service/schedule.test.ts` — unchanged below its
   adapter, which gained the one field.
2. **The differential** (`service/schedule-identity.test.ts`): a thousand seeded
   plans through the 2026-08-08 engine and this one, every field `toBe`-equal.
3. **The live capture** (`service/live-plan-identity.test.ts`): a real project's
   `/work-items` response, replayed through `WorkItemService.tree`, asserted
   field by field including calendar dates.

None of them is a fixture that goes around the new code: making unassigned
slices share one queue turns all three red, at seed 1 and on the captured plan's
first row. That is the whole of item 6 of the roadmap's S2 — leveling is
invisible when it does not bind, and provably so.

## What is bounded, and what is not claimed

**Not optimal, and not claimed to be.** Deterministic list scheduling is a
heuristic; a plan where another order finishes sooner is easy to construct. The
spec says so in the requirement itself so nobody reads the dates as a bound.

**One person's queue is global to the project.** Somebody assigned in two
phases serialises them. True, and `waitingForPerson` plus the per-slice
`boundBy` are what make it legible rather than mysterious.

**Structural, therefore unfalsifiable, and recorded as such.** `written`'s
throws on the maps the pass has just filled cannot be made to fire by any input
while the cycle refusal stands — one of them was reached only by deleting that
refusal, which is the row in the table above. The rest are guards against a
future mistake in this file, not against data.

**Carried forward from `schedule-on-item-role`:** a leaf estimated in three or
more roles is summed in role order where the previous engine summed in
estimate-row order, which can differ in the last bit. Unchanged by this change,
and unchanged in coverage: the differential still covers up to three roles.

**Not measured here:** the schedule header itself. This change puts the count on
the wire and tests it out of the controller; the sentence a reader sees is `H`'s
and `G`'s work.
