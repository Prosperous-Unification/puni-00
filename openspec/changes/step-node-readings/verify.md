# verify — step-node-readings

## Slice 0 — spec

Written on `batch-10/020-11-outcome-packets` from `origin/main` `a3b1526b` (2026-10-11).
`bunx @fission-ai/openspec@1.12.0 validate --all --json`: recorded in the lane record
`puni-plan/batch-10/lanes/020-11-outcome-packets.md`. No application behaviour is verified by
this packet.

## Commands

| Slice | Command                                                                                                                                                      | Result                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `env -u CLAUDECODE bunx nx run wbs-domain:test --skip-nx-cache`                                                                                              | 970 tests, 78 files, succeeded (2026-10-12)                                                                                                                                     |
| 1     | `bunx nx run wbs-domain:lint:fast --skip-nx-cache`; `typecheck`                                                                                              | both succeeded                                                                                                                                                                  |
| 2     | `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-domain:test --skip-nx-cache`                                                                    | 979 tests (978 pass, 1 skip, 0 fail), 79 files, succeeded (2026-10-12)                                                                                                          |
| 2     | `… bunx nx run wbs-contracts:test --skip-nx-cache`                                                                                                           | 466 pass, 0 fail, 48 files                                                                                                                                                      |
| 2     | `… bunx nx run wbs-core:test --skip-nx-cache`                                                                                                                | 819 pass, 0 fail, 87 files                                                                                                                                                      |
| 2     | `… bunx nx run wbs-mcp-01:test --skip-nx-cache`                                                                                                              | 336 pass, 0 fail, 16 files                                                                                                                                                      |
| 2     | `… bunx nx run wbs-be-01:test --skip-nx-cache` (before the `nodeReadings` rename)                                                                            | 2099 pass, 1 skip, 4 fail of 2104: the two golden identity suites (fixed by lifting the new field, below) and one mounted-process worker case that fails on the base commit too |
| 2     | `… bun test` step-node-attempt, capacity-migration-identity, priority-band-identity, work-item.controller, work-item-rows, typed-dependency-commands (be-01) | 166 pass, 0 fail, 6 files                                                                                                                                                       |
| 2     | `… bunx nx run wbs-fe-01:test --skip-nx-cache`                                                                                                               | exit 1: 865 pass (72 files) and 3626 pass, 2 fail (183 files); both failures are `wbs-api.test.ts` "plan JSON transfer" cases that fail on the base commit too (below)          |
| 2     | `lint:fast` and `typecheck` for wbs-domain, wbs-contracts, wbs-core, wbs-be-01, wbs-fe-01                                                                    | all succeeded                                                                                                                                                                   |
| 2     | `bunx prettier --check` on every touched file                                                                                                                | all match                                                                                                                                                                       |
| 2     | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                     | 180 items, 180 passed, 0 failed                                                                                                                                                 |

## Failure proofs

| Check                             | Fault injected                                                                         | Test that observed it                                                                       | Observed                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| waiting needs a predecessor       | `predecessors.length >= 1` dropped                                                     | "a first node is never waiting"                                                             | `Expected: "unknown", Received: "waiting"`                      |
| hold over in progress             | hold clause moved below in progress                                                    | "the row's hold shows on its nodes"                                                         | `Expected: "on_hold", Received: "in_progress"`                  |
| skipped only from participation   | `skipped` returned for a silent first node with participation null                     | "skipped is never produced with participation null" (fast-check) and two clause cases       | counterexample `[null,null,false,false,[]]`                     |
| attempts hold work (2.3)          | `attempts` left out of `workedStepsOf`'s union                                         | "an ended failed attempt keeps a silent QA in the fold"                                     | `Expected: "in_progress", Received: "done"`                     |
| running attempt in the fold       | the running-attempt loop in `rollUpProgress` removed                                   | "a running attempt reads in progress in the fold", "a running attempt starts the leaf"      | `Expected: "in_progress", Received: "unknown"`                  |
| predecessors from the graph (2.3) | predecessors taken from step order (the previous node in the leaf) in `nodeReadingsOf` | "reads readings per node from the resolved step graph" (isolated and shared, be-01 mounted) | Plaster's Dev `- "waiting"` / `+ "unknown"`                     |
| legacy joins not read             | the `provenance === 'legacy'` skip removed                                             | "never reads a legacy join as a predecessor"                                                | b's Dev `- "unknown"` / `+ "waiting"`                           |
| a circle throws                   | the `asking` guard removed                                                             | "throws on a circle the workflow and authored edges close"                                  | `Received message: "Maximum call stack size exceeded."`         |
| unknown node throws               | `unknown` answered for an edge end with no step node                                   | "throws on an edge naming a node the graph does not hold"                                   | `Received function did not throw`                               |
| leaf without a row throws         | the missing hold/status refusal removed                                                | "throws on a leaf with no row on the plan"                                                  | `Received function did not throw`                               |
| no-attempts property (2.4)        | `stated` left out of `workedStepsOf`'s union                                           | "with no attempts the fold equals the fold before attempts" (fast-check)                    | failed after 2 runs, counterexample stating `a.dev in_progress` |

## Dev-store report (slice 2.4)

| Database copy                                                                                   | Leaves | Leaves whose status moved                                                     | Date       |
| ----------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- | ---------- |
| not taken (lane may not touch hosts; dev has no attempts migration, so attempts = ∅ everywhere) | all    | 0 by the property "with no attempts the fold equals the fold before attempts" | 2026-10-12 |

## Not run

- Slice 2.4's run on a copy of wbs-dev's database: not taken, the lane may not touch hosts. With
  no attempts migration on dev, attempts are empty everywhere, and the fast-check property proves
  the fold with no attempts equals the fold before attempts, so 0 leaves move.
- The host gate (task 4.1).

## Known failures outside this slice (fail on the base commit `a4b2196e` too)

- be-01 `browser-lifecycle.mounted-process.db.test.ts` "logout in another mounted process denies
  an old intact selected OIDC pair…": times out after 5000 ms (`worker exited 143`).
- fe-01 `src/lib/wbs-api.test.ts` "plan JSON transfer": "downloads the validated JSON
  representation through the generated project client" and "downloads a version-6 JSON
  representation containing a typed dependency" reject with `invalid_response`.
