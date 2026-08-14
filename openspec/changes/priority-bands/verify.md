# verify — `priority-bands`

Branch `change/priority-bands`, cut from `main` @ `f2d021b` (#58, capacity C5,
merged) on 2026-08-14 and **rebased onto `main` @ `203a85b`** the same day, after
#59 (capacity-docs) and #61 (team-sets) both merged. Everything below the rebase
section was re-run at the rebased head; the numbers in it are that run and not
the pre-rebase one.

be-01 and fe-01, plus one migration. A new table, a new route, one new field on
the plan payload, and four faces that draw a priority differently. **What it must
not have is a moved date**, and section "A ladder moves no date" below is the
whole of that claim — including the part where the obvious differential turned
out not to be able to make it.

## The rebase

#59 and #61 both merged while this branch was open, and GitHub had the PR at
`DIRTY`. Twelve commits replayed onto `203a85b`; four collisions, one of which
was not a text conflict at all and is the one that mattered.

- **`CONTEXT.md`, the **Priority** entry.** #59 rewrote its second sentence to
  say a priority decides which of two _eligible slices_ is **placed** first, and
  that placed first is not started first — a narrow block can take a hole a wide
  one of higher priority cannot use. This branch rewrote the same sentence to say
  the number's _name_ is the project's own. Resolved by keeping **both** facts in
  one paragraph, #59's clause first because it is about the number and this
  branch's second because it is about the name. The four terms this branch adds
  below it (**Priority band**, **Priority ladder**, **Rank**) came through
  untouched.
- **`plan-export.ts`, the import block.** #61 renamed `effectiveTeamOf` /
  `EffectiveTeam` to the plural `effectiveTeamsOf` / `EffectiveTeams`; this
  branch added `priorityBandOf` beside them. Both kept — main's plural pair and
  this branch's band import. The body merged clean, so the export still prints
  #61's joined `Team` cell and this change's `Priority band` column side by side.
- **`repository/migrate-down.test.ts`, seven hunks, all the same shape.** Both
  changes added a constant for "the newest migration" and put it at the head of
  five ordered lists. Both constants kept, and the _order_ is the resolution:
  `WORK_ITEM_TEAM` then `PRIORITY_BANDS` in the ascending lists, the reverse in
  the two `reversed` ones, and `PRIORITY_BANDS` as the target of "does nothing
  when the target is already the newest applied".
- **`repository/migrate.test.ts`, three hunks and then a tangle.** The constants
  and two ordering lists resolved the same way. The tangle is that both changes
  appended a whole `describe` block to the end of the file, so git interleaved
  them: resolved by taking each side's block whole — `the work item team
migration` from main, `the priority band migration` from this branch — rather
  than by merging hunk by hunk.

**Two assertions on main had to move, and neither is a behaviour change.** #61's
`reverses without taking the labels with it` and this branch's
`takes the bands away on the way back…` both roll back to
`add_project_team_capacity` and both assert the literal list `rollbackTo`
returned. With the two migrations now stacked, that list is two names in both
cases. They are named rather than filtered so the assertion stays the answer the
function gave.

**And one thing the rebase broke that no conflict marker showed.**
`service/priority-band-identity.test.ts` replays C5's oracle whole, and #61 put a
`teamIds` set on every work item the oracle predates — so the two corpus replays
failed on `+ "teamIds": [ "team-unsized" ]` and nothing else in the diff: a
payload that gained a field, which is not a payload that moved a date. Fixed the
way #61 fixed its own copy of the same problem in
`capacity-migration-identity.test.ts` — `teamIds` is lifted off every row before
the comparison and **asserted where it comes off**
(`teamIds === serviceTeamId === null ? [] : [serviceTeamId]`), so the lift cannot
hide a write path that forgot the join. Watched green under its own fault: the
assertion forced to `toEqual([])` gives **2 fail**, `Expected - 1 / Received + 3`,
in both replays.

## The migration stamp

**`20260814100000_add_priority_band` had to be renumbered, and this is the
evidence.** #61 merged `20260814100000_add_work_item_team` — the same fourteen
characters. It is now `20260814110000_add_priority_band`.

Forward, the collision is invisible: this drizzle version picks what to apply by
**name** (`getMigrationsToRun` diffs the folder list against
`__drizzle_migrations.name`), so both would have applied, in `localeCompare`
order. Backward it is not invisible. The first fourteen characters become
`created_at`, and `migrationsToRollback` selects with a **strict**
`created_at > baseline.created_at`. Two rows holding the same instant cannot be
separated by it. Measured on h2puni with the old stamp restored in a scratch copy
of `drizzle/`:

```
newest three:
  20260814100000_add_priority_band          1786701600000
  20260814100000_add_work_item_team         1786701600000
  20260813120000_add_project_team_capacity  1786622400000
rollbackTo(20260814100000_add_priority_band)  -> []
   tables still present of the two: 2
rollbackTo(20260814100000_add_work_item_team) -> []
   tables still present of the two: 2
```

That is the abort path printing `no migrations to roll back (already at …)` with
both tables still in the database — a swap that reports a clean rollback and
performed none.

With `110000` the same walk, through the real CLIs against a real file:

```
$ DB_PATH=… bun run src/migrate-cli.ts        ; bun run src/migrate-status-cli.ts
migrations applied
20260814110000_add_priority_band
  20260814110000_add_priority_band          1786705200000
  20260814100000_add_work_item_team         1786701600000
  20260813120000_add_project_team_capacity  1786622400000
$ bun run src/migrate-down-cli.ts --to=20260814100000_add_work_item_team
rolled back: 20260814110000_add_priority_band          # status -> …_add_work_item_team
$ bun run src/migrate-down-cli.ts --to=20260813120000_add_project_team_capacity
rolled back: 20260814100000_add_work_item_team         # status -> …_add_project_team_capacity
$ bun run src/migrate-cli.ts                  ; bun run src/migrate-status-cli.ts
migrations applied
20260814110000_add_priority_band
```

`110000` is also the truthful order: this change is applied after the one already
on main.

**There is no `drizzle/meta/_journal.json` to update, and adding one would break
the migrator.** This drizzle version _throws_ on the file's presence — "We
detected that you have old drizzle-kit migration folders. You must upgrade
drizzle-kit and run `drizzle-kit up`" — and reads the folder list off disk with
`readdirSync().sort()` instead. `repository/migrate-down.ts` reads it the same
way. The rename plus the one line inside `down.sql` that names its own migration
is the whole of the change.

## The gate

Re-run **after the rebase**, at head `8c2b2b3`, on **h2puni** over plain ssh in
`/home/puni1/wd/puni/wt-priority-bands`. Nothing was compiled or tested on
h1claw; that box denies both (`bin/block-local-builds.sh`). `TMPDIR=/var/tmp` is
set in that box's `~/.bashrc` — deliberately, so test databases are off the 3.8 GB
`/tmp` tmpfs whose exhaustion reads as `SQLiteError: disk I/O error`.

| target                                                       | result                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | clean, exit 0                                                                                                                               |
| `bunx nx run-many -t lint typecheck --parallel=2`            | pass, **21 projects**                                                                                                                       |
| be-01 unit (bun **1.2.20**, in `apps/be-01`)                 | **739 pass, 0 fail**, 25,076 `expect()` calls, 20.18s across **61 files**                                                                   |
| gw-01 unit (bun 1.2.20)                                      | **45 pass, 0 fail**, 86 `expect()` calls, 8 files                                                                                           |
| `libs/domain` unit (bun 1.2.20)                              | **65 pass, 0 fail**, 165 `expect()` calls, 4 files                                                                                          |
| fe-01 unit (`node ../../node_modules/vitest/vitest.mjs run`) | **1,338 pass across 52 files, 0 fail**, 55.49s, node **24.18.1**                                                                            |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | **46 items, 46 passed, 0 failed**                                                                                                           |
| secrets scan over all **1,158** tracked files                | exit 0                                                                                                                                      |
| `doc-caps`                                                   | exit 0                                                                                                                                      |
| migration lint over all **34** tracked `.sql`                | exit 0                                                                                                                                      |
| `bunx nx run-many -t build`                                  | **not run here** — `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, absent on h2puni. CI runs it and is the gate of record. |
| fe-01 e2e (`pixels`)                                         | CI — see below.                                                                                                                             |

`nx run be-01:test` and `nx run fe-01:test` are **not** how the suites were run:
under bun on h2puni the fe-01 target runs zero tests and exits 0. be-01, gw-01 and
`libs/domain` are `bun test` in their own directories; fe-01 is
`node ../../node_modules/vitest/vitest.mjs run`.

**The bun version is quoted beside the `expect()` count because the count is not
portable without it, and the rebase re-measured that.** `team-sets`' verify.md
records main at **24,646** `expect()` calls under bun 1.3.14; the same tree, at
`203a85b`, gives **24,644** under the 1.2.20 that is on h2puni today. Two calls,
same source, different bun. Every baseline below was therefore re-measured on
this box at `203a85b` rather than quoted from #61's document.

**Every number that moved, and what moved it.** Baselines are `main` @ `203a85b`
measured here, on the same bun 1.2.20 and node 24.18.1 as the head row:

| suite         | main `203a85b` | rebased head   | the delta                                                                                                       |
| ------------- | -------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| be-01         | 715 / 58 files | **739** / 61   | +24, **all this change's**: 8 store cases, 10 route cases, 3 migration cases, 3 identity cases, in 3 new files. |
| gw-01         | 45 / 8 files   | **45** / 8     | none. This change does not reach the gateway.                                                                   |
| `libs/domain` | 49 / 3 files   | **65** / 4     | +16, all this change's, in `priority-band.test.ts`.                                                             |
| fe-01         | 1,306 / 50     | **1,338** / 52 | +32, all this change's: 6 style, 14 dialog, 6 Prio-cell, 3 card, 1 export, 2 chart.                             |
| openspec      | 45 / 45        | **46** / 46    | +1, this change's own folder.                                                                                   |

No test count moved because main moved. **`expect()` calls did**: be-01 goes
24,644 → **25,076**, and 302 of those +432 are the rebase's own — the `teamIds`
lift added one assertion per row per replay, 151 rows × 2 replays, in
`priority-band-identity.test.ts`. The remaining +130 are this change's new cases.

The pre-rebase gate in this document's first version read be-01 **720** / 24,591,
fe-01 **1,335**, `domain` **63**, openspec **44** — all against `f2d021b`, which
is four merges behind. Those numbers are superseded by the table above and are
recorded here only so the difference is not read as a regression.

**`lint typecheck` was run with `--parallel=2` and was green in one pass.** The
pre-rebase note about serial-only runs stands as history: under parallel
scheduling on a loaded h2puni, `be-01:lint` and `fe-01:lint` each failed once and
nx itself labelled both "flaky". The box was quiet for this run.

**`libs/domain` has a suite of its own, and running `apps/be-01` and `apps/fe-01`
by hand does not reach it.** That is how two branches of `priorityLadderProblem`
shipped unreachable and were found by CI rather than here: `bun test` in
`apps/be-01` collects nothing under `libs/`, and this document's first version
had no line for that target at all. It has one now, and it is the third of four
suites this gate runs.

## A ladder moves no date

The promise, and the one Dany's brief said to stop and report on if it turned out
false: **priority already drives the leveller's queue, so a band must be
presentation and input convenience and nothing else.** It is, structurally —
`goesFirst` in `service/schedule.ts` orders on `work_item.priority` and that
integer alone, and `tree()` reads the ladder into the payload and hands it to
neither `slicesOf` nor `schedule`. This section is that argument as a
measurement, and the interesting half of it is what the measurement could **not**
see.

| claim                                        | where                                                                                          | what it holds                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — the migration writes the right rows  | `repository/migrate.test.ts`, `seeds every project that existed with the five default bands`   | Real SQLite, rolled back to `add_project_team_capacity` and forward. Fifteen rows: three projects × five rungs, each asserted whole.    |
| **B** — the new read perturbs nothing        | `service/priority-band-identity.test.ts`, the two corpus replays                               | C5's sixteen captured plans, replayed with the seeded ladder and with a re-cut one, every field of every work item and every slice.     |
| **C** — the ladder cannot reach the leveller | same file, `leaves a plan whose order priority decides exactly where it was, under any ladder` | One project, one person, two independent leaves: a plan whose order the two priorities alone decide, under two ladders, with a control. |

**B on its own is blind to the fault it is for, and that is measured rather than
supposed.** Every priority in C5's corpus is 1, 2, 3 or 4, so all 26 of them sit
in the default ladder's first band. A build that ordered on the band instead of
the number collapses them to one rank and still answers byte-identically:

```
apps/be-01 @ this head, the ladder wired into `slicesOf` and `schedule`
$ bun test src/service/priority-band-identity.test.ts     # corpus cases only
 4 pass / 0 fail
```

That is why **C** exists, and why it is a purpose-built plan rather than a
recapture: the corpus is C5's pin, taken from a be-01 that no longer exists, and
regenerating it against this branch would measure the new code against itself.

**C's control is over the dates, not over the payload**, and that correction is
worth recording because the first version got it wrong. Comparing whole payloads
makes `expect(swapped).not.toEqual(underDefault)` pass on the stored priorities
being different — which says nothing about whether anything moved. Narrowed to
each row's placement and every slice, the control is real: swapping the two
numbers moves the plan, and re-cutting the ladder does not.

With C present, the injected fault goes red — R5 #10 below.

## Failure proofs (R5)

Every check was watched with the named fault injected, on h2puni, on 2026-08-14.
Each injection was reverted and the suite re-run green afterwards. **Two of the
seventeen did not go red**, and both are in the table with what was done about
them rather than quietly dropped.

| #   | the check                                                                           | the fault injected                                                                                                              | what was observed                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `seeds every project that existed with the five default bands`                      | the whole `INSERT … SELECT` struck from `migration.sql`                                                                         | `Expected length: 15, Received length: 0` — three projects, five rungs each, none written. **15 pass, 1 fail**, and every _behavioural_ test stayed green: design.md D2's whole point, and why this claim is asserted on the table.                                                                                                                                                                                   |
| 2   | `lets the outgoing release keep writing projects against the migrated schema`       | `ON DELETE CASCADE` removed from the migration's foreign key                                                                    | `SQLiteError: FOREIGN KEY constraint failed` on the outgoing release's plain `DELETE FROM project`. **15 pass, 1 fail.** The first version of this case deleted a project created _after_ the migration, which holds no bands — the same injection was **16 pass, 0 fail**, and the fixture now seeds.                                                                                                                |
| 3   | `answers the default ladder for a project holding no rows of its own`               | the `rows.length === 0` arm deleted, so the query's answer is returned bare                                                     | a `toEqual` diff of all five bands (`Expected - 27 / Received + 1`), and `answers a project's own ladder` red beside it — its second plan is the same state. **5 pass, 2 fail.**                                                                                                                                                                                                                                      |
| 4   | `answers a project's own ladder rather than the default one`                        | the same arm made **unconditional**, so every project answers the default                                                       | `Expected: "Blocker" / Received: "Critical"` on `trims a name on the way in` — a project that had re-cut its ladder handed back the five it replaced. **4 pass, 3 fail.** Injected separately from #3 because neither probe can see the other's line.                                                                                                                                                                 |
| 5   | `replaces the whole ladder rather than merging into it`                             | the `tx.delete` struck from `replace`, leaving an insert over live rows                                                         | `SQLiteError: UNIQUE constraint failed: project_priority_band.project_id, project_priority_band.rank`. **6 pass, 1 fail.**                                                                                                                                                                                                                                                                                            |
| 6   | `refuses a project that is not there, and writes nothing`                           | the existence read deleted from the write's transaction, leaving the foreign key as the only guard                              | uncaught `SQLiteError: FOREIGN KEY constraint failed` where a modeled `not_found` was owed. **6 pass, 1 fail.**                                                                                                                                                                                                                                                                                                       |
| 7   | `refuses a ladder whose first band does not start at 1, and writes nothing`         | the `priorityLadderProblem` call deleted from `ladderOf` — the one guard on what a ladder is                                    | `"status": 400` became `"status": 200`, with the project's ladder coming back starting at 5: every priority from 1 to 4 resolving to a band that does not hold it. `refuses a band whose number falls outside it` went red with it. **7 pass, 2 fail.**                                                                                                                                                               |
| 8   | `refuses a band whose start is not a number, rather than storing a string`          | the `typeof band['startsAt'] !== 'number'` arm struck (with a cast in its place so it still compiled)                           | **9 pass, 0 fail — this one did not go red.** `Number.isSafeInteger('21')` is false, so `priorityLadderProblem` refuses a string start on its own. The arms narrow the three fields without an unchecked cast; the refusal is the ladder check's, and #7 is where that is watched. Both the route's JSDoc and the test now say so rather than claiming a proof.                                                       |
| 9   | `tells the project it names and no other`                                           | the `broadcast.publish` deleted from `PriorityBandService.set`                                                                  | `Expected - 3 / Received + 1` on the published list — a re-cut ladder invisible to every screen but the one that typed it. **8 pass, 1 fail.**                                                                                                                                                                                                                                                                        |
| 10  | `leaves a plan whose order priority decides exactly where it was, under any ladder` | the ladder wired into the leveller: each row's priority replaced by its band's inverted rank, through `slicesOf` and `schedule` | slice `bdev` back at `earliestStart: 3`, `latestStart: 3`, `resourcePredecessorId: "adev"` where 0 and none were owed — the two leaves in the other order under one ladder and not the other. **4 pass, 1 fail.** Against the sixteen-plan corpus alone the same injection is **4 pass, 0 fail**; see above.                                                                                                          |
| 11  | `draws the number in its band's colour and names the band in the title`             | the `color: paint?.ink` line deleted from `PriorityCell`                                                                        | `expected '' not to be ''` — a Critical row and a Lowest row drawn in one ink.                                                                                                                                                                                                                                                                                                                                        |
| 12  | `caps a bar in its band's colour, and leaves an unranked bar uncapped`              | the cap block deleted from the chart                                                                                            | `expected undefined to be '0'` — no band mark anywhere on the chart.                                                                                                                                                                                                                                                                                                                                                  |
| 13  | `names the band on a card, in its own colour`                                       | the chip deleted from the card header                                                                                           | `expected undefined to be 'Critical 5'` — a phone with no priority on it at all, and the cards are the only face some readers have.                                                                                                                                                                                                                                                                                   |
| 14  | `names the band beside the number, from the plan's own ladder`                      | the export's cell pointed at `DEFAULT_PRIORITY_BANDS` instead of `plan.priorityBands`                                           | `expected 'Critical' to be 'Blocker'` — an export naming a band the plan it came from does not have.                                                                                                                                                                                                                                                                                                                  |
| 15  | `refuses an empty box here rather than sending a zero`                              | the `Number.isSafeInteger` arms replaced by a bare `Number(draft)` in `ladderOfDrafts`                                          | `expected [ { startsAt: 1, …(2) }, …(4) ] to be null`, and `refuses an empty box on this surface` on `expected "spy" to not be called at all, but actually been called 1 times` — a band starting at 0 on its way out. **2 fail.**                                                                                                                                                                                    |
| 16  | `sends the whole ladder on Save, never one rung of it`                              | the send narrowed to the rung that changed                                                                                      | `expected [ { startsAt: 1, …(2) } ] to deeply equal [ { startsAt: 1, …(2) }, …(4) ]` — half a ladder on its way to a route that refuses anything but five.                                                                                                                                                                                                                                                            |
| 17  | `does not open the band list merely because the caret landed here`                  | the list's `onClick` moved onto the wrapper's `onFocus`                                                                         | **5 fail**, and three of them pre-existing: `expected <ul role="listbox">…</ul> to be null`, `sends what was typed on Enter` on `expected [] to deeply equal [ { priority: 1 } ]`, and `sends one request for a priority entered with Enter and then left` on `expected '1e999' to be '4'` — a refusal held for the cell written back over the draft by the re-attach the focus-time `setState` causes. design.md D6. |

**Sixteen of the seventeen went red. #8 is recorded as reasoned rather than
watched**, in this table and in the two places the claim was written, because a
proof this document cannot reproduce is worse than no proof.

**Two checks that could not fail, found by CI and fixed.** Neither was an
injection — they were `libs/domain`'s own suite failing the first time anything
ran it (run 31779765416, 2 fail):

- `bands_must_start_in_increasing_order` was **unreachable**. Written as one loop
  that settled each band's start and then its default before moving on, an equal
  or decreasing start leaves the band beneath it with no width — so that band's
  default is already outside itself and the _default_ code answered first.
  `Expected: "bands_must_start_in_increasing_order" / Received: "band_default_must_be_inside_its_own_band"`.
  The validator settles the whole ladder's starts before it looks at any default
  now, and every branch is reachable.
- The same ordering made `band_start_must_be_a_whole_number_from_1` unreachable
  for a start of `0` on any rung but the first, for the same reason and with the
  same fix.

A check that cannot fail is what R5 exists to stop, and these two are the
seventeenth and eighteenth in this repository's tally.

**One regression of this change's own, also from that run.**
`PrioritiesDialog` reseeded its boxes from an effect keyed on `[bands, open]`,
and `bands` is a fresh array from every payload — so every tree read anywhere in
the app queued a `setDrafts` from a component that is not on screen. Harmless in
a browser, and 77 `An update to PrioritiesDialog inside a test was not wrapped in
act(...)` in one CI log. It seeds on the open/close transition instead. The
`WbsTable` warnings in the same log are **pre-existing** and measured as such:
one spec's count is 17 on `wt-capacity-c5` and 18 here, the one being this
change's three new card cases.

## The corpus, and why it was reused rather than recaptured

`fixtures/capacity-oracle-2026-08-13.json` is `capacity-per-project`'s, untouched
by this change. It was captured at `050fd45` by a script committed before that
branch had a line of implementation in it, so it predates **both** changes —
which is exactly what makes it usable here. Re-running the capture against this
branch would replace a pin taken from a be-01 that no longer exists with one
taken from the code under test; C5's design.md D7 has the full argument.

C5's own differential gains one key in its expected payload —
`priorityBands: DEFAULT_PRIORITY_BANDS` — and nothing else. That is this change's
entire effect on it, and it is the same statement B makes from the other side.

## Deployment

**No deploy gate.** The migration is additive — one `CREATE TABLE` and one
`INSERT … SELECT`, both checked by the migration lint — and ships a `down.sql`.
Nothing be-01 emits here can be undrawable by an older fe-01: the field is
additive on the payload and an old bundle ignores it.

**The blue/green swap window has no hole in it**, which is worth saying because
C5's had two. The outgoing release can create a project during the window; that
project gets no band rows, and it reads as `DEFAULT_PRIORITY_BANDS` — the same
ladder every seeded project has. Nothing moves at the switch and nothing is
silently different. That is design.md D2 working as designed rather than a case
that needed mitigating.

**The one asymmetry**, and it is a cosmetic one: a browser holding the pre-swap
fe-01 bundle draws priorities as bare numbers and has no `Priorities` button,
because that bundle knows nothing about bands. One release's window, and the
bundle beside it has both.

**Rollback loses the naming and nothing else.** `down.sql` drops the table; every
work item's priority stays exactly where it is, and the release that comes back
levels on those same numbers. That is the one rollback in this repo that moves no
date, and it is a property of the ladder never having been read by the leveller.

**Not deployed.** `./bin/dev-deploy.sh` was **not** run — a full cloud regression
is running against dev and must not have the target move under it. Nobody has
logged in and re-cut a ladder by hand; that needs Dany's account, and it is the
one thing this document cannot claim.

## CI

**The run that matters is at the rebased head.** `31799923338` at
`c077750fbbe38b9c04c48d8d15d7a021b8bf0a52`, `conclusion: success`, **`gate` and
`pixels` both green** — the tree this PR merges, with #59 and #61 under it and the
migration on its new stamp. First attempt, no rerun.

Everything below is the pre-rebase record, kept because two of the runs in it
caught real defects.

**PR #60, head `ff3bff1`, run 31781023217 — `gate` and `pixels` both green.**

Two runs before it are on the record, and both are worth naming because of what
they caught rather than as bookkeeping.

**Run 31779078849 at `7e4d531` failed**: `pixels` green, `gate` dead in the
Format step over **this file**. A markdown table edited by hand does not survive
prettier's column alignment, and the gate checks it before it runs anything.
That is `capacity-per-project`'s own R5 lesson — its run 31736929230 at
`5c3ac76`, same cause, same file — arriving a second time in the change that
quotes it. The commit after it is that padding and the paragraph naming it.

**Run 31779765416 at `54c119f` failed**, and this one was a real defect: `gate`
died on `libs/domain`'s suite, two cases of `priority-band` red. Both were
branches of `priorityLadderProblem` that could not fail, and both are written up
under "Failure proofs" above. `pixels` was green in that run too. It is the run
that says out loud what running two apps' suites by hand and calling that the
gate costs.

The head each paragraph names and the head that merges differ by **this file and
nothing else** — the last commit on a branch cannot cite the run of its own sha.
C5 recorded a run against the wrong head by not saying so; this is that lesson
applied, and it is why `8a9e305`'s own green run (31781661921) and this one are
both named rather than one standing for the other.

`gate` is also the only record of `nx run-many -t build`, which h2puni cannot run
(no `shellcheck`), and of the secrets scan and the migration lint — the lint
being the one that reads this change's new `migration.sql` and would refuse a
destructive statement in it.

## Deferred, and recorded rather than done

- **The five colours.** `BAND_INKS` is five entries in one array behind one
  function precisely because Dany said the colour strategy will be revisited once
  he can see it. Changing them is editing that table; no face has an opinion of
  its own to update.
- **Adding or removing a rung.** Refused, argued in design.md D3, and the cost is
  named there: a project wanting four meaningful bands spends the fifth on
  something.
- **Re-numbering work items when a band is re-cut.** A work item at 25 is `High`
  before a re-cut and `Critical` after, and its number does not move. That is the
  whole point — a ladder is a vocabulary — but it means a plan can be re-cut into
  saying something its author did not mean, and nothing warns about it.
- **No undo for a ladder**, joining `estimateMethod`, `startDate` and a team's
  capacity: it is a project fact with no work-item revision for an undo entry to
  hang on.
- **No e2e spec of its own.** The dialog and the cell's list are jsdom-tested. The
  chart's cap is the one thing here with a real geometry — 3px at `DAY_PX` — and
  it makes no claim a browser has to measure the way the In-parallel column's
  32px did. If it ever grows a width claim, that claim needs Chromium.
- **A band's name may be a number.** A project that renames a rung to `7` has a
  name that is also a priority, and `priorityTyped` resolves the name first. Named
  in D6 rather than refused, because refusing it is a rule about labels that
  nothing else in this app has.
- **`PriorityBandService.set`'s response body has no reader.** It answers the
  project's whole ladder and `httpProjectApi.setPriorityBands` returns `void`;
  the dialog re-reads the tree. Left as it is, exactly as C5 left the same shape:
  the reader it was written for is the next client.
