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
