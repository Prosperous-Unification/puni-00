## Scope

Base: remote main `b773e5f64`. This is a non-certifying CLI change. No external activation is provisioned and no WBS completion is claimed. The complete fixture intentionally reports unrelated unevaluated rules while proving PERF-THRESHOLD evaluates bound evidence.

## Commands and observations

- `bun install --frozen-lockfile`: passed, 1292 packages installed; replaced an unusable stale shared dependency directory.
- Focused `bun test .../evidence/performance.test.ts --test-name-pattern 'complete check Performance' --timeout=120000`: RED rejected `--performance-evidence` as a complete-check flag. GREEN: 1 pass, 0 fail, 59 assertions, 54.87 seconds; includes source and freshly built executable.
- `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck`: passed, 2.3 seconds. Nx fell back from sandbox-denied worker sockets to its main process.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint`: exited 0 but reports `status: inactive`, `certified: false`, external activation root not provisioned. This does not prove activated policy validation.
- OpenSpec change validation: passed, zero issues.
- Source ESLint, focused rule regression suite, package tests and format check: running at checkpoint.
- First project test run overlapped deliberate mutation and reported validator artifact digest mismatches; it is invalid as final evidence. A concurrent rerun was refused by Nx's recursive-task detector. A clean serialized rerun is required after outstanding runs finish.
- Full monorepo gate and h2puni gate: not run at checkpoint.

## Failure proofs

All injected mutations were restored. Each ran the complete-check production CLI test and exited 1 with an observed assertion failure.

| Fault injected                       | Observed failure                                              | Outcome  |
| ------------------------------------ | ------------------------------------------------------------- | -------- |
| Remove CLI evidence forwarding       | PERF-THRESHOLD unexpectedly unevaluated: missing run evidence | Detected |
| Disable candidate identity guard     | Missing candidate identity mismatch in verdict                | Detected |
| Disable policy identity guard        | Missing policy identity mismatch in verdict                   | Detected |
| Disable declaration identity guard   | Missing declaration identity mismatch in verdict              | Detected |
| Disable selected-rule evidence guard | Missing refusal for evidence with MOD-INDEX                   | Detected |
| Permit duplicate evidence flag       | Missing check-flag diagnostic                                 | Detected |
| Permit duplicate rule flag           | Missing check-flag diagnostic                                 | Detected |
| Bypass unknown-flag refusal          | Missing check-flag refusal                                    | Detected |

Existing binding guards retain their adjacent Proof comments; changed parsing and evidence forwarding carry adjacent comments naming this production-path proof.
