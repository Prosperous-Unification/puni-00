# Incident lifecycle 4.4a/b review — REJECT

Reviewed the uncommitted ten-file packet in `/tmp/puni-cross-incident-lifecycle` at base `81316a58bd670ed12ce397b9a7a9fc6be4dae751`, against `/tmp/puni-incident-lifecycle-source-packet.md`, `/tmp/puni-incident-lifecycle-architecture.md`, OpenSpec task 4.4 and the structural deletion/history delta requirements. No original source, Git, WBS or PR changes were made.

Frozen manifest: `/tmp/puni-incident-review-before.sha256`. All ten entries still match after review (`/tmp/puni-incident-review-after.log`), and independently match the packet's declared hashes (`/tmp/puni-incident-review-packet-hashes.log`). The same ten modified files remain in Git status; `git diff --check` passes.

## Blocking finding

**P1 — production code does not typecheck.**

`libs/wbs/application/core/src/module/work-item/work-item.resource.ts:7998` calls `incidents.dependencyIds.join(...)` after a conditional guard that TypeScript cannot use to narrow this optional property. Fresh real project checks both exit 1:

```sh
bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json
bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.lib.json
```

Both report:

```text
work-item.resource.ts(7998,31): error TS18048: 'incidents.dependencyIds' is possibly 'undefined'.
```

Logs: `/tmp/puni-incident-review-types.log`, `/tmp/puni-incident-review-be-lib-types.log`.

The packet's `bunx tsc --noEmit --project apps/wbs/be-01/tsconfig.json` is not valid compile evidence. That solution config has empty `files` and `include`; plain non-build invocation does not compile its referenced projects. The same caveat applies to a root contracts solution-config check. This is a check-contract error, not a claim that Bun runtime tests failed.

Correct by narrowing the referenced-dependency branch explicitly and validating a local `dependencyIds` value there, or by making the incident refusal a properly discriminated union whose referenced arm requires IDs. Preserve the trusted-state throw for missing required IDs. Do not add `!`, an unchecked cast, an empty-array fallback, or make this field optional at the public HTTP boundary. Re-run the lib/spec checks, configured package typecheck (including core module checks), and targeted replay tests before integration.

No additional bounded runtime behavior defect was found in this review. The verdict remains REJECT until the production compile failure is fixed.

## Verified behavior

- Fresh mounted predecessor deletion returns HTTP 409 with `referenced_by_external_dependency` and IDs, and rolls back a preceding successful rename in the same batch. Existing all-table comparisons include durable revisions, journals, audit, events and sequencers. The semantic admitted service also refuses leaf/cascade/promote predecessor deletion before its stamp/write section.
- A reviewer-added mounted two-link case independently verifies the complete **sorted** ID array and unchanged tables. It uses genuine SQLite UoW/HTTP refusal paths, without replacing graph or scheduler results.
- Successor deletion removes selected owned incoming external and local links, retains an unrelated external relationship, and restores/removes original IDs through undo/redo. Reviewer-added parent cascade and promote round trips verify original IDs, both owning-project and work-item endpoints, scopes and type. The earlier packet only exercised both strategies' deletion, with the full round trip on the leaf case.
- Remote predecessor revision changes make successor-delete compensation stale. Undo-create refuses newly added outgoing and unrecorded incoming incidents even when the fixture aligns local revision state so the incident policy is actually reached.
- Removing the old blanket graph pre-read is consistent with evaluating the effective proposed relationship set. The remaining projected-endpoint guard still refuses a relationship naming a removed endpoint; it is exercised by the predecessor-refusal mutation below.
- Project deletion is accurately described as persistence protection, not an API feature. The SQL test verifies refusal and subsequent success after explicit blockers are removed. Its initial project deletion has ordinary child/step FKs too, so it does not independently prove the external project FK. The packet correctly states that limitation.

Reviewer probe source is preserved only in `/tmp/puni-incident-review-copy/apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts`, appended tests named `REVIEW mounted predecessor refusal returns every sorted incident ID` and `REVIEW successor parent cascade/promote undo redo retains exact external identity`. The copy was made with `git archive HEAD` plus the original uncommitted diff (`/tmp/puni-incident-review-source.patch`); original files were never edited.

```sh
cd /tmp/puni-incident-review-copy
bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --test-name-pattern REVIEW
```

3 pass / 51 assertions: `/tmp/puni-incident-review-extra-corrected.log`. The first reviewer fixture mistakenly mounted a positive create after seeding an external link and hit the known dormant connected-tree limitation; that probe was corrected to seed rows before relationships. Its earlier log `/tmp/puni-incident-review-extra.log` is not a new defect claim and is not counted as green evidence.

## Fresh tests, compiler and lint evidence

All commands below ran from the frozen worktree unless explicitly stated otherwise.

| Command/scope                                                                                                                                                                                                                                                                                          | Fresh outcome                               | Log                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| `bun test libs/wbs/application/core/src`                                                                                                                                                                                                                                                               | 1,247 pass, 4,964 assertions, all 110 files | `/tmp/puni-incident-review-core-tests.log`           |
| `bun test libs/wbs/domain/contracts/src`                                                                                                                                                                                                                                                               | 155 pass, 746 assertions, all 27 files      | `/tmp/puni-incident-review-contracts-tests.log`      |
| `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-lifecycle.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts`                                                  | 133 pass, 1,579 assertions                  | `/tmp/puni-incident-review-focus.log`                |
| `bun test apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts apps/wbs/be-01/src/controller/undo.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts` | 51 pass, 296 assertions                     | `/tmp/puni-incident-review-regressions.log`          |
| `bunx tsc --noEmit -p libs/wbs/domain/contracts/tsconfig.spec.json`                                                                                                                                                                                                                                    | exit 0                                      | `/tmp/puni-incident-review-contracts-types.log`      |
| BE lib/spec compiler commands above                                                                                                                                                                                                                                                                    | exit 1, same production TS18048             | `/tmp/puni-incident-review-{types,be-lib-types}.log` |
| `NX_DAEMON=false bunx nx run-many -t lint -p wbs-core,wbs-contracts --skip-nx-cache`                                                                                                                                                                                                                   | both uncached full lint targets pass        | `/tmp/puni-incident-review-lint.log`                 |
| `NX_DAEMON=false bunx nx run-many -t lint -p wbs-be-01,wbs-store-sqlite --skip-nx-cache`                                                                                                                                                                                                               | both uncached full lint targets pass        | `/tmp/puni-incident-review-lint-adapters.log`        |
| `git diff --name-only \| xargs bunx prettier --check`                                                                                                                                                                                                                                                  | all ten changed files pass                  | `/tmp/puni-incident-review-format.log`               |

Total frozen-source runtime tests: **1,586 pass, 0 fail, 7,585 assertions**. Runtime tests transpile TypeScript and do not negate the compiler blocker. Full core and contract tests ran without coverage flags; backend/store execution covered the specified complete test files, not their entire packages.

## Independently watched mutation evidence

Script `/tmp/puni-incident-review-copy/review-mutations.ts` changes only the disposable copy, runs one named test per fault, requires failure, and restores source in finally. Command: `bun review-mutations.ts` from that copy. Summary: `/tmp/puni-incident-review-mutations.log`.

| Fault                                            | Observed result                                                                                                              | Interpretation                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bypass `outgoing.length > 0` predecessor refusal | Admitted predecessor-delete test throws at the later graph endpoint guard instead of returning the expected modeled conflict | Refusal-path evidence, **not** unsafe-write evidence; `/tmp/puni-incident-review-negative-predecessor-refusal.log` |
| Replace only cascade `externalBefore` with `[]`  | Successor deletion fails with `journal external revision coverage is not exact`                                              | Actual journal capture dependency exercised; `/tmp/puni-incident-review-negative-cascade-before-image.log`         |
| Replace only promote `externalBefore` with `[]`  | Reviewer parent-promote round trip fails with the same exact-coverage error                                                  | Independent second branch proof; `/tmp/puni-incident-review-negative-promote-before-image.log`                     |
| Bypass residual `ownedIncomingIds` replay guard  | Actual undo-create returns `{ok:true}` instead of `stale_undo` for an unrecorded incoming relationship                       | Unsafe-success negative; `/tmp/puni-incident-review-negative-unrecorded-incoming.log`                              |

All four are actual production-path failures, not parser/import/tool failures. Restored source then passed:

```sh
bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --test-name-pattern 'REVIEW|external predecessor|external successor|undo-create refuses a newly linked'
```

12 pass / 182 assertions: `/tmp/puni-incident-review-restored.log`. All nine copied production/test files other than the intentionally extended controller test match the frozen ten-file manifest after restoration; original ten-file manifest matches completely.

The packet's historical TDD chronology and other mutation claims are not independently established by supplied red logs. Current tests and the independent faults above establish breakability of these selected boundaries. Existing comments accurately classify the predecessor mutation as a later graph error, not unwanted deletion. The new missing-ID diagnostic guard, every independent authority/coverage mutation, scope-qualified same-ID delivery, external FK isolation and held-announcement comparisons for all new branches are not a complete proof sweep here. Do not convert this bounded review into complete R5/task-4.4 evidence.

## Remaining scope and acceptance

Before accepting the corrected 4.4a/b packet: fix the compile blocker, retain/port the two-link and both parent-history probes into owned tests, rerun real lib/spec and configured typecheck targets, and retain exact source hashes plus focused restored test evidence. A separate full task claim additionally needs the already deferred 4.4c–e incident transition capability, first-child mapping/audit receipts, compound replay and actual graph/current-authority proof sweep. Production external authoring stays dormant; fully mounted positive connected lifecycle closure remains unproven.

Not run: full backend/store package tests, full Nx workspace tests/typechecks/builds, browser/portable runtime checks, Python, OpenSpec validation, secrets scan, migration lint, CI or either full host gate. No missing required tool was encountered. This is an isolated source review, not integration, release or deployment approval.
