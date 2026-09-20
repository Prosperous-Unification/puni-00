# Verification Report

**Change**: `twilight-bureaucrat-kind-rules`
**Verifier**: Codex executor

## Commands and results

### Part A — adopted-set ratcheting

Executor attempt `010-7-rules.A.20260920T133333Z` on base `1280a734`, then the planner. The executor stopped at source lint on one autofixable `simple-import-sort/imports` error in `rule-policy.ts` (`RelativePath` written before `RelationshipRequest`); the planner ran `bunx eslint --fix` on that file and completed this part's verification.

| Command                                                                                                                                     | Result                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused rules suite, baseline                                                                                                               | exit 0; 19 pass, 0 fail                                                                                                                                                                     |
| Strict OpenSpec validation, baseline                                                                                                        | exit 0; 103 passed, 0 failed                                                                                                                                                                |
| Focused rules suite, tests first                                                                                                            | exit 1 as expected; 18 pass, 4 fail of 22                                                                                                                                                   |
| Focused rules suite, implemented                                                                                                            | exit 0; 22 pass, 0 fail (baseline plus three)                                                                                                                                               |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                                                 | exit 0                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                                               | executor: exit 1 on the import order; planner, after the autofix: exit 0                                                                                                                    |
| Focused rules suite after the autofix, run as the target runs it                                                                            | exit 0; 22 pass, 0 fail. Run bare, two adapter tests fail on `trusted TypeScript runtime modules are not configured`: the target sets `TOOL_WIKI_TRUSTED_NODE_MODULES`, a bare run does not |
| `NX_DAEMON=false bunx nx run-many -t test test:package -p twilight-bureaucrat tool-devsync --skip-nx-cache`, planner, agent variables unset | exit 0; both projects' targets succeeded                                                                                                                                                    |

### Part B — F7 file-size ratchet

### Part C — kind resolution and module layout

### Part D — K3 and K4 import direction

### Part E — K2, K5, K6, F1 and record

## Failure proofs

| Proof | Check                                   | Fault injected                                                             | Test that observed the failure                                          | Result                                                                                                                                                                            |
| ----- | --------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | Ratchet needs an adopted set            | Deleted the `mode === 'ratchet' && policy.adoptedSet === undefined` branch | `refuses ratchet when the policy states no adopted set`                 | Failed: expected stderr to contain `rule policy sets INV-CLASSIFY to ratchet but states no adopted set`, received `""`. Executor, and replayed by the planner with the same line. |
| A2    | Debt outside the adopted set is allowed | `effectOf` returns `refusal` for ratchet unconditionally                   | `reports ratchet debt outside the adopted set and allows the candidate` | Failed: `Expected: 0`, `Received: 1`.                                                                                                                                             |
| A3    | Debt inside the adopted set refuses     | `effectOf` returns `debt` for ratchet unconditionally                      | `refuses ratchet debt inside the adopted set`                           | Failed: `Expected: 1`, `Received: 0`.                                                                                                                                             |
| A4    | An adopted set states each prefix once  | Removed the `.narrow` from `AdoptedSetRecord`                              | `refuses an adopted set that repeats a prefix`                          | Failed: expected stderr to contain `unique adopted prefixes`, received `""`.                                                                                                      |
