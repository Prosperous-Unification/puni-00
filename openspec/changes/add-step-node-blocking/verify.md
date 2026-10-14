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

Core/domain and persistence checkpoint evidence follow below. Commands, transfer, UI, browser checks and the exact-SHA heavy gate remain pending.

### Core/domain slice

- RED: targeted domain/service tests failed before implementation. Direct blockage read `in_progress` instead of `blocked`; missing legacy endpoints returned a graph instead of throwing; new projection export was absent.
- GREEN: `bun test libs/wbs/domain/domain/src/node-reading.test.ts libs/wbs/application/core/src/service/node-readings.test.ts libs/wbs/application/core/src/service/dependency-graph.test.ts apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts` passed 59 tests, 172 assertions before the additional live precision cases.
- `bun test apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts --test-name-pattern 'keeps row proxy'`: 2 passed, 0 failed, 6 assertions. Both isolated and shared reads retain row `blocked_by_proxy` while the unrelated step reads `waiting` and its next step `unknown`.
- Ten mutations ran sequentially against production functions; each produced named assertion failures with exit 1. The sibling mutation failed both production HTTP/controller read modes. Every source was restored in `finally` before the next mutation.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:typecheck`: fresh target output and success, 0/1 cache hit.
- Initial Nx invocation emitted sandbox socket-denial warnings with no target output; its exit 0 was not accepted as typecheck evidence. Explicit daemon/plugin isolation settings produced actual target output.
- Direct ESLint invocation passed but skipped module-boundary rules because no project graph existed yet; rerun after Nx graph creation remains required.
- Core typecheck found the live read carries endpoint-only legacy edges; `DependencyGraphState.legacy` now declares precisely that shape. After correcting endpoint types, core typecheck exposed test index-signature dot access; tests now use bracket access. Final rerun recorded below.
- At this core checkpoint, persistence, commands, retained blockage facts, plan-document/saved-plan versions, UI, schedule-byte proof, browser checks, migration/rollback checks and the exact-SHA heavy gate were still pending. The later persistence checkpoint is recorded below.

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
| Missing graph successor              | Remove successor guard                | Absent-successor negative received function did not throw; exit 1                                                             |
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

### Persistence and rollback slice

- P3 proof wording corrected: the committed absent-successor receipt says `Received function did not throw`; source and table now match that observation.
- Installed normal local hooks with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:install`; pre-commit, prepare-commit-msg and commit-msg are active.
- Migration RED: all five initial migration cases failed before the table existed, including the expected migration-ledger walk. Repository/recovery/memory/compatibility tests initially failed on missing implementation exports; the three swap cases then failed because the guard vocabulary was absent.
- Added `20261013140000_add_step_node_blockages` with sparse audit columns, pair PK, work-item/step/audit-user FKs, safe integer time constraint and insert/update project/leaf ownership triggers. The paired down file refuses nonempty facts, retains its ledger on refusal, and reverses/reapplies an empty table.
- SQLite and memory adapters preserve pair scope, original timestamps, step order and ownership validation. SQLite additionally proves audit/revision updates and colliding-transfer atomicity; the memory fixture, like existing fixtures, models values and references rather than SQL audit/revision transactions.
- Recovery v1 round-trips all columns, rejects malformed/duplicate files, compares stale saves, and refuses even disjoint nonempty restores. CLI tests distinguish absent/unreadable DB and absent/malformed files. Recovery uses an existing writable database with verified pragmas, never creating a missing database. Installed Bun requires explicit `readwrite: true` with `create: false`; the first CLI test exposed `SQLITE_MISUSE`, and the corrected flags pass.
- Compatibility checks inventory before migration and again after outgoing stop; only genuine older reader/table absence models empty support/facts. Missing/unreadable source/database and dangling/nonregular reader paths refuse. New journal variants remain unwired; their rollback compatibility must be covered in the command slice before enabling them.
- Initial persistence suite: **23 passed, 0 failed, 101 assertions** before the additional constraint/atomicity/CLI boundary cases. Final expanded suite (`step-blockage*.db.test.ts`, SQLite database factory, memory adapter, backend migration CLI and attempt controller, `--timeout=30000`): **122 passed, 0 failed, 723 assertions** (91.18s), including existing isolated/shared caller paths.
- Full swap+Docker command initially yielded **215 passed, 1 failed**: unchanged backend configuration bootstrap exceeded the default 5-second test budget. Retrying that sole case with `--timeout=30000` passed, **1 passed, 0 failed, 2 assertions** (3.40s). No implementation change was made to that test's behavior.
- Final swap/Docker suites with `--timeout=30000`: **216 passed, 0 failed, 606 assertions** (246.32s). The broader migration CLI suite first exposed its hard-coded newest-migration assertion; that assertion now names this additive migration.
- Explicit migration lint, changed-TypeScript ESLint, Prettier write (all unchanged), and strict OpenSpec validation: **passed**.
- Scoped Nx typechecks for domain, core, SQLite, memory, backend and remote scripts: **all 8 tasks passed, 0 cache hits** (78s), including module checks. Full exact-SHA heavy gate remains for the complete feature.
- [Persistence fault receipts](evidence/persistence/receipts.json): **46 watched source/SQL faults**, each producing named test failure(s) with exit 1. Sources were restored in `finally` after every fault before validation.

| Check/fault                     | Injected fault                                  | Observed failing production-path test                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SQL pair uniqueness             | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL work item reference         | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL step reference              | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL audit reference             | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL insert project ownership    | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL insert leaf ownership       | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL update project ownership    | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL update leaf ownership       | Named guard/constraint/call removed or disabled | `refuses duplicate pairs, missing references, cross-project steps and parent owners`; exit 1                                                                                                                       |
| SQL fractional timestamp        | Named guard/constraint/call removed or disabled | `refuses fractional and unsafe blocked timestamps`; exit 1                                                                                                                                                         |
| SQL safe timestamp bound        | Named guard/constraint/call removed or disabled | `refuses fractional and unsafe blocked timestamps`; exit 1                                                                                                                                                         |
| rollback table guard            | Named guard/constraint/call removed or disabled | `refuses rollback over a fact, keeping the schema and migration ledger`; exit 1                                                                                                                                    |
| repository timestamp            | Named guard/constraint/call removed or disabled | `refuses fractional writes and malformed stored timestamp reads`; exit 1                                                                                                                                           |
| repository owner reference      | Named guard/constraint/call removed or disabled | `refuses missing trusted owner and step references on reads`; exit 1                                                                                                                                               |
| repository step reference       | Named guard/constraint/call removed or disabled | `refuses corrupted owner/step membership and parent-owned facts on reads; refuses missing trusted owner and step references on reads`; exit 1                                                                      |
| repository leaf ownership       | Named guard/constraint/call removed or disabled | `refuses corrupted owner/step membership and parent-owned facts on reads`; exit 1                                                                                                                                  |
| repository empty move revisions | Named guard/constraint/call removed or disabled | `removes only one pair and moves all facts with their timestamps`; exit 1                                                                                                                                          |
| repository remove owner scope   | Named guard/constraint/call removed or disabled | `removes only one pair and moves all facts with their timestamps`; exit 1                                                                                                                                          |
| repository remove step scope    | Named guard/constraint/call removed or disabled | `removes only one pair and moves all facts with their timestamps`; exit 1                                                                                                                                          |
| recovery decoder                | Named guard/constraint/call removed or disabled | `refuses malformed envelopes, rows and every timestamp field at the decoder`; exit 1                                                                                                                               |
| recovery integer bound          | Named guard/constraint/call removed or disabled | `refuses malformed envelopes, rows and every timestamp field at the decoder`; exit 1                                                                                                                               |
| recovery duplicate identity     | Named guard/constraint/call removed or disabled | `rejects duplicate saved identities before writing`; exit 1                                                                                                                                                        |
| recovery stale save             | Named guard/constraint/call removed or disabled | `refuses a stale save without removing any facts`; exit 1                                                                                                                                                          |
| recovery nonempty destination   | Named guard/constraint/call removed or disabled | `refuses a nonempty restore even for disjoint existing facts`; exit 1                                                                                                                                              |
| existing DB creation refusal    | Named guard/constraint/call removed or disabled | `runs the CLI round trip and rejects malformed/absent inputs without creating databases`; exit 1                                                                                                                   |
| CLI DB_PATH                     | Named guard/constraint/call removed or disabled | `requires DB_PATH and a valid verb at the CLI boundary`; exit 1                                                                                                                                                    |
| CLI verb                        | Named guard/constraint/call removed or disabled | `requires DB_PATH and a valid verb at the CLI boundary`; exit 1                                                                                                                                                    |
| CLI argument count              | Named guard/constraint/call removed or disabled | `requires DB_PATH and a valid verb at the CLI boundary`; exit 1                                                                                                                                                    |
| CLI file argument               | Named guard/constraint/call removed or disabled | `requires DB_PATH and a valid verb at the CLI boundary`; exit 1                                                                                                                                                    |
| swap blockage inventory         | Named guard/constraint/call removed or disabled | `refuses an image without step blockage support before migration; allows an older image over no step blockage and checks inventory; refuses a step blockage written after the first check once blue stops`; exit 1 |
| reader directory availability   | Named guard/constraint/call removed or disabled | `reads a present release CLI, models an older release, and refuses unavailable source`; exit 1                                                                                                                     |
| reader dangling path            | Named guard/constraint/call removed or disabled | `refuses nonregular, dangling and unreadable reader paths`; exit 1                                                                                                                                                 |
| reader directory readability    | Named guard/constraint/call removed or disabled | `reads a present release CLI, models an older release, and refuses unavailable source`; exit 1                                                                                                                     |
| stored fact inventory           | Named guard/constraint/call removed or disabled | `counts every stored fact and distinguishes an older schema from an unavailable database`; exit 1                                                                                                                  |
| stored DB_PATH                  | Named guard/constraint/call removed or disabled | `counts every stored fact and distinguishes an older schema from an unavailable database`; exit 1                                                                                                                  |
| memory step project             | Named guard/constraint/call removed or disabled | `refuses cross-project steps, corrupted read facts and invalid transfer destinations`; exit 1                                                                                                                      |
| memory leaf ownership           | Named guard/constraint/call removed or disabled | `refuses missing steps, malformed timestamps and parent owners; refuses duplicate transfers atomically and reads parent-owned corruption loudly`; exit 1                                                           |
| memory timestamp                | Named guard/constraint/call removed or disabled | `refuses missing steps, malformed timestamps and parent owners`; exit 1                                                                                                                                            |
| memory read owner               | Named guard/constraint/call removed or disabled | `refuses missing steps, malformed timestamps and parent owners`; exit 1                                                                                                                                            |
| memory read step                | Named guard/constraint/call removed or disabled | `refuses cross-project steps, corrupted read facts and invalid transfer destinations`; exit 1                                                                                                                      |
| memory set owner                | Named guard/constraint/call removed or disabled | `refuses cross-project steps, corrupted read facts and invalid transfer destinations`; exit 1                                                                                                                      |
| memory set step                 | Named guard/constraint/call removed or disabled | `refuses missing steps, malformed timestamps and parent owners`; exit 1                                                                                                                                            |
| memory transfer owner           | Named guard/constraint/call removed or disabled | `refuses cross-project steps, corrupted read facts and invalid transfer destinations`; exit 1                                                                                                                      |
| memory transfer step            | Named guard/constraint/call removed or disabled | `refuses cross-project steps, corrupted read facts and invalid transfer destinations`; exit 1                                                                                                                      |
| memory duplicate transfer       | Named guard/constraint/call removed or disabled | `refuses duplicate transfers atomically and reads parent-owned corruption loudly`; exit 1                                                                                                                          |
| repository read timestamp call  | Named guard/constraint/call removed or disabled | `refuses fractional writes and malformed stored timestamp reads`; exit 1                                                                                                                                           |
| repository write timestamp call | Named guard/constraint/call removed or disabled | `refuses fractional writes and malformed stored timestamp reads`; exit 1                                                                                                                                           |

This committed checkpoint implements persistence and rollback only. Journaled commands, retained direct-blockage reads, structural stale replay, document/saved-plan versions, schedule neutrality, UI and the complete-feature gate remain pending. WBS010.4.13.3 also includes work beyond this bounded change.

### Follow-up: node-reading negatives and schedule seam (2026-10-13)

- Task 1.4: the live `WorkItemService.tree` negative now injects an unknown progress owner and an unknown project step through the progress port. Replacing either corresponding `projectNodeReadings` guard with `if (false)` independently made the named test fail: the tree promise resolved instead of rejecting (exit 1, one failed test in each run). The known-parent compatibility test remains in the SQLite mounted controller for both isolated and shared reads; neither parent facts nor the row fold were changed.
- A typed dependency with an absent owner now has a `resolveDependencyGraph` negative. Replacing its `leavesUnder` missing-owner throw with `return []` made the named test fail (exit 1): it received the later `node endpoint ... not a leaf` error instead of the missing-work-item refusal. The live tree negative also exercises an absent typed endpoint. Existing tests and adjacent proofs cover absent legacy endpoints, duplicate graph identities, and absent predecessor/successor graph endpoints; no new validator was added for those cases.
- Task 1.3 remains open. A two-leaf typed FS fixture projects a direct blockage on the predecessor and `blocked_by_proxy` on the successor, then compares `canonicalScheduleInput` strings and the serialized _full_ Fast schedules before and after projection: 1 passed, 4 assertions. This proves the current projection seam. The live tree still supplies `blocked: []`, and `scheduleInput` has no blockage-store port; a stored-fact test and a watched production mutation that filters blocked nodes require command/read wiring. This test does not claim those proofs.
- PR #400 Twilight failure named unindexed `store-memory/src/step-blockage-fixture.test.ts`. The memory source `module-index` now lists that test and its fixture. The pinned `pins exact pre-index tuples and passes observe lint from external trust` test passed (1 test, 60 assertions) with `TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-step-next-sol/node_modules`; `check-indexes working . HEAD` exited 0 across the working tree, checking for additional omissions.
- Focused core suites: `bun test` for node readings, dependency graph and work-item resource passed after the fixture correction (140 tests, 305 assertions). `wbs-core:typecheck` passed both Nx tasks with no cache hits. The first typecheck correctly failed TS2322 for the missing test-fixture `statedAt`, which was fixed before the passing rerun. Changed TypeScript ESLint and `git diff --check` passed. OpenSpec CLI `openspec` is absent in this clone and `node_modules/.bin`, so strict validation is unverified here. The full h2puni gate and GitHub CI are coordinated outside this isolated slice.

### Review correction: exclusive recovery-file creation

- Review reproduced `save → remove → save same path → restore` silently replacing the only recovery copy with an empty capture. The new CLI regression first failed because repeated save exited 0.
- `save` now writes with filesystem exclusive creation (`wx`). An existing destination fails with `EEXIST` without changing its bytes. The CLI test removes the stored facts, attempts the repeated save, compares the exact original file bytes, and restores all original identity, blocked-time and audit columns.
- Focused green: **1 passed, 0 failed, 8 assertions**. Replacing `wx` with `w` independently made the same production CLI regression fail on repeated-save exit 0; the original source was restored in `finally`. The adjacent `Proof:` and [fault receipt](evidence/persistence/recovery-file-exclusive.txt) record that observation; the persistence inventory now contains **47 watched faults**.
- Fresh broader persistence/backend caller rerun: **123 passed, 0 failed, 731 assertions** (70.99s). Backend Nx typecheck: **2 tasks passed, 0 cache hits** (17.6s). Changed-TypeScript ESLint and strict OpenSpec validation passed.
- Fresh full swap/Docker rerun (`--timeout=30000`): **216 passed, 0 failed, 606 assertions** (157.25s). Prettier check passed; exact-SHA heavy gate remains reserved for the complete feature.

### Review correction: independent CLI negative paths

- Missing database, unreadable database and directory-as-database cases now each use a fresh, distinct save destination, assert SQLite's `unable to open database file` refusal and assert no output file was created. Invalid-verb, absent-file and malformed-file cases also use distinct paths and assert their own usage, `ENOENT` or JSON parse refusal, so `EEXIST` cannot satisfy them.
- The focused CLI case passed, **1 passed, 0 failed, 19 assertions**. Making the unreadable database fixture readable independently made the CLI negative fail on exit 0, proving exclusive creation no longer masks the permission check. The source was restored in `finally`; the adjacent `Proof:` and [receipt](evidence/persistence/unreadable-database-independent.txt) record the fault. The inventory now contains **48 watched faults**.
- Scoped recovery CLI and database-factory suites: **22 passed, 0 failed, 96 assertions** (6.04s). Changed-test ESLint, strict OpenSpec validation and diff whitespace check passed. Production code is unchanged in this correction; deployment suites and typechecks were not rerun (fresh results remain recorded for the immediately preceding implementation commit).

### Review correction: current-schema migration expectations (2026-10-13)

- PR #400 exact `4f7a037d2927582baa2bd17012c72ac8253369e2` reproduced the CI failures in `migrate-down.db.test.ts`, `space.db.test.ts` and `organization-bridge.db.test.ts`: each received the real `20261013140000_add_step_node_blockages` rollback entry omitted from its expected list (3 failed tests).
- Updated all 56 current-schema list entries across 28 SQLite test files, two newest-migration assertions and three rollback table filters. Ascending ledgers append the migration; descending rollback lists reverse it first. The blockage migration test's historical estimate-unit baseline remains explicit.
- The initial affected-suite run passed 497 tests and failed four: calendar-marker, organization-records and optimizer rollback filters still expected the removed `step_blockage` table; the existing two-process browser lifecycle test hit sandbox `EPERM` on child stdin. The three corrected schema-filter tests passed (3 tests, 40 assertions). The unchanged browser subprocess test passed outside the sandbox (1 test, 8 assertions); no skip or test workaround was added.
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.spec.json`, `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint` (no cache hit), changed-file Prettier check and `git diff --check` passed. Strict OpenSpec validation passed through the installed `/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`.
- Final full affected-suite rerun outside the sandbox: `bun test --preload ./tools/test/scratch/preload.ts <all 28 changed SQLite test files> --timeout=30000` passed **501 tests, 0 failures, 1539 assertions** (103.06s).
- Full host gate and GitHub CI remain with the root agent for the reviewed exact SHA. No push performed from this isolated repair checkout.

### CI repair: historical rollback baseline and recovery CLI inputs (2026-10-14)

- Exact original PR #400 head `604d0e255650ff86b5725a55b412438085fc7cf5` reproduced eight damaged-journal migration failures and the undeclared blockage recovery CLI read. `rollbackTo` commits each migration separately; the newer blockage migration was legitimately reversed before the estimate-unit migration refused. The damaged-journal cases now establish the estimate-unit historical baseline before seeding and snapshotting. Their exact columns, steps, estimates, journal and full migration-ledger comparison remains intact.
- SQLite `test` and `test:api` explicitly declare the recovery CLI they spawn. Actual Nx `createTaskHasher().hashTask()` probes ignored a CLI-only edit without these inputs and changed both hashes with them. The complete Nx project dependency edge set exactly equals the original head; this repair adds no dependency edges. No global acyclicity claim is made.
- Watched negatives: removing the damaged-journal SQL CASE guard failed all eight direct-down cases on the missing refusal. Injecting a persisted `optimistic=241` estimate after failed rollback failed all eight exact-state comparisons against 240. Each injected change was restored in a `finally` block. Adjacent `Proof:` comments and the [receipt](evidence/ci-repair.txt) record these observations.
- Green commands: `bun test --preload ./tools/test/scratch/preload.ts` over `step-estimate-unit-migration.db.test.ts`, `step-blockage-migration.db.test.ts`, `step-blockage-rollback.db.test.ts` and `migrate-down.db.test.ts` with `--timeout=30000`: **50 passed, 0 failed, 295 assertions**. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/workspace-targets.test.ts --timeout=30000`: **22 passed, 0 failed, 80 assertions**. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p wbs-store-sqlite,tool-devsync --skip-nx-cache --parallel=2`: **4 tasks passed, caching disabled**.
- Strict OpenSpec validation used the installed `@fission-ai/openspec@1.12.0` CLI with `validate add-step-node-blocking --strict --json`: valid, no issues. The first complete `tool-devsync:test` run failed under the sandbox (**510 passed, 61 failed**) on Git object writes and local server binds (`EROFS`/`EPERM`); the rerun outside the sandbox is still running at this checkpoint and its complete result remains unverified (`/tmp/puni-pr400-devsync-unsandboxed.log`). The exact changed checks passed independently as recorded above. The plain `.txt` fault receipt has no Prettier parser and is outside the format hook's file glob.
- Changed-file Prettier, ESLint and diff whitespace checks passed. `bunx lefthook run pre-commit` passed lint, format, plaintext-secrets and private-nesting. The Tool Wiki hook reported `inactive` / `certified:false` because no external activation root is provisioned; migration hooks and doc-caps skipped because no matching files changed.
- The exact-SHA h2puni gate and GitHub CI remain coordinated by the root agent after independent review. No push was performed from this isolated repair checkout.

### Stacked live-read checkpoint: task 1.3 (2026-10-13)

- This work starts from PR #400 head `4f7a037d2927582baa2bd17012c72ac8253369e2` on a separate local branch. PR #400 itself remains unchanged. The required `StepBlockageStore` now reaches SQLite and memory sources, transactional composition, the work-item module, isolated tree reads and both shared snapshot constructors. The live tree projects sparse direct timestamps and exact `BlockageRoot` causes on leaves; parent fields remain absent. Older HTTP responses may omit the new fields.
- Mounted `OrganizationHarness.openComposed()` tests insert a fact directly into SQLite and read the production work-item route in isolated and shared modes. They assert direct timestamp, downstream exact root, unchanged row status, clearing, parent omission, done precedence and a running-node barrier. The prior mounted historical parent-owned progress tests remain green. No public blockage command or structural writer is exposed in this checkpoint.
- The mounted Fast test spies on the actual production `fastScheduler.read` call. With a nonempty scheduled slice, it compares `canonicalScheduleInput` of that exact request, `JSON.stringify(serializeSchedule(returned.fast))` of the complete returned Fast schedule, and the displayed row schedules, dates and slices for baseline → blocked → cleared. Both isolated and shared cases pass. Task 1.3 is checked on this evidence.
- R5 watched faults, each restored after its targeted test failed (exit 1): isolated fact read replaced with `[]` → isolated direct timestamp/root test failed; shared captured fact forwarding replaced with `[]` → shared test failed; shared live snapshot capture replaced with `[]` → shared test failed; cause forwarding replaced with `{}` → exact-root test failed; blocked owners filtered from the isolated canonical Fast input → isolated Fast comparison failed; all displayed slices omitted only when a fact exists → Fast comparison failed in both modes. Removing memory `replaceWith` fact copy or owner-removal cascade each failed the named project-seeded memory transaction test. Adjacent `Proof:` comments record these faults. The other shared aggregate snapshot constructor is wired and typechecked, but replacing only its fact capture with `[]` did **not** fail the mounted work-item route test; dedicated aggregate-path proof remains open.
- Fresh scoped tests: work-item controller, memory source, conformance inventory and work-item module, **63 passed, 0 failed, 405 assertions**. Focused memory and SQLite blockage conformance cases, **2 passed, 0 failed, 32 assertions**. Full memory/SQLite offered-case certification, **2 passed, 0 failed, 2819 assertions**. A first scoped run failed the conformance inventory because its independent expected list lacked the new case; after adding the case, that test and the full scoped rerun passed.
- The five touched product projects plus conformance passed fresh Nx typechecks. A combined Nx typecheck/lint invocation returned failure for four lint tasks without ESLint diagnostics while the sandbox denied Nx worker sockets; direct `bunx eslint` on all 47 changed TypeScript files then passed (exit 0). `bunx prettier --check` and `git diff --check` are checked after the final edits. Strict OpenSpec CLI validation is unavailable: `openspec` is absent from PATH and `node_modules/.bin`. The canonical host-wide h2puni gate, CI, migration lint, browser and full-repo checks are not run on this local stacked checkpoint; the root agent coordinates exact-SHA review and gate after this commit.

### Astra review corrections to the stacked live read (2026-10-13)

- The aggregate shared snapshot constructor now has a dedicated real SQLite test. It inserts an `a2` fact and calls `createLivePlanStore(...).readAggregate('ada', scopedAccess)`, asserting the exact fact on `a2`'s entry and an empty list on `a1`. The focused test passed (1 test, 2 assertions). Replacing **only** the aggregate constructor's fact capture with `[]` made that named test fail (exit 1); the source was restored, and the `Proof:` comment is adjacent. This closes the previously noted aggregate-path proof gap.
- The mounted task 1.3 fixture now creates an estimated successor and a typed `strip.dev → successor.dev` FS dependency. It requires more than one displayed slice and checks the successor's `blocked_by_proxy` reading while still comparing the actual canonical Fast request, full returned schedule and displayed schedules byte-for-byte through baseline → blocked → cleared. Both isolated and shared cases passed (2 tests, 14 assertions). Re-injecting blocked-owner filtering before the isolated canonical input failed one named Fast test (exit 1); dropping all displayed slices only in the blocked state failed both mode cases (exit 1). Both mutations were restored.
- Fresh full touched suites after the correction: work-item mounted controller plus SQLite chain snapshots, **73 passed, 0 failed, 314 assertions**. Nx typecheck for `wbs-store-sqlite` and `wbs-be-01` passed with their dependency task; changed-file ESLint and Prettier check passed. Strict OpenSpec validation remains unavailable in this clone, and host gate/CI remain deferred to exact-SHA review.

### CI repair: historical read baselines and conformance inventory (2026-10-14)

- Exact PR #408 head `b9321dd967e7f65ddcee0ca77a7927b74025cba4` and its PR #411 descendant `580bf5cd9ad87ed205fdda3b1a718006d1d2566b` both reproduced three historical payload comparisons and the closed case-manifest inventory failure. Live leaf reads now expose `blockages` and `blockageCauses`, which the historical oracle predates; the case manifest already contains the implemented blockage family. The affected tests, production tree projection and case manifest are byte-identical between these two heads. The repair is placed on the earliest affected PR #408. Production behavior and the captured historical JSON remain unchanged.
- The two identity differentials lift only the new wire fields after explicitly asserting empty direct facts, exact empty causes for every project step, and absence of both keys on parent rows. Every remaining historical field, schedule, date and slice is still compared whole. The conformance inventory now includes `blockages` and pins its existing `blockages.set:read-remove` case ID.
- Watched production mutations: projecting a phantom direct fact, replacing per-step causes with `{}`, and exposing leaf metadata on parents each failed four identity tests. Removing the production blockage family failed the closed inventory; replacing its case ID failed the new exact-case assertion. All faults were restored in `finally` blocks; adjacent `Proof:` comments and the [receipt](evidence/ci-read-baselines.txt) record the failures.
- `bun test --preload ./tools/test/scratch/preload.ts ./apps/wbs/be-01/src/service/capacity-migration-identity.db.test.ts ./apps/wbs/be-01/src/service/priority-band-identity.db.test.ts --timeout=30000`: **9 passed, 0 failed, 18724 assertions**, after the final proof comments. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-conformance:test --skip-nx-cache`: **35 passed, 0 failed, 67 assertions**. Original red counts were **6 passed, 3 failed** and **34 passed, 1 failed**, respectively.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p wbs-be-01,wbs-conformance --skip-nx-cache --parallel=2`: **5 tasks passed, caching disabled**. Strict `add-step-node-blocking` OpenSpec validation through installed `@fission-ai/openspec@1.12.0` passed with no issues.
- Separate Twilight investigation: both unchanged authority concurrency tests passed locally (**2 tests, 126 assertions**). A temporary 400 ms pause while the creator held the initialization lock reproduced the fixed bootstrap race's exact `AuthorityContentionError` after 50 attempts. The default contender budget includes 49 sleeps of 5 ms, and the test fixtures require successful serializable outcomes without allowing budget exhaustion. The supplied #411 and #421 logs show this same refusal, but do not measure the lock duration; CI load is an inference. Authority source, tests and retry budgets are unchanged. This deterministic workspace repair does not claim the Twilight contention issue is fixed.
- Full host gate, full backend suite, complete Twilight suite, build and GitHub CI remain with the coordinator after independent review. No push is performed from this repair checkout.

### Transactional blockage command plumbing checkpoint (2026-10-13)

- Review follow-up: the SQLite admitted-scope test now transfers a committed fact between two owners with `moveAll`, checks both retained revisions (source 2, destination 1), the transferred timestamp, the committed fact and destination deletion cascade. Injecting a skipped `moveAll` refresh made `keeps blockage writes and refreshed owner revisions transactional` fail at the source revision assertion (expected 2, received 1); restored. The focused test passed after restoration. OpenSpec CLI remains unavailable in this isolated checkout.
- Stacked from PR #408 exact `5dac87bf2d549c18a595f7e6d013d4a27386d23f` in an isolated branch. `WorkingPlan.blockages` now binds reads and writes to the admitted source and project; successful writes refresh retained owner rows for future journal revisions. No public `setStepBlocked` command is exposed; task 3.1 remains open.
- `bun test libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts`: 19 pass. `bun test libs/wbs/adapters/store-memory/src/memory-source.test.ts libs/wbs/adapters/store-sqlite/src/source.test.ts`: 20 pass. These cover same-batch write/read, failed mutation preserving facts, foreign-project and closed borrowed-port refusal, commit/rollback, SQLite revision and owner deletion cascade.
- R5 watched faults: skipping `WorkingPlan.blockages.set` refresh made `keeps blockage calls inside the project and batch lifetime and refreshes successful writes` fail, expected revision 1, received 0. Removing the owner guard let a foreign write succeed; replacing either project-read guard with a lifetime-only guard let its foreign read succeed. Returning the raw store is also caught by the borrowed-after-close assertion. Omitting memory blockage commit copy made `commits and rolls back project-seeded blockage facts and cascades removed owners` fail, expected stored fact, received `[]`. Committing a refused memory batch made that test fail, expected `[]`, received the fact. Forcing SQLite UOW to commit a refused batch made `keeps blockage writes and refreshed owner revisions transactional` fail, expected `[]`, received the fact. Each injected fault was restored.
- Scoped TypeScript builds for core, memory and SQLite passed. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run {wbs-core,wbs-store-memory,wbs-store-sqlite}:lint` passed as three separate project-target calls. Direct ESLint also passed for the four changed TypeScript files; its early uncached project-graph warning is superseded by the Nx lint runs. Final focused Bun tests: 39 pass, 0 fail, 300 assertions. Prettier and `git diff --check` passed. Lefthook pre-commit, prepare-commit-msg and commit-msg passed after installing hooks in this isolated clone; tool-wiki reported inactive because its external activation root is not provisioned. `openspec` CLI was absent from the installed dependencies; strict OpenSpec validation is unverified.

### Conditional replay and journal compatibility checkpoint (2026-10-13)

- Stacked on PR #411 exact `819e897d6fc2c99b44ae276994732993da338237` in a new isolated checkout. This slice adds `replace_blockage` as an internal conditional compensating command, with exact owner/step/expected fact and nullable replacement. Replay keeps the original blocked time while the repository stamps audit on the replay write. `setStepBlocked` and structural command fields remain absent; tasks 3.1–3.4 remain open.
- Recursive `readCommand`, `touchedBy`, `referencesOf` and `subjectOf` include the new variant. The candidate image advertises its replay vocabulary through a CLI; an independent readonly SQLite probe scans both `payload.forward` and `inverse` through nested batches. Swap checks it before migration and after outgoing stop, including when `step_blockage` is empty. Older images with no CLI advertise no new replay command. Journal history is never removed by the fact rollback CLI; the runbook names compatible-image or normal-retention recovery.
- Final scoped tests: `bun test libs/wbs/application/core/src/service/compensating.test.ts apps/wbs/be-01/src/service/undo.db.test.ts` passed **109 tests, 0 failures, 389 assertions**. `bun test tools/tool-remote-scripts/src/lib/docker.test.ts tools/tool-remote-scripts/src/swap.test.ts` passed **219 tests, 0 failures, 619 assertions**. The candidate CLI printed `["replace_blockage"]`.
- R5 watched faults: bypassing exact-fact comparison made the undo of a fact changed by another SQLite process return `ok: true` despite an unchanged owner revision, instead of `stale_undo`; bypassing owner or step replay guards made their missing-reference cases return `ok: true`. Skipping recursive decoder traversal admitted an unknown nested command; bypassing blockage field validation admitted an undefined expected time. Omitting inverse inventory changed the expected count from 2 to 1; omitting the swap vocabulary let empty-fact/nonempty-history deployment reach migration. Bypassing candidate CLI file validation admitted a directory, and bypassing inventory kind validation admitted an unknown persisted command. Each fault was restored, with adjacent `Proof:` comments at the failing assertions.
- `bunx tsc --build --force` over core, be-01 library/spec and remote-scripts library/spec configurations passed. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run {wbs-core,wbs-be-01,tool-remote-scripts}:lint` passed as three calls (the core target used an exact output cache hit). Prettier and `git diff --check` passed. The first TypeScript command used nonexistent `tsconfig.app.json` paths and failed with TS6053; the corrected five-config build passed. Strict OpenSpec validation remains unverified because `openspec` is absent from this checkout's installed tool binaries. The host gate and CI are deferred to exact-SHA review.

### Replay probe review coverage (2026-10-13)

- Added nonprivileged production-command negatives for unreadable replay source, unreadable CLI and unreadable SQLite database, plus a real database without `command_journal`. Permission proofs refuse a root runner, matching the migration CLI pattern. The empty journal control exits zero before database permissions are denied.
- Added an after-stop swap regression with inventories read by the production SQLite command: the first is empty, the second counts two nested forward/inverse `replace_blockage` commands, and both fact inventories stay empty. Migration and outgoing stop occur, then replay compatibility refuses before the planned commit phase.
- Watched faults, each restored: dropping source readability/search checks returned 0 instead of 74; replacing CLI execution with an empty answer returned 0; accepting an absent journal returned 0; overriding denied database permissions returned 0; skipping the after-stop vocabulary check reached commit and the routing-write refusal. Each named test exited 1, with adjacent `Proof:` comments.
- Focused replay command: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-remote-scripts/src/lib/docker.test.ts tools/tool-remote-scripts/src/swap.test.ts --test-name-pattern replay --timeout=10000`: 6 passed, 0 failed, 30 assertions. Remote-scripts spec TypeScript build and changed-file ESLint passed. Strict OpenSpec validation passed through the installed `/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`; the raw cache entry failed because its `commander` dependency was unavailable.
- The canonical host gate and GitHub CI remain with the root agent for the reviewed exact SHA. No push performed from this checkout.

### First-child structural closure checkpoint (2026-10-14)

- Isolated clone `/tmp/puni-step-first-child-sol` starts at PR #416 exact `8d8187a9e31bbda64a89031e3abc4132da1f60c7`. Task 3.0.2 closes first-child create/undo/redo only. Public `setStepBlocked`, move/delete/duplicate handling and document transfer remain pending.
- First-child create captures and conditionally clears parent blockage while the owner is still a leaf, inserts the child, then writes each child fact with its original blocked time. Journal forward clears the parent before `restore_subtree` and sets the child afterward; inverse clears the child before `delete_subtree` and restores the parent afterward. These are existing nested `replace_blockage` commands, so the recursive replay compatibility inventory already covers them without another journal vocabulary.
- Red: the new memory exact-preservation test failed with `step blockage owner is not a leaf`; the mounted create test refused instead of returning 200. Green covers exact owner/step/time, multiple step facts, absent parent fact, retained progress and one undo/redo action. Mounted stale undo and redo change the second fact through direct SQL without changing revisions; the first fact is cleared before refusal, and the complete tree/progress/blockage/event snapshots are restored. The stale journal entry follows existing discard policy.
- The mounted insert-fault test installs a persistent SQLite trigger that raises only after the parent fact has disappeared. It asserts 500 and exact prior work-item, progress, blockage, journal, event-log and event-sequencer rows, including revisions and audit columns. The first temporary-trigger fixture was ineffective because the admitted transaction uses another SQLite connection; the final persistent trigger runs on that connection. An initial raw database-serialization comparison was replaced with exact domain-table rows because unrelated authentication writes legitimately change the database file.
- R5 watched mutations, restored after each failure: removing the parent-clear refusal guard made `reports a refused parent blockage clear before inserting a first child` receive the later parent-ownership error; removing the child-write refusal guard made `reports a refused first-child blockage write` resolve. Skipping live child writes, omitting undo parent restoration, and omitting redo child restoration each failed both exact-preservation cases. Bypassing exact-fact comparison made both mounted stale cases return 200 instead of 409. Committing a refused UOW made both stale cases lose the first cleared fact and fail the table snapshot. Committing the exception path after the injected insert fault left the parent fact absent and failed the rollback case. Every targeted mutation run exited 1; adjacent `Proof:` comments identify the observed tests. Local transcripts are `/tmp/first-child-proof-{clear-refusal,write-refusal,hand-down,undo-restore,redo-restore,exact-fact,stale-rollback,rollback}.log`.
- Focused full suites: `bun test libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts apps/wbs/be-01/src/service/undo.db.test.ts libs/wbs/application/core/src/service/compensating.test.ts` passed 266 tests, 0 failures, 877 assertions before the final stronger two-fact stale fixture. The final rerun with the stronger two-fact stale fixture also passed 266 tests, 0 failures, 877 assertions.
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.lib.json apps/wbs/be-01/tsconfig.spec.json` passed. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint` and the corresponding `wbs-be-01:lint` returned nonzero without ESLint diagnostics; project lint is unverified. Direct ESLint on the three changed TypeScript files initially found test-only assertion typing issues; after correction it passed. A simultaneous direct lint run also observed a temporary mutation; final validation uses restored source. The later typecheck caught missing narrowing after the child-ID assertion; adding an explicit missing-child throw fixes that test fixture.
- Strict change validation passed through `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate add-step-node-blocking --strict --json` (one valid change, zero issues). Plain `openspec` is absent from PATH. `bunx lefthook install` installed this clone's hooks. The canonical host gate, full repository checks, browser checks, CI and publication remain with the root agent after exact-SHA review; no push is performed here.

- Final restored-source checks after fixture narrowing: focused first-child tests passed **7 tests, 0 failures, 35 assertions**; the scoped three-config TypeScript build and direct changed-file ESLint passed (exit 0). Prettier and `git diff --check` passed.

## Task 3.0.3 — unrelated-work move closure (2026-10-14)

- Isolated clone `/tmp/wbs-step-move-sol` starts at PR #418 exact `41b4dc3dfe15b4e6f48dc42cda65f42d80f25c6b`. This slice closes move, undo/redo and duplicate non-inheritance regression only. Public setter, work-item deletion, project-step deletion, transfer and UI remain pending. No schema, migration or `SubtreeCopy` fields changed. Dependencies are borrowed through a local ignored symlink to the previous slice's installation; the canonical gate must install frozen dependencies independently.
- A true reparent into a current leaf captures destination progress/blockage, clears readiness/hold, progress and exact blockage before the store move, and preserves incoming facts. A last-child departure hands up direct blockage per step only when every former leaf holds that fact; the timestamp is the maximum original time without a zero seed, including negative times and retained done facts. Progress is never handed up. Same-parent reorder and historical progress on an existing parent remain intact.
- Forward and inverse journals use existing nested command batches. The inverse clears old-parent handed facts while it is a leaf, moves back, then restores destination progress/blockage/readiness. Exact blockage identity and time survive both directions; progress restoration uses the established `set_progress` replay timestamp semantics. Both relevant parent identities enter `touched`. Replay refuses any residual progress or blockage on a current leaf before it becomes a parent, including facts on another step with revisions unchanged.
- Red transcripts: `/tmp/move-red-memory.log` observed missing destination clearing and absent unanimous hand-up (2 failures); `/tmp/move-red-sqlite.log` observed stale progress accepted as 200 in undo/redo and stale other-step blockage reaching ownership errors as 500 (four intended failures). Its fifth failure came from attempting to seed a fact on a parent; the SQLite ownership trigger correctly rejected that fixture. The corrected later-step replay negative changes the destination's second recorded fact after undo, so redo clears earlier progress/first blockage before refusing the second exact comparison.
- Memory tests cover pre-store-move visibility, destination done/incoming in-progress with and without blockage, exact undo/redo, retained done facts, latest negative timestamp, incomplete agreement, existing parent history, same-parent reorder, refused live clear/hand-up, and blocked leaf/descendant duplicate non-inheritance. Transactional memory runner tests cover full rollback after a later command refusal and rollback of the earlier handed-up clear before residual-progress undo refusal. Mounted SQLite covers exact facts/progress through one undo/redo, per-step agreement over two former leaves, residual progress and other-step blockage in both directions with unchanged revisions, changed expected timestamps, later exact-comparison refusal, and an injected `parent_id` write failure after destination clears. Snapshots compare complete domain tables, audit/revisions and event sequence; command journal is included for the exception case. Stale journal repair follows the existing discard policy and is excluded from refusal snapshots.
- R5 watched faults were restored after each run. Removing either replay guard failed both mounted directions: progress returned 200; blockage returned 500. Removing the live-clear refusal changed the error to a later ownership failure; removing hand-up refusal made the call resolve. Skipping destination clears, skipping hand-up, accepting any former leaf's fact, or seeding timestamp maximum with zero each failed its memory assertion. Omitting inverse restoration or forward replay clearing failed mounted exact preservation. Bypassing exact comparison failed timestamp/later-step refusals. Committing a refused memory transaction failed both runner snapshots; committing a refused SQLite transaction failed stale/later-step snapshots; committing the SQLite exception path failed the parent-id fault snapshot. Injecting copies of direct facts into duplicate failed the original-only fact assertion. All **15 fault runs exited 1**. Adjacent `Proof:` comments identify observed boundaries. Transcripts: `/tmp/move-proof-{progress-guard,blockage-guard,clear-refusal,hand-refusal,destination-clear,hand-up,agreement,negative-max,undo-restore,redo-clear,exact-fact,memory-rollback,sqlite-refusal-rollback,sqlite-exception-rollback,duplicate-copy}.log`.
- Validation commands are the five-file focused Bun suites (resource, mounted controller, SQLite undo, compensating commands and transactional memory plan commands), the three-config scoped TypeScript build, both touched-project Nx lint targets with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, changed-file Prettier, strict change validation and `git diff --check`. Initial backend/direct lint found an unnecessarily certain fixture decoding assertion; the corrected optional boundary shape keeps the missing-ID refusal meaningful.
- The canonical host gate, full repository checks, browser checks, exact-SHA CI, migration lint and publication remain with the root agent after Astra review. No push or integration is performed by this worker.

- Final restored-source command `bun test ./libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts ./apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts ./apps/wbs/be-01/src/service/undo.db.test.ts ./libs/wbs/application/core/src/service/compensating.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts` passed **321 tests, 0 failures, 1131 assertions** (`/tmp/move-focused-restored.log`).
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.lib.json apps/wbs/be-01/tsconfig.spec.json` passed, exit 0 (`/tmp/move-tsc-restored.log`). `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint` and `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint` both passed, exit 0 (`/tmp/move-lint-{core,be}-final.log`). Changed-file direct ESLint also passed after fixture correction. Strict change validation via `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate add-step-node-blocking --strict --json` passed one change with zero issues; plain `openspec` remains absent from PATH. Changed-file Prettier and `git diff --check` passed.

### Astra correction — exact historical progress allowance

- Astra's review of `061b089136ad06003817437fa5ec2204b2686c05` found that a parent holding historical `done` progress at stated time 123 could lose its last child successfully, but immediate undo refused despite no intervening write. Red memory and mounted SQLite regressions reproduced the refusal; decoder/touched tests also failed before implementation (`/tmp/move-history-red.log`, 6 failures).
- The inverse internal `move` now carries optional `expectedProgress`, captured before the last-child departure. Replay compares the complete current destination leaf progress set by owner/step/state/stated time without depending on order. Absence explicitly requires an empty set for legacy journals. Exact historical rows stay in place through undo/redo, including all stored/audit columns; they are never cleared or restated. Added, missing or changed facts refuse even with unchanged owner revisions. Blockage refusal remains unconditional. This snapshot is comparison metadata, not a new public command or schema.
- `readCommand` validates a present array, exact destination ownership, project-step identity shape, stored state, safe-integer time and unique steps. `referencesOf` includes the snapshot steps for scope checks. `touchedBy` and recursive `expectedProgressOwnersOf` retain only captured historical owners through both replay directions. A generic union of all old expected owners was considered and rejected in favor of this move-specific tracking. Production replay/history callers were read before the change; neighboring parent edits, repeated undo/redo and unrelated-owner exclusion are covered without changing other command owner sets.
- New memory/mounted cases cover immediate undo/redo and second undo, state/time/extra-step/missing-fact refusal, complete snapshot rollback through the transactional memory runner, order-independent two-step comparison, legacy absent allowance, malformed persisted snapshot refusal, foreign-step scoped refusal, retained parent revision after redo, unrelated owner exclusion, and neighboring parent edit rebasing. All existing no-history stale tests remain in the focused run.
- Eight watched fault runs each exited 1 and were restored before validation: bypassing snapshot equality made four mounted state/time/extra/missing cases return 200 and four transactional memory cases apply instead of refuse; dropping direction snapshot owners let the second undo ignore a changed parent revision; omitting inverse capture refused immediate historical undo; bypassing array validation replaced the named trusted-history failure with a raw iteration error; accepting duplicate steps returned modeled 409 rather than trusted-state 500; bypassing fact-field validation returned modeled 409/404 rather than 500; omitting snapshot scope references returned 409 rather than 404 for a foreign step. Adjacent `Proof:` comments name each observed boundary. Transcripts are `/tmp/move-history-proof-{equality,memory-equality,owner-flip,capture,array-shape,duplicate-step,references,fact-fields}.log`.
- **Compatibility blocker found at the first corrected candidate (closed for Compose below):** the optional move snapshot was persisted safety metadata absent from the older-binary inventory. Review established that an older binary could ignore the guard, so this became required implementation work. The subsequent correction below adds enforced capability detection at both enabled Compose swap phases. Kubernetes remains an explicit pre-cutover obligation.

- The five-file focused command passed **345 tests, 0 failures, 1250 assertions** (`/tmp/move-history-full.log`). Scoped three-config TypeScript passed. Backend Nx lint passed. Core Nx lint initially returned nonzero without diagnostics; direct changed-file ESLint exposed unsafe accesses after `Array.isArray` narrowed to `any[]`. Binding the validated array as `readonly unknown[]` before per-fact narrowing fixed the boundary without casts. Restored-source direct changed-file ESLint and core Nx lint then passed, exit 0 (`/tmp/move-history-eslint-final.log`, `/tmp/move-history-lint-core-final.log`); decoder tests passed 3/3 after this typing fix. Backend lint evidence is `/tmp/move-history-lint-be.log`. Strict OpenSpec validation passed one change with zero issues.
- Final restored-source rerun after decoder typing correction also passed **345 tests, 0 failures, 1250 assertions** (`/tmp/move-history-full-final.log`); the scoped three-config TypeScript command passed independently with exit 0 (`/tmp/move-history-tsc-restored.log`). Changed-file Prettier check, strict OpenSpec and `git diff --check` passed. No push, full host gate, browser run, integration or exact-SHA CI was performed by this worker.

### Astra corrections — pre-batch destination guard and Compose capability enforcement

- Review of `1a5f2e0d15946851ae327a9bbf1829ec0dd84799` reproduced a second data-loss path: after undo restored destination Dev, direct SQL changed its state/time without an owner revision; redo's unconditional `clear_progress` deleted it before `applyMove` could observe the fact. `/tmp/move-redo-red.log` watched the new state/time/missing-fact mounted cases return 200 and the precondition decoder drop the new map (4 failures). A separate independent inventory probe returned `[]` for guarded move history. `/tmp/move-inventory-red.log` watched missing marker inventories fail their capability assertions.
- A move clearing destination progress now records destination owners in optional `Preconditions.moveProgress`. Replay validates/scopes complete owner-bound sets and compares them before any batch step. Successful flip captures the actual restored timestamps, preserving established `set_progress` restamping. Neighboring replay refreshes only owners that pass the existing revision-equality rebase condition; mismatches keep stale snapshots and refuse. Collected command batches retain the destination owners. The inverse move's exact historical-parent `expectedProgress` allowance remains independent and unchanged.
- Added mounted and transactional memory known-step state/time/removal negatives, collected-batch refusal, malformed persisted metadata, scoped steps and owners with empty snapshots, valid neighboring progress undo/redo with new timestamps, and mismatched-revision stale-snapshot retention. Full snapshots prove tree/facts/events remain unchanged; modeled stale journal discard follows existing policy. The parser shares the owner/step/state/time/unique-step boundary with historical snapshots and explicitly validates nonempty owner keys and map shape.
- The candidate CLI advertises `['replace_blockage','move_progress_v1']` through a separate capability constant; decoder discriminators remain unchanged and reject the feature token as a command. The independent inline SQL probe reads payload, inverse and preconditions, recurses nested batches, detects own `move.expectedProgress` and `Preconditions.moveProgress` properties including empty arrays/maps, and requires `move_progress_v1` once per journal row. Existing replacement-command counts are unchanged. Missing/unreadable database/source checks remain active. Both enabled Compose phases reject empty or prior `['replace_blockage']` image capability sets with only guarded move history and no blockage facts/commands; the matching-token control succeeds. The post-stop tests execute the actual SQLite probe before/after insertion and verify the outgoing writer stopped and candidate never committed. Pre-migration refusal stops green and leaves blue running; its existing abort phase marker rewinds to the previous committed state, which is not a new release commit.
- Nineteen watched faults each exited 1, restored after each run: bypass pre-batch equality in SQLite/memory; drop flip snapshots; omit conditional rebase refresh; bypass rebase revision equality; drop collected owners; omit scoped metadata steps/owners; bypass metadata map/empty-owner validation or guarded snapshot destination validation; omit move/precondition marker detection; omit inverse/nested traversal; bypass independent preconditions object validation; omit the CLI capability; bypass move-token membership only before migration or only after stop. Adjacent `Proof:` comments identify observed boundaries. Transcripts: `/tmp/move-safety-proof-{prebatch,memory-prebatch,flip,rebase-refresh,rebase-revision,collected,metadata-scope,metadata-owner-scope,metadata-map,metadata-owner,snapshot-destination,move-marker,precondition-marker,inverse-inventory,nested-inventory,preconditions-shape,candidate-capability,swap-first,swap-second}.log`.
- **Kubernetes scope:** repository cutover notes and F11 tasks identify Kubernetes WBS delivery as prepared and not yet applied to staging/prod; Compose is the enabled release path. This slice does not implement a Kubernetes replay guard. The active design and `docs/infra/cutover-plan.md` / F11.1 now require independent replay inventory against incoming/previous image digest capabilities after writer stop and before capture/migrate, plus rollback checking before rollout/writer reopening, refusal retaining fence/lease, and watched nested-marker omission proofs before guarded-history import or first rollout. Existing migration-capability capture/restore does not satisfy that prerequisite.

- **Release-history boundary:** drafts `061b089` and `1a5f2e0` were never pushed or deployed. The released base did not clear destination progress during moves, so no production progress-clearing journal requires a fabricated snapshot upgrade. Absent metadata keeps legacy-optional read semantics; the correction does not invent post-undo timestamps for older draft histories. The parent agent confirmed this release-history assumption before the corrected commit.
- Final restored candidate checks: the five-file focused Bun command passed **362 tests, 0 failures, 1353 assertions** (`/tmp/move-safety-candidate.log`). Full remote command `bun test --preload ./tools/test/scratch/preload.ts --timeout=10000 ./tools/tool-remote-scripts/src/lib/docker.test.ts ./tools/tool-remote-scripts/src/swap.test.ts` passed **233 tests, 0 failures, 678 assertions** (`/tmp/move-safety-remote.log`), including existing absence/unreadability cases and the production backend config boot probes. `bunx tsc --build --force libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.lib.json apps/wbs/be-01/tsconfig.spec.json tools/tool-remote-scripts/tsconfig.json` passed independently, exit 0 (`/tmp/move-safety-candidate-tsc.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint`, `wbs-be-01:lint` and `tool-remote-scripts:lint` each passed, exit 0 (`/tmp/move-safety-lint-{core,be,remote}.log`). Initial direct changed-file ESLint exposed a test array-index narrowing, an untyped `Object.fromEntries` tuple return, and import order; `.at(0)`, an explicit typed tuple return and sorted imports fixed them before the project lint runs. Prettier, strict OpenSpec for both `add-step-node-blocking` and `k3s-wbs-delivery`, and `git diff --check` passed. No push, integration, canonical host gate, browser run or exact-SHA CI was performed by this worker; those remain with the parent agent after review. Kubernetes replay protection remains unimplemented and is a documented cutover prerequisite.

### Astra correction — prevent snapshot laundering during neighboring replay

- Review of `ed7b88cf62d20fb8bb144e911cd0ecb322fedc24` found that owner revision eligibility alone allowed a neighboring rename to replace the whole move snapshot with current facts. Mounted reproduction: done Dev → rename → move → undo move → SQL change Dev state/time without revision → undo/redo rename → redo move returned 200 and deleted progress. `/tmp/move-rebase-red.log` reproduces that rename case and five mixed QA state/time/removal/addition/nested-batch cases against the reviewed source; all six failed. Transactional memory rename and progress cases also failed against the reviewed source (`/tmp/move-rebase-memory-red.log`, two failures). The memory arrangement uses a step already present in the project's step inventory; an initial unregistered-step arrangement was corrected before counting the red proof.
- The implementation captures guarded neighbor owner sets before replay. `progressKeysOf` inventories exact owner/step pairs of the actual selected command only, recursively through batches and explicit structural `progress`, `removedProgress` and `setProgress` rows. It grants no permission to all steps on an owner. Rebase preserves the existing revision condition, compares complete before/recorded sets outside those write pairs, and retains the full stale snapshot on any mismatch. Only a matching chain merges recorded unwritten facts with actual post-replay facts inside the write pairs. Thus rename cannot accept Dev changes, and a Dev replay cannot accept changed, added or missing QA. Valid Dev timestamp chains and untouched QA remain supported; inverse historical-parent allowances and Compose capability fields are unchanged.
- The first full-before-set comparison refused the legitimate progress undo/redo chain because the counterpart's undo removed Dev before its redo. That approach was replaced with the reviewed exact-pair exclusion and selective merge. Mixed QA tests additionally assert the entire stored move snapshot stays unchanged, preventing another later guard from hiding a laundering failure. A valid Dev/QA case checks every stored QA column through Dev replay. Existing revision-mismatch and valid-chain regressions remain active.
- Seven watched faults each exited 1 and were restored: expanding exact replay pairs to every captured/recorded owner fact failed mounted and memory cases; bypassing outside-pair equality changed stale QA snapshots; including unwritten post-replay rows duplicated QA and refused the valid Dev/QA chain; omitting structural removed-progress, delete progress or nested-batch key attribution failed the production planner tests. Adjacent `Proof:` comments identify those boundaries. Transcripts: `/tmp/move-rebase-proof-{whole-owner,memory-whole-owner,outside-check,selective-merge,structural-keys,delete-keys,nested-keys}.log`.

- Final restored correction checks: the five-file focused command listed above passed **372 tests, 0 failures, 1440 assertions** (`/tmp/move-rebase-full.log`). `bunx tsc --build --force libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.lib.json apps/wbs/be-01/tsconfig.spec.json` passed, exit 0 (`/tmp/move-rebase-tsc.log`). `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint` and `wbs-be-01:lint` both passed, exit 0 (`/tmp/move-rebase-lint-{core,be}.log`); direct changed-file ESLint also passed. Prettier on all nine changed files, strict `add-step-node-blocking` validation and `git diff --check` passed. Compose code and tests are unchanged by this correction; the preceding 233-test Compose result remains its last observed evidence. No remote-suite rerun, browser run, canonical host gate, exact-SHA CI, integration or push was performed for this correction. The parent owns Astra review, subsequent rebase onto corrected #418, and the canonical gate.

### Composition on corrected first-child base

- Rebased all four reviewed move commits from `41b4dc3dfe15b4e6f48dc42cda65f42d80f25c6b` onto corrected #418 exact `92810afc371f91de7cd0895c5644788ecb41bc72`. No conflicts. `git range-diff 41b4dc3d..review/move-before-composition 92810afc..af88d750` reports `=` for every move patch; all prior watched proofs and behavior changes are preserved. The base correction changes cache inputs and migration-test setup, not move behavior.
- Fresh five-file focused command passed **372 tests, 0 failures, 1440 assertions** (`/tmp/move-composition-focused.log`). Full two-file Compose command with scratch preload passed **233 tests, 0 failures, 678 assertions** (`/tmp/move-composition-remote.log`). Scoped core/backend/remote TypeScript build, Nx lint for `wbs-core`, `wbs-be-01` and `tool-remote-scripts`, Prettier over the move range, strict OpenSpec for both changed proposals and `git diff --check` passed. Commands match the preceding checkpoints; transcript prefixes are `/tmp/move-composition-{tsc,lint-core,lint-be,lint-remote,format,openspec,k3s-openspec}.log`.
- Additional corrected-base migration/devsync suites exposed an undeclared external test read: `tool-remote-scripts:test` did not list the replay-capability CLI. Added only `{workspaceRoot}/apps/wbs/be-01/src/step-blockage-replay-kinds-cli.ts` to that target's inputs. Watched omission fails the existing production cache-input inventory naming exactly that file (`/tmp/move-composition-input-red.log`); the adjacent `Proof:` comment records this boundary. Restored `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test ./libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts ./tools/tool-devsync/src/workspace-targets.test.ts` passed **36 tests, 0 failures, 111 assertions** (`/tmp/move-composition-base-tests.log`); `tool-devsync:lint` passed.
- Real Nx hash proof uses installed `createProjectGraphAsync`, `createTaskGraph`, `createTaskHasher` and `hashTask` in `tmp/move-capability-hash.ts`. Command: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CACHE_PROJECT_GRAPH=false bun tmp/move-capability-hash.ts`, fresh process per observation, spaced source writes, manifest unchanged within each pair. With the exact input omitted, a CLI comment edit leaves the task hash `1552038832080305340` unchanged. With the input declared, that same edit changes `1286086258489298364` to `15056339630164292620` (`/tmp/move-composition-hash.log`). Both injected files were restored in `finally`. An initial probe reused graph caching and observed no declared-input change; it was replaced with explicit graph-cache disabling and spaced writes before counting this proof.
- No push, canonical host gate, browser run or exact-SHA CI performed here. Astra composition review and the parent-owned canonical gate remain pending; Kubernetes replay protection remains the documented pre-cutover obligation.

## CI repair: independent move graph refusal (2026-10-14)

- Before repair: `bun test apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts --timeout=10000` reported 11 pass, 1 fail: the legacy move undo reached the newer owner revision guard (`“P” has changed since then.`).
- Retained that ordinary stale revision scenario and added the same graph scenario with only journal revision evidence refreshed to current owner revisions. Production guards are unchanged.
- Watched negative: temporarily bypassed the post-apply replay `findCycle` refusal; `--test-name-pattern 'a legacy cycle after refreshing'` reported 0 pass, 1 fail, HTTP 200 instead of 409. Restored production code.
- Repaired file: 13 pass, 0 fail. Full canonical gate deferred to the PM gate queue; no full Nx gates run here.

## Task 3.0.4 — work-item deletion closure (2026-10-14)

Base: exact #424 `e9d420272b8a0115c16b83f45c84b24ae82c68d4`. Isolated local clone `/tmp/puni-step-blockage-delete`, branch `step-blockage-delete`; the shared checkout and #424 tree were not edited. No push, UI, public setter, project-step deletion, deployment or live action.

### Behavior and regression evidence

- Initial RED: `bun test libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts --test-name-pattern 'deleting blocked'` — 0 pass, 4 fail. Memory deletion left an orphaned blockage and its next real plan read threw `step blockage has an invalid work-item reference`. SQLite's cascade would instead lose that fact.
- Final focused regression: `bun test libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts libs/wbs/application/core/src/service/compensating.test.ts libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts apps/wbs/be-01/src/service/undo.db.test.ts tools/tool-remote-scripts/src/swap.test.ts` — **534 pass, 0 fail, 1922 assertions, 46.28s**. Includes root/cascade exact restoration beneath done, per-step unanimous negative-time hand-up, partial disagreement, existing deletion progress fold, historical parent progress, promotion, stale parent progress with unchanged revisions, changed/missing/added subtree blockage, unrecorded parent blockage, collected mixed commands, parent revision after flip, neighboring rename/progress replay and first-child/move/duplicate regressions.
- Memory runner rollback: later command refusal restores rows/progress/blockage; injected blockage restore failure after owner insertion restores the same snapshot. Mounted SQLite rollback: later command refusal and a trigger failing the second blockage insert preserve rows, exact facts, progress, events and journal snapshot. Expected endpoint error logging accompanies the injected 500s. Stale 409 tests preserve tree/facts/events and observe the intended one-entry journal discard.
- Decoder regression after consolidating metadata references: `bun test libs/wbs/application/core/src/service/compensating.test.ts` — **27 pass, 0 fail, 75 assertions**. Present deletion metadata validates owner membership, safe times, unique pairs, parent binding and historical progress. Mounted malformed owner/time/duplicate cases additionally spy on the real `SubtreeRepository.insertSubtree`: refusal must happen before insertion is attempted, independently of transaction rollback.
- Replay compatibility: `bun test tools/tool-remote-scripts/src/lib/docker.test.ts --test-name-pattern 'step blockage replay compatibility probes'` — **13 pass, 0 fail, 40 assertions**. Independent SQLite inventory covers nested forward, inverse and both directions, empty metadata, once-per-journal-row counting and a following markerless row, plus the existing absent/unreadable database/source controls. Compose admission tests cover prior capability refusal before migration and after writer stop, and matching-capability admission.

### Watched production-path faults

Each injected fault below produced exit 1; the original production source was restored before GREEN runs. Local detailed logs are `/tmp/delete-proof-<fault>.log` (and `/tmp/delete-proofs-second.log` for the repeated boundary series).

| Fault                                                | Observed failing production-path test                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Drop deletion blockage capture                       | Root leaf delete/undo throws invalid work-item reference                          |
| Skip subtree blockage restoration                    | Mounted done-leaf undo loses exact blockage                                       |
| Accept any former leaf instead of every leaf         | Mounted cascade incorrectly hands partial QA blockage up                          |
| Seed maximum blocked time with zero                  | Mounted cascade gets 0 instead of -10                                             |
| Bypass complete pre-batch progress equality          | Peer parent progress undo returns 200 instead of 409                              |
| Skip complete parent blockage comparison             | Unrecorded parent blockage undo reaches insertion and returns 500 instead of 409  |
| Skip complete removed-owner blockage comparison      | Added subtree blockage redo returns 200 instead of 409                            |
| Skip historical parent statement restoration         | Mounted deletion undo loses original state/time                                   |
| Ignore conditional replacement refusal               | Refused deletion blockage hand-up resolves                                        |
| Ignore historical progress store refusal             | Refused historical progress restoration resolves                                  |
| Remove mandatory parent progress snapshot validation | Damaged deletion history undo returns 200 instead of 500                          |
| Omit safe-time validation                            | Mounted malformed time attempts subtree insertion                                 |
| Omit blockage owner membership                       | Mounted malformed owner attempts subtree insertion                                |
| Omit duplicate-pair refusal                          | Mounted duplicate metadata attempts subtree insertion                             |
| Omit restored-root parent binding                    | Decoder accepts wrong restoration parent                                          |
| Omit live-root parent binding                        | Persisted redo accepts a different removal parent, 200 instead of 500             |
| Omit deletion parent from flip owner tracking        | Peer parent revision after undo is accepted on redo, 200 instead of 409           |
| Drop collected progress snapshot owners              | Collected deletion undo returns 500 instead of 200                                |
| Drop progress snapshots at flip                      | Deletion redo returns 500 instead of 200                                          |
| Disable exact-pair neighbor progress refresh         | Legitimate neighboring progress undo/redo returns 409 instead of 200              |
| Omit metadata replay references                      | Empty parent and recorded step disappear from replay reference test               |
| Omit deletion compatibility marker                   | Nested empty forward/inverse inventories return `[]`                              |
| Omit per-row deletion marker reset                   | Following markerless row is counted as a second deletion entry                    |
| Bypass supported-capability comparison               | Before/after-stop deletion admission negatives no longer refuse `delete_state_v1` |

### Scoped checks and delivery boundary

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:fast -p wbs-core,wbs-be-01,tool-remote-scripts --output-style=static` — all three targets passed. Initial lint found unsafe inferred arrays and test typing; the boundary now narrows from `readonly unknown[]`, and those failures were corrected. An initial plain Nx invocation could not use sandbox sockets and did not prove task execution; explicit in-process Nx settings produced the recorded target output.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01,tool-remote-scripts --output-style=static` — all five tasks passed in the final rerun (0/5 cache hits, 37.4s). Initial codec-test fixture typing failure was corrected before this run.
- `bunx @fission-ai/openspec@1.12.0 validate add-step-node-blocking --strict --json` — valid, zero issues.
- Explicit Prettier check over all 15 changed files — all matched files use Prettier code style. `git diff --check` — exit 0.
- Final mounted deletion-only rerun after metadata-reference consolidation and generic guarded-progress refusal wording: `bun test apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts --test-name-pattern 'deletion blockage preservation'` — **26 pass, 0 fail, 124 assertions, 9.25s**.
- New image capability: `delete_state_v1`. Inventory detects own `deletionState` on `delete_subtree`/`restore_subtree` recursively in **both** stored journal directions, including empty metadata, once per journal row. Existing `moveProgress` snapshots cumulatively require `move_progress_v1`; fact rollback never erases history compatibility obligations.
- Kubernetes #428/#429 integration was coordinated with F11.1c's worker, who reported its independent inventory and all replay/cutover capability validators now recognize `delete_state_v1` with watched omission proofs. Those edits are on that worker's branch, not this one; parent integration must review both branches together. This branch alone claims Compose protection only.
- The full exact-SHA host gate, uncached full lint/build, CI secrets/migration lint, browser checks and live release actions were **not run in this bounded worker slice**. Parent integration owns `bin/h2puni-gate.sh <candidate-sha>` and Astra review before merge. The broader WBS feature remains unfinished; task 3.0.4 alone is checked off.

## CI repair: independent delete restore shape refusal (2026-10-14)

- Before repair: `bun test apps/wbs/be-01/src/controller/typed-dependency-lifecycle.controller.db.test.ts --timeout=10000` reported 11 pass, 1 fail: a peer typed relationship bumped the surviving parent revision, so undo refused with `“010” has changed since then.` before restore shape validation.
- Retained the stale surviving parent scenario and added the same relationship scenario with journal revision evidence refreshed to current owner revisions. The refreshed case asserts the exact peer relationship refusal and unchanged deleted child/relationship state.
- Watched negative: temporarily bypassed `applyRestore` typed shape validation; `--test-name-pattern 'pinned peer relationship after refreshing'` reported 0 pass, 1 fail, HTTP 500 instead of 409 (the later graph resolver detected a node endpoint on a parent). Restored production code.
- Repaired file: 13 pass, 0 fail. Canonical gate remains queued by the PM.

## Task 3.0.5 — project-step deletion closure (2026-10-14)

Base: reviewed/published #433 exact `11500ac09bedc3eaa722749d1417f4d1f80af4b0`. Isolated clone `/tmp/puni-step-delete-sol`, branch `feat/step-blockage-step-delete-sol`. Root checkout unchanged. No push, merge, full host gate or deployment in this worker slice.

### Behavior and focused evidence

Internal `StepHoldings`, `StepUsageRows`, `StepInUse` and `StepRemoval` require a separate `blockages` count. SQLite reads direct facts independent of progress precedence, counts again in the removal transaction, explicitly removes restrictive-FK facts on confirmed cascade and includes blockage-only owners in the revision union. The existing scoped replay reference check refuses removed steps before restoration. HTTP compatibility alone permits an absent older-server count; confirmation text renders unknown explicitly and includes reported zero.

- Initial RED: `bun test apps/wbs/be-01/src/service/step.service.db.test.ts --test-name-pattern 'blockage|blockages'` — four failures, initially reaching the restrictive foreign key instead of the intended refusal/cascade/late revision failure. Initial UI RED: `bunx vitest run src/components/wbs/steps-panel.test.tsx -t 'discloses direct blockage'` from fe-01 — failed because the confirmation omitted `2 step blockages`.
- `bun test libs/wbs/adapters/store-sqlite/src/step.db.test.ts libs/wbs/application/core/src/http/step.routes.test.ts apps/wbs/be-01/src/controller/step.controller.db.test.ts libs/wbs/domain/contracts/src/http/step-shapes.test.ts libs/wbs/domain/contracts/src/http/refusal.test.ts` — **105 pass, 0 fail, 540 assertions** (`/tmp/step-delete-focused-contracts.log`).
- `bun test apps/wbs/be-01/src/service/step.service.db.test.ts apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts` — **146 pass, 0 fail, 751 assertions** (`/tmp/step-delete-service-mounted.log`). Expected endpoint error logs accompany injected failures. This run includes direct/retained-done HTTP conflicts, cascade, late-arriving facts, blockage-only owner revision and unrelated-fact preservation, exact rollback, removed-step first-child replay refusal, and existing structural/attempt regressions.
- Two subsequently added mounted deletion-history undo/redo cases passed **2 tests, 0 failures, 9 assertions** with `bun test apps/wbs/be-01/src/controller/step-node-attempt.controller.db.test.ts --test-name-pattern 'refuses deletion .* history'`. Both deletion and first-child cases erase expected revision evidence and still refuse removed-step replay with scoped 404 before restoration.
- Final service and OpenAPI shape check: `bun test apps/wbs/be-01/src/service/step.service.db.test.ts libs/wbs/domain/contracts/src/http/step-shapes.test.ts` — **32 pass, 0 fail, 98 assertions** (`/tmp/step-delete-final-small.log`).
- `bunx vitest run src/components/wbs/steps-panel.test.tsx` from fe-01 — **50 pass, 0 fail** (`/tmp/step-delete-ui.log`). The mounted confirmation discloses two blockage facts; sentence tests include zero and omitted older-server fields. Vite emitted its existing native config loader warning.

### Watched R5 faults

Every mutation exited 1 and was restored before subsequent checks. Detailed logs: `/tmp/step-delete-proof-<fault>.log`.

| Injected fault                                                       | Observed production-path failure                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Omit blockage from shared holdings predicate (`holdings`)            | Blockage-only refusal deletes the step instead of refusing                         |
| Zero blockage counts (`fresh-count`)                                 | Late-arriving blockage request succeeds instead of returning `in_use`              |
| Omit explicit blockage deletion (`delete`)                           | Confirmed cascade fails with restrictive foreign key                               |
| Omit blockage owners from revision union (`owner-bump`)              | Confirmed cascade loses blockage-only owner revision/removal owner set             |
| Bypass missing-step replay reference validation (`replay-reference`) | First-child undo/redo returns 409 instead of the intended scoped 404 before replay |
| Bypass older-server unknown branch (`unknown`)                       | Omitted count renders an undefined count instead of the explicit unknown sentence  |

The late project-revision trigger additionally exercises the real transaction failure path after fact deletion, step deletion and owner bumps; service and mounted snapshots show facts, step, owner/project revisions, events and journal restored. No migration, document v8, saved schema6, scheduler16 or replay discriminator/capability changed.

### Scoped verification and delivery boundary

- Scoped TypeScript build: `bunx tsc --build --force libs/wbs/application/core/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json libs/wbs/adapters/store-memory/tsconfig.json apps/wbs/be-01/tsconfig.spec.json apps/wbs/fe-01/tsconfig.json` — passed, no diagnostics (`/tmp/step-delete-types.log`). Initial failures identified existing fixtures needing the new required internal count; those fixtures now report explicit zero.
- Strict OpenSpec: `bunx @fission-ai/openspec@1.12.0 validate add-step-node-blocking --strict --json` — valid, zero issues. `git diff --check` passed.
- Final seven-project lint: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:fast -p wbs-core,wbs-be-01,wbs-fe-01,wbs-store-sqlite,wbs-store-memory,wbs-domain,wbs-contracts --output-style=static` — all seven passed, 0/7 cache hits, 14.3s (`/tmp/step-delete-lint-final.log`). Initial run failed SQLite import ordering and backend test import/assertion lint; these were corrected before this successful rerun.
- Final repeated scoped TypeScript build with the command above passed, exit 0 and no diagnostics (`/tmp/step-delete-types-final.log`).
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — all registered specs/changes passed (`/tmp/step-delete-openspec-all.log`).
- Explicit Prettier check over all changed files and `git diff --check` passed before commit.
- Full canonical host gate, CI secrets/migration checks, full uncached lint/build and browser checks are **not run** in this bounded worker slice. Parent owns Astra review and `bin/h2puni-gate.sh <exact-candidate-sha>` before integration. The broader StepBlockage feature remains unfinished.

## Task 4.2.1 — saved-plan direct capture, 2026-10-14

Parent: `f069af34082983003b0714ca59fd8532a396d605` (#436). Isolated clone `/tmp/puni-step-saved-sol`, branch `step-saved-plan-sol`. Schema7 was free against that exact parent; only saved input moves from schema6 to schema7. Document v8, scheduler16, migration and public commands are unchanged. Task 4.2.1 is complete; broader read/document/UI tasks remain open.

Initial red: `bun test libs/wbs/domain/domain/src/saved-plan/step-blockages.test.ts` — 0 pass, 13 fail: schema6 instead of 7, omitted captured facts, absent pair diff and unrefused malformed facts. The implementation then passed those tests. Added split capture/read negatives, reference-shape negatives, hash changes, retained done facts, detached memory capture, SQLite capture before a concurrent clear, and complete Fast schedule neutrality.

### Watched fault proofs

Raw observed output lives in `evidence/saved-plan/`; `receipts.json` records each test filter and exit 1. Each corresponding validation has an adjacent `Proof:` comment. Every injection was restored before green checks.

| Injected fault                            | Observed production-path failure                               |
| ----------------------------------------- | -------------------------------------------------------------- |
| Remove required collection guard          | Missing current collection loses named refusal on capture/read |
| Remove reference-list guard               | Malformed owner list loses named stored-read refusal           |
| Remove owner row shape guard              | Malformed owner row loses named stored-read refusal            |
| Remove step row shape guard               | Malformed step row loses named stored-read refusal             |
| Remove fact shape/time guard              | Fractional timestamp is accepted on capture/read               |
| Remove owner membership guard             | Unknown owner is accepted on capture/read                      |
| Remove leaf ownership guard               | Parent owner is accepted on capture/read                       |
| Remove step membership guard              | Unknown step is accepted on capture/read                       |
| Remove unique-pair guard                  | Duplicate direct pair is accepted on capture/read              |
| Remove capture validation call            | Duplicate direct pair is accepted on capture                   |
| Remove stored-read validation call        | Duplicate direct pair is accepted on current read              |
| Omit empty schema6 upgrade collection     | Upgraded current input is missing required facts               |
| Replace memory capture read with empty    | Detached saved capture loses exact direct fact                 |
| Replace SQLite snapshot read with empty   | Capture before concurrent clear loses exact direct fact        |
| Replace detached fold with empty          | Saved input loses direct fact while schedule remains computed  |
| Filter blocked work out of schedule input | Schedule neutrality regression fails                           |

### Scoped verification

- Frozen offline Bun install passed with task temporary/cache directories: `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-saved-bun-cache bun install --frozen-lockfile --offline`.
- Focused domain/capture/application/integrity suites: `bun test libs/wbs/domain/domain/src/saved-plan libs/wbs/application/core/src/service/saved-plan-input.test.ts libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts libs/wbs/adapters/store-memory/src/memory-source.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts` — 165 passed, 0 failed, 756 expectations.
- Shared memory/SQLite capture conformance: `bun test libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts -t capture` — 12 passed, 136 filtered, 0 failed, 1672 expectations.
- Wider existing saved-plan service/store suites: `bun test apps/wbs/be-01/src/service/saved-plan*.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan*.test.ts` — 157 passed, three existing busy tests encountered sandbox `EPERM` at child stdin.flush. Those three were separately rerun with the sandbox pipe restriction lifted: busy suite 1 passed, 0 failed; concurrency suite 2 passed, 0 failed.
- Scoped TypeScript: `bunx tsc --build --force libs/wbs/adapters/store-memory/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.spec.json apps/wbs/fe-01/tsconfig.json` — exit 0, no diagnostics.
- Scoped lint: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:fast -p wbs-core,wbs-domain,wbs-store-memory,wbs-store-sqlite,wbs-conformance --output-style=static` — five projects passed, 0 cache hits. Initial direct ESLint lacked the Nx project graph and reported import sorting; corrected and rerun through Nx.
- Pinned OpenSpec 1.12.0 strict validation — valid, zero issues. A newer installed CLI reports existing long-requirement warnings under strict mode; the repository's pinned CLI is the contract used here.
- Full host gate, full uncached lint/build, CI secrets/migration lint and browser checks are not run in this bounded worker slice. Parent owns review and exact-SHA host gate before integration. No push, merge or live action was performed.

- Final five-project scoped lint repeated after test/docs cleanup: passed, 0 cache hits, 4.2s.
- Pinned OpenSpec 1.12.0 `validate --all --json`: 169 changes and 18 specs passed, zero failed.
- Final TypeScript repeat passed with no diagnostics after retained-done regression and fixture cleanup. Prettier check over every changed source/spec and the receipts JSON passed. The precommit worktree `git diff --check` passed but excluded then-untracked evidence logs; review of `560096ac56c2d325a0f094c35fe094aac7c7d7d3` with `git diff --check HEAD^ HEAD` found trailing whitespace in `fold.txt` and `upgrade.txt`.

### Publication correction after Astra review

Removed the two trailing spaces from diagnostic source excerpts in `evidence/saved-plan/fold.txt` and `upgrade.txt`; all fault output and exit receipts are retained. The specification and design now name stored-body normalization for comparison as the validation boundary. `SavedPlanService.read`/`readOfStored` deliberately return opaque exact bytes: raw reads verify body hashes and the schedule-input hash link but do not parse the input. Malformed direct facts are refused when capture validates them or comparison parses and normalizes the stored body.

Correction checks passed: focused `step-blockages.test.ts` (28 passed, 0 failed, 36 expectations), changed Markdown Prettier, pinned OpenSpec 1.12.0 strict validation (valid, zero issues), staged `git diff --check --cached`, and complete slice whitespace check from `f069af34082983003b0714ca59fd8532a396d605`. Final committed checks use `git diff --check HEAD^ HEAD` and `git diff --check f069af34082983003b0714ca59fd8532a396d605 HEAD`; the parent receives their observed exit status with the correction SHA. No production behavior changed; wider tests/type/lint and host gate were not repeated for this documentation/evidence correction.

## PR #439 hosted CI repair — 2026-10-14

Base: exact published parent `b4537c83e8f0767f14b6e9304b6475c63e7cc239`. Hosted CI run `38498885540` failed the workspace gate and Twilight policy job. The downloaded workspace artifact (`/tmp/puni-ci439-artifact/nx-gate.log`) reports two stale saved-body assertions, two `PlanInputReads` fixtures missing required `stepBlockages`, and the unindexed saved-plan test. The Twilight job (`/tmp/puni-pr439-twilight-job.log`) reports eight policy cases stopped by that same missing index membership.

The existing Task 4.2.1 contract writes schema7, supports input versions 1–7, and requires a direct-fact collection even when empty. The repair aligns the existing assertions and fixtures with that contract and registers `step-blockages.test.ts` in its owning module index. Production behavior and safety checks are unchanged; no new R5 fault proof is required.

### Reproduced failures

- `bun test libs/wbs/application/core/src/module/saved-plans/module.test.ts apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts libs/wbs/application/core/src/ports/store-boundaries.test.ts libs/wbs/application/core/src/service/shared-people.test.ts --timeout=10000` — **70 pass, 2 fail**: expected schema6/versions 1–6, received schema7/versions 1–7 (`/tmp/pr439-repair-red-tests.log`).
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json` — exit 2, exactly two TS2741 missing-collection fixture diagnostics (`/tmp/pr439-repair-red-types.log`).
- `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000` — **36 pass, 2 fail**: the production index checker and first pilot CLI case both report `unindexed candidate path` for `step-blockages.test.ts` (`/tmp/pr439-repair-red-wiki.log`). The README repair landed while the later cases were running; this local run reproduces the two initial failures, while the immutable hosted run records all eight policy failures.

### Repair verification

- Frozen dependency install: `BUN_TMPDIR=/tmp bun install --frozen-lockfile` — exit 0, 1573 installs checked across 1447 packages. The initial invocation without `BUN_TMPDIR` was refused by the sandbox's temporary-directory boundary; no dependency changes were made.
- Repeated four-file runtime command above — **72 pass, 0 fail, 234 expectations** (`/tmp/pr439-repair-green-tests.log`).
- `bun test libs/wbs/domain/domain/src/saved-plan libs/wbs/application/core/src/service/saved-plan-input.test.ts libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts libs/wbs/adapters/store-memory/src/memory-source.test.ts libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts --timeout=10000` — **165 pass, 0 fail, 756 expectations** (`/tmp/pr439-repair-capture.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01 --skip-nx-cache --output-style=static` — both projects and their module typechecks passed (`/tmp/pr439-repair-green-types.log`).
- Same Nx selection with `-t lint` — both uncached project lint targets passed (`/tmp/pr439-repair-lint.log`).
- Repeated production-index and Twilight pilot command above — **38 pass, 0 fail, 436 expectations** (`/tmp/pr439-repair-green-wiki.log`).
- Pinned OpenSpec strict validation: `bunx @fission-ai/openspec@1.12.0 validate add-step-node-blocking --strict --json` — valid, zero issues.
- Explicit Prettier check over the five repaired source/index files and `git diff --check` passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all` — exit 0 (`/tmp/pr439-repair-format.log`).
- Installed repository hooks with `nx run tool-git-hooks:install`; normal commit hooks passed staged lint/format, secrets, private nesting and agent trailers. The Tool Wiki hook explicitly reported inactive because no external activation root is provisioned; the production CLI regression suites above passed with their external trust fixtures.
- `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/pr439-bun-cache bunx @fission-ai/openspec@1.12.0 validate --all --json` — **187 passed, 0 failed**: 169 changes, 18 specs (`/tmp/pr439-repair-openspec.log`). The CLI reports version 1.12.0.

Full canonical host gate, full workspace build/tests, browser checks, CI secrets and migration lint are not run in this worker slice. The parent owns review and the exact-candidate host gate before integration. No push, merge or deployment was performed.

## Task 4.2.2: plan-document v9 direct transfer (2026-10-14)

Base: `b4537c83e8f0767f14b6e9304b6475c63e7cc239` (#439), isolated clone
`/tmp/puni-step-document-transfer-sol`. Allocation confirmed: plan-document8 → 9;
saved input7 and scheduler16 unchanged. No migration or replay capability change.
Import is another real blockage writer; drain incompatible binaries before enabling
it during shared-SQLite overlap. The parent release owns exact-SHA gate and CI.

TDD red receipts: v9 export expected9/received8; absent-current-facts expected
invalid_body/received unsupported_version; preparation expected facts/received
undefined and admitted unknown owners, steps, fractional/unsafe times and duplicate
pairs; both source contracts expected remapped exact facts/received[]. Derived-cause
omission test first failed because `blockageCauses` remained on the exported row.

Watched production faults, each restored before verification:

| Injected fault                                                           | Observed negative                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit root facts; retain row `blockages`; retain derived `blockageCauses` | Each corresponding v9 direct/cause export test failed, exit1.                                                                                                                                                    |
| Bypass trusted missing-leaf-map, step, parent or time refusal            | Each `v9 trusted export refuses …` resolved unexpectedly, exit1.                                                                                                                                                 |
| Bypass root legacy or row-alias legacy refusal                           | Nonempty v1–8 facts were accepted in the indexed-path tests, exit1.                                                                                                                                              |
| Bypass v9 required list or fact object checks                            | Missing/null collection or null entry escaped typed refusal and threw unexpectedly, exit1.                                                                                                                       |
| Bypass v9 owner/step/time type checks                                    | Malformed-facts tests admitted numeric IDs or fractional/unsafe timestamps, exit1.                                                                                                                               |
| Bypass prepared owner/leaf, step, safe time or duplicate check           | Each precise-path prepare-import negative admitted invalid facts, exit1.                                                                                                                                         |
| Bypass refused store outcome check                                       | `rolls back direct blockage import after refused` resolved and leaked the import, exit1.                                                                                                                         |
| Skip imported fact write, owner remap, step remap or exact timestamp     | Memory source remap/time tests failed on missing facts, invalid owners/steps or changed time, exit1. Initial red exercised both memory and SQLite.                                                               |
| Bind memory UoW directly to committed state                              | `rolls back direct blockage import after second-write` leaked project/directory state, exit1. A first injection hit a different clone seam and survived; the actual UoW seam was then injected and watched fail. |
| Replace SQLite exception rollback with COMMIT                            | Mounted second-insert failure left tables changed; whole-state equality failed, exit1.                                                                                                                           |
| Change Navigator pin7 → 9                                                | External v9 refusal had the wrong outcome/message, exit1.                                                                                                                                                        |
| Leave root facts required in Navigator's strict external schema          | Valid pinned-v7 output path failed before writing, exit1.                                                                                                                                                        |

Adjacent `Proof:` comments name the guards and observed tests. Mutation stdout is
in `/tmp/step-transfer-mutations{,-extra}.log` with individual fault logs beside it.
Mounted SQLite rollback compares every table, including projects, directory,
blockage facts, events and journal, to its pre-import state. Both source contracts
round-trip facts through a second import whose file IDs collide with existing
identities, preserve negative timestamps and retained done facts, and compare
schedule/progress projections before and after removing a fact on the same IDs.

Verification commands and results:

- Explicit-file focused Bun suite (resource/module, preparation, boundary fixtures,
  both source contracts, Navigator, mounted controller, organization DB, project
  controller, attempt DB and import shape): final receipt below.
- `NX_TUI=false NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-contracts,wbs-core,twilight-navigator,wbs-be-01 --parallel=1 --output-style=stream`: final receipt below.
- Same touched projects with `-t lint`: final receipt below. Direct ESLint exposed
  test-only unnecessary guards/chains/cast and Bun rejection-await typing hidden
  by Nx's default output; corrected, fresh core Nx lint passed.
- `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts /tmp/step-transfer-openapi.json`:
  exit0, generated current OpenAPI.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate add-step-node-blocking --strict --json`:
  exit0, valid1, failed0, no issues.
- Changed-file Prettier and `git diff --check`: final receipt below.

Two inherited schema7 fixture omissions were repaired with empty direct-fact
collections in `store-boundaries.test.ts` and `shared-people.test.ts` because the
exact base failed touched core typecheck on required `PlanInputReads.stepBlockages`.
One broad Bun directory filter accidentally collected compiled test copies in
`dist`; final commands use explicit source files. Expected error logs in mounted
negative tests are injected faults and malformed trusted-state refusals.

Skipped: full host gate, build, CI and release integration (parent PM/release scope;
this bounded candidate is committed locally only). No push, merge or deployment.

Final receipts: explicit-file focused suite **432 passed, 0 failed**, 13 files,
1852 assertions (67.34s). Touched four-project typecheck **passed all six tasks**
(48.1s). Touched four-project lint **passed**, with current input-matched cached
contracts/Navigator results and fresh core/be-01 runs (54.0s). Final self-review
added a malformed trusted map case: an injected empty array previously exported
silently, making `v9 trusted export refuses a malformed leaf blockage map` fail;
after the guard it passes. Final resource suite **48 passed, 0 failed**. The last
guard's focused core checks are recorded below.

Last-guard receipt: `NX_TUI=false NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --parallel=1 --output-style=stream`
passed both targets and module dependency. Changed-file Prettier check passed and
`git diff --check` exited0. Strict OpenSpec revalidation passed valid1/failed0.

### PR #443 restack onto repaired #439 — 2026-10-14

Replayed exact child `ac14ec27e9a0e5f940cfd31aa10cc682c8405555` from old
parent `b4537c83e8f0767f14b6e9304b6475c63e7cc239` onto repaired parent
`cfea15fd9155dff9485003a78700971ffba6c072` in isolated clone
`/tmp/puni-step-document-sol`. The sole conflict appended both verification
records. Removed duplicate `PlanInputReads.stepBlockages` fixture fields introduced
by Git's automatic merge: the repaired parent already supplies both fields.
Production behavior and safety guards retain the original child delta; no new R5
check or fault injection was introduced.

Fresh checks: explicit-file focused suite passed **362 tests, 0 failures, 1474
expectations**; memory and SQLite import-source contracts passed **70 tests, 0
failures, 370 expectations**. Strict pinned OpenSpec 1.12.0 validation passed with
zero issues. Changed-file Prettier and `git diff --check` passed. Logs are
`/tmp/step-document-restack-{tests,source-tests,openspec,format}.log`.

Fresh `NX_TUI=false NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many
-t lint,typecheck -p wbs-contracts,wbs-core,twilight-navigator,wbs-be-01
--parallel=1 --output-style=stream` passed all ten targets without cache hits
(`/tmp/step-document-restack-checks.log`).

Full canonical host gate, build, browser checks, CI secrets and migration lint
remain the parent integration scope. No push, merge or deployment was performed.

## Cumulative release integration — 2026-10-14

Integrated stabilization `8446c9c51e20c34695986f3095c58adbcb535685`, persistence
`40eaa8c4e5c9ed6b2723aca3e29d34a0819f538e`, tooling
`db192173d0908e61a30dd9c9da2ac87f25516574`, and frontend
`b81363638532ea4fc3212bbe76cc28ea68850c34` with merge commits, preserving ancestry.
Only text conflict: adjacent independent Proof comments in workspace-targets.test.ts;
all retained. Navigator source merged to external v7/v8 decoding into internal v9
with empty direct facts; external v9 remains refused. Updated this change's spec and
design to the reviewed tooling contract.

Fresh cumulative checks on pop-os, isolated clone
`/tmp/puni-release-candidate-integration-sol`; complete logs are in
`/tmp/puni-release-candidate-evidence/`:

- Frozen Bun install: exit0 with BUN_TMPDIR=/tmp.
- Navigator plan-reference plus workspace-targets: 48 pass, 0 fail.
- Replay capability, cutover replay/CLI and fleet CLI/apply: 96 pass, 0 fail.
- All forward migration.sql files through migration-lint.ts: exit0.
- OpenSpec 1.12.0 validate --all --json: 196 passed, 0 failed.
- Changed-file Prettier check and git diff --check: exit0.

R5 production-path negative: the combined workspace graph oracle failed naming
`wbs-be-01:test:host-restore` when its CLAUDECODE/AGENT environment was absent
(47 pass, 1 fail). Explicit zero values restored 48/48; adjacent Proof comment
records the observed fault. No new safety guard was added.

The initial sandboxed FE unit run had 924 pass and 5 fail, including subprocess
EPERM; it is not accepted as release validation. Broad tests/type/lint and focused
Gantt/organization checks are recorded separately once complete. The h2puni gate,
full browser suite, deployment and host rehearsal have not been run by this worker.

### Combined frontend export contract fixture — 2026-10-14

The broad cumulative FE run found two `wbs-api.test.ts` JSON download assertions
rejecting with `invalid_response`. Isolated reproduction: 63 pass, 2 fail.
The mocked export still advertised document v8 and omitted root `stepBlockages`,
while the reviewed export response contract requires v9 and that collection.
Updated only the fixture header, empty direct-fact collection and its description;
the legacy import helper still removes that field for its v3 input. The current
decoder and Navigator external v7/v8 support remain unchanged. Isolated rerun:
65 pass, 0 fail. Logs: `json-transfer-red.log` and `json-transfer-green.log` in
`/tmp/puni-release-candidate-evidence`. This corrects test state rather than adding
a new production safety check.

### Combined mounted unknown-version fixture — 2026-10-14

The broad backend run ended at 2412 pass, 3 skip and 1 fail. The sole failure,
`mounted unknown version precedes version-specific validation`, supplied v9,
which this change makes current; it correctly reached the malformed priority
field instead of returning `unsupported_version`. Changed only that test input
to unsupported v10. Production parsing remains unchanged. The broad FE UTC
run ended at 3985 pass and the two stale export fixtures corrected above; its
Auckland command was skipped by the UTC failure. The complete broad command
exited1; it is not a green final gate. Focused final checks are recorded in
`/tmp/puni-release-candidate-evidence/`.

## Compose stopped-writer barrier — 2026-10-14

Historical evidence for `83e0506`: Astra blocked this revision because an idle
container could retain its shared alias, mount-source overlap did not prove the
effective DB_PATH identity, and application boot preceded durable exposure. The
correction evidence below supersedes its safety conclusion.

Isolated clone `/tmp/puni-compose-barrier`, exact parent
`4bb78ec2674869c2bfd18114ef4f39e05d403863`, branch
`fix/compose-writer-barrier`. No root checkout, candidate branch, live database,
container, push, merge or deployment was changed by this worker.

The backend planner now requires preflight, exclusive durable stop intent, exact
outgoing/idle stop and inspection, complete writer-identity recheck, candidate
startup, fact/replay admission, backup/capture/migrate/health, admission recheck,
backfill, durable possible-exposure intent, alias/route/reload, and recorded commit.
Preflight includes local image pull, frozen validated environment/Compose files,
read-only existing SQLite integrity and nonempty-ledger proof, Caddy/exposure and
canonical writable mount inventory. Startup does not pull after the outage.

Backend interruption has no automatic down, snapshot restore or older-writer
restart. Original capture digest and identity are published before migration;
possible exposure is published before the first alias operation. Phase writes do
not erase those files. The attended read-only recovery CLI verifies stopped
writers and independently compares stored facts/replay capabilities with a pinned
previous digest. It grants no restart or marker deletion. The real SQLite test
keeps the migrated database on failure, runs the printed pinned exact-set recovery
command against disposable storage, compares restored tables/ledger, and retains
stop intent.

Fresh focused command:

```sh
bun test tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/swap-migration.db.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-remote-scripts/src/lib/reconcile.test.ts tools/tool-remote-scripts/src/lib/writer-barrier.test.ts tools/tool-remote-scripts/src/lib/step-code-backfill.test.ts apps/wbs/be-01/src/controller/internal.integration.test.ts --timeout=10000
```

Output: **192 pass, 0 fail, 612 expectations**, seven files. Final log:
`/tmp/compose-barrier-tests-final.log`.

Watched production-path R5 faults, each removed after observing exit1:

| Injected fault                                          | Observed negative                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Old start-first planner                                 | stopped-writer ordering: expected preflight index 0, received -1                |
| Omit stop persistence                                   | exact-ID stop fixture observes ENOENT; six executor negatives fail              |
| Omit stop inspection                                    | running, wrong-ID and missing-container startup negatives fail                  |
| Omit stopped-state validation                           | running/wrong-ID/paused/restarting/malformed-state negatives: six fail          |
| Omit ordinary retry refusal                             | second ordinary transition negative fails                                       |
| Omit exposure persistence                               | partial alias failure observes missing exposure bytes                           |
| Forget possible exposure                                | partial alias failure incorrectly stops candidate; two fail                     |
| Omit unmanaged writer refusal                           | directory, DB-file and ancestor writable mounts: three fail                     |
| Skip canonical path resolution                          | symlink-alias unmanaged writer negative fails                                   |
| Treat read-only mount as writable                       | unrelated reader/no-stop negative fails                                         |
| Omit mount metadata validation                          | missing Source/RW/Type: three fail                                              |
| Omit complete identity recheck                          | replaced backend during outage negative fails                                   |
| Omit migration identity persistence                     | planned migration cannot observe original capture identity; complete plan fails |
| Omit Compose config preflight                           | frozen-input/no-pull preparation negative fails                                 |
| Bypass read-only SQLite preflight                       | absent/corrupt/empty-ledger database negatives: three fail                      |
| Omit mounted DB_PATH guard                              | outside-mount path refusal fails                                                |
| Admit unsupported recovery replay                       | move_progress_v1 old-image recovery refusal fails                               |
| Route stopped transition through legacy automatic abort | real SQLite candidate table is reversed; retained recovery negative fails       |
| Omit committed barrier cleanup                          | complete plan still has retained stop intent; test fails                        |
| Grant a write transaction to internal forward           | forged setter/import/activation frame test observes write calls and fails       |
| Omit trusted state directory check                      | missing state root is incorrectly admitted; negative fails                      |

Adjacent `Proof:` comments record these observations. Logs are named
`/tmp/<fault-name>.log`; fresh restored green output is in the final test log.
The intent/commit file helper also uses the existing independently proven
exclusive, file-synced, directory-synced capture publisher. Malformed marker bytes
refuse without being interpreted as authority.

Scoped checks:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false bunx nx run-many -t lint,typecheck -p tool-remote-scripts,wbs-be-01 --parallel=1 --output-style=stream
bunx --package @fission-ai/openspec@1.12.0 openspec validate add-step-node-blocking --strict --json
```

Strict validation returned one valid change, zero issues. Initial scoped lint and
typecheck ran all five targets without cache hits successfully; the final rerun
and changed-file formatting are recorded below. The complete canonical h2puni
gate, full monorepo tests/build, Caddy Docker rehearsal, browser suite, CI secrets
and migration lint were not run by this worker. Astra review and integration
remain pending. SQLite StepBlockage activation belongs to the separate marker
slice; this change does not activate it or claim Kubernetes writer protection.

Final scoped rerun passed all five lint/typecheck targets for the two projects;
Nx reused two unchanged cached outputs, while the initial run was fully uncached.
Log: `/tmp/compose-barrier-checks-final.log`. Changed-file Prettier reported all
matched files formatted (`/tmp/compose-barrier-format-final.log`); strict OpenSpec
rerun reported zero issues (`/tmp/compose-barrier-openspec-final.log`).
`git diff --check` exited0. Astra review remains pending; these scoped checks are
not the canonical exact-SHA host gate.

## Compose boot barrier review corrections — 2026-10-14

Historical `bc40ee2` evidence: Astra subsequently reproduced a read-only WAL
directory failure and main-file-only identity accepting different sidecars. The
SQLite family correction below supersedes that revision’s safety conclusion.

Astra's three production-path counterexamples are corrected. Candidate preflight
validates the effective merged Compose config and exact canonical DB file before
stop intent. Outgoing and idle container Env DB_PATH resolves through the most
specific writable bind Destination; an incidental backup mount cannot establish
identity. A private resolved snapshot preserves literal environment dollars.
Startup forces recreation and suppresses dependencies, so a stopped idle
container cannot carry a previously granted alias into candidate boot.

After exact stopped-writer proof, independent digest-pinned, network-disabled,
read-only fact/replay one-offs admit the incoming image before boot. Possible
write exposure is persisted before invoking startup. Any startup or later failure
retains that boundary and offers no automatic restart, down migration or snapshot
restoration. The read-only recovery command grants no authority to restart or
reverse the schema. The runbook now states these limits explicitly.

Fresh scoped tests:

```sh
bun test tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/swap-migration.db.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-remote-scripts/src/lib/reconcile.test.ts tools/tool-remote-scripts/src/lib/writer-barrier.test.ts tools/tool-remote-scripts/src/lib/backend-config.test.ts tools/tool-remote-scripts/src/lib/step-code-backfill.test.ts apps/wbs/be-01/src/controller/internal.integration.test.ts --timeout=10000
```

Observed **220 pass, 0 fail, 903 expectations** across eight files; log
`/tmp/compose-boot-final-tests.log`.

Watched production mutations were restored after each observed failure:

| Removed protection                    | Observed failure / log                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Durable exposure before boot          | Six protected startup paths observed missing marker inside startup; `/tmp/omit-durable-boot-exposure.log`                     |
| Outgoing/idle exact database equality | Filename, alternate live mount and idle filename negatives failed; `/tmp/omit-outgoing-database-equality.log`                 |
| Candidate exact database equality     | Effective file bind override negative failed; `/tmp/omit-candidate-database-equality.log`                                     |
| Effective alias refusal               | Two shared-alias config negatives failed; `/tmp/omit-effective-alias-refusal.log`                                             |
| Effective ports/dependencies refusal  | Four exposed/dependent config negatives failed; `/tmp/omit-effective-port-dependency-refusal.log`                             |
| Most-specific bind resolution         | Two shadowed mount identity negatives failed; `/tmp/omit-most-specific-bind-order.log`                                        |
| Literal dollar preservation           | Snapshot environment negative failed; `/tmp/omit-literal-dollar-escape.log`                                                   |
| Pre-boot fact/replay admission        | Incoming unsupported replay history was admitted to startup; five tests failed; `/tmp/omit-preboot-fact-replay-admission.log` |
| Force recreation                      | Disposable Docker reused the exact stopped idle ID; `/tmp/backend-recreation-docker-red.log`                                  |
| No dependencies                       | Disposable Docker started an unrelated dependency; `/tmp/backend-no-deps-docker-red.log`                                      |

Adjacent `Proof:` comments identify these observations. The new explicit target
`tool-remote-scripts:test:backend-recreation` uses an immutable cached Alpine image,
a unique disposable Compose project/network and scratch bind. Docker socket
access required approved escalation; no approval was denied. Restored production
startup printed PASS for exact-ID recreation, shared alias absence, literal
environment and dependency absence (`/tmp/backend-recreation-docker-green.log`,
project `writer-proof-fe218e80`). Every green/red Docker run printed CLEAN and
verified no project containers or network remained. No production resource was
used. This Docker target is explicit and is not silently added to ordinary tests.

Final scoped checks and strict validation are recorded below. Independent Astra
review, SQLite activation integration and the canonical exact-SHA host gate remain
pending; this worker did not run full monorepo/build, CI secret or migration gates,
browser suites or a live production deployment.

Final uncached scoped `nx run-many -t lint,typecheck -p tool-remote-scripts,wbs-be-01
--parallel=1 --output-style=stream --skip-nx-cache` passed both projects and their
one dependent task (`/tmp/compose-boot-final-checks.log`). Changed-file Prettier
completed successfully (`/tmp/compose-boot-final-format.log`). Pinned OpenSpec
1.12.0 strict validation returned one valid change and zero issues
(`/tmp/compose-boot-final-openspec.log`). `git diff --check` exited0.

Fresh explicit Nx Docker target rerun also passed, with PASS and CLEAN for
`writer-proof-65092cf9`; log `/tmp/compose-boot-final-docker.log`. The target ran
uncached and verified zero remaining project containers or network.

## Compose SQLite family and read-only probe correction — 2026-10-14

Historical `6af0fc1` evidence: Astra subsequently reproduced unmanaged hardlink
writer admission and a supplied recovery basename alias bypassing retained WAL.
The physical identity/recovery-path correction below supersedes that revision’s
safety conclusion.

Astra reproduced ordinary SQLite readonly opening a clean WAL database under a
readonly directory failing with SQLITE_READONLY_DIRECTORY 1544 after writer
stop. The exact shipped `storedRelationshipTypesCommand` now runs against a
private writable scratch copy, invoked by production `checkBackendRecovery`.
Production remains mounted read-only. Every writer must already be proved stopped
before copying main plus retained WAL/journal; source SHM is omitted. SQLite
creates only scratch SHM. Optional sidecar absence is modeled ENOENT, while
unreadability fails. This is a coherent quiescent family copy, not immutable-mode
SQLite, which would ignore retained WAL.

The resolver now requires one writable directory bind for main/WAL/SHM/journal,
canonical directory plus basename identity, and matching existing sidecar
canonical paths. Main-file binds, sidecar shadows, renamed main-file aliases,
redirected sidecars and dangling WAL symlinks refuse. Outgoing file-bind/WAL
shadow executor negatives leave blue serving with no stop intent; candidate
WAL/SHM shadow preparation negatives also refuse before outage. This narrower
supported layout intentionally rejects equal main-file identities when complete
family identity cannot be established.

Fresh production-command proofs cover clean close with no sidecars, killed-writer
committed WAL with absent SHM, and retained WAL plus SHM. A readonly source fixture
(chmod 0555) inventories filenames and every byte before/after standalone exact
commands and production admission. Retained WAL's SS relationship is counted; no
source file changes. Required main-file absence and unreadability, and unreadable
WAL, fail visibly. The initial unwrapped production query observed errno1544;
log `/tmp/sqlite-readonly-production-red.log`. The dangling-link negative was
watched fail before the lstat distinction (`/tmp/sqlite-dangling-red.log`).

Watched restored-production faults:

| Removed protection                   | Observed negative                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot use in production admission | All three exact-command fixtures failed with readonly-directory errors or source SHM mutation; `/tmp/omit-quiescent-snapshot.log`                          |
| Complete family mount proof          | Nine resolver/executor/preparation negatives failed, including outgoing file bind and candidate WAL/SHM shadows; `/tmp/omit-sqlite-family-mount-proof.log` |
| Canonical family equality            | Three renamed-main/redirected-WAL negatives failed; `/tmp/omit-sqlite-family-canonical-proof.log`                                                          |
| Retained WAL copying                 | Both retained-WAL fixtures lost the stored relationship and failed; `/tmp/omit-retained-wal-copy.log`                                                      |

Adjacent Proof comments name the observed faults. Source changes preserve the
existing candidate recreation/no-dependencies flags and durable pre-boot exposure.
No Docker command or live resource was used for this followup: Docker startup
code is unchanged, and the previous disposable proof remains historical. Full
host gate, monorepo/build, CI secrets/migration lint and independent Astra
re-review remain pending. Scoped final results follow below.

Fresh final scoped test command includes the previous eight-file Compose suite
plus `tools/tool-remote-scripts/src/lib/sqlite-probe.test.ts`:
**237 pass, 0 fail, 923 expectations**, nine files
(`/tmp/sqlite-family-final-tests.log`). Initial scoped lint failed on new test
Database.exec deprecation and import order; these were corrected to Database.run
and sorted imports. The final uncached scoped lint/typecheck rerun and strict
validation results are recorded below.

Final uncached scoped Nx lint/typecheck for tool-remote-scripts and wbs-be-01,
including the dependent backend module target, passed
(`/tmp/sqlite-family-final-checks.log`). Changed-file Prettier check reported all
matched files formatted (`/tmp/sqlite-family-final-format-check.log`). Pinned
OpenSpec1.12.0 strict validation returned one valid change, zero issues
(`/tmp/sqlite-family-final-openspec.log`). `git diff --check` exited0. These are
scoped evidence, not the canonical host gate or approval to deploy.

## Compose physical identity and recovery-path correction — 2026-10-14

Historical `00aa40a5` evidence: Astra found its blanket unmanaged writable
directory refusal blocked shipped Caddy/registry volumes and logs. The complete
daemon-assisted audit below supersedes that admission policy.

Astra's hardlink counterexample is addressed at production writer inventory.
Canonical overlap still refuses unmanaged writers; a non-overlapping unmanaged
writable regular mount now requires device/inode comparison against the main DB
and each existing WAL/SHM/journal. Required metadata absence/unreadability and
nonregular family state refuse. Optional absent sidecar ENOENT is modeled.

The deliberate admission tradeoff is that unmanaged writable directories and
special files now refuse: canonical names cannot exclude their nested filesystem
aliases. This may require changing unrelated writable directory mounts to
read-only or removing them before a backend swap. Distinct writable regular files
with different physical identities remain admitted. Read-only mounts are
unaffected, and the executor never stops unrelated containers.

Recovery now resolves the supplied database path through the complete family
resolver and the fixed `/data` probe mapping before any Docker inventory or
vocabulary command. A real SQLite killed-writer fixture leaves SS in wbs.db-wal;
alias.db -> wbs.db refuses before probes with both a managed writer and no
containers. This protects the standalone attended CLI and pre-boot admission.

The runbook's early backfill, restore/capture and typed-dependency sections now
match the stopped-writer flow: no automatic candidate stop/down/snapshot restore
or older writer restart after boot exposure. Snapshot/capture integrity alone is
not authority to discard post-boot writes or reverse schema.

New production-path negatives were watched fail before implementation:
`/tmp/compose-physical-family-red.log` (hardlink, unresolved directory, managed and
no-container recovery aliases). Restored focused output:
`/tmp/compose-physical-final-focused.log`, **71 pass, 0 fail, 466 expectations**.

Watched guard omissions, restored after every nonzero test run:

| Omitted protection                    | Observed negative / log                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Device/inode comparison               | Main/WAL/SHM/journal hardlinks all admitted; four tests failed, `/tmp/omit-physical-database-identity.log`           |
| Unresolved writable directory refusal | Unmanaged directory admitted; one test failed, `/tmp/omit-unresolved-directory-refusal.log`                          |
| Required regular family metadata      | Directory admitted as trusted main DB; one test failed, `/tmp/omit-regular-family-metadata.log`                      |
| Supplied recovery family resolution   | Retained-WAL aliases admitted with managed/no containers; two tests failed, `/tmp/omit-recovery-family-identity.log` |

Adjacent Proof comments record these observations. Tests also break required path
metadata with absence/unreadability, assert no unrelated stop command, and prove
distinct writable regular-file admission. No live or disposable Docker command,
push, merge, deploy or host gate was run for this followup. Independent Astra
review and canonical exact-SHA gate remain pending. Final scoped evidence follows.

Fresh final nine-file scoped suite: **249 pass, 0 fail, 948 expectations**
(`/tmp/compose-physical-final-tests.log`). Uncached scoped
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false bunx nx run-many -t
lint,typecheck -p tool-remote-scripts,wbs-be-01 --parallel=1
--output-style=stream --skip-nx-cache` passed both projects and their one dependent
target (`/tmp/compose-physical-final-checks.log`). Changed-file Prettier reported
all matched files formatted (`/tmp/compose-physical-final-format.log`). Pinned
OpenSpec1.12.0 strict validation returned one valid change and zero issues
(`/tmp/compose-physical-final-openspec.log`). `git diff --check` exited0.

## Compose normal-topology bounded inode audits — 2026-10-14

The directory policy now proves exclusion rather than rejecting all writable
directories. Every non-overlapping unmanaged directory gets a complete recursive
inode audit through a disposable digest-pinned candidate helper. Its two absolute
bind sources are the inspected mount and canonical database-family directory;
using bind mounts avoids creating missing named volumes or copying into them.
Both are read-only, root filesystem is read-only, network is none, pull is never,
and UID0 has only DAC_READ_SEARCH after dropping other capabilities. Resource
bounds are 128MiB and 16 processes. The helper uses underlying dev+ino from both
binds in its own namespace, visits every nested device without a shortcut, and
accepts only regular files/directories. Symlinks/special files refuse.

A host realpath EACCES for Docker volume traversal is explicitly delegated to the
same complete audit. Other host lookup failures refuse. No unreadable path is
interpreted as empty or trusted by service name. Every existing main/WAL/SHM/
journal inode is compared; required family metadata must be regular and readable.
Audits are bounded by 100,000 entries, depth 64 and 15 seconds per mount. Any helper
failure, missing local image, timeout or malformed/incomplete/oversized receipt
refuses. Candidate image inspect is local and precedes helpers; execute already
pulls before stop, and recovery explicitly requires the candidate locally and
uses no-pull one-offs. Inventory/audits are repeated after managed writers stop.

Production-path tests drive inspectBackendWriters with the shipped Caddy
caddy_data/caddy_config/logs and registry_data shape. They inject host EACCES for
volume paths and exercise the readable same-device logs branch. The exact emitted
helper program runs as a local Bun child against temporary real trees; four clean
audits admit normal topology without stopping Caddy/registry. Nested hardlinks to
each family inode refuse in both volume and logs paths. A directory dev mismatch
fault proves nested-device traversal still finds its contained alias. Additional
negative dependencies cover absent helper, command failure, timeout, malformed
JSON/shape, incomplete/oversized receipts, unreadability, oversized/deep trees,
nonregular family and symbolic links. The initial unmodified production positive
was watched fail on host EACCES (`/tmp/compose-audit-initial-red.log`). Restored
audit-focused tests passed 22/0 (`/tmp/compose-audit-final-focused.log`).

Watched production omissions, each restored after nonzero test output:

| Removed or injected fault     | Observed test / log                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Audit inode equality          | Nested family hardlinks admitted; `/tmp/omit-audit-physical-equality.log`                                  |
| Complete receipt validation   | Malformed/incomplete/oversized output admitted; `/tmp/omit-audit-completion-proof.log`                     |
| Entry bound                   | Oversized tree admitted; `/tmp/omit-audit-entry-bound.log`                                                 |
| Depth bound                   | Deep tree admitted; `/tmp/omit-audit-depth-bound.log`                                                      |
| Deadline callback             | Timeout-specific negative failed; `/tmp/omit-audit-deadline.log`                                           |
| Different-device shortcut     | Nested-device hardlink missed; `/tmp/omit-nested-device-audit.log`                                         |
| EACCES delegation audit       | Volume aliases admitted and normal audit count incomplete; `/tmp/omit-unreadable-mount-audit.log`          |
| Readable directory audit      | Log-directory aliases admitted and normal audit count incomplete; `/tmp/omit-readable-directory-audit.log` |
| Symbolic/special-file refusal | Symlink alias admitted; `/tmp/omit-audit-symlink-refusal.log`                                              |
| Required family regularity    | Nonregular family admitted; `/tmp/omit-audit-family-metadata.log`                                          |

Adjacent Proof comments record these observations. Test subprocesses have an
independent bounded kill to avoid leaving a child when the production deadline is
intentionally broken. No live/disposable Docker or production container was
created, stopped or modified by this worker. The emitted script is tested, but
real daemon bind identities, DAC_READ_SEARCH availability, read-only runtime and
resource limits still require a disposable real-Docker rehearsal and Astra
review before integration. Full canonical host gate, monorepo/build, CI secrets
and migration lint remain unrun here. Fresh scoped results follow below.

Bounds fixtures shorten only the emitted test-child constants to one entry,
depth0 or10ms and suspend a dependency to exercise the deadline. Production
thresholds remain100,000 entries/depth64/15 seconds. The independent test-child
kill bounds intentionally broken deadline runs.

Fresh final ten-file scoped suite: **271 pass, 0 fail, 1332 expectations**
(`/tmp/compose-audit-final-tests.log`). Uncached scoped
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false bunx nx run-many -t
lint,typecheck -p tool-remote-scripts,wbs-be-01 --parallel=1
--output-style=stream --skip-nx-cache` passed both projects and their one dependent
target (`/tmp/compose-audit-final-checks.log`). Changed-file Prettier reported all
matched files formatted (`/tmp/compose-audit-final-format.log`). Pinned OpenSpec
1.12.0 strict validation returned one valid change, zero issues
(`/tmp/compose-audit-final-openspec.log`). `git diff --check` exited0. These scoped
results do not authorize integration/deployment before real-Docker rehearsal,
Astra review and the required exact-SHA gate.

## Actual container namespace repair prototype — 2026-10-14

Astra found that a fresh Source rebind cannot prove the identity held by a running container, and Docker top-level `RW=false` can conceal writable nested mounts. Disposable Docker evidence confirms both: `/tmp/puni-namespace-rehearsal-v2.log` and `/tmp/puni-nested-rehearsal-v4.log`. The earlier source-audit admission above is superseded and is not safe to integrate.

The isolated prototype audits actual proc-root inode identity and effective mountinfo, requires stable ID/PID/start/restart identity, enforces recursive RO on the fixed database bind, and bounds complete host operations and verified exact-CID cleanup. The source proc view is code-read-only under the approved immutable metadata program; it is not enforced source-RO. No write API is imported. Local fixture admission is not real default-cap target proc-access evidence; that feasibility experiment remains pending and blocks a mergeable claim.

Fresh `bun test tools/tool-remote-scripts/src/lib/mount-audit.test.ts tools/tool-remote-scripts/src/lib/docker-deadline.test.ts`: **35 passed, 0 failed, 359 assertions**. Real local scratch Docker-CLI stand-in subprocess is hard-killed on timeout. No live Docker service was changed by this worker.

Watched omission proofs restored after each run: actual file equality (`/tmp/omit-actual-namespace-exclusion.log`), trusting top-level RO (`/tmp/trust-top-readonly-metadata.log`), nested/hidden writable roots (`/tmp/omit-nested-writable-mounts.log`), mountinfo stability (`/tmp/omit-actual-namespace-stability.log`), exact PID reinspection (`/tmp/omit-id-pid-recheck.log`), recursive-RO flags (`/tmp/omit-recursive-ro-bind.log`), helper ownership (`/tmp/omit-helper-ownership.log`), managed mounted family identity (`/tmp/omit-managed-mounted-family.log`), real CLI abort signal (`/tmp/omit-cli-hard-abort.log`). Each corresponding production-path negative failed with its check omitted. Protocol faults also exercise absent/failing helper, malformed/incomplete receipt, unreadable metadata, stopped/host-PID targets, oversized/deep trees, stalled image/inspect/create/start/rm/cleanup inspection and forged helper cleanup.

Unverified: default-cap shipped Caddy/registry proc access with DAC_READ_SEARCH-only helper; actual candidate digest rehearsal; latest full scoped lint/typecheck/format/OpenSpec suite. No new commit, push, integration, live deploy or host gate is authorized by this prototype evidence.

### Definitive runtime blocker

`/tmp/puni-defaultcap-rehearsal-v2.log` proves the approved DAC_READ_SEARCH-only helper can read mountinfo but cannot `lstat` proc-root `/data` or `/var/lib/registry` for disposable default-cap shipped Caddy/registry targets: exit1, EACCES/statx errno-13. Target CapPrm/Eff/Bnd is `00000000a80425fb`; the earlier successful proc holders dropped target capabilities and were insufficient admission evidence. Fixtures and temporary files were removed successfully; no capability was broadened. **This prototype is not mergeable.** The release must exclude the Compose barrier and keep activation disabled until a corrected protocol receives production-command evidence and independent review. A possible in-target metadata-only exec audit requires a new exact tool/whole-tree/lifetime proof; host CLI cancellation does not alone kill a target exec process. Latest full scoped checks remain skipped because runtime admission is conclusively blocked. The isolated changes remain uncommitted atop d350a97.

## Initialized in-target namespace audit — 2026-10-14

This repair supersedes the blocked proc-root prototype above. The immutable, metadata-only program runs through exact-ID `docker exec` in the target's actual namespace, with its existing default capabilities. It validates mountinfo, main/WAL/SHM/journal device and inode identities, strict per-entry receipts, exact container identity before and after, and a private session whose scanner is reaped on success. EOF, cancellation and the independent remote timer kill the owned process group; bounded cleanup refuses any live or zombie residue. Host operations have a shared 45-second deadline, reserving 20 seconds for cleanup; remote execution is limited to 15 seconds, 100,000 entries, depth64, 32MiB stdout and 64KiB stderr.

Production prerequisites are explicit: initialized containers, private PID namespaces, unprivileged default capabilities, supported BusyBox tools and a quiescent filesystem. Applying `init: true` to existing Caddy/registry recreates ingress/registry and requires attended maintenance; existing backend preparation also requires attendance. This worker performed no live service changes. Metadata access is code-read-only, not source-filesystem-enforced RO. The contract excludes hostile receipt spoofing, transient topology/inode ABA and open-deleted SQLite aliases; all tasks must retain the Docker-created mount namespace. Activation remains disabled until prerequisites, independent review and the exact-SHA gate succeed. See ADR0054 and the deploy runbook.

Fresh final scoped command:

```sh
bun test tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-remote-scripts/src/swap-migration.db.test.ts tools/tool-remote-scripts/src/lib/docker.test.ts tools/tool-remote-scripts/src/lib/backend-config.test.ts tools/tool-remote-scripts/src/lib/writer-barrier.test.ts tools/tool-remote-scripts/src/lib/sqlite-probe.test.ts tools/tool-remote-scripts/src/lib/migration-capture-file.test.ts tools/tool-remote-scripts/src/lib/mount-audit.test.ts tools/tool-remote-scripts/src/lib/docker-deadline.test.ts tools/tool-remote-scripts/src/lib/docker-exec.test.ts tools/tool-remote-scripts/src/lib/mount-exec.test.ts tools/tool-remote-scripts/src/lib/mount-exec-program.test.ts tools/tool-compose/src/render.test.ts --timeout=30000
```

**420 passed, 0 failed, 1,427 assertions across 14 files** (`/tmp/exec-clean-scoped-tests.log`). Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false bunx nx run-many --targets=lint,typecheck --projects=tool-remote-scripts,tool-compose --skip-nx-cache --output-style=static` passed both projects (`/tmp/exec-clean-scoped-static.log`). Changed-file Prettier and `git diff --check` passed. Pinned `bunx --package @fission-ai/openspec@1.12.0 openspec validate add-step-node-blocking --strict --json` returned valid with zero issues (`/tmp/exec-final-openspec.log`).

R5: **31 watched unit omissions** failed their production-path negatives, with every mutation restored. Logs: `/tmp/puni-exec-r5-watch.log` (21), `/tmp/puni-exec-extra-r5-watch.log` (7), `/tmp/puni-exec-policy-r5-watch.log` (3). They cover family aliases, managed family identity, nested RW roots, mount/container/host-family stability, private sessions, init/capability prerequisites, image identity, strict framing/count/nonce/reap receipts, group cleanup, stat failures, missing/unreadable/nonregular files, entry/depth/output/stderr limits and exact CLI cancellation. Adjacent `Proof:` comments name the observed faults.

Disposable real Docker used only cached shipped-image digests, fresh `/tmp` fixtures, `--pull never --network none`, and exact-ID removal in finally. Final bundled production source on both default-cap init-backed Caddy/registry admitted normal roots and matching managed SQLite families; it refused retained replaced-Source hardlinks and mismatching managed families: **8 cases**, all fixture cleanup0 (`/tmp/puni-exact-exec-audit-proof-h2-final.log`). The nested-RW fixture showed top-level RO Docker metadata with an actual writable nested mount; final production admission refused its SQLite-family hardlink (`/tmp/puni-exec-nested-builder-proof-h2-final.log`). Only the separate disposable mount-builder received explicitly authorized SYS_ADMIN and unconfined seccomp/AppArmor; the audited target and shipped protocol retained default capabilities. Target and temporary-directory cleanup succeeded.

Init-backed lifecycle proof on both images covered timeout, EOF and canceled client, a stalled scanner plus grandchild, and an unrelated sentinel whose exact PID/start identity remained alive. All normal failure cases left no group members, including zombies. **Two additional real watched omissions** (group kill and remote deadline) left live owned descendants and failed the proof; fixture removal cleaned the deliberate faults (`/tmp/puni-exact-session-sentinel-proof-h2.log`). Emitted census code proved dotfiles, spaces, hardlinks and symlink modes, and missing-stat refusal without a DONE receipt (`/tmp/puni-shell-census-proof-h2-v2.log`).

Not performed: live init maintenance, activation, actual release-candidate image build/rehearsal, full canonical host gate, monorepo build, CI secrets/migration lint, push, integration or deployment. Independent Astra review remains pending. The PM owns review, publication and the required exact-SHA gate.

### Unreadable traversal repair after d602349 review

Astra reproduced shell glob enumeration admitting a directory whose entries could not be read. The production-path test first failed: a chmod000 nested directory containing the database inode produced a successful receipt. The emitted census now requires successful metadata-only `/bin/busybox ls -A "$path"/.` before enumerating each directory. A failed listing returns80 without DONE; ordinary empty directories remain valid. This restores the existing fail-closed unreadable-state contract. Reduced capabilities remain supported only when the real census can enumerate every relevant directory; no DAC_OVERRIDE assumption is made.

Exact final emitted code was bundled and exercised through the real Docker boundary on a disposable cached shipped Caddy image with `--init --cap-drop ALL --pull never --network none`. Empty-directory admission exited0; a readable SQLite hardlink refused; the same hardlink inside chmod000 refused, while direct `ls` returned EACCES. Removing only the new enumeration guard made that unreadable-directory admission exit0: **watched negative failed**. All exact fixture IDs were removed successfully and the fresh temporary directory was removed (`/tmp/puni-unreadable-census-proof-h2.log`). No live resources, privileges or service configuration changed. This real reduced-capability proof covers the capability case raised by review.

Fresh final scoped verification after this repair: the same 14-file command above passed **421 tests, 0 failures, 1,431 assertions** (`/tmp/exec-unreadable-scoped-tests.log`). Uncached Nx lint/typecheck for tool-remote-scripts and tool-compose passed (`/tmp/exec-unreadable-scoped-static.log`); changed-file Prettier, strict OpenSpec 1.12.0 validation and `git diff --check` passed. Full host gate, release-candidate image build, independent re-review and attended production preparation remain pending with the PM.
