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

### Calendar marker and Capacity, Slice 1 — 2026-09-24

- The slice started from `base=8c8674c78b494f2c7e7895956c9c85c9bb62cb3b` on a clean tree, with
  `module/calendar-marker` and `module/capacity` absent, E6's `module/plan-document/module.ts` and
  `apps/wbs/be-01/src/module/solver-launcher/module.ts` present, `service/calendar-marker.service.ts`
  at 193 lines, `service/capacity.service.ts` at 96, one `new CalendarMarkerService({` and one
  `new CapacityService({` in `compose.ts`, and `K=93` `kinds.json` entries.
- Before any edit: `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice1-lint-typecheck-baseline.log`); `(cd libs/wbs/application/core && bun test src)` passed
  `C=577` over `F=60` files (`slice1-core-baseline.log`); the be-01 unit command (no `*.db.test.ts`,
  no `app.routes.test.ts`) passed `E=520` over `EF=49` files (`slice1-be01-unit-baseline.log`).
- Bundle red (row 3): `bun build libs/wbs/application/core/src/compose.ts --target=bun` exited 0 and
  its bundle held neither `application.calendar-marker` nor `application.capacity` (grep exit 1,
  `count=0` each; `slice1-compose-bundle-red.log`, `slice1-baseline-block.out`).
- Module reds (rows 1-2): each new `module.test.ts` alone failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error
  (`slice1-row-red-calendar-marker.log`, `slice1-row-red-capacity.log`).
- Move red (row 4): after the `cp`/`mv` move, the import diff (`slice1-10.3-imports.patch`) and the
  two shims, `apps/wbs/be-01/src/service/clock.test.ts` failed
  `is reading real service sources, not an empty list` on
  `Expected to contain: "export class CapacityService"`; 3 pass, 1 fail (`slice1-row4-clock-red.log`).
- Module greens (rows 5-6): with the four files of each module,
  `bun test ./libs/wbs/application/core/src/module/calendar-marker/` passed 22 over 2 files, 40
  `expect()` calls (`slice1-green-calendar-marker.log`), and the Capacity directory passed 5, 7
  `expect()` calls (`slice1-green-capacity.log`).
- Bundle green (row 8): after `servicesOver` installs both (`slice1-10.7-install.patch`), the same
  build exited 0 and printed `count=1` for each label (`slice1-compose-bundle-green.log`,
  `slice1-compose-bundle-green-counts.txt`).
- Per-scope cases (`slice1-10.8-per-scope-cases.patch`): `compose.test.ts` passed 11, 0 fail
  (`slice1-compose-test-green.log`). Sideways row (`slice1-10.9-sideways-row.patch`): the suite
  passed, 1 pass (`slice1-sideways-green.log`). Clock scan (`slice1-10.10-clock-scan.patch`,
  row 7): `clock.test.ts` passed 4, 0 fail (`slice1-row7-clock-green.log`). `wbs-core` and
  `wbs-be-01` lint and typecheck exited 0 (`slice1-lint-typecheck-step7.log`).
- Faults, each restored by `cp` and proved with `cmp` before the next, each followed by a green
  rerun (`<row>-restored.log`):
  - Row 9, Calendar marker key tuple widened to `['calendarMarkers', 'calendarMarkerOptions']`
    (`row09-cm-tuple.patch`): `Received function did not throw`;
    `Expected to contain: "application.calendar-marker/calendarMarkerOptions"`; the message read
    `Cannot resolve "calendarMarkerOptions"`; 2 pass, 3 fail (`row09-cm-tuple-failing.log`).
  - Row 10, Calendar marker label dropped (`row10-cm-label.patch`): only the two label tests
    failed; 3 pass, 2 fail (`row10-cm-label-failing.log`).
  - Row 11, `broadcast,` deleted from the `calendarMarkerOptions` factory's return
    (`row11-cm-broadcast.patch`): the published events expected one `calendar_markers_changed` and
    received `[]`; 4 pass, 1 fail (`row11-cm-broadcast-failing.log`).
  - Row 12, Calendar marker `check.ts` returning an `exposed` object with `bag`
    (`row12-cm-bag.patch`): the received keys added `"bag"`; 4 pass, 1 fail
    (`row12-cm-bag-failing.log`); `wbs-core:typecheck` exit 0 (`row12-cm-bag-typecheck.log`).
  - Row 13, Calendar marker `check.ts` attaching `resolve` (`row13-cm-resolver.patch`):
    `Expected: true`, `Received: false`; 4 pass, 1 fail (`row13-cm-resolver-failing.log`);
    typecheck exit 0 (`row13-cm-resolver-typecheck.log`).
  - Rows 14-15, Capacity tuple and label (`row14-cap-tuple.patch`, `row15-cap-label.patch`): 2 pass,
    3 fail and 3 pass, 2 fail, with the same three and two messages as rows 9 and 10
    (`row14-cap-tuple-failing.log`, `row15-cap-label-failing.log`).
  - Row 16, `capacityOptions` handing `{ ...broadcast, publish: () => Promise.resolve() }`
    (`row16-cap-broadcast.patch`): expected one `capacity_changed`, received `[]`; 4 pass, 1 fail
    (`row16-cap-broadcast-failing.log`).
  - Rows 17-18, Capacity bag and resolver (`row17-cap-bag.patch`, `row18-cap-resolver.patch`): the
    received keys added `"bag"`, then `Expected: true`, `Received: false`; 4 pass, 1 fail each;
    typecheck exit 0 each (`row17-cap-bag-typecheck.log`, `row18-cap-resolver-typecheck.log`).
  - Row 19, `installCalendarMarker` memoized in a module-level `reusedCalendarMarker`
    (`row19-cm-per-scope.patch`), run with `-t "installs Calendar marker per supplied scope"`:
    `-   "value": [],` / `+   "value": [` holding the first scope's `"name": "Launch"` marker;
    0 pass, 10 filtered out, 1 fail (`row19-cm-per-scope-failing.log`); typecheck exit 0
    (`row19-cm-per-scope-typecheck.log`). A first injection omitted the closing parenthesis and did
    not parse (`row19-cm-per-scope.attempt1-syntax.patch`); it was restored, `cmp`-proved and
    redone.
  - Row 20, `installCapacity` memoized in `reusedCapacity` (`row20-cap-per-scope.patch`), run with
    `-t "installs Capacity per supplied scope"`: `- []` /
    `+ [ { "serviceTeamId": "team-1", "size": 3 } ]`; 0 pass, 10 filtered out, 1 fail
    (`row20-cap-per-scope-failing.log`); typecheck exit 0 (`row20-cap-per-scope-typecheck.log`).
  - Row 21, `import type { CalendarMarkerService } from '../../index';` and
    `export type BarrelMarkers = CalendarMarkerService;` prepended to E6's
    `module/plan-document/plan-document.resource.ts` (`row21-sideways-barrel.patch`): exactly one
    violation,
    `"module/plan-document/plan-document.resource.ts: CalendarMarkerService reaches module/calendar-marker/calendar-marker.resource.ts"`;
    `Expected - 1`, `Received + 3`; 0 pass, 1 fail (`row21-sideways-barrel-failing.log`). The file
    was restored by `cp`, `cmp` equal, and `git diff` shows it unchanged.
  - Row 24, `now?: () => number;` added to the moved `CapacityServiceOptions`
    (`row24-clock-capacity-now.patch`): `is the only clock a service that stamps a write reads`
    received `["libs/wbs/application/core/src/module/capacity/capacity.resource.ts"]`; 3 pass,
    1 fail (`row24-clock-capacity-now-failing.log`).
  - Row 25, `serviceFolders` returning `[...FOLDERS]` (`row25-clock-folders.patch`): the
    `coreCapacity` assertion received `undefined`; 3 pass, 1 fail
    (`row25-clock-folders-failing.log`).
- Proof comments added after the observations (`slice1-10.11-proofs.patch`); both module
  directories, `compose.test.ts`, the sideways suite and `clock.test.ts` then passed 43 over 6 files
  (`slice1-after-proofs-focused.log`).
- Filesystem substitute for `service-kinds.test.ts` printed `93 []`
  (`slice1-kinds-substitute.txt`); the test itself is the planner's.
- Closing: core `bun test src` passed `C + 12 = 589` over `F + 2 = 62` files
  (`slice1-core-closing.log`); the be-01 unit command passed `E = 520` over `EF = 49` files
  (`slice1-be01-unit-closing.log`); `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice1-lint-typecheck-closing.log`); `module/calendar-marker` holds seven files and
  `module/capacity` six; `nx format:check --all` exited 0 (`slice1-format-check.log`).
- Delivery still accepts `CalendarMarkerService` and reaches `CapacityService` through the composed
  graph (K2), tracked under 7.4.

### Priority band and Step, Slice 2 — 2026-09-24

- The slice started from `base=3ad366e41cb709c5131876229cb0caad551ba2e9` on a clean tree, with
  slice 1's `module/capacity/module.ts` present, `module/priority-band` and `module/step` absent,
  `service/priority-band.service.ts` at 82 lines, `service/step.service.ts` at 244, one
  `priorityBands: new PriorityBandService({` and one `steps: new StepService({` in `compose.ts`, and
  `K=93` `kinds.json` entries (`slice2-step0.log`).
- Before any edit: `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-baseline.log`); `(cd libs/wbs/application/core && bun test src)` passed
  `C=589` over `F=62` files (`slice2-core-baseline.log`); the be-01 unit command (no `*.db.test.ts`,
  no `app.routes.test.ts`) passed `E=520` over `EF=49` files (`slice2-be01-unit-baseline.log`).
- Bundle red (row 28): `bun build libs/wbs/application/core/src/compose.ts --target=bun` exited 0 and
  its bundle held neither `application.priority-band` nor `application.step` (grep exit 1,
  `count=0` each; `slice2-compose-bundle-red.log`, `slice2-baseline-block.out`).
- Module reds (rows 26-27): each new `module.test.ts` alone failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error
  (`slice2-row-red-priority-band.log`, `slice2-row-red-step.log`).
- Move: two `cp` copies, the import diff (`slice2-10.14-imports.patch`) and the two shims of 10.15.
- Module greens (rows 29-30): with the four files of each module, each directory passed 5, 0 fail,
  7 `expect()` calls (`slice2-green-priority-band.log`, `slice2-green-step.log`).
- Bundle green (row 31): after `servicesOver` installs both (`slice2-10.18-install.patch`), the same
  build exited 0 and printed `count=1` for each label (`slice2-compose-bundle-green.log`,
  `slice2-compose-bundle-green-counts.txt`).
- Per-scope cases (`slice2-10.19-per-scope-cases.patch`): `compose.test.ts` passed 13, 0 fail
  (`slice2-compose-test-green.log`). `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-step6.log`).
- Faults, each restored by `cp` and proved with `cmp` before the next, each followed by a green
  rerun (`<row>-restored.log`):
  - Row 32, Priority band key tuple widened to `['priorityBands', 'priorityBandOptions']`
    (`row32-pb-tuple.patch`): `Received function did not throw`;
    `Expected to contain: "application.priority-band/priorityBandOptions"`; the message read
    `Cannot resolve "priorityBandOptions"`; 2 pass, 3 fail (`row32-pb-tuple-failing.log`).
  - Row 33, Priority band label dropped (`row33-pb-label.patch`): only the two label tests failed;
    3 pass, 2 fail (`row33-pb-label-failing.log`).
  - Row 34, `priorityBandOptions` handing `{ ...broadcast, publish: () => Promise.resolve() }`
    (`row34-pb-broadcast.patch`): expected one `priority_bands_changed`, received `[]`; 4 pass,
    1 fail (`row34-pb-broadcast-failing.log`).
  - Rows 35-36, Priority band bag and resolver (`row35-pb-bag.patch`, `row36-pb-resolver.patch`):
    the received keys added `"bag"`, then `Expected: true`, `Received: false`; 4 pass, 1 fail each;
    `wbs-core:typecheck` exit 0 each (`row35-pb-bag-typecheck.log`,
    `row36-pb-resolver-typecheck.log`).
  - Rows 37-38, Step tuple and label (`row37-step-tuple.patch`, `row38-step-label.patch`): 2 pass,
    3 fail and 3 pass, 2 fail, with the same three and two messages as rows 32 and 33 for
    `stepOptions` and `application.step/stepOptions` (`row37-step-tuple-failing.log`,
    `row38-step-label-failing.log`).
  - Row 39, `stepOptions` handing `{ ...broadcast, publish: () => Promise.resolve() }`
    (`row39-step-broadcast.patch`): expected one `step_added`, received `[]`; 4 pass, 1 fail
    (`row39-step-broadcast-failing.log`).
  - Rows 40-41, Step bag and resolver (`row40-step-bag.patch`, `row41-step-resolver.patch`): the
    received keys added `"bag"`, then `Expected: true`, `Received: false`; 4 pass, 1 fail each;
    typecheck exit 0 each (`row40-step-bag-typecheck.log`, `row41-step-resolver-typecheck.log`).
  - Row 42, `installPriorityBand` memoized in a module-level `reusedPriorityBand`
    (`row42-pb-per-scope.patch`), run with `-t "installs Priority band per supplied scope"`:
    `-     "label": "Critical",` / `+     "label": "Critical now",` (all five rungs); 0 pass,
    12 filtered out, 1 fail (`row42-pb-per-scope-failing.log`); typecheck exit 0
    (`row42-pb-per-scope-typecheck.log`).
  - Row 43, `installStep` memoized in `reusedStep` (`row43-step-per-scope.patch`), run with
    `-t "installs Step per supplied scope"`: `-   "ok": false,` `-   "reason": "not_found",` /
    `+   "ok": true,` `+   "value": {` holding `"name": "Renamed"`; 0 pass, 12 filtered out, 1 fail
    (`row43-step-per-scope-failing.log`); typecheck exit 0 (`row43-step-per-scope-typecheck.log`).
- Proof comments added after the observations (`slice2-10.20-proofs.patch`); both module
  directories and `compose.test.ts` then passed 23 over 3 files (`slice2-after-proofs-focused.log`).
- Filesystem substitute for `service-kinds.test.ts` printed `93 []`
  (`slice2-kinds-substitute.txt`); the test itself is the planner's.
- Closing: core `bun test src` passed `C + 12 = 601` over `F + 2 = 64` files
  (`slice2-core-closing.log`); the be-01 unit command passed `E = 520` over `EF = 49` files
  (`slice2-be01-unit-closing.log`); `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-closing.log`); `module/priority-band` and `module/step` hold six files
  each; `nx format:check --all` exited 0 (`slice2-format-check.log`).
- Step still imports `service/assumed-assignee.ts` and `service/clean-name.ts` (task 6.1); delivery
  still accepts `StepService` (K2, task 7.4).

### Project and Directory, Slice 3 — 2026-09-24

- The slice started from `base=80740be3efb336657caaa06d26d38ad5070f9f6d` on a clean tree, with
  slice 2's `module/step/module.ts` present, `module/project` and `module/directory` absent,
  `service/project.service.ts` at 310 lines, `service/directory.service.ts` at 743, one
  `projects: new ProjectService({` and one
  `directory: new DirectoryService({ clock, directory: stores.directory, broadcast }),` in
  `compose.ts`, and `K=93` `kinds.json` entries (`slice3-step0.log`).
- Before any edit: `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice3-lint-typecheck-baseline.log`); `(cd libs/wbs/application/core && bun test src)` passed
  `C=601` over `F=64` files (`slice3-core-baseline.log`); the be-01 unit command (no `*.db.test.ts`,
  no `app.routes.test.ts`) passed `E=520` over `EF=49` files (`slice3-be01-unit-baseline.log`).
- Bundle red (row 47): `bun build libs/wbs/application/core/src/compose.ts --target=bun` exited 0 and
  its bundle held neither `application.project` nor `application.directory` (grep exit 1,
  `count=0` each; `slice3-compose-bundle-red.log`, `slice3-baseline-block.out`).
- Module reds (rows 45-46): each new `module.test.ts` alone failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error (`slice3-row-red-project.log`,
  `slice3-row-red-directory.log`).
- Move: two `cp` copies, the import diff (`slice3-10.23-imports.patch`) and the two shims of 10.24.
- Module greens (rows 48-49): with the four files of each module, each directory passed 5, 0 fail,
  7 `expect()` calls (`slice3-row-green-project.log`, `slice3-row-green-directory.log`).
- Bundle green (row 50): after `servicesOver` installs both (`slice3-10.27-install.patch`), the same
  build exited 0 and printed `count=1` for each label (`slice3-compose-bundle-green.log`).
- Per-scope cases (`slice3-10.28-per-scope-cases.patch`): `compose.test.ts` passed 15, 0 fail
  (`slice3-compose-test-green.log`). `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice3-lint-typecheck-step6.log`).
- Faults, each restored by `cp` and proved with `cmp` before the next, each followed by a green
  rerun (`<row>.restored-green.log`):
  - Row 51, Project key tuple widened to `['projects', 'projectOptions']`
    (`row51-project-tuple.patch`): `Received function did not throw`;
    `Expected to contain: "application.project/projectOptions"` with the graph reporting bare
    `projectOptions`; the message read `Cannot resolve "projectOptions"`; 2 pass, 3 fail
    (`row51-project-tuple.fail.log`).
  - Row 52, Project label dropped (`row52-project-label.patch`): only the two label tests failed;
    3 pass, 2 fail (`row52-project-label.fail.log`).
  - Row 53, `optimizerAvailable,` deleted from the `projectOptions` factory's returned object
    (`row53-project-optimizer.patch`): `+   "ok": false,` `+   "reason": "optimizer_unavailable",`
    against the expected `"ok": true`; 4 pass, 1 fail (`row53-project-optimizer.fail.log`).
  - Rows 54-55, Project bag and resolver (`row54-project-bag.patch`,
    `row55-project-resolver.patch`): the received keys added `"bag"`, then `Expected: true`,
    `Received: false`; 4 pass, 1 fail each; `wbs-core:typecheck` exit 0 each
    (`row54-project-bag.typecheck.log`, `row55-project-resolver.typecheck.log`).
  - Rows 56-57, Directory tuple and label (`row56-directory-tuple.patch`,
    `row57-directory-label.patch`): 2 pass, 3 fail and 3 pass, 2 fail, with the same three and two
    messages as rows 51 and 52 for `directoryOptions` and `application.directory/directoryOptions`
    (`row56-directory-tuple.fail.log`, `row57-directory-label.fail.log`).
  - Row 58, `directoryOptions` handing `{ ...clock, newId: () => 'unsupplied' }`
    (`row58-directory-clock.patch`): `-   "id": "team-1",` / `+   "id": "unsupplied",`; 4 pass,
    1 fail (`row58-directory-clock.fail.log`).
  - Rows 59-60, Directory bag and resolver (`row59-directory-bag.patch`,
    `row60-directory-resolver.patch`): the received keys added `"bag"`, then `Expected: true`,
    `Received: false`; 4 pass, 1 fail each; typecheck exit 0 each
    (`row59-directory-bag.typecheck.log`, `row60-directory-resolver.typecheck.log`).
  - Row 61, `installProject` memoized in a module-level `reusedProject`
    (`row61-compose-project-memo.patch`), run with `-t "installs Project per supplied scope"`:
    `error: expect(received).toBeNull()`, `Received: {` (the first scope's project); 0 pass,
    14 filtered out, 1 fail (`row61-compose-project-memo.fail.log`); typecheck exit 0
    (`row61-compose-project-memo.typecheck.log`).
  - Row 62, `installDirectory` memoized in `reusedDirectory`
    (`row62-compose-directory-memo.patch`), run with `-t "installs Directory per supplied scope"`:
    `+   "Operations",` in the second scope's team names; 0 pass, 14 filtered out, 1 fail
    (`row62-compose-directory-memo.fail.log`); typecheck exit 0
    (`row62-compose-directory-memo.typecheck.log`).
- Proof comments added after the observations (`slice3-10.29-proofs.patch`); both module
  directories and `compose.test.ts` then passed 25 over 3 files (`slice3-after-proofs-focused.log`).
- Filesystem substitute for `service-kinds.test.ts` printed `93 []`
  (`slice3-kinds-substitute.log`); the test itself is the planner's.
- Closing: core `bun test src` passed `C + 12 = 613` over `F + 2 = 66` files
  (`slice3-core-closing.log`); the be-01 unit command passed `E = 520` over `EF = 49` files
  (`slice3-be01-unit-closing.log`); `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice3-lint-typecheck-closing.log`); `module/project` and `module/directory` hold six files
  each; `nx format:check --all` exited 0 (`slice3-format-check.log`).
- Directory still imports `service/clean-name.ts` and `service/directory-usage.ts` (task 6.1);
  delivery, Plan import, Plan commands and Saved plans still name the two resources directly (K2,
  task 7.4).

### Resource module registration, Slice 4 — 2026-09-24

- The slice started from `base=31de48bb14ddc5e646e6bc3eec79c9aba31fef81` on a clean tree, with
  `module/directory/module.ts` last changed by `31de48bb14ddc5e646e6bc3eec79c9aba31fef81`, `M=12`
  pilot modules and `B=12` boundaries. The frozen revision
  `7851161bf96312750d07b933ca5d42b75ce575c7` lists, each `100644 blob`:
  `1e36dc086592483df3c5facd52dc756c00a46b08` `libs/core/src/service/calendar-marker.service.ts`,
  `ae86655ecd969b4016c1b9b96fb5eb60dec35a96` `libs/core/src/service/capacity.service.ts`,
  `8deae4ad476af259c2ecc4b90345557dca80eab3` `libs/core/src/service/directory.service.ts`,
  `b9c1342e6c7f0e112a0538c19eb4ad47359386cc` `libs/core/src/service/priority-band.service.ts`,
  `1b40cb91901c693b8a9e9970b938e7327954988b` `libs/core/src/service/project.service.ts` and
  `1e53de89b1d4f1b1ebf901696bdf36dbfc6d1944` `libs/core/src/service/step.service.ts`.
- Before any edit: the `tool-devsync` and `twilight-burokrat` type-checks,
  `twilight-burokrat:lint:source` and `tool-devsync:lint` exited 0
  (`slice4-typecheck-baseline.log`, `slice4-burokrat-lint-source-baseline.log`,
  `slice4-devsync-lint-baseline.log`); `pilot-policy.test.ts` passed `T=21` tests with `TF=0`
  failures and `P=299` `expect()` calls (`slice4-pilot-baseline.log`); the legacy pin passed,
  1 pass (`slice4-legacy-pin-baseline.log`); OpenSpec validation passed `N=114` of 114 with 0
  failed (`openspec-validation.slice4-baseline.hRVz3X.json`).
- Registration, each step run with `-t "pins exact pre-index tuples"` (the test
  `pins exact pre-index tuples and passes observe lint from external trust`), each patch and log
  under the same basename:
  - Rows 63-65, Calendar marker: row alone (`slice4-calendar-marker-1-row-red`) failed at
    `pilot-policy.test.ts:377`, `Expected: 12`, `Received: 13`, 24 `expect()` calls; with the
    boundary (`slice4-calendar-marker-2-boundary-red`) at `:414`, `Expected: true`,
    `Received: false`, 28 calls; with the index (`slice4-calendar-marker-3-index-green`) 1 pass,
    34 calls.
  - Rows 66-68, Capacity: `:378` `Expected: 13` / `Received: 14`, 25 calls
    (`slice4-capacity-1-row-red`); `:415` `Expected: true` / `Received: false`, 29 calls
    (`slice4-capacity-2-boundary-red`); 1 pass, 35 calls (`slice4-capacity-3-index-green`).
  - Rows 69-71, Directory: `:379` `Expected: 14` / `Received: 15`, 26 calls
    (`slice4-directory-1-row-red`); `:416` `Expected: true` / `Received: false`, 30 calls
    (`slice4-directory-2-boundary-red`); 1 pass, 36 calls (`slice4-directory-3-index-green`).
  - Rows 72-74, Priority band: `:380` `Expected: 15` / `Received: 16`, 27 calls
    (`slice4-priority-band-1-row-red`); `:417` `Expected: true` / `Received: false`, 31 calls
    (`slice4-priority-band-2-boundary-red`); 1 pass, 37 calls
    (`slice4-priority-band-3-index-green`).
  - Rows 75-77, Project: `:381` `Expected: 16` / `Received: 17`, 28 calls
    (`slice4-project-1-row-red`); `:418` `Expected: true` / `Received: false`, 32 calls
    (`slice4-project-2-boundary-red`); 1 pass, 38 calls (`slice4-project-3-index-green`).
  - Rows 78-80, Step: `:382` `Expected: 17` / `Received: 18`, 29 calls
    (`slice4-step-1-row-red`); `:419` `Expected: true` / `Received: false`, 33 calls
    (`slice4-step-2-boundary-red`); 1 pass, 39 calls (`slice4-step-3-index-green`).
  - Every red was 0 pass, 20 filtered out, 1 fail; every green 1 pass, 20 filtered out, 0 fail.
- Green (row 81): the whole pilot file passed `T=21` tests, `TF=0` failures and `P + 6 = 305`
  `expect()` calls (`slice4-pilot-whole-green.log`); the prose-refusal pin did not move.
- Legacy pin red, pin unchanged (row 82): `every legacy source occurrence and relevant text family
is pinned` failed with `historical policy selector or baseline` 51 to 63, `occurrences` 269 to
  281 and the digest `113681cd…` to
  `5864733ccd1d50e0a81c9c0f71b3bb20a46565ed4200f417ed0b9b1d56f9a5e2`, `Expected  - 3` /
  `Received  + 3`; 0 pass, 14 filtered out, 1 fail (`slice4-legacy-pin-red.log`). After the
  re-pin (`slice4-legacy-repin.patch`) it passed, 1 pass (row 83, `slice4-legacy-pin-green.log`);
  its Proof comment followed (`slice4-legacy-proof.patch`). No other pinned literal moved.
- Task records (`slice4-tasks.patch`): 5.1 noted and left unticked (Work item remains, packet E8),
  7.5 extended.
- Closing: the `tool-devsync` and `twilight-burokrat` type-checks, `twilight-burokrat:lint:source`
  and `tool-devsync:lint` exited 0 (`slice4-typecheck-after.log`,
  `slice4-burokrat-lint-source-after.log`, `slice4-devsync-lint-after.log`); the legacy pin
  passed, 1 pass (`slice4-legacy-pin-after.log`); OpenSpec validation passed `N=114` of 114 with 0
  failed (`openspec-validation.slice4-after.kBRY5m.json`); `M=18`, `B=18`. The whole
  `repo-namespacing-handoff.test.ts` and `tool-devsync:test` are the planner's (they write Git
  objects).

### Work item, Slice 1 — 2026-09-24

- The slice started from `base=57f8c265c0790f986c0f9d49f8a85d6b2ff051f4` on a clean tree, with
  `module/work-item/` absent, E7's modules present, `service/work-item.service.ts` at 4598 lines,
  `service/work-item.service.test.ts` at 2321, one `workItems: new WorkItemService({` in
  `compose.ts`, one `service/work-item.service.ts` pin in be-01's `clock.test.ts`, and `K=93`
  `kinds.json` entries.
- Baselines, after `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice1-lint-typecheck-baseline.log`): core `bun test src` passed `C=613` over `F=66` files
  (`slice1-core-baseline.log`); the be-01 unit set (without `*.db.test.ts` and
  `app.routes.test.ts`) passed `E=520` over `EF=49` (`slice1-be01-unit-baseline.log`); the
  `compose.ts` bundle built with exit 0 and held `application.work-item count=0 (grep exit 1)`
  (row 2, `slice1-compose-bundle-red.log`).
- Row 1: the new `module/work-item/module.test.ts` failed with
  `error: Cannot find module './check'`, 0 pass, 1 fail, 1 error (`slice1-row1-module-red.log`).
- Row 3: after the `cp`, the `mv`, 10.2's import diff and 10.3's shim, `clock.test.ts` failed
  `is reading real service sources, not an empty list` with
  `Expected to contain: "export class WorkItemService"` and the shim's text received; 3 pass,
  1 fail (`slice1-row3-clock-red.log`).
- Row 4: with `contract.ts`, `module.ts`, `check.ts` and `README.md` in place, the module directory
  passed 103 tests, 0 fail, 225 `expect()` calls over 2 files (`slice1-row4-module-green.log`).
- Row 5: after 10.5 (`index.ts`, the `kinds.json` row rewritten to `support`, the moved clock pin),
  `clock.test.ts` passed 4, 0 fail (`slice1-row5-clock-green.log`); lint and typecheck of both
  projects exited 0 (`slice1-lint-typecheck-step5.log`).
- Faults, each restored with `cp` and proved with `cmp` before the next; patch and log under the
  same basename:
  - Row 6, tuple widened to `['workItems', 'workItemOptions']` (`slice1-row6-tuple`): 2 pass,
    3 fail — `Received function did not throw`; `Expected to contain:
"application.work-item/workItemOptions"`; message
    `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "workItemOptions"`.
  - Row 7, label dropped (`slice1-row7-label`): 3 pass, 2 fail — the two label tests; the
    private-binding test stayed green.
  - Row 8, edge: the returned object's `broadcast,` after `journal: journalStore,` replaced by
    `broadcast: { ...broadcast, publish: () => Promise.resolve() },` (`slice1-row8-edge`):
    `announces a created work item through the broadcaster installWorkItem wires` failed,
    expected `[["Scope"]]`, received `[]`; 4 pass, 1 fail.
  - Row 9, `bag` exposed (`slice1-row9-bag`): `exposes only the contract exports from its
installer` failed with received keys adding `"bag"` (`Expected  - 0`, `Received  + 1`); 4 pass,
    1 fail; `wbs-core:typecheck` exit 0 on the mutated tree (`slice1-row9-bag-typecheck.log`).
  - Row 10, `resolve` attached (`slice1-row10-resolver`): the same test failed at
    `Expected: true`, `Received: false`; 4 pass, 1 fail; `wbs-core:typecheck` exit 0
    (`slice1-row10-resolver-typecheck.log`).
  - Row 11, `  now?: () => number;` after the moved `WorkItemServiceOptions`' `  clock: Clock;`
    (`slice1-row11-clock-now`): `is the only clock a service that stamps a write reads` received
    `["libs/wbs/application/core/src/module/work-item/work-item.resource.ts"]`; 3 pass, 1 fail.
- After the restores the module directory and `clock.test.ts` passed 107, 0 fail
  (`slice1-after-faults-green.log`); 10.6's Proof comments followed, and the same run passed 107
  again (`slice1-after-proofs-green.log`).
- Step-8 filesystem substitute for the planner's `service-kinds.test.ts`: `93 []`
  (`slice1-kinds-substitute.log`).
- Closing: core `bun test src` passed `C + 5 = 618` over `F + 1 = 67` (`slice1-core-closing.log`);
  the be-01 unit set passed `E = 520` over `EF = 49` (`slice1-be01-unit-closing.log`); lint and
  typecheck of both projects exited 0 (`slice1-lint-typecheck-closing.log`); `module/work-item/`
  holds seven files.
- 46 code files still name `service/work-item.service.ts` and resolve through the shim; delivery,
  Plan commands, Plan import and Saved plans still name `WorkItemService` or its values directly
  (K2), tracked under 7.4.

### Work item installation, Slice 2 — 2026-09-24

- The slice started from `base=d37d9b63b6aadffe2e9b45359f229f980d902759` on a clean tree, with
  `module/work-item/check.ts` present, one `workItems: new WorkItemService({` and one
  `WorkItemService` value import in `compose.ts`, six `test("installs` cases in `compose.test.ts`,
  and `K=93` `kinds.json` entries.
- Baselines, after `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-baseline.log`): core `bun test src` passed `C=618` over `F=67` files
  (`slice2-core-baseline.log`); the be-01 unit set passed `E=520` over `EF=49`
  (`slice2-be01-unit-baseline.log`); `compose.test.ts` passed 15, 0 fail
  (`slice2-step1-compose-before.log`).
- Bundle counts: before 10.7 the `compose.ts` bundle built with exit 0 and held
  `application.work-item count=0 (grep exit 1)` (`slice2-compose-bundle-red.log`); after 10.7 it
  held `count=1` (row 12, `slice2-compose-bundle-green.log`).
- Row 13: after 10.8, `compose.test.ts` passed 16, 0 fail (`slice2-row13-compose-green.log`); lint
  and typecheck of both projects exited 0 (`slice2-step4-lint-typecheck.log`).
- Faults, each restored with `cp` and proved with `cmp`, then `compose.test.ts` rerun at 16 pass;
  patch and log under the same basename:
  - Row 14, one `installWorkItem(...)` result memoized in a module-level `let reusedWorkItem` in
    `compose.ts` (`row14-per-scope`): run with
    `-t "installs Work item per supplied scope"`, the case failed with `-   "workItems": [],` and
    `+       "name": "Scope",` in the received tree; 0 pass, 15 filtered out, 1 fail;
    `wbs-core:typecheck` exit 0 on the mutated tree (`row14-per-scope.typecheck.log`).
  - Row 15, the `workItemOptions` factory's returned `scheduler,` replaced by
    `scheduler: { ...scheduler },` in `module/work-item/module.ts` (`row15-runtime`): run with
    `-t "shares runtime identities"`, it failed at `compose.test.ts:366`
    (`expect(seen.scheduler).toBe(runtime.scheduler)`) with `error: expect(received).toBe(expected)`
    and `Received: serializes to the same string`; 0 pass, 15 filtered out, 1 fail;
    `wbs-core:typecheck` exit 0 (`row15-runtime.typecheck.log`).
  - Row 16 (optional, run so the Proof comment states only what was seen): the same scheduler copy
    with the replaced `toEqual` over `graphs.map(runtimeOf)` temporarily restored
    (`row16-toEqual-false-green`): 1 pass, 15 filtered out, 0 fail — the false green 10.8 closes.
- 10.9's two Proof comments followed; `compose.test.ts` passed 16, 0 fail
  (`slice2-after-proofs-compose.log`).
- Step-7 filesystem substitute for the planner's `service-kinds.test.ts`: `93 []`
  (`slice2-kinds-substitute.log`).
- Closing: core `bun test src` passed `C + 1 = 619` over `F = 67` (`slice2-core-closing.log`); the
  be-01 unit set passed `E = 520` over `EF = 49` (`slice2-be01-unit-closing.log`); lint and
  typecheck of both projects exited 0 (`slice2-lint-typecheck-closing.log`);
  `grep -cF "new WorkItemService(" compose.ts` printed `0` with exit 1.
- `shares runtime identities while creating a fresh scope, collector and graph per batch` now
  asserts the installed Work item's clock, scheduler and broadcaster by identity (`toBe`), watched
  failing on a structurally equal scheduler copy; no `servicesOver` resource is constructed with
  `new`.

### Work item registration, Slice 3 — 2026-09-24

- The slice started from `base=365e37dddbbd87fe065df6c694e5b8158354cbfd` on a clean tree, with
  `compose.ts` last changed by `365e37dddbbd87fe065df6c694e5b8158354cbfd`, `M=18` pilot modules and
  `B=18` boundaries. The frozen revision `7851161bf96312750d07b933ca5d42b75ce575c7` lists
  `100644 blob 29ab341f9befec90944900d13f9c9c823d06de95` `libs/core/src/service/work-item.service.ts`.
- Before any edit: the `tool-devsync` and `twilight-burokrat` type-checks,
  `twilight-burokrat:lint:source` and `tool-devsync:lint` exited 0
  (`slice3-typecheck-baseline.log`, `slice3-burokrat-lint-source-baseline.log`,
  `slice3-devsync-lint-baseline.log`); `pilot-policy.test.ts` passed `T=21` tests with `TF=0`
  failures and `P=305` `expect()` calls (`slice3-pilot-baseline.log`); the legacy pin passed,
  1 pass (`slice3-legacy-pin-baseline.log`); OpenSpec validation passed `N=114` of 114 with 0
  failed (`slice3-openspec-baseline.json`).
- Registration, each step run with `-t "pins exact pre-index tuples"`, each patch and log under the
  same basename:
  - Row 18, the `modules.json` row alone (`slice3-work-item-1-row-red`): failed at
    `pilot-policy.test.ts:383`, `Expected: 18`, `Received: 19`; 0 pass, 20 filtered out, 1 fail,
    30 `expect()` calls.
  - Row 19, with the `policy.json` boundary (`slice3-work-item-2-boundary-red`): failed at
    `pilot-policy.test.ts:420`, `Expected: true`, `Received: false`; 0 pass, 20 filtered out,
    1 fail, 34 calls.
  - Row 20, with the `pilotPaths` entry and the README index (`slice3-work-item-3-index-green`):
    1 pass, 20 filtered out, 0 fail, 40 calls.
- Green (row 21): the whole pilot file passed `T=21` tests, `TF=0` failures and `P + 1 = 306`
  `expect()` calls (`slice3-pilot-whole-green.log`); the prose-refusal pin did not move.
- Legacy pin red, pin unchanged (row 22): `every legacy source occurrence and relevant text family
is pinned` failed with `historical policy selector or baseline` 63 to 65, `occurrences` 281 to
  283 and the digest `5864733c…` to
  `0d78b5794663e2bd708b6d307ba2643d33a414d717771b682392445958fe4e07`, `Expected  - 3` /
  `Received  + 3`; 0 pass, 14 filtered out, 1 fail (`slice3-legacy-pin-red.log`). After the
  re-pin (`slice3-legacy-repin.patch`) it passed, 1 pass (row 23, `slice3-legacy-pin-green.log`);
  its Proof comment followed (`slice3-legacy-proof.patch`). No other pinned literal moved.
- Task records (`slice3-tasks.patch`): 5.1 ticked with its dated note, 7.5 extended.
- Closing: the `tool-devsync` and `twilight-burokrat` type-checks, `twilight-burokrat:lint:source`
  and `tool-devsync:lint` exited 0 (`slice3-typecheck-after.log`,
  `slice3-burokrat-lint-source-after.log`, `slice3-devsync-lint-after.log`); the legacy pin
  passed, 1 pass (`slice3-legacy-pin-after.log`); OpenSpec validation passed `N=114` of 114 with 0
  failed (`slice3-openspec-after.json`); `M=19`, `B=19`. The whole
  `repo-namespacing-handoff.test.ts` and `tool-devsync:test` are the planner's (they write Git
  objects).

### Plan commands, Slice 1 — 2026-09-24

- The slice started from `base=a726b701b8619cacdeead282317a565c0b97ebae` on a clean tree, with
  `module/plan-commands/` absent, E8's `module/work-item/check.ts` present,
  `service/plan-commands.ts` at 393 lines, `use-cases/run-command-batch.ts` at 31,
  `service/command-bindings.ts` at 545, one `AnnouncementCollector` class in
  `service/broadcast.ts`, no `new PlanCommandRunner(` in `compose.ts`, and `K=93` `kinds.json`
  entries (`slice1-step0.log`).
- Baselines, after `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice1-lint-typecheck-baseline.log`): core `bun test src` passed `C=619` over `F=67` files
  (`slice1-core-baseline.log`); the be-01 unit set (without `*.db.test.ts` and
  `app.routes.test.ts`) passed `E=520` over `EF=49` (`slice1-be01-unit-baseline.log`); the
  `compose.ts` bundle built with exit 0 and held `application.plan-commands count=0 (grep exit 1)`
  (row 2, `slice1-compose-bundle-red.log`).
- Row 1: the new `module/plan-commands/module.test.ts` failed with
  `error: Cannot find module './check'`, 0 pass, 1 fail, 1 error (`slice1-row1-module-red.log`).
- Row 3: after the `cp`, the `mv`, 10.2's import diff, 10.3's shims and 10.4's module files, the
  module directory passed 41 tests, 0 fail, 159 `expect()` calls over 4 files
  (`slice1-row3-module-green.log`).
- Row 4: after 10.5 (`index.ts`, four `kinds.json` rows), the sideways suite passed, 1 pass, 0 fail
  (`slice1-row4-sideways.log`).
- Row 11, the gap: with the move made and no module rows, `import '../../service/auth.service';`
  prepended to `module/plan-commands/run-command-batch.ts` left the sideways suite passing, 1 pass,
  0 fail (`row11-gap-auth-shim`). After 10.6's three rows the unmutated suite passed, 1 pass
  (row 15, `slice1-row15-sideways.log`); lint and typecheck of both projects exited 0
  (`slice1-step6-lint-typecheck.log`).
- Faults, each restored with `cp` and proved with `cmp` before the next; patch and log under the
  same basename:
  - Row 5, tuple widened to `['commands', 'planCommandOptions']` (`row5-tuple`): 3 pass, 3 fail —
    `Received function did not throw`; `Expected to contain:
"application.plan-commands/planCommandOptions"`; message
    `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "planCommandOptions"`.
  - Row 6, label dropped (`row6-label`): 4 pass, 2 fail — the two label tests; the private-binding
    test stayed green.
  - Row 7, drain: the returned object's `announcements,` replaced by
    `announcements: { ...announcements, publish: () => Promise.resolve() },` (`row7-drain`):
    `drains a committed batch into the broadcaster installPlanCommands wires` failed, expected
    `[{ "event": { "type": "capacity_changed" }, "projectId": "project-1" }]`, received `[]`;
    5 pass, 1 fail.
  - Row 8, collector: the returned object's `batchServices,` replaced by
    `batchServices: (scope) => batchServices(scope, announcements),` (`row8-collector`):
    `hands every batch its own collector, never the direct broadcaster` failed with
    `expect(received).not.toBe(expected)` at `expect(handed[0]).not.toBe(handed[1])`; 5 pass,
    1 fail; `wbs-core:typecheck` exit 0 on the mutated tree (`row8-collector.typecheck.log`).
  - Row 9, `bag` exposed (`row9-bag`): `exposes only the contract exports from its installer`
    failed with received keys adding `"bag"` (`Expected  - 0`, `Received  + 1`); 5 pass, 1 fail;
    `wbs-core:typecheck` exit 0 (`row9-bag.typecheck.log`).
  - Row 10, `resolve` attached (`row10-resolver`): the same test failed at `Expected: true`,
    `Received: false`; 5 pass, 1 fail; `wbs-core:typecheck` exit 0
    (`row10-resolver.typecheck.log`).
  - Row 12 (`row12-auth-shim`): the sideways suite failed with exactly
    `"module/plan-commands/run-command-batch.ts: '../../service/auth.service' reaches service/auth.service.ts"`;
    0 pass, 1 fail.
  - Row 13 (`row13-auth-feature`): exactly
    `"module/plan-commands/run-command-batch.ts: '../authentication/authentication.feature' reaches module/authentication/authentication.feature.ts"`;
    0 pass, 1 fail.
  - Row 14 (`row14-endpoint`): exactly
    `"module/plan-commands/run-command-batch.ts: '../../http/endpoint' reaches http/endpoint.ts"`;
    0 pass, 1 fail.
- 10.7's Proof comments followed the restores. Filesystem substitute for the planner's
  `service-kinds.test.ts`: `93 []` (`slice1-kinds-substitute.log`).
- Closing: core `bun test src` passed `C + 6 = 625` over `F + 1 = 68` (`slice1-closing-core.log`);
  the be-01 unit set passed `E = 520` over `EF = 49` (`slice1-closing-be01-unit.log`); lint and
  typecheck of both projects exited 0 (`slice1-closing-lint-typecheck.log`); be-01's
  `clock.test.ts` passed 4 (`slice1-closing-clock.log`); `module/plan-commands/` holds eleven
  files; `nx format:check --all` exited 0 (`slice1-closing-format.log`).
- The announcement collector stays in `service/broadcast.ts` as an implementation of the neutral
  `Broadcaster` port shared by the two admitting features, barred from either by K6: Plan import
  builds one too (task 1.2); be-01's `mountedEndpoints` still constructs `PlanCommandRunner`
  directly (tracked under 7.4).

### Working plan, Slice 2 — 2026-09-24

- The slice started from `base=364db8f539082b413eda640ee70ded83617ab90e` on a clean tree, with
  slice 1's `module/plan-commands/check.ts` present, no `working-plan.resource.ts` in the module,
  `service/working-plan.ts` at 629 lines, nine `service/working-plan*` files, and `K=93`
  `kinds.json` entries.
- Baselines, after `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-baseline.log`): core `bun test src` passed `C=625` over `F=68` files
  (`slice2-core-baseline.log`); the be-01 unit set (without `*.db.test.ts` and
  `app.routes.test.ts`) passed `E=520` over `EF=49` (`slice2-be01-unit-baseline.log`); the
  `compose.ts` bundle built with exit 0 and held `application.plan-commands count=0 (grep exit 1)`
  (`slice2-compose-bundle-red.log`).
- Row 17: after the three test `mv`s and 10.8's import diff, before the sources moved, the three
  moved tests failed with `error: Cannot find module './working-plan.resource'` (twice) and
  `'./working-plan-directory'`; 0 pass, 3 fail (`slice2-row17-moved-tests-red.log`).
- Row 18: after the `cp`, the five `mv`s, 10.9's shim and 10.10's import diff, the module directory
  passed 61 tests, 0 fail, 240 `expect()` calls over 7 files (`slice2-row18-module-green.log`).
- Row 19: after 10.11 (one `kinds.json` row rewritten to a shim, five removed; the README's Working
  plan paragraph), the filesystem substitute for the planner's `service-kinds.test.ts` printed
  `88 []` (`K - 5`, `slice2-kinds-substitute.log`); lint and typecheck of both projects exited 0
  (`slice2-step4-lint-typecheck.log`).
- Row 20, restored with `cp` and proved with `cmp` (`row20-working-plan`): `readonly stores:
PlanTransactionalStores;` in `module/plan-commands/working-plan.resource.ts` replaced by
  `readonly stores: PlanTransactionalStores & { readonly users?: unknown };` made
  `wbs-core:typecheck` exit 1 with exactly
  `module/plan-commands/working-plan.types.test.ts:11:1 - error TS2578: Unused '@ts-expect-error' directive.`
  and `Found 1 error` — the moved compile witness is still type-checked. No Proof comment follows:
  the witness's own Proof already names this fault, and the moved body may not change.
- Closing: core `bun test src` passed `C = 625` over `F = 68` (`slice2-closing-core.log`); the
  be-01 unit set passed `E = 520` over `EF = 49` (`slice2-closing-be01-unit.log`); lint and
  typecheck of both projects exited 0 (`slice2-closing-lint-typecheck.log`);
  `module/plan-commands/` holds twenty files and `service/` one `working-plan*` file
  (`slice2-closing-listing.log`); `nx format:check --all` exited 0 (`slice2-closing-format.log`).
- The five Working plan implementation files keep no former path; `service/working-plan.ts` stays
  a shim for `@wbs/core`'s `createWorkingPlan` export, which one SQLite database test uses.

### Plan commands installation, Slice 3 — 2026-09-24

- The slice started from `base=7bb788887186b0fdfb18bde076c26dd4db705516` on a clean tree, with
  slice 2's `module/plan-commands/working-plan.resource.ts` present, no `installPlanCommands` in
  `compose.ts` (`0`) and one fixture runner in `compose.test.ts` (`1`) (`slice3-step0.log`).
- Baselines, after `wbs-core` and `wbs-be-01` lint and typecheck exited 0
  (`slice3-lint-typecheck-baseline.log`): core `bun test src` passed `C=625` over `F=68` files
  (`slice3-core-baseline.log`); the be-01 unit set (without `*.db.test.ts` and
  `app.routes.test.ts`) passed `E=520` over `EF=49` (`slice3-be01-unit-baseline.log`); the red
  `compose.ts` bundle built with exit 0 and held `application.plan-commands count=0 (grep exit 1)`
  (`slice3-compose-bundle-red.log`).
- Row 21: after 10.12 (the fixture's runner becomes `graph.commands`; one new case),
  `compose.test.ts` ran 13 pass, 4 fail, with
  `TypeError: undefined is not an object (evaluating 'runner.run')` (three) and
  `(evaluating 'graph.commands.runDirectory')` (`slice3-row21-compose-test-red.log`);
  `wbs-core:typecheck` exited 1 with
  `TS2339: Property 'commands' does not exist on type 'CommonServices'.` at `compose.test.ts:109`,
  `:241`, `:244` and `:250` (`slice3-row21-typecheck-red.log`).
- Row 23: after 10.13 (`compose.ts` installs Plan commands as `commands`; the README names the
  installation), `compose.test.ts` passed 17, 0 fail (`slice3-row23-compose-test-green.log`).
- Row 22: the green `compose.ts` bundle built with exit 0 and held
  `application.plan-commands count=1` (`slice3-compose-bundle-green.log`). Lint and typecheck of
  both projects exited 0 (`slice3-step4-lint-typecheck.log`).
- Row 26, restored with `cp` and proved with `cmp` (`slice3-row26-memo-fault.patch`): one line
  `let firstBatch: WritingServices | undefined;` before `export interface ServicesOverOptions {`
  and Plan commands' `batchServices: batch,` replaced by
  `batchServices: (scope, broadcast) => (firstBatch ??= batch(scope, broadcast)),` made
  `bun test ./libs/wbs/application/core/src/compose.test.ts -t "installs Plan commands once"` fail
  at the final `listTeams` assertion with `error: expect(received).toEqual(expected)`,
  `-   "Second",`, `Expected  - 1`, `Received  + 0`; 0 pass, 16 filtered out, 1 fail
  (`slice3-row26-memo-fault.log`); `wbs-core:typecheck` on the mutated tree exited 0
  (`slice3-row26-memo-fault-typecheck.log`). After the restore the named test passed alone
  (`slice3-row26-restored-green.log`); 10.14's Proof comment followed.
- Closing: core `bun test src` passed `C + 1 = 626` over `F = 68` (`slice3-core-closing.log`); the
  be-01 unit set passed `E = 520` over `EF = 49` (`slice3-be01-unit-closing.log`); lint and
  typecheck of both projects exited 0 (`slice3-lint-typecheck-closing.log`);
  `nx format:check --all` exited 0 (`slice3-format-check-closing.log`).
- `composeServices` installs Plan commands once as `commands`; be-01's `mountedEndpoints` does not
  read it yet and still constructs its own runner (tracked under 7.4).

### Plan commands registration, Slice 4 — 2026-09-24

- The slice started from `base=a934a5a6353a23d73fb748768dbb2315bfa6ba86` on a clean tree; the
  last commit touching `compose.ts` was slice 3's `a934a5a6353a23d73fb748768dbb2315bfa6ba86`; the
  pilot held `M=19` modules and `B=19` boundaries; the frozen tuple printed exactly
  `100644 blob 720f5d37a03073e4445eeb40bf3b8d8bb0f6a03d	libs/core/src/service/plan-commands.ts`.
- Baselines before any edit: `tool-devsync` and `twilight-burokrat` typecheck exited 0
  (`slice4-typecheck-baseline.log`), `twilight-burokrat:lint:source` exited 0
  (`slice4-burokrat-lint-source-baseline.log`), `tool-devsync:lint` exited 0
  (`slice4-devsync-lint-baseline.log`); the whole `pilot-policy.test.ts` ran `T=21` tests,
  `TF=0` failures, `P=306` `expect()` calls in 381 s (`slice4-pilot-baseline.log`); the legacy pin
  passed alone (`slice4-legacy-pin-baseline.log`); OpenSpec validation passed `N=114`, failed 0
  (`slice4-openspec-baseline.json`).
- Row 27: after 10.15 (the `modules.json` row, 20 modules), the filtered
  `pins exact pre-index tuples and passes observe lint from external trust` failed at
  `pilot-policy.test.ts:384` with `Expected: 19`, `Received: 20`; 0 pass, 20 filtered out, 1 fail
  (`slice4-row27-parity-red.log`).
- Row 28: after 10.16 (the `policy.json` boundary, 20 boundaries), the same test failed at
  `pilot-policy.test.ts:421` with `Expected: true`, `Received: false`; 0 pass, 1 fail
  (`slice4-row28-discovered-index-red.log`).
- Row 29: after 10.17's first block (the `pilotPaths` entry and the README's `module-index` block,
  `check.core.test` sentence and "Wiki registration"), the same test passed: 1 pass, 0 fail
  (`slice4-row29-registered-green.log`).
- Row 30: the whole pilot file ran `T=21` tests, `TF=0` failures and `P + 1 = 307` `expect()`
  calls (`slice4-row30-pilot-whole.log`).
- Row 31: with the legacy pin unchanged,
  `every legacy source occurrence and relevant text family is pinned` failed with
  `historical policy selector or baseline` 65 → 67, `occurrences` 283 → 285 and digest
  `0d78b579…` → `687c123b315024882f690de60d7a3ac6890f89200a880ebf21b2242b66987a54`,
  `Expected - 3`, `Received + 3`, `unclassified` still `[]`; 0 pass, 1 fail
  (`slice4-row31-legacy-pin-red.log`). No other pinned literal moved.
- Row 32: after 10.17's numbers block the test passed, 1 pass (`slice4-row32-legacy-pin-green.log`);
  10.18's Proof comment and 10.19's `tasks.md` records (1.2 and 5.2 reworded and ticked, 7.5
  extended) followed.
- Closing: `tool-devsync` and `twilight-burokrat` typecheck exited 0
  (`slice4-typecheck-closing.log`), `twilight-burokrat:lint:source` exited 0
  (`slice4-burokrat-lint-source-closing.log`), `tool-devsync:lint` exited 0
  (`slice4-devsync-lint-closing.log`); the legacy pin passed alone, 1 pass
  (`slice4-legacy-pin-closing.log`); OpenSpec validation passed `N=114`, failed 0
  (`slice4-openspec-closing.json`).

### Optimization, Slice 1 — 2026-09-24

- The slice started from `base=1916df5cb7838a82a80e46ec5830b9737da03382` on a clean tree, with
  `module/optimization` absent and packet G's `plan-commands/check.ts` present; the coordinator had
  737 lines, the lifecycle 106, `services.ts` one `new OptimizationCoordinator({` construction, and
  `kinds.json` held `K=88` entries.
- Baselines before any edit: `wbs-be-01` lint and typecheck exited 0
  (`slice1-lint-typecheck-baseline.log`); the be-01 unit set (without `*.db.test.ts` and
  `app.routes.test.ts`) passed `E=520` over `EF=49` files (`slice1-be01-unit-baseline.log`); the six
  optimizer database files passed `D=54` over `DF=6` (`slice1-be01-db-baseline.log`).
- Row 1: `module/optimization/module.test.ts` alone, before any module file existed, failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error (`slice1-row1-red.log`).
- Row 2: the bundles of `main.ts` and `dev/main.ts` built (exit 0) and held
  `backend.optimization` and `backend.solver-supervisor` `count=0 (grep exit 1)` in both
  (`slice1-main-bundle-red.log`, `slice1-dev-main-bundle-red.log`).
- Row 3: after the moves, 10.2, the shims and the four module files, the module directory ran
  11 pass, 0 fail, 17 `expect()` calls over 2 files (`slice1-row3-green.log`).
- Row 4: before 10.6, adding `now?: () => number;` to the moved `OptimizationCoordinatorOptions`
  left `clock.test.ts` at 4 pass, 0 fail — the gap the move opened (`row4-clock-gap.patch`,
  `row4-clock-gap.log`); after 10.6 the unmutated file ran 4 pass
  (`slice1-clock-after-10.6.log`).
- Row 5: after 10.5, `backend.optimization count=1` in both bundles and
  `backend.solver-supervisor` still `count=0 (grep exit 1)` (`slice1-row5-bundles.out`).
- Row 6, tuple (`['optimizer', 'optimizationOptions']`): the private-binding, graph-label and
  missing-requirement tests failed with `Received function did not throw`,
  `Expected to contain: "backend.optimization/optimizationOptions"` and a message naming
  `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "optimizationOptions"`; 3 pass, 3 fail
  (`row6-tuple.patch`, `row6-tuple.log`).
- Row 7, label (`{ label: OPTIMIZATION_LABEL }` dropped): only
  `labels its private bindings with the module name` and
  `names itself when a host omits a requirement` failed; 4 pass, 2 fail (`row7-label.patch`,
  `row7-label.log`).
- Row 8, edge (`contractVersion: solverVersion`):
  `reads an idle plan under the identity installOptimization wires` failed on
  `-   "contractVersion": "7+0.1.0",` / `+   "contractVersion": "0.1.0",`; 5 pass, 1 fail
  (`row8-edge.patch`, `row8-edge.log`).
- Row 9, sink (`onChildError: () => undefined`):
  `reports a failed edit read to the error sink installOptimization wires` expected
  `[ [Error: enabled read refused] ]` and received `[]`; 5 pass, 1 fail (`row9-sink.patch`,
  `row9-sink.log`).
- Row 10, bag (an `exposed` object carrying `bag`):
  `exposes only the contract exports from its installer` failed on `+   "bag",`
  (`Expected - 0`, `Received + 1`); 5 pass, 1 fail; `wbs-be-01:typecheck` on the mutated tree
  exited 0 (`row10-bag.patch`, `row10-bag.log`, `row10-bag-typecheck.log`).
- Row 11, resolver (`resolve` attached to the returned coordinator): the same test failed its
  second assertion, `Expected: true`, `Received: false`; 5 pass, 1 fail; typecheck exited 0
  (`row11-resolver.patch`, `row11-resolver.log`, `row11-resolver-typecheck.log`).
- Row 12, clock again after 10.6: `is the only clock a service that stamps a write reads` failed
  on `+   "apps/wbs/be-01/src/module/optimization/optimization.feature.ts",`; 3 pass, 1 fail
  (`row12-clock.patch`, `row12-clock.log`).
- Row 13, scan (`serviceFolders` returning `[...FOLDERS, ...modulesIn(MODULES)]`):
  `is reading real service sources, not an empty list` failed at
  `expect(received).toBeDefined()` with `Received: undefined`; 3 pass, 1 fail (`row13-scan.patch`,
  `row13-scan.log`).
- Each fault was restored by copying the saved bytes back and proved with `cmp` before the next.
- Row 15: Bun's transpiler output with every `import` and `export … from` statement removed was
  byte-identical for the moved coordinator and lifecycle against their `base` sources:
  `optimization-coordinator body identical`, `solver-child-lifecycle body identical`
  (`slice1-erased.out`, `slice1-erased-before-*.js`, `slice1-erased-after-*.js`).
- Kinds substitute: `88 []` (`slice1-kinds.out`).
- Closing: the be-01 unit set passed `E + 6 = 526` over `EF + 1 = 50` files
  (`slice1-close-unit.log`); the database files `54` over 6 (`slice1-close-db.log`);
  `clock.test.ts` 4 pass (`slice1-close-clock.log`); `production-entrypoint.test.ts` 2 pass
  (`slice1-close-entrypoint.log`); `wbs-be-01` lint and typecheck exited 0
  (`slice1-close-lint-typecheck.log`); `module/optimization/` holds nine files.
- The feature still takes the SQLite `db` and calls the repository functions directly (K3,
  recorded in `contract.ts`, tracked under 3.6 and 7.4).

### Optimization cache-key port, Slice 2 — 2026-09-24

- The slice started from `base=ec5a282b3ac875dcfd10480d5c86a7cbe9b1cf13` on a clean tree, with
  `module/optimization/check.ts` present and no `module-boundaries.test.ts`; the feature held three
  `scheduleInputHash(` calls and `optimization-coordinator.db.test.ts` seven
  `new OptimizationCoordinator({` constructions.
- Baselines before any edit: `wbs-be-01` lint and typecheck exited 0
  (`slice2-lint-typecheck-baseline.log`); the be-01 unit set passed `E=526` over `EF=50` files
  (`slice2-be01-unit-baseline.log`); the six optimizer database files passed `D=54` over `DF=6`
  (`slice2-be01-db-baseline.log`); `backend.optimization count=1` in both bundles and
  `backend.solver-supervisor count=0 (grep exit 1)` in both (`slice2-main-bundle-red.log`,
  `slice2-dev-main-bundle-red.log`).
- Row 16: `module-boundaries.test.ts` on the unchanged feature failed with exactly
  `"module/optimization/optimization.feature.ts: '../../repository/schedule-input-hash' reaches apps/wbs/be-01/src/repository/schedule-input-hash.ts"`
  and
  `"module/optimization/optimization.feature.ts: scheduleInputHash reaches libs/wbs/adapters/store-sqlite/src/schedule-input-hash.ts"`;
  0 pass, 1 fail (`slice2-row16-boundary-red.log`).
- Row 17: after 10.9 alone, `module/optimization/module.test.ts` ran 5 pass, 2 fail on
  `-   "inputHash": "port-hash",` and `-   "currentInputHash": "port-hash",` against
  `a2aad9dfa76c921e25b3204345d3216920dcf8787577905f5c9ac0637120ab11`
  (`slice2-row17-module-red.log`); `wbs-be-01:typecheck` exited 1 with `TS2353` at
  `module.test.ts:51:5` (`'hashInput' does not exist in type 'OptimizationCoordinatorOptions'`) and
  `TS2339` at `:73:53` (`slice2-row17-typecheck-red.log`).
- Row 18: after 10.10, the module directory and the boundary file ran 13 pass, 0 fail, 21
  `expect()` calls over 3 files: the module directory 12 (18 calls) and the boundary file 1
  (3 calls; the packet's rehearsal note said 4, the file holds three `expect`s)
  (`slice2-row18-green.log`). `wbs-be-01` lint and typecheck then exited 0
  (`slice2-step4-lint-typecheck.log`).
- Row 19, port (`hashInput: () => 'module-hash'` in `module.ts`'s returned options):
  `reads an idle plan under the identity installOptimization wires` and
  `hashes a Retry through the cache-key port installOptimization wires` failed on
  `+   "inputHash": "module-hash",` and `+   "currentInputHash": "module-hash",`; 5 pass, 2 fail
  (`slice2-row19-port.patch`, `slice2-row19-port.log`).
- Row 20, schema (prepended
  `import type { SolverObjectiveName as StoredObjectiveName } from '../../repository/schema';`):
  exactly `'../../repository/schema' reaches apps/wbs/be-01/src/repository/schema.ts` and
  `SolverObjectiveName reaches libs/wbs/adapters/store-sqlite/src/schema.ts`; 0 pass, 1 fail
  (`slice2-row20-schema.patch`, `slice2-row20-schema.log`).
- Row 21, package (prepended `import '@wbs/store-sqlite/schema';`): exactly
  `'@wbs/store-sqlite/schema' reaches libs/wbs/adapters/store-sqlite/src/schema.ts`; 0 pass, 1 fail
  (`slice2-row21-package.patch`, `slice2-row21-package.log`).
- Row 22, repo (prepended to `contract.ts` `import '../../repository/optimization-admission';`):
  exactly
  `"module/optimization/contract.ts: '../../repository/optimization-admission' reaches apps/wbs/be-01/src/repository/optimization-admission.ts"`;
  0 pass, 1 fail (`slice2-row22-repo.patch`, `slice2-row22-repo.log`).
- Row 23, adapter (`import '@wbs/store-sqlite/optimization-admission';`): exactly
  `'@wbs/store-sqlite/optimization-admission' reaches libs/wbs/adapters/store-sqlite/src/optimization-admission.ts`;
  0 pass, 1 fail (`slice2-row23-adapter.patch`, `slice2-row23-adapter.log`).
- Row 24, private (`import './solver-child-lifecycle';`): exactly
  `'./solver-child-lifecycle' reaches apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts`;
  0 pass, 1 fail (`slice2-row24-private.patch`, `slice2-row24-private.log`).
- Row 25, absent (`configPath` at `tsconfig.absent.json`):
  `error: Cannot read file '…/apps/wbs/be-01/tsconfig.absent.json'.`; 0 pass, 1 fail
  (`slice2-row25-absent.patch`, `slice2-row25-absent.log`).
- Row 26, invalid (`"module": "invalid"` in `tsconfig.lib.json`):
  `error: refused tsconfig.lib.json: 6046`; 0 pass, 1 fail (`slice2-row26-invalid.patch`,
  `slice2-row26-invalid.log`).
- Row 27, paths (`paths: undefined` in the program options): the positive control failed with
  `Expected to contain: "libs/wbs/domain/domain/src/stored-vocabularies.ts"`; 0 pass, 1 fail
  (`slice2-row27-paths.patch`, `slice2-row27-paths.log`).
- Row 28, missing (`.concat('module/missing.ts')` before the sort):
  `error: the program holds no module/missing.ts`; 0 pass, 1 fail (`slice2-row28-missing.patch`,
  `slice2-row28-missing.log`).
- Row 29, scanned (filter on `.tsx`): the scanned-file control failed with
  `Expected to contain: "module/optimization/contract.ts"`, `Received: []`; 0 pass, 1 fail
  (`slice2-row29-scanned.patch`, `slice2-row29-scanned.log`).
- Each fault was restored by copying the saved bytes back, proved with `cmp`, and the named test
  rerun green (`slice2-row*-restored.log`) before the next.
- Row 31: Bun's transpiler output with every `import` and `export … from` statement removed
  differed from the `base` feature in exactly six lines, three pairs, each
  `scheduleInputHash(` → `this.options.hashInput(`: `if (… (input) !== next.inputHash)`,
  `const currentInputHash = …(ask.input);` and `const inputHash = …(ask.input);`
  (`slice2-erased.diff`, `slice2-erased-before.js`, `slice2-erased-after.js`).
- Closing: the be-01 unit set passed `E + 2 = 528` over `EF + 1 = 51` files
  (`slice2-be01-unit-green.log`); the database files `54` over 6 (`slice2-be01-db-green.log`);
  `wbs-be-01` lint and typecheck exited 0 (`slice2-lint-typecheck-green.log`); the format check
  exited 0 (`slice2-format-check.log`).
- `module-boundaries.test.ts` resolves module specifiers and identifiers; a member selected by
  string key out of an allowed barrel is its stated residual.

### Solver supervisor, Slice 3 — 2026-09-24

- The slice started from `base=3c8b89628dc431e56dfcbaa39c54582119fb5cb0` on a clean tree, with
  `module-boundaries.test.ts` present and no `module/solver-supervisor/`; the client held 277 lines,
  the mapper 47, its first line
  `import type { ReservedSolverChild, ReservedSpawner } from './optimization-coordinator';`, and
  `kinds.json` `K=88` entries.
- Baselines before any edit: `wbs-be-01` lint and typecheck exited 0
  (`slice3-lint-typecheck-baseline.log`); the be-01 unit set passed `E=528` over `EF=51` files
  (`slice3-be01-unit-baseline.log`); the six optimizer database files passed `D=54` over `DF=6`
  (`slice3-be01-db-baseline.log`); `backend.optimization count=1` in both bundles and
  `backend.solver-supervisor count=0 (grep exit 1)` in both (`slice3-main-bundle-red.log`,
  `slice3-dev-main-bundle-red.log`).
- Row 32: `module/solver-supervisor/module.test.ts` on the unchanged tree failed with
  `error: Cannot find module './check'`; 0 pass, 1 fail, 1 error (`slice3-row32-module-red.log`).
- Row 33: after the `cp` and three `mv`s, before 10.13, `wbs-be-01:typecheck` exited 1, among its
  errors `s/solver-supervisor-spawner.ts:1:59 - error TS2307: Cannot find module './optimization-coordinator'`
  (`slice3-row33-typecheck-red.log`).
- Row 34: after 10.13, 10.14 and 10.15, the module directory ran 9 pass, 0 fail, 25 `expect()`
  calls over 3 files (`slice3-row34-green.log`).
- Row 35: after 10.16, `main backend.solver-supervisor count=1`,
  `dev/main backend.solver-supervisor count=0 (grep exit 1)`, `backend.optimization count=1` in both
  (`slice3-main-bundle-green.log`, `slice3-dev-main-bundle-green.log`);
  `production-entrypoint.test.ts` 2 pass (`slice3-row35-entrypoint.log`). After 10.17 the boundary
  file ran 1 pass (`slice3-step5-boundary-green.log`); `wbs-be-01` lint and typecheck exited 0
  (`slice3-step6-lint-typecheck.log`).
- Row 36, tuple (`['spawner', 'supervisorOptions']`): `Received function did not throw`;
  `Expected to contain: "backend.solver-supervisor/supervisorOptions"`; message
  `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "supervisorOptions"`; 2 pass, 3 fail
  (`slice3-row36-tuple.patch`, `slice3-row36-tuple.log`).
- Row 37, label (`.buildModule(['spawner'])`): the two label tests failed; 3 pass, 2 fail
  (`slice3-row37-label.patch`, `slice3-row37-label.log`).
- Row 38, edge (`searchWorkers: 1` in the returned options):
  `hands the reserved attempt to the connector installSolverSupervisor wires` failed on
  `-     "searchWorkers": 2,` / `+     "searchWorkers": 1,`; 4 pass, 1 fail
  (`slice3-row38-edge.patch`, `slice3-row38-edge.log`).
- Row 39, bag (`exposed` with `bag`): `exposes only the contract exports from its installer` failed
  on `+   "bag",`; 4 pass, 1 fail in `module.test.ts` alone; `wbs-be-01:typecheck` exit 0
  (`slice3-row39-bag.patch`, `slice3-row39-bag.log`, `slice3-row39-bag-typecheck.log`).
- Row 40, resolver (`resolve` attached to the port): the same test failed on `Expected: true`,
  `Received: false`; 4 pass, 1 fail in `module.test.ts` alone; typecheck exit 0
  (`slice3-row40-resolver.patch`, `slice3-row40-resolver.log`, `slice3-row40-resolver-typecheck.log`).
- Row 41, shim (prepended
  `import type { ReservedSpawner as FeatureSpawner } from '../../service/optimization-coordinator';`
  to the mapper): exactly one violation,
  `"module/solver-supervisor/solver-supervisor-spawner.ts: '../../service/optimization-coordinator' reaches apps/wbs/be-01/src/service/optimization-coordinator.ts"`;
  0 pass, 1 fail (`slice3-row41-shim.patch`, `slice3-row41-shim.log`).
- Row 42, feature (prepended `import '../optimization/optimization.feature';`): exactly one
  violation,
  `"module/solver-supervisor/solver-supervisor-spawner.ts: '../optimization/optimization.feature' reaches apps/wbs/be-01/src/module/optimization/optimization.feature.ts"`;
  0 pass, 1 fail (`slice3-row42-feature.patch`, `slice3-row42-feature.log`).
- Each fault was restored by copying the saved bytes back, proved with `cmp`, and the named test
  rerun green (`slice3-row*-restored.log`) before the next.
- `cmp` of `module/solver-supervisor/solver-supervisor.repository.ts` with the `base` client exited 0:
  the repository file moved unchanged. The moved mapper differs from its `base` source in its two
  import specifiers only, and its erased body is identical (`slice3-mapper.diff`,
  `slice3-erased-before-spawner.js`, `slice3-erased-after-spawner.js`).
- The kinds substitute printed `87 []` (`K - 1`).
- Closing: the be-01 unit set passed `E + 5 = 533` over `EF + 1 = 52` files
  (`slice3-be01-unit-green.log`); the database files `54` over 6 (`slice3-be01-db-green.log`);
  `production-entrypoint.test.ts` 2 pass (`slice3-entrypoint-green.log`); `wbs-be-01` lint and
  typecheck exited 0 (`slice3-lint-typecheck-green.log`); `module/solver-supervisor/` holds nine
  files; the format check exited 0 (`slice3-format-check.log`).
- The mapper keeps no former path; its `kinds.json` repository row is removed, the module README
  names it private support.

### Optimization and Solver supervisor registration, Slice 4 — 2026-09-24

- `base` `f6abafe6bdaedfa1923ac58facf35a4f12cb88ea` (slice 3's planner commit); clean tree; the
  last commit touching `module/solver-supervisor/module.ts` is `base` itself. `M = 20` modules and
  `B = 20` boundaries (`slice4-step0.log`).
- Frozen tuples at `7851161bf96312750d07b933ca5d42b75ce575c7`:
  `100644 blob 5a8c8f54f430cd67e29d12d3f35b4d77a2d9ae39 apps/be-01/src/service/optimization-coordinator.ts`
  and
  `100644 blob 31b66e999d627f2b2cd2709893c449dcfab8b3f8 apps/be-01/src/service/solver-supervisor-client.ts`.
- Before any edit: `tool-devsync` and `twilight-burokrat` typecheck, `twilight-burokrat:lint:source`
  and `tool-devsync:lint` exited 0 (`slice4-baseline-typecheck.log`,
  `slice4-baseline-burokrat-lint-source.log`, `slice4-baseline-devsync-lint.log`); the legacy pin
  1 pass (`slice4-baseline-legacy-pin.log`); the whole pilot file `T = 21` tests, `TF = 0`
  failures, `P = 307` `expect()` calls in 319.68 s (`slice4-pilot-baseline.log`); OpenSpec
  `N = 114` passed, 0 failed (`openspec-validation.baseline.sFWVcT.json`).
- Row 44, `modules.json` rows alone: `pins exact pre-index tuples and passes observe lint from
external trust` failed at `pilot-policy.test.ts:385` on `Expected: 20`, `Received: 22`; 0 pass,
  1 fail (`slice4-row44-parity-red.log`).
- Row 45, rows and boundaries: the same test failed at `pilot-policy.test.ts:422` on
  `Expected: true`, `Received: false`; 0 pass, 1 fail (`slice4-row45-discovered-index-red.log`).
- Row 46, `pilotPaths` and both README indexes added: the same test 1 pass, 0 fail
  (`slice4-row46-filtered-green.log`).
- Row 47, the whole pilot file with the prose pin unchanged: exactly
  `refuses prose facts presented as applicable checks` failed with
  `Received: "applicable check has no executable authority in apps/wbs/be-01/src/module/optimization/README.md: check.be-01.test (external-consumer)\n"`;
  20 pass, 1 fail, 309 `expect()` calls (`slice4-row47-prose-pin-red.log`).
- Row 48, after 10.22's pin moved: the whole pilot file 21 pass, 0 fail, 309 `expect()` calls
  (`T`, `TF`, `P + 2`) in 281.70 s (`slice4-row48-pilot-green.log`).
- Row 49, the legacy pin unchanged: `every legacy source occurrence and relevant text family is
pinned` failed on `historical policy selector or baseline` 67 → 71, `occurrences` 285 → 289 and
  `digest` `687c123b…` →
  `8d9667b7d195746954849db31d5e6e106858109737d058581c5d33b4e7097d2e`; `Expected - 3` /
  `Received + 3`; 0 pass, 1 fail (`slice4-row49-legacy-pin-red.log`). No other pinned literal moved.
- Row 50, after 10.23: the same test 1 pass (`slice4-row50-legacy-pin-green.log`); 10.24's Proof
  comment was added after it.
- After 10.25: the typecheck, `twilight-burokrat:lint:source` and `tool-devsync:lint` exited 0
  again, and the legacy pin passed 1 alone (`slice4-final-typecheck.log`,
  `slice4-final-burokrat-lint-source.log`, `slice4-final-devsync-lint.log`,
  `slice4-final-legacy-pin.log`); OpenSpec `N = 114` passed, 0 failed
  (`openspec-validation.final.kYciN5.json`).
- Not run by the executor: the whole `repo-namespacing-handoff.test.ts` and `tool-devsync:test`
  (they write Git objects), `check-indexes committed`, the other `apps/wiki/cli` policy suites and
  the host gate; all are the planner's.

### Label agreement, Slice 1 — 2026-09-24

- `base` = `b9fae32ac7bc70312316576716c0297d16113a64`; clean tree, the check absent, packet H
  landed, one `module.backend.solver-supervisor` row, 15 core and 3 be-01 module directories.
- Baselines before any edit: `tool-devsync:lint` and `tool-devsync:typecheck` exited 0
  (`slice1-lint-baseline.log`, `slice1-typecheck-baseline.log`); `service-kinds.test.ts`
  `S = 17` pass, 0 fail (`slice1-service-kinds-baseline.log`); the legacy pin 1 pass
  (`slice1-legacy-pin-baseline.log`); OpenSpec `N = 114` passed, 0 failed
  (`openspec-validation.YJz04w.json`).
- Row 1, Capacity's contract label renamed `application.capacities` on the unchanged tree:
  Capacity's own module tests 5 pass, 0 fail, `exit=0` (`gap.log`) — nothing existing sees the
  drift.
- Row 2, `tools/tool-devsync/src/module-labels.test.ts` written from the listing: 5 pass, 0 fail,
  8 `expect()` calls (`row2-green.log`).
- Rows 3 to 26, one fault each, each restored and proved with `cmp`; every log ends `exit=1`, no
  `STOP:` line:
  - Row 3 (`label.log`): `seals every module under the label its location implies` failed on
    `private binding "application.capacities/capacityOptions" is not under application.capacity`;
    4 pass, 1 fail.
  - Row 4 (`slash.log`): the same test, `private binding
"application.capacity/nested/capacityOptions" is not under application.capacity`; 4 pass, 1 fail.
  - Row 5 (`dropped.log`): the same test, `private binding "capacityOptions" is not under
application.capacity`; 4 pass, 1 fail.
  - Row 6 (`decoy.log`): the same test, `…/module/capacity/module.ts exports 2 values, expected 1`;
    4 pass, 1 fail.
  - Row 7 (`private.log`): the same test, eighteen `: seals no private binding` lines, one per
    module; 4 pass, 1 fail.
  - Row 8 (`index.log`): `indexes every module under the identifier its location implies`,
    `…/module/capacity: README names module.application.capacities`; 4 pass, 1 fail.
  - Row 9 (`twice.log`) and row 10 (`fence.log`): the same test, `…/capacity/README.md holds 2 HTML
comments, expected 1`; 4 pass, 1 fail each.
  - Row 11 (`spaced.log`): the same test, `…/capacity/README.md's one HTML comment is not a
module-index line`; 4 pass, 1 fail.
  - Row 12 (`fenced-only.log`): the same test, `…/plan-document/README.md's module-index line
follows a code fence`; 4 pass, 1 fail.
  - Row 13 (`row.log`): `registers every module in the pilot under that identifier, or is known
not to`, exactly `…/module/capacity: modules.json does not index it once as
module.application.capacity` and `modules.json: module.application.capacities indexes
…/module/capacity`; 4 pass, 1 fail.
  - Row 14 (`foreign.log`): the same test, exactly `modules.json: module.adapter.store-memory
indexes …/module/plan-document`; 4 pass, 1 fail.
  - Row 15 (`boundary.log`) and row 16 (`selector.log`): the same test, exactly `…/module/capacity:
policy.json does not select it once as boundary.application.capacity`; 4 pass, 1 fail each.
  - Row 17 (`unregistered.log`): the same test's `UNREGISTERED` assertion, received gaining
    `"module.application.capacity"` (`Received + 1`); 4 pass, 1 fail.
  - Row 18 (`absent.log`): `names in kinds.json only the module that owns every export of the
shim`, exactly `…/service/capacity.service.ts: names no sealed module capacities`; 4 pass, 1 fail.
  - Row 19 (`owner.log`): the same test, exactly `…/service/capacity.service.ts: re-exports what
…/module/step does not export`; 4 pass, 1 fail.
  - Rows 20 to 22 (`reworded.log`, `shim-case.log`, `core-forwarding.log`): the same test, exactly
    `…/service/capacity.service.ts: re-export shim disposition matches no known form`; 4 pass,
    1 fail each.
  - Row 23 (`forwarding-missing.log`): the same test, exactly
    `apps/wbs/be-01/src/service/assumed-assignee.ts: forwards to a core service that does not exist: assumed-assignee-missing`;
    4 pass, 1 fail.
  - Row 24 (`pattern.log`): the same test's row count, `Expected: > 0`, `Received: 0`; 4 pass,
    1 fail.
  - Row 25 (`root.log`): every test, `ENOENT: no such file or directory, scandir
'…/apps/wbs/be-01/src/modules'`; 0 pass, 5 fail.
  - Row 26 (`scan.log`): every test, `libs/wbs/application/core/src/module holds no module
directory`; 0 pass, 5 fail.
- After the negatives `git status` listed only the new check, which reran 5 pass
  (`after-negatives-green.log`); after 10.2's `Proof:` comments, 5 pass, 0 fail
  (`after-proofs-green.log`).
- Row 27: `tool-devsync:lint` and `tool-devsync:typecheck` exited 0 (`slice1-lint-end.log`,
  `slice1-typecheck-end.log`); Prettier on the check exited 0 (`slice1-prettier-end.log`);
  `service-kinds.test.ts` 17 pass, 0 fail (`slice1-service-kinds-end.log`); the legacy pin 1 pass
  (`slice1-legacy-pin-end.log`).
- Not run by the executor: `tool-devsync:test` (it writes Git objects), the wiki pilot suite,
  `check-indexes committed` and the host gate; all are the planner's.

### Label agreement and the closing ledger, Slice 2 — 2026-09-24

- `base` = `a9addd4db24955e0f87d5db9ac3c4e7b4e5e3226` (slice 1's commit, which is also the last
  commit touching `tools/tool-devsync/src/module-labels.test.ts`); clean tree, the four OpenSpec
  files present, `proposal.md` 397 words, four open tasks 7.1 to 7.4.
- OpenSpec before any edit: `N = 114` passed, 0 failed (`slice2-openspec-before.json`); the check
  5 pass, 0 fail, 8 `expect()` calls (`slice2-check-before.log`).
- The packet's four diffs for `tasks.md`, `design.md`, `proposal.md` and `spec.md` each passed
  `git apply --check` and applied. Prettier's check on the four files exited 0 with no reflow
  (`slice2-prettier-four.log`).
- After: `proposal.md` 398 words (R4's cap is 400); `tasks.md` holds two open tasks among 7.1 to
  7.4 (7.1 and 7.3) and three ticked among 7.2, 7.4 and 7.6.
- OpenSpec after: 114 passed, 0 failed (`slice2-openspec-after.json`), equal to `N`; the check reran
  5 pass, 0 fail (`slice2-check-after.log`), reading none of these files.
- Not run by the executor: `tool-devsync:test` (it writes Git objects), the wiki pilot suite,
  `check-indexes committed` and the host gate; all are the planner's.
