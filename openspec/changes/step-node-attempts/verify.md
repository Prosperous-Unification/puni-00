# verify — step-node-attempts

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Allocated numbers (filled at packet time)

| What                                  | Value | Checked against | Date |
| ------------------------------------- | ----- | --------------- | ---- |
| Migration stamp                       | —     | —               | —    |
| `PLAN_DOCUMENT_VERSION`               | —     | —               | —    |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | —     | —               | —    |

## Commands

| Slice | Command                                                         | Result                                   |
| ----- | --------------------------------------------------------------- | ---------------------------------------- |
| 1     | `env -u CLAUDECODE bunx nx run wbs-domain:test --skip-nx-cache` | 959 tests, 77 files, 0 fail (2026-10-12) |
| 1     | `bunx nx run wbs-domain:lint:fast --skip-nx-cache`; `typecheck` | both succeeded                           |

## Failure proofs

| Check                      | Fault injected                                       | Test that observed it                                                                      | Observed                                                                           |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `spanOfAttempts` open span | a running attempt skipped instead of opening the end | "spanOfAttempts is first start to last end, open while one runs, absent with none"         | `end: 200` for `null`                                                              |
| `isTimezone`               | reduced to `typeof === 'string'`                     | "isTimezone admits UTC and Europe/Kyiv and refuses Kyiv"; "refuses a zone that is not one" | `Expected: false, Received: true`; `invalid time zone: Kyiv` for the named refusal |
| zoned formatter            | `timeZone` dropped from the options                  | "isoDateOfInstantIn('Europe/Kyiv', 2026-10-11T23:30Z) is 2026-10-12" under `TZ=UTC`        | `2026-10-11`                                                                       |
| `attemptOf` pairing        | both pairing checks deleted                          | "a running attempt has no outcome and no end"                                              | did not throw                                                                      |
| `isAttemptOutcome`         | reduced to `typeof === 'string'`                     | "admits exactly the three attempt outcomes"                                                | `Expected: false, Received: true`                                                  |

## Not run

—
