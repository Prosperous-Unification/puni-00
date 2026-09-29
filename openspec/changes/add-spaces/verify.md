# verify — add-spaces

## Slice 0 — spec

Written on `batch-9/010-4-15-spaces-spec` from main `802432df`; amended after the Fable review
(I1, I2, M4, M8). The change name follows the lane brief (`add-spaces`); the design memo
called it `project-spaces`. Slice 1 then took review fixes M5–M7 and M9: field-wise save
comparison, named restore refusals, the CLI renamed `space-rollback-cli.ts` and the
redundant foreign-key pragma dropped from its tests.

## Slice 1 — storage

Red before implementation: `space.db.test.ts` failed to load (`Cannot find module './space'`,
0 pass, 1 fail, 1 error); `space-rollback.db.test.ts` likewise (0 pass, 1 fail, 1 error).
Green after: `space.db.test.ts` 17 pass (8 of them the shared `spaceStoreConformance`),
`space-rollback.db.test.ts` 4 pass, `space-fixture.test.ts` (memory) 8 pass, the spaces CLI
case in be-01's `migration-cli.db.test.ts` passes with the other 6.

Adding the migration moved 20 store-sqlite test files whose rollback lists pin every newer
migration, three table lists, and one "newest applied" assertion; each gained the new name
and nothing else. `audit.test.ts` excuses `space-rollback.ts` inserts as a verbatim restore,
as it does `typed-dependency-rollback.ts`. The namespacing inventory pins the two new blobs;
the store-memory module index lists the fixture and its test.

**Merging with the statuses stack.** `20260928200000_add_work_item_status_facts` edits the same
pinned lists; whichever lands second adds the other's name beside its own.

## Commands

| Slice | Command                                                                          | Result                                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                         | exit 0; 141 passed, 0 failed; `add-spaces` valid, no issues                                                                                                                                                                                                         |
| 1     | `bun test` in `libs/wbs/adapters/store-sqlite`, `CLAUDECODE` unset               | 1157 pass, 6 fail before the last pin fixes; the five migration failures fixed and rerun 85 pass, 0 fail                                                                                                                                                            |
| 1     | the one other failure, `saved-plan-busy.db.test.ts`, rerun alone                 | pass (5.3 s wall-clock window under the parallel suite)                                                                                                                                                                                                             |
| 1     | `bunx nx run-many -t typecheck lint:fast` over the five touched projects         | `Successfully ran targets typecheck, lint:fast for 5 projects`                                                                                                                                                                                                      |
| 1     | `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`               | 15 pass, 0 fail after indexing the fixture                                                                                                                                                                                                                          |
| 1     | `bunx nx affected -t typecheck test lint --base=origin/main`, `CLAUDECODE` unset | first run exit 1: `tool-devsync:test` (unindexed fixture, since fixed) and `wbs-store-sqlite:test` (`keeps cached medians within ten percent`, wall-clock, 132 s under load); rerun at `78ae8dd3`: `Successfully ran targets typecheck, test, lint for 19 projects` |

## Failure proofs

Each fault was injected into the production file, the named test run, and the file restored.

| Check                                  | Fault injected                                         | Test that observed it                                                           | Observed                                                                    |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| project composite reference            | its `FOREIGN KEY` line removed from `migration.sql`    | `refuses a membership joining a space and a project of different organizations` | `Received function did not throw`                                           |
| space composite reference              | its `FOREIGN KEY` line removed from `migration.sql`    | same                                                                            | `Received function did not throw`                                           |
| project delete cascades                | `ON DELETE CASCADE` removed from the project reference | `removes a deleted project from every space, past the ownership freeze`         | `SQLiteError: FOREIGN KEY constraint failed`                                |
| `down.sql` guard                       | the guard's `INSERT` replaced by `SELECT 1`            | `refuses while a space exists, keeping both tables and the ledger`              | `Received function did not throw`, value `["20260929100000_add_spaces"]`    |
| store ownership read (SQLite)          | `owned === undefined` → `owned === null`               | `refuses a project another organization owns, storing nothing`                  | `DrizzleQueryError … FOREIGN KEY constraint failed` thrown, not `not_found` |
| store ownership check (memory)         | owner comparison dropped                               | same, `inMemorySpaces`                                                          | `Expected - 2 / Received + 2` (a stored `b1`)                               |
| stale save refused                     | comparison reduced to the number of spaces             | `refuses to remove a save that no longer matches, deleting nothing`             | `Received function did not throw`, value `2`                                |
| restore names the project              | ownership check skipped                                | `refuses the whole restore when a saved project is gone or changed owner`       | message was drizzle's `Failed query: insert into "space_project" …`         |
| CLI usage guard                        | command check replaced by `false`                      | `saves, removes and restores spaces through the rollback CLI`                   | `Expected to contain: "usage:"`; `erase` ran as a restore                   |
| member compared field-wise (review M5) | `isSameMember` answering true                          | `refuses to remove a save whose one field differs, deleting nothing`            | `Received function did not throw`, value `2`                                |
| restore names a name clash (M6)        | clash read skipped                                     | `refuses the whole restore, naming it, over a name now taken`                   | drizzle's `Failed query: insert into "space"`                               |
| restore names a missing author (M6)    | `isUser` answering true                                | `refuses the whole restore, naming it, when an author is no longer a user`      | drizzle's `Failed query: insert into "space"`                               |

## Slice 2 — routes and the leak rule

Written on `batch-9/010-4-15-spaces-routes`, stacked on the storage branch. Eight endpoint shapes
(`space-shapes.ts`), `SpaceResource`, `spaceRoutes`, `SpaceStore.legacyOrganizationId`, boot and
harness wiring, and four new refusal words (`organization_required`, `name_taken`,
`already_in_space`, `virtual_space`). Every app composition outside the harness takes the inert
`refusingSpaces`; the production-route reachability test takes an empty memory store.

`space.resource.test.ts` 8 pass; `space-organization.controller.db.test.ts` 8 pass;
`app.routes.test.ts` 6 pass; mcp-01 `generated-document.test.ts` 6 pass with 62 pinned tools.

`bunx nx affected -t typecheck test lint --base=origin/main` (CLAUDECODE unset): the first run
failed `tool-devsync:test` (the new file in `service/` was unclassified; renamed
`space.resource.ts`, whose suffix declares its kind) and `wbs-be-01:test` (`ENOSPC` in `/tmp`
while the host disk was full; the suite passes alone, 32 of 32). The rerun at `12d6c682`:
`Successfully ran targets typecheck, test, lint for 19 projects`.

| Check                           | Fault injected                                       | Test that observed it                                                      | Observed                                       |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| viewer refused writes           | `writableOwner`'s role check skipped                 | `refuses a viewer every space write and lets the viewer read` (controller) | `status: 201` for the viewer's create, not 403 |
| same, service level             | same                                                 | `refuses a viewer every write and lets the viewer read`                    | `Expected - 2 / Received + 10`                 |
| foreign space is absent         | organization condition dropped from `inOrganization` | `answers another organization's space as absent to every route`            | `status: 200`, not 404                         |
| leak rule: rows and count       | readable filter removed in `read`                    | `omits a project the caller cannot open from the rows and the count`       | a third row                                    |
| leak rule: add                  | `readWithin` gate bypassed in `addProject`           | `answers a project the caller cannot open as not_found, adding nothing`    | the store's position instead of `not_found`    |
| leak rule: add anchor (review)  | `afterProjectId` left out of the `addProject` gate   | `refuses to place a project after it, as if it were not a member`          | `{ ok: true, value: 25 }`                      |
| leak rule: move member (review) | `projectId` left out of the `moveProject` gate       | `refuses to move it, or to move another after it`                          | `{ ok: true, value: 5 }`                       |
| leak rule: move anchor (review) | `afterProjectId` left out of the `moveProject` gate  | same                                                                       | `{ ok: true, value: 30 }`                      |
| leak rule: remove (review)      | the `removeProject` gate removed                     | `refuses to remove it`                                                     | `{ ok: true, value: null }`                    |

## Slice 3 — roll-ups

Written on `batch-9/010-4-15-spaces-roll-ups`, stacked on the routes branch after main
`4bb71e5f` (statuses) was merged through storage. `project-roll-up.test.ts` 5 pass;
`space.resource.test.ts` 18 pass; `space-organization.controller.db.test.ts` 11 pass (the
after-activation block now opens the composed harness, whose real units of work the command
case needs; the viewer, foreign-space and limit negatives were re-observed there).

**Budget** (`space-roll-up-performance.db.test.ts`, 30 imported projects of 300 rows): the space
read (3–4 ms) is asserted under 120 ms and the warm chunk of 20 (11–15 ms) under 400 ms. The cold
chunk first measured 4,961 ms; Fable's profile put 4,607 ms of it in `findCrossReferences`
scanning `work_item` and `dependency`, fixed in #235 and merged here, after which it measures
444–484 ms. Per Fable's review it is not bounded by wall clock, since CI runs be-01 under
coverage beside another task on four vCPUs and no calibrated factor exists. The test asserts
the cold path's work instead: 20 tree reads cold, none warm (cache hits ignored → 20 warm
reads), and no gate table scan (`#235`'s parent arm restored → `SCAN w`, 4,115 ms). The time is
printed.

| Check                                     | Fault injected                                            | Test that observed it                                                                        | Observed                                   |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| cache keyed by sequence                   | the sequence left out of `RollUpCache.keyOf`              | `answers a command's new total on the next read, and serves an unchanged one from the cache` | `Expected: 5`, `Received: 3`               |
| cache expires                             | the TTL check skipped                                     | `expires a roll-up after the TTL even at the same sequence`                                  | `Expected: 5`, `Received: 3`               |
| status is the parent fold                 | `foldStatuses` swapped for an `agree` fold seeded unknown | `folds the roots, so a project whose roots are all on hold reads on_hold`                    | `Received: "in_progress"`                  |
| leak rule: roll-ups                       | the readable check removed from `rollUps`                 | `answers no roll-up for a project the caller cannot open`                                    | `ok: true` with the hidden roll-up         |
| at most 50 ids                            | the limit removed from `projectIdsOf`                     | `refuses 51 project ids with 400 and computes nothing`                                       | `status: 404`, not 400                     |
| cache keyed by revision (capacity review) | the revision left out of `RollUpCache.keyOf`              | `answers new dates after a start date change that publishes no event` (mounted)              | `Received: "2026-10-05"`, not `2026-11-02` |

## Slice 4 — in progress now

Written on `batch-9/010-4-15-spaces-in-progress`, stacked on the roll-ups branch.
`in-progress-now.test.ts` 3 pass; `space.resource.test.ts` 21 pass;
`space-organization.controller.db.test.ts` 12 pass; `app.routes.test.ts` 6 pass.

| Check                  | Fault injected                                  | Test that observed it                                                               | Observed                                  |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| the fold decides       | status check replaced by "any step in progress" | `never lists a held leaf, whatever its step says`                                   | the held `h` and blocked `b` listed       |
| the list is cut        | `slice(0, limit)` removed                       | `cuts the list at the limit and says it was cut`                                    | `Received length: 1001`                   |
| leak rule: in progress | the readable filter removed                     | `takes nothing from a member the caller cannot open, and names unavailable engines` | threw `placed project a2 is not readable` |
| the limit is bounded   | the maximum check removed from `limitOf`        | `lists work in progress across the space and refuses a limit above 1000 with 400`   | `status: 200` for `limit=1001`            |
