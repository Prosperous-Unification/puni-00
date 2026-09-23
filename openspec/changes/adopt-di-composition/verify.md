## Commands

| Command                                                                       | Expectation                |
| ----------------------------------------------------------------------------- | -------------------------- |
| `bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain`         | exit 0                     |
| `bunx nx run wbs-core:build:portable`                                         | exit 0                     |
| `bunx nx run wbs-be-01:typecheck`                                             | exit 0                     |
| `bunx nx run wbs-be-01:test:unit`                                             | planner-only, exit 0       |
| `bunx nx run tool-devsync:test`                                               | planner-only, exit 0       |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` | strict jq contract exits 0 |
| `bin/h2puni-gate.sh <sha>`                                                    | planner-only, exit 0       |

## Failure proofs

| Check                   | Fault injected                                       | Test that observed it                                  | Result                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project write gate      | `canEditProject` forced to `true`                    | `announces nothing for a write it refused`             | Failed with the expected `forbidden` value replaced by `ok: true`; 0 passed, 1 failed and 10 filtered out. Restored run: 1 passed and 0 failed.                                            |
| Installer surface       | Returned the built bag as a top-level `bag` property | `exposes only the contract exports from its installer` | Failed with received key `bag`; 5 passed and 1 failed. Restored run: 6 passed and 0 failed.                                                                                                |
| Private binding         | Exported `historySettings` from the module           | `keeps its private bindings out of a host graph`       | Failed with `Received function did not throw`; the two label tests also failed; 3 passed and 3 failed. Restored run: 6 passed and 0 failed.                                                |
| Private binding label   | Removed the module label                             | `labels its private bindings with the module name`     | Failed with `Expected to contain: "application.plan-history/historySettings"`; the missing-requirement label test also failed; 4 passed and 2 failed. Restored run: 6 passed and 0 failed. |
| Installer value surface | Attached `resolve` to the returned history service   | `exposes only the contract exports from its installer` | Failed with `Expected: true`, `Received: false`; 5 passed and 1 failed. Restored run: 6 passed and 0 failed.                                                                               |

## Observations

_(each slice appends its own step-0 baselines, its deltas and the diagnostics it observed here
before handing over. Evidence references are basenames relative to the attempt's evidence
directory.)_

### Slice 1 — 2026-09-22

- Baseline validation items: 112.
- With this change: 113 items, 113 passed and 0 failed, the required baseline plus one.
- Strict validation evidence: `openspec-validation.FeThpd.json`.

### Slice 2 — 2026-09-22

- Domain baseline: 645 passed, 0 failed across 52 files (`slice-2-domain-baseline.log`).
- With `project-ownership.test.ts`: 647 passed, 0 failed across 53 files, the required baseline
  plus two (`slice-2-domain-green.log`).
- Focused ownership test: 2 passed, 0 failed, 3 assertions
  (`slice-2-project-ownership-green.log`).
- Domain unit, lint and type-check targets passed (`slice-2-domain-nx-green.log`).
- The R5 production-path negative belongs to slice 3. Until the six callers use the moved rule,
  forcing it to return `true` has no production path through a service.

### Slice 3 — 2026-09-22

- Step-0 counts: 1 `canEditProject` declaration, 5 service-side imports of `canEdit`, and 1
  `savePlan` import of `canEdit`; the core unit, lint and type-check baseline exited 0
  (`slice-3-step-0-core.log`).
- Calendar marker, Capacity, Priority band, Project, Step, Work item and `savePlan` now use the
  domain write gate. The compatibility alias count is 1. `http/project.routes.ts` remains on the
  alias because it already imports `ProjectService` from that resource.
- The guarded zero-import scan printed `remaining=0`.
- With `canEditProject` forced to return `true`, `announces nothing for a write it refused` failed:
  the expected `{ ok: false, reason: 'forbidden', about: 'project' }` was replaced by an `ok: true`
  marker; 0 passed, 1 failed and 10 were filtered out. Evidence:
  `can-edit-project-always-true.patch`, `can-edit-project-always-true.log`.
- The passing bytes were restored and matched with `cmp`; the focused test then passed 1 test with
  0 failures (`can-edit-project-restored-green.log`).

### Slice 4 — 2026-09-22

- Core baseline `C=535`, `F=52`: 535 passed, 0 failed across 52 files
  (`core-baseline.log`).
- The test-first red could not find `./check`: 0 passed, 1 failed and 1 error
  (`module-test-red.log`). The first green passed 6 tests with 7 assertions
  (`module-test-green.log`).
- Returning the bag exposed the extra `bag` key: 5 passed and 1 failed
  (`installer-bag-leak.patch`, `installer-bag-leak.log`).
- Exporting `historySettings` made the private-binding assertion report
  `Received function did not throw`; the two label assertions also failed: 3 passed and 3 failed
  (`private-binding-exported.patch`, `private-binding-exported.log`).
- Dropping the label omitted `application.plan-history/historySettings` from the graph and failure
  path: 4 passed and 2 failed (`module-label-dropped.patch`, `module-label-dropped.log`).
- Attaching `resolve` to the returned history service made the no-resolver assertion receive
  `false`: 5 passed and 1 failed (`service-resolver-leak.patch`,
  `service-resolver-leak.log`).
- Each passing file was restored with `cp`, matched with `cmp`, and reran green at 6 passed and 0
  failed (`installer-bag-leak-restored-green.log`,
  `private-binding-exported-restored-green.log`, `module-label-dropped-restored-green.log`,
  `service-resolver-leak-restored-green.log`).

### Slice 5 — 2026-09-22

- Classification baseline `K=95`; rewriting the retained history shim's row in place kept the
  count at 95 (`slice-5-kinds-baseline.txt`, `slice-5-kinds-final.txt`).
- Core baseline `C=541`: 541 passed, 0 failed across 53 files before composition-root wiring
  (`slice-5-core-baseline.log`). The closing run remained 541 passed, 0 failed across 53 files
  (`slice-5-core-final.log`).
- The portable build exited 0, and the bundle contained 1 occurrence of
  `application.plan-history` (`slice-5-portable-build.log`,
  `slice-5-portable-label-count.txt`).
- The focused be-01 history checks passed 11 tests with 0 failures and 33 assertions
  (`slice-5-be-focused-tests.log`); be-01 type-check exited 0 (`slice-5-be-typecheck.log`).
- `wbs-be-01:test:unit` (rehearsed exit 0), `tool-devsync:test` (rehearsed 366 passed, 0 failed),
  and `wbs-core:test` (rehearsed 541 passed, 0 failed across 53 files) are pending planner
  verification because their whole targets are planner-only in this execution environment.

### Broadcast event port, Slice 1 — 2026-09-22

- Core baseline `C=541`, `F=53`: 541 passed, 0 failed across 53 files
  (`core-baseline.log`). After extracting the event contracts, the closing run remained 541
  passed, 0 failed across 53 files (`core-final.log`).
- `ports/project-event.ts` contains the moved `ProjectEvent`, `subscriptionFor` and
  `Broadcaster` contracts. `service/broadcast.ts` retains `HeldAnnouncement` and
  `AnnouncementCollector` and re-exports the port for compatibility; the root barrel exports
  both homes. The byte-for-byte extraction check passed (`slice-1-extraction-check.log`).
- The port keeps its type-only import of `../service/numbered-work-item` until task 6.1 moves
  that file to the domain library.
- The pre-edit type check passed (`slice-1-step0-typecheck.log`); the owned code paths passed
  their formatting check (`slice-1-prettier-check.log`); core type-check and lint passed
  (`slice-1-typecheck-lint.log`); and the portable browser build passed
  (`slice-1-portable-build.log`).

### Broadcast event port, Slice 2 — 2026-09-22

- Core baseline `C=541`, `F=53`: 541 passed, 0 failed across 53 files
  (`core-baseline.log`). With the boundary test and the production importer move, the closing
  run reached the required `C + 1=542` passes across `F + 1=54` files with 0 failures
  (`core-final.log`).
- The new production-only boundary test failed first with all 22 references reaching
  `Broadcaster`, `ProjectEvent`, or `subscriptionFor` through `service/broadcast.ts`: 0 passed
  and 1 failed (`slice-2-production-import-red.log`).
- Exactly 17 production importers now name `ports/project-event.ts`; the focused boundary test
  then passed 1 test with 0 failures (`slice-2-boundary-green.log`). The checker deliberately
  carries 0 `Proof:` comments until slices 3 and 4 inject the route and guard faults those
  comments will describe.
- The step-0 type-check and lint passed (`slice-2-step0-typecheck-lint.log`); ESLint sorted the
  17 importer edits (`slice-2-importers-eslint-fix.log`); the owned code paths passed their
  formatting check (`slice-2-prettier-check.log`); and the closing core type-check and lint
  passed (`slice-2-typecheck-lint.log`). The repository-wide format check passed
  (`slice-2-format-check.log`).

### Broadcast event port, Slice 3 — 2026-09-22

- Step 0 found 0 proof comments, the focused boundary test passed 1 test with 0 failures, and
  `wbs-core:typecheck` exited 0 (`slice-3-proof-count-baseline.log`,
  `slice-3-step0-boundary.log`, `slice-3-step0-typecheck.log`). The core baseline was `C=542`,
  `F=54`: 542 passed, 0 failed across 54 files (`core-baseline.log`).
- A named import through `service/broadcast.ts` reported
  `service/step.service.ts: Broadcaster via service/broadcast.ts`
  (`step-named-import.patch`, `step-named-import.log`,
  `step-named-import-typecheck.log`, `step-named-import-restored-green.log`).
- A type-only namespace through `service/broadcast.ts` reported the `Broadcaster via`, module
  specifier `hands out`, and namespace identifier `events hands out` rows
  (`step-namespace-type.patch`, `step-namespace-type.log`,
  `step-namespace-type-typecheck.log`, `step-namespace-type-restored-green.log`).
- A value namespace read by element access reported `events hands out the contracts from
service/broadcast.ts` and the `./broadcast` module-specifier row
  (`gateway-element-access.patch`, `gateway-element-access.log`,
  `gateway-element-access-typecheck.log`, `gateway-element-access-restored-green.log`).
- A root-barrel import reported `service/capacity.service.ts: Broadcaster via index.ts`
  (`capacity-barrel.patch`, `capacity-barrel.log`, `capacity-barrel-typecheck.log`,
  `capacity-barrel-restored-green.log`).
- An `import` type through `service/broadcast.ts` reported both `Broadcaster via
service/broadcast.ts` and the `./broadcast` module-specifier row
  (`capacity-import-type.patch`, `capacity-import-type.log`,
  `capacity-import-type-typecheck.log`, `capacity-import-type-restored-green.log`).
- A renamed re-export reported `routeFor via service/optimizer-trigger-broadcaster.ts`, the
  `routes hands out` and `routes.routeFor reads` rows, and the root-barrel module-specifier row
  (`renamed-export.patch`, `renamed-export.log`, `renamed-export-typecheck.log`,
  `renamed-export-restored-green.log`).
- A default re-export reported `pushTo via service/optimizer-trigger-broadcaster.ts` and the
  root-barrel module-specifier row (`default-export.patch`, `default-export.log`,
  `default-export-typecheck.log`, `default-export-restored-green.log`).
- An `export * as events` namespace consumed as a nested property reported
  `routes hands out the contracts from service/optimizer-trigger-broadcaster.ts`
  (`namespace-export.patch`, `namespace-export.log`, `namespace-export-typecheck.log`,
  `namespace-export-restored-green.log`).
- That namespace consumed as a qualified `import` type reported
  `service/capacity.service.ts: Broadcaster via service/optimizer-trigger-broadcaster.ts`
  (`qualified-import-type.patch`, `qualified-import-type.log`,
  `qualified-import-type-typecheck.log`, `qualified-import-type-restored-green.log`).
- An awaited dynamic import indexed by `subscriptionFor` reported the `./broadcast`
  module-specifier row and `(await import('./broadcast'))['subscriptionFor'] reads a contract
out of service/broadcast.ts` (`awaited-element-access.patch`,
  `awaited-element-access.log`, `awaited-element-access-typecheck.log`,
  `awaited-element-access-restored-green.log`).
- A `typeof import` indexed annotation reported the same module-specifier row and
  `(typeof import('./broadcast'))['subscriptionFor'] reads a contract out of
service/broadcast.ts` (`typeof-import-indexed.patch`, `typeof-import-indexed.log`,
  `typeof-import-indexed-typecheck.log`, `typeof-import-indexed-restored-green.log`).
- An awaited dynamic import consumed as a property reported the module-specifier row and
  `subscriptionFor via service/broadcast.ts` (`awaited-property.patch`,
  `awaited-property.log`, `awaited-property-typecheck.log`,
  `awaited-property-restored-green.log`).
- A two-hop type re-export reported both hops through `service/broadcast.ts` and
  `service/optimizer-trigger-broadcaster.ts`. It also reported the root barrel's
  `./service/optimizer-trigger-broadcaster` module reference, for five rows total
  (`two-hop-chain.patch`, `two-hop-chain.log`, `two-hop-chain-typecheck.log`,
  `two-hop-chain-restored-green.log`).
- Deleting the compatibility-barrel exception reported
  `index.ts: './service/broadcast' hands out the contracts from service/broadcast.ts`
  (`barrel-permission-deleted.patch`, `barrel-permission-deleted.log`,
  `barrel-permission-deleted-restored-green.log`).
- Every route mutation failed the one named boundary assertion at 0 passed and 1 failed; faults
  3 through 15 also left `wbs-core:typecheck` at exit 0. Every passing file was restored with
  `cp`, matched with `cmp`, and the focused test reran green at 1 passed and 0 failed before the
  next mutation.
- With the two proof comments added, the focused boundary test passed 1 test with 0 failures and
  the proof-count block printed `proof-comments=2` (`slice-3-boundary-final.log`,
  `slice-3-proof-count-final.log`). Core type-check and lint passed
  (`slice-3-typecheck-lint.log`), the closing core suite remained `C=542`, `F=54` with 0 failures
  (`core-final.log`), and the repository-wide format check passed
  (`slice-3-format-check.log`).
- Strict OpenSpec validation reported 114 items, 114 passed and 0 failed, and its `jq -s -e`
  contract exited 0 (`openspec-validation.FfStD3.json`).

### Broadcast event port, Slice 4 — 2026-09-22

- Step 0 found 2 proof comments, the focused boundary test passed 1 test with 0 failures, and
  `wbs-core:typecheck` exited 0 (`slice-4-proof-count-baseline.log`,
  `slice-4-step0-boundary.log`, `slice-4-step0-typecheck.log`). The core baseline was `C=542`,
  `F=54`: 542 passed, 0 failed across 54 files (`core-baseline.log`).
- Pointing the scan root at `src/runtime/` threw `the program holds no
ports/project-event.ts`; 0 passed and 1 failed (`scan-root.patch`, `scan-root.log`,
  `scan-root-restored-green.log`).
- Pointing the config path at `tsconfig.absent.json` threw `Cannot read file
'…/tsconfig.absent.json'.`; 0 passed and 1 failed (`config-absent.patch`,
  `config-absent.log`, `config-absent-restored-green.log`).
- Adding `"module": "invalid"` to the real config threw `refused tsconfig.lib.json: 6046`;
  0 passed and 1 failed (`config-malformed.patch`, `config-malformed.log`,
  `config-malformed-restored-green.log`). Deleting the parsed-config guard with the same
  malformed option produced the false green: 1 passed and 0 failed
  (`config-guard-deleted.patch`, `config-guard-deleted.log`,
  `config-guard-deleted-restored-green.log`).
- Replacing the port with two statements and no export threw `ports/project-event.ts is not a
module`; 0 passed and 1 failed. `wbs-core:typecheck` also exited 1 because importers lost the
  contracts (`port-not-a-module.patch`, `port-not-a-module.log`,
  `port-not-a-module-typecheck.log`, `port-not-a-module-restored-green.log`).
- Adding `ports/missing.ts` to the scanned source paths threw `the program holds no
ports/missing.ts`; 0 passed and 1 failed (`missing-scanned-source.patch`,
  `missing-scanned-source.log`, `missing-scanned-source-restored-green.log`).
- Every fault was restored with `cp` and matched its saved passing bytes with `cmp` before the
  captured status was asserted and the focused test reran green.
- With the five guard proof comments added, the focused boundary test passed 1 test with 0
  failures and the proof-count block printed `proof-comments=7`
  (`slice-4-boundary-final.log`, `slice-4-proof-count-final.log`). The tsconfig and project-event
  port matched their pre-fault bytes (`slice-4-tsconfig-cmp.log`,
  `slice-4-project-event-cmp.log`). Core type-check and lint passed
  (`slice-4-typecheck-lint.log`), and the closing core suite remained `C=542`, `F=54` with 0
  failures (`core-final.log`).

### Broadcast event port, Slice 5 — 2026-09-22

- Step 0 found 7 proof comments and one production-only filter, and `wbs-core:typecheck`
  exited 0 (`slice-5-proof-count-baseline.log`, `slice-5-filter-baseline.log`,
  `slice-5-step0-typecheck.log`). The core baseline was `C=542`, `F=54`: 542 passed, 0 failed
  across 54 files (`core-baseline.log`).
- Widening the scan to every TypeScript file failed the named boundary assertion with 9 rows
  across 8 test files: `compose.test.ts: Broadcaster`; `service/broadcast.test.ts: ProjectEvent`;
  `service/estimate.test.ts: ProjectEvent`; `service/gateway-broadcaster.test.ts: ProjectEvent`
  and `subscriptionFor`; `service/optimizer-trigger-broadcaster.test.ts: ProjectEvent`;
  `service/plan-command-scope.test.ts: Broadcaster`; `service/plan-commands.test.ts: Broadcaster`;
  and `service/working-plan.test.ts: Broadcaster`, each via `service/broadcast.ts`. The run had
  0 passed and 1 failed (`slice-5-test-imports-red.log`).
- Exactly 8 test importers now name `ports/project-event.ts`; ESLint sorted those edits and the
  focused boundary check then passed 1 test with 0 failures
  (`slice-5-importers-eslint-fix.log`, `slice-5-boundary-green.log`).

- Replacing `service/working-plan.test.ts`'s port import with a named import from
  `./broadcast` reported `service/working-plan.test.ts: Broadcaster via
service/broadcast.ts`; 0 passed and 1 failed, while `wbs-core:typecheck` exited 0
  (`working-plan-test-import.patch`, `working-plan-test-import.log`,
  `working-plan-test-import-typecheck.log`). The passing file was restored with `cp`, matched
  its saved bytes with `cmp`, and the focused check returned to 1 passed and 0 failed
  (`working-plan-test-import-restore.log`, `working-plan-test-import-restored-green.log`).
- The final proof-comment count remained 7 and the focused boundary check passed 1 test with
  0 failures (`slice-5-proof-count-final.log`, `slice-5-boundary-final.log`). The closing core
  suite remained `C=542`, `F=54` with 0 failures (`core-final.log`), and core type-check and
  lint passed (`slice-5-typecheck-lint.log`).

### Broadcast event port, Slice 6 — 2026-09-22

- Classification baseline `K=95`; the existing `service/broadcast.ts` row was rewritten in place,
  and no classification was added for either file under `ports/`
  (`slice-6-kinds-baseline.txt`; closing count recorded below).
- Strict OpenSpec baseline `N=114`: 114 items passed and 0 failed under the `jq -s -e` contract
  (`openspec-validation-slice-6-baseline.0dWX3q.json`; closing total recorded below).
- The event contracts are a neutral port, not a service module: the module map's required
  preparation 1 sends `ProjectEvent`, `Broadcaster` and `subscriptionFor` to a neutral
  application event/port location, while its Realtime row says Realtime implements or consumes
  that port and does not own the event union or Plan commands' collector. The existing
  `GatewayBroadcaster` remains the production adapter and `OptimizerTriggerBroadcaster` remains
  composition-private decoration.
- The route check has six stated limitations. Each is assigned follow-up work under kind rules K2
  to K6 and preparations 3 and 4 of the 040.6 module map; naming them here is not evidence that
  the check prevents them:
  - Value-binding indirection through an exported binding is not prevented.
  - Duplicate or merged declarations under a contract's name are not prevented.
  - A named function expression under a contract's name is not prevented.
  - A `declare module` augmentation is not prevented.
  - A type alias is not prevented.
  - A differently named structural copy is not prevented.
- Deferred finding: the collector's move waits for task 5.2 because
  `import.service.ts:148` builds one too; moving it sooner would create the K6
  feature-to-feature edge the module map forbids.
- Deferred finding: `ports/project-event.ts` keeps its type-only import of
  `../service/numbered-work-item` until task 6.1 moves that file to the domain library.
- Pending planner verification: `wbs-be-01:test:unit` (rehearsed 519 passed, 0 failed across 49
  files), `wbs-be-01:test` (1091 passed, 0 failed across 92 files), `wbs-gw-01:test` (128 passed,
  0 failed across 17 files), `wbs-mcp-01:test` (165 passed, 0 failed across 15 files),
  `wbs-core:test` (542 passed, 0 failed across 54 files), `wbs-core:test:portable` (rehearsed exit
  0), and `tool-devsync:test` (366 passed, 0 failed). These whole targets remain planner-only in
  this execution environment.
- The closing classification count remained `K=95` (`slice-6-kinds-final.txt`). Strict OpenSpec
  validation remained `N=114`: 114 items passed and 0 failed under the `jq -s -e` contract
  (`openspec-validation-slice-6-final.Pr8oE5.json`).
- Core type-check, lint, and unit targets passed (`slice-6-core-closing.log`); the portable browser
  build passed (`slice-6-core-portable-build.log`); be-01 type-check passed
  (`slice-6-be-typecheck.log`); and the gw-01 and mcp-01 type-checks passed
  (`slice-6-gw-mcp-typecheck.log`).
- The repository-wide format check passed (`slice-6-format-check-final.log`).
- The host gate was not run in the executor sandbox and remains pending planner verification.

### Type-only preparations, Slice 1 — 2026-09-22

- Core baseline `C=542`, `F=54`: 542 passed, 0 failed across 54 files
  (`slice-1-core-baseline.log`). With the new boundary test, the closing run reached the required
  `C + 1=543` passes across `F + 1=55` files with 0 failures
  (`slice-1-core-closing.log`).
- The test-first red reported four routes from `service/plan-document.ts` to
  `service/calendar-marker.service.ts`: `'./calendar-marker.service'`,
  `CalendarMarkerListOutcome`, `ok`, and `value`; Bun printed `Expected - 1`, `Received + 6`,
  0 passed, and 1 failed (`slice-1-sideways-red.log`).
- `ports/calendar-marker-read.ts` now owns `CalendarMarkerReader`,
  `CalendarMarkerListOutcome`, `CalendarMarkerRefused`, `CalendarMarkerRefusal`, and
  `CalendarMarkerSubject`. The Calendar marker service retains compatibility re-exports for the
  four moved outcome names, while Plan document names the reader port.
- The focused boundary test then passed 1 test with 0 failures
  (`slice-1-sideways-green.log`). Core type-check and lint passed
  (`slice-1-typecheck-lint.log`); the be-01, gw-01, and mcp-01 type-checks passed
  (`slice-1-downstream-typecheck.log`); and the portable browser build passed
  (`slice-1-portable-build.log`). The five owned code paths passed their formatting check
  (`slice-1-prettier-check.log`).

### Type-only preparations, Slice 2 — 2026-09-22

- Core baseline `C=543`, `F=55`: 543 passed, 0 failed across 55 files
  (`slice-2-core-baseline.log`). The closing run remained unchanged at 543 passed, 0 failed
  across 55 files (`slice-2-core-closing.log`).
- Adding the three principal-owner rows first failed the named boundary assertion with 22 routes
  from the six checked consumers: eight import-specifier routes and fourteen identifier routes.
  Bun printed `Received + 24`, 0 passed, and 1 failed; observed rows included
  `use-cases/save-plan.ts: username reaches service/auth.service.ts`,
  `use-cases/run-command-batch.ts: scopes reaches service/auth.service.ts`, and
  `service/retention-timer.ts: InternalIdentity reaches http/endpoint.ts`
  (`slice-2-principal-routes-red.log`).
- `libs/wbs/domain/contracts/src/principal.ts` now declares `AuthenticatedUser` and
  `InternalIdentity`. `service/auth.service.ts` retains the former name as a compatibility
  re-export, and `http/endpoint.ts` retains both names while keeping `Identity` built from them.
  The four production use cases, retention timer, composition root, and three route/use-case
  tests now take their principal types from `@wbs/contracts`.
- The focused boundary test then passed 1 test with 0 failures
  (`slice-2-sideways-green.log`). Core type-check and lint passed
  (`slice-2-core-typecheck-lint.log`), and contracts type-check, lint, and test passed
  (`slice-2-contracts-checks.log`). The be-01, gw-01, mcp-01, and fe-01 type-checks passed
  (`slice-2-consumer-typechecks.log`), and the portable browser build passed
  (`slice-2-core-portable-build.log`).

### Type-only preparations, Slice 3 — 2026-09-22

- Step 0 found one `../repository/schema` import in each of
  `service/optimization-coordinator.ts` and `service/optimized-plan-read.test.ts`, and one
  `./broadcast` import in the coordinator. The initial be-01 type-check passed
  (`slice-3-step0-typecheck.log`).
- The coordinator now takes `SolverObjectiveName` from `@wbs/domain` and `ProjectEvent` from
  `@wbs/core`; the optimized-plan reader test takes `SolverObjectiveName` from `@wbs/domain`.
  The three old-path grep counts fell to zero (`slice-3-import-counts.log`).
- The focused sandbox-safe be-01 subset remained unchanged at `B=60` passed over `G=6` files,
  with 0 failures (`slice-3-be-subset-baseline.log`,
  `slice-3-be-subset-closing.log`). Be-01 type-check and lint passed
  (`slice-3-typecheck-lint.log`), and the core sideways-type boundary test passed 1 test with 0
  failures (`slice-3-sideways-boundary.log`).
- This slice does not prevent either import path from returning: be-01 has no type-identity
  boundary check, and the Optimization module of task 3.6 owns that rule. The focused subset
  also excludes four further eligible coordinator tests and the child-spawning
  `optimization-spawn-handshake.proc.db.test.ts`; the whole `wbs-be-01:test` target is pending
  planner verification.

### Type-only preparations, Slice 4 — 2026-09-22

- Step 0 found four route rows and zero proof comments. `wbs-core:typecheck` exited 0, the
  focused rule passed 1 test with 0 failures, and the core baseline was `C=543`, `F=55`: 543
  passed and 0 failed across 55 files (`slice-4-step0-typecheck.log`,
  `slice-4-step0-rule.log`, `slice-4-core-baseline.log`).
- Restoring Plan document's pre-move import reported
  `service/plan-document.ts: './calendar-marker.service' reaches
service/calendar-marker.service.ts` (`document-restored.patch`,
  `document-restored.log`, `document-restored-typecheck.log`,
  `document-restored-restored-green.log`). The type-only namespace reported the specifier,
  `CalendarMarkerListOutcome`, and `markerService` (`document-namespace-type.patch`,
  `document-namespace-type.log`, `document-namespace-type-typecheck.log`,
  `document-namespace-type-restored-green.log`).
- The marker-service value namespace reported the specifier, `markerService`, and
  `markerService['CalendarMarkerService']` (`document-value-namespace.patch`,
  `document-value-namespace.log`, `document-value-namespace-typecheck.log`,
  `document-value-namespace-restored-green.log`). The indexed `typeof import` reported its
  specifier and expression (`document-typeof-import.patch`, `document-typeof-import.log`,
  `document-typeof-import-typecheck.log`, `document-typeof-import-restored-green.log`). The
  bare import reported its specifier (`document-bare-import.patch`,
  `document-bare-import.log`, `document-bare-import-typecheck.log`,
  `document-bare-import-restored-green.log`).
- Importing `CalendarMarkerOutcome` through the core barrel reported
  `CalendarMarkerOutcome reaches service/calendar-marker.service.ts`
  (`document-barrel-outcome.patch`, `document-barrel-outcome.log`,
  `document-barrel-outcome-typecheck.log`, `document-barrel-outcome-restored-green.log`).
- Laundering `AuthenticatedUser` through Replay orchestrator remained a documented residual:
  1 passed and 0 failed with typecheck at exit 0 (`laundered-reexport.patch`,
  `laundered-reexport.log`, `laundered-reexport-typecheck.log`,
  `laundered-reexport-restored-green.log`).
- Through a value namespace of `index.ts`, element access reported
  `core['CalendarMarkerService']`, property access reported both `CalendarMarkerService` and
  `core.CalendarMarkerService`, plain destructuring reported `CalendarMarkerService`, and renamed
  destructuring also reported `CalendarMarkerService: markerClass`; all reached
  `service/calendar-marker.service.ts` (`barrel-element-access.patch`,
  `barrel-element-access.log`, `barrel-element-access-typecheck.log`,
  `barrel-element-access-restored-green.log`, `barrel-property-access.patch`,
  `barrel-property-access.log`, `barrel-property-access-typecheck.log`,
  `barrel-property-access-restored-green.log`, `barrel-destructuring.patch`,
  `barrel-destructuring.log`, `barrel-destructuring-typecheck.log`,
  `barrel-destructuring-restored-green.log`, `barrel-destructuring-renamed.patch`,
  `barrel-destructuring-renamed.log`, `barrel-destructuring-renamed-typecheck.log`,
  `barrel-destructuring-renamed-restored-green.log`).
- The absent owner row threw `the program holds no service/absent.service.ts`
  (`absent-owner-row.patch`, `absent-owner-row.log`, `absent-owner-row-restored-green.log`).
  The absent config threw `Cannot read file '…/tsconfig.absent.json'.`
  (`absent-tsconfig.patch`, `absent-tsconfig.log`, `absent-tsconfig-restored-green.log`).
  The malformed config made typecheck exit 1 and threw `refused tsconfig.lib.json: 6046`
  (`malformed-tsconfig.patch`, `malformed-tsconfig-typecheck.log`,
  `malformed-tsconfig.log`, `malformed-tsconfig-restored-green.log`). Deleting the parsed-config
  guard under the same malformed option kept typecheck at exit 1 but produced the required false
  green, 1 passed and 0 failed (`malformed-tsconfig-guard-deleted.patch`,
  `malformed-tsconfig-guard-deleted-typecheck.log`,
  `slice-4-malformed-tsconfig-guard-deleted.log`,
  `malformed-tsconfig-guard-deleted-restored-green.log`). Adding `ports/missing.ts` to the scan
  threw `the program holds no ports/missing.ts` (`missing-scanned-path.patch`,
  `missing-scanned-path.log`, `missing-scanned-path-restored-green.log`).
- Through the narrow Calendar marker forwarding file, a const key reported `markers[key]`, a
  computed binding reported `['CalendarMarkerService']: held`, and an indexed-access type reported
  `(typeof import('./replay-orchestrator'))[MarkerKey]`; each reached
  `service/calendar-marker.service.ts` (`forwarded-const-key.patch`,
  `forwarded-const-key.log`, `forwarded-const-key-typecheck.log`,
  `forwarded-const-key-restored-green.log`, `forwarded-computed-binding.patch`,
  `forwarded-computed-binding.log`, `forwarded-computed-binding-typecheck.log`,
  `forwarded-computed-binding-restored-green.log`, `forwarded-indexed-access.patch`,
  `forwarded-indexed-access.log`, `forwarded-indexed-access-typecheck.log`,
  `forwarded-indexed-access-restored-green.log`).
- The widened key reported `markers[key as keyof typeof markers]`, and the finite-union key
  reported `markers[key]`; both reached `service/calendar-marker.service.ts`
  (`forwarded-widened-key.patch`, `forwarded-widened-key.log`,
  `forwarded-widened-key-typecheck.log`, `forwarded-widened-key-restored-green.log`,
  `forwarded-union-key.patch`, `forwarded-union-key.log`,
  `forwarded-union-key-typecheck.log`, `forwarded-union-key-restored-green.log`). Casting the
  namespace's module identity away first remained the second documented residual: 1 passed and 0
  failed with typecheck at exit 0 (`forwarded-cast-base.patch`, `forwarded-cast-base.log`,
  `forwarded-cast-base-typecheck.log`, `forwarded-cast-base-restored-green.log`).
- Forwarding the primitive `TOKEN_TTL_SECONDS` and reading it as an indexed-access type reported
  `(typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS']`; the const-keyed value
  form reported `orchestrator[ttlKey]`. Both reached `service/auth.service.ts`
  (`forwarded-primitive-indexed-type.patch`, `forwarded-primitive-indexed-type.log`,
  `forwarded-primitive-indexed-type-typecheck.log`,
  `forwarded-primitive-indexed-type-restored-green.log`,
  `forwarded-primitive-const-key.patch`, `forwarded-primitive-const-key.log`,
  `forwarded-primitive-const-key-typecheck.log`,
  `forwarded-primitive-const-key-restored-green.log`).
- All seventeen injected reference routes failed the one named assertion with 0 passed and 1
  failed while their typechecks exited 0. The four guard faults failed with 0 passed and 1 failed;
  the two residuals and the guard-deleted false-green probe passed with 1 passed and 0 failed.
  Every fault was restored with `cp`, matched its saved passing bytes with `cmp`, and reran the
  focused rule green before the next fault.
- With the five proof comments added, the focused rule passed 1 test with 0 failures and the
  proof-count block printed `proof-comments=5` (`slice-4-boundary-final.log`,
  `slice-4-proof-count-final.log`). Core typecheck and lint exited 0
  (`slice-4-typecheck-lint.log`), and the closing core suite remained unchanged from its baseline
  at `C=543`, `F=55`, with 0 failures (`slice-4-core-closing.log`).

## The type-only preparations, 2026-09-22

- Task 1.3: `ports/calendar-marker-read.ts` declares `CalendarMarkerReader`,
  `CalendarMarkerListOutcome`, `CalendarMarkerRefused`, `CalendarMarkerRefusal` and
  `CalendarMarkerSubject`. `service/calendar-marker.service.ts` re-exports the **four** moved names
  (not `CalendarMarkerReader`, which only Plan document needs) and keeps `CalendarMarkerOutcome` as its
  own declaration; `service/plan-document.ts` names the reader. Slice 1 observed: `wbs-core` type-check
  and lint, the portable browser build, and the be-01, gw-01 and mcp-01 type-checks at exit 0, and the
  core suite moving from 542 passed over 54 files to 543 over 55, the one new file
  being the rule
  (`seeded/040-6-c-type-only-preparations.1.20260922T102114Z/slice-1-core-baseline.log`,
  `seeded/040-6-c-type-only-preparations.1.20260922T102114Z/slice-1-core-closing.log`).
- Task 1.4: `libs/wbs/domain/contracts/src/principal.ts` declares `AuthenticatedUser` and
  `InternalIdentity`. `service/auth.service.ts` re-exports `AuthenticatedUser` only;
  `http/endpoint.ts` re-exports both and keeps `Identity` built from them. The four use cases,
  `service/retention-timer.ts`, `compose.ts` and three test files take them from `@wbs/contracts`.
  Slice 2 observed: `wbs-contracts` type-check, lint and test at exit 0, and the core suite unchanged at
  543 over 55
  (`seeded/040-6-c-type-only-preparations.2.20260922T103704Z/slice-2-core-baseline.log`,
  `seeded/040-6-c-type-only-preparations.2.20260922T103704Z/slice-2-core-closing.log`).
- Task 1.6, first half: `apps/wbs/be-01/src/service/optimization-coordinator.ts` and
  `…/optimized-plan-read.test.ts` take `SolverObjectiveName` from `@wbs/domain`, and the coordinator
  takes `ProjectEvent` from `@wbs/core`. Slice 3 observed be-01 type-check and lint at exit 0 and its
  **focused sandbox-safe subset** (the six selected be-01 tests closest to the changed files; four further
  eligible ones, and the spawning `optimization-spawn-handshake.proc.db.test.ts`, are the planner's)
  unchanged at 60 passed over 6 files
  (`seeded/040-6-c-type-only-preparations.3.20260922T105840Z/slice-3-be-subset-baseline.log`,
  `seeded/040-6-c-type-only-preparations.3.20260922T105840Z/slice-3-be-subset-closing.log`). The whole
  `wbs-be-01:test` target is pending planner verification: two of its files bind a socket and the slice
  was dispatched without network.
- Preparation 6 of the module map was already met before this work and is recorded, not redone: the
  root supplies the optimizer's event callback at `apps/wbs/be-01/src/services.ts:149-150`, and
  `service/optimizer-trigger-broadcaster.ts:1` takes only the neutral port and an injected
  `inputChanged`, so neither feature imports the other.
- The one new safety check is `ports/sideways-type-boundaries.test.ts` ›
  `rejects the checked sideways-type import routes`. A type-only move has no runtime behaviour, so its
  production-path negative is this rule's red, not a behaviour test's: re-introducing a sideways type
  import leaves `wbs-core:typecheck` at exit 0 and fails this assertion. Slice 4 watched 17
  reference routes fail and 4 guards throw, including the false green the malformed-tsconfig
  guard prevents, and two probes recorded as **not** prevented, each with the literal fragment recorded
  beside its evidence basename; the guard's own log is
  `seeded/040-6-c-type-only-preparations.4.20260922T111104Z/slice-4-malformed-tsconfig-guard-deleted.log`.
- Stated limits of the rule. It compares resolved declaration files, never spelling, and what it rejects
  is the list of forms in the packet's section 6, each with a watched negative — not a category. **Two
  residuals were observed here returning `[]` with the type check at exit 0**: a selection whose base has
  had its module identity cast away first
  (`(markers as unknown as Record<string, unknown>)['CalendarMarkerService']`, fault 23), and a third file
  re-exporting an owner's own re-export of a **contracts** declaration, because what is reached then is the
  contracts declaration and nothing of the owner remains in it (fault 9). **Two further limits are
  analysis, not measured here**: value-binding indirection through an exported binding, and a structural
  copy or a duplicate declaration of the same shape — `ports/event-port-boundaries.test.ts` records the
  same two for its own rule after five rounds, which is attributed precedent rather than a measurement of
  this one. All four belong to kind rules K2 to K6. Six further forms the implementation handles are
  **unverified here** and claimed neither way: a dynamic `import(...)`, `import x = require(...)`, a
  renamed import, a `default` re-export, an `export * as ns` re-export and a multi-hop re-export chain.
  Nothing prevents the be-01 repository-schema type path returning: be-01 has no type-identity check, and
  task 3.6 owns that rule. `ports/event-port-boundaries.test.ts` says nothing about a file forwarding the
  Calendar marker service, which is out of that rule's scope and not a gap in it.
- Task 1.8 touched **five** entries, not four: Plan history's row became a shim under 2.1, and Plan
  commands and Saved plans each carry two rows. This slice observed the classification count unchanged
  at 95, and strict OpenSpec validation unchanged at 114 items passed and 0 failed before and after —
  the four files this slice wrote itself: `slice-5-kinds-before.txt`, `slice-5-kinds-after.txt`,
  `slice-5-openspec-before.json`, `slice-5-openspec-after.json`. `tool-devsync:test` is pending planner
  verification: its index checker refuses untracked files and it spawns processes.
- `wbs-domain` is not a synced main spec: `openspec spec list` names twelve capabilities and not that
  one, while 123 archived change deltas carry `specs/wbs-domain/`. The value is checkable against those
  deltas only, and syncing it is its own change.

### Wiki registration, Slice 1 — 2026-09-22

- The pre-edit `twilight-burokrat:typecheck` exited 0, and the focused pilot-policy baseline passed
  1 test with 0 failures and 27 assertions (`slice-1-typecheck-baseline.log`,
  `slice-1-pin-baseline.log`).
- Adding Plan history's index block before replacing the literal pin failed the named test with
  `module.application.plan-history` as one extra received entry: 0 passed, 1 failed and 21
  assertions (`slice-1-index-transition-red.log`). The structural replacement then passed 1 test
  with 0 failures and 27 assertions (`slice-1-pin-green.log`).
- Removing `boundary.infra.release-assembly` made the module/boundary comparison report
  `Expected: 5` and `Received: 6` (`policy-boundary-removed.patch`,
  `policy-boundary-removed.log`). Restoring the saved bytes matched with `cmp` and passed 1 test
  with 0 failures and 27 assertions (`policy-boundary-removed-restored-green.log`).
- Removing saved-plan's `module-index` block made the declared-module/index comparison report
  `Expected: true` and `Received: false` (`saved-plan-index-removed.patch`,
  `saved-plan-index-removed.log`). Restoring the saved bytes matched with `cmp` and passed 1 test
  with 0 failures and 27 assertions (`saved-plan-index-removed-restored-green.log`).
- The final `twilight-burokrat:typecheck` and `twilight-burokrat:lint:source` targets exited 0
  (`slice-1-typecheck-final.log`, `slice-1-lint-source.log`).

### Wiki registration, Slice 2 — 2026-09-22

- The slice began at `253df36d4681b89eba4f17db350ea2a012b25a30` with `M=6` module mappings
  and `B=6` trusted boundaries. The pilot source revision carried
  `100644 blob 8c0889017328a5c160a827ab712a9a5ea975a22a` at
  `libs/core/src/service/history.service.ts` (`slice-2-base.txt`).
- The pre-edit `twilight-burokrat:typecheck` exited 0. The legacy-occurrence pin baseline passed
  1 test with 0 failures and 1 assertion, and the whole pilot-policy baseline passed 21 tests with
  0 failures and 293 assertions (`slice-2-typecheck-baseline.log`,
  `slice-2-legacy-pin-baseline.log`, `slice-2-pilot-policy-baseline.log`).
- Adding only `module.application.plan-history` to the module mapping failed the named parity test
  with `Expected: 6` and `Received: 7`, 0 passed and 1 failed
  (`slice-2-registration-red.log`). Adding the matching
  `boundary.application.plan-history` made the focused test pass 1 test with 0 failures and 28
  assertions, and the whole pilot-policy file pass 21 tests with 0 failures and 294 assertions
  (`slice-2-registration-green.log`, `slice-2-pilot-policy-green.log`).
- The unchanged legacy-occurrence pin then failed with `historical policy selector or baseline`
  moving from 39 to 41, occurrences from 257 to 259, and digest
  `2f0d2926e8d85aed7089c3ad667f7a0f6ccb97c514152a9895893978fab3f22d` changing to
  `55fafcaf0420dd5b2e0018b0a0dd467b7c3b8fae950eca69e72a99f52364b725`, with no
  unclassified entries (`slice-2-legacy-pin-red.log`, `legacy-pin-repin.patch`). After re-pinning,
  the focused test passed 1 test with 0 failures and 1 assertion
  (`slice-2-legacy-pin-green.log`).
- The final `twilight-burokrat:typecheck` exited 0 (`slice-2-typecheck-final.log`).

### Wiki registration, Packet D — 2026-09-22

- Slice 1 added Plan history's `module-index` block and replaced the pilot test's literal mapping
  pins with mapping/boundary parity and discovered-index checks. Slice 2 registered
  `module.application.plan-history` and `boundary.application.plan-history` as a full pilot member.
  The boundary's `sourceSelector` binds the new directory to its pre-move source at the pilot's
  frozen revision; `apps/wiki/cli/src/policy/trust.ts:388-426` validates that the source selector
  matches the boundary selector kind and contains every baseline entry.
- Task 7.5 now records only the delivered index and pilot-mapping scope. Label agreement between a
  README `moduleId` and the label passed to `buildModule` remains explicitly deferred; see packet
  D's "Deferred: label agreement." Discovering a sealed module with no registration is also
  outside this task's narrower declared-registration guarantee.
- Strict OpenSpec validation was unchanged by slice 3: before editing it reported 114 items, 114
  passed and 0 failed (`slice-3-openspec-before.json`); after editing it reported the same 114
  items, 114 passed and 0 failed (`openspec-validation.mKxFrs.json`).
- Pending planner verification: the final whole `pilot-policy.test.ts` file (rehearsed at 21
  passed, 0 failed); `twilight-burokrat:test` (rehearsed at 764 passed, 0 failed and 6702
  assertions across 39 files); `tool-devsync:test` (rehearsed at 366 passed, 0 failed); and
  `bin/h2puni-gate.sh <sha>` (not run in rehearsal or the executor sandbox).

### Bounded replay sweep, Slice 1 — 2026-09-23

- The whole-core baseline was `C=543` passed, 0 failed across `F=55` files
  (`slice-1-core-baseline.log`). Before implementation, the new module test failed because
  `./check` did not exist: 0 passed, 1 failed and 1 error (`slice-1-module-red.log`). Its first
  green passed 6 tests with 0 failures and 9 assertions (`slice-1-module-green.log`).
- Returning the bag beside `retention` failed the installer-surface test's first assertion:
  `Object.keys(exposed)` received `["retention", "bag"]`, with 0 passed, 1 failed and 5 filtered
  out (`proof-installer-leaks-bag.patch`, `proof-installer-leaks-bag.log`). Keeping the key list
  correct but attaching `resolve` to the returned timer failed the second assertion with
  `Expected: true`, `Received: false`, also 0 passed, 1 failed and 5 filtered out
  (`proof-installer-exposes-resolve.patch`, `proof-installer-exposes-resolve.log`). The
  `wbs-core:typecheck` target still exited 0 for both mutations
  (`proof-installer-leaks-bag-typecheck.log`, `proof-installer-exposes-resolve-typecheck.log`).
  Each saved version was restored byte-for-byte with `cmp`, and the named test passed afterward
  (`proof-installer-leaks-bag-restored-green.log`,
  `proof-installer-exposes-resolve-restored-green.log`).
- Exporting `retentionOptions` made the module suite report 3 passed and 3 failed:
  `resolve('retentionOptions')` no longer threw, the graph exposed the bare key, and the missing
  dependency message lost the module label (`proof-private-binding-exported.patch`,
  `proof-private-binding-exported.log`). Dropping the module label made only the two label tests
  fail, for 4 passed and 2 failed (`proof-module-label-dropped.patch`,
  `proof-module-label-dropped.log`). Both files were restored byte-for-byte with `cmp`, and the
  full module suite returned to 6 passed and 0 failed
  (`proof-private-binding-exported-restored-green.log`,
  `proof-module-label-dropped-restored-green.log`).
- Importing `Identity` from `../../http/endpoint` into the moved timer failed the sideways-route
  suite with both the module-specifier and identifier violations reaching `http/endpoint.ts`, 0
  passed and 1 failed (`proof-http-sideways-import.patch`, `proof-http-sideways-import.log`).
  Importing `AuthenticatedUser` from `../../service/auth.service` independently failed it with
  only the `service/auth.service.ts` violation and no HTTP entry, also 0 passed and 1 failed
  (`proof-auth-sideways-import.patch`, `proof-auth-sideways-import.log`). Removing the new
  Authentication route while the HTTP fault remained left the same two HTTP violations, proving
  the new row independently (`proof-auth-row-independent.patch`,
  `proof-auth-row-independent.log`). Every mutation was restored byte-for-byte with `cmp`, and
  the boundary suite passed after each restoration (`proof-http-sideways-import-restored-green.log`,
  `proof-auth-sideways-import-restored-green.log`,
  `proof-auth-row-independent-restored-green.log`).
- The final focused checks passed 6 module tests and 1 boundary test with 0 failures
  (`slice-1-module-final.log`, `slice-1-sideways-final.log`). The whole-core closing run delivered
  the required relative delta, `C+6=549` passed and 0 failed across `F+1=56` files
  (`slice-1-core-closing.log`). The final `wbs-core` lint and typecheck targets both exited 0
  (`slice-1-closing-lint-typecheck.log`).

### Bounded replay sweep, Slice 2 — 2026-09-23

- Classification baseline `K=95`; rewriting the three retained compatibility-shim rows in place
  kept the count at 95 (`slice-2-kinds-final.txt`).
- Core baseline `C=549`: 549 passed, 0 failed across 56 files before composition-root wiring
  (`slice-2-core-baseline.log`). The closing run remained 549 passed, 0 failed across 56 files
  (`slice-2-core-final.log`).
- Core and domain unit, lint and type-check targets all passed
  (`slice-2-core-domain-nx.log`).
- The portable build exited 0, and the bundle contained 1 occurrence of
  `application.bounded-replay-sweep` (`slice-2-portable-build.log`,
  `slice-2-portable-label-count.txt`).
- The focused be-01 shim-chain checks passed 13 tests with 0 failures and 37 assertions
  (`slice-2-be-focused-tests.log`); be-01 type-check exited 0
  (`slice-2-be-typecheck.log`).

### Bounded replay sweep, Slice 3 — 2026-09-23

- Wiki-policy baselines were `M=7` mapped modules and `B=7` boundaries. The frozen predecessor
  tuple was `100644 blob 95be165f6581580326f3e10e40de1304138601d2
libs/core/src/use-cases/retention-sweep.ts`. The pilot baseline passed 21 tests with 0 failures
  and `P=294` assertions (`slice-3-pilot-baseline.log`); core type-check and the filtered legacy
  pin were also green (`slice-3-core-typecheck-baseline.log`,
  `slice-3-legacy-pin-baseline.log`).
- With the mapping row added before its boundary, the named pilot test failed at mapping/boundary
  parity with `Expected: 7`, `Received: 8` (`slice-3-mapping-count-red.log`). Five other cases in
  the full file also failed because their fresh candidates saw the committed README without its
  uncommitted module-index metadata. After adding the boundary but before adding the README to
  `pilotPaths`, the named test failed at discovered-index coverage with `Expected: true`,
  `Received: false` (`slice-3-discovered-index-red.log`); the same five additional cases failed
  for the same invisible-README reason. Adding the path returned the whole file to 21 passed, 0
  failed and `P+1=295` assertions (`slice-3-pilot-green.log`).
- Registration moved the filtered legacy pin's `historical policy selector or baseline` category
  from 41 to 43, occurrences from 259 to 261, and digest from
  `55fafcaf0420dd5b2e0018b0a0dd467b7c3b8fae950eca69e72a99f52364b725` to
  `fb0d422785019f2351c00082e4533b820b0aca3cce8f9789a348e6167099363e`
  (`slice-3-legacy-pin-red.log`). The filtered test then passed 1 test with 0 failures and 1
  assertion (`slice-3-legacy-pin-green.log`).
- Strict OpenSpec validation stayed at `N=114` passed and 0 failed before and after this slice
  (`openspec-validation-baseline.uudZp9.json`, `openspec-validation-final.jklwzl.json`). Final core
  and wiki-CLI type-checks and wiki source lint exited 0 (`slice-3-core-typecheck-final.log`,
  `slice-3-wiki-typecheck.log`, `slice-3-wiki-lint-source.log`).

### Realtime, Slice 1 — 2026-09-23

- The whole-core baseline was `C=549` passed, 0 failed and 1,810 assertions across `F=56` files
  (`slice-1-core-baseline.log`). Before implementation, the new module test failed because
  `./check` did not exist: 0 passed, 1 failed and 1 error (`slice-1-module-red.log`). Its first
  green passed 6 tests with 0 failures and 13 assertions (`slice-1-module-green.log`).
- Returning the bag beside `replayBuffer`, `broadcaster` and `replay` failed the installer-surface
  test's first assertion: the received keys included extra `"bag"`, with 0 passed, 1 failed and 5
  filtered out (`row-3-bag-leak.patch`, `row-3-bag-leak.log`). Keeping the key list correct but
  attaching `resolve` to the returned broadcaster failed the second assertion with
  `Expected: true`, `Received: false`, also 0 passed, 1 failed and 5 filtered out
  (`row-4-exposed-resolver.patch`, `row-4-exposed-resolver.log`). The `wbs-core:typecheck` target
  still exited 0 for both mutations (`row-3-bag-leak-typecheck.log`,
  `row-4-exposed-resolver-typecheck.log`). Each saved version was restored byte-for-byte with
  `cmp`, and the named test passed afterward (`row-3-bag-leak-restored.log`,
  `row-4-exposed-resolver-restored.log`, `row-3-typecheck-restored-green.log`,
  `row-4-typecheck-restored-green.log`).
- Exporting `broadcasterOptions` made the module suite report 3 passed and 3 failed:
  `resolve('broadcasterOptions')` no longer threw, the graph exposed the bare key, and the missing
  dependency message lost the module label (`row-5-broadcaster-options-export.patch`,
  `row-5-broadcaster-options-export.log`). Exporting `replayOptions` independently made its own
  privacy and label assertions fail while `broadcasterOptions` remained hidden and labelled, for
  4 passed and 2 failed (`row-6-replay-options-export.patch`,
  `row-6-replay-options-export.log`). Dropping the module label made only the two label tests fail,
  for 4 passed and 2 failed (`row-7-dropped-label.patch`, `row-7-dropped-label.log`). Each file was
  restored byte-for-byte with `cmp`, and the full module suite returned to 6 passed and 0 failed
  (`row-5-broadcaster-options-export-restored.log`,
  `row-6-replay-options-export-restored.log`, `row-7-dropped-label-restored.log`).
- Importing `Identity` from `../../http/endpoint` into the moved broadcaster failed the
  sideways-route suite with both the module-specifier and identifier violations reaching
  `http/endpoint.ts`, 0 passed and 1 failed (`row-8-http-endpoint-sideways.patch`,
  `row-8-http-endpoint-sideways.log`). Importing `AuthenticatedUser` from
  `../../service/auth.service` independently failed it with only the `service/auth.service.ts`
  violation and no HTTP entry, also 0 passed and 1 failed (`row-9-auth-service-sideways.patch`,
  `row-9-auth-service-sideways.log`). Each mutation was restored byte-for-byte with `cmp`, and the
  boundary suite passed after each restoration (`row-8-http-endpoint-sideways-restored.log`,
  `row-9-auth-service-sideways-restored.log`).
- The final focused checks passed 6 module tests and 1 boundary test with 0 failures
  (`slice-1-module-final.log`, `slice-1-sideways-final.log`). The whole-core closing run delivered
  the required relative delta, `C+6=555` passed and 0 failed with 1,823 assertions across
  `F+1=57` files (`slice-1-core-closing.log`). The final `wbs-core` lint and typecheck targets both
  exited 0 (`slice-1-closing-lint-typecheck.log`).

### Realtime, Slice 2 — 2026-09-23

- Classification baseline `K=95`; rewriting the four retained compatibility-shim rows in place
  kept the count at 95 (`slice-2-kinds-final.txt`).
- Core baseline `C=555`: 555 passed, 0 failed and 1,823 assertions across 57 files before
  composition-root wiring (`slice-2-core-baseline.log`). The closing run remained 555 passed, 0
  failed and 1,823 assertions across 57 files (`slice-2-core-final.log`).
- The pre-edit `wbs-domain` unit, lint and type-check gates exited 0
  (`slice-2-domain-baseline.log`). After the edit, the `wbs-core` and `wbs-domain` unit, lint and
  type-check gates all exited 0 (`slice-2-core-domain-green.log`).
- The portable build exited 0, and its bundle contained 1 occurrence of
  `application.realtime` (`slice-2-portable-build.log`,
  `slice-2-portable-label-count.txt`).
- The be-01 type-check exited 0 both before and after the edit
  (`slice-2-be-typecheck-baseline.log`, `slice-2-be-typecheck-green.log`). The focused be-01
  shim-chain checks were unchanged at 38 passed, 0 failed and 89 assertions across 4 files
  (`slice-2-be-focused-baseline.log`, `slice-2-be-focused-green.log`).

### Realtime, Slice 3 — 2026-09-23

- Wiki-policy baselines were `M=8` mapped modules and `B=8` boundaries. The frozen predecessor
  tuple was `100644 blob d18bf8e74e82501358dd994e2226a87e068b9220
libs/core/src/use-cases/replay.ts`. The pilot baseline passed 21 tests with 0 failures and `P=295`
  assertions (`slice-3-pilot-baseline.log`); core type-check and the filtered legacy pin were also
  green (`slice-3-core-typecheck-baseline.log`, `slice-3-legacy-pin-baseline.log`).
- With the mapping row added before its boundary, the named pilot test failed at mapping/boundary
  parity with `Expected: 8`, `Received: 9`; the whole file reported 15 passed, 6 failed and 260
  assertions (`slice-3-mapping-count-red.log`). After adding the boundary but before adding the
  README to `pilotPaths`, parity passed and the named test failed at discovered-index coverage
  with `Expected: true`, `Received: false`; this run reported 15 passed, 6 failed and 264
  assertions, one fewer collateral failure than the packet's rehearsal
  (`slice-3-discovered-index-red.log`). Adding the path returned the whole file to 21 passed, 0
  failed and `P+1=296` assertions (`slice-3-pilot-green.log`).
- Registration moved the filtered legacy pin's `historical policy selector or baseline` category
  from 43 to 45, occurrences from 261 to 263, and digest from
  `fb0d422785019f2351c00082e4533b820b0aca3cce8f9789a348e6167099363e` to
  `a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4`
  (`slice-3-legacy-pin-red.log`). The filtered test then passed 1 test with 0 failures and 1
  assertion (`slice-3-legacy-pin-green.log`).
- `tool-devsync:typecheck`, `tool-devsync:lint`, `twilight-burokrat:typecheck` and
  `twilight-burokrat:lint:source` all exited 0 before editing
  (`slice-3-tool-devsync-typecheck-baseline.log`, `slice-3-tool-devsync-lint-baseline.log`,
  `slice-3-wiki-typecheck-baseline.log`, `slice-3-wiki-lint-baseline.log`) and after their owned
  edits (`slice-3-tool-devsync-typecheck-green.log`, `slice-3-tool-devsync-lint-green.log`,
  `slice-3-wiki-typecheck-green.log`, `slice-3-wiki-lint-green.log`). Final core type-check also
  exited 0 (`slice-3-core-typecheck-final.log`).
- Strict OpenSpec validation stayed at `N=114` passed and 0 failed before and after this slice
  (`openspec-validation-baseline.K03o8G.json`, `openspec-validation-final.QQTy1A.json`).

### Plan import, Slice 1 — 2026-09-23

- The whole-core baseline was `C=555` passed, 0 failed across `F=57` files
  (`slice1-core-baseline.log`). Before implementation, the new module test failed because
  `./check` did not exist: 0 passed, 1 failed and 1 error (`slice1-module-red.log`). Its first
  green passed 6 tests with 0 failures and 8 assertions (`slice1-module-green.log`).
- Exporting `importOptions` made the module suite report 3 passed and 3 failed:
  `resolve('importOptions')` returned the raw options object, `inspectGraph()` reported the bare
  `importOptions` key rather than `application.plan-import/importOptions`, and the missing-
  requirement message lost the module label (`row3-private-binding-exported.patch`,
  `row3-private-binding-exported.log`). Dropping the module label independently left only the two
  label assertions failing, for 4 passed and 2 failed (`row4-label-dropped.patch`,
  `row4-label-dropped.log`). Each passing version was restored byte-for-byte with `cmp`, and the
  full module suite returned to 6 passed and 0 failed (`row3-restored-green.log`,
  `row4-restored-green.log`).
- Returning a structurally assignable object containing `bag` failed the installer-surface test's
  first assertion: the received keys included `bag`, with 5 passed and 1 failed
  (`row5-installer-bag-leak.patch`, `row5-installer-bag-leak.log`). Keeping the key list correct
  but attaching `resolve` to the returned `ImportService` failed the second assertion with
  `Expected: true`, `Received: false`, also 5 passed and 1 failed
  (`row6-installer-resolver-leak.patch`, `row6-installer-resolver-leak.log`). Each passing version
  was restored byte-for-byte with `cmp`, and the module suite passed afterward
  (`row5-restored-green.log`, `row6-restored-green.log`).
- Importing `Identity` from `../../http/endpoint` into `plan-import.feature.ts` failed the
  sideways-route suite with both the module-specifier and identifier violations reaching
  `http/endpoint.ts`, 0 passed and 1 failed (`row7-http-endpoint-route.patch`,
  `row7-http-endpoint-route.log`). Importing `AuthenticatedUser` from
  `../../service/auth.service` independently failed it with only the `service/auth.service.ts`
  violation and no HTTP entry, also 0 passed and 1 failed (`row8-auth-service-route.patch`,
  `row8-auth-service-route.log`). Each passing version was restored byte-for-byte with `cmp`, and
  the boundary suite passed after each restoration (`row7-restored-green.log`,
  `row8-restored-green.log`).
- `contract.ts` records preserved K3 debt tracked under task 7.4: direct
  `scope.stores.projects.create`, `priorityBands.replace`, `capacity.set` and
  `subtrees.insertSubtree` calls remain inside `ImportService.import`'s own `UnitOfWork.run`.

### Plan import, Slice 2 — 2026-09-23

- Classification baseline `K=95`; rewriting the two retained compatibility-shim rows in place
  kept the count at 95 (`slice2-kinds-closing.txt`).
- Core baseline `C=561`: 561 passed, 0 failed and 1,831 assertions across 58 files before
  composition-root wiring (`slice2-core-baseline.log`). The closing run remained 561 passed, 0
  failed and 1,831 assertions across 58 files (`slice2-core-closing.log`).
- The pre-edit `wbs-domain` unit, lint and type-check gates exited 0
  (`slice2-wbs-domain-baseline.log`). After the edit, the `wbs-core` and `wbs-domain` unit, lint
  and type-check gates all exited 0 (`slice2-core-domain-closing.log`).
- The portable build exited 0, and its bundle contained 1 occurrence of
  `application.plan-import` (`slice2-portable-build.log`,
  `slice2-portable-label-count.txt`).
- The be-01 type-check exited 0 both before and after the edit
  (`slice2-wbs-be-01-typecheck-baseline.log`, `slice2-wbs-be-01-typecheck-closing.log`).
- The SQLite focused tests were unchanged from baseline to closing at 13 passed, 0 failed and 84
  assertions across 2 files (`slice2-sqlite-baseline.log`, `slice2-sqlite-closing.log`). The
  memory focused test was unchanged at 12 passed, 0 failed and 71 assertions across 1 file
  (`slice2-memory-baseline.log`, `slice2-memory-closing.log`).

### Plan import, Slice 3 — 2026-09-23

- Wiki-policy baselines were `M=9` mapped modules and `B=9` boundaries. At the frozen
  `sourceRevision` `7851161bf96312750d07b933ca5d42b75ce575c7`, `git ls-tree` returned no tuple for
  either `libs/core/src/service/import.service.ts` or
  `libs/core/src/service/prepare-import.ts`; the packet's section 3 and section 6 record the
  planner's separate wiki-pilot refusal measurements.
- Before the README edit, the whole pilot-policy file passed `T=21` tests with `TF=0` failures and
  `P=296` assertions (`slice3-pilot-baseline.log`). After adding the inert, unregistered
  `module-index` block, the same file remained exactly `21` passed, `0` failed and `296`
  assertions (`slice3-pilot-after-readme.log`). This is the prescribed non-regression result, not
  proof of pilot registration.
- Core type-check exited 0 before and after the documentation edits
  (`slice3-core-typecheck-baseline.log`, `slice3-core-typecheck-final.log`).
- Strict OpenSpec validation remained `N=114` passed and 0 failed before and after this slice
  (`openspec-validation-baseline.NVABYn.json`,
  `openspec-validation-slice3-final.1YEKZK.json`).

### Authentication, Slice 1 — 2026-09-23

- The slice started from `base=31cf2b4ef6ceba90932d22b09b95bad95209cb4a`. The whole-core baseline
  was `C=561` passed, 0 failed across `F=58` files (`slice1-core-baseline.log`). Before
  implementation, the new module test failed because `./check` did not exist: 0 passed, 1 failed
  and 1 error (`slice1-module-red.log`). Its first green passed 11 tests with 0 failures and 16
  assertions across 2 files (`slice1-module-green.log`).
- Exporting `authOptions` alone made host resolution return the raw options and graph inspection
  report bare `authOptions`: 7 passed and 2 failed, while the independent `throttleOptions`
  privacy and missing-requirement tests stayed green (`row3-auth-options-exported.patch`,
  `row3-auth-options-exported.log`). Independently exporting `throttleOptions` made host
  resolution return its raw options, graph inspection report bare `throttleOptions`, and the
  missing-requirement message lose the module label: 6 passed and 3 failed, while `authOptions`
  privacy stayed green (`row3b-throttle-options-exported.patch`,
  `row3b-throttle-options-exported.log`). Dropping the label independently made graph inspection
  report both private bindings unlabelled and the missing-requirement message name bare
  `throttleOptions`: 7 passed and 2 failed (`row4-label-dropped.patch`,
  `row4-label-dropped.log`). Each passing `module.ts` was restored byte-for-byte with `cmp`, and
  the module test returned to 9 passed and 0 failed (`row3-restored-green.log`,
  `row3b-restored-green.log`, `row4-restored-green.log`).
- Returning a structurally assignable object containing `bag` failed the installer-surface test's
  first assertion because the received keys gained `bag`, with 8 passed and 1 failed
  (`row5-installer-bag-leak.patch`, `row5-installer-bag-leak.log`). Keeping the key list correct
  but attaching `resolve` to the returned `AuthService` failed the second assertion with
  `Expected: true`, `Received: false`, also 8 passed and 1 failed
  (`row6-installer-resolver-leak.patch`, `row6-installer-resolver-leak.log`). Each passing
  `check.ts` was restored byte-for-byte with `cmp`, and the module test returned to 9 passed and 0
  failed (`row5-restored-green.log`, `row6-restored-green.log`).
- Removing `NonNullable<AuthServiceOptions['identities']>` from the combined-store requirement
  made `wbs-core:typecheck` fail with `TS2578: Unused '@ts-expect-error' directive` at the
  compile-negative fixture and collateral `TS2741: Property 'resolveOidcIdentity' is missing in
type 'UserStore'` at the `authOptions` factory (`row7-combined-store-weakened.patch`,
  `row7-combined-store-weakened.log`). Restoring `contract.ts` byte-for-byte with `cmp` returned
  type-check to exit 0 (`row7-restored-green.log`).
- Five independent imports failed the sideways-route assertion with 0 passed and 1 failed each:
  `use-cases/run-command-batch.ts` reaching the Authentication implementation
  (`row8-use-cases-authentication-route.patch`, `row8-use-cases-authentication-route.log`),
  `module/bounded-replay-sweep/retention-timer.ts` reaching it
  (`row9-bounded-replay-authentication-route.patch`,
  `row9-bounded-replay-authentication-route.log`),
  `module/realtime/gateway-broadcaster.ts` reaching it
  (`row10-realtime-authentication-route.patch`, `row10-realtime-authentication-route.log`),
  `module/plan-import/plan-import.feature.ts` reaching it
  (`row11-plan-import-authentication-route.patch`,
  `row11-plan-import-authentication-route.log`), and Authentication's own feature reaching
  `http/endpoint.ts` by both module specifier and `Identity` identifier
  (`row12-authentication-http-endpoint-route.patch`,
  `row12-authentication-http-endpoint-route.log`). Each mutated source was restored
  byte-for-byte with `cmp`, and the boundary suite returned to 1 passed and 0 failed after each
  restoration (`row8-restored-green.log`, `row9-restored-green.log`,
  `row10-restored-green.log`, `row11-restored-green.log`, `row12-restored-green.log`).
- `AuthenticationRequirements` records preserved K3 debt tracked under task 7.4: `AuthService`
  still calls the `users.create`, `users.findByUsername`, `users.findById` and
  `identities.resolveOidcIdentity` repository ports directly. This extraction discloses that debt;
  it does not claim to close it.
- The closing whole-core run reached the required relative delta, `C + 9 = 570` passed, 0 failed
  across `F + 1 = 59` files (`slice1-core-closing.log`). Closing `wbs-core` lint and type-check
  both exited 0 (`slice1-core-lint-typecheck-closing.log`), and the repository-wide format check
  exited 0 (`slice1-format-check.log`). Strict OpenSpec validation reported 114 passed and 0
  failed (`openspec-validation-slice1-final.hz0Hon.json`).

### Authentication, Slice 2 — 2026-09-23

- The slice started from `base=76b49c19ee1009abdfdd3c4de39595bf5a95c13b`. Classification
  baseline `K=95`; rewriting the two compatibility-shim rows in place kept the count at 95
  (`slice2-kinds-count.log`).
- The whole-core baseline was `C=570` passed, 0 failed and 1,843 assertions across `F=59` files
  (`slice2-core-baseline.log`). The closing run remained 570 passed, 0 failed across 59 files,
  with the two new assertions raising the assertion count to 1,845
  (`slice2-core-closing.log`).
- On the unchanged composition root, the accountless throttle negative made
  `wbs-core:typecheck` fail with `TS2578: Unused '@ts-expect-error' directive`, one error
  (`slice2-red-typecheck.log`); the focused runtime test received a real `LoginThrottle` instead
  of `undefined`, with 0 passed and 1 failed (`slice2-red-accountless-runtime.log`). After moving
  the throttle to the accountful graph, the composition file passed 8 tests with 0 failures and
  28 assertions (`slice2-compose-green.log`).
- The portable build exited 0 before and after the edit
  (`slice2-portable-build-baseline.log`, `slice2-portable-build-green.log`), and the closing
  bundle contained 1 occurrence of `application.authentication`
  (`slice2-portable-grep.log`).
- The be-01 type-check exited 0 both before and after the edit
  (`slice2-be-typecheck-baseline.log`, `slice2-be-typecheck-green.log`). The closing `wbs-core`
  unit, lint and type-check gate also exited 0 (`slice2-core-test-lint-typecheck-green.log`).

### Authentication, Slice 3 — 2026-09-23

- The slice started from `base=a5ae36a3fd1a8c89ab1fca169a3586faad9f9a4c`, with `M=9` mapped
  modules and `B=9` trusted boundaries. At frozen revision
  `7851161bf96312750d07b933ca5d42b75ce575c7`, Authentication's selected predecessor was
  `100644 blob 73c84b20a377349c4fd215cb90a4807ef3370267`
  `libs/core/src/service/auth.service.ts` (`slice3-step0.log`).
- Before registration, the whole pilot-policy file passed 21 tests with 0 failures and `P=296`
  assertions (`slice3-pilot-baseline.log`). Adding only the mapping row failed the exact parity
  assertion with `Expected: 9`, `Received: 10` (`row14-wiki-policy-parity.patch`,
  `row14-wiki-policy-parity.log`). After adding the matching boundary while the README was still
  outside `pilotPaths`, parity and the structural baseline comparison passed, then the discovered
  index assertion failed with `Expected: true`, `Received: false` after 25 assertions
  (`row15-wiki-policy-discovered-index.patch`, `row15-wiki-policy-discovered-index.log`). Each
  fault was restored byte-for-byte with `cmp` and the focused test returned to 1 pass before the
  registration was reapplied (`row14-restored-green-corrected.log`,
  `row15-restored-green.log`). With the README and `pilotPaths` entry present, the whole file
  passed 21 tests with 0 failures and `P + 1 = 297` assertions
  (`slice3-pilot-registration-green.log`).
- The unchanged legacy pin passed before registration (`slice3-legacy-pin-baseline.log`). The
  registration then failed it with `historical policy selector or baseline` moving from 45 to 47,
  occurrences from 263 to 265, and digest from
  `a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4` to
  `3eca3cf1a2f8d1703b42edfd40be279a5a144034c000a812d7b70eb8b2cfef62`, with no unclassified
  entries (`row17-registration-moves-legacy-pin.patch`, `row17-legacy-pin-red.log`). Restoring the
  policy byte-for-byte returned the pin to 1 pass (`row17-restored-green.log`); reapplying the
  registration and those exact pin values also passed (`row17-legacy-pin-green.log`).
- `tool-devsync:typecheck`, `twilight-burokrat:typecheck`,
  `twilight-burokrat:lint:source` and `tool-devsync:lint` all exited 0 before the edits and after
  them (`slice3-baseline-typechecks.log`, `slice3-baseline-burokrat-lint.log`,
  `slice3-baseline-devsync-lint.log`, `slice3-final-typechecks.log`,
  `slice3-final-burokrat-lint.log`, `slice3-final-devsync-lint.log`). `wbs-core:typecheck` also
  exited 0 after the registration (`slice3-core-typecheck.log`).
- Strict OpenSpec validation stayed at `N=114` passed and 0 failed before and after this slice
  (`openspec-validation-baseline.2MGeen.json`,
  `openspec-validation-slice3-final.j5lVF0.json`).

### Saved plans, Slice 1 — 2026-09-23

- The slice started from `base=06dd588ff51d0e29b0ad24a30abf704e860839f5` on a clean tree with the
  module directory absent, `saved-plan.service.ts` at 996 lines, `use-cases/save-plan.ts` at 60
  lines and `K=95` `kinds.json` entries. Before any edit, `wbs-core` lint and type-check and
  `wbs-be-01:typecheck` exited 0 (`slice1-core-gate-baseline.log`,
  `slice1-be01-typecheck-baseline.log`); the core suite passed `C=570` tests over `F=59` files
  (`slice1-core-baseline.log`) and the be-01 saved-plan files passed `E=124` tests over `EF=13`
  files (`slice1-be01-saved-baseline.log`).
- Red: with only `module/saved-plans/module.test.ts` present, the file failed with
  `error: Cannot find module './check'`, 0 pass, 1 fail, 1 error (`slice1-red-module-test.log`).
- Task 1.7 was resolved by deleting `saved-plan-retry.ts`, its unit test, be-01's shim and its
  database test, with the barrel line, the `service-boundaries.test.ts` entry and both `kinds.json`
  rows. After the move, shims, contract, module, check and README, the module directory passed 16
  tests with 0 failures and 27 assertions across 2 files (`slice1-green-module-dir.log`);
  `wbs-core` lint and type-check and `wbs-be-01:typecheck` exited 0 on the first run
  (`slice1-core-gate-green.log`, `slice1-be01-typecheck-green.log`). The three sideways rows passed
  (1 pass, `slice1-sideways-green.log`).
- Widening `buildModule`'s key tuple to `['savedPlans', 'savedPlanOptions']` failed 3 of 7 tests:
  `Received function did not throw`, labels `[ "savedPlans", "savedPlanOptions", … ]`, and a
  message naming bare `Cannot resolve "savedPlanOptions"` (`row03-key-tuple.patch`,
  `row03-key-tuple.fail.log`).
- Dropping `{ label: SAVED_PLANS_LABEL }` failed only the two label tests (5 pass, 2 fail):
  `Expected to contain: "application.saved-plans/savedPlanOptions"` (`row04-label.patch`,
  `row04-label.fail.log`).
- Deleting the quota spread failed `passes a supplied quota through to the installed feature`
  with `Expected: "refused"`, `Received: "saved"` (6 pass, 1 fail; `row05-quota.patch`,
  `row05-quota.fail.log`).
- Returning `exposed` with `bag` failed the installer-surface test with the received keys adding
  `"bag"` (6 pass, 1 fail), while `wbs-core:typecheck` exited 0 (`row06-bag-leak.patch`,
  `row06-bag-leak.fail.log`, `row06-bag-leak.typecheck.log`). Attaching `resolve` to the returned
  service failed the same test's second assertion with `Expected: true`, `Received: false` (6 pass,
  1 fail), typecheck exit 0 (`row07-resolver.patch`, `row07-resolver.fail.log`,
  `row07-resolver.typecheck.log`).
- Bare imports prepended to `module/saved-plans/save-plan.ts` each failed the sideways suite
  (0 pass, 1 fail) with exactly one violation: `'../../service/auth.service' reaches
service/auth.service.ts` (`row09-auth-shim.*`), `'../authentication/authentication.feature'
reaches module/authentication/authentication.feature.ts` (`row10-auth-feature.*`) and
  `'../../http/endpoint' reaches http/endpoint.ts` (`row11-endpoint.*`).
- Every fault was restored by copying the saved bytes back, proved with `cmp`, and the named file
  rerun green (`*.regreen.log`).
- `service-kinds.test.ts` compares with `git ls-files` and is planner-only; its filesystem
  substitute printed `93 []`.
- Closing: the core suite passed `C + 1 = 571` tests over 59 files (`slice1-core-closing.log`); the
  be-01 saved-plan files passed `E - 1 = 123` over 12 (`slice1-be01-saved-closing.log`);
  `wbs-core` lint and type-check, `wbs-be-01:typecheck` and the repository format check exited 0
  (`slice1-core-gate-closing.log`, `slice1-be01-typecheck-closing.log`,
  `slice1-format-check-1.log`).
- Preserved K3 debt: the module's `plans` and `capture` requirements are repository ports
  (`SavedPlanStore`, `SavedPlanCaptureStore`), tracked under task 7.4.

### Saved plans, Slice 2 — 2026-09-23

- The slice started from `base=1a51cd12a37c5026e5b558a151754ab22f203de4` on a clean tree with slice
  1's `module/saved-plans/module.ts` present, one `new SavedPlanService({` in `compose.ts` and
  `K=93` `kinds.json` entries. Before any edit, `wbs-be-01:typecheck` exited 0
  (`slice2-be01-typecheck-baseline.log`) and the core suite passed `C=571` tests over `F=59` files
  (`slice2-core-baseline.log`).
- Red: `wbs-core:build:portable` exited 0 on the unchanged tree and
  `grep -c "application.saved-plans" dist/libs/wbs/application/core/portable-composition.js`
  exited 1 with no match (`count=0`): the composition root did not reach the module yet
  (`slice2-portable-build-baseline.log`, `slice2-portable-bundle-red.txt`).
- The alias test `composes one Saved plans instance behind both the plans and savedPlans names`
  passed on the unchanged `compose.ts`, 9 pass, 0 fail (`slice2-alias-test-unchanged-root.log`),
  because the aliases already shared one instance.
- Giving `plans` its own `installSavedPlans({...}).savedPlans` in `composeServices` failed the
  alias test with `expect(received).toBe(expected)` over two distinct `SavedPlanService` objects,
  0 pass, 1 fail, 8 filtered out, while `wbs-core:typecheck` exited 0
  (`slice2-row14-duplicate-plans.patch`, `slice2-row14-duplicate-plans.log`,
  `slice2-row14-typecheck.log`). The saved bytes were copied back, proved with `cmp`, and the named
  test passed again (`slice2-row14-restored.log`).
- Green: `compose.ts` installs the module through `installSavedPlans`; `index.ts` exports the
  module's contract and module; four `kinds.json` rows became shim rows. The rebuilt bundle now
  contains the label (`count=1`, `slice2-portable-build.log`, `slice2-portable-bundle-green.txt`),
  and `grep -cF "new SavedPlanService({"` over `compose.ts` exits 1 with no match.
- Closing: `wbs-core` `test:unit`, lint and type-check exited 0 (`slice2-core-runmany.log`);
  `compose.test.ts` passed 9 with 0 failures (`slice2-compose-test.log`); `wbs-be-01:typecheck`
  exited 0 (`slice2-be01-typecheck.log`); the core suite passed `C + 1 = 572` tests over 59 files
  (`slice2-core-closing.log`); `kinds.json` still holds `K=93` entries and the filesystem
  substitute for `service-kinds.test.ts` printed `93 []`.

### Saved plans, Slice 3 — 2026-09-23

- The slice started from `base=be57d4b984e35dd74d4c4806e874e64d556ba0a2` on a clean tree, with
  `module/saved-plans/module.ts` last changed by `1a51cd12a37c5026e5b558a151754ab22f203de4`, `M=10`
  pilot modules and `B=10` boundaries. The frozen revision
  `7851161bf96312750d07b933ca5d42b75ce575c7` lists
  `100644 blob f3a12fbc600b51ff3794e3593c4a6634960198d9	libs/core/src/service/saved-plan.service.ts`.
- Before any edit: the `tool-devsync` and `twilight-burokrat` type-checks, `twilight-burokrat:lint:source`
  and `tool-devsync:lint` exited 0 (`slice3-typecheck-baseline.log`,
  `slice3-burokrat-lint-source-baseline.log`, `slice3-devsync-lint-baseline.log`);
  `pilot-policy.test.ts` passed `T=21` tests with `TF=0` failures and `P=297` `expect()` calls
  (`slice3-pilot-baseline.log`); the legacy pin passed, 1 pass (`slice3-legacy-pin-baseline.log`);
  OpenSpec validation passed `N=114` of 114 with 0 failed (`openspec-validation.KnQmA0.json`).
- Parity red: with only the `modules.json` row added (`slice3-10.12a-modules.patch`),
  `pins exact pre-index tuples and passes observe lint from external trust` failed at
  `pilot-policy.test.ts:375`, `Expected: 10`, `Received: 11`; 0 pass, 1 fail, 22 `expect()` calls
  (`slice3-row15-parity-red.log`).
- Discovered-index red: with the `policy.json` boundary added (`slice3-10.12b-policy.patch`) and the
  README not yet in `pilotPaths`, the same test failed at `pilot-policy.test.ts:412`,
  `Expected: true`, `Received: false`; 0 pass, 1 fail, 26 `expect()` calls
  (`slice3-row16-index-red.log`).
- Green: with the `pilotPaths` entry (`slice3-10.12c-pilot-paths.patch`) and the final README, the
  whole pilot file passed `T=21` tests, `TF=0` failures and `P + 1 = 298` `expect()` calls
  (`slice3-row17-pilot-green.log`).
- Legacy pin red, pin unchanged: `every legacy source occurrence and relevant text family is pinned`
  failed with `historical policy selector or baseline` 47 to 49, `occurrences` 265 to 267 and the
  digest `3eca3cf1…` to `86721c9c2457e04146bd4db56db16869936be5a012fddc671bf2e39989c23d0f`,
  `unclassified` still `[]`, `Expected  - 3` / `Received  + 3`; 0 pass, 1 fail
  (`slice3-row18-legacy-pin-red.log`). After the re-pin (`slice3-10.14-repin.patch`) it passed,
  1 pass (`slice3-legacy-pin-green.log`); its Proof comment followed
  (`slice3-10.14-proof.patch`). No other pinned literal moved.
- Task records: `adopt-di-composition` 1.7 ticked, 3.3 noted and left unticked, 7.5 extended;
  `saved-plans` 4.5 carries the "Withdrawn" note.
- Closing: the `tool-devsync` and `twilight-burokrat` type-checks, `twilight-burokrat:lint:source`,
  `tool-devsync:lint` and `wbs-core:typecheck` exited 0 (`slice3-typecheck-after.log`,
  `slice3-burokrat-lint-source-after.log`, `slice3-devsync-lint-after.log`,
  `slice3-core-typecheck-after.log`); the legacy pin passed, 1 pass (`slice3-legacy-pin-after.log`);
  OpenSpec validation passed `N=114` of 114 with 0 failed (`openspec-validation.J7QPlz.json`).

### Plan document, Slice 1 — 2026-09-23

- The slice started from `base=170e84586ee45bad421b3358b9b65c742f1f1ef0` on a clean tree, with
  `module/plan-document` absent, `module/saved-plans/module.ts` present, `service/plan-document.ts`
  at 208 lines, one `new PlanDocumentService({ directory, markers: calendarMarkers, clock });` in
  `http/project.routes.ts`, and `K=93` `kinds.json` entries.
- Before any edit: `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice1-lint-typecheck-baseline.log`); `(cd libs/wbs/application/core && bun test src)` passed
  `C=572` over `F=59` files (`slice1-core-baseline.log`); the be-01 unit command (no `*.db.test.ts`,
  no `app.routes.test.ts`) passed `E=513` over `EF=48` files (`slice1-be01-unit-baseline.log`).
- Bundle red: `bun build libs/wbs/application/core/src/http/project.routes.ts --target=bun` exited 0
  and its bundle held no `application.plan-document` (grep exit 1, `count=0`;
  `slice1-routes-bundle-red.log`).
- Module red: the new `module/plan-document/module.test.ts` alone failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error (`slice1-module-red.log`).
- Green: after the `cp`/`mv` move, the import diff (`slice1-10.2-imports.patch`), the shim and the
  four module files, `bun test ./libs/wbs/application/core/src/module/plan-document/` passed 13 over
  2 files, 33 `expect()` calls (`slice1-module-green.log`).
- Bundle green: after `projectRoutes` installs through `installPlanDocument`
  (`slice1-10.5-install.patch`), the same build exited 0 and the grep printed `count=1`
  (`slice1-routes-bundle-green.log`).
- Sideways row (`slice1-10.6-sideways-row.patch`): `ports/sideways-type-boundaries.test.ts` passed,
  1 pass (`slice1-sideways-green.log`); `wbs-core` lint and typecheck and `wbs-be-01:typecheck`
  exited 0 (`slice1-lint-typecheck-step7.log`).
- Faults, each restored by `cp` and proved with `cmp` before the next:
  - Key tuple widened to `['planDocuments', 'planDocumentOptions']` (`row05-key-tuple.patch`): the
    private-binding test received a function that did not throw, the graph-label test received bare
    `planDocumentOptions`, and the missing-requirement message read
    `Cannot resolve "planDocumentOptions"`; 2 pass, 3 fail (`row05-key-tuple.log`).
  - Label argument dropped (`row06-label.patch`): only the two label tests failed; 3 pass, 2 fail
    (`row06-label.log`).
  - `planDocumentOptions` handed `clock: { now: () => 0 }` (`row07-clock.patch`): `exportedAt` read
    `"1970-01-01T00:00:00.000Z"` instead of `"2026-09-24T09:00:00.000Z"`; 4 pass, 1 fail
    (`row07-clock.log`).
  - `check.ts` returning an `exposed` object with `bag` (`row08-extra-key.patch`): the received keys
    added `"bag"`; 4 pass, 1 fail (`row08-extra-key.log`); `wbs-core:typecheck` exit 0 on the
    mutated tree (`row08-typecheck.log`).
  - `check.ts` attaching `resolve` to the returned service (`row09-resolver.patch`): `Expected: true`,
    `Received: false`; 4 pass, 1 fail (`row09-resolver.log`); `wbs-core:typecheck` exit 0
    (`row09-typecheck.log`).
  - `import '../../service/calendar-marker.service';` prepended to
    `module/plan-document/plan-document.resource.ts` (`row10-sideways.patch`): exactly one violation,
    `"module/plan-document/plan-document.resource.ts: '../../service/calendar-marker.service' reaches service/calendar-marker.service.ts"`;
    0 pass, 1 fail (`row10-sideways.log`). With the new row also deleted
    (`row11-row-deleted.patch`) the suite passed, 1 pass (`row11-row-deleted.log`).
- Proof comments added after the observations (`slice1-10.7-proofs.patch`); the module directory
  and the sideways suite then passed 14 over 3 files (`slice1-after-proofs.log`).
- Filesystem substitute for `service-kinds.test.ts` printed `93 []` (`slice1-kinds-substitute.log`).
- Closing: core `bun test src` passed `C + 5 = 577` over `F + 1 = 60` files
  (`slice1-core-closing.log`); the be-01 unit command passed `E = 513` over `EF = 48` files
  (`slice1-be01-unit-closing.log`); `wbs-core` lint and typecheck and `wbs-be-01:typecheck` exited 0
  (`slice1-lint-typecheck-closing.log`); the module directory holds seven files;
  `nx format:check --all` exited 0 (`slice1-format-check.log`).
- Recorded K2 debt: delivery (`http/project.routes.ts`) still installs the Plan document resource
  over the Directory and Calendar marker resources it is handed; tracked under task 7.4.

### Solver launcher, Slice 2 — 2026-09-23

- The slice started from `base=b53693a22de992d4d33f04d71c37f45744eddcf3` on a clean tree, with
  `module/plan-document/module.ts` present, no `apps/wbs/be-01/src/module`,
  `service/solver-launcher-process.ts` at 163 lines holding one five-level
  `'../../../../../libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py',` literal, and `K=93`
  `kinds.json` entries.
- Before any edit: `wbs-be-01` lint and typecheck exited 0 (`slice2-lint-typecheck-baseline.log`);
  the be-01 unit command (no `*.db.test.ts`, no `app.routes.test.ts`) passed `E=513` over `EF=48`
  files (`slice2-be01-unit-baseline.log`); `services.db.test.ts` and
  `service/solver-child-lifecycle.db.test.ts` passed `D=13` over `DF=2` files inside the sandbox
  (`slice2-be01-db-baseline.log`).
- Bundle reds: `bun build apps/wbs/be-01/src/main.ts --target=bun` and the same for `dev/main.ts`
  exited 0 and neither bundle held `backend.solver-launcher` (grep exit 1, `count=0`;
  `slice2-main-bundle-red.log`, `slice2-dev-main-bundle-red.log`).
- Module red: the new `module/solver-launcher/module.test.ts` alone failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error (`slice2-module-red.log`).
- Green: after the `cp`/`mv` move, the moved test's import line and the moved file's one
  relative-depth literal (`slice2-10.9-moved.patch`), the shim and the four module files,
  `bun test ./apps/wbs/be-01/src/module/solver-launcher/` passed 13 over 2 files, 28 `expect()`
  calls (`slice2-module-green.log`).
- Bundle greens: after both entrypoints read the solver version through `installSolverLauncher({})`
  (`slice2-10.12-install.patch`), both builds exited 0 and both greps printed `count=1`
  (`slice2-main-bundle-green.log`, `slice2-dev-main-bundle-green.log`);
  `production-entrypoint.test.ts` passed 2 (`slice2-entrypoint.log`), so the production bundle still
  reaches no `local-solver` string. `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-step6.log`).
- Faults against `module/solver-launcher/module.test.ts`, each restored by `cp` and proved with
  `cmp` before the next:
  - Key tuple widened to `['solverLauncher', 'launcherSeams']` (`row18-key-tuple.patch`): the
    private-binding test's resolver `did not throw`, the graph-label test received bare
    `launcherSeams`, and the missing-requirement message read `Cannot resolve "launcherSeams"`;
    4 pass, 3 fail (`row18-key-tuple.log`).
  - Label argument dropped (`row19-label.patch`): only the two label tests failed; 5 pass, 2 fail
    (`row19-label.log`).
  - `readInstalledSolverVersion()` called without the installed probe (`row20-probe.patch`):
    `error: Executable not found in $PATH: "wbs-solver-launcher"`; 6 pass, 1 fail
    (`row20-probe.log`).
  - `check.ts` returning an `exposed` object with `bag` (`row21-extra-key.patch`): the received keys
    added `"bag"`; 6 pass, 1 fail (`row21-extra-key.log`); `wbs-be-01:typecheck` exit 0 on the
    mutated tree (`row21-typecheck.log`).
  - `check.ts` attaching `resolve` to the returned launcher (`row22-resolver.patch`):
    `Expected: true`, `Received: false`; 6 pass, 1 fail (`row22-resolver.log`);
    `wbs-be-01:typecheck` exit 0 (`row22-typecheck.log`).
  - The moved file's pre-move five-level source-module URL kept (`row23-source-url.patch`):
    `error: ENOENT: no such file or directory, open '…/apps/libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py'`;
    6 pass, 1 fail (`row23-source-url.log`).
- Proof comments added after the observations (`slice2-10.13-proofs.patch`); the module directory
  then passed 13 over 2 files (`slice2-after-proofs.log`).
- Filesystem substitute for `service-kinds.test.ts` printed `93 []` (`slice2-kinds-substitute.log`).
- Closing: the be-01 unit command passed `E + 7 = 520` over `EF + 1 = 49` files
  (`slice2-be01-unit-closing.log`); the database pair passed `D = 13` over `DF = 2` files
  (`slice2-be01-db-closing.log`); the entrypoint test passed 2 (`slice2-entrypoint-closing.log`);
  `wbs-be-01` lint and typecheck exited 0 (`slice2-lint-typecheck-closing.log`); the module
  directory holds seven files; `nx format:check --all` exited 0 (`slice2-format-check.log`).
- be-01 has no sideways or type-identity boundary check; the module's K5 compliance (imports
  `node:fs`, `di-bag` and its own files) is read, not watched.

### Solver launcher registration, Slice 3 — 2026-09-23

- The slice started from `base=f3f4562235567684c47f79e051f5a59b1f21fc06` on a clean tree, with
  `module/solver-launcher/module.ts` last changed by `f3f4562235567684c47f79e051f5a59b1f21fc06`,
  `M=11` pilot modules, `B=11` boundaries and 7 relationship facts. The frozen revision
  `7851161bf96312750d07b933ca5d42b75ce575c7` lists
  `100644 blob cb21f58d1daaa28e7e5159ef038c0a38c4cf190e	apps/be-01/src/service/solver-launcher-process.ts`.
- Before any edit: the `tool-devsync` and `twilight-burokrat` type-checks,
  `twilight-burokrat:lint:source` and `tool-devsync:lint` exited 0 (`step0-typecheck.log`,
  `step0-lint-burokrat.log`, `step0-lint-devsync.log`); `pilot-policy.test.ts` passed `T=21` tests
  with `TF=0` failures and `P=298` `expect()` calls (`step0-pilot.log`);
  `committed-target-facts.test.ts` passed 2 with `Q=16` `expect()` calls
  (`step0-targetfacts.log`); the legacy pin passed, 1 pass (`step0-legacy-pin.log`); OpenSpec
  validation passed `N=114` of 114 with 0 failed (`openspec-validation.1WIrLJ.json`).
- Parity red (row 25): with only the `modules.json` row added (`slice3-10.14a-modules.patch`),
  `pins exact pre-index tuples and passes observe lint from external trust` failed at
  `pilot-policy.test.ts:376`, `Expected: 11`, `Received: 12`; 0 pass, 1 fail, 23 `expect()` calls
  (`row25-parity-red.log`).
- Discovered-index red (row 26): with the `policy.json` boundary added
  (`slice3-10.14b-policy.patch`) and the README not yet in `pilotPaths`, the same test failed at
  `pilot-policy.test.ts:413`, `Expected: true`, `Received: false`; 0 pass, 1 fail, 27 `expect()`
  calls (`row26-discovered-index-red.log`).
- Target fact: with `check.be-01.test` added first in `relationships.json`
  (`slice3-10.14c-relationships.patch`), `committed-target-facts.test.ts` passed 2 with
  `Q + 1 = 17` `expect()` calls (`step3-targetfacts-green.log`). Row 27: its `command` changed to
  `bun test --coverage` (`row27-fact-command.patch`) failed with
  `- "command": "bun test --coverage --coverage-reporter=lcov"` /
  `+ "command": "bun test --coverage"` under `check.be-01.test`; 1 pass, 1 fail
  (`row27-fact-command-red.log`). Restored by `cp`, `cmp` equal, 2 pass, 17 calls
  (`row27-restored-green.log`).
- Prose-pin red (row 28): with the `pilotPaths` entry (`slice3-10.14d-pilot-paths.patch`) and the
  final README, the whole pilot file failed only
  `refuses prose facts presented as applicable checks`, receiving
  `applicable check has no executable authority in apps/wbs/be-01/src/module/solver-launcher/README.md: check.be-01.test (external-consumer)`;
  20 pass, 1 fail, 299 `expect()` calls (`row28-prose-pin-red.log`).
- Green (row 29): after the prose pin moved (`slice3-10.16-prose-pin.patch`), the whole pilot
  file passed `T=21` tests, `TF=0` failures and `P + 1 = 299` `expect()` calls
  (`row29-pilot-green.log`).
- Legacy pin red, pin unchanged (row 30): `every legacy source occurrence and relevant text family
is pinned` failed with `historical policy selector or baseline` 49 to 51, `occurrences` 267 to
  269 and the digest `86721c9c…` to
  `113681cd7a2c98566f565cca8176456eb50fb453b6fb94ce5bf3f611a0d576bb`, `Expected  - 3` /
  `Received  + 3`; 0 pass, 1 fail (`row30-legacy-pin-red.log`). After the re-pin
  (`slice3-10.17-repin.patch`) it passed, 1 pass (`step6-legacy-pin-green.log`); its Proof comment
  followed (`slice3-10.17-proof.patch`). No other pinned literal moved.
- Task records (`slice3-10.18-tasks.patch`): 4.1 ticked, 4.2 noted and left unticked, 7.5
  extended.
- Closing: the `tool-devsync` and `twilight-burokrat` type-checks, `twilight-burokrat:lint:source`
  and `tool-devsync:lint` exited 0 (`step8-typecheck.log`, `step8-lint-burokrat.log`,
  `step8-lint-devsync.log`); the legacy pin passed, 1 pass (`step8-legacy-pin.log`); OpenSpec
  validation passed `N=114` of 114 with 0 failed (`openspec-validation.pA9RJm.json`); `M=12`,
  `B=12`, 8 relationship facts.
