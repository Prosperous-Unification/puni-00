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

## Astra Task 2.3 bounded authoritative placement repair

`listByIds` now hydrates only the affected identities. New rows use the adapter's identity-only
`listPlacements` answer: the requested row plus its immediate predecessor in the full-reader order.
SQLite computes that predecessor under its BINARY id ordering; memory walks its insertion-ordered
map. Existing rows keep their retained slot, so ordinary patches issue no placement read.

| Scope                       | Command                                                                                                                                                                                                                                                                         | Result                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cardinality RED             | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/working-plan.test.ts --test-name-pattern 'hydrates only the affected identity after a single-row patch'` before the repair                                                                                             | Expected RED: 0 passed, 1 failed; the observed patch requested and returned 200 labelled rows instead of 1.                               |
| Placement source RED        | Memory terminal source certification with its new adapter method returning `[]`                                                                                                                                                                                                 | Expected RED: `workItems.listPlacements:source-order` expected the two requested identities and their source predecessors, received `[]`. |
| Focused GREEN               | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts libs/store-sqlite/src/working-plan-order.db.test.ts libs/store-sqlite/src/targeted-readers.db.test.ts libs/store-memory/src/targeted-readers.test.ts` | Pass: 29 tests, 108 assertions. Each of three patches over 200 retained rows requested and returned exactly one labelled row.             |
| Memory source certification | `GSETTINGS_BACKEND=memory bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                                                                                                                             | Pass: terminal certification, 1 test, 1,060 assertions.                                                                                   |
| SQLite source certification | `GSETTINGS_BACKEND=memory bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'`                                                                                               | Pass: terminal certification, 1 test, 1,433 assertions.                                                                                   |
| Owning tests                | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-bounded-tests NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`                                                              | Pass: all 4 targets; core 496/1,634, memory 112/5,214, SQLite 744/8,443, conformance 33/58; cache skipped.                                |
| Owning lint and typechecks  | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-bounded-checks NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`                                                   | Pass: all 8 targets; cache skipped.                                                                                                       |
| Strict and all OpenSpec     | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                                                                           | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                                                                             |
| Workspace format/whitespace | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-bounded-format-check NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                                                                               | Pass.                                                                                                                                     |

### Bounded row refresh R5 fault observations

| Check                          | Injected fault                                                                     | Observed failure                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Affected hydration cardinality | Kept `replaceAllInSourceOrder`, which expanded one patched id to all retained ids. | The 200-row production WorkingPlan patch recorded `{ requested: 200, returned: 200 }` instead of `{ requested: 1, returned: 1 }`. |
| Dense sibling advancement      | Omitted only insert's `respaced` ids from affected hydration.                      | The later runner command produced `A@10,Y@20,B@30,X@40` instead of `A@10,Y@15,X@20,B@30`.                                         |
| Refused patch stability        | Forced affected hydration after `{ ok: false }`.                                   | The next production-path read returned `Invented after refusal` instead of `Authoritative before refusal`.                        |

### Superseded: Astra Task 2.3 inserted-row order repair

This section records the earlier all-retained hydration implementation. It was superseded by
"Astra Task 2.3 bounded authoritative placement repair" above: the current implementation hydrates
only affected identities and asks `listPlacements` only for genuinely new retained rows. The table
below remains historical evidence for the ordering defect that prompted the replacement.

| Scope                       | Command                                                                                                                                                                                                                         | Result                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Current-implementation RED  | `GSETTINGS_BACKEND=memory bun test libs/store-sqlite/src/working-plan-order.db.test.ts`                                                                                                                                         | Expected RED: 1 passed, 1 failed; retained `z-existing,a-inserted` differed from source `a-inserted,z-existing`. |
| Focused GREEN               | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts libs/store-sqlite/src/working-plan-order.db.test.ts`                                                  | Pass: 16 tests, 54 assertions.                                                                                   |
| Owning tests                | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-order-fix-tests NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`            | Pass: all 4 targets; core 495/1,628 and SQLite 744/8,428; cache skipped.                                         |
| Owning lint and typechecks  | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-order-fix-checks NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets; cache skipped.                                                                              |
| Strict and all OpenSpec     | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                           | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                                                    |
| Workspace format/whitespace | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-order-fix-format NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                                   | Pass.                                                                                                            |

## Astra Task 2.3 final row-refresh hardening

SQLite `listPlacements` now keeps the requested project filter and ascending requested-row order,
while each requested row's predecessor is found by a correlated `(project_id, id)` descending seek
with `id < current`, `ORDER BY id DESC LIMIT 1`. Ordinary retained-row patches stop before the
placement source boundary because they introduce no new retained identity. Placement answers are
validated completely before the retained array changes, and every malformed-source failure escapes
the admitted unit of work so its preceding write rolls back.

| Scope                    | Command                                                                                                                                                                                                                          | Result                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite cost/shape RED    | Focused `targeted-readers.db.test.ts` test against the production self-join/`MAX` query on a 10,000-row project                                                                                                                  | Expected RED: returned the right predecessor, but `EXPLAIN` contained `AggStep` and the prefix loop's `Next`.                              |
| Empty-placement-call RED | `bun test libs/core/src/service/working-plan.test.ts --test-name-pattern 'hydrates only the affected identity'` before the short circuit                                                                                         | Expected RED: three 200-row patches made 3 placement calls; expected 0.                                                                    |
| Placement validation RED | `bun test libs/core/src/service/plan-commands.test.ts --test-name-pattern 'working plan placement validation'` before the distinct predecessor/duplicate guards                                                                  | Expected RED: 4 passed, 3 failed; duplicate was reported as unexpected, malformed predecessor as missing, and self-predecessor as missing. |
| Focused GREEN            | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts libs/store-sqlite/src/targeted-readers.db.test.ts libs/store-sqlite/src/working-plan-order.db.test.ts` | Pass: 32 tests, 109 assertions. SQLite bytecode has `SeekLT` and `DecrJumpZero`, no `AggStep`; all seven rollback cases pass.              |
| Owning tests             | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-final-tests-2 NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`               | Pass: all 4 targets; core 503/1,655 and SQLite 745/8,447; cache skipped.                                                                   |
| Lint and typecheck       | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-final-checks-2 NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`    | Pass: all 8 targets; cache skipped.                                                                                                        |
| Strict and all OpenSpec  | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                            | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                                                                              |

### Final row-refresh R5 fault observations

| Check                                  | Injected fault                                 | Observed failure                                                                                                             |
| -------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bounded SQLite predecessor             | Restored the production self-join/`MAX` query. | The 10,000-row regression found `AggStep` plus `Next`, proving the aggregate prefix scan.                                    |
| Zero placement calls for patches       | Kept the unconditional `loadPlacements([])`.   | Three ordinary patches over 200 retained rows made three placement-source calls instead of zero.                             |
| Omitted placement                      | Removed the omitted-placement guard.           | Durable IDs were `[anchor, generated-id]` instead of `[anchor]`.                                                             |
| Unexpected placement identity          | Removed the expected-identity guard.           | The production runner reported the later `omitted work item unexpected` error instead of rejecting at the violated boundary. |
| Duplicate placement identity           | Removed the duplicate-identity guard.          | Durable IDs were `[anchor, generated-id]` instead of `[anchor]`.                                                             |
| Missing predecessor                    | Removed the predecessor-presence guard.        | Durable IDs were `[anchor, generated-id]` instead of `[anchor]`.                                                             |
| Malformed predecessor                  | Removed the runtime predecessor-shape guard.   | Numeric predecessor `42` reached the later missing-predecessor branch.                                                       |
| Self predecessor                       | Removed the self-predecessor guard.            | The row reached the later missing-predecessor branch with its own identity.                                                  |
| New identity without authorized insert | Removed the authorized-insertion guard.        | The moved row's durable `parentId` became `null` instead of rolling back to `old-parent`.                                    |

Every placement-validation case runs through `PlanCommandRunner`, injects its broken source inside
the supplied `UnitOfWork` scope, and checks the durable source after rejection. Simultaneous
multiple-new-ID refresh is not applicable to Task 2.3's production path: the only wrapper that
supplies `insertedIds` is `WorkItemStore.insert`, and it supplies exactly its one inserted identity.
The future subtree wrapper in Task 2.6 is the first matrix row that can authorize multiple new IDs,
so no non-production helper-only claim was added here.

## Task 2.4 value refresh wrappers

`working-plan-values.ts` now persists each value mutation before refreshing retained identities.
Set refreshes only after `written`; remove refreshes its work item; `moveAll` refreshes both source
and destination before returning. The same wrapper serves estimates, actuals, progress and measures,
including every measure metric. The memory source now mirrors SQLite's work-item foreign-key cascade
for these four satellite tables, so its successful remove boundary cannot expose orphaned values.

| Scope                      | Command                                                                                                                                                                                                                          | Result                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused RED                | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts --test-name-pattern 'working plan value mutations'` before the wrapper                                                                            | Expected RED: 1 passed, 3 failed. The same-command move observation retained `estimates`, `actuals`, `progress`, and `measures` at the source; remove retained all four collections and all three measure keys; delete-last-child reached the memory adapter's orphaned estimate. |
| Focused GREEN              | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts --test-name-pattern 'working plan value\|retained value'`                                              | Pass: 6 tests, 27 assertions.                                                                                                                                                                                                                                                     |
| Owning tests               | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-values-tests NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`                | Pass: all 4 targets; core 509 tests/1,682 assertions and SQLite 745 tests/8,447 assertions; cache skipped.                                                                                                                                                                        |
| Owning lint and typechecks | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-values-checks-all NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets; cache skipped.                                                                                                                                                                                                                                               |
| Strict OpenSpec packet     | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json`                                                                                                                              | Pass: 1 item, 0 failed.                                                                                                                                                                                                                                                           |
| All OpenSpec artifacts     | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                                                                                                                                    | Pass: 83 items, 0 failed (72 changes and 11 specs).                                                                                                                                                                                                                               |
| Workspace format           | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-values-format-final-4 NX_DAEMON=false bunx nx format:check --all`                                                                                                      | Pass.                                                                                                                                                                                                                                                                             |
| Diff whitespace            | `git diff --check`                                                                                                                                                                                                               | Pass.                                                                                                                                                                                                                                                                             |

### Task 2.4 R5 fault observations

| Check                     | Injected fault                                                                               | Observed failure                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-command move source  | Refreshed only `moveAll`'s destination (`refreshRows([toWorkItemId])`), omitting its source. | The production runner's same-command post-`moveAll` read returned `staleSources = ["estimates", "actuals", "progress", "measures"]` before another store call. |
| Successful remove         | Delegated `remove` without refreshing its work item.                                         | The production runner's same-method reads retained estimates, actuals, progress and each of the three measure keys.                                            |
| Modeled refusal stability | Refreshed an estimate after the source returned `unknown_step`.                              | The retained optimistic value became the targeted reader's injected `99` instead of remaining `1`.                                                             |
| Thrown write stability    | Refreshed an actual before its source removal, which then threw.                             | The retained actual became the targeted reader's injected `99` instead of remaining `2`.                                                                       |
| Memory remove parity      | Omitted the memory source's four satellite cascades.                                         | The production runner's delete-last-child hand-up rejected at the next targeted read with `targeted estimate has an invalid work-item reference`.              |

The be-01 suite was not run because Task 2.4 touched no be-01 file or composition boundary. The
h2puni gate was explicitly out of scope for this slice.

## Astra Task 2.4 authoritative value-group placement repair

Each value port now provides an identity-only populated-group placement read. Retained groups keep
their existing slots; placement is consulted only when targeted hydration introduces a group that
is not currently retained. The same generic validated placement machinery serves work-item rows
and grouped estimate, actual, progress, and measure rows. SQLite uses one correlated descending
seek per requested populated group; memory derives the satellite collection's lexical group order
instead of borrowing its insertion-ordered work-item reader.

| Scope                           | Command                                                                                                                                                                                                                              | Result                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production ordering RED         | `GSETTINGS_BACKEND=memory bun test libs/store-sqlite/src/working-plan-order.db.test.ts --test-name-pattern 'value group'` before value placement                                                                                     | Expected RED: retained groups began `z-existing,a-earlier` while every authoritative source began `a-earlier,z-existing`; all three retained measure metrics for `z-existing` likewise preceded the three for `a-earlier`. |
| Source inventory RED            | `GSETTINGS_BACKEND=memory bun test libs/conformance/src/stores/existing.test.ts` after registering the four source cases                                                                                                             | Expected RED: the exact inventory received the four new `*.listPlacements:source-order` cases before its independent list was updated.                                                                                     |
| SQLite seek-shape RED           | `GSETTINGS_BACKEND=memory bun test libs/store-sqlite/src/targeted-readers.db.test.ts --test-name-pattern 'populated predecessor'` against the first join-shaped predecessor query                                                    | Expected RED: the bytecode had `SeekGT`, `Next`, and `Sort`, but no `SeekLT`; the query walked the populated prefix instead of seeking backward.                                                                           |
| Focused GREEN                   | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts libs/store-sqlite/src/targeted-readers.db.test.ts libs/store-sqlite/src/working-plan-order.db.test.ts`     | Pass: 45 tests, 181 assertions.                                                                                                                                                                                            |
| Owning tests                    | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-values-order-tests NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`              | Pass: all 4 targets; core 514 tests/1,702 assertions and SQLite 747 tests/8,532 assertions; cache skipped.                                                                                                                 |
| Owning lint and typechecks      | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-values-order-checks-2 NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets; cache skipped.                                                                                                                                                                                        |
| Strict and all OpenSpec         | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                                | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                                                                                                                                                              |
| Workspace format and whitespace | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-values-order-format-final NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                               | Pass.                                                                                                                                                                                                                      |

### Astra Task 2.4 R5 fault observations

| Check                         | Injected fault                                                                                                      | Observed failure                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact source endpoint refresh | Changed only `moveAll` refresh to `refreshRows([toWorkItemId])`, retaining destination refresh and omitting source. | The production same-command assertion received `staleSources = ["estimates", "actuals", "progress", "measures"]` instead of `[]`; no later command or barrier ran first.                                                          |
| Omitted value placement       | Removed the shared omitted-placement guard while the estimate adapter returned `[]` for a newly populated group.    | The production runner promise resolved instead of rejecting; its rollback assertion could no longer run. Restoring the guard makes all four adapter-specific omitted-placement cases reject and retain only `z-existing` durably. |
| Bounded SQLite predecessor    | Used the first join-shaped predecessor query over 10,000 populated groups.                                          | `EXPLAIN` lacked `SeekLT` and contained prefix-loop `Next` plus `Sort`; the correlated `EXISTS` form now has `SeekLT` and `DecrJumpZero`, with no `AggStep`.                                                                      |

The memory set regression observes new-group insertion and empty-group reinsertion across all four
families, while its move regression observes a destination before one unaffected populated group.
The SQLite set regression observes the same insertion and reinsertion cases. At this point the
SQLite move witness had no unaffected populated group, so it proved source removal and destination
hydration but not the destination's placement relative to retained groups. Every measure witness
carries all three metrics. No value refresh expands targeted hydration beyond its affected IDs.

## Astra Task 2.4 final mixed-case and moveAll ordering repair

Memory value placement now uses the same exported `localeCompare` group comparator as all four
authoritative memory full readers. A production `PlanCommandRunner` regression seeds every family
and all three measure metrics for `a`, loads the retained collections, then populates `A`; the
retained arrays equal the authoritative arrays exactly in `a,A` group order. The SQLite runner's
`moveAll` witness now retains a populated `m-unaffected` group while moving `z-existing` to
`a-inserted`, and compares every complete retained array with its source before checking the exact
group sequence.

| Scope                      | Command                                                                                                                                                                                                                          | Result                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed-case RED             | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts --test-name-pattern 'mixed-case memory value groups'` before the comparator repair                                                                | Expected RED: retained `A,a`; authoritative estimates, actuals and progress returned `a,A`, and measures returned three `a` rows before three `A` rows.                |
| SQLite placement fault RED | Focused SQLite runner after changing only value-group placement to append new groups                                                                                                                                             | Expected RED: retained every unaffected `m-unaffected` group before destination `a-inserted`; authoritative arrays placed `a-inserted` first for all four collections. |
| Focused GREEN              | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts libs/store-sqlite/src/targeted-readers.db.test.ts libs/store-sqlite/src/working-plan-order.db.test.ts` | Pass: 46 tests, 186 assertions.                                                                                                                                        |
| Owning tests               | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-mixed-case-tests NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`            | Pass: all 4 targets; core 515 tests and SQLite 747 tests; cache skipped.                                                                                               |
| Owning lint and typechecks | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-mixed-case-checks NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache` | Pass: all 8 targets; cache skipped.                                                                                                                                    |
| Strict and all OpenSpec    | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                            | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                                                                                                          |
| Workspace format and diff  | `GSETTINGS_BACKEND=memory NX_SOCKET_DIR=/tmp/nx-live-plan-mixed-case-format-final-2 NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                           | Pass.                                                                                                                                                                  |

### Final Task 2.4 R5 fault observations

| Check                              | Injected fault                                             | Observed failure                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed-case memory group placement  | Restored the binary string comparator in memory placement. | The production runner retained `A,a` while every authoritative full reader returned `a,A`, including all three measures for each group.  |
| SQLite moveAll destination placing | Appended new value groups instead of applying placement.   | All four retained collections returned `m-unaffected,a-inserted`; the exact authoritative comparison required `a-inserted,m-unaffected`. |

The be-01 suite and full workspace test, lint, typecheck, build, browser, deploy, and h2puni gates
were not run: this final repair is limited to the four owning libraries, and the task explicitly
excluded the host gate.

## Task 2.5 dependency refresh wrapper

`working-plan-edges.ts` persists dependency add/remove operations before refreshing both endpoint
rows and the retained edge set. `removeAllFor` reads its incident edges before deletion, retains
every endpoint outside the doomed set, then refreshes the doomed and surviving identities after
success. Existing edges keep their retained positions and genuinely new adapter-returned edges
append in authoritative memory and SQLite order. Returned edge records remain detached; modeled
cycle refusal and thrown source writes do not advance retained state.

| Scope                      | Command                                                                                                                                                                                                                                                                         | Result                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Added-edge RED             | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts --test-name-pattern 'refuses a reversed edge'` before the add refresh                                                                                                                            | Expected RED: 0 passed, 1 failed; the actual runner returned `ok: true` and admitted both directions.              |
| Edge-order RED             | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/working-plan.test.ts --test-name-pattern 'keeps a newly added edge'` before new-edge append                                                                                                                            | Expected RED: retained `edge-a-b,edge-a-e,edge-c-d`; authoritative memory order was `edge-a-b,edge-c-d,edge-a-e`.  |
| Remove RED                 | The same focused working-plan case with add refresh restored and remove still delegated                                                                                                                                                                                         | Expected RED: retained `edge-a-b` after the source deleted it.                                                     |
| Remove-all RED             | The same focused working-plan case with remove refresh restored and removeAllFor still delegated                                                                                                                                                                                | Expected RED: retained `edge-a-e` after the source deleted it.                                                     |
| Survivor revision RED      | `GSETTINGS_BACKEND=memory bun test libs/store-sqlite/src/working-plan-order.db.test.ts --test-name-pattern 'dependency survivor'` with only the captured survivor omitted from refresh                                                                                          | Expected RED: actual runner retained revision `1`; the admitted SQLite row was revision `2` before the next patch. |
| Focused GREEN              | `GSETTINGS_BACKEND=memory bun test libs/core/src/service/plan-commands.test.ts libs/core/src/service/working-plan.test.ts libs/store-sqlite/src/working-plan-order.db.test.ts libs/store-sqlite/src/targeted-readers.db.test.ts libs/store-memory/src/targeted-readers.test.ts` | Pass: 56 tests, 229 assertions.                                                                                    |
| Owning tests               | `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx run-many -t test -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`                                                                                                            | Pass: all 4 targets; core 518/1,717 and SQLite 749/8,541; cache skipped.                                           |
| Owning lint and typechecks | `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-sqlite store-memory conformance --parallel=2 --output-style=static --skip-nx-cache`                                                                                                  | Pass: all 8 targets; cache skipped.                                                                                |
| Strict and all OpenSpec    | `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate live-plan-snapshot --strict --json` and `OPENSPEC_TELEMETRY=0 bun x @fission-ai/openspec@1.3.0 validate --all --json`                                                                                           | Pass: change 1/1; repository 83/83 (72 changes and 11 specs).                                                      |
| Workspace format and diff  | `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all` and `git diff --check`                                                                                                                                                                                    | Pass.                                                                                                              |

### Task 2.5 R5 fault observations

| Check                    | Injected fault                                                               | Observed failure                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Mounted cycle refusal    | Omitted the newly added edge from retained reads.                            | The second reversed dependency was admitted and the batch returned `ok: true` instead of refusing `cycle`.                                  |
| Exact survivor revision  | Refreshed only doomed ids after `removeAllFor`, omitting captured survivors. | Before the next command, the production runner retained revision `1` while SQLite stored `2`; restored code journals expected revision `3`. |
| Authoritative edge order | Inserted a new incident edge beside the last retained incident edge.         | Memory retained `edge-a-b,edge-a-e,edge-c-d` instead of source order; the SQLite parity case now returns the same source sequence.          |
| Successful remove        | Delegated `remove` without refreshing either endpoint.                       | The deleted edge remained in the retained dependency collection.                                                                            |
| Successful remove-all    | Delegated `removeAllFor` without refreshing captured endpoints.              | The deleted external edge remained in the retained dependency collection.                                                                   |
| Thrown write stability   | Moved add/remove/removeAllFor refresh before injected source throws.         | The retained edge id became `invented-before-success` instead of remaining `stored-edge`.                                                   |

The SQLite runner witness records exact journal preconditions
`{expected:{survivor:3},from:{survivor:1}}`, then successfully undoes the batch and restores the
deleted branch, survivor name and external dependency endpoints. The be-01 suite was not run
because Task 2.5 touched no application composition boundary. Full workspace build, browser,
deploy and h2puni gates were explicitly outside this slice.
