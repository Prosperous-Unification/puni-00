# verify — step-node-readings

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Commands

| Slice | Command                                                         | Result                                      |
| ----- | --------------------------------------------------------------- | ------------------------------------------- |
| 1     | `env -u CLAUDECODE bunx nx run wbs-domain:test --skip-nx-cache` | 970 tests, 78 files, succeeded (2026-10-12) |
| 1     | `bunx nx run wbs-domain:lint:fast --skip-nx-cache`; `typecheck` | both succeeded                              |

## Failure proofs

| Check                           | Fault injected                                                     | Test that observed it                                                                 | Observed                                       |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| waiting needs a predecessor     | `predecessors.length >= 1` dropped                                 | "a first node is never waiting"                                                       | `Expected: "unknown", Received: "waiting"`     |
| hold over in progress           | hold clause moved below in progress                                | "the row's hold shows on its nodes"                                                   | `Expected: "on_hold", Received: "in_progress"` |
| skipped only from participation | `skipped` returned for a silent first node with participation null | "skipped is never produced with participation null" (fast-check) and two clause cases | counterexample `[null,null,false,false,[]]`    |

## Dev-store report (slice 2.4)

| Database copy | Leaves | Leaves whose status moved | Date |
| ------------- | ------ | ------------------------- | ---- |
| —             | —      | —                         | —    |

## Not run

—
