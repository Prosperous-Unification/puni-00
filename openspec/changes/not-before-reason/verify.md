# verify — `not-before-reason`

Branch `change/not-before-reason`, cut from `main` @ `05d0a2a` (#80
`role-progress` merged) on 2026-08-18 at 08:53 UTC. **Prod mode** — the diff
opens with a migration and it touches `libs/domain`.

`apps/be-01/**`, `libs/domain/**`, `apps/fe-01/src/components/wbs/gantt-geometry.ts`,
`apps/fe-01/src/components/wbs/plan-export.ts` and `apps/fe-01/src/lib/wbs-api.ts`.
**`wbs-table.tsx`, `tree-search.ts` and `plan-cards.tsx` are untouched** — another
agent's while this was written — and what that costs is at the bottom of this
file rather than implied.

## The three facts this rests on, re-verified in this tree first

A brief is a claim about a tree that has since moved. All three were read at
`05d0a2a` before a line was written.

| claim                                                         | where                                                      | what is there                                                                                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the not-before date already exists and already floors a bar   | `schema.ts` (`startNoEarlierThan`), `work-item.service.ts` | `notBefore.set(row.id, workdaysBetween(project.startDate, row.startNoEarlierThan))` — one line, guarded by `project.startDate !== null`. That guard is why F9's first draft could not fail; see below |
| the chart already names which floor binds                     | `gantt-geometry.ts` (`FLOOR_SENTENCE`, `floorWordsOf`)     | six floors, five sentences and two builders. `notBefore` read `Held by its start-no-earlier-than date` and carried nothing else                                                                       |
| a free-text field here is bounded, and the bound is in domain | `libs/domain/src/priority-band.ts`                         | `LONGEST_BAND_LABEL = 40`, checked in `priority-band.controller.ts`. This change's constant is that shape, at 200 — a sentence rather than a label                                                    |

## The migration stamp, and the collision check

**Chosen: `20260818090000_add_not_before_reason`.** Eight hours past
`20260818010000_add_role_progress`, which #80 merged, and later than all twenty
folders on disk.

The check, run before the folder was created:

```
$ ls apps/be-01/drizzle | sed 's/_.*//' | sort | uniq -d
(no output — no stamp is shared)
$ ls apps/be-01/drizzle | sort | tail -3
20260817120000_add_plan_event
20260817130000_add_actual
20260818010000_add_role_progress
$ find . -name "_journal.json" -not -path "./node_modules/*"
(no output)
```

Mechanical as well as by eye: `duplicateMigrationStamps` in `migrate-down.ts` is
called from `readMigrationFolders`, so a shared stamp throws where the folders
are read. `20260818090000` passes it, and `refuses a folder set that shares one
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
`/var/tmp/not-before-reason-cli/wbs.db`. `DB_PATH`, not `WBS_DB_PATH` — the CLIs
read the former and throw without it.

```
$ bun --version
1.3.14
$ export DB_PATH=/var/tmp/not-before-reason-cli/wbs.db
$ bun run src/migrate-status-cli.ts
none
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260818090000_add_not_before_reason
$ # the column that arrived
{"name":"start_no_earlier_than","type":"TEXT","notnull":0,"dflt_value":null}
{"name":"start_no_earlier_than_reason","type":"TEXT","notnull":0,"dflt_value":null}
```

Then a plan written the way the release writes one — a project on a calendar, a
role, a work item, an estimate, a floor and the words about it — and **the
outgoing release's own statement run against it**:

```
$ # one plan, one estimate, a floor and the words about it
work item: 2026-09-12 | waiting on client sign-off
after the outgoing release cleared the date: null | waiting on client sign-off
```

That second line is the whole argument for there being no `CHECK` on this column,
performed rather than asserted: `UPDATE work_item SET start_no_earlier_than =
NULL` is a statement blue runs today, it ran, and it answered. Under the `CHECK`
a reader would reach for, it answers `SQLiteError: CHECK constraint failed` — F3.

Then the reverse:

```
$ bun run src/migrate-down-cli.ts --to=20260818010000_add_role_progress
rolled back: 20260818090000_add_not_before_reason
$ bun run src/migrate-status-cli.ts
20260818010000_add_role_progress
$ # what is left
start_no_earlier* columns left: ["start_no_earlier_than"]
the floor: 2026-09-12
estimates: {"n":1} | work items: {"n":1} | role_progress table: {"n":1}
$ bun run src/migrate-cli.ts
migrations applied
$ bun run src/migrate-status-cli.ts
20260818090000_add_not_before_reason
```

Four things in that transcript are the point. The rollback names **exactly one**
migration, not `[]`, which is what a shared stamp produces and what 2026-08-14
produced silently. **The floor survives**: `start_no_earlier_than` is still
`2026-09-12`, so what the rollback takes away is the explanation and never the
constraint. The estimate and the work item survive with it. And `role_progress`
is untouched, because this rollback stops at it.

## The scheduler did not move — checked, not assumed

```
$ git diff --stat origin/main -- apps/be-01/src/service/schedule.ts
(no output)
$ git diff origin/main -- apps/be-01/src/service/schedule.ts | wc -l
0
```

**Empty diff, and it is a checked claim rather than a stated one.** `libs/domain`
is _not_ empty and is not claimed to be — `not-before.ts` and its test are new
there, which is one of the two reasons this change is in prod mode:

```
$ git diff --stat origin/main -- libs/domain
 libs/domain/src/index.ts           |  1 +
 libs/domain/src/not-before.test.ts | 51 +++++++++++++++++++
 libs/domain/src/not-before.ts      | 52 ++++++++++++++++++
```

What that module adds is one constant and one predicate; nothing in it is called
from `schedule.ts`.

The mechanical half is above. **The behavioural half is F9**, and it is the
finding of this change — see below.

## The gate

Run on **h2puni** over plain ssh, in `/home/puni1/wd/puni/wt-not-before-reason`,
at `659b675`, the head this file is written against. Nothing was compiled or
tested on h1claw; that box denies both (`bin/block-local-builds.sh`).

| target                                            | result                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                      | clean, exit 0                                                                                      |
| `bunx nx run-many -t lint typecheck --parallel=2` | pass, **21 projects** (`--skip-nx-cache`)                                                          |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)      | **902 pass, 0 fail**, 26,880 `expect()` calls, 19.22s across **70 files**                          |
| gw-01 unit (bun **1.3.14**)                       | **45 pass, 0 fail**, 8 files                                                                       |
| `libs/domain` unit (bun **1.3.14**)               | **78 pass, 0 fail**, 6 files                                                                       |
| fe-01 unit (`nx run fe-01:test --skip-nx-cache`)  | **1,484 pass across 53 files, 0 fail**                                                             |
| `bunx @fission-ai/openspec@1.3.0 validate --all`  | **65 passed, 0 failed**                                                                            |
| secrets scan over every tracked file              | clean, exit 0                                                                                      |
| doc caps                                          | clean, exit 0                                                                                      |
| migration lint over every tracked `.sql`          | clean, exit 0                                                                                      |
| `bunx nx run-many -t build`                       | **7 projects pass**; `tool-devsync:build` and `tool-bootstrap:build` **could not run** — see below |

be-01 was **884 tests before this branch** and is 902 after: **18 new cases**
across six files (`repository/migrate.test.ts` 4, `repository/work-item.test.ts`
5, `controller/work-item.controller.test.ts` 4, `service/undo.test.ts` 2,
`service/work-item.service.test.ts` 3). `libs/domain` was **73** and is **78**:
five new cases in `not-before.test.ts`. fe-01 was **1,478** and is **1,484**: four
in `gantt-geometry.test.ts` and two in `plan-export.test.ts`.

**The one step that did not run on h2puni, stated rather than glossed:**
`tool-devsync:build` and `tool-bootstrap:build` shellcheck the deploy scripts,
and `shellcheck` is not installed on h2puni (`which shellcheck` → absent). Both
targets refuse rather than skipping, which is the correct behaviour and is why it
is visible at all. This branch touches no shell script — the diff is TypeScript,
SQL and markdown — and CI's `gate` job asserts `shellcheck --version` before it
runs anything, so **CI is the record for those two targets**. Every other build
target passed here. The same gap `actual-days` and `role-progress` each recorded.

## CI

**Run `32121602067` at `659b675` — `success`, both jobs.** `gate` is the record
for the two shellcheck build targets h2puni could not run.

**Three runs on this branch, and the two cancellations are the workflow's own
`concurrency` rather than a flake.** `ci.yml` sets `group: ci-${{ github.ref }}`
with `cancel-in-progress: true`, and for a `pull_request` event that ref is the
PR's merge ref — so **every push to the branch cancels the run still going for
the previous head**, whatever it was doing.

| run           | head      | result                                                                                   |
| ------------- | --------- | ---------------------------------------------------------------------------------------- |
| `32121602067` | `659b675` | `gate` success, `pixels` cancelled; **rerun of the cancelled job: both jobs `success`**  |
| `32123853462` | `d43c034` | cancelled by the next push, mid-flight                                                   |
| `32123925221` | `7db69d3` | **`success`, both jobs, first attempt**                                                  |
| `32124927649` | `5c4b0dc` | cancelled by the next push, mid-flight                                                   |
| `32124993206` | `db60f98` | `gate` success, `pixels` red on the ws-proxy flood; **rerun clean, both jobs `success`** |
| `32126970167` | `b2b75c4` | **`success`, both jobs, first attempt** — the head this PR stands at                     |

`659b675` is the head every number in the gate table above was measured at, and
it is green on CI at that exact sha. Every commit after it is this file and
prettier's passes over it; the head `b2b75c4` is green too, so the record holds
at the head as well as at the measured sha. Any commit later than `b2b75c4` is
this paragraph and nothing else.

Worth one line for the next agent, because it looks like a red the first time you
meet it: **a `cancelled` job on this repo usually means you pushed again.** Let
the last push settle rather than re-diagnosing it.

**And the `pixels` ws-proxy flake, fifth sighting** — run `32124993206` at
`db60f98`, a commit touching this markdown file and nothing else, failed `pixels`
amid a flood of `[vite] ws proxy error: Error: write EPIPE` and `write
ECONNRESET`, with `gate` green beside it. Same class as #73, #78, #79 and #80: a
doc-only tail commit, no UI or CSS code within reach, and a proxy the layout
gate's web server cannot keep up with. `gh run rerun --failed` passed clean.

Four sightings was already "no longer a flake anybody should be re-diagnosing per
PR" in #80's verify.md; this is the fifth, and both of the fixes named there are
still the fixes. One of them would not have helped here — this branch does touch
`apps/fe-01`, so running `pixels` only on `apps/fe-01/**` changes still runs it —
which leaves the ws-proxy floods themselves as the one that would. Neither is
this change's, and both are now well past overdue.

## Failure-proof table (R5)

Fourteen faults, each injected into the branch as it stands, watched on h2puni
with `bun 1.3.14`, and reverted. Counts are from the files named beside each, not
from the whole suite.

| #   | fault injected                                                                                      | test that observed it                                                                                       | result                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `NOT NULL DEFAULT ''` on the new column in `migration.sql`                                          | `leaves work items that existed before the column with no reason`, and the blue/green insert case beside it | **38 pass, 2 fail** — `expect(received).toBeNull()` / `Received: ""`: every row blue writes and every row that predates the column carrying a blank sentence nobody typed, in a column whose absence _is_ the answer    |
| F2  | `isOrphanedNotBeforeReason` written symmetrically, `(reason === null) !== (date === null)`          | `reads the date and not the reason as the thing that may be missing`, and the three-real-pairs case         | **76 pass, 2 fail** — `Expected: false / Received: true` for a date with no reason: **every not-before on every plan that exists today**, refused at its next edit                                                      |
| F3  | the `CHECK (reason IS NULL OR date IS NOT NULL)` a reader would reach for, added to `migration.sql` | `lets the outgoing release keep clearing a not-before date the new one has explained`                       | **39 pass, 1 fail** — `SQLiteError: CHECK constraint failed: start_no_earlier_than_reason` on **blue's own `UPDATE`**: a 500 for the length of a swap window, on a statement the outgoing release runs today            |
| F4  | the pair refusal deleted from `WorkItemRepository.patch`                                            | `refuses a reason with no date to be about` and `refuses a date cleared out from under the words beside it` | **19 pass, 2 fail** — `Expected: false / Received: true`: the row stored and returned carrying words about a floor it does not have, which no face shows and nothing clears                                             |
| F5  | `patch.startNoEarlierThanReason === undefined` struck from the names-nothing check                  | `writes a reason beside the date it explains`, and F4's first case with it                                  | **19 pass, 2 fail** — `Expected: "waiting on client sign-off" / Received: null` and a 200 beside it: the write path silently doing nothing while every face reports success                                             |
| F6  | the length bound deleted from `asOptionalReason`                                                    | `refuses a reason that is not text, and one longer than a sentence`                                         | **48 pass, 1 fail** — `Expected: 400 / Received: 200`: 201 characters taken, and nothing between a pasted paragraph and a hover card that covers the chart it is explaining                                             |
| F7  | the blank normalisation replaced by `return trimmed`                                                | `stores a blank reason as no reason at all, and trims the rest`                                             | **48 pass, 1 fail** — `"startNoEarlierThanReason": ""` where `null` was owed: two spellings of "nobody has said" in one column, one of which the pair rule then refuses to let a reader clear the date beside           |
| F8  | the reason struck from `revertTo`                                                                   | `puts the words back with the date they explain`, and the sibling undo case                                 | **61 pass, 2 fail** — `Expected: "waiting on client sign-off" / Received: null`: a pressable undo that reports **done**, restores the floor, and drops the sentence saying why it is there                              |
| F9  | **the engine reads the reason** — `notBefore` set a day later for an explained row                  | `moves no date: the plan schedules identically with and without a reason`                                   | **85 pass, 1 fail** — **12 fields of moved dates** (`earliestStart` 23 → 24, 18 → 19, and the calendar dates with them). This change's whole product decision as a red test. **See the finding below**                  |
| F10 | the reason struck from `fieldsOf`                                                                   | `undoes a reason written beside a date that was already there`                                              | **62 pass, 1 fail** — `refused: stale_undo — “Strip” has changed since then`: the undo reaching past an unjournalled write to an entry that write had already made stale                                                |
| F11 | the null arm deleted from `notBeforeFloorWords`                                                     | `says only the floor for a not-before nobody has explained`, plus two cases that are not about this feature | **101 pass, 3 fail** — `expected 'Held by its start-no-earlier-than date — null' to be 'Held by its start-no-earlier-than date'`: the word `null` on the hover card of **every dated row in every plan**                |
| F12 | the reason appended to the shared `projectStart`/`predecessor`/`roleOrder` arm as well              | `leaves the words off a bar something else is holding`                                                      | **103 pass, 1 fail** — `expected 'Waits for a dependency’s first estimated role — waiting on client sign-off' to be 'Waits for a dependency’s first estimated role'`: the chart naming one cause and explaining another |
| F13 | the pair rule deleted from `inMemoryWorkItems.patch`                                                | `refuses words on a row with no date, through the service`                                                  | **85 pass, 1 fail** — `Expected: false / Received: true`: the fixture accepting a row the database refuses, which is how a test passes here and fails against SQLite                                                    |
| F14 | the export cell reading `row.notes` instead of the reason                                           | `writes the words about a not-before beside the date, in a column of their own`, and the escaping case      | **52 pass, 2 fail** — `expected '' to be 'waiting on client sign-off'`: a column that exists, has a header, and is somebody else's text                                                                                 |

**F9 is the finding of this change, and it is a finding about the test rather
than about the code.** The first version of `moves no date` built its plan on the
suite's default project, and that project has `startDate: null`. The engine's
not-before map is built inside `if (project.startDate !== null)`, so on a plan
with no calendar **the floor is never read at all** — and a case asserting that
the schedule is unchanged held for a reason with nothing to do with this column.
Injected with the engine wired to read the reason, it passed: **86 pass, 0 fail**.

That is R5's own failure mode, in the case written to satisfy R5. The plan now
takes a start date, and the case asserts **that the floor is binding** —
`Strip.schedule.earliestStart === workdaysBetween('2026-08-06', '2026-09-01')` —
before it asserts that nothing moved. Under the same injected fault it then
failed on twelve fields. The moral is the one `AGENTS.md` already carries and
this is its nineteenth entry: _a check that has never been watched failing is a
claim._ An identity assertion is the easiest kind of check to write vacuously,
because the two sides agree by default and it is the setup that has to make them
capable of disagreeing.

## What is deliberately not here

- **No status, no flag, no propagation.** Dany refused `blocked` twice
  (`notes/decisions.md`, 2026-08-18). There is no field whose value means "held"
  — the date means that — and no reason reaches a child, a successor or a
  parent's roll-up.
- **No `CHECK` on the column**, argued in `migration.sql` and design.md P2, held
  by F3. The cost is stated there rather than glossed: a writer that bypasses the
  repository can leave a reason on a dateless row, and what that row does is
  nothing visible.
- **No cascade on clearing the date**, argued in design.md P3. A write that
  deletes somebody's sentence on their behalf is worse than a 400.
- **No new refusal for any request that exists today.** The pair rule is asked
  only where a patch names one of the two fields, and `lets a patch that names
neither half of the pair through a dateless row` is where that is asserted
  rather than assumed.
- **No WS event.** A reason rides `work_items_changed` like every other field of
  a patched row; `broadcast.ts` is unchanged.
- **No filter facet and no search over it.** R10's seven facets are settled
  (2026-08-17) and a free-text axis is the same question `status` was refused as.

## What is owed, in a file this change did not own

`apps/fe-01/src/components/wbs/wbs-table.tsx` was another agent's for the length
of this change, and it is where the tree read becomes both a chart row and an
export row. **Three edits are owed there.** Until they land, be-01 stores and
serves the words, `gantt-geometry.ts` prints them for any row that carries one,
`plan-export.ts` exports the column — and **no screen shows anything**, because
nothing fills the two row fields.

1. In the `ganttPlan` row literal (beside `notBeforeOffset`, which already reads
   the same wire field):
   `notBeforeReason: row.original.startNoEarlierThanReason,`
2. In `planForExport`'s row literal (beside `startNoEarlierThan`):
   `startNoEarlierThanReason: row.original.startNoEarlierThanReason,`
3. **The Not before cell**: show the reason beside the date, let somebody type
   one, and — the half that is a refusal rather than a rendering — send
   `{ startNoEarlierThan: null, startNoEarlierThanReason: null }` when the date is
   cleared. A bare `{ startNoEarlierThan: null }` on an explained row is now a
   400, `not_before_reason_needs_a_date`.

`GanttRow.notBeforeReason` and `ExportRow.startNoEarlierThanReason` are
**optional** precisely so this is a feature nobody can see rather than a build
nobody can run, and each names the line it is waiting for in its own JSDoc. A
reviewer should read that as a deliberate seam and not as a field somebody
forgot: the unit cases prove both surfaces against rows that carry a reason, so
what is unproven is exactly the one assignment in each place, and nothing else.
