# Verification Report

**Change**: `adopt-failure-reporting`
**Verified at**: `2026-09-20`
**Verifier**: Codex executor, attempt `020-2-shared-failures.A.20260920T135157Z`

Slice H completion was recorded by Codex executor attempt
`020-2-shared-failures.H.20260920T152633Z`; the slice-specific history below is preserved.

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

- [x] Task 1.1, the shared reporting module and its eleven watched negatives, is complete.
- [ ] Task 2.1, adoption at the observability, backend and MCP boundaries, remains unassigned in
      batch 2.
- [ ] Task 3.1, browser execution of `@shared/failures`, remains explicitly unassigned.

## 4. Delta Spec Sync

| Capability          | Sync status | Note                                                           |
| ------------------- | ----------- | -------------------------------------------------------------- |
| `failure-reporting` | N/A         | Proposed change; nothing is archived or synced by this packet. |

## 5. Failure Proofs

Every artifact name below is relative to the named proof's originating attempt evidence directory.
The planner's separately recorded replays remain in the slice history below; no artifact reference
is invented for them.

| Proof                      | Fault                                                                   | Named failing test                                                                | Observed diagnostic                                                                                                              | Artifacts                                                                           |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C2 `restart-entry-omitted` | Omitted `libs/shared/domain/failures/project.json` from `RESTART_PATHS` | `RESTART_PATHS coverage > names every library project.json that exists on disk`   | C attempt `020-2-shared-failures.C.20260920T141109Z` baseline: `Expected to contain: "libs/shared/domain/failures/project.json"` | `restart-entry-omitted.patch`; baseline failure output `sync-before.txt`            |
| D3 `keys-removed`          | Replaced `keys: SENSITIVE_KEY_PATTERNS` with `[]`                       | `skips a sensitive property whatever its capitalisation`                          | Diff exposed `Authorization: "Bearer live-token"`                                                                                | `keys-removed.patch`; `keys-removed.out`                                            |
| D4 `keys-case-sensitive`   | Replaced the regex key list with plain strings                          | `skips a sensitive property whatever its capitalisation`                          | `Received  + 1`; capitalised `Authorization` exposed `Bearer live-token`                                                         | `keys-case-sensitive.patch`; `keys-case-sensitive.out`                              |
| D5 `patterns-removed`      | Replaced the caller-owned pattern expression with `[]`                  | `scrubs a caller-owned secret from message and stack, not only from its property` | `Received: "Error: token was hunter2"`                                                                                           | `patterns-removed.patch`; `patterns-removed.out`                                    |
| E4 `wrapper-removed`       | Replaced the `try`/`catch` with a bare block                            | `a cause that cannot be inspected is reported as reporting loss, not as a throw`  | `TypeError: Array.isArray cannot be called on a Proxy that has been revoked`                                                     | `wrapper-removed.patch`; `wrapper-removed.out`                                      |
| E5 `public-redact-removed` | Removed `redact` from the public options bag                            | `redacts a secret the disclosure policy selected into the public report`          | Public `as_json` diff disclosed `"user": "alice@example.com"`                                                                    | `public-redact-removed.patch`; `public-redact-removed.out`                          |
| G1 `shared-call-split`     | Replaced one `toReports` call with two calls                            | `correlates a primitive failure without publishing its contents`                  | `toBe` compared two different `AE_…` occurrence ids                                                                              | `shared-call-split.patch`; `shared-call-split.out`                                  |
| G2 `inspection-default`    | Removed `inspection: 'no-invoke'`                                       | `does not run a throwing getter while reporting`                                  | `reporting_errors` contained `error: "Error: ran"`; the constants test also failed                                               | `inspection-default.patch`; `inspection-default.out`; `inspection-default-full.out` |
| G3 `budget-removed`        | Removed `maxReportSize`                                                 | `bounds a very long Unicode message and marks it truncated`                       | `truncated` was `undefined`; the constants test also failed                                                                      | `budget-removed.patch`; `budget-removed.out`; `budget-removed-full.out`             |
| G4 `depth-removed`         | Removed `maxDepth`                                                      | `stops the cause walk at the depth limit and says so on the deepest child`        | Expected `"max_depth"`, received `undefined`; the constants test also failed                                                     | `depth-removed.patch`; `depth-removed.out`; `depth-removed-full.out`                |
| G5 `children-removed`      | Removed `maxChildren`                                                   | `stops at the child limit and says so on the root`                                | Expected `"max_children"`, received `undefined`; the constants test also failed                                                  | `children-removed.patch`; `children-removed.out`; `children-removed-full.out`       |

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

Negative proof for C2, executor baseline and planner replay, 2026-09-20: attempt
`020-2-shared-failures.C.20260920T141109Z` began with the restart entry absent;
`RESTART_PATHS coverage > names every library project.json that exists on disk` failed with
`Expected to contain: "libs/shared/domain/failures/project.json"`. The matching artifacts are
`restart-entry-omitted.patch` and baseline output `sync-before.txt`, relative to that attempt's
evidence directory. The later `restart-entry-omitted.out` is not evidence because it records a
zero-test run. Separately, the planner replayed the same fault, restored with `cmp`, then observed
`sync.test.ts` at 48 pass, 0 fail; no artifact reference is claimed for that replay. Slice C's own
starting red state is the proof for C1 and C3: both checks were watched failing before the
registration that satisfies them.

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

### Slice H — completion record

The Slice H baseline was clean. The README count is derived, the digest pin is present, and the
inventory pins remain 167 rows and 84 distinct files.

| Command or check                                                      | Result                                  |
| --------------------------------------------------------------------- | --------------------------------------- |
| `workspace-projects.test.ts`                                          | exit 0; 17 pass, 0 fail                 |
| `sync.test.ts`                                                        | exit 0; 48 pass, 0 fail                 |
| `workspace-inventory.test.ts`                                         | exit 0; 4 pass, 0 fail                  |
| `namespace-layout.test.ts`                                            | exit 0; 19 pass, 0 fail                 |
| `workspace-targets.test.ts`                                           | exit 0; 19 pass, 0 fail                 |
| Routed current-document link case                                     | exit 0; 1 pass, 13 filtered out, 0 fail |
| OpenSpec validation before the Slice H edits                          | exit 0; 104 passed, 0 failed            |
| OpenSpec validation after the Slice H edits                           | exit 0; 104 passed, 0 failed            |
| Prettier write on the OpenSpec change and adoption plan               | exit 0; owned files formatted           |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all` | exit 0; repository formatting clean     |

## Decision

- [x] Task 1 is implemented and its evidence is complete.
- [ ] The change is not archive-ready: tasks 2 and 3 remain open.

## Checks Not Run by This Executor

- Whole `NX_DAEMON=false bunx nx run tool-devsync:test`: pending planner verification because its
  index-checker case writes Git objects in this read-only clone.
- `bin/h2puni-gate.sh`: unavailable on this machine and explicitly reserved for the host gate.
- Browser execution of `@shared/failures`: no batch 2 fixture imports this module; task 3 remains
  unassigned.

## 050.4 Slice 0 — frontend fault-boundary specification

Baseline commit: `a0e0701641c2cc2d26f87365f9142a3670c564a3`.

| Check                                      | Result                       | Evidence                                        |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------- |
| Strict OpenSpec validation before the edit | exit 0; 112 passed, 0 failed | `openspec-validation.slice0-before.hp7mFV.json` |
| Strict OpenSpec validation after the edit  | exit 0; 112 passed, 0 failed | `openspec-validation.slice0-after.UiP8O9.json`  |

The item total stayed at 112 because the slice adds requirements to the existing
`adopt-failure-reporting` change. Tasks 3.1 and 4.1 remain unchecked until the browser and boundary
work is complete.

## 050.4 Slice 1 — frontend reporting alias

`vite-config.test.ts` began at 18 passing tests. The test-first run after adding the required alias
to the expected map and explicit presence assertion exited 1 with one failed and 17 passed: the
alias-map case expected the app aliases to include `@shared/failures`. After adding the alias to
all four frontend tsconfigs and both runtime maps, the focused suite returned to 18 passing tests.

| Check                                             | Result                                       | Evidence                                           |
| ------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| Final focused alias suite                         | exit 0; 1 file, 18 tests passed              | command output retained in the executor transcript |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` | exit 0; target completed without diagnostics | command output retained in the executor transcript |
| Strict OpenSpec validation                        | exit 0; 112 passed, 0 failed                 | `openspec-validation.slice1.epVpKM.json`           |

N1 removed only the `@shared/failures` entry from `vitest.config.ts`. The alias-map case failed
with one failed and 17 passed, comparing a suite map beginning with `@shared/validation` against an
app map that also contained `@shared/failures`; `n1-vitest-alias-removed.patch` and
`n1-vitest-alias-removed.out` retain the fault and output. The passing bytes were restored from
`vitest.config.passing.ts`, matched with `cmp`, and the focused suite returned to 18 passing tests.

The focused Vitest runs emitted the existing Vite warning about `__dirname` and the future native
config loader. The whole `tool-devsync:test` target remains deferred to planner verification
because it writes Git objects and the batch's heavy lane was occupied.

## 050.4 Slice 2 — public fault disclosure

The focused boundary baseline was 6 passing tests. The two unchanged neighboring suites began at
249 passing tests. After the ten disclosure cases were added before production code, the boundary
suite exited 1 with the expected 13 failures and only these three passing cases:
`renders its children while nothing throws`, `reloads the document when the reader asks`, and
`costs a chart rather than a page when the chart is what threw`.

After the disclosure model and both boundary fallbacks were implemented, the focused boundary
suite passed 16 tests and the neighboring suites remained at 249 passing tests.

| Check                                                                 | Result                            | Evidence                                                       |
| --------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| Final focused boundary suite                                          | exit 0; 1 file, 16 tests passed   | `s2-final-fault.log`, `s2-final-fault.status`                  |
| Focused neighboring suites                                            | exit 0; 2 files, 249 tests passed | `s2-green-neighbours.log`, `s2-green-neighbours.status`        |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                     | exit 0                            | `s2-typecheck.log`, `s2-typecheck.status`                      |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`          | exit 0; fresh uncached run        | `s2-lint-fresh.log`, `s2-lint-fresh.status`                    |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all` | exit 0                            | `s2-format-check-rerun.log`, `s2-format-check-rerun.status`    |
| Strict OpenSpec validation                                            | exit 0; 112 passed, 0 failed      | `s2-openspec-validation.json`, `s2-openspec-validation.status` |

Watched production negatives were each restored byte for byte with `cmp` and followed by a
16-test green rerun:

| Proof | Injected fault                                                   | Named observed failure                                                                                  | Evidence                                                                              |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| N2    | Fell back to the caught Error's message                          | `puts neither the message, the cause nor a stack into the DOM` exposed `alice@example.com`              | `N2.patch`, `N2-fail.log`, `N2-fail.status`, `N2-restore.status`, `N2-green.log`      |
| N3    | Appended the caught value to the boundary console tuple          | `logs the boundary, the disclosed sentence and the reference, and nothing else` received five arguments | `N3.patch`, `N3-fail.log`, `N3-fail.status`, `N3-restore.status`, `N3-green.log`      |
| N4    | Removed the app reference element                                | `shows the same reference on the page as it logged` could not find the logged AE handle in the page     | `N4.patch`, `N4-fail.log`, `N4-fail.status`, `N4-restore.status`, `N4-green.log`      |
| N5    | Disconnected the chart selector                                  | `costs a chart rather than a page when the chart is what threw` received the generic sentence           | `N5.patch`, `N5-fail.log`, `N5-fail.status`, `N5-restore.status`, `N5-green.log`      |
| N6    | Widened the chart selector to every Error                        | `discloses the chart’s own modelled sentence and no other error’s` exposed `alice@example.com`          | `N6.patch`, `N6-fail.log`, `N6-fail.status`, `N6-restore.status`, `N6-green.log`      |
| N7    | Removed the chart reference element                              | `shows the chart’s own reference, matching what it logged` received `undefined`                         | `N7.patch`, `N7-fail.log`, `N7-fail.status`, `N7-restore.status`, `N7-green.log`      |
| N8    | Read `thrown.message` directly                                   | `never invokes an accessor to read the chart’s sentence` observed one accessor call                     | `N8.patch`, `N8-fail.log`, `N8-fail.status`, `N8-restore.status`, `N8-green.log`      |
| N9    | Accepted a non-string descriptor value                           | `never discloses a chart message that is not a string` observed two console tuples                      | `N9.patch`, `N9-fail.log`, `N9-fail.status`, `N9-restore.status`, `N9-green.log`      |
| N10   | Offered the value to the selector before checking reporting loss | `never offers an unreportable value to a disclosure selector` observed one selector call                | `N10.patch`, `N10-fail.log`, `N10-fail.status`, `N10-restore.status`, `N10-green.log` |
| N11   | Removed the selector guard                                       | `survives a disclosure selector that throws` let `the selector could not read it` escape                | `N11.patch`, `N11-fail.log`, `N11-fail.status`, `N11-restore.status`, `N11-green.log` |

The focused Vitest runs emitted the existing Vite warning about `__dirname` and the future native
config loader. Whole frontend, browser, devsync and host-gate checks remain planner work.
