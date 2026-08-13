# verify — `capacity-per-project`

Branch `change/capacity-per-project`, cut from `main` @ `050fd45` (#56 unified
scroll and #57 capacity C3 both merged) on 2026-08-13.

be-01 and fe-01, plus one migration. **This change has a migration and a wire
change**, unlike C3: a new table, a new route, a retired route, and one new field
on the plan payload. What it must not have is a moved date, and the identity
differential below is the whole of that claim.

## The gate

Run on **h2puni** over plain ssh. Nothing was compiled or tested on h1claw; that
box denies both (`bin/block-local-builds.sh`).

| target                                                  | result                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean, exit 0                                                                                                                                        |
| `bun test` in `apps/be-01`                              | **693 pass, 0 fail**, 24,454 `expect()` calls, 12.29s across 57 files                                                                                |
| fe-01 unit (`node vitest run`)                          | **1,302 pass across 50 files, 0 fail**, 59.89s                                                                                                       |
| `bunx nx run-many -t lint typecheck --skip-nx-cache`    | pass, 21 projects                                                                                                                                    |
| `bunx nx run-many -t build`                             | **not run here.** `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, which h2puni does not have. CI runs it and is the gate of record. |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | 43 items, 43 passed, 0 failed                                                                                                                        |
| fe-01 e2e (`pixels`)                                    | CI, and the record for the head — see "CI" below.                                                                                                    |

`nx run be-01:test` and `nx run fe-01:test` are **not** how the suites were run:
under bun on h2puni the fe-01 target runs zero tests and exits 0 (four agents have
hit it now). be-01 is `bun test` in `apps/be-01`; fe-01 is
`node ../../node_modules/vitest/vitest.mjs run` with node 22 on `PATH`.

`nx run-many -t lint` is run with `--skip-nx-cache`: a cached failure was replayed
three times here while the tree was already clean, which cost twenty minutes.

be-01 goes 680 → 693 and fe-01 1,295 → 1,302. The 13 be-01 additions are 4
migration cases, 9 capacity-repository cases, 8 capacity-route cases and 3 identity
cases, less the 4 `PATCH /api/teams/:id/size` cases and the 6
`DirectoryService.resizeTeam` cases that went with the retired route, less C2's
landmine case (superseded, see below). The 7 fe-01 additions are 15 new
`teams-dialog` cases less the 8 directory size-box cases that moved into them.

## The identity differential, and what it does and does not cover

The promise: **every plan on the deployment schedules byte-identically across the
migration.** It is three tests, and no one of them is the promise — design.md D7
argues the decomposition and this is where it was checked.

| claim                                                            | where                                                                                            | what it holds                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **A** — the migration writes the right numbers                   | `repository/migrate.test.ts`, `seeds every project that existed from the global size it retires` | Real SQLite, rolled back to `add_max_parallel` (`main@050fd45`'s schema) and forward. Six pairs, exactly.           |
| **B** — those numbers produce the answer be-01 gave              | `service/capacity-migration-identity.test.ts`                                                    | 16 captured plans replayed, every field of every work item and every slice.                                         |
| **the wire between them** — `slotsFor` is not the retired column | `repository/capacity.test.ts`, `answers one project's own numbers, and never another's`          | B holds `slotsFor`'s output fixed by construction, so a `slotsFor` reading `service_team.size` passes both A and B. |

**The oracle predates the code.** `apps/be-01/tools/capture-capacity-oracle.ts`
was run at `050fd45` with nothing else in the tree, and
`fixtures/capacity-oracle-2026-08-13.json` was committed in `fbb5b79` — the first
commit on this branch, before a line of implementation. `git log --oneline` shows
it. Re-running that script against this branch's tree would measure the new code
against itself; the JSON is the pin and the script is committed for reproducibility
only. It does not compile against this branch (`WorkItemServiceOptions` gained
`capacity` in this very change) and it is deliberately outside `apps/be-01/src`, so
neither be-01's lint nor either of its tsconfigs sees it. **Editing it to compile
would mean the committed script was not the script that produced the capture.**

**The corpus is asserted to be worth measuring before it is used** —
`schedule-identity.test.ts`'s rule. 16 plans, 151 rows, all four estimate methods,
2 plans off the calendar, 3 with manual dates, all four teams and the unlabelled
case, widths 1/2/3, **all six** binding floors, 25 capacity-floored slices, 18 rows
waiting on a pool, and no plan that failed to schedule. A recapture that lost any
of it fails the first test in the file rather than making the second one vacuous.

**What B cannot see, and this is the finding worth reading.** Seeding only the
pairs a plan already labels — the join design.md D2 rejects — leaves B **green**.
Watched. Every date in the corpus is identical under it, because a pair labelling
nothing spends no slots. That is exactly D2's point, and it is why the promise
needs A and the third test in B's file as well. A differential that measured only
dates would have shipped the join and re-scheduled plans the first time somebody
labelled a new row.

## Failure proofs (R5)

Every check below was watched failing with the named fault injected, on h2puni, on
2026-08-13. The injections were reverted and the suites re-run green after each.

| #   | the check                                                                          | the fault injected                                                                                                             | what was observed                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `seeds every project that existed from the global size it retires`                 | the seeding's `CROSS JOIN` narrowed to joins over `work_item` (`wi.project_id = p.id`, `wi.service_team_id = st.id`)           | five of six pairs gone from the `toEqual` diff — all three of `p2`, and `t-design`/`t-platform` on `p1`. The only pair left is the one that happens to be labelled today.                                                                                                                                                      |
| 2   | `seeds nothing at all for a team nobody has sized`                                 | `WHERE st.size IS NOT NULL` struck from the seeding                                                                            | the migration itself aborts: `DrizzleError: Failed to run the query`, naming the seeding `INSERT`. **Two** tests go red, not one. The wrapped cause is SQLite's `NOT NULL constraint failed: project_team_capacity.size`, confirmed by running the bare statement against `bun:sqlite` — the migrator prints only its wrapper. |
| 3   | `answers one project's own numbers, and never another's`                           | `slotsFor` pointed at `service_team.size` — the fallback this change refuses — with the fixture's teams globally sized 2 and 9 | `p2`'s map: `"t-platform" => 5` became `"t-platform" => 2, "t-backend" => 9`. The project that asked for five was handed the _other_ project's numbers. Three tests red.                                                                                                                                                       |
| 4   | `refuses a project or a team that is not there, and writes nothing`                | both existence reads deleted from `CapacityRepository.set`, leaving the foreign keys as the only guard                         | uncaught `SQLiteError: FOREIGN KEY constraint failed` where a modeled `not_found` was owed.                                                                                                                                                                                                                                    |
| 5   | `answers exactly what be-01 answered, with the migration's own seeded numbers`     | the seeded map replaced by an empty one — the shape of forgetting the seeding altogether                                       | `p1`'s first comparison: `p1-g0-l0role-1` came back `boundBy: 'roleOrder'` with an empty `capacityPredecessorIds` where `'capacity'` and four predecessors were owed; `earliestStart` moved 7.5 → 3.                                                                                                                           |
| 6   | `refuses a capacity that is not a whole number of 1 or more`                       | the integer guard deleted from `capacityOf`                                                                                    | `[200, "0"]` where `[400, "0"]` was owed — a pool of no slots taken and written.                                                                                                                                                                                                                                               |
| 7   | `refuses a capacity above what a plan can mean`                                    | the `> MOST_PEOPLE_AT_ONCE` comparison deleted, integer guard left in                                                          | `status: 400` became `200`, the pair coming back `size: 1001`. Injected separately from 6 because neither probe can see the other's line.                                                                                                                                                                                      |
| 8   | `tells the project it names and no other, even one sharing the team`               | the publish widened to every project the team labels — C2's own fan-out, put back                                              | `[shed, roof]` where `[shed]` was owed: the untouched plan told to reread for a number that is not its own.                                                                                                                                                                                                                    |
| 9   | `names each project's own capacity, and says nothing where a project stated none`  | `directoryUsageOfTeam`'s per-project lookup replaced by "any project stated something"                                         | the second project's rows carried `capacity_released, size: 4` for a plan that has no pool at all.                                                                                                                                                                                                                             |
| 10  | `lists a team only an ancestor carries, because its pool is what the leaves spend` | the caller's effective reading replaced by each row's stored `serviceTeamId`, so four rows arrive as four nulls                | `expected [] to deeply equal [ { id: 't-backend', …(3) } ]` — a plan whose pool bounds four rows offering nowhere at all to state the number.                                                                                                                                                                                  |
| 11  | `never reads the team's retired global size`                                       | `statedFor.get(team.id) ?? null` written as `?? team.size`                                                                     | `expected 7 to be null`.                                                                                                                                                                                                                                                                                                       |
| 12  | `an emptied box unlimits the team rather than asking for nobody`                   | the empty-box arm replaced by a bare `Number(draft)`                                                                           | `expected "spy" to be called with arguments: [ 't-backend', null ]` — called with `0`, which be-01 refuses and which would be a plan of `Infinity` dates if it did not.                                                                                                                                                        |
| 13  | `refuses a number too big to send rather than unlimiting the team`                 | the `Number.isFinite` arm deleted                                                                                              | `expected "spy" to not be called at all, but actually been called 1 times` — `1e999` on its way out as `{ size: null }`, unlimiting a limited team with nothing on screen said about it.                                                                                                                                       |
| 14  | `is not asked here at all, because the number is one plan's`                       | the `<Input>` put back on the directory's team row                                                                             | `expected null not to be null` for `How many of Platform at once`.                                                                                                                                                                                                                                                             |
| 15  | `Escape puts the box back to what the plan says`                                   | the nested Escape written on the box's own `onKeyDown` with `event.stopPropagation()`                                          | `Unable to find a label with the text of: How many of Backend at once` — the whole surface gone where one draft should have been. Radix's `DismissableLayer` listens on `document`, so React's `stopPropagation` never reaches it; the handler is on Radix's `onEscapeKeyDown`.                                                |

## Nothing reads `serviceTeam.size`

The claim design.md D1 makes, as a grep rather than an assertion. **The decisive
one is the second**: every read of that column has to go through the drizzle column
object, and every write of it has to name it in a `set`, so a search for
`serviceTeam.size` finds any of them anywhere in the codebase — comments excluded,
tests included.

```
$ grep -rn --include=*.ts "serviceTeam\.size" apps libs \
    | grep -v node_modules | grep -vE ":\s*(\*|//)"
(no output)
```

Nothing. Not in production, not in a test. The only remaining appearances of the
name are in prose — `schema.ts`'s `retired by` JSDoc, `capacity.ts`'s "nothing in
this file reads it", and the proof comments for R5 #3 and #11, which are about the
fallback _not_ existing.

The weaker grep, for a `.size` read off anything team-shaped in production, finds
three and all three are the **new** table:

```
$ grep -rn --include=*.ts --include=*.tsx -E "(serviceTeam|team|each|row)\.size\b" \
    apps libs | grep -v node_modules | grep -v "\.test\." | grep -vE ":\s*(\*|//|/\*)"
apps/be-01/src/repository/capacity.ts:52        row.size   — project_team_capacity
apps/be-01/src/repository/directory.ts:135      row.size   — project_team_capacity
apps/fe-01/src/components/wbs/teams-dialog.tsx:61  each.size — TeamCapacityView
```

`ServiceTeam.size` and `TeamView.size` still exist as **types**, and deliberately:
be-01 still sends the column, and deleting it from the two views would make the next
reader think it had gone. Both carry a JSDoc saying it is retired and what the rule
used to be. The column stays in the table because blue and green share one SQLite
file and the outgoing release still selects it (D4); dropping it is a later change.

## Deployment

**No deploy gate.** C2's gate existed because be-01 could emit a floor fe-01 could
not draw; C3 closed it, and nothing here reopens it. The migration is additive —
one `CREATE TABLE` and one `INSERT … SELECT`, both checked by the migration lint —
and ships a `down.sql`.

**The one asymmetry worth naming before a swap.** `PATCH /api/teams/:id/size` is
**gone**, so a browser holding the pre-swap fe-01 bundle and typing in the old
directory size box gets a 404 it cannot act on. One release's window, the box is
gone in the bundle beside it, and the alternative — keeping a route that writes a
number no schedule reads — is a silent lie. D4.

**Rollback is real and lossy in one direction.** `down.sql` drops the table. The
release that comes back reads `service_team.size` again, which this migration seeded
these rows _from_ and which no release since has written — so every pair nobody has
edited comes back at exactly its seeded number. What is lost is every pair somebody
has edited since. Written on the `down.sql` itself.

**Not deployed.** `./bin/dev-deploy.sh` was not run: this branch is for review
first. Nobody has logged in and typed a per-project capacity by hand — that needs
Dany's account, and it is the one thing this document cannot claim.

## CI

Recorded at the head this document describes, after the PR is opened. `gate` and
`pixels` both, and the `pixels` job is the only record of the browser suite for
this head — the Playwright image was not run on h2puni for this change.

## Deferred, and recorded rather than done

- **Dropping `serviceTeam.size`.** A later change, once no running release reads
  it. The column carries its own `retired by` note pointing here.
- **The three cases that start unconstrained** (D1): a team sized for the first
  time after the migration, a project created after it, and any pair the seeding
  did not cover. These are the intended behaviour of Dany's second sentence, not
  gaps — what they need is discoverability, which is what moving the box onto the
  plan is for.
- **No undo for a capacity**, joining `estimateMethod` and `startDate` (D6). Not
  C2's reason (the directory not being journalled) but theirs: it is a project
  fact, and there is no work-item revision for an undo entry to hang on.
- **No e2e spec of its own.** The `Teams` dialog is jsdom-tested; nothing about it
  depends on real layout the way the In-parallel column's 32px did, so there is no
  measurement for a browser to make. If the dialog ever grows a width claim, that
  claim needs Chromium — `R5 #16`'s lesson.
