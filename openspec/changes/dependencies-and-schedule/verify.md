# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   656 pass  0 fail
      fe-01 (vitest)                         111 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/dependencies-and-schedule
Totals: 8 passed, 0 failed (8 items)
```

## Every check, and the fault that broke it

| Check                                                        | Fault injected                                                    | What the run reported                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A cyclic graph is never scheduled (`schedule.ts`)            | the topological sort's throw deleted                              | only `throws on a cyclic graph rather than returning a schedule` failed — it returned a schedule with the cycle's rows silently missing |
| An unestimated leaf says so (`schedule.ts`)                  | `estimated` hard-coded to `true`                                  | the unestimated leaf and the parent above it both claimed someone had looked                                                            |
| A parent spans rather than sums (`schedule.ts`)              | `spanFinish` summed instead of maxed                              | both `parents` tests failed, reporting a 4-day branch as 7 days long — which is its effort, not its length                              |
| A cycle is refused at the write (`dependency.ts`)            | the `canReach` refusal deleted                                    | all three cycle tests failed: the pair, the three-item loop, and the one closed through a parent                                        |
| An ancestor edge is refused (`dependency.ts`)                | the `isWithin` branch deleted                                     | exactly the three `ancestor` tests failed — onto itself, its parent, its child                                                          |
| The cycle search follows the tree (`dependency.ts`)          | narrowed to `predecessorId === here`                              | only `follows the tree when a cycle runs through a parent` failed — the API accepted an edge the schedule would then have thrown on     |
| The service honours the refusal (`work-item.service.ts`)     | `canDepend`'s answer ignored                                      | four failed across the service and the routes, including the 409                                                                        |
| A deleted work item takes its edges (`work-item.service.ts`) | `removeAllFor` deleted from the cascade path                      | only `takes a work item's edges with it when it is deleted` failed                                                                      |
| The route parses its own body (`work-item.controller.ts`)    | the `predecessorId` shape check removed                           | only `answers 400 when no predecessor is named` failed                                                                                  |
| An unknown number is not sent (`wbs-table.tsx`)              | the "no work item numbered" refusal replaced with a silent return | only `says so when the number typed is not a work item` failed                                                                          |
| An unestimated row is marked (`wbs-table.tsx`)               | the `?` suffix removed                                            | only `marks a row with no estimate rather than showing a bare zero` failed                                                              |
| Day offsets are rounded for display (`wbs-table.tsx`)        | `showDay` made the identity                                       | only the start-date test failed, showing `3.3333333333333335`                                                                           |
| A cyclic project still reads (`work-item.service.ts`)        | the `try`/`catch` around `schedule` removed                       | only `still reads a project whose dependencies contain a cycle` failed — the read threw and the project could not be opened at all      |

## Two things found while wiring it, not by the tests

**Deleting a work item left its edges behind**, and the foreign keys refuse that
— so deleting anything another row depended on would have failed with a
constraint error the caller could do nothing about. Caught by writing the test
for it before the code.

**The second delete path had the same hole.** `remove` has two branches, cascade
and promote, and fixing the first left the second untouched with every test
green. Found by asking whether the fix covered both rather than trusting the
suite to say. It has its own test now, and its own fault injection above.

## Found by writing the "does not cover" section

Listing the concurrency case as a caveat made it obvious it was not a caveat: two
conflicting edges would leave a cycle, and **every read of that project would
throw**. A plan nobody can open is worse than one with no dates in it.

So `tree` catches it, keeps the rows, drops the dates and reports
`scheduleError: 'cycle'`, which the table renders as a sentence naming the fix.
`schedule` still throws — it is the boundary assertion and stays one — and the
caller now models the condition instead of propagating it. Its own fault
injection is in the table above.

## What this does not cover

- **A calendar.** Every number is a whole-day offset from the project's day zero.
  Weekends, holidays and part-days are a non-goal, stated in the proposal rather
  than discovered later.
- **Resource levelling.** Two work items with no dependency between them both
  start on day 0 even if one person would have to do both. Nobody is assigned, so
  nothing can be levelled.
- **The other three relation types, and lag.** Finish-to-start only. The table has
  room for a kind when one is wanted.
- **A large graph.** The schedule is one topological pass and two linear walks,
  but the leaf-edge expansion is quadratic in the leaves under each end of a
  parent-declared edge. Fine for a breakdown of hundreds; not measured beyond it.
- **Two people drawing conflicting edges at the same instant** can still leave a
  cycle in the database: each is checked against the graph as they read it, so
  the second can be accepted against a graph the first had already changed. That
  is **handled rather than prevented** — the read catches it, keeps the rows,
  drops the dates and says why on screen. Preventing it needs the check and the
  insert in one transaction, which is a repository change rather than a service
  one. A project in that state is readable and fixable by removing an edge.
