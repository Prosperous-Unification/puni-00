## Verification record

Built 2026-10-26 on `fix/wbs-undo-per-person` from `main` at `9e3a32f94`; amended the same day
after review. Every command ran with `env -u CLAUDECODE`.

### Commands and results (after the review amendments)

| Command (cwd)                                                                                                                                                                                                                                                    | Result                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` of 10 store-sqlite files: command-journal, claim-lease, claim-lease-race, capacity-limit-race, claim-limit-race, step-estimate-unit-migration, step-blockage-activation, migrate-down, migrate, source-conformance (`libs/wbs/adapters/store-sqlite`) | 237 pass, 0 fail                                                                                                                |
| `bun test ./src/testing/source-conformance.test.ts` (`libs/wbs/adapters/store-memory`)                                                                                                                                                                           | 75 pass, 0 fail                                                                                                                 |
| `bun test ./src/principal.test.ts` (`libs/wbs/domain/contracts`)                                                                                                                                                                                                 | 2 pass, 0 fail                                                                                                                  |
| `bun test src --timeout=10000` (`libs/wbs/application/core`)                                                                                                                                                                                                     | 1338 pass, 0 fail                                                                                                               |
| `bun test` of 50 be-01 files touching undo, the journal or this change, including `undo-acting-person.controller.db.test.ts`, `command-journal-person-migration.db.test.ts`, `mcp-delegation.boot.db.test.ts` (`apps/wbs/be-01`)                                 | 1128 pass, 1 fail; the fail was a runner spy expecting the old arity (`http/elysia/work-item.test.ts`), fixed and rerun 13 pass |
| `bunx nx run-many -t typecheck,typecheck:module -p` (12 WBS projects)                                                                                                                                                                                            | success                                                                                                                         |
| `bunx nx run-many -t lint -p` wbs-core, wbs-store-sqlite, wbs-contracts, wbs-store-memory, wbs-conformance, wbs-be-01                                                                                                                                            | success                                                                                                                         |
| `openspec validate --all --json`                                                                                                                                                                                                                                 | all valid                                                                                                                       |

### R5 proofs

| Check                                | Injected fault                                      | Observed                                                                                                             |
| ------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| SQLite ranked prune                  | pair-wide `max(seq) - 49`                           | certification `journal.append:acting-person-stacks` 74/1; HTTP fifty-one case 4/1                                    |
| SQLite stack predicate               | person predicate dropped                            | certification 74/1                                                                                                   |
| SQLite `IS`                          | `=` for `IS`                                        | `command-journal.db.test.ts` 2/7                                                                                     |
| SQLite keyed flip                    | stack dropped from the WHERE; changes check removed | certification 74/1 each                                                                                              |
| Memory prune, `mine`, flip           | `seq - 49`; person dropped; flip over every entry   | memory certification 74/1 each                                                                                       |
| Batch person from the request        | `null` in `runCommandBatch`                         | `undo-acting-person.controller.db.test.ts` 0/5                                                                       |
| Step PATCH batch person              | `null` in `runCommandBatchAfter`                    | same file 5/1: agent undo 409 `nothing_to_undo`                                                                      |
| Batch records onto the actor's stack | `personId: null`                                    | same file 0/5                                                                                                        |
| Batch reports the actor's stack      | `personId: null`                                    | same file 4/1                                                                                                        |
| Routes read the principal's stack    | `personId: null`                                    | same file 1/4; `work-item.routes.test.ts` 1/1                                                                        |
| `actingPersonOf` consent arm         | consent answers null                                | `mcp-delegation.boot.db.test.ts` consent undo 0/1 (second agent undo got 200 done, not 409); `principal.test.ts` 1/1 |
| `down.sql` deletes agents' entries   | DELETE removed                                      | migration test 2/1: `agent` on the human's stack                                                                     |
| Person index for the cascade         | `command_journal_person` removed                    | migration test 2/1: `SCAN … command_journal_person_stack`                                                            |

The mid-swap tests (`puts an entry the outgoing colour wrote…`, `lets the outgoing colour clear
and prune by the pair…`) pin behaviour of an older release and have no check of their own to
break; `=` for `IS` fails the first.

Not run locally: the full gate (`bin/h2puni-gate.sh`), the e2e pixels job, migration lint over
every tracked `.sql` (run over this migration's two files: exit 0), tool-devsync after the
amendments (925 pass before them).
