# Connected capture foundation — review handoff

Worktree `/tmp/puni-cross-capture`; branch `feat/cross-project-capture`; original base `a7688e9f0`; current HEAD `1e10d5fbf3d5993c1fb46a1aad9256011535b592` includes root's normal-hook fixture fix. Worker made no commits. Root owns normal-hook commit, integration, Astra review and final gate.

## Implemented boundary

`ConnectedPlanCapture` is a detached core value. `ChainSnapshot.captureConnected` captures both incident dependency directions; shared mode alternates those edges with indexed person/project assignment adjacency until fixed point. Required projects retain their own complete PlanInputReads, real organization ownership, live abbreviation and captured organization rank. Stable rank/ID and relationship-ID ordering, identity agreement, explicit local-only typed projection, and per-observation memoization (including concurrent component requests) prevent mixing project meanings or rereading full inputs.

`readConnectedPlanInputIn` is explicit; historical `readPlanInputIn` still refuses external incident rows. Existing rank-chain `projects`, isolated/shared LivePlanRead arms, hashes and historical documents retain their meanings. Existing ordinary isolated/legacy live paths remain unchanged. No fake connected scheduling or final LivePlanRead connected projection was added; task 5.1 stays globally incomplete. A later real connected derivation must consume this capture inside the observation callback, perform sequential captured-cache selections there, then expose its detached connected live projection.

Owned ChainSnapshot and live-plan observations create irreversible adapter lifetimes and expire before COMMIT/ROLLBACK/close. Acquisition, captured input/connected callbacks (including cache hits), snapshot scheduler supports/read and the raw callback handed to schedulerOf are guarded. Plan-input/closure continuations recheck lifetime across awaits, including a paused first-read seam. Borrowed reads use the staged writer and never settle/close it.

The accepted Astra ruling is implemented in `sqliteUnitOfWork`: required per-run `createScope(lifetime)` and `createRepairScope()` factories; construction is rollback protected, expiry precedes settlement, and journal-only repair receives fresh OPEN-gated base stores after successful rollback. Source public owned readers remain reusable; source command readers/fanout callbacks capture their own scope token permanently and never revive in later transactions. Core Scope/memory interfaces were not redesigned.

## Verification

- Final combined focused command below: **288 pass, 0 fail, 1357 assertions, 19 files** (`/tmp/capture-final-tests.log`, 44.23s).
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit 0, empty `/tmp/capture-backend-types.log`; includes relevant core/SQLite/backend project checks.
- `xargs -a /tmp/puni-connected-capture-paths.txt bunx prettier --check`: final log `/tmp/capture-format-check.log`.
- `xargs -a /tmp/puni-connected-capture-paths.txt bunx eslint`: final log `/tmp/capture-lint-check.log`.
- `git diff --check`: exit 0.
- Restored borrowed-connection negative rerun: 1 pass (`/tmp/capture-borrowed-restored.log`). Final code after the combined test run differs only by formatting; every injected production fault was restored.

```sh
bun test libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/source.test.ts libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.db.test.ts libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-in-transaction.db.test.ts libs/wbs/adapters/store-sqlite/src/import-performance.db.test.ts libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts libs/wbs/adapters/store-sqlite/src/write-coordinator.db.test.ts apps/wbs/be-01/src/controller/step.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-lifecycle.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts apps/wbs/be-01/src/service/announcement-ownership.db.test.ts apps/wbs/be-01/src/service/plan-commands.db.test.ts
```

## Watched R5 evidence

Every claimed log below contains actual named `(fail)` cases; none relies on nonzero/no-match alone. Main capture first RED was missing captureConnected (`/tmp/capture-red.log`), and concurrent-component RED read a1/a2 twice before serialized memoization. Final GREEN covers these cases.

- `/tmp/capture-negative-begin.log`: transaction bypass observed edited predecessor inside initial observation and cache states idle/failed/failed/failed rather than idle/idle/failed/failed.
- `/tmp/capture-negative-closure.log`, `-shared-closure.log`: omitted dependency/person traversal lost required component projects.
- `/tmp/capture-negative-authorization.log`: bypassed initial scoped ownership admitted b1 from org-b.
- `/tmp/capture-negative-close.log`: omitted owned close observed 0 rather than 1 on success/refusal/throw.
- `/tmp/capture-negative-rank.log`, `-identity.log`, `-local-projection.log`: removed guards accepted undefined rank, changed relationship type identity, or missing local projection respectively. Dependency faults exercise actual production factory with narrow injected reader faults; ordinary closure/coherence/cache tests use real SQLite reads.
- `/tmp/capture-negative-lifetime-{expire,guard,snapshot-acquisition,cache-callback,borrowed-entry,borrowed-acquisition,shared-lifetime,continuation}.log`: omitted expiry or lifetime guard admitted retained old reads; omitted snapshot acquisition performed one SQL query before refusing (48→49); omitted borrowed entry performed 22 SQL queries before eventual deeper refusal (8→30); raw cache callback returned idle state after settlement; removed acquisition returned a new expired-scope reader; shared token prevented the next run's fresh scope; removed paused continuation check issued one work-item read (0→1).
- `/tmp/capture-negative-repair-scope.log`: reusing expired transaction scope failed both repair tests before durable journal repair.
- `/tmp/capture-negative-borrowed-connection.log`: swapped staged writer for fresh read-only connection observed a1 instead of staged. Restored GREEN recorded separately.
- `/tmp/capture-negative-import-observer.log`: removed observer reported 0 instead of the exact 508 native wrappers.
- `/tmp/capture-negative-lost-project.log` is **diagnostic-only evidence**: removing explicit disappearance guard still refused through incidental null dereference. It proves error quality, not an accepted corrupt capture.
- `/tmp/capture-negative-expiry.log` is earlier owned-wrapper evidence superseded by final lifetime utility/source proofs. The experimental `/tmp/capture-negative-import-filter.log` is **not a valid independent proof and is not claimed**: a proposed boundary hypothesis was wrong, and the filter was discarded. See concrete correction below.

## Required caller maintenance, kept separate for review

Required static-UoW consumers in five adapter test files and seven backend test files now provide fresh scope/repair factory objects. app.ts changed only the exact outdated JSDoc example approved by root. Source and UoW are the single designated integration edits; no shared worktree was modified.

Two old chain ownership corruption tests already failed unchanged on the original base because the new abbreviation decoder refused mismatched namespace before their intended guard. `/tmp/capture-baseline.log` records original production/test failures; fixtures now keep the abbreviation namespace coherent with their deliberately corrupt owner, preserving the original precise ownership/reference assertions (`/tmp/capture-baseline-repaired.log`).

Three additional original-base failures are recorded in `/tmp/capture-callers-baseline.log`: missing new external migration in step-parallel rollback ledger expectations and import native count 507 → 508. The migration list now includes the actual new migration while retaining exact rollback/full-ledger assertions. For import, temporary observer stacks identify wrapper508 as treeIsolated→typedDependencies.listByProject (`/tmp/capture-import-transaction-tail.log`). A separate boundary diagnostic records `isAdmitted:true, commitSeen:false` at that wrapper (`/tmp/capture-import-transaction-boundary.log`). Thus the coherent unified typed read occurs **inside** the import act, even though it builds the response projection. Final expectation is exact 508 /1016 controls, not a threshold. My initial post-COMMIT inference was disproved and discarded. No diagnostic instrumentation remains.

## Scope limits and skipped checks

No WBS/OpenSpec edits, solver/placement/optimizer algorithms, endpoint admission, graph/domain expansion, UI or final connected live projection. No subagents spawned, commits, push, merge or deployment. Full h2/h4 gate, full-repo CI/build, OpenSpec validation, secrets and migration lint were not run in this worker. Root must run required final gate after committing/integrating. Actual connected scheduling and live consumer projection remain later task dependencies; this handoff does not close task 5.1.

## Frozen explicit manifest

Root should commit only these 27 paths. Hashes are recorded in `/tmp/puni-connected-capture-path-hashes.txt` after final verification.

```text
apps/wbs/be-01/src/app.ts
apps/wbs/be-01/src/controller/step.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-lifecycle.controller.db.test.ts
apps/wbs/be-01/src/service/announcement-ownership.db.test.ts
apps/wbs/be-01/src/service/plan-commands.db.test.ts
libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts
libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts
libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts
libs/wbs/adapters/store-sqlite/src/connected-plan-capture.ts
libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts
libs/wbs/adapters/store-sqlite/src/fanout-capture.ts
libs/wbs/adapters/store-sqlite/src/import-performance.db.test.ts
libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts
libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.ts
libs/wbs/adapters/store-sqlite/src/saved-plan-capture.ts
libs/wbs/adapters/store-sqlite/src/saved-plan-in-transaction.db.test.ts
libs/wbs/adapters/store-sqlite/src/source.ts
libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.db.test.ts
libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.ts
libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts
libs/wbs/adapters/store-sqlite/src/write-coordinator.db.test.ts
libs/wbs/application/core/src/index.ts
libs/wbs/application/core/src/ports/chain-snapshot-store.ts
libs/wbs/application/core/src/service/connected-plan-values.ts
```

# Review fix round 1 — P1 resumed continuations

Base/root committed HEAD: `467ad3f1294886584951b798746c96ad3e1cab69`. Four paths only; `/tmp/puni-connected-capture-round1-paths.txt` and `/tmp/puni-connected-capture-round1-path-hashes.txt` are the new frozen manifest. No worker commits or Git metadata edits. Original foundation fault logs and review evidence were preserved.

## Change and complete async-path inventory

The review's P1 is reproduced by nine repo regression cases (live first response and both project/step authorizers, each across success/refusal/throw) in `/tmp/capture-round1-red.log`: 0 pass /9 fail. Actual repository responses pause after SQL, their admitting UoW settles, then they resume while a different real UoW is open. No final-wrapper rejection is used as a substitute for preventing the next read.

- `readLiveProjectIn`: checks after findById before activation/ownership SQL, after scoped ownership before capacity-mode SQL, and after rank discovery before starting per-project reads.
- Project and aggregate live metadata now use the same private sequential `readLiveMetadataIn`: guarded entry after chain derivation, then checks between steps/work items/attempts/blockages/event sequence. Read order and returned fields are unchanged. This bounded extraction prevents the same read chain from having divergent lifetime protection in its two consumers.
- Aggregate `readSchedule`: checks before cache lookup as well as cache misses. A new real aggregate regression pauses the second project's last capture after its inputs are detached; omitting this guard returns the first project's previously cached schedule into the expired derivation before a deeper guard eventually refuses.
- `readExport`: checks after the live observation returns, before directory/marker/resource follow-on SQL.
- Async project and step fanout authorizers now require the existing lifetime and check it after their project read, before membership SQL. Source passes the same per-run token; optional scope/lifetime fallback was not added.
- Directory authorization also requires that lifetime after its final foreign-reference await, before classifying/throwing detailed evidence. The audit found that existing guardRead only checks resolved returns: real corrupt references could otherwise throw their details after expiry before the wrapper could enforce the closed error. Three real-SQL RED cases reproduced this; the added check restores expiry precedence. This is an error/evidence classification proof with zero additional SQL, not a claim that the old path accepted a successful project observation.
- Aggregate readable-project acquisition, ranked project response callbacks, and chain snapshot acquisition remain protected by the existing required entry checks before any next SQL. Rank callbacks return only detached project rows; subsequent database access goes through guarded readChainSnapshotIn. Aggregate capture caches retain their existing acquisition checks; the new scheduler-cache check covers the resumed derivation gap.
- Final sequence/export Promise.all awaits perform no further SQL before the existing observe post-return check. Their detached assembly never escapes that wrapper after expiry. Sequence boundary regressions exercise project, aggregate and export; export's follow-on reads have the new specific guard above. Source guardRead likewise protects final pure returns. Synchronous import/rank/mode/lifecycle authorizers have no await between their admission entry and SQL/evidence work.
- Existing readChainSnapshotIn assignment/rank loops, capture mutex continuations, connected project/incident/rank/full-input reads, saved-plan read sequence and first-read diagnostic seam already recheck before their next reads. Owned authorization/opening sequences cannot settle their own lifetime while awaiting admission/capture. Existing owner close-once, captured raw-cache checks, borrowed staged connection, public reusable owner and fresh repair scopes were left intact.

## Regressions and watched proofs

New `read-continuation.db.test.ts` contains **85 cases**: all 3 settlement outcomes across project/aggregate/export ownership/rank/chain/steps/work-item/attempt/blockage/final-sequence boundaries, the original live/fanout cases, aggregate cached evidence, and directory classification. Every continuation asserts an exact zero SQL count and the exact empty query list after resumption in the later UoW. The directory proof explicitly expects the lifetime error rather than stale foreign-reference details.

Each new production guard was independently removed and restored. Named failing tests and exact observations are in `/tmp/capture-round1-negative-counts-<name>.log`:

| Name                | Observed with just that guard removed                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| live-project        | 4 expired SQL queries                                                                                             |
| live-owned          | 2 expired SQL queries                                                                                             |
| live-rank           | 4 expired SQL queries                                                                                             |
| metadata-entry      | 1 expired step query                                                                                              |
| metadata-steps      | 6 expired work-item queries                                                                                       |
| metadata-work-items | 1 expired attempt query                                                                                           |
| metadata-attempts   | 1 expired blockage query                                                                                          |
| metadata-blockages  | 1 expired event-sequence query                                                                                    |
| export              | 13 expired follow-on queries                                                                                      |
| authorize-project   | 1 expired membership query                                                                                        |
| authorize-step      | 1 expired membership query                                                                                        |
| aggregate-cache     | 1 cached schedule returned into expired derivation; final outward refusal still occurs                            |
| directory           | detailed stale foreign-reference error rather than scope expiry; no successful observation or further SQL claimed |

All thirteen logs contain an actual named `(fail)` test; these are not no-match/exit-only evidence. The first aggregate-cache probe paused too early and its mutant survived; it was corrected to pause the last capture of the second aggregate chain, and the claimed count log records the actual cached return escaping. No claim is based on that earlier uninformative probe. Adjacent Proof comments record the observed fault at every new guard.

## Final verification

- Reviewer probe rerun unchanged: `bun test /tmp/puni-capture-continuation-review.test.ts` → **3 pass /0 fail /6 assertions**, and all three printed post-expiry SQL arrays are exactly empty (`/tmp/puni-capture-continuation-review-round1.log`). Original probe/log were not modified.
- Affected focused suite below → **204 pass /0 fail /759 assertions /9 files**, 22.67s, `/tmp/capture-round1-final-tests.log`. This includes the original coherent capture/cache/ordinary lifetime, source, UoW repair and claim/replay regression coverage.
- Actual dedicated Nx targets all completed successfully, with cache skipped:
  - `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck --skipNxCache --outputStyle=static`: core plus module task passed, 43.9s, `/tmp/capture-round1-core-types.log`.
  - `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck --skipNxCache --outputStyle=static`: passed, 4.7s, `/tmp/capture-round1-sqlite-types.log`.
  - `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skipNxCache --outputStyle=static`: backend plus module task passed, 9.7s, `/tmp/capture-round1-backend-types.log`.
- The first SQLite target caught TS2749 in a new test's dynamically imported class type (`/tmp/capture-round1-sqlite-types-red.log`). Replaced that import with a normal static class import, reran the actual SQLite/backend targets and affected focused suite. No assertion was weakened.
- `bunx prettier --check` and `bunx eslint` on exactly the four manifest paths passed (`/tmp/capture-round1-format-check.log`, `/tmp/capture-round1-lint-check.log`); `git diff --check` passed. Final changes after the test/type runs only clarified adjacent proof comments.

```sh
bun test libs/wbs/adapters/store-sqlite/src/read-continuation.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/source.test.ts libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.db.test.ts libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts
```

Full host gate/build, OpenSpec validation, secrets and migration lint remain root-owned and were not run in this round. No WBS/docs/OpenSpec edits, broad architecture changes, pushes or deployment. Connected derivation and final LivePlanRead projection remain pending; task 5.1 is not globally complete. Ready for root normal-hook commit and Astra re-review.

## Durable evidence

Referenced capture logs and mutation/probe scripts are retained in [task-5-capture-proofs](task-5-capture-proofs/). Scripts are text artifacts, not discovered tests. Log trailing whitespace was normalized; substantive observations are unchanged. Initial, diagnostic-only, invalid and superseded attempts remain explicitly classified above.
