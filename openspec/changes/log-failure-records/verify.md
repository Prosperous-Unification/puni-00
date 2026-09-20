# Verification Report

**Change**: `log-failure-records`
**Verified at**: `2026-09-21`
**Verifier**: Codex executor, attempt `040-5-observability-serializer.A.20260920T214549Z`

## Slice A — OpenSpec change

### A0 baseline

| Command                                                                                                     | Status | Decisive output                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)`              | 0      | `3 pass`, `0 fail`, `8 expect() calls`, `Ran 3 tests across 2 files.` |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict JSON contract | 0      | `108` items, `108` passed, `0` failed                                 |

The baseline validation report is `openspec-validation-a0.zc43vC.json` in this attempt's evidence directory.

### A2 validation

| Command                                                                                                     | Status | Decisive output                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict JSON contract | 0      | `109` items, `109` passed, `0` failed; `log-failure-records` valid with no issues |

The post-change validation report is `openspec-validation-a2.ULMRmR.json` in this attempt's evidence directory. OpenSpec validation checks artifact structure; it does not prove the scenarios or implementation. Task 1.1 remains unchecked because slice A implements no production behavior.

## Slice B — Tests and implementation

**Verifier**: Codex executor, attempt `040-5-observability-serializer.B.20260920T215449Z`

### B0 baseline

| Command                                                                                        | Status | Decisive output                                                       |
| ---------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 0      | `3 pass`, `0 fail`, `8 expect() calls`, `Ran 3 tests across 2 files.` |

The baseline output is `b0-baseline.log` in this attempt's evidence directory and matches slice A's committed baseline.

### B3 red checkpoint

| Command                                                                                        | Status | Decisive output                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 1      | `SyntaxError: Export named 'createFailureSerializer' not found in module '.../src/serializers.ts'.` |

The red run executed 14 tests across 3 files and is `b3-red.log` in this attempt's evidence directory. The implementation did not yet export the serializer the new tests required; the same run also exposed the legacy schema, absent-`undefined` and unredacted-secret behavior in the logger tests.

### B8 green, typed and linted

| Command                                                                                        | Status | Decisive output                                                          |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 0      | `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests across 3 files.` |
| `NX_DAEMON=false bunx nx run wbs-observability:typecheck`                                      | 0      | `Successfully ran target typecheck for project wbs-observability`        |
| `NX_DAEMON=false bunx nx run wbs-observability:lint`                                           | 0      | `Successfully ran target lint for project wbs-observability`             |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-core`                | 0      | `Successfully ran target typecheck for 3 projects`                       |

The logs are `b8-observability-test.log`, `b8-observability-typecheck.log`, `b8-observability-lint.log` and `b8-downstream-typecheck.log` in this attempt's evidence directory. Nx reported that its plugin-worker socket was denied by the sandbox and ran plugins in the main process; every target still exited 0. Task 1.1 remains unchecked until slice C observes and records its required negative proofs.

## Slice C — Negative proofs and documentation

**Verifier**: Codex executor, attempt `040-5-observability-serializer.C.20260920T220705Z`

### C0 baseline

| Command                                                                                        | Status | Decisive output                                                          |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)` | 0      | `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests across 3 files.` |

The baseline output is `c0-observability-baseline.log` in this attempt's evidence directory and matches slice B's committed baseline.

### C1 watched negative proofs

Each fault was saved as the named patch in this attempt's evidence directory. Before checking the captured test status, the passing bytes were copied back and `cmp` exited 0; each named test was then rerun and passed.

| Proof | Fault and named test                                                                                                                                                                  | Fault status | Observed fact                                                                                                              | Restore                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1     | Replace the provenance map lookup with a structural `reported` read; `reports an unregistered reporting-shaped value instead of trusting it`                                          | 1            | `Expected to not contain: "hunter2"`; received the forged diagnostic containing `"password":"hunter2"`                     | `cmp` 0; green rerun `1 pass`                      |
| 1     | Same fault; `reports an unregistered loss-shaped value instead of trusting its reason`                                                                                                | 1            | `Expected to not contain: "hunter2"`; received the forged loss containing `"reason":"leak hunter2"`                        | `cmp` 0; green rerun `1 pass`                      |
| 1     | Same fault; `does not invoke an accessor named reported while deciding provenance`                                                                                                    | 1            | `Expected: 0`; `Received: 2`                                                                                               | `cmp` 0; green rerun `1 pass`                      |
| 2A    | Break `@shared/failures`' never-throw wrapper while retaining the serializer guard; `writes a visible loss rather than throwing when no report can be built`                          | 1            | `Expected to contain: "UNREPORTED_"`; `Received: "UNSERIALIZED_1"`, proving the serializer still wrote its fallback record | both later `cmp` 0                                 |
| 2B    | Keep 2A and remove the serializer guard; the same named test                                                                                                                          | 1            | `TypeError: Array.isArray cannot be called on a Proxy that has been revoked` escaped and no record was built               | both `cmp` 0; green rerun `1 pass`                 |
| 3     | Write `reporting.reports.public`; `never writes the public report in place of the diagnostic one`                                                                                     | 1            | `Expected: "corj/v0.14"`; `Received: "appex/public/v4"`                                                                    | `cmp` 0; green rerun `1 pass`                      |
| 4     | Build the redaction policy from `[]`; `scrubs a secret this process owns out of the failure line`                                                                                     | 1            | `Expected to not contain: "hunter2"`; received a line containing `"stack":["Error: token was hunter2"`                     | `cmp` 0; green rerun `1 pass`                      |
| 5     | Relax the diagnostic branch to `'v?': 'string'`; `refuses a public report where the schema expects a failure record`                                                                  | 1            | `Expected pattern: /\^corj\//`; `Received function did not throw`                                                          | `cmp` 0; green rerun `1 pass`                      |
| 6     | Make the loss reason optional; `refuses a reporting loss that names no reason`                                                                                                        | 1            | `Expected pattern: /reason must be a string/`; `Received function did not throw`                                           | `cmp` 0; green rerun `1 pass`                      |
| 7     | Restore the legacy `err` schema member; `logs a failure as the diagnostic report and validates against the schema`                                                                    | 1            | `Validation failed: err.message must be a string (was missing)`                                                            | `cmp` 0; green rerun `1 pass`                      |
| 8     | Remove the `formatters.log` hook; `reports an explicitly present undefined failure instead of dropping it`                                                                            | 1            | `expect(received).toBeDefined()`; `Received: undefined`                                                                    | `cmp` 0; green rerun `1 pass`                      |
| 9     | Normalize every present `err`; `reports the failure it was given, never a substitute`                                                                                                 | 1            | `Expected to contain: "Error: the real failure"`; received an `err` with `"typeof":"undefined","as_string":"undefined"`    | `cmp` 0; green rerun `1 pass`                      |
| 10A   | Break `@shared/failures`' wrapper while retaining the serializer guard; `gives two lost reports two different correlation handles` and `states one fixed reason on every lost report` | 0, 0         | Both tests reported `1 pass`, proving the serializer fallback answered correctly                                           | both later `cmp` 0                                 |
| 10B   | Keep 10A and replace the serializer loss increment with a constant; `gives two lost reports two different correlation handles`                                                        | 1            | `Expected: not "UNSERIALIZED_1"`                                                                                           | both `cmp` 0; both named tests reran with `1 pass` |

The mutation patches are `proof-1-provenance.patch`, `proof-2-dependency.patch`, `proof-2-guard.patch`, `proof-3-public-report.patch`, `proof-4-secrets.patch`, `proof-5-diagnostic-version.patch`, `proof-6-loss-reason.patch`, `proof-7-legacy-schema.patch`, `proof-8-undefined-hook.patch`, `proof-9-no-substitute.patch`, `proof-10-dependency.patch` and `proof-10-counter.patch`. Their corresponding `.log` files contain the complete runner output. With these observed negatives recorded, task 1.1 is complete.

### C5 final verification

| Command                                                                                                     | Status | Decisive output                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `GSETTINGS_BACKEND=memory bunx prettier --write <the eleven owned text files>`                              | 0      | All eleven files formatted; only `verify.md` changed               |
| `NX_DAEMON=false bunx nx run wbs-observability:lint`                                                        | 0      | `Successfully ran target lint for project wbs-observability`       |
| `NX_DAEMON=false bunx nx run wbs-observability:typecheck`                                                   | 0      | `Successfully ran target typecheck for project wbs-observability`  |
| `(cd libs/wbs/adapters/observability && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test)`              | 0      | `27 pass`, `0 fail`, `64 expect() calls`, `Ran 27 tests`           |
| `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`                                       | 0      | No formatter diagnostics                                           |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` with the strict JSON contract | 0      | `109` items, `109` passed, `0` failed; `log-failure-records` valid |

The command logs are `c5-prettier.log`, `c5-observability-lint.log`, `c5-observability-typecheck.log`, `c5-observability-test.log` and `c5-format-check.log`. The strict validation report is `openspec-validation-c5.1UwUAT.json` in this attempt's evidence directory.
