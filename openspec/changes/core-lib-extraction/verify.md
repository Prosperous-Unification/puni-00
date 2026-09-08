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

## Gate

| Command | When | Result |
| ------- | ---- | ------ |
|         |      |        |
