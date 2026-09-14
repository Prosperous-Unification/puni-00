# Verification

## Section 1 focused evidence

| Scope                              | Command                                                                                                                                                                                       | Result                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uncached production batch baseline | `bun test libs/core/src/service/working-plan.test.ts`                                                                                                                                         | Pass: 1 test, 14 assertions. Covers create→estimate, estimate→child hand-down, dependency→delete survivor, directory cascade→patch, and distinct UnitOfWork-supplied store graphs. |
| Memory source contract             | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                                                                    | Pass: terminal certification, 1 test, 1,040 assertions.                                                                                                                            |
| SQLite source contract             | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'`                                      | Pass: terminal certification, 1 test, 1,409 assertions.                                                                                                                            |
| SQLite malformed state             | `bun test libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                                                                  | Pass: broken step and malformed actual/progress/measure values all throw.                                                                                                          |
| Port and adapter types             | `NX_DAEMON=false bunx nx run-many -t typecheck -p core store-memory store-sqlite conformance --parallel=2 --output-style=stream`                                                              | Pass: 4 targets, 0 cache hits. Nx used its documented no-socket fallback in the sandbox.                                                                                           |
| Owning tests and types             | `NX_SOCKET_DIR=/tmp/nx-live-plan-section1 NX_DAEMON=false bunx nx run-many -t test typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=stream`                | Pass: all 8 targets; SQLite 724 tests and 8,320 assertions.                                                                                                                        |
| Owning lint                        | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-section1 NX_DAEMON=false bunx nx run-many -t lint -p core store-sqlite store-memory conformance --parallel=2 --output-style=static` | Pass: all 4 targets.                                                                                                                                                               |
| Strict packet                      | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                                                                            | Pass: 1 item, 0 failed.                                                                                                                                                            |
| Changed-file format                | `bunx prettier --check <34 changed files>`                                                                                                                                                    | Pass: every matched file uses Prettier style.                                                                                                                                      |
| Diff whitespace                    | `git diff --check`                                                                                                                                                                            | Pass.                                                                                                                                                                              |

## R5 fault observations

| Check                            | Injected fault                                                                                                         | Observed failure                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted labelled work-item read | Returned `tagIds: []` from memory `listByIds`.                                                                         | Memory terminal certification failed `workItems.listByIds:labels-scope`; expected `tag-a`, received an empty tag set.                                                  |
| Incident dependency read         | Removed the endpoint predicate from memory `listByWorkItems`.                                                          | Memory terminal certification failed `dependencies.listByWorkItems:incident-scope`; the missing-id read returned `edge-targeted`.                                      |
| Project isolation                | Removed the project predicate from memory `listByIds`.                                                                 | Memory terminal certification failed with `work-b-one` returned for project A; dependency endpoint validation also stopped rejecting the malformed cross-project edge. |
| Malformed SQLite values          | Replaced an estimate step reference and stored invalid actual, progress, and measure values with constraints disabled. | The targeted readers rejected the broken step, day value, state, and measure value. The test passed only when all four throws occurred.                                |

The source-level negatives above established the targeted-reader contracts. The production-path
label, edge and project-predicate variants are recorded below now that the patch slice can advance
loaded retained collections through those readers.

`bunx nx format:check --all` was unavailable as evidence: this stacked worktree's Nx wrapper
invoked the main checkout's Prettier as `prettier --list-different -- "."`, which exited 1 without
naming an unformatted file. The direct changed-file Prettier check above is green. The host gate
remains future final-section acceptance work under Task 3.3.

## Task 2.1 working-plan lifecycle

The runner creates a lazy WorkingPlan for every project batch and closes it in `finally`. During
this staged slice, command services still compose over the admitted `scope.stores`: Tasks 2.3–2.7
must first make every successful mutation advance retained collections, and Task 3.1 owns the
switch to `workingPlan.stores`. Directory batches, undo/redo, rollback repair, ordinary routes and
post-commit announcements therefore retain their established nonworking graphs.

| Scope                        | Command                                                                                                                               | Result                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Lifecycle and retained reads | `bun test libs/core/src/service/working-plan.test.ts`                                                                                 | Pass: 3 tests, 18 assertions.                        |
| Complete core suite          | `NX_DAEMON=false bunx nx run core:test --output-style=static`                                                                         | Pass: 426 tests, 1,493 assertions.                   |
| SQLite runner/coordinator    | `bun test libs/store-sqlite/src/write-coordinator.db.test.ts`                                                                         | Pass: 2 tests, 9 assertions.                         |
| Owning lint and typechecks   | `NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-memory store-sqlite conformance --parallel=2 --output-style=static` | Pass: all 8 targets.                                 |
| Accountless compile witness  | `libs/core/src/service/working-plan.types.test.ts`, compiled by `core:typecheck`                                                      | Pass: `stores.users` remains an expected type error. |
| Strict packet                | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                    | Pass: 1 item, 0 failed.                              |

### Task 2.1 R5 fault observation

| Check                       | Injected fault                                                                       | Observed failure                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Closed batch-owned callback | Disabled the `isClosed` branch in the retained read guard, then invoked the callback | `throws after its batch closes` failed: the promise resolved with the committed row instead of rejecting. |

## Task 2.2 detached before-images

The command regression composes one actual memory-source batch over its admitted WorkingPlan only
for this proof; production command composition remains on `scope.stores` until Task 3.1. Before the
first of two patches reads the row, the test mutates a previously returned retained answer. The two
patches name distinct names and tag sets, and one undo restores the database row from before the
batch. The direct retained-read case separately mutates all four label arrays and a nested external
reference, then verifies a second answer remains detached.

| Scope                         | Command                                                                                                                               | Result                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Exact before-image regression | `bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts`                                     | Pass: 4 tests, 22 assertions.                                               |
| Owning tests                  | `NX_DAEMON=false bunx nx run-many -t test -p core store-memory store-sqlite conformance --parallel=2 --output-style=static`           | Pass: core 427, memory 95, SQLite 724 and conformance 33 tests; 0 failures. |
| Owning lint and typechecks    | `NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-memory store-sqlite conformance --parallel=2 --output-style=static` | Pass: all 8 targets.                                                        |
| Changed-file format           | `bunx prettier --check <Task 2.2 core and packet files>`                                                                              | Pass: every matched file uses Prettier style.                               |
| Diff whitespace               | `git diff --check`                                                                                                                    | Pass.                                                                       |
| Strict packet                 | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                    | Pass: 1 item, 0 failed.                                                     |

### Task 2.2 R5 fault observation

| Check                   | Injected fault                                           | Observed failure                                                                                                                             |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Detached cached answers | Returned retained cache records directly without cloning | `two patches undo to the value before the batch` failed: undo restored `Mutated cached name` and the second tag instead of the original row. |

## Tasks 1.2 and 1.3 production refresh integration

A successful patch now refreshes every already-loaded retained collection for that work-item ID
through the authoritative targeted readers. Work-item and satellite rows must belong to the
requested project/identity set; dependency rows must belong to the project and touch at least one
requested endpoint. The runner proof mounts this partial working graph only for the patch scenario.
Task 3.1 still owns the general production switch after Tasks 2.3–2.7 complete every mutation's
affected-ID rules.

| Scope                       | Command                                                                                                                                                                                                             | Result                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Exact refresh regressions   | `bun test libs/core/src/use-cases/admission.test.ts libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts`                                                                         | Pass: 13 tests, 51 assertions. Includes modeled admission before any transactional mutation-port selection. |
| Memory source certification | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                                                                                          | Pass: terminal certification, 1 test, 1,040 assertions.                                                     |
| SQLite source certification | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'`                                                            | Pass: terminal certification, 1 test, 1,409 assertions.                                                     |
| SQLite malformed state      | `bun test libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                                                                                        | Pass: 1 test, 4 assertions.                                                                                 |
| Owning tests                | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-next NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`           | Pass: all 4 targets; core 488, memory 107, SQLite 736 and conformance 33 tests; 0 failures.                 |
| Owning lint and typechecks  | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-next NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets, 0 cache hits.                                                                          |
| Strict packet               | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                                                                                                  | Pass: 1 item, 0 failed.                                                                                     |
| All OpenSpec changes        | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`                                                                                                                                        | Pass: 83 items, 0 failed.                                                                                   |
| Changed-file format         | `bunx prettier --check <Tasks 1.2/1.3 core and packet files>`                                                                                                                                                       | Pass after formatting the final evidence update.                                                            |
| Diff whitespace             | `git diff --check`                                                                                                                                                                                                  | Pass.                                                                                                       |

### Tasks 1.2 and 1.3 R5 fault observations

| Check                          | Injected fault                                                               | Observed failure                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Labelled targeted refresh      | Returned `tagIds: []` from the memory source's targeted `listByIds`.         | Production runner expected the first and second exact tag IDs between patches and received `[[], []]`.               |
| Incident dependency validation | Removed the refresh boundary's requested-endpoint predicate.                 | The unrelated-edge phase resolved instead of rejecting.                                                              |
| Project validation             | Removed the refresh boundary's work-item project predicate.                  | The cross-project-work-item phase resolved instead of rejecting.                                                     |
| Requested work-item identity   | Removed the refresh boundary's requested-ID predicate.                       | The unrequested-row phase resolved instead of rejecting.                                                             |
| Satellite identity             | Replaced the shared unrequested-satellite throw with a return.               | The unrequested-estimate phase resolved instead of rejecting.                                                        |
| Dependency project             | Removed the refresh boundary's dependency project predicate.                 | The cross-project-edge phase resolved instead of rejecting.                                                          |
| Lazy mutation-port selection   | Passed `scope.stores.workItems` eagerly while constructing the working plan. | The absent-account admission test threw `something asked it for workItems` instead of returning modeled `forbidden`. |

## Publication checkpoint integration

Fetched `origin/main` at `9b13f98e62a7cd880977e348421e992e8c4951a3` and merged it into
`change/live-plan-snapshot` as `9458956029dc336c1213f40c658c84b5d8d5cde6`. The merge completed
without conflicts. Main's status-command, zero-step scheduler and host-image changes remain present;
the live snapshot reader groundwork and Tasks 1.1, 2.1 and 2.2 remain present. At that checkpoint,
Tasks 1.2, 1.3 and 2.3 onward remained open.

| Scope                       | Command                                                                                                                                                  | Result                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Complete integrated core    | `NX_DAEMON=false bunx nx run core:test --output-style=static`                                                                                            | Pass: 428 tests, 1,503 assertions. |
| Memory source certification | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                               | Pass: 1 test, 1,040 assertions.    |
| SQLite source certification | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'` | Pass: 1 test, 1,409 assertions.    |
| SQLite malformed state      | `bun test libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                             | Pass: 1 test, 4 assertions.        |
| Conformance framework       | `NX_DAEMON=false bunx nx run conformance:test --output-style=static`                                                                                     | Pass: 33 tests, 58 assertions.     |
| Owning lint and typechecks  | `NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-memory store-sqlite conformance --parallel=2 --output-style=static`                    | Pass: all 8 targets.               |

## Astra P2 ordering and memory trusted-state follow-up

The targeted work-item reader now preserves its full reader's authoritative order. A loaded
WorkingPlan replaces refreshed groups at their retained positions and replaces incident dependency
identities in place, so unrelated interleavings remain untouched. The memory satellite readers
share one admission boundary: it resolves requested stored work items, filters valid foreign-project
owners, reads and validates project steps once, then validates the admitted family-specific values
before ordering.

| Scope                       | Command                                                                                                                                                                                                               | Result                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Memory malformed state      | `bun test libs/store-memory/src/targeted-readers.test.ts`                                                                                                                                                             | Pass: 5 tests, 24 assertions across estimate, actual, progress and measure targeted readers.          |
| Exact WorkingPlan order     | `bun test libs/core/src/service/working-plan.test.ts --test-name-pattern 'preserves the admitted work-item order\|preserves unrelated dependency interleaving'`                                                       | Pass: 2 tests, 4 assertions; retained rows and dependencies equal the current admitted source arrays. |
| Focused core paths          | `bun test libs/core/src/use-cases/admission.test.ts libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts`                                                                           | Pass: 15 tests, 55 assertions.                                                                        |
| Memory source certification | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                                                                                            | Pass: terminal certification, 1 test, 1,041 assertions.                                               |
| SQLite source certification | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'`                                                              | Pass: terminal certification, 1 test, 1,410 assertions.                                               |
| SQLite malformed state      | `bun test libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                                                                                          | Pass: 1 test, 4 assertions.                                                                           |
| Owning tests                | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-review NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`           | Pass: all 4 targets; memory rerun 112 tests, SQLite 736 tests and conformance 33 tests; 0 failures.   |
| Owning lint and typechecks  | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-review NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets, 0 cache hits.                                                                    |
| Strict packet               | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                                                                                                    | Pass: 1 item, 0 failed.                                                                               |
| All OpenSpec changes        | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`                                                                                                                                          | Pass: 83 items, 0 failed.                                                                             |
| Workspace format            | `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                                                                                                                                                 | Pass.                                                                                                 |
| Diff whitespace             | `git diff --check`                                                                                                                                                                                                    | Pass.                                                                                                 |

### Astra P2 R5 fault observations

| Check                             | Injected fault                                                                | Observed failure                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Authoritative targeted order      | Kept the memory reader's old ID sort.                                         | Memory certification failed: targeted `a,b,c,z` differed from the full reader's filtered `z,a,b,c`.                            |
| Retained work-item order          | Kept the old group-and-sort replacement.                                      | The production WorkingPlan regression received `a,b,c,z` instead of admitted `z,a,b,c`.                                        |
| Unrelated dependency interleaving | Kept the old remove-all-and-splice-at-first-incident replacement.             | The production WorkingPlan regression received `e1,e3,e2` instead of admitted `e1,e2,e3`.                                      |
| Memory satellite reference checks | Kept the old `listByIds` membership filter and absent-step position fallback. | All four regressions failed: missing/cross-project work items and cross-project steps resolved instead of rejecting.           |
| Memory satellite value checks     | Kept the old unvalidated stored rows.                                         | The estimate, actual, progress and measure regression failed because malformed values/times resolved instead of named rejects. |

## Astra P2 foreign-project parity repair

Each shared satellite case stores a valid project-B row, targets its work-item ID while asking for
project A, and compares the complete targeted answer with the project-A full answer filtered to
that ID. Both adapters return `[]`. The memory boundary still throws for a missing work-item owner
before filtering; after filtering, every admitted row must reference a project-A step and carry
valid family-specific values.

SQLite corruption tests now distinguish states the reader must reject from states ordinary schema
enforcement prevents. Foreign keys were disabled for every corruption injection so each update
could exercise the reader boundary; reference proofs depend on that setting, while representable
dynamic values do not. `ignore_check_constraints` was enabled only to prove the progress-state and
measure-metric reader defenses. Separate attempts with constraints active reported the exact stored
constraint names; binding `NaN` became `NULL` and hit the estimate column's `NOT NULL`.

| Scope                       | Command                                                                                                                                                                                                               | Result                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Memory targeted corruption  | `bun test libs/store-memory/src/targeted-readers.test.ts`                                                                                                                                                             | Pass: 5 tests, 24 assertions.                                                               |
| SQLite corruption matrix    | `bun test libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                                                                                          | Pass: 7 tests, 24 assertions.                                                               |
| Memory source certification | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                                                                                            | Pass: terminal certification, 1 test, 1,045 assertions.                                     |
| SQLite source certification | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'`                                                              | Pass: terminal certification, 1 test, 1,414 assertions.                                     |
| Focused core paths          | `bun test libs/core/src/use-cases/admission.test.ts libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts`                                                                           | Pass: 15 tests, 55 assertions.                                                              |
| Owning lint and typechecks  | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-repair NX_DAEMON=false bunx nx run-many -t lint typecheck -p conformance store-memory store-sqlite core --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets, 0 cache hits.                                                          |
| Owning tests                | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-repair NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`           | Pass: all 4 targets; core 490/1,617, memory 112/5,199, SQLite 742/8,416, conformance 33/58. |
| Strict and all OpenSpec     | `bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `bunx @fission-ai/openspec@1.3.0 validate --all --json`                                                                             | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                               |
| Format and whitespace       | `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                                                                          | Pass.                                                                                       |

### Foreign-project parity R5 fault observation

| Check                             | Injected fault                                                 | Observed failure                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid foreign satellite filtering | Validated ownership before filtering the requested stored rows | Memory certification failed all four shared `listByWorkItems:scope-order` cases: estimate, actual, progress and measure each threw `<family> work-b-one/step-b-dev is outside project project-a` instead of matching filtered full-reader `[]`. |

### SQLite constraint evidence

| Attempt with constraints active       | Exact refusal                                     |
| ------------------------------------- | ------------------------------------------------- |
| Store progress state `broken`         | `CHECK constraint failed: role_progress_state`    |
| Store measure metric `broken`         | `CHECK constraint failed: role_measure_metric`    |
| Bind `NaN` into `estimate.optimistic` | `NOT NULL constraint failed: estimate.optimistic` |

## Astra SQLite targeted-order repair

All four shared satellite cases now seed valid `work-A` and `work-a` owners. Their complete targeted
answers must equal the SQLite-BINARY or memory-admitted full answer filtered to those IDs. SQLite's
targeted statements carry the same `ORDER BY` expressions as their full readers; no JavaScript
locale collation can reinterpret the stored order. A SQLite-backed WorkingPlan regression gives
`step-A` and `step-a` the same position, loads all four collections, patches their work item, and
compares every retained collection with its current full source read.

| Scope                          | Command                                                                                                                                                                                                              | Result                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Targeted and WorkingPlan paths | `bun test libs/store-sqlite/src/working-plan-order.db.test.ts libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                                     | Pass: 8 tests, 29 assertions.                                                |
| Memory source certification    | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                                                                                           | Pass: 1 test, 1,049 assertions.                                              |
| SQLite source certification    | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'`                                                             | Pass: 1 test, 1,418 assertions.                                              |
| Owning lint and typechecks     | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-order NX_DAEMON=false bunx nx run-many -t lint typecheck -p conformance store-memory store-sqlite core --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets, no cache.                                               |
| Owning tests                   | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-order NX_DAEMON=false bunx nx run-many -t test -p core store-memory store-sqlite conformance --parallel=2 --output-style=static --skip-nx-cache`           | Pass: core 490/1,617; memory 112/5,203; SQLite 743/8,425; conformance 33/58. |
| Strict and all OpenSpec        | `bunx @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `bunx @fission-ai/openspec@1.3.0 validate --all --json`                                                                            | Pass: change 1/1; repository 83/83.                                          |
| Format and whitespace          | `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                                                                         | Pass.                                                                        |

### SQLite targeted-order R5 fault observations

| Check                      | Injected fault                            | Observed failure                                                                                                                                                  |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed-case owner parity    | Kept the four `localeCompare` post-sorts. | SQLite certification failed estimate, actual, progress and measure scope-order cases because targeted `work-a,work-A` disagreed with full-reader `work-A,work-a`. |
| WorkingPlan retained order | Kept the four `localeCompare` post-sorts. | The SQLite WorkingPlan regression failed first on estimates: retained `step-a,step-A` disagreed with the current full source's `step-A,step-a`.                   |

## Task 2.3 work-item row refreshes

The working row store refreshes the inserted/moved/removed identities, their affected parents and
every explicit respace or promotion before returning. Frozen-number writes refresh every update.
A refused patch does not consult the targeted reader or advance the retained collection. The
`listByIds` port JSDoc now names its actual ordering contract: the authoritative full-project
reader's order, rather than id order.

| Scope                     | Command                                                                                                                                                                       | Result                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Focused pre-change RED    | `bun test libs/core/src/service/plan-commands.test.ts --test-name-pattern 'working plan row mutations through runner commands'`                                               | Expected RED: 1 passed and 4 failed; insert/freeze assertions failed and move/promote placement threw.              |
| Exact respace fault       | Same focused file filtered to `refreshes an inserted row and every densely respaced sibling`, with only `respaced` ids omitted from insert refresh                            | Expected RED: 0 passed, 1 failed; second placement produced `A@10,Y@20,B@30,X@40` instead of `A@10,Y@15,X@20,B@30`. |
| Exact refused-patch fault | Same focused file filtered to `does not advance a retained row after a refused patch`, with patch refresh forced after `{ ok: false }`                                        | Expected RED: 0 passed, 1 failed; next within-batch read saw `Invented after refusal` instead of the stored name.   |
| Restored focused GREEN    | `bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts`                                                                             | Pass: 14 tests, 46 assertions.                                                                                      |
| Complete core suite       | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-rows NX_DAEMON=false bunx nx run core:test --output-style=static --skip-nx-cache`                                   | Pass: 495 tests, 1,628 assertions; cache skipped.                                                                   |
| Core lint and typecheck   | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-rows NX_DAEMON=false bunx nx run-many -t lint typecheck -p core --parallel=2 --output-style=static --skip-nx-cache` | Pass: both targets; cache skipped.                                                                                  |
| Strict OpenSpec packet    | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                                                           | Pass: 1 item, 0 failed.                                                                                             |
| All OpenSpec artifacts    | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                                                                                 | Pass: 83 items, 0 failed (72 changes and 11 specs).                                                                 |
| Workspace format          | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-format NX_DAEMON=false bunx nx format:check --all`                                                                  | Pass.                                                                                                               |
| Diff whitespace           | `git diff --check`                                                                                                                                                            | Pass.                                                                                                               |

### Task 2.3 R5 fault observations

| Check                     | Injected fault                                            | Observed failure                                                                                          |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Dense sibling advancement | Omitted only insert's `respaced` ids from `refreshRows`.  | The later runner command placed Y from stale positions and moved X behind B.                              |
| Refused patch stability   | Called `refreshRows([id])` after a modeled patch refusal. | The instrumented next read inside the runner batch returned the targeted reader's invented advanced name. |
