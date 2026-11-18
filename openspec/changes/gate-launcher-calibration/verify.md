# Gate launcher calibration verification

Local verification used the isolated `feat/gate-launcher-calibration` worktree at base `213e1fa70a16df04544103fa2fd8871d41645739` (tree `d59b30372fd09a3ad901540ef241c03c77ee2c6a`) with the implementation patch applied. The evidence packet `board-gate-calibration-implementation1-20261118` retains the exact commands, raw streams, exit codes and execution receipts. It includes the source hashes and review patch.

## Public entrypoint and custody

- Before the change, the ordinary launcher inside a gate job returned 70 naming the exclusive `gate_tree` without a second admission or gate-stage marker. The old launcher returned 64 for `--calibrate HEAD` because it interpreted the flag as a commit name. Both observations are in `red3` (terminal `e3774f`). The earlier read-only-home and Bun pipe errors in `red` and `red2` occurred during fixture setup.
- The focused run passed 19 cases with 110 expectations (`green`, terminal `3e7fcf`). The fixture dispatches through the real Dash operations with fake telemetry and systemd. It asserts the exact single calibration call, label, pinned payload and SHA, calibration record, assigned tree and scratch, and restoration. Ordinary explicit target and default HEAD still select `run`. The nested ordinary guard uses the local fixture cgroup reader seam.
- Missing, empty, extra and unresolved targets returned 64 before submission. Set and set-but-empty Dash identities, unenrolled state, and missing configuration beside a ledger refused with 70. Invalid or candidate-contained wiki trust refused with 78 before admission. The verifier copy was captured before admission, executed before the stage in its assigned tree, and removed on exit. The verifier's rejection returned 77 and the fixture stage's rejection returned 65. Successful and nonzero runs restored the assigned tree. INT, TERM and HUP reached the fake Dash child with observed status 130, 143 and 129 and one verifier cleanup.

## R5 negative proof

The runner in `watch-faults.py` mutated only the isolated launcher, ran each selected case, restored the original bytes and reran the same case. `fault-*` and `restore-*` retain each test's output. All nine selected fault runs returned 1 and their restored controls returned 0. The batch terminal was 0 (`f3319e`). The restored launcher hash before adjacent proof comments was `858e9087075d6c19a3c893ad3c6434ebb2164fb8f8410c975cd28fc25178703a`.

- `ordinary-verb`, `fixture-stage-argv`, `wrong-sha` replaced the operation, substituted a harmless fixture marker, or changed the pinned hash. The single calibration contract assertion failed for the altered operation or arguments.
- `extra-arity` and `empty-target` allowed an invalid request to succeed where the test required 64. `unresolved-target` failed downstream and lost the required launcher target diagnostic.
- `nested-identity` allowed an empty inherited Dash ID through where the test required 70. `enrollment` reached Dash with missing configuration where the test required the outer enrollment refusal and zero submission.
- `drop-verifier` lost the prepared verifier and failed the selected success case.

## Covering checks

All 12 local covering commands returned 0 (terminal `28cb06`). Exact commands and streams are in the matching `.command`, `.stdout.raw` and `.stderr.raw` files.

- `bash -n` on each changed shell file and scoped ShellCheck succeeded. The gate shell harness emitted 135 successful assertions. The jobs-only and full heavy-lock harnesses emitted 118 and 224 successful assertions.
- Bun launcher suite passed 34 tests with 187 expectations inside its namespace. Bun calibration suite passed 18 with 67 expectations. Its real systemd `MemoryHigh` case skipped because the user scope could not connect to the bus. The three selected wiki entrypoint cases passed with nine expectations.
- OpenSpec strict validation passed for this change. Full OpenSpec validation reported 343 passed and zero failures. Scoped Prettier passed. These checks preceded the final checklist and this verification record. The worktree diff was checked after those evidence edits.

## Review corrections to the launcher fixture

The inner suite now checks its mount table and bind-source identities before registering hooks or touching fixed authority paths. The fixed paths are private tmpfs binds. The scratch bind maps a private child of the original job's assigned storage outside the account overlays. Pool initialization claims the root and config exclusively, and only its own pool is retired into the private mount. The unenrolled gate case uses default HEAD. The signal fixture publishes its complete ready file by rename.

The `board-gate-calibration-fixture-fix1-20261119` packet records the focused fault and restoration runs. The driver asserts the disposable outer mountpoints and their identities before running any deliberately weakened inner guard. Both missing and unrelated ownership controls verify unchanged configuration and pool sentinels. The job-shaped scratch control verifies the inner write on the underlying assigned scratch and the outer configuration and pool sentinels. The failed initialization control covers an existing pool, an existing config, and a rejected config in an exclusively created pool. The packet also includes fresh launcher, formatting and OpenSpec results for the reviewed fixture and final artifact bytes.

## Staged lint follow-up

The first commit attempt stopped in the pre-commit lint hook with nine TypeScript fixture diagnostics and a skipped Nx module-boundary rule because the worktree had no project graph. The index and working tree matched the reviewed patch after the refusal. The fixture fixes retain the empty-TMPDIR fallback, mount validation and exact argv expectations. They keep decoded JSON at the `unknown` boundary and remove redundant conditions and initialization.

The `board-gate-calibration-lint-fix2-20261119` packet records generation of the actual worktree project graph within a 2 GiB memory cap and 180-second service limit. It includes the default graph cache hash, the effective module-boundary rule severity, uncached lint with the graph, TypeScript against the CLI's spec project, and renewed launcher, formatting and OpenSpec outputs. The original hook refusal remains recorded separately.

## Pending operational receipts

Normal review, hosted CI, merge and clean dedicated launcher refresh remain pending. Real host systemd behavior, cold and warm calibration measurements, accepted catalogue provenance and the exact ordinary h2 gate remain pending. The prior h2 Board candidate gate failed. The comparable-measurement query observed zero rows in its specific catalogue, argument-profile, host-class and Bun partition.
