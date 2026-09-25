# Verification Report

**Change**: `migrate-di-bag`

Each slice of packet 140.3 appends its own entry below: the attempt, its starting hash, its
baselines, every command's status, the red and green counts, every fault observed, and what stayed
pending planner verification.

## Packet 140.3, slice 1 — intent and delta spec

Observed 2026-09-26 in attempt `140-3-di-bag-migration.1.20260925T211941Z`, starting at
`0ba59e0df5ff246358f6fc27467c14a3c557175e`.

- Starting tree: `git rev-parse HEAD` matched the reviewed base; `git status --porcelain
--untracked-files=all` was empty (`base.txt`, `status-before.txt`; status 0).
- Packet extraction: seven code patches, 169 fault patches; `bash -n` on the fault-loop helper
  passed (status 0). No fault was injected in this documentation slice.
- Strict OpenSpec baseline: 115 items passed, zero failed (`openspec-base-totals.txt`; status 0).
- `new change migrate-di-bag --schema sdd-lean` created the change; the metadata says
  `schema: sdd-lean` and `created: 2026-09-26` (status 0).
- Section 7.1 `git apply --check` and `git apply` both exited 0.
- Strict OpenSpec validation after the spec: 116 items passed, zero failed, and
  `migrate-di-bag` was valid (`openspec-s1-totals.txt`; status 0).
- Prettier write and check over the five owned paths exited 0; the check printed
  `All matched files use Prettier code style!`. The owned-path hand-over diff was empty
  (`status-after.txt`, `status-paths.txt`, `owned-sorted.txt`; status 0).
- `NX_DAEMON=false bunx nx format:check --all` exited 0 (`format-check.log`).

Pending planner verification: the whole `tool-devsync:test` target and committed index check
write Git objects; the host gate needs h2puni. The code, model, browser, lint, typecheck and build
checks belong to later slices after the package move; no code changed in this slice.

## Packet 140.3, slice 2 — codemod, pin and residual

Observed 2026-09-26 in attempt `140-3-di-bag-migration.2.20260925T212943Z`, starting at
`cc142fda225d2f48ec8c6436e82fbc1bb90f7471`.

- Starting tree: reviewed hash matched and `status-before.txt` was empty (status 0). Packet
  extraction produced seven code patches and 169 fault patches; strict OpenSpec baseline was
  116 passed, zero failed (`openspec-base-totals.txt`; status 0).
- Installed baseline: `di-bag` was 0.4.0. Focused devsync, core and backend suites passed
  25, 626 and 36 tests; frontend passed 25 files and 222 tests. Four project typechecks passed
  (`base-*.log`; all status 0).
- Registry metadata matched the four expected lines in `registry.txt`: `di-bag` latest 0.5.0,
  `di-bag-codemod` latest 0.1.0, and `di-bag` 0.5.0 declared no dependency, peer dependency or
  engine (status 0).
- The eight codemod passes matched `codemod-summary.txt`: 45/434/31, 0/0/29, 11/113/35,
  0/0/35, 18/149/22, 0/0/8, 2/11/11 and 1/2/0 (files/rewrites/manual items). All 77 touched
  paths were plain modifications; their sorted path hash was
  `900a70bbaf29c7a62721a11c29eaa082c73cc0c5d896e5ba2e0b9dcc32471590` (status 0).
- Section 7.2 applied; `bun install --frozen-lockfile` exited 0 and installed `di-bag` 0.5.0
  (`install.log`, `di-bag-after.txt`). Prettier over the 77 codemod paths and section 7.3 applied
  (status 0).
- Red checkpoint: devsync/core/backend passed 25/626/36 (`red-*.log`; status 0); frontend
  failed 14 files and 94 tests, with 42 `DI_BAG_INVALID_ARGUMENT: invalid close options` lines
  (`red-frontend.log`; status 1). Typecheck failed on seven distinct TS2345 locations, all in
  `application-runtime.ts`, its test, `project-runtime.ts` and `session-runtime.ts`
  (`red-typecheck.errors.txt`; status 1). This is the slice's observed negative before the
  production translation.
- Section 7.4 applied. The 82 owned paths equalled `owned-expected.txt`; their content hash was
  `858e7d973fdbdc3fac6823dd87184e68a7b221d7b32bd8da3e22e3f6e1460244`
  (`tree-hash.txt`; status 0).
- Green checkpoint: devsync/core/backend again passed 25/626/36, frontend passed 25 files and
  224 tests; four project typechecks, four project lints and the frontend module typecheck
  passed (`green-*.log`; all status 0). The Bun probe printed all eleven expected `ok` lines,
  and TypeScript 7.0.2 and 6.0.3 compiled it silently (`probe-*.log`; all status 0).
- The build command succeeded for three projects and four dependent tasks (`green-build.log`;
  status 0). Strict OpenSpec validation stayed at 116 passed, zero failed
  (`openspec-s2-totals.txt`; status 0); `nx format:check --all` exited 0 (`format-check.log`).

Pending planner verification: the whole `tool-devsync:test` target and committed index check
write Git objects; the complete frontend targets include tests that cannot spawn Bun inside this
sandbox. The host gate cannot run on this machine. Slice 3 owns fault injection for the two new
budget tests and the browser entry point; slice 4 owns the recorded example faults; slice 5 owns
the model sabotages.

## Packet 140.3, slice 3 — budget, browser and pin negatives

Observed 2026-09-26 in attempt `140-3-di-bag-migration.3.20260925T214115Z`, starting at
`6ef4a8688bb1d33cec34321679ac61a5774153e6`.

- Starting tree: reviewed hash matched and `status-before.txt` was empty (status 0). Packet
  extraction produced seven code patches and 169 fault patches; strict OpenSpec baseline was
  116 passed, zero failed (`base.txt`, `openspec-base-totals.txt`; status 0). Installed `di-bag`
  was 0.5.0, so no reinstall was needed.
- Focused baseline: devsync/core/backend passed 25/626/36 tests; frontend passed 25 files and
  224 tests (`base-*.log`; all status 0).
- `t1` changed the runtime close budget to `timeoutMs + 1`: the named test failed with
  `expected 26 to be 25`; `t1c` weakened that assertion and passed 16 tests. `t2` changed the
  half-finished read's release budget: the named test failed with `expected 31 to be 30`;
  `t2c` passed 16 tests. `t3` bypassed DI Bag with numeric rejections: both budget tests failed
  with `Unknown Error: 25` and `Unknown Error: 30`; `t3c`, with the error-type check disabled,
  passed both selected tests. Every restored run was green and each restored file compared
  byte-for-byte with its saved version (`t*.diff`, `t*.log`, `t*-restored.log`; fault statuses 1,
  twins and restorations 0).
- `b1` imported `node:util/types` into the browser probe: the named test failed with
  `expected [ 'node:util/types' ] to deeply equal []`; `b1c` weakened only that assertion and
  passed all three tests. `p1` pinned the manifest to 0.4.0: the named test failed on
  `expect(received).toEqual(expected)`; `p1c` weakened only that assertion and passed all 20
  tests. Both restorations compared byte-for-byte and passed (`b1*.diff`, `b1*.log`,
  `p1*.diff`, `p1*.log`, corresponding `*-restored.log`; fault statuses 1, twins and
  restorations 0). `fault-loop.txt` lists all ten records.
- Section 7.5 applied and task 3.1 was ticked (status 0). Focused final suites stayed at
  devsync/core/backend 25/626/36 and frontend 25 files, 224 tests (`final-*.log`; all status
  0). Lint and typecheck of `wbs-fe-01` and `tool-devsync` passed (`s3-lint.log`,
  `s3-typecheck.log`; status 0). Their builds and dependencies passed (`s3-build.log`; status
  0). Prettier write and check on the six owned paths exited 0; the repository-wide format
  check exited 0 (`s3-format.log`).
- Strict OpenSpec validation after the task tick and evidence entry stayed at 116 passed,
  zero failed (`openspec-s3-totals.txt`; status 0). The final repository-wide format check
  exited 0 (`s3-format-final.log`), `git diff --check` exited 0, and the owned-path hand-over
  diff was empty (`status-after.txt`, `status-paths.txt`, `owned-sorted.txt`; status 0).

Pending planner verification: the Chromium faults `e1`, `e1c`, `e2`, `e2c` and their two
`Proof:` comments, the whole `tool-devsync:test` target, the committed index check, complete
frontend targets, and the host gate. The first two checks write Git objects; the complete
frontend targets include Node-spawned Bun tests the sandbox refuses; Chromium and the host gate
run outside this attempt.

## Packet 140.3, slice 4 — recorded library faults and documentation

Observed 2026-09-25 UTC in attempt `140-3-di-bag-migration.4.20260925T215458Z`, starting at
`1f3abc82587aad6315374eb0e1c108b91e5af3df`.

- Starting tree: the reviewed base matched and `status-before.txt` was empty (status 0).
  Packet extraction produced seven code patches and 169 fault patches; `bash -n` passed.
  Installed `di-bag` was 0.5.0. Strict OpenSpec baseline was 116 passed, zero failed
  (`base.txt`, `openspec-base-totals.txt`; status 0).
- Focused baselines passed: devsync 25, core 626, backend 36, frontend 25 files and 224 tests
  (`s4-base-*.log`; all status 0).
- The 75 offline records in `fault-loop.txt` all failed their named test (73 test runs exited 1;
  `ts1` and `ts2` typechecks exited 2). Each fault patch is saved as `<id>.diff`; its failing
  output is `<id>.log`. After each restore, `cmp` found identical bytes and the whole named file
  or compiler check passed (`<id>-restored.log`, status 0). The observed diagnostics follow.

| Fault     | Observed diagnostic                                                                                                                                                  | Other failing tests |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------: |
| w-auth    | Received function did not throw                                                                                                                                      |                   1 |
| l-auth    | Expected to contain: "application.authentication/authOptions"                                                                                                        |                   1 |
| g-auth    | + "libs/wbs/application/core/src/module/authentication: private binding "authOptions" is not under application.authentication",                                      |                   0 |
| w-brs     | Received function did not throw                                                                                                                                      |                   2 |
| l-brs     | Expected to contain: "application.bounded-replay-sweep/retentionOptions"                                                                                             |                   1 |
| g-brs     | + "libs/wbs/application/core/src/module/bounded-replay-sweep: private binding "retentionOptions" is not under application.bounded-replay-sweep",                     |                   0 |
| w-cal     | Received function did not throw                                                                                                                                      |                   2 |
| l-cal     | Expected to contain: "application.calendar-marker/calendarMarkerOptions"                                                                                             |                   1 |
| g-cal     | + "libs/wbs/application/core/src/module/calendar-marker: private binding "calendarMarkerOptions" is not under application.calendar-marker",                          |                   0 |
| w-cap     | Received function did not throw                                                                                                                                      |                   2 |
| l-cap     | Expected to contain: "application.capacity/capacityOptions"                                                                                                          |                   1 |
| g-cap     | + "libs/wbs/application/core/src/module/capacity: private binding "capacityOptions" is not under application.capacity",                                              |                   0 |
| w-dir     | Received function did not throw                                                                                                                                      |                   2 |
| l-dir     | Expected to contain: "application.directory/directoryOptions"                                                                                                        |                   1 |
| g-dir     | + "libs/wbs/application/core/src/module/directory: private binding "directoryOptions" is not under application.directory",                                           |                   0 |
| w-pcm     | Received function did not throw                                                                                                                                      |                   2 |
| l-pcm     | Expected to contain: "application.plan-commands/planCommandOptions"                                                                                                  |                   1 |
| g-pcm     | + "libs/wbs/application/core/src/module/plan-commands: private binding "planCommandOptions" is not under application.plan-commands",                                 |                   0 |
| w-pdoc    | Received function did not throw                                                                                                                                      |                   2 |
| l-pdoc    | Expected to contain: "application.plan-document/planDocumentOptions"                                                                                                 |                   1 |
| g-pdoc    | + "libs/wbs/application/core/src/module/plan-document: private binding "planDocumentOptions" is not under application.plan-document",                                |                   0 |
| w-phist   | Received function did not throw                                                                                                                                      |                   2 |
| l-phist   | Expected to contain: "application.plan-history/historySettings"                                                                                                      |                   1 |
| g-phist   | + "libs/wbs/application/core/src/module/plan-history: private binding "historySettings" is not under application.plan-history",                                      |                   0 |
| w-pimp    | Received function did not throw                                                                                                                                      |                   2 |
| l-pimp    | Expected to contain: "application.plan-import/importOptions"                                                                                                         |                   1 |
| g-pimp    | + "libs/wbs/application/core/src/module/plan-import: private binding "importOptions" is not under application.plan-import",                                          |                   0 |
| w-pband   | Received function did not throw                                                                                                                                      |                   2 |
| l-pband   | Expected to contain: "application.priority-band/priorityBandOptions"                                                                                                 |                   1 |
| g-pband   | + "libs/wbs/application/core/src/module/priority-band: private binding "priorityBandOptions" is not under application.priority-band",                                |                   0 |
| w-proj    | Received function did not throw                                                                                                                                      |                   2 |
| l-proj    | Expected to contain: "application.project/projectOptions"                                                                                                            |                   1 |
| g-proj    | + "libs/wbs/application/core/src/module/project: private binding "projectOptions" is not under application.project",                                                 |                   0 |
| w-rt      | Received function did not throw                                                                                                                                      |                   2 |
| l-rt      | Expected to contain: "application.realtime/broadcasterOptions"                                                                                                       |                   1 |
| g-rt      | + "libs/wbs/application/core/src/module/realtime: private binding "broadcasterOptions" is not under application.realtime",                                           |                   0 |
| w-saved   | Received function did not throw                                                                                                                                      |                   2 |
| l-saved   | Expected to contain: "application.saved-plans/savedPlanOptions"                                                                                                      |                   1 |
| g-saved   | + "libs/wbs/application/core/src/module/saved-plans: private binding "savedPlanOptions" is not under application.saved-plans",                                       |                   0 |
| w-step    | Received function did not throw                                                                                                                                      |                   2 |
| l-step    | Expected to contain: "application.step/stepOptions"                                                                                                                  |                   1 |
| g-step    | + "libs/wbs/application/core/src/module/step: private binding "stepOptions" is not under application.step",                                                          |                   0 |
| w-witem   | Received function did not throw                                                                                                                                      |                   2 |
| l-witem   | Expected to contain: "application.work-item/workItemOptions"                                                                                                         |                   1 |
| g-witem   | + "libs/wbs/application/core/src/module/work-item: private binding "workItemOptions" is not under application.work-item",                                            |                   0 |
| w-opt     | Received function did not throw                                                                                                                                      |                   2 |
| l-opt     | Expected to contain: "backend.optimization/optimizationOptions"                                                                                                      |                   1 |
| g-opt     | + "apps/wbs/be-01/src/module/optimization: private binding "optimizationOptions" is not under backend.optimization",                                                 |                   0 |
| w-slaunch | Received function did not throw                                                                                                                                      |                   2 |
| l-slaunch | Expected to contain: "backend.solver-launcher/launcherSeams"                                                                                                         |                   1 |
| g-slaunch | + "apps/wbs/be-01/src/module/solver-launcher: private binding "launcherSeams" is not under backend.solver-launcher",                                                 |                   0 |
| w-ssup    | Received function did not throw                                                                                                                                      |                   2 |
| l-ssup    | Expected to contain: "backend.solver-supervisor/supervisorOptions"                                                                                                   |                   1 |
| g-ssup    | + "apps/wbs/be-01/src/module/solver-supervisor: private binding "supervisorOptions" is not under backend.solver-supervisor",                                         |                   0 |
| w-dmgmt   | AssertionError: expected [Function] to throw an error                                                                                                                |                   1 |
| l-dmgmt   | AssertionError: expected [Function] to throw error including 'Cannot resolve "frontend.directory-ma…' but got 'DI_BAG_MISSING_DEPENDENCY: Cannot res…'               |                   0 |
| w-prefs   | AssertionError: expected [Function] to throw an error                                                                                                                |                   3 |
| l-prefs   | AssertionError: expected [ 'preferences', 'remembered', …(3) ] to include 'frontend.preferences/preferencesStore'                                                    |                   1 |
| pf1       | AssertionError: expected [Function] to throw an error                                                                                                                |                   0 |
| pf2       | AssertionError: expected [Function] to throw error including 'Cannot resolve "frontend.preferences/…' but got 'DI_BAG_MISSING_DEPENDENCY: Cannot res…'               |                   0 |
| ar1       | AssertionError: expected [Function] to throw an error                                                                                                                |                   4 |
| ar2       | AssertionError: expected Error: alice@example.com could not be com… to be an instance of PartialAcquisitionError                                                     |                   4 |
| ar3       | AssertionError: expected [] to deeply equal [ 'first' ]                                                                                                              |                   1 |
| ls1       | AssertionError: expected null to be an instance of Promise                                                                                                           |                   3 |
| ls2       | AssertionError: expected 'pending' to be 'settled' // Object.is equality                                                                                             |                   1 |
| ls3       | AssertionError: expected [Function] to throw error including 'DI_BAG_DISPOSAL_FAILED' but got 'the lifetime could not be built, and …'                               |                   1 |
| ml1       | error: libs/wbs/application/core/src/module/capacity/module.ts exports 2 values, expected 1                                                                          |                   0 |
| ml2       | + "libs/wbs/application/core/src/module/authentication: seals no private binding",                                                                                   |                   0 |
| ts1       | libs/wbs/application/core/src/module/authentication/module.test.ts(101,3): error TS2322: Type 'UserStore' is not assignable to type 'UserStore & OidcIdentityStore'. |                   0 |
| ts2       | libs/wbs/application/core/src/module/authentication/module.test.ts(101,3): error TS2578: Unused '@ts-expect-error' directive.                                        |                   0 |
| d9        | AssertionError: expected [ …(24) ] to deeply equal [ …(21) ]                                                                                                         |                   0 |
| j-o2      | AssertionError: promise rejected "Error: a project transition was refused b…" instead of resolving                                                                   |                   1 |
| j-o4      | AssertionError: promise rejected "Error: a project transition was refused b…" instead of resolving                                                                   |                   0 |
| i-o2      | AssertionError: promise rejected "Error: a session transition was refused b…" instead of resolving                                                                   |                   2 |
| i-o3      | AssertionError: promise rejected "Error: a session transition was refused b…" instead of resolving                                                                   |                   0 |

The `Other failing tests` count above means the same injected fault also failed related tests.
Their names, beside each fault id, are preserved in `s4-extra-failures.txt`:

- w-auth: (fail) the Authentication module > labels its private bindings with the module name [0.73ms]
- l-auth: (fail) the Authentication module > names itself when a host omits a requirement [0.58ms]
- w-brs: (fail) the Bounded replay sweep module > labels its private bindings with the module name [1.44ms] | (fail) the Bounded replay sweep module > names itself when a host omits a requirement [0.77ms]
- l-brs: (fail) the Bounded replay sweep module > names itself when a host omits a requirement [0.65ms]
- w-cal: (fail) the Calendar marker module > labels its private bindings with the module name [0.68ms] | (fail) the Calendar marker module > names itself when a host omits a requirement [0.62ms]
- l-cal: (fail) the Calendar marker module > names itself when a host omits a requirement [0.55ms]
- w-cap: (fail) the Capacity module > labels its private bindings with the module name [0.66ms] | (fail) the Capacity module > names itself when a host omits a requirement [0.64ms]
- l-cap: (fail) the Capacity module > names itself when a host omits a requirement [0.61ms]
- w-dir: (fail) the Directory module > labels its private bindings with the module name [0.63ms] | (fail) the Directory module > names itself when a host omits a requirement [0.61ms]
- l-dir: (fail) the Directory module > names itself when a host omits a requirement [0.57ms]
- w-pcm: (fail) the Plan commands module > labels its private bindings with the module name [0.65ms] | (fail) the Plan commands module > names itself when a host omits a requirement [1.17ms]
- l-pcm: (fail) the Plan commands module > names itself when a host omits a requirement [1.09ms]
- w-pdoc: (fail) the Plan document module > labels its private bindings with the module name [0.67ms] | (fail) the Plan document module > names itself when a host omits a requirement [0.59ms]
- l-pdoc: (fail) the Plan document module > names itself when a host omits a requirement [0.57ms]
- w-phist: (fail) the Plan history module > labels its private bindings with the module name [0.64ms] | (fail) the Plan history module > names itself when a host omits a requirement [0.54ms]
- l-phist: (fail) the Plan history module > names itself when a host omits a requirement [0.49ms]
- w-pimp: (fail) the Plan import module > labels its private bindings with the module name [0.65ms] | (fail) the Plan import module > names itself when a host omits a requirement [0.62ms]
- l-pimp: (fail) the Plan import module > names itself when a host omits a requirement [0.59ms]
- w-pband: (fail) the Priority band module > labels its private bindings with the module name [0.71ms] | (fail) the Priority band module > names itself when a host omits a requirement [0.65ms]
- l-pband: (fail) the Priority band module > names itself when a host omits a requirement [0.63ms]
- w-proj: (fail) the Project module > labels its private bindings with the module name [0.69ms] | (fail) the Project module > names itself when a host omits a requirement [0.59ms]
- l-proj: (fail) the Project module > names itself when a host omits a requirement [0.58ms]
- w-rt: (fail) the Realtime module > labels its private bindings with the module name [0.75ms] | (fail) the Realtime module > names itself when a host omits a requirement [0.66ms]
- l-rt: (fail) the Realtime module > names itself when a host omits a requirement [0.77ms]
- w-saved: (fail) the Saved plans module > labels its private bindings with the module name [0.69ms] | (fail) the Saved plans module > names itself when a host omits a requirement [0.64ms]
- l-saved: (fail) the Saved plans module > names itself when a host omits a requirement [0.63ms]
- w-step: (fail) the Step module > labels its private bindings with the module name [0.90ms] | (fail) the Step module > names itself when a host omits a requirement [0.83ms]
- l-step: (fail) the Step module > names itself when a host omits a requirement [0.58ms]
- w-witem: (fail) the Work item module > labels its private bindings with the module name [0.87ms] | (fail) the Work item module > names itself when a host omits a requirement [0.77ms]
- l-witem: (fail) the Work item module > names itself when a host omits a requirement [0.91ms]
- w-opt: (fail) the Optimization module > labels its private bindings with the module name [0.84ms] | (fail) the Optimization module > names itself when a host omits a requirement [0.71ms]
- l-opt: (fail) the Optimization module > names itself when a host omits a requirement [0.74ms]
- w-slaunch: (fail) the Solver launcher module > labels its private bindings with the module name [0.64ms] | (fail) the Solver launcher module > names itself when a host omits a requirement [0.53ms]
- l-slaunch: (fail) the Solver launcher module > names itself when a host omits a requirement [0.51ms]
- w-ssup: (fail) the Solver supervisor module > labels its private bindings with the module name [0.82ms] | (fail) the Solver supervisor module > names itself when a host omits a requirement [0.70ms]
- l-ssup: (fail) the Solver supervisor module > names itself when a host omits a requirement [0.57ms]
- w-dmgmt: FAIL src/modules/directory-management/module.test.ts > the directory-management module > names itself when a host omits the client
- w-prefs: FAIL src/modules/preferences/module.test.ts > the preferences module > labels its owned store with the module name | FAIL src/modules/preferences/module.test.ts > the preferences module > names itself when a host omits the browser store | FAIL src/modules/preferences/module.test.ts > the preferences module > says nothing about itself when a host names a service that is not registered
- l-prefs: FAIL src/modules/preferences/module.test.ts > the preferences module > names itself when a host omits the browser store
- ar1: FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > hands DI Bag the budget of a runtime’s own close | FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > revokes the store it owns when the slot retires it | FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > once isLive is wired to a real slot > lets a stale reference from a REPLACED runtime reach REVOKED, once a newer runtime is live | FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > once isLive is wired to a real slot > flips a retired reference from WITHDRAWN to REVOKED once a LATER replace makes the slot live again
- ar2: FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > hands DI Bag the budget of a half-finished read’s release | FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > carries the original failure as the cause of a refused installation | FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > refuses the installation when this browser has no store to open | FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > leaves the slot fatal but buildable when the installation is refused
- ar3: FAIL src/runtime/application-runtime.test.ts > the page’s runtime, installed transactionally > hands DI Bag the budget of a half-finished read’s release
- ls1: FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > observes a late disposal that finishes after the wait expired, without publishing anything | FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > observes a late disposal that fails after the wait expired | FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > is terminal when a half-finished construction outruns its release budget
- ls2: FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > is terminal when a half-finished construction outruns its release budget
- ls3: FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > is terminal when a half-finished construction outruns its release budget
- j-o2: FAIL src/runtime/project-runtime.test.ts > the project runtime > is terminal, and still settles, when a half-built runtime cannot be released
- i-o2: FAIL src/runtime/session-runtime.test.ts > the session runtime > settles a half-built session that cannot be released, and leaves the owner terminally fatal | FAIL src/runtime/session-runtime.test.ts > log out > settles fatal at the budget when the project’s socket never closes, and stays fatal once it does

- Section 7.6 passed `git apply --check` and applied (status 0); task 3.2 is ticked. Strict
  OpenSpec validation afterward stayed at 116 passed, zero failed (`openspec-s4-totals.txt`,
  status 0).
- Typecheck passed for four projects and one dependent task; lint passed for four projects;
  build passed for three projects and four dependent tasks (`s4-typecheck.log`, `s4-lint.log`,
  `s4-build.log`; all status 0).
- Prettier write and check over the five owned paths exited 0, with the check reporting all
  matched files in style (`s4-prettier-write.log`, `s4-prettier-check.log`). The repository-wide
  format check exited 0 (`s4-format-check.log`).

Pending planner verification: boot baseline and `bs1`–`bs6` need port binding outside this
sandbox; the whole `tool-devsync:test` target and committed index check write Git objects; the
complete frontend targets include tests that cannot spawn Bun here. The host gate cannot run on
this machine. Slice 5 owns the pinned model runs and model sabotages.

## Packet 140.3, slice 5 — model seeds and sabotages

Attempt: `140-3-di-bag-migration.5.20260925T221009Z`; observed 2026-09-25 UTC; base=8a8e0118231ff51d0eaedd5fdf14db001610da40.
The starting tree was clean (`status-before.txt` empty), and the installed di-bag package reported
`0.5.0`. Step 0 extracted seven section 7 diffs, 169 section 8 mutation patches and 74 slice 5
records; every named test was found in its file. The strict OpenSpec baseline reported 116 items,
116 passed and 0 failed (`openspec-base-totals.txt`, status 0).

The eleven model files at their pinned seeds passed: 11 files and 12 tests (`models.log`, status
0). Their exact file, seed and run-limit lines are in `model-seeds.txt`:

```text
src/components/wbs/remembered-layout.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/lib/theme.model.test.tsx seed=seed: 20260925  runs=numRuns: 300
src/modules/channel.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/modules/plan-feed/delivered-plan-store.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/modules/plan-feed/presence-store.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/modules/plan-writer/busy-store.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/runtime/application-bootstrap.model.test.tsx seed=seed: 20260924  runs=numRuns: 300
src/runtime/lifetime-slot.model.test.ts seed=seed: 20260923  runs=numRuns: 300
src/runtime/project-runtime.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/runtime/session-exit.model.test.ts seed=seed: 20260924  runs=numRuns: 300
src/runtime/session-runtime.model.test.ts seed=seed: 20260924  runs=numRuns: 300
```

Every record below failed its named test with the mutation applied (status 1), then its whole test
file passed after restoring and byte-comparing every touched file (status 0). Each record has the
applied patch, failing output, patch-check output, and restored output under its id in the evidence
directory. `fault-loop.txt` records all 74 outcomes (status 0). The fast-check run and shrink values
are the observed values from `model-runs.txt`; `example` denotes a deterministic example test.
The diagnostic is the first cause or assertion reported in the failing output.

- **a-A1:** Property failed after 3 tests; Shrunk 3 time. Observed: Caused by: AssertionError: r4: 1 acquisitions, 0 close attempts, live=null: expected +0 to be 1 // Object.is equality (evidence: `a-A1.diff`, `a-A1.log`, `a-A1-restored.log`).
- **a-A2:** Property failed after 1 tests; Shrunk 5 time. Observed: Caused by: AssertionError: the latest request did not win: expected 'refused' not to be 'refused' // Object.is equality (evidence: `a-A2.diff`, `a-A2.log`, `a-A2-restored.log`).
- **a-A3:** Property failed after 4 tests; Shrunk 3 time. Observed: Caused by: AssertionError: r1: 1 acquisitions, 0 close attempts, live=null: expected +0 to be 1 // Object.is equality (evidence: `a-A3.diff`, `a-A3.log`, `a-A3-restored.log`).
- **a-A4:** Property failed after 9 tests; Shrunk 4 time. Observed: Caused by: AssertionError: r2: 1 acquisitions, 0 close attempts, live=r3: expected +0 to be 1 // Object.is equality (evidence: `a-A4.diff`, `a-A4.log`, `a-A4-restored.log`).
- **a-A5:** example; -. Observed: AssertionError: expected 1 to be +0 // Object.is equality (evidence: `a-A5.diff`, `a-A5.log`, `a-A5-restored.log`).
- **a-A6:** example; -. Observed: AssertionError: third accounting: expected +0 to be 1 // Object.is equality (evidence: `a-A6.diff`, `a-A6.log`, `a-A6-restored.log`).
- **b-ens:** Property failed after 27 tests; Shrunk 2 time. Observed: Caused by: AssertionError: r2 is not live (live=null) but its read did not throw: expected false to be true // Object.is equality (evidence: `b-ens.diff`, `b-ens.log`, `b-ens-restored.log`).
- **e-5:** Property failed after 5 tests; Shrunk 4 time. Observed: Caused by: AssertionError: the app was drawn while the slot was retiring: expected 'retiring' to be 'live' // Object.is equality (evidence: `e-5.diff`, `e-5.log`, `e-5-restored.log`).
- **e-13:** Property failed after 175 tests; Shrunk 0 time. Observed: Caused by: AssertionError: a runtime live before a pagehide trigger was still the one live at the end: expected [ { preferences: { …(3) }, …(1) } ] to not include { preferences: { …(3) }, …(1) } (evidence: `e-13.diff`, `e-13.log`, `e-13-restored.log`).
- **e-14:** Property failed after 3 tests; Shrunk 6 time. Observed: Caused by: AssertionError: the app was drawn while the slot was empty: expected 'empty' to be 'live' // Object.is equality (evidence: `e-14.diff`, `e-14.log`, `e-14-restored.log`).
- **e-15:** Property failed after 87 tests; Shrunk 4 time. Observed: Caused by: AssertionError: the app was drawn while the slot was fatal: expected 'fatal' to be 'live' // Object.is equality (evidence: `e-15.diff`, `e-15.log`, `e-15-restored.log`).
- **f1-a:** Property failed after 14 tests; Shrunk 5 time. Observed: Caused by: AssertionError: stored bytes in A: expected undefined to be '"system"' // Object.is equality (evidence: `f1-a.diff`, `f1-a.log`, `f1-a-restored.log`).
- **f1-b:** Property failed after 14 tests; Shrunk 3 time. Observed: Caused by: AssertionError: persists: expected false to be true // Object.is equality (evidence: `f1-b.diff`, `f1-b.log`, `f1-b-restored.log`).
- **f1-c:** Property failed after 42 tests; Shrunk 1 time. Observed: Caused by: AssertionError: an ordinary storage failure did not propagate out of the chooser: expected null to be Error: write denied // Object.is equality (evidence: `f1-c.diff`, `f1-c.log`, `f1-c-restored.log`).
- **f1-d:** Property failed after 1 tests; Shrunk 2 time. Observed: Caused by: PreferenceStoreLifecycleError: the page withdrew this preference store before the access completed (evidence: `f1-d.diff`, `f1-d.log`, `f1-d-restored.log`).
- **f1-e:** Property failed after 1 tests; Shrunk 4 time. Observed: Caused by: AssertionError: persists: expected true to be false // Object.is equality (evidence: `f1-e.diff`, `f1-e.log`, `f1-e-restored.log`).
- **f1-f:** Property failed after 9 tests; Shrunk 1 time. Observed: Caused by: Error: the property failed and its teardown refused: Error: retire refused during teardown with: Error: unexpected cleanup corruption | Error: teardown retire refused during teardown with: Error: unexpected cleanup corruption (evidence: `f1-f.diff`, `f1-f.log`, `f1-f-restored.log`).
- **f1-g:** Property failed after 1 tests; Shrunk 1 time. Observed: Caused by: Error: teardown refused: Error: teardown retire refused during teardown with: Error: unrelated teardown failure (evidence: `f1-g.diff`, `f1-g.log`, `f1-g-restored.log`).
- **f2-ha:** Property failed after 8 tests; Shrunk 4 time. Observed: Caused by: AssertionError: write(outline): what the handle answered: expected false to deeply equal true (evidence: `f2-ha.diff`, `f2-ha.log`, `f2-ha-restored.log`).
- **f2-hb:** Property failed after 13 tests; Shrunk 2 time. Observed: Caused by: AssertionError: read: what the handle answered: expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to deeply equal { value: null, persists: false } (evidence: `f2-hb.diff`, `f2-hb.log`, `f2-hb-restored.log`).
- **f2-hc:** Property failed after 2 tests; Shrunk 1 time. Observed: Caused by: AssertionError: read: what the handle answered: expected { value: null, persists: true } to deeply equal { value: null, persists: false } (evidence: `f2-hc.diff`, `f2-hc.log`, `f2-hc-restored.log`).
- **f2-hd:** Property failed after 106 tests; Shrunk 2 time. Observed: Caused by: AssertionError: stored bytes in B: expected '7' to be undefined // Object.is equality (evidence: `f2-hd.diff`, `f2-hd.log`, `f2-hd-restored.log`).
- **f2-he:** Property failed after 18 tests; Shrunk 1 time. Observed: Caused by: AssertionError: write(outline): an ordinary storage failure did not propagate unchanged: expected false to be Error: write denied // Object.is equality (evidence: `f2-he.diff`, `f2-he.log`, `f2-he-restored.log`).
- **f2-hh:** Property failed after 2 tests; Shrunk 2 time. Observed: Caused by: AssertionError: write(outline) while acquiring: what the handle answered: expected true to deeply equal false (evidence: `f2-hh.diff`, `f2-hh.log`, `f2-hh-restored.log`).
- **f2-hf:** Property failed after 2 tests; Shrunk 3 time. Observed: Caused by: Error: the property failed and its teardown refused: Error: replace(A) refused during teardown with: Error: unexpected cleanup corruption | Error: teardown retire refused during teardown with: Error: unexpected cleanup corruption (evidence: `f2-hf.diff`, `f2-hf.log`, `f2-hf-restored.log`).
- **f2-hg:** Property failed after 1 tests; Shrunk 0 time. Observed: Caused by: Error: teardown refused: Error: teardown retire refused during teardown with: Error: unrelated teardown failure (evidence: `f2-hg.diff`, `f2-hg.log`, `f2-hg-restored.log`).
- **g-c1:** Property failed after 5 tests; Shrunk 5 time. Observed: Caused by: Error: teardown refused: AssertionError: who heard 1, in what order: expected [ { listener: +0, event: 1 }, …(1) ] to deeply equal [ { listener: +0, event: 1 } ] (evidence: `g-c1.diff`, `g-c1.log`, `g-c1-restored.log`).
- **g-c2:** Property failed after 16 tests; Shrunk 4 time. Observed: Caused by: AssertionError: publish(1) threw with no failing listener: expected AssertionError: listener 1 heard 1 after … { …(4) } to be null (evidence: `g-c2.diff`, `g-c2.log`, `g-c2-restored.log`).
- **g-c3:** Property failed after 17 tests; Shrunk 1 time. Observed: Caused by: AssertionError: listener 0 was entered re-entrantly: expected 2 to be 1 // Object.is equality (evidence: `g-c3.diff`, `g-c3.log`, `g-c3-restored.log`).
- **g-c4:** Property failed after 5 tests; Shrunk 5 time. Observed: Caused by: Error: teardown refused: AssertionError: publish(1) did not rethrow the one failure by identity: expected null to be Error: listener 0 refused 1 // Object.is equality (evidence: `g-c4.diff`, `g-c4.log`, `g-c4-restored.log`).
- **g-c5:** Property failed after 5 tests; Shrunk 4 time. Observed: Caused by: Error: teardown refused: AssertionError: who heard 1, in what order: expected [ { listener: +0, event: 1 } ] to deeply equal [ { listener: +0, event: 1 }, …(1) ] (evidence: `g-c5.diff`, `g-c5.log`, `g-c5-restored.log`).
- **g-c6:** Property failed after 5 tests; Shrunk 5 time. Observed: Caused by: Error: teardown refused: AssertionError: publish(1) did not aggregate its failures: expected Error: listener 0 refused 1 to be an instance of AggregateError (evidence: `g-c6.diff`, `g-c6.log`, `g-c6-restored.log`).
- **g-b1:** Property failed after 1 tests; Shrunk 0 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: changes heard by the listener that never leaves: expected 1 to be +0 // Object.is equality (evidence: `g-b1.diff`, `g-b1.log`, `g-b1-restored.log`).
- **g-b2:** Property failed after 1 tests; Shrunk 1 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: the last value the sentinel read: expected false to be true // Object.is equality (evidence: `g-b2.diff`, `g-b2.log`, `g-b2-restored.log`).
- **g-b3:** Property failed after 1 tests; Shrunk 2 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: busy: expected true to be false // Object.is equality (evidence: `g-b3.diff`, `g-b3.log`, `g-b3-restored.log`).
- **g-b4:** Property failed after 2 tests; Shrunk 1 time. Observed: Caused by: AssertionError: raise: busy: expected false to be true // Object.is equality (evidence: `g-b4.diff`, `g-b4.log`, `g-b4-restored.log`).
- **g-d1:** Property failed after 1 tests; Shrunk 0 time. Observed: Caused by: AssertionError: redeliver: a new snapshot exactly when something changed: expected true to be false // Object.is equality (evidence: `g-d1.diff`, `g-d1.log`, `g-d1-restored.log`).
- **g-d2:** Property failed after 1 tests; Shrunk 13 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: tree: expected null to be { value: { …(19) }, generation: 1 } // Object.is equality (evidence: `g-d2.diff`, `g-d2.log`, `g-d2-restored.log`).
- **g-d3:** Property failed after 1 tests; Shrunk 14 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: markers: expected [] to be [] // Object.is equality (evidence: `g-d3.diff`, `g-d3.log`, `g-d3-restored.log`).
- **g-d4:** Property failed after 5 tests; Shrunk 10 time. Observed: Caused by: AssertionError: redeliver: a new snapshot exactly when something changed: expected true to be false // Object.is equality (evidence: `g-d4.diff`, `g-d4.log`, `g-d4-restored.log`).
- **g-d5:** Property failed after 1 tests; Shrunk 6 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: steps are not the store’s own: expected true to be false // Object.is equality (evidence: `g-d5.diff`, `g-d5.log`, `g-d5-restored.log`).
- **g-r1:** Property failed after 1 tests; Shrunk 3 time. Observed: Caused by: AssertionError: users(["lee"]): a new snapshot exactly when something changed: expected true to be false // Object.is equality (evidence: `g-r1.diff`, `g-r1.log`, `g-r1-restored.log`).
- **g-r2:** Property failed after 1 tests; Shrunk 2 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: users: expected [] to be [] // Object.is equality (evidence: `g-r2.diff`, `g-r2.log`, `g-r2-restored.log`).
- **g-r3:** Property failed after 1 tests; Shrunk 2 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: users: expected [] to be [] // Object.is equality (evidence: `g-r3.diff`, `g-r3.log`, `g-r3-restored.log`).
- **g-r4:** Property failed after 1 tests; Shrunk 1 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: users: expected [] to be [] // Object.is equality (evidence: `g-r4.diff`, `g-r4.log`, `g-r4-restored.log`).
- **i-m1:** Property failed after 3 tests; Shrunk 2 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: the published session is not the user last asked for: expected 'u2' to be 'u1' // Object.is equality (evidence: `i-m1.diff`, `i-m1.log`, `i-m1-restored.log`).
- **i-m2:** Property failed after 10 tests; Shrunk 6 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: the last user asked for is not the one live: expected 'fatal' to be 'u1' // Object.is equality (evidence: `i-m2.diff`, `i-m2.log`, `i-m2-restored.log`).
- **i-m3:** Property failed after 2 tests; Shrunk 6 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: s1's directory changed after it was withdrawn: expected false to be true // Object.is equality (evidence: `i-m3.diff`, `i-m3.log`, `i-m3-restored.log`).
- **i-m4:** Property failed after 2 tests; Shrunk 6 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: s1's directory changed after it was withdrawn: expected false to be true // Object.is equality (evidence: `i-m4.diff`, `i-m4.log`, `i-m4-restored.log`).
- **i-m5:** Property failed after 1 tests; Shrunk 5 time. Observed: Caused by: AssertionError: gesture: withdrawn s1 sent a request: expected 1 to be +0 // Object.is equality (evidence: `i-m5.diff`, `i-m5.log`, `i-m5-restored.log`).
- **i-m6:** Property failed after 1 tests; Shrunk 5 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: signOut settled before s1's retirement had run: expected false to be true // Object.is equality (evidence: `i-m6.diff`, `i-m6.log`, `i-m6-restored.log`).
- **i-m7:** Property failed after 14 tests; Shrunk 7 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live' // Object.is equality (evidence: `i-m7.diff`, `i-m7.log`, `i-m7-restored.log`).
- **i-m8:** Property failed after 14 tests; Shrunk 5 time. Observed: Caused by: AssertionError: signInBroken(u2): a project is still current after its session was withdrawn: expected [ 's1.p1' ] to deeply equal [] (evidence: `i-m8.diff`, `i-m8.log`, `i-m8-restored.log`).
- **i-m9:** Property failed after 3 tests; Shrunk 11 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live' // Object.is equality (evidence: `i-m9.diff`, `i-m9.log`, `i-m9-restored.log`).
- **i-m10:** Property failed after 2 tests; Shrunk 6 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: more than one session says it is current: expected [ 's1', 's2' ] to have a length of 1 but got 2 (evidence: `i-m10.diff`, `i-m10.log`, `i-m10-restored.log`).
- **i-m11:** Property failed after 14 tests; Shrunk 7 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live' // Object.is equality (evidence: `i-m11.diff`, `i-m11.log`, `i-m11-restored.log`).
- **i-m12:** Property failed after 2 tests; Shrunk 4 time. Observed: Caused by: Error: teardown refused: Error: a session transition was refused by the slot itself (evidence: `i-m12.diff`, `i-m12.log`, `i-m12-restored.log`).
- **j-m1:** Property failed after 2 tests; Shrunk 2 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: more than one runtime says it is current: expected [ 'r1', 'r2' ] to have a length of 1 but got 2 (evidence: `j-m1.diff`, `j-m1.log`, `j-m1-restored.log`).
- **j-m2:** Property failed after 2 tests; Shrunk 7 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: r1's delivered plan changed after it was withdrawn: expected false to be true // Object.is equality (evidence: `j-m2.diff`, `j-m2.log`, `j-m2-restored.log`).
- **j-m3:** Property failed after 6 tests; Shrunk 5 time. Observed: Caused by: AssertionError: reread: withdrawn r2 sent a request: expected 1 to be +0 // Object.is equality (evidence: `j-m3.diff`, `j-m3.log`, `j-m3-restored.log`).
- **j-m4:** Property failed after 2 tests; Shrunk 5 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: r1's feed closed 2 times, live=false: expected 2 to be 1 // Object.is equality (evidence: `j-m4.diff`, `j-m4.log`, `j-m4-restored.log`).
- **j-m5:** Property failed after 2 tests; Shrunk 5 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: r1's feed closed 0 times, live=false: expected +0 to be 1 // Object.is equality (evidence: `j-m5.diff`, `j-m5.log`, `j-m5-restored.log`).
- **j-m6:** Property failed after 2 tests; Shrunk 2 time. Observed: Caused by: AssertionError: mark: withdrawn r1 sent a request: expected 1 to be +0 // Object.is equality (evidence: `j-m6.diff`, `j-m6.log`, `j-m6-restored.log`).
- **j-m7:** Property failed after 3 tests; Shrunk 7 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: r2's presence changed after it was withdrawn: expected false to be true // Object.is equality (evidence: `j-m7.diff`, `j-m7.log`, `j-m7-restored.log`).
- **j-m8:** Property failed after 6 tests; Shrunk 5 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: r2's presence changed after it was withdrawn: expected false to be true // Object.is equality (evidence: `j-m8.diff`, `j-m8.log`, `j-m8-restored.log`).
- **j-m9:** Property failed after 2 tests; Shrunk 1 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: more than one runtime says it is current: expected [ 'r1', 'r2' ] to have a length of 1 but got 2 (evidence: `j-m9.diff`, `j-m9.log`, `j-m9-restored.log`).
- **j-m10:** Property failed after 3 tests; Shrunk 6 time. Observed: Caused by: Error: teardown refused: Error: a project transition was refused by the slot itself (evidence: `j-m10.diff`, `j-m10.log`, `j-m10-restored.log`).
- **k-x1:** Property failed after 18 tests; Shrunk 10 time. Observed: Caused by: AssertionError: read: withdrawn s1 sent a request: expected 5 to be +0 // Object.is equality (evidence: `k-x1.diff`, `k-x1.log`, `k-x1-restored.log`).
- **k-x2:** Property failed after 50 tests; Shrunk 6 time. Observed: Caused by: Error: the property failed and its teardown refused: Error: s1 was given back before its project s1.p1.settles (evidence: `k-x2.diff`, `k-x2.log`, `k-x2-restored.log`).
- **k-x3:** Property failed after 59 tests; Shrunk 9 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: teardown: s1.p1.settles's plan changed after its session s1 was withdrawn: expected false to be true // Object.is equality (evidence: `k-x3.diff`, `k-x3.log`, `k-x3-restored.log`).
- **k-x4:** Property failed after 75 tests; Shrunk 6 time. Observed: Caused by: Error: teardown refused: AssertionError: teardown: leave never settled: expected false to be true // Object.is equality (evidence: `k-x4.diff`, `k-x4.log`, `k-x4-restored.log`).
- **k-x5:** Property failed after 3 tests; Shrunk 7 time. Observed: Caused by: Error: teardown refused: AssertionError: logOut#1 settled signed-out before s1 was given back: expected false to be true // Object.is equality (evidence: `k-x5.diff`, `k-x5.log`, `k-x5-restored.log`).
- **k-x6:** Property failed after 58 tests; Shrunk 5 time. Observed: Caused by: Error: the property failed and its teardown refused: AssertionError: logOut#1 settled signed-out before s1 was given back: expected false to be true // Object.is equality (evidence: `k-x6.diff`, `k-x6.log`, `k-x6-restored.log`).
- **k-x7:** Property failed after 43 tests; Shrunk 4 time. Observed: Caused by: Error: teardown refused: AssertionError: logOut#1 settled signed-out though a sign-in was asked for while it retired: expected true to be false // Object.is equality (evidence: `k-x7.diff`, `k-x7.log`, `k-x7-restored.log`).

The same mutations also failed these related tests; their names are in
`model-extra-failures.txt`:

- a-A2 | FAIL src/runtime/lifetime-slot.model.test.ts > the ownership rule, under generated interleavings > acquire, then retire a live runtime, then settled: the captured handle refuses afterward
- a-A5 | FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > leaves exactly one runtime live when two replacements arrive together
- a-A6 | FAIL src/runtime/lifetime-slot.test.ts > one lifetime’s ownership > withdraws the old runtime before its disposal starts, then publishes the replacement
- b-ens | FAIL src/runtime/lifetime-slot.model.test.ts > the ownership rule, under generated interleavings > holds every invariant it claims

Section 7.7 was applied to tick task 3.3 (patch dry-run and apply status 0). The four-project
`typecheck` and `lint` checks passed, as did the application `build` check (`s5-typecheck.log`,
`s5-lint.log`, `s5-build.log`; each status 0). Prettier write and check over the two owned paths
passed (`s5-prettier-write.log`, `s5-prettier-check.log`; status 0, all files in style). The strict
OpenSpec validation reported 116 items, 116 passed and 0 failed (`openspec-s5-totals.txt`, status
0). The repository-wide format check passed (`s5-format-check.log`, status 0). The hand-over
compared the changed-path list with the two owned paths (`status-after.txt`, status 0).

Pending planner verification: the whole `tool-devsync:test` target and committed index check need
Git writes; the complete frontend targets contain Bun child-process tests unavailable in this
sandbox. The host gate cannot run on this machine. The planner also owns final integration checks.
