# verify — `actual-days`

Branch `change/actual-days`, cut from `main` @ `6a83863` (#76 `plan-history`
merged) on 2026-08-17. **Prod mode** — the diff opens with a migration.

`apps/be-01/**` only. Nothing under `apps/fe-01/src/components/wbs/` is touched —
another agent owns fe-01 tonight — and **`libs/domain` is unchanged**: an actual
is a fact be-01 stores and rolls up, not a rule the two apps share. The four
faces that would draw it are H3's.

## The three facts the brief rests on, re-verified in this tree first

A design brief is a claim about a tree that has since moved. All three were read
at `6a83863` before a line was written.

| claim                                         | where                                                                    | what is there                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **there is no completion state anywhere**     | `repository/schema.ts`, `libs/domain/src/*.ts`                           | `grep -inE "status\|done\|completed\|progress\|percent"` finds no column and no field. Nothing can tell "took 8 days, finished" from "8 days so far" — design.md D3 |
| the estimate's three columns are `NOT NULL`   | `repository/schema.ts:359-361`                                           | `optimistic`, `realistic`, `pessimistic`, all `.notNull()`. A `days` column beside them would force a made-up trio to record a real actual — D1                     |
| effort reaches the engine at exactly one line | `service/work-item.service.ts:141` (`days.set(sliceKey(…), finalDays…)`) | `slicesOf` is handed the **estimates**. This change adds a read beside it and passes it to nothing — D3, and F14 below is the watched red for that                  |

## The migration stamp, and the collision check

**Chosen: `20260817130000_add_actual`.** An hour past `20260817120000_add_plan_event`,
which H1 merged tonight, and later than all eighteen folders that were on disk.

The check, run before the folder was created:

```
$ ls apps/be-01/drizzle | sed 's/_.*//' | sort | uniq -d
(no output — no stamp is shared)
$ ls apps/be-01/drizzle | sort | tail -3
20260814100000_add_work_item_team
20260814110000_add_priority_band
20260817120000_add_plan_event
```

That check is also **mechanical now**, and this is the first migration written
under the guard rather than beside it: `duplicateMigrationStamps` in
`migrate-down.ts` is called from `readMigrationFolders`, so a shared stamp throws
where the folders are read. `20260817130000` passes it — the whole suite reads
that directory on every migration test, and `refuses a folder set that shares one
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
`/var/tmp/actual-days-cli/wbs.db`. `DB_PATH`, not `WBS_DB_PATH` — the CLIs read
the former and throw without it.

```
$ bun --version
1.3.14
$ export DB_PATH=/var/tmp/actual-days-cli/wbs.db
$ bun run src/migrate-status-cli.ts
none
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260817130000_add_actual
$ # what arrived
table actual
index actual_by_role
```

Then a plan written the way the release writes one — a project, a role, a work
item, an estimate and one recorded actual — and the reverse:

```
$ # one plan, one estimate, one recorded actual
actual rows: 1
$ bun run src/migrate-down-cli.ts --to=20260817120000_add_plan_event
rolled back: 20260817130000_add_actual
$ bun run src/migrate-status-cli.ts
20260817120000_add_plan_event
$ # what is left
actual objects: []
estimates still here: 1 | work items: 1 | plan_event table: 1
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260817130000_add_actual
```

Four things in that transcript are the point. The rollback names **exactly one**
migration — not `[]`, which is what a shared stamp produces and what 2026-08-14
produced silently. The index goes with the table. **The plan survives**: every
estimate and every work item is still there, so a release that loses its actuals
still holds every figure it is committed against. And H1's `plan_event` is
untouched, because this rollback stops at it.

## The scheduler did not move — checked, not assumed

```
$ git diff --stat origin/main -- apps/be-01/src/service/schedule.ts libs/domain
(no output)
```

Empty diff on both. That is the mechanical half. The behavioural half is F14
below: the engine wired to read an actual instead of the estimate, watched
failing, and reverted — because an empty diff on `schedule.ts` says nothing about
what is _handed_ to it, and the fault this change could plausibly have is at the
call site rather than in the engine.

The third leg is the corpus: the two identity oracles replay sixteen captured
plans through this build and compare every field of every work item and every
slice against what be-01 answered before any of this existed. They pass, and they
now **assert the new key empty** rather than dropping it — F6.

## The gate

Run on **h2puni** over plain ssh, in `/home/puni1/wd/puni/wt-actual-days`, at the
head this file is being written against. Nothing was compiled or tested on
h1claw; that box denies both (`bin/block-local-builds.sh`).

| target                                            | result                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                      | clean, exit 0                                                                                      |
| `bunx nx run-many -t lint typecheck --parallel=2` | pass, **21 projects**, 42 tasks (`--skip-nx-cache`)                                                |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)      | **829 pass, 0 fail**, 25,764 `expect()` calls, 17.48s across **68 files**                          |
| gw-01 unit (bun **1.3.14**)                       | **45 pass, 0 fail**, 8 files                                                                       |
| `libs/domain` unit (bun **1.3.14**)               | **65 pass, 0 fail**, 4 files                                                                       |
| fe-01 unit (`nx run fe-01:test --skip-nx-cache`)  | **1,451 pass across 53 files, 0 fail**                                                             |
| `bunx @fission-ai/openspec@1.3.0 validate --all`  | **62 passed, 0 failed**                                                                            |
| secrets scan over every tracked file              | clean                                                                                              |
| doc caps                                          | clean                                                                                              |
| migration lint over every tracked `.sql`          | clean                                                                                              |
| `bunx nx run-many -t build`                       | **7 projects pass**; `tool-devsync:build` and `tool-bootstrap:build` **could not run** — see below |

be-01 was **779 tests before this branch** and is 829 after: **50 new cases**
across seven files (`repository/actual.test.ts` 10, `service/actual.test.ts` 17,
`repository/migrate.test.ts` 5, `repository/role.test.ts` 2,
`service/roll-up.test.ts` 7, `service/undo.test.ts` 3,
`controller/work-item.controller.test.ts` 6).

**The one step that did not run on h2puni, stated rather than glossed:**
`tool-devsync:build` and `tool-bootstrap:build` shellcheck the deploy scripts, and
`shellcheck` is not installed on h2puni (`which shellcheck` → absent). Both
targets refuse rather than skipping, which is the correct behaviour and is why it
is visible at all. This branch touches no shell script — the diff is TypeScript,
SQL and markdown — and CI's `gate` job asserts `shellcheck --version` before it
runs anything, so **CI is the record for those two targets**. Every other build
target passed here.

## CI, and the one real thing it caught

**Run `32064203635` at `db3e121` — `success`, both jobs, first attempt.** `gate`
and `pixels` each green. `gate` is the record for the two shellcheck build
targets h2puni could not run.

**Then the doc-only commit after it went red, and it was mine.** Run
`32065457387` at `decc195` — a commit touching this file and nothing else —
failed `gate` on **one** be-01 case: `restores every day recorded in a deleted
branch, against the real cascade`, 828 pass / 1 fail, with the two restored rows
in the other order.

The case asserted a **two-row list** against `actualStore.listByProject`, which
orders by `work_item_id` — and across a project those are UUIDs, so which of
`Sockets` and `Switches` comes back first is a coin toss. It won five times on
h2puni and once on CI before it lost. That is the same class of mistake
`EstimateRepository.listByProject`'s own ordering comment is about, made in the
assertion rather than in the query.

Fixed by keying the answer by work item and asserting the length beside it, so
the case cannot depend on an order the repository never promised across work
items. Re-run five times on h2puni, and F9 re-watched against the new form:
`Expected: 8 / Received: undefined`, still 2 fail. **Head `<final>`, run
`<final-id>` — quoted in the PR.**

Worth saying plainly: the code was not wrong, the check was, and it was a check
that could pass for the wrong reason — the same failure mode as F9a two sections
down, found by CI rather than by the injection pass.

## Failure-proof table (R5)

Sixteen faults, each injected into the branch as it stands, watched on h2puni
with `bun 1.3.14`, and reverted. Counts are from the files named beside each,
not from the whole suite.

| #   | fault injected                                                                                | test that observed it                                                                          | result                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `ON DELETE CASCADE` struck from `actual.work_item_id` in the migration                        | `lets the outgoing release keep deleting work items against the migrated schema`               | **29 pass, 1 fail** — `SQLiteError: FOREIGN KEY constraint failed` on the outgoing release's own `DELETE FROM work_item`. `ActualRepository`'s own case goes red beside it (38/2 over both files)                               |
| F2  | `ON DELETE CASCADE` **added** to `actual.role_id`                                             | `refuses to let a role go while it still holds recorded days, rather than emptying it`         | **56 pass, 2 fail** — `Received function did not throw`, and the actual silently gone: the plan losing a week nobody could retype, which is exactly what the missing cascade exists to prevent                                  |
| F3  | `moveAll` bumps both revisions unconditionally                                                | `hands the estimate down to a first child, moving both` (`revision.test.ts`)                   | **35 pass, 2 fail** — `Expected: 1 / Received: 2`; a work item reporting two writes for one create, on every plan that has no actuals at all. The store's own case fails beside it (`Expected: 2 / Received: 3`)                |
| F4  | `rollUpActuals`'s combine returns the first child instead of summing                          | `sums two children into their parent, per role`                                                | **29 pass, 2 fail** — `Expected: 5 / Received: 2`, and the service's parent case red beside it                                                                                                                                  |
| F5  | the first recording's inverse writes `set_actual 0` instead of `clear_actual`                 | `undoes a first recording back to absence, not to zero`                                        | **17 pass, 1 fail** — `+ { "role-dev": 0 }` where an absence is owed: an undo leaving the plan asserting the work took no days, which nobody said                                                                               |
| F6  | the roll-up seeds every work item with `0` for a role                                         | the two identity oracles' lift, and five service cases                                         | **16 pass, 9 fail** — all three oracle replays red on `+ "role-dev": 0` against sixteen captured plans. **This is what makes the lift non-vacuous**: without the assertion, a payload that invented figures would pass silently |
| F7  | `actuals.moveAll` struck from `create`                                                        | `hands the recorded days down when a leaf gains its first child, and back up on undo`          | **17 pass, 1 fail** — `Expected - 3 / Received + 1`, the child empty: the row still on a work item whose figures are now sums, invisible to every face                                                                          |
| F8  | the hand-up loop struck from `remove`                                                         | `hands the branch’s recorded days up when its last child is deleted`                           | **17 pass, 1 fail** — the parent empty where 5 days are owed: the branch's record gone with the cascade while its estimates survive                                                                                             |
| F9  | the restore's `actuals` replaced by `[]`                                                      | `restores every day recorded in a deleted branch, against the real cascade` (`undo.test.ts`)   | **2 fail** — `Expected - 12 / Received + 1`, an empty list where two rows are owed; `takes back the recorded days a deletion handed up to the parent` red beside it. **See F9a**                                                |
| F9a | _(the same fault, against the case as first written — in `service/actual.test.ts`)_           | the same claim, over the in-memory stores                                                      | **18 pass, 0 fail — a check that could not fail.** The fixture cannot model `work_item_id`'s cascade: a deleted row's actuals sit untouched in its array and reappear the moment the row is restored. Moved to real SQLite      |
| F10 | `recorded.length > 0` dropped from the role removal's `in_use` condition                      | `counts the recorded days, and refuses an unconfirmed removal of a role that holds only those` | **17 pass, 1 fail** — the removal proceeding against a role whose only usage is a recorded figure, which is the one usage nobody can retype                                                                                     |
| F11 | `tx.delete(actual)` struck from `RoleRepository.remove`                                       | `deletes the recorded days with the role it confirmed, moving the work items that lost one`    | **17 pass, 1 fail** — `SQLITE_CONSTRAINT_FOREIGNKEY` thrown out of the transaction: the 500 a bare role delete answers, which is the loud failure the missing cascade is _for_                                                  |
| F12 | the duplicate copies the original's actuals into the copy                                     | `copies the estimate into a duplicate and leaves the recorded days behind`                     | **16 pass, 1 fail** — `+ { "role-dev": 8 }` on a row nobody has worked on: a fortnight the plan would claim was already spent                                                                                                   |
| F13 | `!Number.isFinite(days) \|\| days < 0` dropped from `parseActual`                             | `refuses a body that is not a finite number of days, and one below zero`                       | **38 pass, 1 fail** — `Expected 400 / Received 200` for `{"days":-1}`: a negative that would subtract from a parent's roll-up and shrink a branch's recorded total                                                              |
| F14 | **the engine reads the actual instead of the estimate** — `slicesOf` handed the recorded days | `moves no date: the plan schedules identically with and without an actual`                     | **19 pass, 1 fail** — `Expected - 10 / Received + 10`: every date downstream of the predecessor moved. This is R6's whole product decision as a red test                                                                        |
| F15 | the `before !== null` skip removed from `clearActual`                                         | `records nothing at all for clearing days that were never recorded`                            | **16 pass, 1 fail** — `+ "clear_actual"`: a history row and an undo entry for a command that changed nothing                                                                                                                    |
| F16 | the payload's `actuals` replaced by `{}`                                                      | eleven service and controller cases                                                            | **44 pass, 12 fail** — every read of a recorded figure empty. The broadest of the sixteen, and the cheapest to have shipped                                                                                                     |

**F9a is the finding of this change.** The case was written correctly, reasoned
about correctly, and passed under the exact fault it was written for — because
the in-memory `ActualStore` cannot model a foreign key's cascade, so the rows the
delete should have taken were still in its array waiting to be handed back. It is
now against real SQLite in `undo.test.ts`, with a comment in
`service/actual.test.ts` saying why the case is not there. That is R5's argument
again, and it is the twentieth entry on this repo's list of checks that could not
fail.

## What is deliberately not here

- **The four faces and the two export columns (H3), snapshots (H4), the history
  view (H5).** No `wbs-table.tsx`, no `plan-cards.tsx`, no `plan-export.ts`. The
  payload carries `actuals` and nothing draws it yet, which is why the count on
  `RoleInUse` travels ahead of a face that reads it.
- **No variance anywhere.** It is `actual − final`, derived on read, blank when
  either side is absent — and it belongs to the surface that shows it, not to the
  service that would then store a second spelling of one fact.
- **No WS event.** Actuals ride `work_items_changed`, which already carries the
  touched item and its ancestors, so `broadcast.ts`'s nine events are unchanged.
- **No `libs/domain` change**, and no schedule change. Both diffs are empty and
  both are stated above as claims that were checked.
- **The project-header variance line** the brief calls a non-optional mitigation
  (§7 risk 3) is H3's, and it should not be dropped there: reporting-only actuals
  with nothing prompting a re-estimate is a number nobody acts on.

## Open — one question for Dany

**Should recording days be allowed to move the plan, ever?**

Not in this change and not in the model as it stands — the reason is D3 and it is
structural rather than economic. But the honest next step, if the answer is yes,
is a **completion state** (started and finished dates per item), and that is its
own request and its own week: it re-baselines `live-plan-identity.test.ts` and the
capacity oracle, and it drags the Gantt, the critical path and the leveller with
it.

Worth answering before H3 draws the variance, because a variance that will one
day move dates and one that never will are two different things to put on screen.
