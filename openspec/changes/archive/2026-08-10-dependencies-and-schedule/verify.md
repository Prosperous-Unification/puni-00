# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   664 pass  0 fail
      fe-01 (vitest)                         114 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/dependencies-and-schedule
Totals: 8 passed, 0 failed (8 items)
```

## Every check, and the fault that broke it

| Check                                                                       | Fault injected                                                    | What the run reported                                                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A cyclic graph is never scheduled (`schedule.ts`)                           | the topological sort's throw deleted                              | only `throws on a cyclic graph rather than returning a schedule` failed — it returned a schedule with the cycle's rows silently missing                   |
| An unestimated leaf says so (`schedule.ts`)                                 | `estimated` hard-coded to `true`                                  | the unestimated leaf and the parent above it both claimed someone had looked                                                                              |
| A parent spans rather than sums (`schedule.ts`)                             | `spanFinish` summed instead of maxed                              | both `parents` tests failed, reporting a 4-day branch as 7 days long — which is its effort, not its length                                                |
| A cycle is refused at the write (`dependency.ts`)                           | the `canReach` refusal deleted                                    | all three cycle tests failed: the pair, the three-item loop, and the one closed through a parent                                                          |
| An ancestor edge is refused (`dependency.ts`)                               | the `isWithin` branch deleted                                     | exactly the three `ancestor` tests failed — onto itself, its parent, its child                                                                            |
| The cycle search follows the tree (`dependency.ts`)                         | narrowed to `predecessorId === here`                              | only `follows the tree when a cycle runs through a parent` failed — the API accepted an edge the schedule would then have thrown on                       |
| The service honours the refusal (`work-item.service.ts`)                    | `canDepend`'s answer ignored                                      | four failed across the service and the routes, including the 409                                                                                          |
| A deleted work item takes its edges (`work-item.service.ts`)                | `removeAllFor` deleted from the cascade path                      | only `takes a work item's edges with it when it is deleted` failed                                                                                        |
| The route parses its own body (`work-item.controller.ts`)                   | the `predecessorId` shape check removed                           | only `answers 400 when no predecessor is named` failed                                                                                                    |
| An unknown number is not sent (`wbs-table.tsx`)                             | the "no work item numbered" refusal replaced with a silent return | only `says so when the number typed is not a work item` failed                                                                                            |
| An unestimated row is marked (`wbs-table.tsx`)                              | the `?` suffix removed                                            | only `marks a row with no estimate rather than showing a bare zero` failed                                                                                |
| Day offsets are rounded for display (`wbs-table.tsx`)                       | `showDay` made the identity                                       | only the start-date test failed, showing `3.3333333333333335`                                                                                             |
| A cyclic project still reads (`work-item.service.ts`)                       | the `try`/`catch` around `schedule` removed                       | only `still reads a project whose dependencies contain a cycle` failed — the read threw and the project could not be opened at all                        |
| No edge is accepted that the schedule would refuse (`dependency.ts`)        | the `hasCycle` refusal deleted                                    | six failed, including the two shapes the old hand-rolled search let through and the pairwise equivalence check                                            |
| An edge survives a delete by a release that cannot see it (`migration.sql`) | `ON DELETE CASCADE` removed                                       | `takes its dependencies with it rather than refusing the delete` failed with `FOREIGN KEY constraint failed` — the 500 the old colour would have returned |
| No schedule means no numbers (`wbs-table.tsx`)                              | `showSchedule` made unconditional                                 | only `shows dashes rather than zeroes when there is no schedule` failed, printing a page of `0`s under a banner saying no dates could be worked out       |
| The table shows be-01's schedule (`wbs-table.tsx`)                          | the start cell hard-coded to `0`                                  | three failed — the tests read a fixed, distinctive schedule from `api.tree` rather than one the fake computed                                             |

## Two things found while wiring it, not by the tests

**Deleting a work item left its edges behind**, and the foreign keys refuse that
— so deleting anything another row depended on would have failed with a
constraint error the caller could do nothing about. Caught by writing the test
for it before the code.

**The second delete path had the same hole.** `remove` has two branches, cascade
and promote, and fixing the first left the second untouched with every test
green. Found by asking whether the fix covered both rather than trusting the
suite to say. It has its own test now, and its own fault injection above.

## Against the running dev deployment

A plan with a parallel branch, built through the API at
`dev.wbs.bulletpoints.club` on `c15cf39`, against dev's SQLite:

```
[sched] 010 Strip  start 0 end 3 slack 2
[sched] 020 Sand   start 0 end 5 slack 0  ← critical
[sched] 030 Paint  start 5 end 7 slack 0  ← critical
[sched] 040 Tidy   start 0 end 1 slack 6
[sched] paint starts at 5 (the longer predecessor): true
[sched] project ends at day 7: true
[sched] sand is critical: true
[sched] strip has 2 days of slack: true
[sched] tidy is not critical and has slack: true
[sched] cycle refused: … -> 409: {"error":"cycle"}
[sched] PASS
```

And the reviewers' critical case, run against the same deployment on `3e8f39e`:

```
[cycle] leaf depends on after (after → leaf): accepted
[cycle] after depends on phase — expands to leaf → after, closing the loop: 409 {"error":"cycle"}
[cycle] project still reads: 3 rows, scheduleError: null
[cycle] PASS
```

The first version of that script had the direction backwards — the route's `:id`
is the _successor_ — so it drew the same edge twice and reported the bug as still
present. Worth recording: a check that fails is not automatically a check that
found something.

`Paint` waits for both `Strip` (3 days) and `Sand` (5 days) and starts on day 5,
which is the point of the whole change: it waits for the **longer** one. `Sand`
sets the project's length and is marked critical; `Strip` finishes two days early
and its slack says so; `Tidy` depends on nothing and floats. The cycle is refused
with a 409 rather than stored.

## Cross review, 2026-08-06 (codex + agy)

**Six findings, all real, all fixed.** Both reviewers independently found the
same critical one, with different examples.

**`canDepend` accepted an edge the schedule then threw on** — through one
ordinary request, not a race. It walked the _written_ edges with its own
tree-aware reachability and compared ids, so reaching a leaf did not count as
reaching the parent an edge had been declared on. codex's example is a parent
whose only leaf already points back; agy's is two branches whose leaves cross.
Both store an edge, and every later read of that project throws.

The fix is not a better search. `canDepend` now expands the proposed edge exactly
as `schedule` does — same function, same graph — and asks whether the result can
be ordered. There is no second implementation left to disagree, and a test walks
every ordered pair in a fixture tree asserting that nothing `canDepend` accepts
makes `schedule` throw.

The rest:

- **The catch was unqualified** (codex). Every exception in that block became
  "your dependencies run in a circle" — a stack overflow on a deep tree, a future
  mistake in the duration sum, anything. `ScheduleCycleError` is a type now and
  only it degrades.
- **The foreign keys had no cascade** (agy). Blue and green share one SQLite
  file: the outgoing release has never heard of this table, and its plain
  `DELETE FROM work_item` would hit a constraint it cannot see and answer 500.
  This is the migration-compatibility rule in `AGENTS.md`, and it took a reviewer
  to see it.
- **A parent's `float` contradicted its own `latestStart`** (both, from opposite
  directions). Slack is the least any descendant has, and `latestStart` and
  `latestFinish` are derived from it, so `float === latestStart - earliestStart`
  holds for a parent as it does for a leaf. `critical` falls out of it rather
  than being a separate rule.
- **The complexity was worse than claimed** (codex). The child index was rebuilt
  twice per edge and once per parent, and adjacency arrays were rebuilt with a
  spread. Indexed once now, appended in place — and measured rather than
  asserted: 2,000 leaves across 100 branches with 39,600 expanded edges
  schedules in **63 ms**, with a test that fails past four seconds.
- **A cycle rendered a page of zeroes** (agy) under a banner saying no dates
  could be worked out. The columns show `—`.
- **The table tests proved the fake** (both). The fake computes its own
  miniature schedule, so a date assertion said nothing about the table. Three
  tests now read a fixed, distinctive schedule from `api.tree`; the algorithm is
  be-01's and is tested there.

One claim was **corrected rather than fixed**: the schema comment said
`projectId` made a cross-project edge unrepresentable. It does not — the three
foreign keys are independent. `canDepend` refuses one and the read now drops a
predecessor that is not in the project, but the database would store it.
Enforcing it needs composite keys, which is a migration this change does not
need. The comment says so.

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
- **A graph larger than a real plan.** 2,000 leaves and 39,600 expanded edges
  schedule in 63 ms, and there is a test that fails past four seconds. The
  leaf-edge expansion is still quadratic in the leaves under each end of a
  parent-declared edge, so a pathological shape — two branches of a thousand
  leaves with an edge between them — would produce a million edges. Not staged.
- **Two people drawing conflicting edges at the same instant** can still leave a
  cycle: each is checked against the graph as they read it, so the second can be
  accepted against a graph the first had already changed. That is **handled
  rather than prevented** — the read keeps the rows, shows `—` for every date and
  says which edge to remove. Preventing it needs the check and the insert in one
  transaction, which is a repository change rather than a service one. This is
  now the _only_ way a cycle can reach the database; one request cannot.
- **Cross-project edges at the database level.** `canDepend` refuses one and the
  read drops it, but the schema would store it. Composite foreign keys would fix
  it and are not in this change.
