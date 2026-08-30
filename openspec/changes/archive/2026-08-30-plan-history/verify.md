# verify — `plan-history`

Branch `change/plan-history`, cut from `main` @ `2c29833` (#75 gantt-svg-download
merged) on 2026-08-17. **Prod mode** — the diff opens with a migration.

be-01 and `apps/be-01/drizzle` only. Nothing under `apps/fe-01/src/components/wbs/`
is touched; another agent owns fe-01 tonight. `libs/domain` is unchanged: the
history holds commands, and commands are be-01's vocabulary.

## The two facts the brief rests on, re-verified in this tree first

Both were read at `2c29833` before a line was written, because a design brief is
a claim about a tree that has since moved.

| claim                                                       | where                                                                | what is there                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the command journal is **not** a history                    | `repository/command-journal.ts:44-79`, `repository/index.ts:846-866` | per `(project_id, user_id, seq)`; `JOURNAL_DEPTH = 50` pruned inside the same transaction as every append; `append` deletes that account's `undone = true` branch **first**; `flip` and `restamp` mutate in place and append nothing |
| `setEstimate`/`clearEstimate` already carry the before-trio | `service/work-item.service.ts:1695-1728`, `:1751-1775`               | `inverse` is `set_estimate` with `days: before`, or `clear_estimate` when there was none; the clear is skipped entirely under `if (before !== null)`                                                                                 |

So the vocabulary existed and the record did not — which is exactly the sizing
the brief gave, and why this is one `INSERT` at a seam rather than a write path.

## The migration stamp, and the collision check

**Chosen: `20260817120000_add_plan_event`.** Later than every folder on main, by
three days.

The check that was run first, before the folder was created:

```
$ ls apps/be-01/drizzle | sed 's/_.*//' | sort | uniq -d
(no output — no stamp is shared)
$ ls apps/be-01/drizzle | sort | tail -3
20260813120000_add_project_team_capacity
20260814100000_add_work_item_team
20260814110000_add_priority_band
```

That check is now **mechanical**. `duplicateMigrationStamps` in `migrate-down.ts`
is called from `readMigrationFolders`, so a shared stamp throws where it is read
rather than being discovered during a rollback that reversed nothing. F4 below is
its watched red, and the fixture it uses is the literal 2026-08-14 pair.

There is deliberately **no `drizzle/meta/_journal.json`** in this repo, and none
was added: this drizzle version throws on its presence and reads folders off disk
with `readdirSync().sort()`.

## Up and down, through the real CLIs

Run on **h2puni**, `bun 1.3.14`, against a fresh file at
`/var/tmp/plan-history-cli/wbs.db`. `DB_PATH`, not `WBS_DB_PATH` — the CLIs read
the former and throw without it.

```
$ export DB_PATH=/var/tmp/plan-history-cli/wbs.db
$ bun run src/migrate-status-cli.ts
none
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260817120000_add_plan_event
$ # what arrived
index plan_event_item
index plan_event_project_time
table plan_event
```

A row written the way the release writes one, then the reverse:

```
$ # one user, one project, one recorded event
rows: 1
$ bun run src/migrate-down-cli.ts --to=20260814110000_add_priority_band
rolled back: 20260817120000_add_plan_event
$ bun run src/migrate-status-cli.ts
20260814110000_add_priority_band
$ # what is left
plan_event objects: []
projects still here: 1 | bands still here: 0
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260817120000_add_plan_event
```

Three things in that transcript are the point. The rollback names **exactly one**
migration — not `[]`, which is what a shared stamp produces and what 2026-08-14
produced silently. Both indexes go with the table. And the plan survives: the
project is still there afterwards. (`bands still here: 0` is not this change —
that project was inserted by hand _after_ the band migration ran, so the seeding
never saw it.)

## The gate

Run on **h2puni** over plain ssh at head `ff65d56`, in
`/home/puni1/wd/puni/wt-plan-history`. Nothing was compiled or tested on h1claw;
that box denies both (`bin/block-local-builds.sh`).

`ff65d56` is the whole branch as one commit and is the head every number below
was measured at. The commit after it touches **this file and nothing else** —
the head reference and prettier's table alignment — which is why it is not
re-measured.

| target                                                  | result                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean, exit 0                                                                                      |
| `bunx nx run-many -t lint typecheck --parallel=2`       | pass, **21 projects**, 42 tasks                                                                    |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)            | **779 pass, 0 fail**, 25,189 `expect()` calls, 16.58s across **66 files**                          |
| gw-01 unit (bun **1.3.14**)                             | **45 pass, 0 fail**, 8 files                                                                       |
| `libs/domain` unit (bun **1.3.14**)                     | **65 pass, 0 fail**, 4 files                                                                       |
| fe-01 unit (`nx run fe-01:test`)                        | **1,416 pass across 53 files, 0 fail**, 54.67s                                                     |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **60 passed, 0 failed**                                                                            |
| secrets scan over every tracked file                    | clean                                                                                              |
| doc caps                                                | clean                                                                                              |
| migration lint over every tracked `.sql`                | clean                                                                                              |
| `bunx nx run-many -t build`                             | **7 projects pass**; `tool-devsync:build` and `tool-bootstrap:build` **could not run** — see below |

be-01 was **752 tests before this branch** and is 779 after: 27 new cases across
five files.

**The one step that did not run on h2puni, stated rather than glossed:**
`tool-devsync:build` and `tool-bootstrap:build` shellcheck the deploy scripts, and
**`shellcheck` is not installed on h2puni** (`which shellcheck` → absent). Both
targets refuse rather than skipping, which is the correct behaviour and is why
this is visible at all. This branch touches no shell script — the diff is
TypeScript, SQL and markdown — and CI's `gate` job asserts `shellcheck --version`
before it runs anything, so **CI is the record for those two targets**. Every
other build target passed here.

## CI

**Run `32052472805` at `5fc4bbe` — `success`, both jobs, first attempt.** `gate`
and `pixels` (169 e2e) each green; no flake, and none of the `ECONNRESET` class
this repo has hit four times. `gate` is the record for the two shellcheck build
targets h2puni could not run.

The commit after `5fc4bbe` adds this section and nothing else; its own run is
quoted in the PR.

## Failure-proof table (R5)

Thirteen faults, each injected into the branch as it stands, watched, and
reverted. Every one was run on h2puni with `bun 1.3.14`. Three of them are more
interesting than the other ten, and two of those are checks of mine that **could
not fail** until they were rewritten.

| #   | fault injected                                                                       | test that observed it                                                                    | result                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `ON DELETE CASCADE` struck from `plan_event.project_id`                              | `lets the outgoing release keep deleting projects against the migrated schema`           | **23 pass, 2 fail** — `SQLiteError: FOREIGN KEY constraint failed` on the outgoing release's own `DELETE FROM project`                                                                                                                                                                                                                                                                                               |
| F2  | `ON DELETE CASCADE` struck from `plan_event.user_id`                                 | `lets the outgoing release keep deleting accounts against the migrated schema`           | **24 pass, 1 fail** — same error on `DELETE FROM users`. **See F2a: the first version of this test passed.**                                                                                                                                                                                                                                                                                                         |
| F2a | _(the same fault, against the test as first written)_                                | the same case, deleting the **owner**                                                    | **25 pass, 0 fail — a check that could not fail.** The owner cannot be deleted while the project stands (`project.owner_id` references `users`), so the case deleted the project first — which cascaded every event away before the `DELETE FROM users` was reached. Rewritten to delete a **second account who edited somebody else's plan**, which is the only shape in which this constraint is reachable at all. |
| F3  | `REFERENCES work_item(id) ON DELETE CASCADE` **added** to `plan_event.work_item_id`  | `keeps an event whose work item has been deleted, which is the point of a history`       | **22 pass, 3 fail** — `Expected: "w1" / Received: undefined`; one deleted row taking its whole estimate history with it. F1's and F2's cases go red beside it, because an event naming a row that does not exist becomes unwritable — the same fault from the other end                                                                                                                                              |
| F4  | the `duplicateMigrationStamps` check removed from `readMigrationFolders`             | `refuses a folder set that shares one stamp between two migrations`                      | **12 pass, 1 fail** — `Received function did not throw`; and the `rollbackTo` beside it answers `[]` against a database holding both tables, which is the 2026-08-14 fault reproduced exactly                                                                                                                                                                                                                        |
| F5  | the `plan_event` insert moved **out** of `append`'s transaction and run after it     | `writes neither when the history row is refused`                                         | **4 pass, 1 fail** — a `toEqual` diff of the stack against `[]`: one journal entry standing for a command the history never received                                                                                                                                                                                                                                                                                 |
| F6  | the journal's depth prune widened to delete from `plan_event` too                    | `keeps the history of a command the stack has evicted`                                   | **2 pass, 3 fail** — `Expected length: 60 / Received length: 50`; ten changes gone from a table whose whole purpose is to still hold them                                                                                                                                                                                                                                                                            |
| F7  | the event dropped on the way into the store (`events.push(event)` struck)            | `service/plan-history.test.ts`                                                           | **2 pass, 5 fail** — `Expected length: 2 / Received length: 0`, and `Expected: "<uuid>" / Received: undefined` on the two cases that name a row. Every undo key still worked                                                                                                                                                                                                                                         |
| F8  | `desc(planEvent.id)` struck from `listFor`'s `orderBy`                               | `orders two events written in one millisecond by id, not by the order they were written` | **6 pass, 1 fail** — the answer following insertion order. **See F8a.**                                                                                                                                                                                                                                                                                                                                              |
| F8a | _(the same fault, against the test as first written)_                                | the same case, with the rows written **in id order**                                     | **7 pass, 0 fail — a check that could not fail.** SQLite walks the `(project_id, created_at)` index backwards for a `DESC` read and hands back the later rowid first, which for `a` then `b` is exactly what the tie-break asks for. Rewritten to write `b` first, which is what makes the two orders disagree                                                                                                       |
| F9  | the empty-`kinds` arm replaced by an unconditional `inArray`                         | `repository/plan-event.test.ts`                                                          | **0 pass, 7 fail** — every read broken, because the default `kinds` is the empty list and that renders as a condition no row satisfies. The reading this line refuses is not "a narrower answer", it is "the plan has no history"                                                                                                                                                                                    |
| F10 | the comma split in `filterFrom` replaced by a single-element list                    | `takes a comma-separated list of kinds, which is the estimate history in one request`    | **4 pass, 2 fail** — `?kind=estimate,clear_estimate` matching nothing at all                                                                                                                                                                                                                                                                                                                                         |
| F11 | the blank-segment filter removed from `filterFrom`                                   | `reads a kind parameter that names nothing as no filter, not as no history`              | **3 pass, 3 fail** — `Expected length: 4 / Received length: 0`; every plan read with an empty filter box reading as a plan nobody has ever edited, and the unfiltered read broken with it                                                                                                                                                                                                                            |
| F12 | the project read removed from `HistoryService.read`                                  | `refuses without a token, and 404s a project that is not there`                          | **5 pass, 1 fail** — `Expected: 404 / Received: 200`; a deleted plan answering as a plan with no history                                                                                                                                                                                                                                                                                                             |
| F13 | `runPlanEventRetention` in `RetentionTimer.sweep` replaced by `const planEvents = 0` | `prunes the history by age on every tick, and the log by count on the same one`          | **6 pass, 2 fail** — a `toEqual` diff of `{eventLog: 3, planEvents: 0}` against `{eventLog: 3, planEvents: 2}`, both stale events still held; `keeps sweeping after a history sweep fails` red beside it, because a sweep that never runs never fails                                                                                                                                                                |

**F2a and F8a are the finding of this change.** Both were written as real
negatives, both were reasoned about correctly, and both passed under the fault
they were written for. Neither would have been caught by reading the code — only
by running the injection. That is R5's whole argument, and it is now eighteen and
nineteen on this repo's list.

## What is deliberately not here

- **`actual_days` (H2), the four faces (H3), snapshots (H4), the reading surface
  (H5).** H1 is the keystone and nothing else from the brief's split is in this
  diff. H2 gains its history for free by going through `record`, which is the
  ordering the brief calls non-negotiable.
- **No WS event.** Nothing on screen is stale because somebody's edit was
  recorded, so `broadcast.ts`'s nine events are unchanged.
- **No event for an undo.** design.md D4, and the open question below.
- **No `libs/domain` change.** Nothing about the history is a rule the two apps
  share.

## Open — one question for Dany

**Should undoing a command be recorded?**

It is not, today. Undo and redo flip a journal entry in place and append nothing,
by deliberate design, and the history is written from `record`, which they do not
call. So an estimate set to 8 and then undone leaves one event reading "set to 8"
and no event taking it back, while the plan reads 5. Every event is true about
its own moment; the sequence is incomplete. This is asserted as a test
(`service/undo.test.ts`, `records the command, and records nothing at all for
undoing it`) rather than only written down, so it cannot rot silently.

Closing it is roughly thirty lines — `flip` would grow the same second-argument
shape `append` just grew, for the same atomicity reason. What is **not** obvious
is which history is wanted:

1. an undo is a command in its own right — kind `undo`, before and after swapped;
2. an undo is a correction — it retracts the event it reverses, and the history
   shows neither.

Those are different products and H5 is where the difference becomes visible, so
the recommendation is to answer it when H5 starts rather than to guess now. It
costs nothing to defer: the events already written are correct under either
reading.
