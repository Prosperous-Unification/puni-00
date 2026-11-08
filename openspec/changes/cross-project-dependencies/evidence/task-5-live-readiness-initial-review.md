# Bounded connected live/readiness review — REJECT

Reviewed commit: `e9c22a3ca421f83232101026131128b9b3f12134`, branch `feat/cross-project-live-readiness`, frozen worktree `/tmp/puni-cross-live-readiness`. Exact 22-path SHA-256 manifest: `/tmp/puni-live-readiness-owned-sha256.txt`. Final HEAD matches, `git status --porcelain` is empty, and all manifest entries pass (`/tmp/puni-live-review-manifest.log`). No frozen source, Git metadata, WBS or PR edits were made.

Scope: independent review of the domain execution evaluator, connected readiness producer, runtime resolved-Fast port, real SQLite live capture, and temporary unsupported-consumer refusals. Read AGENTS/LLM_README, next-unit brief, connected scheduling/optimization/publication rulings, tasks and actual callers/tests. This is not approval of whole tasks 5.1, 6.3 or 8.4, nor production activation.

## Blocking findings

### R1 — P1: shared-person peers can bypass connected dispatch

`libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts:623–632` dispatches on external relationships incident directly to the requested project. In shared mode a component also includes transitive shared-person neighbors. A peer without its own external relationship consequently takes the old rank-chain route even though another target's connected capture includes it.

Exact real-SQLite reproduction is preserved at `/tmp/puni-live-review-repro/libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts`, test `REVIEW shared person peer uses the same connected component from either target`:

- Existing fixture: external FS `a2 → a1`, active `org-a` membership, missing calendars.
- Enable shared people; add project a3's row and step; assign person p to a1 and a3.
- `read('a1', access)` correctly returns connected and captures `[a1,a2,a3]`.
- `read('a3', access)` returns `shared`, where `connected` is required.

Run from `/tmp/puni-live-review-repro`:

```sh
bun test libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts --test-name-pattern 'REVIEW shared person peer'
```

Original full-file failure log: `/tmp/puni-live-review-routing.log` (4 pass, 1 fail; expected connected, received shared). The reproducer contains no production mutation. This undermines one-component selection and also lets downstream dispatch miss its explicit connected refusal. Do not merely turn the old branch into a generic refusal for peers: the bounded producer must discover and return their connected capture.

Correction: discover topology under the admitted observation using both incident relationships and shared-person bridges, without a rank cutoff; select connected whenever that closure contains an external relationship. Preserve no-external isolated/shared paths. Reuse the approved capture/discovery semantics rather than a second incompatible traversal.

Acceptance: the probe above passes from every member; add an alternating person/edge closure and a higher-ranked requested peer whose external-linked neighbor ranks later. Show the same component/placement or modeled missing-calendar outcome from every target, and no old rank-only answer. Add a production-path negative that bypasses person traversal and makes the new routing assertion fail.

### R2 — P1: the required typecheck includes failing test projects

Library-only typecheck passes, but the repository's package `tsconfig.json` references both lib and spec configs. Three fresh spec typechecks fail with 12 diagnostics introduced by this port/fixture change:

| Config                                              | Broken fixture locations                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `libs/wbs/adapters/store-sqlite/tsconfig.spec.json` | `src/chain-snapshot.db.test.ts:886`; `src/connected-plan-capture.db.test.ts:55,165,349,487` (last factory produces diagnostics at usages 495 and 498): required `readResolvedFast` missing       |
| `libs/wbs/application/core/tsconfig.spec.json`      | `src/service/connected-readiness.test.ts:33,85`: required `statedAt` missing; line 95: nonexistent `blockedBy`; `src/service/shared-people.test.ts:113,405`: required `readResolvedFast` missing |
| `apps/wbs/be-01/tsconfig.spec.json`                 | `src/testing/captured-scheduler-fixture.ts:20`: required `readResolvedFast` missing                                                                                                              |

Reproduce from the frozen worktree:

```sh
bunx tsc --noEmit -p libs/wbs/adapters/store-sqlite/tsconfig.spec.json
bunx tsc --noEmit -p libs/wbs/application/core/tsconfig.spec.json
bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json
```

Logs: `/tmp/puni-live-review-tsc-spec.log`, `/tmp/puni-live-review-tsc-core-spec.log`, `/tmp/puni-live-review-tsc-be-spec.log`; all exit 1. Fix every affected scheduler factory with the real required callback or its intentional throwing test counterpart, and use accurate stored-progress/blockage fixtures. Do not make the production capability optional or cast away test failures.

Acceptance: all three spec commands, relevant lib/portable configs, and the configured package typecheck targets pass; existing runtime tests retain their assertions. Some corrections lie outside the original 22 paths, so root must extend ownership explicitly.

### R3 — P2: no-link isolated routing now incurs two extra queries per local relationship

The same new `listIncident([projectId])` at `chain-snapshot.ts:623` fully materializes and validates local typed dependencies before discovering that there is no external link. `typed-dependency.ts` reads both physical representations and checks each local endpoint. This changes the ordinary isolated dispatch from constant query cost to O(local relationship count), contrary to the binding preservation requirement.

Preserved probe: `REVIEW unconnected isolated routing query count`, in the isolated copy's `connected-live-plan.db.test.ts`. It removes the external fixture link, counts Drizzle statements on a real owned reader, then inserts 20 local rows linked by 19 local typed FS relationships and counts again. Both reads return isolated.

```sh
cd /tmp/puni-live-review-repro
bun test libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts --test-name-pattern 'query count'
```

Measured e9c22a3ca: **12 statements without links, 50 with 19 local links** (`/tmp/puni-live-review-query-count.log`). The same fixture with only `chain-snapshot.ts` temporarily replaced by `git show HEAD^:libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts`: **8 and 8** (`/tmp/puni-live-review-query-count-parent.log`). The copy's file was restored afterwards. These are repository statements, not a claim to count native transaction controls or benchmark latency.

Correction: use a cheap indexed topology/existence scout for the isolated route, without decoding/validating unrelated local relationships merely to choose a route. Preserve complete validation once connected capture is required. Coordinate with R1 so shared mode checks person-connected topology correctly.

Acceptance: an ordinary isolated no-external route remains constant in local edge count, retains early-close behavior, and never performs a full plan capture/derivation. A fixed topology-probe overhead can be stated and justified; the per-edge query amplification must disappear. Include query-count regression assertions and an observed fault that restores the materializing probe.

## Fresh verification

Frozen source tests:

```sh
bun test libs/wbs/domain/domain/src/execution-eligibility.test.ts libs/wbs/application/core/src/service/connected-readiness.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/runtime-portable/src/scheduler.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts
```

61 pass, 0 fail, 184 assertions; `/tmp/puni-live-review-focus.log`.

```sh
bun test libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/application/core/src/service/node-readings.test.ts libs/wbs/application/core/src/service/work-item-statuses.test.ts libs/wbs/application/core/src/service/shared-people.test.ts libs/wbs/application/core/src/module/work-item/startable.test.ts libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts
```

213 pass, 0 fail, 7,353 assertions; `/tmp/puni-live-review-regressions.log`.

```sh
bun test libs/wbs/adapters/store-sqlite/src/read-continuation.db.test.ts
```

85 pass, 0 fail, 284 assertions; `/tmp/puni-live-review-lifetime.log`. Total frozen-source tests: 359 pass / 7,821 assertions. Passing the old startable tests does not establish the new prerequisite contract: those consumers are unchanged.

Additional successful direct compiler checks:

```sh
bunx tsc --noEmit -p libs/wbs/adapters/store-sqlite/tsconfig.lib.json
bunx tsc --noEmit -p libs/wbs/adapters/runtime-portable/tsconfig.spec.json
bunx tsc --noEmit -p libs/wbs/domain/domain/tsconfig.spec.json
```

Logs `/tmp/puni-live-review-tsc.log`, `...-tsc-runtime-spec.log`, `...-tsc-domain-spec.log`, all exit 0. Failing configs are enumerated in R2.

## Independently observed R5 negatives

Only the git-archive copy `/tmp/puni-live-review-repro` was mutated. Script `/tmp/puni-live-review-repro/review-mutations.ts` performs each source replacement, runs its exact filtered test, requires nonzero exit, and restores the original file in finally. Invocation: `bun review-mutations.ts` from that directory. Summary: `/tmp/puni-live-review-mutations.log`.

| Injected fault                                  | Observed production-path failure                                                                            | Log                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| FS predicate always permits start               | Real SQLite live reader reports canStart true for unfinished remote FS; expected false                      | `/tmp/puni-live-review-negative-fs-admission.log`             |
| Ignore actual attempt when deriving started     | Reviewer-added real SQLite SS test remains blocked after an ended failed remote attempt; expected permitted | `/tmp/puni-live-review-negative-remote-attempt.log`           |
| Replace combined progress statements with empty | Actual SQLite live reader stays blocked after remote completion; expected permitted                         | `/tmp/puni-live-review-negative-remote-progress.log`          |
| Replace captured node holds with null           | Actual SQLite live proxy loses blocked_by_proxy                                                             | `/tmp/puni-live-review-negative-remote-hold.log`              |
| Default missing project's attempts to []        | Core derivation fails its missing-evidence refusal assertion (did not throw)                                | `/tmp/puni-live-review-negative-missing-project-attempts.log` |
| Remove connected export refusal                 | Actual readExport returns instead of throwing                                                               | `/tmp/puni-live-review-negative-export-refusal.log`           |

All six faults produced semantic assertion failures, not parse/import/tool failures. The SS capture probe was first green on unmodified production code (`/tmp/puni-live-review-ss.log`, 1 pass/3 assertions). After restoring all mutations, domain/readiness/live-copy suites excluding the known routing defect passed 13 tests / 40 assertions (`/tmp/puni-live-review-restored.log`). Exact command:

```sh
bun test libs/wbs/domain/domain/src/execution-eligibility.test.ts libs/wbs/application/core/src/service/connected-readiness.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts --test-name-pattern '^(?!REVIEW shared)'
```

The filename `fs-admission` denotes the evaluator fault, **not** a mounted claim/start admission proof. The missing-project test is core derivation, **not** a SQLite absent/unreadable storage proof. No claim is made that every newly introduced safety check has an independently observed mutation proof. In particular, new duplicate-node/evidence/endpoint guards and each unsupported consumer need their own complete proof accounting/adjacent comments before broad R5 completion.

## Bounded behavior and remaining seams

- Domain evaluator uses resolved edges: FS completion, SS actual start/done, FF finish-only condition, with blocker provenance retained. It does not treat zero duration as completion. Core reads own-project steps/rows, requires every attempts sidecar entry, folds all projects, and derives node/proxy/eligibility maps independently of the missing-calendar outcome. Done/hold ordering follows existing presentation logic.
- Owned live observation captures and derives before commit/close; borrowed mode uses its owner's db and does not close it. Connected metadata/attempts are acquired inside that observation. Current code inspection and existing generic lifecycle/capture tests support these facts. This commit's four SQLite tests do not independently mount connected borrowed staged writes, concurrent attempt/progress publication, withdrawal during capture, each connected throw/close path, or retained resolved-Fast capability expiry. Those connected-specific tests remain needed; the generic old-path suite is not a substitute.
- Connected optimization remains explicitly unavailable; the new Fast port does not admit solver work or call an ordinary single-project optimized reader for a component. Future captured stage cache selection/publication, durable terminal outcomes, exact question identity and post-close admission remain tasks 7/8.
- `startable.ts` still has no `eligibilityByNode`/resolved predecessor input. `WorkItemService.startableWithin` still uses target-local status reads. Actual claim (`decideClaim` call) and `startAttempt` still do not consult the new evaluator. Ordinary unfinished local FS can still be advertised/claimed under the legacy behavior. These are explicit unfinished 6.3 integration seams, not something the helper tests close. Claimed visibility, resource scope and manual correction remain unchanged; no universal FF finish enforcement was introduced.
- Tree APIs explicitly throw on connected reads because PlanTree/HTTP/frontend cannot represent dependency_calendar_missing. Export, saved-plan capture and optimization-input entry points have explicit guards; aggregate has a shared-mode guard. Isolated aggregate returns its existing isolated marker and reaches individual tree reads later. R1 must be fixed so these guards cannot miss a person-bridged component. New mounted tests cover export/shared aggregate only; tree/saved-plan/optimization refusal mutations were not independently run in this review.
- No connected tree/startable/claim consumer, retained batch projection, load/space deduplication, export/import/history, UI or activation is delivered by this bounded packet. The requested 6.3a/b and 8.4 acceptance tests and local prerequisite behavior remain open. Keep the semantic activation barrier dormant and the full task checkboxes unchecked.

Not run by this reviewer: full Nx package test targets, configured package typecheck/build targets, lint/format, frontend/browser/API-wide tests, Python, OpenSpec all validation, secrets/migration lint, CI or either full host gate. Root reported lint/format previously; that is not independent fresh evidence here. No h2/h4 completion/deploy claim is made. Final integration needs corrected spec typechecks, the three blocker regressions, complete bounded R5 accounting, and the required host gate at its eventual candidate SHA.
