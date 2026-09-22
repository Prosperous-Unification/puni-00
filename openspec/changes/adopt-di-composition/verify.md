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
