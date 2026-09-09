# Verification — `core-lib-extraction`

Nothing below is a claim until it carries observed output. A row with an empty **Observed**
cell is a check that has not been watched failing and therefore is not done (R5).

## Wave 0 collision gate

Re-run 2026-09-08 against `main` @ `5bb095a5`, over the file set this change declares: every
`project.json`, `eslint.config.js`, `tsconfig.base.json`, `package.json`, and all of
`apps/be-01/src/**`.

| Source                                      | Finding                                                                                                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/dual-optimized-scheduler` | **Collides, hard.** Its remaining slices name `libs/domain`'s `SCHEDULER_CONTRACT_VERSION` and the optimizer's repository seams — files this change moves. It lands first or it rebases onto the new paths. |
| `openspec/changes/plan-json-import`         | **Collides.** An unbuilt `ImportService` under `apps/be-01/src/service/`, which is a directory this change empties. Whichever lands second writes it in `libs/core`.                                        |
| `openspec/changes/retired-schema-cleanup`   | **Coordinate.** Its §4 migrates `insertSubtree`, which moves to `libs/store-sqlite` here.                                                                                                                   |
| Open PRs                                    | (to be re-read at the moment this change starts — the gate is only true for the window it names)                                                                                                            |

## Failure-proof table

| Check                                      | Fault injected                                                             | Test that observed it        | Observed                                            |
| ------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| Every project declares one ring            | a project's `ring:` tag removed                                            |                              |                                                     |
| A project cannot declare two               | a second `ring:` tag added                                                 |                              |                                                     |
| The application ring imports no adapter    | `@wbs/store-sqlite` imported from a `libs/core` production file            |                              |                                                     |
| The exemption stops at the production file | the same import moved out of `compose.test.ts` and into the file beside it |                              |                                                     |
| Core reaches for no driver                 | `drizzle-orm` imported, and `Bun` referenced, in a core production file    |                              |                                                     |
| Domain reaches for no node built-in        | `node:crypto` imported in `libs/domain`                                    |                              |                                                     |
| The relocated `bun:sqlite` ban still bites | `new Database()` outside `store-sqlite/db.ts`                              |                              |                                                     |
| The typecheck target compiles something    | `const deliberatelyWrong: number = 'not a number'` in each new lib         |                              |                                                     |
| The composition runs without an adapter    | (the proof itself: core over the memory source, no HTTP, SQLite or Bun)    |                              |                                                     |
| Project discovery reaches nested projects  | recursive descent replaced with `continue`                                 | `workspace-projects.test.ts` | expected outer/protocol; received `[]`              |
| Manifest axes and targets are required     | axis loop and nonempty-target guard removed                                | `workspace-projects.test.ts` | `readProjects unexpectedly succeeded`               |
| Duplicate project names are refused        | duplicate-name branch removed                                              | `workspace-projects.test.ts` | `readProjects unexpectedly succeeded`               |
| Unreadable state is not absence            | unreadable directory and manifest treated as empty/absent                  | `workspace-projects.test.ts` | both reported `readProjects unexpectedly succeeded` |
| Project symlinks are refused               | symlink rejection skipped                                                  | `workspace-projects.test.ts` | `readProjects unexpectedly succeeded`               |

## Slice 1 — the rings

| Command                                              | When       | Result                                                                                                                                                                                |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t lint typecheck --skip-nx-cache` | 2026-09-08 | **24 projects, clean**                                                                                                                                                                |
| `bun run test:unit`                                  | 2026-09-08 | 7 tasks green                                                                                                                                                                         |
| `bun test` in `tools/tool-devsync`                   | 2026-09-08 | 60 pass / 6 fail — the six are **pre-existing**, measured on the parent commit as 58/6, and are the poller's shell-helper cases; they fail the same way on `main` in this environment |

The workspace lint is the verdict here rather than per-project runs: a rule that changes what
may import what is exactly the kind that passes project by project and fails as a set
(2026-08-30's import-sort incident).

## Slice 2a — `libs/core` exists, and holds what has no adapter in it

| Command                                              | When       | Result                                                      |
| ---------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `bunx nx run-many -t lint typecheck --skip-nx-cache` | 2026-09-08 | **25 projects, clean** (24 before; `core` is the new one)   |
| `bun test` in `apps/be-01`                           | 2026-09-08 | 2,035 pass / 2 skip / 0 fail, same count as before the move |
| `bun run test:unit`                                  | 2026-09-08 | 7 tasks green                                               |

## Slice 2.0 — recursive workspace project discovery

| Command                                                                               | When       | Result                                                                                                                                |
| ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test tools/tool-devsync/src/{workspace-projects,workspace-targets,sync}.test.ts` | 2026-09-09 | **49 pass / 0 fail**                                                                                                                  |
| `bunx eslint tools/tool-devsync/src tools/tool-devsync/workspace-projects.mjs`        | 2026-09-09 | clean                                                                                                                                 |
| `bunx tsc --build --force tools/tool-devsync/tsconfig.json`                           | 2026-09-09 | clean; root `.mjs` checked by the spec project                                                                                        |
| `bunx prettier --check` on all changed tool-devsync files                             | 2026-09-09 | clean                                                                                                                                 |
| `bunx nx test tool-devsync --skip-nx-cache`                                           | 2026-09-09 | **71 pass / 6 fail**; all six are the existing macOS poller failures caused by GNU-only `mv -T`, unchanged from the prior 60/6 record |

Removing the nested supervisor protocol entry from `RESTART_PATHS` failed the production
coverage case on `Expected to contain: "libs/contracts/solver/supervisor-protocol/project.json"`.

## Slice 2.2b — transaction-free history ports

- `bun test` over the seven event-log, optimizer-event, saved-plan atomicity/quota/busy,
  capture, and core boundary files: **50 pass / 0 fail** on 2026-09-09.
- `bunx tsc --build --force libs/core/tsconfig.json apps/be-01/tsconfig.json`: clean.
- Adding `recordEventIn`, `holdingOf`, or `bodyOf` to a core port independently failed
  `store-boundaries.test.ts` at TS2741 because its adapter-free fixture lacked that method.
- Moving the saved-plan quota callback before `BEGIN IMMEDIATE` admitted the injected rival
  connection and failed on `Expected: [false] · Received: [true]`.
- Throwing from event insertion after the optimized cache write is covered by
  `rolls a plan-infeasible certificate back when recording its event crashes`; both durable
  rows remain inside the same SQLite transaction.

## Slice 2.2b.1 — core-owned store contracts

- `bunx tsc --build --force libs/core/tsconfig.json`: clean; this compiles
  `ports/stores.types.test.ts`.
- `bunx tsc --build --force apps/be-01/tsconfig.json`: clean; this compiles
  `repository/store-contracts.types.test.ts`.
- `bun test` in `libs/core`: **5 pass / 0 fail**.
- `bunx eslint libs/core/src apps/be-01/src/repository/store-contracts.types.test.ts`:
  clean.
- `bunx prettier --check libs/core/src apps/be-01/src/repository/store-contracts.types.test.ts`:
  clean.
- Removing the expected error from the valid command-scope fixture failed
  `core:typecheck` on TS2339: `PlanTransactionalStores` has no `savedPlans`.
- Dropping nullable `scheduleAbsentReason` from the explicit core row failed
  `be-01:typecheck` at the adapter-to-port boundary on TS2741.

## Slice 2.2b.2 — command graphs from admitted scopes

- `bun test` over `plan-command-scope.test.ts`, `announcement-ownership.db.test.ts`,
  `plan-commands.db.test.ts` and `sqlite-unit-of-work.db.test.ts`: **33 pass / 0 fail**.
- `bun test` over the write-coordinator, mounted work-item, route and app files:
  **20 pass / 0 fail**. The framed-request case required the permitted localhost socket;
  under the restricted sandbox Bun reported `EADDRINUSE` for `port: 0`.
- `bunx tsc --build --force apps/be-01/tsconfig.json`: clean.
- ESLint and Prettier over every changed application file: clean.
- Building a batch from `publicServices` let `rolled back` survive a refusal and failed
  on `Expected: [] · Received: ["rolled back"]`.
- Reusing the first staged graph made the later batch disappear and failed on
  `Expected: ["kept", "later"] · Received: ["kept"]`.
- Repairing through the discarded graph failed the in-window assertion on
  `Expected: true · Received: false`; the queued writer remained behind the repair turn.

## Slice 2.2b.3 — runtime contracts and pure deadlines

- `bun test` over the clock, push-deadline, retention-timer, saved-plan-retry and
  logger suites: **38 pass / 0 fail**.
- `bun run test:unit`: **897 pass / 1 intentional skip / 0 fail** in `be-01`, then
  all seven library test targets green. The first restricted run failed only where three
  tests needed ephemeral localhost sockets; the permitted rerun passed those cases.
- `bunx tsc --build --force` for contracts, core, runtime-portable, observability and
  `be-01`: clean.
- ESLint and Prettier over every changed contracts, core, runtime-portable,
  observability and `be-01` file: clean.
- Removing the two expected errors from the real `WorkItemService` and `AuthService`
  constructions failed `be-01:typecheck` twice on TS2741: required `clock` was missing.
- The existing deadline proof cases still cover a timeout during fetch, a delayed timer
  after fetch settles, and cleanup after completion.

## Slice 2.2b.4 — OIDC verifier boundary

- The four service/controller/identity files: **71 pass / 0 fail**; `boot.db.test.ts`:
  **13 pass / 0 fail** with its required ephemeral localhost sockets.
- `bun test` in `libs/auth`: **95 pass / 0 fail**, including the real local JWKS adapter.
- `bun run test:unit`: **897 pass / 1 intentional skip / 0 fail** in `be-01`, then
  all seven library test targets green.
- Contracts, core, auth and `be-01` typechecks: clean. ESLint and Prettier over every
  touched target: clean.
- Returning null for a discovery outage failed the mounted verifier-outage case on
  `Expected: 500 · Received: 401`.
- Catching account resolution as an invalid credential failed its mounted outage case on
  `Expected: 500 · Received: 401`.
- Falling back while password sessions were disabled failed the literal service case:
  expected null, received the authenticated `legacy` account.

## Slice 2.2c — directory and project service families

Verified 2026-09-09 from base `7cf1631849bb980660d172f44be57e6aa8dd089f`.

- Auth, project, step, directory, capacity, priority-band and calendar-marker services
  now live under `libs/core/src/service/` with their original basenames. Their old
  be-01 paths reexport inward. Shared pure siblings moved first: assumed-assignee,
  broadcast, clean-name, directory-usage and login-throttle.
- `NumberedWorkItem` and its `Days` value shape were extracted into
  `numbered-work-item.ts` so broadcast does not import work-item behavior.
  The old work-item and roll-up type exports remain compatible. Optimizer process
  code remains in be-01; only `OptimizerAvailability` moved to the scheduler port.
- `STEP_POSITION_STEP`, `StepHoldings` and `stepIsInUse` now have one domain
  authority in `libs/domain/src/step.ts`. SQLite and service callers use it;
  previous exports remain compatible. `servicesOver` already accepted
  `PlanTransactionalStores` at this slice's base and required no further change.

| Command                                                                                       | Observed                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Baseline nine service suites before moving                                                    | 124 pass, 0 fail                                                                              |
| `bun test ./libs/core/src`                                                                    | 35 pass, 0 fail, 8 files                                                                      |
| Six retained service suites below                                                             | 97 pass, 0 fail, 6 files                                                                      |
| `bun test ./apps/be-01/src/repository/step.db.test.ts`                                        | 25 pass, 0 fail                                                                               |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun run test:unit` with permitted localhost sockets | be-01: 872 pass, 1 intentional source-capability skip, 0 fail; all seven library targets pass |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck --skip-nx-cache` | 25 projects, all 50 targets pass, 1m 14s                                                      |
| Prettier check through its API on all changed/new code and config                             | 53 files pass                                                                                 |
| `git diff --check`                                                                            | clean                                                                                         |

Four suites relocated without changing executable assertions: `assumed-assignee.test.ts`
(7), `calendar-marker.service.test.ts` (17), `directory-usage.test.ts` (3) and
`login-throttle.test.ts` (2). This transfers 29 cases out of be-01; core now has its
previous 5 plus those 29 and one new production-boundary test (35 total).

Retained in be-01: `auth-service-null-password.test.ts` (4) uses real Bun password/token
adapters; `broadcast.test.ts` (11) composes the be-01 service graph; and the SQLite
suites `step.service.db.test.ts` (22), `directory.service.db.test.ts` (51),
`capacity-migration-identity.db.test.ts` (3), `priority-band-identity.db.test.ts` (6).
Moving adapter-composition tests produced a real Nx cycle through their be-01 fixtures.
The authorized resolution retained those suites and extracted only the pure fixtures
needed by relocated tests into `libs/core/src/testing/`, with old fixture paths
reexporting inward. No lint exception or hidden graph edge was introduced.

| Check                                           | Injected fault                                                                                                        | Observed                                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The production family exists in core            | Before moving the family, run `service-boundaries.test.ts`                                                            | Expected true, received false for core's missing `assumed-assignee.ts`                                                                                                                   |
| The test exemption stops at adjacent production | Add `import '../../../../apps/be-01/src/repository/schema';` at the top of `libs/core/src/service/project.service.ts` | Both `core:lint` and `service-boundaries.test.ts` fail on `@nx/enforce-module-boundaries`: “Projects cannot be imported by a relative or absolute path, and must begin with a npm scope” |

The injected import was removed before green verification; the observed diagnostic is
recorded beside the test. The broader driver/global enforcement inventory remains task 2.3.

The first restricted unit run failed only its three ephemeral HTTP-server cases; the
permitted rerun above passed them. One exploratory Bun command omitted `./` and also
collected generated `dist/out-tsc` tests; the final runs explicitly scoped source paths.
An initially requested nonexistent `repository/step.test.ts` contributed no cases;
the actual `step.db.test.ts` was then run separately with the 25-case result above.
Builds, the complete database tier, Chromium and the final landing gate were not run
for this checkpoint. Task 5.1 still owns adding core to the root fast-tier inventory;
core was run explicitly here.

### Review fix 1 — clock oracle follows moved services

The review found that `apps/be-01/src/service/clock.test.ts` still scanned only its
own folder. That folder now contains compatibility reexports for this slice's services.

- Adding `now?: () => number;` to the moved `CapacityServiceOptions` left the old
  oracle green: **4 pass, 0 fail**. It was reading the be-01 shim.
- The oracle now scans both `apps/be-01/src/service` and `libs/core/src/service`,
  reports paths instead of ambiguous basenames, and asserts that it sees the actual
  core CapacityService and still-local WorkItemService definitions.
- With that same core fault retained, the corrected clock case failed:
  expected `[]`, received `["libs/core/src/service/capacity.service.ts"]`
  (**3 pass, 1 fail**).
- A separate injected private `stampFor(actorId: string): WriteStamp` method in
  core's CapacityService failed the second case on that same path (**3 pass, 1 fail**).
- Removing the core folder from the scan failed its coverage assertion on
  `Received: undefined`, while both shape checks passed (**3 pass, 1 fail**).
  The initial coverage assertion used `toContain` on an absent value and produced a
  matcher type error; it now checks presence first and the final negative above
  was observed at `toBeDefined`.
- All injected faults are removed. The clock, core clock and calendar-marker suites
  pass **23 tests, 0 fail**; the clock suite remains four cases.
  Forced core/be-01 lint and typecheck targets pass; Prettier and `git diff --check`
  are clean. Only the clock oracle and this evidence changed; production code is
  byte-identical to the checkpoint.
- The broader unit, database and browser gates were not repeated for this test-only
  review fix; their checkpoint results and outstanding limitations above still apply.

## Slice 2.2c.1 — work-item services and pure satellites

Verified 2026-09-09 from clean, current-main-merged base `5352ae704041`.

- `work-item.service`, `plan-command`, `plan-commands`, `compensating`, `dependency`
  and `roll-up` now live under `libs/core/src/service/`; their be-01 paths reexport
  inward. `UnitOfWork`, generic `Scope<S>` and `Decision<T, S>` live in
  `core/ports/unit-of-work.ts` and preserve a source's admitted store subtype.
- The command runner consumes the four-service `PlanCommandServices` contract. The app
  supplies work items, directory, capacity and priority bands; core no longer imports the
  app graph, SQLite schema or optimized runtime reader.
- Ten pure suites moved adjacent to core without changing their named test structure:
  compensating (3), dependency (16), plan-command scope (1), roll-up (34), work-item
  service (98), estimate (13), actual (17), progress (21), measure (27) and freeze (8).
  An AST comparison found every named `describe`/`it`/`test` call identical and ordered
  for every old/new pair.
- `revision.db.test.ts` (27), `undo.db.test.ts` (89) and `plan-commands.db.test.ts` (23)
  remain in be-01 because they open SQLite and construct repository adapters directly.
  Their 139 cases ran with the 238 relocated cases: **377 pass / 0 fail**, 946 assertions.
- Pure in-memory fixtures required by the relocated suites now live under
  `libs/core/src/testing/`; old app fixture paths reexport inward. The core scheduler fake
  implements the scheduler port and imports no optimizer runtime adapter.

| Command                                                        | Observed                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bun test ./libs/core/src`                                     | 273 pass, 0 fail                                                                         |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun run test:unit`   | be-01 640 pass, 1 intentional capability skip, 0 fail; all seven listed libraries passed |
| forced `core:typecheck` and `be-01:typecheck`                  | both pass                                                                                |
| uncached `core:lint`, `be-01:lint` and `fe-01:lint`            | all pass                                                                                 |
| Prettier over core and touched app sources; `git diff --check` | clean                                                                                    |

The be-01 fast-tier count fell by 238 because those exact cases moved into core. Core is
still outside the root fast-tier project list until task 5.1, so its complete 273-case
source suite was run explicitly rather than inferred from `test:unit`.

| Check                                     | Injected fault                                                                      | Observed                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relocated production family exists        | Run the expanded boundary test before moving production                             | Expected true, received false for missing `libs/core/src/service/compensating.ts`                                                                                 |
| Production core cannot import the app     | Import `apps/be-01/src/repository/schema` from adjacent core `work-item.service.ts` | `core:lint` failed at line 41 with `@nx/enforce-module-boundaries`: “Projects cannot be imported by a relative or absolute path, and must begin with a npm scope” |
| Source-specific stores survive the port   | Remove the store generic from `UnitOfWork`                                          | `core:typecheck` failed on TS2315 (`UnitOfWork` is not generic) and TS7006 for the erased scope parameter                                                         |
| Clock authority follows the moved service | Remove `export` from core's `WorkItemService`                                       | Clock authority test failed because the core source no longer contained `export class WorkItemService`                                                            |

All injected faults were removed before the restored green runs. Independent review found
and rechecked the generic port, test relocation, live source links and source-neutral JSDoc;
spec compliance and code quality passed with no remaining findings. The complete workspace,
database and browser gates remain owned by the final integration task.

## Gate

| Command | When | Result |
| ------- | ---- | ------ |
|         |      |        |
