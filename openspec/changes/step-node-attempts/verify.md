# verify — step-node-attempts

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Allocated numbers (filled at packet time)

| What                                  | Value                                   | Checked against                                                                                                                                  | Date       |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Migration stamp                       | `20261012120000_add_step_node_attempts` | `origin/main` (`20261011200000_add_shared_people_audit`) and every `origin/batch-10/*` branch (newest `20261012090200_widen_organization_audit`) | 2026-10-12 |
| `PLAN_DOCUMENT_VERSION`               | —                                       | —                                                                                                                                                | —          |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | —                                       | —                                                                                                                                                | —          |

## Commands

| Slice | Command                                                                                                          | Result                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `env -u CLAUDECODE bunx nx run wbs-domain:test --skip-nx-cache`                                                  | 959 tests, 77 files, 0 fail (2026-10-12)                                                                                          |
| 1     | `bunx nx run wbs-domain:lint:fast --skip-nx-cache`; `typecheck`                                                  | both succeeded                                                                                                                    |
| 2     | `env -u CLAUDECODE bunx nx run tool-remote-scripts:test --skip-nx-cache`                                         | 384 tests, 29 files, succeeded                                                                                                    |
| 2     | `bun test src/attempt-outcomes-cli.test.ts src/migration-cli.db.test.ts -t "attempt\|import the SQLite"` (be-01) | 4 pass, 0 fail                                                                                                                    |
| 2     | `lint:fast`, `typecheck` for tool-remote-scripts, wbs-be-01, wbs-store-sqlite                                    | all succeeded                                                                                                                     |
| 3     | `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-store-sqlite:test --skip-nx-cache`                  | 1333 pass, 0 fail, 102 files (2026-10-12)                                                                                         |
| 3     | same for `wbs-core`, `wbs-store-memory`, `wbs-conformance`                                                       | 797 / 146 / 35 pass, 0 fail                                                                                                       |
| 3     | `bun test` on the 19 touched be-01 test files (`migration-cli.db.test.ts` included)                              | 381 pass, 0 fail                                                                                                                  |
| 3     | `lint:fast`, `typecheck` for wbs-store-sqlite, wbs-be-01, wbs-core, wbs-store-memory, wbs-conformance            | all succeeded                                                                                                                     |
| 3     | `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/*/*.sql`                        | exit 0 (130 files); with `DROP COLUMN` appended to the new `migration.sql`: exit 1, `contains destructive statement: DROP COLUMN` |

## Failure proofs

| Check                              | Fault injected                                                  | Test that observed it                                                                      | Observed                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spanOfAttempts` open span         | a running attempt skipped instead of opening the end            | "spanOfAttempts is first start to last end, open while one runs, absent with none"         | `end: 200` for `null`                                                                                                                                                              |
| `isTimezone`                       | reduced to `typeof === 'string'`                                | "isTimezone admits UTC and Europe/Kyiv and refuses Kyiv"; "refuses a zone that is not one" | `Expected: false, Received: true`; `invalid time zone: Kyiv` for the named refusal                                                                                                 |
| zoned formatter                    | `timeZone` dropped from the options                             | "isoDateOfInstantIn('Europe/Kyiv', 2026-10-11T23:30Z) is 2026-10-12" under `TZ=UTC`        | `2026-10-11`                                                                                                                                                                       |
| `attemptOf` pairing                | both pairing checks deleted                                     | "a running attempt has no outcome and no end"                                              | did not throw                                                                                                                                                                      |
| `isAttemptOutcome`                 | reduced to `typeof === 'string'`                                | "admits exactly the three attempt outcomes"                                                | `Expected: false, Received: true`                                                                                                                                                  |
| swap outcome vocabulary            | `ATTEMPT_OUTCOMES_VOCABULARY` left out of `STORED_VOCABULARIES` | the three outcome cases in `swap.test.ts`                                                  | 0 pass, 3 fail                                                                                                                                                                     |
| outcomes CLI absence               | directory check replaced by an unconditional `[]`               | "does not treat a missing source directory as an older release" (attempt outcome commands) | `Expected: 74, Received: 0`                                                                                                                                                        |
| rollback CLI usage guard           | guard bypassed (`false &&`)                                     | "guards the attempt rollback CLI usage and refuses a database without attempts"            | `Expected to contain: "usage:"`, received ENOENT                                                                                                                                   |
| rollback on an unmigrated database | table check made unreachable                                    | same                                                                                       | drizzle `no such table` stack instead of the named refusal                                                                                                                         |
| running partial index              | `step_node_attempt_running` dropped from `migration.sql`        | "lets one of two concurrent starts win and tells the other attempt_running"                | `["started", "started"]`: two running rows                                                                                                                                         |
| `down.sql` guard                   | the three guard statements removed                              | "rollback refused over a row, naming the CLI, keeping the row and the record"              | `Received function did not throw`, rollback returned the migration                                                                                                                 |
| running-state CHECK                | `step_node_attempt_running_state` dropped                       | "refuses an outcome without an end and an end without an outcome"                          | `Received function did not throw`                                                                                                                                                  |
| `max + 1` read in the transaction  | read moved before the transaction                               | the concurrent-start case                                                                  | **still passed**: the partial index refuses the loser as `attempt_running`; with the index also dropped the loser threw `Failed query: insert … params: a,dev,1,…` (reused number) |
| attempts hand-down                 | `attempts.moveAll` skipped in `work-item.resource.ts`           | "hands a leaf’s attempts down to its first child, numbers kept"                            | `Expected: [1, 2]`, received `undefined`                                                                                                                                           |

## Not run

—
