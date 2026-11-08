# Corrected live-readiness independent review

Verdict: **APPROVE, bounded to the corrected connected live/readiness producer packet.** No remaining blocking defect was found in this re-review. This is not approval to activate the unfinished consumers or close OpenSpec tasks 5.1, 6.3, or 8.4 in full.

Reviewed source: `/tmp/puni-cross-live-correction`, eight uncommitted files atop `e9c22a3ca421f83232101026131128b9b3f12134`. Compared against `/tmp/puni-live-readiness-review.md` and `/tmp/puni-cross-live-correction-review-packet.md`. Source was read-only. Before/after SHA-256 checks matched all eight files against both `/tmp/puni-live-correction-review-before.sha256` and `/tmp/puni-cross-live-correction-owned-sha256.txt`. Git retained the same eight modified paths. Disposable mutations were confined to `/tmp/puni-live-correction-review-copy`; its restored files also matched the frozen hashes.

## Original blockers resolved

- **R1, shared-person bridge routing:** Dispatch and capture now use the same connected-topology discovery. Actual SQLite tests exercise reads from either shared-person peer and from every target in an alternating person/external/person component, including a target ranked before the linked neighbor. All reach the connected arm and include the component. Remote SS attempt evidence also changes eligibility through the real capture/read path.
- **R2, compiler failures:** Required scheduler fixtures implement `readResolvedFast`; readiness fixture types are corrected. All three direct spec compilations and the actual configured three-package Nx typecheck targets pass. The Nx output explicitly records execution, including two module-typecheck dependencies; this verdict does not rely on a command that scheduled zero tasks.
- **R3, isolated local-link cost:** Isolated dispatch scouts indexed external endpoints without materializing local typed relationships. Fresh instrumentation measured **9 Drizzle statements with zero local links and 9 with 19 local links**, compared with the original review's pre-packet baseline of 8/8 and rejected packet's 12/50. The correction adds one fixed statement against the old baseline and removes local-link-dependent amplification. This is a statement-count measurement, not a latency or general component-complexity claim.

Topology discovery runs for dispatch and again for capture; the implementation shares discovery semantics, not a single query pass. Capture still validates complete relationship evidence and rejects an external endpoint omitted from the discovered component.

## Fresh verification

All commands ran in `/tmp/puni-cross-live-correction` unless marked as disposable-copy checks.

1. `bun test libs/wbs/application/core/src/service/connected-readiness.test.ts libs/wbs/application/core/src/service/shared-people.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/read-continuation.db.test.ts` — **170 pass, 0 fail, 529 assertions**. Log: `/tmp/puni-live-correction-review-focus.log`.
2. `bun test libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts` — **106 pass, 0 fail, 7,089 assertions**. Log: `/tmp/puni-live-correction-review-regressions.log`.
3. `bunx tsc --noEmit -p libs/wbs/application/core/tsconfig.spec.json`, equivalent store-sqlite and be-01 spec configurations — **all exit 0**. Logs: `/tmp/puni-live-correction-review-{core,store,be}-spec.log`.
4. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-be-01 --parallel=1 --skip-nx-cache --output-style=static` — **exit 0**, all three projects and two dependencies executed. Log: `/tmp/puni-live-correction-review-package-types.log`.
5. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-core,wbs-store-sqlite,wbs-be-01 --parallel=3 --skip-nx-cache --output-style=static` — **exit 0**, all three full package lint targets executed. Log: `/tmp/puni-live-correction-review-lint.log`.
6. `git diff --name-only | xargs bunx prettier --check` and `git diff --check` — **exit 0**. Format log: `/tmp/puni-live-correction-review-format.log`.
7. Final hashes: `/tmp/puni-live-correction-review-after.log` and `/tmp/puni-live-correction-review-packet-hashes.log` — **all eight OK**.

The two source test commands total **276 passing tests and 7,618 assertions**. These are selected relevant suites, not a full-workspace test run.

## Independently observed R5 faults

Created a disposable archive of HEAD, applied the exact uncommitted diff preserved at `/tmp/puni-live-correction-review-source.patch`, and linked the existing dependency installation. Copied the supplied mutation scripts into that copy with their source paths rewritten. The observer wrapper is `/tmp/puni-live-correction-review-copy/run-review-negatives.ts`; run it with Bun from the disposable copy. Summary log: `/tmp/puni-live-correction-review-mutations.log`.

- Removed shared-person neighbor expansion. The alternating-component SQLite test failed: expected `connected`, received `shared`. Log: `/tmp/puni-live-correction-review-negative-person.log`.
- Inserted full `TypedDependencyRepository.listIncident([projectId])` before the topology scout. The isolated-cost test failed: expected 13 statements, received 51. Log: `/tmp/puni-live-correction-review-negative-cost.log`.
- Removed external predecessor expansion. The real bidirectional capture test failed with `connected topology omitted an external endpoint`. Log: `/tmp/puni-live-correction-review-negative-edge.log`. This proves visible refusal under incomplete discovery; it is not evidence that unsafe publication succeeded.

After restoration, both connected SQLite files passed again: **30 tests, 72 assertions**, log `/tmp/puni-live-correction-review-restored.log`. Independent temporary test instrumentation then measured the corrected **9/9** statement count, log `/tmp/puni-live-correction-review-counts.log`; instrumentation was restored and hashes matched. These observations reproduce the correction's relevant negatives; they do not establish every R5 proof for the whole feature.

## Remaining scope and unchecked work

- Actual startable/claim/startAttempt admission remains outside this packet; no claim that task 6.3b is complete.
- PlanTree, HTTP, and frontend cannot yet represent `dependency_calendar_missing`. Connected tree consumers refuse explicitly; this is not a mounted end-to-end readiness UI implementation.
- Export, saved-plan/history, aggregate, and optimization consumer support remains unfinished or explicitly refused. Keep activation dormant pending the corresponding implementations and proofs.
- Existing owned/borrowed read-lifetime and capture suites passed. This correction review did not add or exhaust a connected-specific staged-write, withdrawal, cache-selection, or retained-capability proof matrix.
- No broad cost claim is made for shared mode without external links or for dense connected components. Only the isolated local-link statement-count regression was measured.
- No full workspace CI/test/build, host gate, browser validation, OpenSpec validation, secrets scan, migration lint, or deployment was performed. No source integration or commit was performed.

Integration should preserve the original bounded packet plus this exact eight-file correction, then run the required integration checks and eventual host gate on the actual integrated SHA. The original full-task completion limitations remain in force.
