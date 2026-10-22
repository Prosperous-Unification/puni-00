# Cross-project live/readiness correction packet

Source reviewed: `e9c22a3ca421f83232101026131128b9b3f12134` in `/tmp/puni-cross-live-readiness`. Correction tree: `/tmp/puni-cross-live-correction`, cloned from that commit, detached and uncommitted. The original source remains clean at the same HEAD, and all 22 entries of `/tmp/puni-live-readiness-owned-sha256.txt` verify. Corrected exact eight-path SHA-256 manifest: `/tmp/puni-cross-live-correction-owned-sha256.txt`; all eight entries verify after the final edit. No feature/root checkout edits.

## Corrections

- `connected-plan-capture.ts` now shares one bounded external/person topology discovery between live dispatch and capture. Shared mode follows alternating person bridges and incident external links without rank cutoff. The full capture still validates each project's required input and every materialized relationship. `chain-snapshot.ts` selects connected when any external link exists in that discovered component.
- The isolated, unconnected read uses an indexed, `LIMIT 1` external existence scout. It does not materialize local typed links for routing. In the mounted query-count probe, zero local links and 19 local links both issue 9 Drizzle statements. Connected capture still performs full validation.
- All missing required `readResolvedFast` test schedulers now use the real `scheduleResolved` implementation (or existing `fast.readResolvedFast`), while inaccurate progress/blockage fixtures now match the stored types. The production port remains required.

Modified paths are exactly those in the correction manifest. Three extra fixture/test paths outside the original 22-path manifest were explicitly approved by root: `apps/wbs/be-01/src/testing/captured-scheduler-fixture.ts`, `libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts`, and `libs/wbs/application/core/src/service/shared-people.test.ts`.

## Fresh checks

- `bun test libs/wbs/application/core/src/service/connected-readiness.test.ts libs/wbs/application/core/src/service/shared-people.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts`: 85 pass, 0 fail, 245 assertions.
- `bunx tsc --noEmit -p` each of `libs/wbs/adapters/store-sqlite/tsconfig.spec.json`, `libs/wbs/application/core/tsconfig.spec.json`, `apps/wbs/be-01/tsconfig.spec.json`: exit 0 each.
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0.
- `bunx eslint` over the eight modified files: exit 0. ESLint warned that `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph was available in the isolated clone.
- `bunx prettier --check` over the eight files: exit 0. `git diff --check`: exit 0.
- An attempted `bunx nx run-many -t typecheck -p wbs-store-sqlite wbs-core wbs-be-01 --parallel=3` exited 0 after Nx socket/plugin-worker warnings but printed no task execution; it is **not** counted as typecheck evidence. The direct configured TypeScript commands above are the evidence.

## Watched negatives

- Frozen source bridge probe: a1 returned connected with `[a1,a2,a3]`, while a3 returned shared, causing the new mounted test to fail. Corrected test returns the same connected component from both targets. The additional alternating path a1–person–a2–external–a3–person–a4 returns the same four-member capture and missing-calendar outcome from each target, including a1 ranked before its external-linked neighbor.
- `/tmp/puni-cross-live-person-negative.ts` removes production person traversal temporarily, runs the mounted alternating test, observes `Expected: connected / Received: shared`, and restores source in `finally`.
- `/tmp/puni-cross-live-negative.ts` temporarily restores the materializing `listIncident` routing scout, runs the mounted query-count test, observes `Expected: 13 / Received: 51` with 19 local links, and restores source in `finally`.
- `/tmp/puni-cross-live-edge-negative.ts` removes production predecessor traversal temporarily. The mounted bidirectional capture test fails at `connected topology omitted an external endpoint`; source is restored in `finally`.

All three mutation scripts returned exit 0 only after observing their expected semantic failure. Their post-restore source hashes match the correction manifest.

No host gate, full Nx CI gate, migration/secrets lint, browser/API-wide tests, deployment or production activation was run for this bounded packet. No commit or integration was made.
