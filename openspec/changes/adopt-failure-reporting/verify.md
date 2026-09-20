# Verification Report

**Change**: `adopt-failure-reporting`
**Verified at**: `2026-09-20`
**Verifier**: Codex executor, attempt `020-2-shared-failures.A.20260920T135157Z`

## 1. Structural Validation

- [x] Baseline before this change: 103 items passed, 0 failed.
- [x] After this change was written: 104 items passed, 0 failed.

```text
{ "items": 104, "passed": 104, "failed": 0 }
```

OpenSpec validation checks artifact structure; it does not prove the scenario bodies, implementation or future negative proofs.

## 2. Intent Limit

The proposal is below the 400-word limit:

```text
267 openspec/changes/adopt-failure-reporting/proposal.md
```

## 3. Task Completion

- [ ] Implementation tasks remain open. Slice A creates the contract before module code exists.

## 4. Delta Spec Sync

| Capability          | Sync status | Note                                                           |
| ------------------- | ----------- | -------------------------------------------------------------- |
| `failure-reporting` | N/A         | Proposed change; nothing is archived or synced by this packet. |

## 5. Failure Proofs

No implementation safety check exists in Slice A. Later slices append the eleven watched production negatives required by task 1.

## 6. Executor Checks

### Slice B — project and constants

Baseline before the project was added:

```text
workspace-projects: 17 pass, 0 fail
sync: 48 pass, 0 fail
workspace-inventory: 4 pass, 0 fail
namespace-layout: 19 pass, 0 fail
workspace-targets: 19 pass, 0 fail
current-document link case: 1 pass, 13 filtered out, 0 fail
OpenSpec: 104 passed, 0 failed
inventory pins: 163 rows, 80 distinct files
README pin absent; digest pin present
```

The tests were written before `report-failure.ts`. The red run exited 1 with:

```text
error: Cannot find module './report-failure' from 'libs/shared/domain/failures/src/report-failure.test.ts' (the clone's absolute prefix removed)
```

Focused implementation checks:

| Command                                                                                                                                            | Result                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `NX_DAEMON=false bunx nx run shared-failures:typecheck`                                                                                            | exit 0; target completed without diagnostics      |
| `NX_DAEMON=false bunx nx run shared-failures:lint`                                                                                                 | exit 0; target completed without problems         |
| `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`                                                                                 | exit 0; 2 pass, 0 fail                            |
| `GSETTINGS_BACKEND=memory bunx prettier --write libs/shared/domain/failures tsconfig.base.json`                                                    | exit 0; owned project files formatted             |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                                                                              | initial exit 1; the command did not name the file |
| `GSETTINGS_BACKEND=memory bunx prettier --check libs/shared/domain/failures tsconfig.base.json openspec/changes/adopt-failure-reporting/verify.md` | exit 1; named only owned `verify.md`              |
| `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-failure-reporting/verify.md`                                                | exit 0; verification record formatted             |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                                                                              | exit 0                                            |

The project intentionally leaves the `workspace-projects`, `sync` and
`workspace-inventory` devsync checks red until Slice C registers it. The whole
`tool-devsync:test` target is pending planner verification because its index
checker writes Git objects in the clone.

## Slice C — register the project

Executor attempt on the clone holding slices A and B, then the planner. The executor completed C1 to C6 and most of C7, then stopped by rule: an extra replay of the C2 fault used a `-t` filter containing Bun's displayed `>` separator, which matched zero tests. The file was restored byte for byte. The planner replayed that fault with a matching filter and completed the record.

| Step | Command or check                                                                                                    | Result                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0a   | Baseline block                                                                                                      | README pin absent (110.6's derived check is in place), digest pin present; inventory pins 163 rows and 80 files                                                                                                    |
| 0b   | The five devsync files and the routed-link case, before                                                             | exactly the three expected files red: `workspace-projects` 15 pass 2 fail, `sync` 47 pass 1 fail, `workspace-inventory` 3 pass 1 fail; `namespace-layout` 19 pass, `workspace-targets` 19 pass, routed link 1 pass |
| 0c   | OpenSpec validation                                                                                                 | 104 passed, 0 failed                                                                                                                                                                                               |
| C1   | `workspace-projects.test.ts` after registering `shared-failures`                                                    | 17 pass, 0 fail                                                                                                                                                                                                    |
| C2   | `sync.test.ts` after the restart path entry                                                                         | 48 pass, 0 fail                                                                                                                                                                                                    |
| C3   | `workspace-inventory.test.ts`                                                                                       | rows 163 to 167, then files 80 to 84, each seen as `Received length` before its pin moved; then 4 pass, 0 fail                                                                                                     |
| C4   | The legacy-occurrence pin                                                                                           | failed on a new digest with `occurrences` still 257; re-pinned with a dated comment; then 1 pass                                                                                                                   |
| C5   | Three stale `nx-selector` exemptions removed                                                                        | the three named checks pass                                                                                                                                                                                        |
| C6   | `LLM_README.md` names the new library on an existing row                                                            | routed-link case passes; the router stays at 130 lines                                                                                                                                                             |
| C7   | Alias case; `namespace-layout` and `workspace-targets`; `tool-devsync:typecheck`; `tool-devsync:lint`; format check | 1 pass; 38 pass; exit 0; exit 0; exit 0                                                                                                                                                                            |

Negative proof for C2, planner, 2026-09-20: with `'libs/shared/domain/failures/project.json'` removed from `RESTART_PATHS`, `RESTART_PATHS coverage > names every library project.json that exists on disk` failed with `Expected to contain: "libs/shared/domain/failures/project.json"`; restored with `cmp`, then `sync.test.ts` 48 pass, 0 fail. Slice C's own starting red state is the proof for C1 and C3: both checks were watched failing before the registration that satisfies them.

### Slice D — redaction policy

Baseline before the policy was added:

```text
workspace-projects: 17 pass, 0 fail
sync: 48 pass, 0 fail
workspace-inventory: 4 pass, 0 fail
namespace-layout: 19 pass, 0 fail
workspace-targets: 19 pass, 0 fail
current-document link case: 1 pass, 13 filtered out, 0 fail
OpenSpec: 104 passed, 0 failed
inventory pins: 167 rows, 84 distinct files
README pin absent; digest pin present
```

The four policy tests were written before `createFailureRedaction`. The red run exited 1 with:

```text
SyntaxError: Export named 'createFailureRedaction' not found in module 'libs/shared/domain/failures/src/report-failure.ts' (the clone's absolute prefix removed)
```

Focused implementation checks:

| Command                                                                                                                                                   | Result                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `NX_DAEMON=false bunx nx run shared-failures:typecheck`                                                                                                   | exit 0; target completed without diagnostics |
| `NX_DAEMON=false bunx nx run shared-failures:lint`                                                                                                        | exit 0; target completed without problems    |
| `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`                                                                                        | exit 0; 6 pass, 0 fail                       |
| `GSETTINGS_BACKEND=memory bunx prettier --write libs/shared/domain/failures/src/report-failure.ts libs/shared/domain/failures/src/report-failure.test.ts` | exit 0; both files unchanged                 |
| `GSETTINGS_BACKEND=memory bunx prettier --write libs/shared/domain/failures/src/index.ts openspec/changes/adopt-failure-reporting/verify.md`              | exit 0; owned files formatted                |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                                                                                     | exit 0                                       |

Watched production negatives, all restored byte for byte with `cmp` and followed by a full-file run of 6 pass, 0 fail:

| Proof                    | Fault                                                  | Named failing test                                                                | Observed failure                                                         | Evidence                                                                                                                       |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| D3 `keys-removed`        | Replaced `keys: SENSITIVE_KEY_PATTERNS` with `[]`      | `skips a sensitive property whatever its capitalisation`                          | Diff exposed `Authorization: "Bearer live-token"`                        | `keys-removed.patch` in the attempt's evidence directory; `keys-removed.out` in the attempt's evidence directory               |
| D4 `keys-case-sensitive` | Replaced the regex key list with plain strings         | `skips a sensitive property whatever its capitalisation`                          | `Received  + 1`; capitalised `Authorization` exposed `Bearer live-token` | `keys-case-sensitive.patch` in the attempt's evidence directory; `keys-case-sensitive.out` in the attempt's evidence directory |
| D5 `patterns-removed`    | Replaced the caller-owned pattern expression with `[]` | `scrubs a caller-owned secret from message and stack, not only from its property` | `Received: "Error: token was hunter2"`                                   | `patterns-removed.patch` in the attempt's evidence directory; `patterns-removed.out` in the attempt's evidence directory       |

Planner, after slice D, 2026-09-20: replayed `patterns-removed` outside the sandbox: `scrubs a caller-owned secret from message and stack, not only from its property` failed with `Received: "Error: token was hunter2"`, and `treats a secret as literal text, not as a pattern` failed with it (recorded, not a stop); restored byte for byte. Whole `shared-failures` and `tool-devsync` test, typecheck and lint pass; format check clean. Evidence paths in this record are relative to each attempt's evidence directory, which is kept beside the planning files and not in this repository.

### Slice E — never-throw wrapper and public report

Baseline before the wrapper was added:

```text
workspace-projects: 17 pass, 0 fail
sync: 48 pass, 0 fail
workspace-inventory: 4 pass, 0 fail
namespace-layout: 19 pass, 0 fail
workspace-targets: 19 pass, 0 fail
current-document link case: 1 pass, 13 filtered out, 0 fail
OpenSpec: 104 passed, 0 failed
inventory pins: 167 rows, 84 distinct files
README pin absent; digest pin present
```

The four wrapper tests were written before `reportFailure`. The red run exited 1 with:

```text
SyntaxError: Export named 'reportFailure' not found in module 'libs/shared/domain/failures/src/report-failure.ts' (the clone's absolute prefix removed)
```

Focused implementation checks:

| Command                                                                                                                                                   | Result                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `NX_DAEMON=false bunx nx run shared-failures:typecheck`                                                                                                   | exit 0; target completed without diagnostics |
| `NX_DAEMON=false bunx nx run shared-failures:lint`                                                                                                        | exit 0; target completed without problems    |
| `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`                                                                                        | exit 0; 10 pass, 0 fail                      |
| `GSETTINGS_BACKEND=memory bunx prettier --write libs/shared/domain/failures/src/report-failure.ts libs/shared/domain/failures/src/report-failure.test.ts` | exit 0; both files unchanged                 |
| `GSETTINGS_BACKEND=memory bunx prettier --write libs/shared/domain/failures/src/index.ts openspec/changes/adopt-failure-reporting/verify.md`              | exit 0; owned files formatted                |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                                                                                     | exit 0                                       |

Watched production negatives, both restored byte for byte with `cmp` and followed by a full-file run of 10 pass, 0 fail:

| Proof                      | Fault                                        | Named failing test                                                               | Observed failure                                                             | Evidence                                                                                                                           |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| E4 `wrapper-removed`       | Replaced the `try`/`catch` with a bare block | `a cause that cannot be inspected is reported as reporting loss, not as a throw` | `TypeError: Array.isArray cannot be called on a Proxy that has been revoked` | `wrapper-removed.patch` in the attempt's evidence directory; `wrapper-removed.out` in the attempt's evidence directory             |
| E5 `public-redact-removed` | Removed `redact` from the public options bag | `redacts a secret the disclosure policy selected into the public report`         | Public `as_json` diff disclosed `"user": "alice@example.com"`                | `public-redact-removed.patch` in the attempt's evidence directory; `public-redact-removed.out` in the attempt's evidence directory |

Planner, after slice E, 2026-09-20: replayed `public-redact-removed` outside the sandbox (the public bag given the limits and no redaction policy): `redacts a secret the disclosure policy selected into the public report` failed showing `alice@example.com` in the public report; restored byte for byte. Whole `shared-failures` and `tool-devsync` test, typecheck and lint pass; format check clean.

### Slice F — causes, limits, inspection and report schemas

Baseline before the coverage was added:

```text
workspace-projects: 17 pass, 0 fail
sync: 48 pass, 0 fail
workspace-inventory: 4 pass, 0 fail
namespace-layout: 19 pass, 0 fail
workspace-targets: 19 pass, 0 fail
current-document link case: 1 pass, 13 filtered out, 0 fail
OpenSpec: 104 passed, 0 failed
inventory pins: 167 rows, 84 distinct files
README pin absent; digest pin present
```

Focused coverage checks:

| Command                                                                   | Result                                       |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| `(cd libs/shared/domain/failures && bun test src/report-failure.test.ts)` | exit 0; 20 pass, 0 fail; 56 assertions       |
| `NX_DAEMON=false bunx nx run shared-failures:typecheck`                   | exit 0; target completed without diagnostics |
| `NX_DAEMON=false bunx nx run shared-failures:lint`                        | exit 0; target completed without problems    |
| `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`        | exit 0; 20 pass, 0 fail; 56 assertions       |
| `GSETTINGS_BACKEND=memory bunx prettier --write` on the two Slice F files | exit 0; test unchanged; record formatted     |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`     | exit 0; repository formatting clean          |

Slice F adds no production check and therefore owes no negative proof. Slice G removes each
limit and the shared reporting call separately, using the cases added here as the watched
production-path negatives.

### Slice G — watched report-limit negatives

Baseline before the five fault injections:

```text
workspace-projects: 17 pass, 0 fail
sync: 48 pass, 0 fail
workspace-inventory: 4 pass, 0 fail
namespace-layout: 19 pass, 0 fail
workspace-targets: 19 pass, 0 fail
current-document link case: 1 pass, 13 filtered out, 0 fail
OpenSpec: 104 passed, 0 failed
inventory pins: 167 rows, 84 distinct files
README pin absent; digest pin present
```

Focused implementation checks completed before formatting:

| Command                                                                | Result                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| `NX_DAEMON=false bunx nx run shared-failures:typecheck`                | exit 0; target completed without diagnostics        |
| `NX_DAEMON=false bunx nx run shared-failures:lint`                     | exit 0; target completed without problems           |
| `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`     | exit 0; 20 pass, 0 fail; 56 assertions              |
| `grep -rn 'WRITTEN IN SLICE' libs/shared/domain/failures`              | exit 1; no placeholder remains                      |
| `GSETTINGS_BACKEND=memory bunx prettier --write` on both Slice G files | exit 0; production file unchanged; record formatted |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`  | exit 0; repository formatting clean                 |

Watched production negatives, all restored byte for byte with `cmp` and followed by a full-file
run of 20 pass, 0 fail:

| Proof                   | Fault                                        | Named failing test                                                         | Observed failure                                                                   | Evidence                                                                                                                   |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| G1 `shared-call-split`  | Replaced one `toReports` call with two calls | `correlates a primitive failure without publishing its contents`           | `toBe` compared two different `AE_…` occurrence ids                                | `shared-call-split.patch` and `shared-call-split.out` in the attempt's evidence directory                                  |
| G2 `inspection-default` | Removed `inspection: 'no-invoke'`            | `does not run a throwing getter while reporting`                           | `reporting_errors` contained `error: "Error: ran"`; the constants test also failed | `inspection-default.patch`, `inspection-default.out` and `inspection-default-full.out` in the attempt's evidence directory |
| G3 `budget-removed`     | Removed `maxReportSize`                      | `bounds a very long Unicode message and marks it truncated`                | `truncated` was `undefined`; the constants test also failed                        | `budget-removed.patch`, `budget-removed.out` and `budget-removed-full.out` in the attempt's evidence directory             |
| G4 `depth-removed`      | Removed `maxDepth`                           | `stops the cause walk at the depth limit and says so on the deepest child` | Expected `"max_depth"`, received `undefined`; the constants test also failed       | `depth-removed.patch`, `depth-removed.out` and `depth-removed-full.out` in the attempt's evidence directory                |
| G5 `children-removed`   | Removed `maxChildren`                        | `stops at the child limit and says so on the root`                         | Expected `"max_children"`, received `undefined`; the constants test also failed    | `children-removed.patch`, `children-removed.out` and `children-removed-full.out` in the attempt's evidence directory       |

Planner, after slice G, 2026-09-20: slice G changed only `Proof:` comments in `report-failure.ts`. Replayed `depth-removed` outside the sandbox (`maxDepth` taken out of the shared limits): `stops the cause walk at the depth limit and says so on the deepest child` failed with `Expected: "max_depth"`, and the constants test failed with it (recorded, not a stop); restored byte for byte. Project test, typecheck and lint pass.

## Decision

- [ ] Archive readiness is outside Slice A. Tasks remain open until implementation and evidence are complete.
