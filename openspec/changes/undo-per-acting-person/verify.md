## Verification record

Built 2026-10-26 on `fix/wbs-undo-per-person` from `main` at `9e3a32f94`. Commands ran with
`env -u CLAUDECODE`. The PR body carries the command outputs; the R5 proofs are the `Proof:`
comments beside each check and the table below.

| Check                                | Injected fault                                      | Observed                                                                                              |
| ------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SQLite ranked prune                  | pair-wide `max(seq) - 49`                           | certification `journal.append:acting-person-stacks` 74 pass 1 fail; HTTP fifty-one case 4 pass 1 fail |
| SQLite stack predicate               | person predicate dropped                            | certification 74 pass 1 fail                                                                          |
| SQLite `IS`                          | `=` for `IS`                                        | `command-journal.db.test.ts` 2 pass 7 fail                                                            |
| SQLite keyed flip                    | stack dropped from the WHERE; changes check removed | certification 74 pass 1 fail each                                                                     |
| Memory prune, `mine`, flip           | `seq - 49`; person dropped; flip over every entry   | memory certification 74 pass 1 fail each                                                              |
| Batch records onto the actor's stack | `personId: null`                                    | `undo-acting-person.controller.db.test.ts` 0 pass 5 fail                                              |
| Batch reports the actor's stack      | `personId: null`                                    | same file 4 pass 1 fail                                                                               |
| Routes read the principal's stack    | `personId: null`                                    | same file 1 pass 4 fail                                                                               |
| `actingPersonOf`                     | always null                                         | `principal.test.ts` 1 pass 1 fail                                                                     |
| `down.sql` guard                     | inserting 0                                         | migration test 1 pass 1 fail (`Expected: not 0`)                                                      |

Not run locally: the full gate (`bin/h2puni-gate.sh`), the e2e pixels job and the migration lint;
CI runs them.
