# verify — `role-progress`

Branch `change/role-progress`, cut from `main` @ `8269ebd` (#79 `actual-days`
merged) on 2026-08-18. **Prod mode** — the diff opens with a migration and it
touches `libs/domain`.

`apps/be-01/**` and `libs/domain/**` only. Nothing under
`apps/fe-01/src/components/wbs/` is touched: the payload carries `progress` and
`state` and nothing draws them yet, which is the position `actual-days` left
`actuals` in one change ago.

## The three facts this rests on, re-verified in this tree first

A design brief is a claim about a tree that has since moved. All three were read
at `8269ebd` before a line was written.

| claim                                           | where                                                                | what is there                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **there is still no completion state anywhere** | `repository/schema.ts`, `libs/domain/src/*.ts`                       | `grep -inE "status\|done\|progress\|percent"` finds no column and no field before this change. That absence is what makes an actual unreadable — `actual-days`' design.md D3, and this change's Why |
| the actual is keyed `(work_item_id, role_id)`   | `repository/schema.ts` (`actual`), `repository/actual.ts`            | per role, `NOT NULL`, absence spelled as the absence of a row. This table is keyed the same way for the same reasons — design.md P3                                                                 |
| effort reaches the engine at exactly one line   | `service/work-item.service.ts` (`days.set(sliceKey(…), finalDays…)`) | `slicesOf` is handed the **estimates**. This change adds a read beside it and passes it to nothing — design.md P5, and F16 below is the watched red for that                                        |

## The migration stamp, and the collision check

**Chosen: `20260818010000_add_role_progress`.** Twelve hours past
`20260817130000_add_actual`, which #79 merged, and later than all nineteen
folders on disk.

The check, run before the folder was created:

```
$ ls apps/be-01/drizzle | sed 's/_.*//' | sort | uniq -d
(no output — no stamp is shared)
$ ls apps/be-01/drizzle | sort | tail -3
20260814110000_add_priority_band
20260817120000_add_plan_event
20260817130000_add_actual
```

Mechanical as well as by eye: `duplicateMigrationStamps` in `migrate-down.ts` is
called from `readMigrationFolders`, so a shared stamp throws where the folders
are read. `20260818010000` passes it, and `refuses a folder set that shares one
stamp between two migrations` is still green.

`does nothing when the target is already the newest applied` in
`migrate-down.test.ts` now names **this** migration, which is the case the
2026-08-14 collision broke: `migrationsToRollback` filters on a strict
`created_at >`, so a baseline sharing its stamp answers `[]` both when there is
nothing to reverse and when there is.

There is deliberately **no `drizzle/meta/_journal.json`** in this repo, and none
was added.

## Up and down, through the real CLIs

Run on **h2puni**, `bun 1.3.14`, against a fresh file at
`/var/tmp/role-progress-cli/wbs.db`. `DB_PATH`, not `WBS_DB_PATH` — the CLIs read
the former and throw without it.

```
$ bun --version
1.3.14
$ export DB_PATH=/var/tmp/role-progress-cli/wbs.db
$ bun run src/migrate-status-cli.ts
none
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260818010000_add_role_progress
$ # what arrived
table role_progress
index role_progress_by_role
```

Then a plan written the way the release writes one — a project, a role, a work
item, an estimate, a recorded actual and one role said to be done — the `CHECK`
tried, and the reverse:

```
$ # one plan, one estimate, one recorded actual, one role said to be done
role_progress rows: 1 | state: done
$ # a fourth state, refused by the CHECK
CHECK constraint failed: role_progress_state
$ bun run src/migrate-down-cli.ts --to=20260817130000_add_actual
rolled back: 20260818010000_add_role_progress
$ bun run src/migrate-status-cli.ts
20260817130000_add_actual
$ # what is left
role_progress objects: []
actuals still here: 1 | estimates: 1 | work items: 1 | actual table: 1
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260818010000_add_role_progress
```

Five things in that transcript are the point. The `CHECK` is real in the
database rather than only in the type — the closed set the whole design rests on
(design.md P2). The rollback names **exactly one** migration, not `[]`, which is
what a shared stamp produces and what 2026-08-14 produced silently. The index
goes with the table. **Every figure survives**: the recorded day, the estimate
and the work item are all still there, so what the rollback takes away is the
answer to "which of the two sentences is this?" and never a number anybody typed.
And `actual` is untouched, because this rollback stops at it.

## The scheduler did not move — checked, not assumed

```
$ git diff --stat origin/main -- apps/be-01/src/service/schedule.ts
(no output)
```

**Empty diff.** `libs/domain` is _not_ empty this time and is not claimed to be —
`progress.ts` and its test are new there, which is why this change is in prod
mode. What that file adds is a fold and three type names; nothing in it is called
from `schedule.ts`, and the `libs/domain` diff is `index.ts` plus two new files:

```
$ git diff --stat origin/main -- libs/domain
 libs/domain/src/index.ts         |  1 +
 libs/domain/src/progress.test.ts | 79 +++++++++++++++++++++++++++++++++
 libs/domain/src/progress.ts      | 95 ++++++++++++++++++++++++++++++++++++++++
```

The mechanical half is above. The behavioural half is **F16**: the engine wired
to skip a finished role's slice — the obvious reading of "done", and the one the
next change has to argue for deliberately — watched failing on eight moved dates,
and reverted. An empty diff on `schedule.ts` says nothing about what is _handed_
to it, and that is where this change's plausible fault lives.

The third leg is the corpus: the two identity oracles replay sixteen captured
plans through this build and compare every field of every work item and every
slice against what be-01 answered before any of this existed. They pass, and they
now **assert the two new keys** — `progress: {}` and `state: 'not_started'` —
rather than dropping them. F19 is what makes that non-vacuous.

## The gate

Run on **h2puni** over plain ssh, in `/home/puni1/wd/puni/wt-role-progress`, at
the head this file is being written against. Nothing was compiled or tested on
h1claw; that box denies both (`bin/block-local-builds.sh`).

| target                                            | result                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                      | clean, exit 0                                                                                      |
| `bunx nx run-many -t lint typecheck --parallel=2` | pass, **21 projects** (`--skip-nx-cache`)                                                          |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)      | **884 pass, 0 fail**, 26,822 `expect()` calls, 19.04s across **70 files**                          |
| gw-01 unit (bun **1.3.14**)                       | **45 pass, 0 fail**, 8 files                                                                       |
| `libs/domain` unit (bun **1.3.14**)               | **73 pass, 0 fail**, 5 files                                                                       |
| fe-01 unit (`nx run fe-01:test --skip-nx-cache`)  | **1,478 pass across 53 files, 0 fail**                                                             |
| `bunx @fission-ai/openspec@1.3.0 validate --all`  | **64 passed, 0 failed**                                                                            |
| secrets scan over every tracked file              | clean                                                                                              |
| doc caps                                          | clean                                                                                              |
| migration lint over every tracked `.sql`          | clean                                                                                              |
| `bunx nx run-many -t build`                       | **7 projects pass**; `tool-devsync:build` and `tool-bootstrap:build` **could not run** — see below |

be-01 was **829 tests before this branch** and is 884 after: **55 new cases**
across seven files (`repository/role-progress.test.ts` 10,
`service/progress.test.ts` 21, `repository/migrate.test.ts` 6,
`repository/role.test.ts` 2, `service/roll-up.test.ts` 8, `service/undo.test.ts`
2, `controller/work-item.controller.test.ts` 6). `libs/domain` was **65** and is
**73**: eight new cases in `progress.test.ts`.

**The one step that did not run on h2puni, stated rather than glossed:**
`tool-devsync:build` and `tool-bootstrap:build` shellcheck the deploy scripts,
and `shellcheck` is not installed on h2puni (`which shellcheck` → absent). Both
targets refuse rather than skipping, which is the correct behaviour and is why it
is visible at all. This branch touches no shell script — the diff is TypeScript,
SQL and markdown — and CI's `gate` job asserts `shellcheck --version` before it
runs anything, so **CI is the record for those two targets**. Every other build
target passed here. The same gap `actual-days` recorded one change ago.

## CI

**Run `32080942490` at `197566f` — `success`, both jobs, first attempt.** `gate`
and `pixels` each green. `gate` is the record for the two shellcheck build
targets h2puni could not run.

`pixels` ran despite this branch touching no `apps/fe-01` file, which is the
condition `notes/delivery-modes.md` recorded as adopted on 2026-08-17 but which
the workflow does not yet implement — 8m50s of a 12m round, on a diff of
TypeScript, SQL and markdown. Worth doing, and it is not this change's to do.

**And the doc-only tail commit reddened `pixels`, for the fourth time on this
repo.** Run `32081652671` at `0723ecc` — a commit touching this file and nothing
else — failed `pixels` amid a flood of `[vite] ws proxy error: Error: write
EPIPE` and `read ECONNRESET`, with `gate` green beside it. That is the same class
#73, #78 and #79 each recorded: a markdown-only diff, no UI or CSS code within
reach of the branch, and a proxy the layout gate's web server cannot keep up.
`gh run rerun --failed` passed clean — **`32081652671`, both jobs `success` on the
rerun**.

Four sightings is no longer a flake anybody should be re-diagnosing per PR. Two
things would each have prevented this one: running `pixels` only when
`apps/fe-01/**` changed, which was adopted on 2026-08-17 and not implemented; and
whatever fix the ws-proxy floods actually need. Neither is this change's, and both
are now overdue.

## Failure-proof table (R5)

Nineteen faults, each injected into the branch as it stands, watched on h2puni
with `bun 1.3.14`, and reverted. Counts are from the files named beside each, not
from the whole suite.

| #   | fault injected                                                                           | test that observed it                                                                           | result                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `ON DELETE CASCADE` struck from `role_progress.work_item_id` in the migration            | `lets the outgoing release keep deleting work items against the migrated schema`                | **35 pass, 1 fail** — `FOREIGN KEY constraint failed` on the outgoing release's own `DELETE FROM work_item`: a 500 for the length of a blue/green swap, on a statement blue has always run                     |
| F2  | `ON DELETE CASCADE` **added** to `role_progress.role_id`                                 | `keeps a role that has been said to be done undeletable behind the repository that counts them` | **35 pass, 1 fail** — `Received function did not throw`, and the statement silently gone: finished work turned back into work nobody has started, with nothing to say so                                       |
| F3  | the `CHECK` widened to `('in_progress','done','blocked')`                                | `refuses a state outside the three the design has`                                              | **35 pass, 1 fail** — `Received function did not throw`: a fourth state stored on a real plan that every reader dispatches on and nothing folds. design.md P2                                                  |
| F4  | `agree` written to prefer `done` over a disagreement                                     | `answers in progress for every disagreement, including finished against untouched`              | **6 pass, 2 fail** — `Expected "in_progress" / Received "done"`: a plan reporting finished work that nobody has tested, which is the claim this feature exists to prevent                                      |
| F5  | `stateOf` reading an empty collection as `done`                                          | `reads an empty collection as not started, never as vacuously done`                             | **7 pass, 1 fail** — every empty branch in a fresh plan reporting finished work                                                                                                                                |
| F6  | `workedRolesOf` fed the statements alone, dropping the estimates and the actuals         | `is in progress when one role is done and another has said nothing`                             | **17 pass, 4 fail** — `Expected "in_progress" / Received "done"`: the fold hears only the voice that spoke and agrees with itself. design.md P4                                                                |
| F7  | `rollUpItemStates` folded from the parent's own role map instead of from its children    | `keeps a branch off done while one of its rows has never been spoken about`                     | **20 pass, 1 fail** — `Expected "in_progress" / Received "done"`. **This is the finding — see below**                                                                                                          |
| F8  | `progress.moveAll` struck from `create`                                                  | `hands a statement down when a leaf gains its first child, and back up on undo`                 | **20 pass, 1 fail** — the child empty: a `done` left on a row whose reading is now folded, invisible to every face and back on screen the day the child is deleted                                             |
| F9  | the hand-up loop struck from `remove`                                                    | `hands the branch’s reading up when its last child is deleted`                                  | **19 pass, 2 fail** — the parent empty where `done` is owed: the branch's record gone with the cascade while its estimates survive beside it                                                                   |
| F10 | the restore's `progress` replaced by `[]`                                                | `restores every statement made in a deleted branch, against the real cascade` (`undo.test.ts`)  | **59 pass, 2 fail** — an empty list where two statements are owed: a branch that comes back from an undo reading as work nobody has started                                                                    |
| F11 | `spoken.length > 0` dropped from the role removal's `in_use` condition                   | `counts the stated progress, and refuses an unconfirmed removal of a role that holds only that` | **19 pass, 1 fail** — the removal proceeding against a role whose only usage is the statement that its work is done                                                                                            |
| F12 | `tx.delete(roleProgress)` struck from `RoleRepository.remove`                            | `deletes the stated progress with the role it confirmed, moving the work items that lost one`   | **19 pass, 1 fail** — the foreign key thrown out of the transaction: the 500 a bare role delete answers, which is the loud failure the missing cascade is _for_                                                |
| F13 | the duplicate copies the original's statements into the copy                             | `copies the estimate into a duplicate and leaves the statement behind`                          | **20 pass, 1 fail** — a copy reporting itself finished the moment it appears: the actual's lie in a stronger tense                                                                                             |
| F14 | `isRoleState` replaced by a `typeof state === 'string'` check in `parseProgress`         | `refuses a state outside the two a role may be put in, not_started included`                    | **44 pass, 1 fail** — 200 for `{"state":"not_started"}`: a value the column's `CHECK` then refuses, turning a 400 into a 500                                                                                   |
| F15 | the `before !== null` skip removed from `clearProgress`                                  | `records nothing at all for clearing a statement that was never made`                           | **20 pass, 1 fail** — `+ "clear_progress"`: a history row and an undo entry for a command that changed nothing                                                                                                 |
| F16 | **the engine reads the state** — `slicesOf` handed the estimates with the done roles cut | `moves no date: the plan schedules identically with and without a state`                        | **20 pass, 1 fail** — eight fields of moved dates. This change's whole product decision as a red test                                                                                                          |
| F17 | the payload's `progress` replaced by `{}`                                                | six service and controller cases                                                                | **877 pass, 7 fail** over the whole be-01 suite — every read of a stated role empty. The broadest of the nineteen, and the cheapest to have shipped                                                            |
| F18 | `moveAll` bumping both revisions unconditionally                                         | `moves every statement to another work item, and moves neither revision when there was nothing` | **9 pass, 1 fail** — `Expected: 2 / Received: 3`: a work item reporting a write for a create that touched no row of this table, on every plan that has nothing stated at all                                   |
| F19 | the payload's `not_started` filter dropped, so silence is spelled on the wire            | the two identity oracles                                                                        | **3 pass, 2 fail** — both replays red on the extra keys against sixteen captured plans. **This is what makes the lift non-vacuous**: without the assertion, a payload that invented states would pass silently |

**F7 is the finding of this change, and it is a semantic one rather than a
mechanical one.** The item state was first folded from the parent's own rolled-up
role map, which is the obvious implementation and reads as correct: the map is
already `agree`-folded, so folding it again gives the branch's state. It is
wrong for a reason nothing in the brief predicted. `foldByRole` only combines the
roles its children actually hold, so a child with no estimate, no recorded day and
nothing said contributes **no key at all** — and a branch whose first child is
finished and whose second is empty folded to `{dev: done}` and read as **done**,
which is a claim about the empty child that nobody made. That is the same failure
the design refuses one level down, arriving one level up through a helper that was
written for sums. The item state is now folded recursively over the children;
design.md P6 argues it, and `a branch is not done while one of its rows has never
been spoken about` is the case.

It was found by a red test rather than by review: the case as first written
expected `in_progress` and got `done`, and the first instinct — that the test was
wrong — was checked against what the branch actually claims about the empty row.

## What is deliberately not here

- **The four faces and the export columns (H3), snapshots (H4), the history view
  (H5).** No `wbs-table.tsx`, no `plan-cards.tsx`, no `plan-export.ts`. The
  payload carries `progress` and `state` and nothing draws them.
- **No variance anywhere.** It is `actual − final`, derived on read, and it
  belongs to the surface that shows it. What this change buys H3 is that the
  variance can now be a **sentence** — _"8 spent against 5 estimated, finished,
  +60%"_ — instead of a figure whose tense the reader has to guess.
- **No actual start or finish dates.** design.md's "does not decide", and the
  reason is that a stored date disagreeing with the scheduled one needs a
  decision about which the chart draws.
- **No WS event.** Statements ride `work_items_changed`, which already carries
  the touched item and its ancestors, so `broadcast.ts`'s nine events are
  unchanged.
- **No schedule change**, and the empty diff is stated above as a claim that was
  checked.

## What the next change inherits, and what it must not re-litigate

The change that lets the engine consume this is the one this exists for. Three
things are fixed here so that change does not have to reopen them:

1. **An actual on a `done` role is final** — the whole of what that role spent.
   Written in `schema.ts`, in the route's OpenAPI description, in design.md P5 and
   as a `SHALL` in the spec delta.
2. **A `done` role with no actual means "finished, days unknown."** What the
   engine does with it — fall back to the estimate, or treat the slice as
   zero-remaining — is that change's decision and nobody else's.
3. **`remaining = max(0, estimate − actual)` for an in-progress role** is the
   shape the design was written against. It is not implemented and nothing here
   depends on it.

What that change owes, and this one does not: re-baselining
`live-plan-identity.test.ts` and the capacity oracle, because every plan with one
statement on it will move. That cost belongs to the decision to move dates, not
to the decision to record them.

## Open — one question for Dany

**Should `blocked` exist?**

Not in this change, for design.md P2's reason: it is a question the engine must
answer the day it reads this table, and the engine is not reading it yet. But it
is the state people ask for first after `done`, and the honest time to add it is
**before** the engine change rather than after — a blocked predecessor's effect
on its successors' floor is exactly the kind of rule that is cheap to agree in
advance and expensive to retrofit onto rows that already exist.
