# Verification

Base: `0ea6a1166242edf694294d1ed6e715fb7e1aed60`. Historical safe tool transcripts dated 2026-10-08/09 were read as inert provenance; no historical commands were executed. Design adapted to existing complete graph and canonical node readings.

Version inventory: document 8 → reserved 9; saved input 6 → reserved 7; scheduler 16 unchanged; ADR 0053; additive migration reserved `20261013140000_add_step_node_blockages`. Root coordinator confirmed no active lane owns those allocations; recheck before integration.

## Failure proofs

| Check                         | Injected fault                                    | Observed test and output                                                                                                                                       |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| direct precedence             | Guard removed or dependency deliberately replaced | `direct blockage outranks progress and a running attempt but yields to done and row hold`; exit 1                                                              |
| legacy endpoint validation    | Guard removed or dependency deliberately replaced | `(fail) refuses legacy endpoints absent from the full tree before expanding to leaves`; exit 1                                                                 |
| duplicate identity validation | Guard removed or dependency deliberately replaced | `refuses duplicate node identities even at distinct graph positions`; exit 1                                                                                   |
| blockage reference validation | Guard removed or dependency deliberately replaced | `refuses blockage outside the graph instead of silently dropping it`; exit 1                                                                                   |
| resolved endpoint validation  | Guard removed or dependency deliberately replaced | `refuses an absent successor before projecting any visible node`; exit 1                                                                                       |
| row fact validation           | Guard removed or dependency deliberately replaced | `throws on a leaf with no row on the plan`; exit 1                                                                                                             |
| sibling precision             | Guard removed or dependency deliberately replaced | `keeps row proxy independent of an unblocked typed step endpoint (isolated); keeps row proxy independent of an unblocked typed step endpoint (shared)`; exit 1 |
| running attempt barrier       | Guard removed or dependency deliberately replaced | `stops incoming propagation at statements and running attempts`; exit 1                                                                                        |
| waiting excludes legacy       | Guard removed or dependency deliberately replaced | `never reads a legacy join as a predecessor`; exit 1                                                                                                           |
| Graph position                | Remove only `nodes.has(key)`                      | Distinct identities at one position negative did not throw; exit 1                                                                                             |

## Commands

Core/domain implementation and targeted test evidence follow below. Persistence, commands, transfer, UI, browser checks, migration checks and exact-SHA heavy gate remain pending.

### Core/domain slice

- RED: targeted domain/service tests failed before implementation. Direct blockage read `in_progress` instead of `blocked`; missing legacy endpoints returned a graph instead of throwing; new projection export was absent.
- GREEN: `bun test libs/wbs/domain/domain/src/node-reading.test.ts libs/wbs/application/core/src/service/node-readings.test.ts libs/wbs/application/core/src/service/dependency-graph.test.ts apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts` passed 59 tests, 172 assertions before the additional live precision cases.
- `bun test apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts --test-name-pattern 'keeps row proxy'`: 2 passed, 0 failed, 6 assertions. Both isolated and shared reads retain row `blocked_by_proxy` while the unrelated step reads `waiting` and its next step `unknown`.
- Ten mutations ran sequentially against production functions; each produced named assertion failures with exit 1. The sibling mutation failed both production HTTP/controller read modes. Every source was restored in `finally` before the next mutation.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:typecheck`: fresh target output and success, 0/1 cache hit.
- Initial Nx invocation emitted sandbox socket-denial warnings with no target output; its exit 0 was not accepted as typecheck evidence. Explicit daemon/plugin isolation settings produced actual target output.
- Direct ESLint invocation passed but skipped module-boundary rules because no project graph existed yet; rerun after Nx graph creation remains required.
- Core typecheck found the live read carries endpoint-only legacy edges; `DependencyGraphState.legacy` now declares precisely that shape. After correcting endpoint types, core typecheck exposed test index-signature dot access; tests now use bracket access. Final rerun recorded below.
- Persistence, commands, retained blockage facts, plan-document/saved-plan versions, UI, schedule-byte proof, browser checks, migration/rollback checks and the exact-SHA heavy gate remain unimplemented/unverified. This is a core slice only.

### Parent-progress compatibility correction

- Artifact review restored known parent progress compatibility and structural stale-replay obligations before any persistence edits.
- RED: unknown progress owners were silently ignored; the new unknown-progress negative failed because no exception was thrown.
- The migrated SQLite live regression reads the plan before and after injecting a historical parent progress row. Both read modes must preserve status/progress folds, omit parent node readings, and retain the stored `done` row. The fixture expects omission, matching the existing parent wire contract.
- Removing the progress-owner guard and progress-step guard separately made the unknown-progress negative fail. Requiring all statements in the leaf graph made both migrated-parent HTTP reads return 500 instead of 200. All three mutations exited 1 and sources were restored.

| Check                | Injected fault                        | Observed test and output                                                 |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Progress owner       | Remove owner guard                    | Unknown-progress-owner negative failed; exit 1                           |
| Progress step        | Remove step guard                     | Unknown-progress-step negative failed; exit 1                            |
| Parent compatibility | Require every statement in leaf graph | Migrated-parent isolated/shared reads expected 200, received 500; exit 1 |

### Core candidate verification

- Final four-file targeted test command above: **67 passed, 0 failed, 194 assertions** (10.62s), including both migrated parent and sibling precision read modes.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck`: **passed**, core plus all module checks, 0/2 cache hits (35.2s). Domain typecheck also passed with actual target output.
- Explicit ESLint over all eight changed TypeScript files: **exit 0, no warnings**, after Nx created its project graph. The earlier skipped module-boundary warning is superseded by this run.
- Strict `openspec validate add-step-node-blocking --strict --json`: **valid, zero issues**.
- Initial stepless unit fixture incorrectly carried Dev progress via its shared helper; the stricter unknown-step rule correctly refused it. Fixture now supplies no progress for its stepless graph. The migrated-parent cases separately prove the deliberate compatibility exception.
- Tasks 1.1/1.2 now correspond to the implemented canonical projection and passing tests in this core commit. Task 1.3 schedule-byte proof and remaining task 1.4 coverage remain open.

### Graph-position followup

- Added `refuses distinct step identities sharing one graph position`, independently of duplicate stable IDs. Production guard passes the case by refusing malformed topology.
- Removed only `nodes.has(key)` from the duplicate-node guard, retaining the identity guard: the position-specific negative failed with `Received function did not throw` (exit 1), and the projection incorrectly exposed both Dev and Extra at position 0. Restored the guard afterward. This is the fourteenth watched fault injection.
- No migration or transfer edits while core review is queued.

- Followup `bun test libs/wbs/application/core/src/service/node-readings.test.ts`: **19 passed, 0 failed, 32 assertions**. ESLint over the two changed source/test files passed with exit 0.

### Cycle-read caller correction

The core review found a missed established caller contract: `WorkItemService.tree`
must remain readable over stored dependency cycles and report `scheduleError: 'cycle'`.
The earlier recursive projection refused that modeled state. Replaced recursion with
finite monotone root propagation over every validated edge; waiting reads intrinsic
predecessor completion, which cannot be derived from blockage. Write-time cycle refusal
remains in the existing dependency guard. The old recursive cycle-throw test/proof is
superseded, rather than counted as a current safety requirement.

- RED: the existing readable-cycle caller and two new authored/legacy cycle projection tests all threw `the step-node graph runs in a circle` (3 failed).
- GREEN: those tests and the updated absent-legacy predecessor caller passed (4 passed, 9 assertions).
- Direct-hold and external-root cycle regressions cover downstream work. The external-root case enters a silent cycle from outside, proving repeated root visits are bounded by deduplication rather than by encountering the root's own barrier.
- SQLite HTTP tests cover readable cycles with and without a direct `blocked` row hold plus downstream work, in both isolated/shared modes. They retain the modeled schedule error and canonical node readings.
- The old missing-predecessor caller assertion expected silent omission. It now requires the explicitly approved malformed-trusted-state refusal. Removing the resolver's endpoint guard made the production `WorkItemService.tree` caller resolve instead of refusing.
- An exploratory foreign-endpoint HTTP fixture was caught earlier by existing organization-cross-reference checks; it was removed and is not claimed as evidence for the new endpoint guard.

| Check                                | Injected fault                        | Observed test and output                                                                                                      |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Missing legacy endpoint on live tree | Remove resolver endpoint guard        | Main live-tree caller resolved instead of rejecting; exit 1                                                                   |
| Missing graph predecessor            | Remove predecessor guard              | Named missing-node negative received TypeError; exit 1                                                                        |
| Missing graph successor              | Remove successor guard                | Named absent-successor negative received TypeError; exit 1                                                                    |
| Stored cycle readability             | Reintroduce cycle refusal             | Main readable-cycle tree caller threw; exit 1                                                                                 |
| Root forwarding                      | Remove requeue after newly added root | Direct-hold and external-root cycle tests lost downstream causes; exit 1                                                      |
| Finite root visits                   | Remove existing-root skip             | External-root silent-cycle production test did not terminate within 5s; subprocess watchdog killed it and source was restored |

Broader caller/service tests and final lint/typecheck/format/OpenSpec checks recorded next.

### Broader source verification

- `bun test ./libs/wbs/application/core/src/service/*.test.ts ./libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts ./libs/wbs/domain/domain/src/node-reading.test.ts ./apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts`: **532 passed, 0 failed, 1,665 assertions across 32 source files**. This includes all 29 service suites, the complete main work-item caller suite, and all isolated/shared controller regressions.
- `bun test ./libs/wbs/application/core/src/module/work-item/step-allowance.test.ts ./libs/wbs/application/core/src/module/work-item/step-addresses.test.ts ./libs/wbs/application/core/src/module/work-item/module.test.ts`: **23 passed, 0 failed, 54 assertions**. All four work-item module test files are covered with the main caller suite above.
- An earlier non-anchored directory argument also collected generated `dist/out-tsc` tests after typecheck: 551 passed, 25 failed (24 alias-resolution errors plus a generated-path architecture oracle). That command is not accepted as validation. The source-anchored command above passed without those generated artifacts.
- Five-file ESLint over changed TypeScript files passed with exit 0 after import sorting, queue `for-of`, and the repository's Bun rejection-matcher style were applied.
- Initial post-refactor core+module typecheck passed with actual target output and 0/2 cache hits (40.1s). Final core/backend checks recorded below.
- [Negative proof receipts](evidence/cycle-read/receipts.json) and their raw captured output are committed beside this verification record. Every injected source fault was restored before the broader test runs.

- Final `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck`: **passed**, all core module checks plus core target, 0/2 cache hits (47.1s).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck`: **passed**, all backend module checks plus backend target, 0/2 cache hits (12.4s).
- Strict OpenSpec validation: **valid, zero issues**. Final touched-file Prettier and diff checks passed before the review commit.
- No persistence, transfer or release work was performed while this core correction awaited review. Schedule-byte/hash neutrality, migration/rollback, structural journal changes, UI and exact-SHA heavy gate remain open.
