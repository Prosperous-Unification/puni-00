# verify — add-spaces

## Slice 0 — spec

Written on `batch-9/010-4-15-spaces-spec` from main `802432df`. The change name follows the
lane brief (`add-spaces`); the design memo called it `project-spaces`.

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

| Check                          | Fault injected                                         | Test that observed it                                                           | Observed                                                                    |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| project composite reference    | its `FOREIGN KEY` line removed from `migration.sql`    | `refuses a membership joining a space and a project of different organizations` | `Received function did not throw`                                           |
| space composite reference      | its `FOREIGN KEY` line removed from `migration.sql`    | same                                                                            | `Received function did not throw`                                           |
| project delete cascades        | `ON DELETE CASCADE` removed from the project reference | `removes a deleted project from every space, past the ownership freeze`         | `SQLiteError: FOREIGN KEY constraint failed`                                |
| `down.sql` guard               | the guard's `INSERT` replaced by `SELECT 1`            | `refuses while a space exists, keeping both tables and the ledger`              | `Received function did not throw`, value `["20260929100000_add_spaces"]`    |
| store ownership read (SQLite)  | `owned === undefined` → `owned === null`               | `refuses a project another organization owns, storing nothing`                  | `DrizzleQueryError … FOREIGN KEY constraint failed` thrown, not `not_found` |
| store ownership check (memory) | owner comparison dropped                               | same, `inMemorySpaces`                                                          | `Expected - 2 / Received + 2` (a stored `b1`)                               |
| stale save refused             | comparison reduced to the number of spaces             | `refuses to remove a save that no longer matches, deleting nothing`             | `Received function did not throw`, value `2`                                |
| restore names the project      | ownership check skipped                                | `refuses the whole restore when a saved project is gone or changed owner`       | message was drizzle's `Failed query: insert into "space_project" …`         |
| CLI usage guard                | command check replaced by `false`                      | `saves, removes and restores spaces through the rollback CLI`                   | `Expected to contain: "usage:"`; `erase` ran as a restore                   |

The leak rule (space-authorization) lands with the resource in slice 2; the store knows no
access by design.
