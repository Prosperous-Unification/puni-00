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
| be-01 unit (bun, in `apps/be-01`)                       | **696 pass, 0 fail**, 24,461 `expect()` calls, 12.08s across 57 files                                                                                |
| fe-01 unit (`node vitest run`)                          | **1,303 pass across 50 files, 0 fail**, 57.26s                                                                                                       |
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

be-01 goes 680 → **696** and fe-01 1,295 → **1,303**. The 13 be-01 additions of
the first round are 4 migration cases, 9 capacity-repository cases, 8
capacity-route cases and 3 identity cases, less the 4 `PATCH /api/teams/:id/size`
cases and the 6 `DirectoryService.resizeTeam` cases that went with the retired
route, less C2's landmine case (superseded, see below). The 7 fe-01 additions are
15 new `teams-dialog` cases less the 8 directory size-box cases that moved into
them. The cross-review round adds **three more in be-01** — R5 #16, R5 #17, and
the R5 #9 test that was named and never written — and **one net in fe-01**: R5
#18's 5xx case added, R5 #11's case rewritten rather than added.

The numbers this table carried before that round — 693 and 24,454 `expect()`
calls — were half a defect of their own: two runs at that same head gave **24,452**
twice, at 693/0 either way. Small, and exactly the kind of number this repo prints
because it is checkable, so it is named here rather than quietly overwritten.

## The identity differential, and what it does and does not cover

The promise: **every plan on the deployment schedules byte-identically across the
migration.** It is three tests, and no one of them is the promise — design.md D7
argues the decomposition and this is where it was checked.

| claim                                                            | where                                                                                            | what it holds                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **A** — the migration writes the right numbers                   | `repository/migrate.test.ts`, `seeds every project that existed from the global size it retires` | Real SQLite, rolled back to `add_max_parallel` (`main@050fd45`'s schema) and forward. Six pairs, exactly.           |
| **B** — those numbers produce the answer be-01 gave              | `service/capacity-migration-identity.test.ts`                                                    | 16 captured plans replayed, every field of every work item and every slice.                                         |
| **the wire between them** — `slotsFor` is not the retired column | `repository/capacity.test.ts`, `answers one project's own numbers, and never another's`          | B holds `slotsFor`'s output fixed by construction, so a `slotsFor` reading `service_team.size` passes both A and B. |

**The oracle predates the code, and it has been recaptured to prove it.** The
capture script was run at `050fd45` with nothing else in the tree, and
`fixtures/capacity-oracle-2026-08-13.json` was committed in `fbb5b79` — the first
commit on this branch, before a line of implementation. Re-running it against
this branch's tree would measure the new code against itself; the JSON is the pin
and the script is committed for reproducibility only. It does not compile against
this branch (`WorkItemServiceOptions` gained `capacity` in this very change) and
it sits outside `apps/be-01/src`, so neither be-01's lint nor either of its
tsconfigs sees it.

**Two things this document previously overstated**, both corrected by the
2026-08-13 cross-review. The script is _not_ untouched: `fbb5b79` added it as
`tools/dev/capture-capacity-oracle.ts` and `10df60e` moved it to
`apps/be-01/tools/`, rewriting eleven import paths and one `<T,>`. And the
committed JSON was reformatted by prettier in `10df60e` (429,724 → 428,040
bytes, semantically identical). Neither edit touched what the script computes,
and that is measured rather than argued: the **original** file at its **original**
path, run in a worktree at pristine `050fd45`, reproduces the committed JSON
exactly —

```
worktree @ 050fd45, nothing else in the tree
$ bun tools/dev/capture-capacity-oracle.ts > /tmp/oracle-recaptured.json   # exit 0
$ node -e 'JSON.stringify(committed) === JSON.stringify(recaptured)'
identical: true
```

So the differential's foundation is a measurement now, not the git-log argument
this paragraph used to make.

**The corpus is asserted to be worth measuring before it is used** —
`schedule-identity.test.ts`'s rule. 16 plans, 151 rows, all four estimate methods,
2 plans off the calendar, 3 with manual dates, all four teams and the unlabelled
case, widths 1/2/3, **all six** binding floors, 25 capacity-floored slices, 18 rows
waiting on a pool, and no plan that failed to schedule. A recapture that lost any
of it fails the first test in the file rather than making the second one vacuous.

**What B cannot see, and this is the claim worth reading carefully.** Seeding only
the pairs a plan already labels — the join design.md D2 rejects — would leave B
**green on a real database**: every date in the corpus is identical under it,
because a pair labelling nothing spends no slots. That is exactly D2's point, and
it is why the promise needs A and the third test in B's file as well. A
differential that measured only dates would have shipped the join and
re-scheduled plans the first time somebody labelled a new row.

**That claim is reasoned, and this document used to call it watched.** Injecting
the join into `migration.sql` and running the differential gives **1 pass, 2
fail**, not the green recorded here until the 2026-08-13 cross-review ran it. The
reason is the harness rather than the seeding: `slotsAfterTheMigration()`
(`capacity-migration-identity.test.ts`) writes users, projects and service teams
into the pre-C5 database and **no work items at all** — it does not need them,
because the plans are replayed through in-memory stores afterwards. So a seeding
that joins over `work_item` matches nothing, seeds nothing, and collapses into
R5 #5's empty map; the first failure's output is character-for-character R5 #5's,
and the second is `Expected: 1, Received: undefined` on the first sized team of
the first project. The argument D2 and D7 make is untouched — in production the
join seeds the labelled pairs and the dates are identical — but what supports it
is the reasoning, not that run, and the two are not interchangeable in a document
whose own rule is that every proof quotes output.

## Failure proofs (R5)

Every check below was watched failing with the named fault injected, on h2puni, on
2026-08-13. The injections were reverted and the suites re-run green after each.

| #   | the check                                                                          | the fault injected                                                                                                             | what was observed                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `seeds every project that existed from the global size it retires`                 | the seeding's `CROSS JOIN` narrowed to joins over `work_item` (`wi.project_id = p.id`, `wi.service_team_id = st.id`)           | five of six pairs gone from the `toEqual` diff — all three of `p2`, and `t-design`/`t-platform` on `p1`. The only pair left is the one that happens to be labelled today.                                                                                                                                                                                    |
| 2   | `seeds nothing at all for a team nobody has sized`                                 | `WHERE st.size IS NOT NULL` struck from the seeding                                                                            | the migration itself aborts: `DrizzleError: Failed to run the query`, naming the seeding `INSERT`. **Two** tests go red, not one. The wrapped cause is SQLite's `NOT NULL constraint failed: project_team_capacity.size`, confirmed by running the bare statement against `bun:sqlite` — the migrator prints only its wrapper.                               |
| 3   | `answers one project's own numbers, and never another's`                           | `slotsFor` pointed at `service_team.size` — the fallback this change refuses — with the fixture's teams globally sized 2 and 9 | `p2`'s map: `"t-platform" => 5` became `"t-platform" => 2, "t-backend" => 9`. The project that asked for five was handed the _other_ project's numbers. Three tests red.                                                                                                                                                                                     |
| 4   | `refuses a project or a team that is not there, and writes nothing`                | both existence reads deleted from `CapacityRepository.set`, leaving the foreign keys as the only guard                         | uncaught `SQLiteError: FOREIGN KEY constraint failed` where a modeled `not_found` was owed.                                                                                                                                                                                                                                                                  |
| 5   | `answers exactly what be-01 answered, with the migration's own seeded numbers`     | the seeded map replaced by an empty one — the shape of forgetting the seeding altogether                                       | `p1`'s first comparison: `p1-g0-l0role-1` came back `boundBy: 'roleOrder'` with an empty `capacityPredecessorIds` where `'capacity'` and four predecessors were owed; `earliestStart` moved 7.5 → 3.                                                                                                                                                         |
| 6   | `refuses a capacity that is not a whole number of 1 or more`                       | the integer guard deleted from `capacityOf`                                                                                    | `[200, "0"]` where `[400, "0"]` was owed — a pool of no slots taken and written.                                                                                                                                                                                                                                                                             |
| 7   | `refuses a capacity above what a plan can mean`                                    | the `> MOST_PEOPLE_AT_ONCE` comparison deleted, integer guard left in                                                          | `status: 400` became `200`, the pair coming back `size: 1001`. Injected separately from 6 because neither probe can see the other's line.                                                                                                                                                                                                                    |
| 8   | `tells the project it names and no other, even one sharing the team`               | the publish widened to every project the team labels — C2's own fan-out, put back                                              | `[shed, roof]` where `[shed]` was owed: the untouched plan told to reread for a number that is not its own.                                                                                                                                                                                                                                                  |
| 9   | `names each project's own capacity, and says nothing where a project stated none`  | `directoryUsageOfTeam`'s per-project lookup replaced by "any project stated something" (`[...rows.capacityOf.values()].at(0)`) | `Roof`'s `Shingle` row grew a second effect — `capacity_released, size: 4, fromId: <its own id>` — naming `Rollout`'s pool on a plan that stated none. **695 pass, 1 fail.** This row named a test that did not exist until the cross-review; the same injection was 693/0 green then, because the three other capacity tests here use one-project fixtures. |
| 10  | `lists a team only an ancestor carries, because its pool is what the leaves spend` | the caller's effective reading replaced by each row's stored `serviceTeamId`, so four rows arrive as four nulls                | `expected [] to deeply equal [ { id: 't-backend', …(3) } ]` — a plan whose pool bounds four rows offering nowhere at all to state the number.                                                                                                                                                                                                                |
| 11  | fe-01 cannot read a team's retired global size **at all** — there is no such field | `statedFor.get(team.id) ?? null` written as `?? team.size` in `teamsOnThePlan`                                                 | `apps/fe-01/src/components/wbs/teams-dialog.tsx(70,46): error TS2339: Property 'size' does not exist on type 'TeamView'.` The test that used to hold this (`never reads the team's retired global size`, `expected 7 to be null`) is gone with the field: be-01 no longer sends the column, so the fallback does not compile. See R5 #16.                    |
| 12  | `an emptied box unlimits the team rather than asking for nobody`                   | the empty-box arm replaced by a bare `Number(draft)`                                                                           | `expected "spy" to be called with arguments: [ 't-backend', null ]` — called with `0`, which be-01 refuses and which would be a plan of `Infinity` dates if it did not.                                                                                                                                                                                      |
| 13  | `refuses a number too big to send rather than unlimiting the team`                 | the `Number.isFinite` arm deleted                                                                                              | `expected "spy" to not be called at all, but actually been called 1 times` — `1e999` on its way out as `{ size: null }`, unlimiting a limited team with nothing on screen said about it.                                                                                                                                                                     |
| 14  | `is not asked here at all, because the number is one plan's`                       | the `<Input>` put back on the directory's team row                                                                             | `expected null not to be null` for `How many of Platform at once`.                                                                                                                                                                                                                                                                                           |
| 15  | `Escape puts the box back to what the plan says`                                   | the nested Escape written on the box's own `onKeyDown` with `event.stopPropagation()`                                          | `Unable to find a label with the text of: How many of Backend at once` — the whole surface gone where one draft should have been. Radix's `DismissableLayer` listens on `document`, so React's `stopPropagation` never reaches it; the handler is on Radix's `onEscapeKeyDown`.                                                                              |
| 16  | `answers a team as an id and a name, and never the retired global size`            | `DirectoryRepository.listTeams`'s written-out projection replaced by the bare `select()` it used to be                         | `+ "size": 7,` added to the team `/api/teams` answers with — the retired column on the wire, read by nobody and sent to everybody. Three more assertions in the same file went red with it. Added by the cross-review round.                                                                                                                                 |
| 17  | `never falls back to a globally sized team nobody stated per project`              | the fallback D1 refuses put back in `slotsFor`: the per-project rows, then `serviceTeam.size` for any pair without one         | `Expected: false / Received: true` — a team `p1` never stated, present in its map at the global 7. **695 pass, 1 fail**; the same injection was **693 pass, 0 fail** before this test was written, which is why it was written. Added by the cross-review round.                                                                                             |
| 18  | `says a sentence when the proxy answers, not the status it answered with`          | the `/^http_5\d\d$/` arm deleted from `capacityRefusalSentence`                                                                | `expected 'That capacity could not be changed (h…' to contain 'The server could not save that'` — a wire code in a dialog somebody is typing a number into. Added by the cross-review round.                                                                                                                                                                 |

## Nothing reads `serviceTeam.size`

The claim design.md D1 makes, as a grep rather than an assertion — and **the
second grep is the decisive one**, not the first. This document had that the
other way round until the 2026-08-13 cross-review, and the inversion mattered: a
`select()` with no projection reads every column drizzle knows about, so
`DirectoryRepository.listTeams` was reading `service_team.size` and putting it on
`/api/teams` without the string `serviceTeam.size` appearing anywhere for the
first grep to find. Every read of that table is now written out column by column
(and R5 #16 pins the route's shape), which is what makes the first grep mean what
it says. The second grep — the one that looks at **consumption** — is what carried
the claim all along.

```
$ grep -rn --include=*.ts "serviceTeam\.size" apps libs \
    | grep -v node_modules | grep -vE ":\s*(\*|//)"
(no output)
```

Nothing. Not in production, not in a test. The only remaining appearances of the
name are in prose — `schema.ts`'s `retired by` JSDoc, `capacity.ts`'s "nothing in
this file reads it", and the proof comments for R5 #3, #11 and #17, which are
about the fallback _not_ existing. Re-run at this head, after the projections
went in.

The other grep, for a `.size` read off anything team-shaped in production, finds
three and all three are the **new** table:

```
$ grep -rn --include=*.ts --include=*.tsx -E "(serviceTeam|team|each|row)\.size\b" \
    apps libs | grep -v node_modules | grep -v "\.test\." | grep -vE ":\s*(\*|//|/\*)"
apps/be-01/src/repository/capacity.ts:62        row.size   — project_team_capacity
apps/be-01/src/repository/directory.ts:135      row.size   — project_team_capacity
apps/fe-01/src/components/wbs/teams-dialog.tsx:64  each.size — TeamCapacityView
```

**`ServiceTeam.size` and `TeamView.size` are gone as types too**, which is the
cross-review round's change to this section. They were kept at first on the
argument that be-01 still sends the column and deleting them would make the next
reader think it had gone; what they actually did was keep the retired number on
the wire and keep `?? team.size` writable in fe-01. A team is `{ id, name }` at
both boundaries now, the fallback is a compile error rather than a test (R5 #11),
and each type carries a JSDoc saying where the number went and why the column is
still in the table. The **column** stays exactly as D4 argues — blue and green
share one SQLite file and the outgoing release still selects it — and dropping it
is a later change.

## Deployment

**No deploy gate.** C2's gate existed because be-01 could emit a floor fe-01 could
not draw; C3 closed it, and nothing here reopens it. The migration is additive —
one `CREATE TABLE` and one `INSERT … SELECT`, both checked by the migration lint —
and ships a `down.sql`.

**The first asymmetry worth naming before a swap.** `PATCH /api/teams/:id/size` is
**gone**, so a browser holding the pre-swap fe-01 bundle and typing in the old
directory size box gets a 404 it cannot act on. One release's window, the box is
gone in the bundle beside it, and the alternative — keeping a route that writes a
number no schedule reads — is a silent lie. D4. That same stale bundle now also
draws `undefined` in the box rather than the retired number, because green's
`/api/teams` no longer sends the column: the same window, the same box, and a box
that already refuses every write it can make.

**The second, and it is the one where dates move with nobody having edited a
capacity.** The seeding is a one-time snapshot taken when green boots. Green then
has to pass a health gate before the routing switch, and for the length of that
window **blue is still serving** — `tools/tool-deploy/src/deploy.ts` rejects
`--stop-the-world` unconditionally, so the window is structural rather than a
choice this change made. During it, the outgoing release can:

- **create a project**, which gets no capacity rows. Under blue that plan is
  bounded by every sized team; under green it is unconstrained, and every date in
  it moves at the switch with nobody having touched a capacity. That is D1 case 2
  — intended behaviour, and the one payload state where it arrives without
  anybody making a project _after_ the deploy.
- **write `service_team.size`** through the route this release deletes. The
  number is seeded nowhere and read by nothing after the switch: D4's "silent
  lie" arriving from the other direction. `down.sql` names this too.

**Why it is named rather than fixed.** The window is one boot-to-health-gate; it
is visible and self-healing the moment somebody opens the plan's `Teams` dialog
and types a number; and every fix is worse than the hole. A boot-time reseed
would resurrect capacities somebody deliberately cleared, and seeding at project
create is the thing D1 rejects by name. codex-high raised this at P1 in the
2026-08-13 cross-review and the review adjudicated it P3 on those grounds — the
right change is this paragraph.

**Rollback is real and lossy in one direction.** `down.sql` drops the table. The
release that comes back reads `service_team.size` again, which this migration seeded
these rows _from_ — so every pair nobody has edited comes back at exactly its
seeded number. What is lost is every pair somebody has edited since, plus any
global size typed into the swap window above. Written on the `down.sql` itself.

**Not deployed.** `./bin/dev-deploy.sh` was not run: this branch is for review
first. Nobody has logged in and typed a per-project capacity by hand — that needs
Dany's account, and it is the one thing this document cannot claim.

## CI

**PR #58, head `10df60e`, run 31699280579 — green on the first attempt, no
reruns.** `gate` 2m55s, `pixels` 9m42s. `pixels` is the **only** record of the
browser suite for this head: the Playwright image was not run on h2puni for this
change, because nothing here makes a claim about real layout the way the
In-parallel column's 32px did.

`gate` is also the only record of `nx run-many -t build`, which h2puni cannot run
(no `shellcheck`), and of the secrets scan and the migration lint — the lint being
the one that reads this change's new `migration.sql` and would refuse a
destructive statement in it.

## The 2026-08-13 cross-review

codex (twice — `reasoning effort: none` and `high`, and the difference was the
review) + agy + a driven verify against a private clone at `30228896`, written up
in the workspace as `notes/wbs-cross-review-2026-08-13-capacity-c5.md`. Verdict
**HOLD**: no P1, three P2, eleven P3. The implementation was cleared — the
review went looking for a surviving fallback in the read paths and found none,
and recaptured the oracle at pristine `050fd45` byte-for-byte. What it held for
was the **proof**, in three places.

**Fixed here, each watched red first** — R5 #16, #17 and #18, and the rewritten
#9 and #11:

- **P2-1, and the one the review would not merge without** — Dany's second
  sentence had no test. The suite refused the fallback as a _replacement_
  (`slotsFor` reading the global column instead of the per-project one) and was
  blind to the _addition_ (per-project row first, global number behind it) that a
  maintainer actually writes. That injection was **693 pass, 0 fail** across all
  of be-01, and green for a reason: every fixture creates its teams unsized on
  purpose, so a fallback to `NULL` adds nothing to any map. `never falls back to
a globally sized team nobody stated per project` writes a 7 into the retired
  column and catches it — R5 #17.
- **P2-2** — this document's headline claim about the labelling-join seeding said
  **watched** where the run gives 1 pass / 2 fail, because the identity harness
  holds no work items and the join collapses into R5 #5. Corrected in all three
  places it was written: here, in the test file, and by this section. The
  argument is unchanged; the evidence offered for it now matches what a rerun
  produces.
- **P2-3** — R5 row 9 named a test nobody had written, and its injection left the
  whole be-01 suite green. `names each project's own capacity, and says nothing
where a project stated none` exists now, with the two-project fixture that
  `resizeTeam`'s deleted tests used to provide. agy found this independently and
  was right.
- **codex's `listTeams`** — the unqualified `select()`, rated P1 by both codex
  runs and P3 by the review, which refuted the severity and located the real
  defect in this document's grep argument. Fixed as code anyway, and further than
  either asked: every read of `service_team` is projected, and `size` is off the
  `/api/teams` payload and out of both `ServiceTeam` and `TeamView`. R5 #16, and
  R5 #11 becomes a compile error.
- **codex-high's blue/green swap window** — real, reached independently by the
  review, and now named in "Deployment" beside the 404 it belongs with. P3 rather
  than P1: every fix available is worse than the hole, so the record is the
  change. `down.sql`'s "which no release since has written" is corrected with it.
- **Four record fixes.** `migration.sql` and `schema.ts` both claimed "the
  application deletes these rows before deleting a project or a team" — it does
  not, and the cascade is the only mechanism (`CapacityRepository.set`'s clear is
  the one `DELETE` in the codebase). `directory.ts` still linked
  `{@link DirectoryUsageRows.team}`, a field this change deleted. A JSDoc in
  `work-item.controller.ts` was separated from `asOptionalParallelism` by a blank
  line, so hover showed nothing. And `capacityRefusalSentence` had no 5xx arm,
  which is C3's own P2-2 reappearing in the function written to replace the one
  it was fixed in — R5 #18.

**Recorded and not applied:** the four entries added to "Deferred" below.

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
  claim needs Chromium — C3's `R5 #16`'s lesson.
- **`CapacityService.set`'s response body has no reader.** It answers the
  project's whole capacity list and its JSDoc argues for it — "so a client
  redraws from one response instead of merging a patch" — while
  `httpProjectApi.setTeamCapacity` returns `void` and `TeamsDialog` re-reads the
  tree. `listFor`'s ordering contract is likewise observed only by its own test,
  and `tree()`'s `teamCapacities` sorts with `localeCompare` where `listFor`
  sorts in SQLite's binary collation. They cannot disagree today, because team
  ids are `crypto.randomUUID()` and every differing character is lowercase hex —
  which is a property of the id format that nothing states. Left as it is:
  nothing is broken, and the reader the body was written for is the next client.
- **A capacity stated for a team the plan no longer labels is invisible and comes
  back.** `teamsOnThePlan` lists only teams with an effectively-labelled row (D5),
  so clearing the last label carrying a team leaves its `project_team_capacity`
  row in place with nowhere on screen to clear it — and labelling a row with that
  team again silently re-applies the old number. Defensible as "the plan
  remembers", and it is a third state beside stated and unstated that no artifact
  named until this line.
- **`DROP TABLE IF EXISTS` in `down.sql`**, raised at P2 by codex-high and
  adjudicated a house-pattern false positive: all fourteen `down.sql` files in
  this repo use `IF EXISTS`, and this one follows the pattern exactly. No change.
