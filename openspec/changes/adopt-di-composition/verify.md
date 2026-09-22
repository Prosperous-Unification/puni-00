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
