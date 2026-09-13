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

The production `PlanCommandRunner` does not consume targeted readers until Section 2 introduces
`WorkingPlan.refreshRows`. Consequently Task 1.2's between-command targeted label/edge fault and
Task 1.3's explicit `refreshRows` project-predicate fault cannot be exercised without implementing
the lifecycle that Tasks 2.1–2.7 own. Section 1 records the source-level negatives above; the
production-path variants remain acceptance work for their named Section 2 integration.

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

## Publication checkpoint integration

Fetched `origin/main` at `9b13f98e62a7cd880977e348421e992e8c4951a3` and merged it into
`change/live-plan-snapshot` as `9458956029dc336c1213f40c658c84b5d8d5cde6`. The merge completed
without conflicts. Main's status-command, zero-step scheduler and host-image changes remain present;
the live snapshot reader groundwork and Tasks 1.1, 2.1 and 2.2 remain present. Tasks 1.2, 1.3 and
2.3 onward remain open.

| Scope                       | Command                                                                                                                                                  | Result                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Complete integrated core    | `NX_DAEMON=false bunx nx run core:test --output-style=static`                                                                                            | Pass: 428 tests, 1,503 assertions. |
| Memory source certification | `bun test libs/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'runs every offered existing case'`                               | Pass: 1 test, 1,040 assertions.    |
| SQLite source certification | `bun test libs/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'SQLite terminal certification runs every exact offered case'` | Pass: 1 test, 1,409 assertions.    |
| SQLite malformed state      | `bun test libs/store-sqlite/src/targeted-readers.db.test.ts`                                                                                             | Pass: 1 test, 4 assertions.        |
| Conformance framework       | `NX_DAEMON=false bunx nx run conformance:test --output-style=static`                                                                                     | Pass: 33 tests, 58 assertions.     |
| Owning lint and typechecks  | `NX_DAEMON=false bunx nx run-many -t lint typecheck -p core store-memory store-sqlite conformance --parallel=2 --output-style=static`                    | Pass: all 8 targets.               |
