# 040.6 G — Plan commands as the last feature module of the backend core

| Field      | Value                                                                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — fourteenth packet                                                                                                                                  |
| Size class | M, in four slices                                                                                                                                                                                                                             |
| Slices     | 1 seals Plan commands (feature, use case, command bindings, module files, three sideways rows), 2 makes the Working plan private to it, 3 installs it once in `composeServices`, 4 registers it in the wiki pilot and ticks tasks 5.2 and 1.2 |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` tasks 5.2 and 1.2 (both reworded and ticked with the 2026-09-24 collector decision of section 9), and task 7.5 for `module/plan-commands/`                                                   |
| Planned on | 2026-09-24; every slice rehearsed end to end and committed on a throwaway branch cut from `50720e10` (planning `251dd68f` merged with packet E8's re-cut rehearsal tree `40333be3`)                                                           |

**Dates.** Every `Proof:` comment and task note below carries the planner's rehearsal date,
2026-09-24. Write the date you actually observe (`date -u +%F`) when you add them; if it differs,
change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-g-plan-commands.md` must
print an entry) and its `legacy-root` exemption entry, and must descend from packet E8's slice-3
planner commit. This packet was rehearsed on `50720e10`, whose E8 files are E8's re-cut rehearsal
tree; E8's real commits differ from it only in the dates inside E8's own `Proof:` lines and task
notes. **Before dispatch the planner reruns section 15's script against the real base** (with the
real base in place of `50720e10` and E8's real commits present): three diffs here carry E8 lines as
context (10.14's `compose.test.ts`, 10.17's legacy pin and 10.19's `tasks.md`), and if E8's executor
observed a date other than 2026-09-24 those context lines differ. A refusal there is re-cut by the
planner, never repaired by the executor. Every count below was measured on `50720e10`. This packet
edits none of E8's files except by the named diffs to `index.ts`, `kinds.json`, `compose.ts`,
`compose.test.ts`, `modules.json`, `policy.json`, `pilot-policy.test.ts`, the legacy pin and
`tasks.md`, each of which inserts beside E8's lines or rewrites a Plan commands line alone. Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-g-plan-commands 1 <packet-containing commit sha> --batch batch-6 --require-ancestor <E8 slice-3 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

Slices 2 to 4 resume the clone the previous slice built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-g-plan-commands 2 <the same sha> --batch batch-6 --resume --require-ancestor <slice 1 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-g-plan-commands 3 <the same sha> --batch batch-6 --resume --require-ancestor <slice 2 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-g-plan-commands 4 <the same sha> --batch batch-6 --resume --require-ancestor <slice 3 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

The executor never runs `apps/wbs/be-01/src/app.routes.test.ts`: its `refuses framed GET and HEAD
bodies on the production health route` test binds a port through `Bun.serve`, which a sandbox
refuses with `EPERM: operation not permitted, listen` while the network is off. The be-01 unit
command below excludes that file and the planner runs it (section 8). Nothing else binds a port or
needs the network (`bun build` and the pilot suite's local `git clone` run offline), so **no slice
needs `--network`**. No slice reads an earlier attempt's evidence, only the committed tree, so **no
slice needs `--seed`**.

## 1. Goal and non-goals

**Goal.** Make Plan commands — `PlanCommandRunner` and its use case `runCommandBatch` — the last
feature module of the backend core, in the shape every earlier 040.6 module has (a README, a
contract, a labelled `module.ts`, a composition `check.ts`), with its private parts inside it:

| Module directory under `libs/wbs/application/core/src/module/` | Moved from                                                                                                                                                                                       | Export     | Label                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------- |
| `plan-commands/`                                               | `service/plan-commands.ts` (393 lines), `use-cases/run-command-batch.ts` (31), `service/command-bindings.ts` (545), `service/working-plan.ts` (629) and its five implementation files, six tests | `commands` | `application.plan-commands` |

Plan commands is a **process** installation with **per-batch** internals: `composeServices` installs
one runner, and every `run`, `runDirectory`, `undo` and `redo` makes its own announcement
collector, Working plan and graph over the scope its own unit of work admits. The module's own test
proves the per-batch collector through the installer (the direct broadcaster substituted fails it);
`compose.test.ts` proves the per-scope graph through the composition (a factory over the process's
stores substituted fails it). Slice 4 registers the module in the wiki content-review pilot through
its frozen-revision predecessor.

**Non-goals.**

- No change to what Plan commands does. Every moved body differs from its source only in import
  lines (10.2, 10.8, 10.10); the installer returns the same class; `composeServices`' existing
  exports are unchanged and it gains one, `commands`.
- **The announcement collector does not move** (section 3, "Task 1.2"; decided in section 9): it
  is neutral shared support in `service/broadcast.ts`, imported by Plan commands and Plan import.
  Its `kinds.json` disposition and the contract's K disclosure say so; tasks 1.2 and 5.2 are
  reworded to match and ticked with dated notes.
- No importer is repointed and no delivery changes: be-01's `mountedEndpoints` keeps constructing
  its own `PlanCommandRunner` (the map's "Move construction to composition" hazard, disclosed in
  `contract.ts` and on `CommonServices.commands`, tracked under 7.4); `http/work-item.routes.ts`,
  the test fixtures, `testing/portable-composition.ts` and every database test keep their paths
  through four compatibility shims.
- No domain moves (task 6.1): the moved files keep importing `service/plan-command.ts`,
  `directory-usage.ts` and the four resource classes through their `service/` paths.
- No change to `service/service-boundaries.test.ts` (its list keeps naming `plan-commands`,
  `command-bindings` and `broadcast`, now two shims and the unchanged collector), to
  `use-cases/README.md` (it keeps indexing the `run-command-batch.ts` shim), to be-01's deep-import
  shim, or to any library version (`di-bag` stays 0.4.0). No frontend, gateway or MCP change.

## 2. Read first

| File                                                                                                                                                                             | Why                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                                                     | Rules R1 to R5.                                                                              |
| `libs/wbs/application/core/src/module/plan-import/`                                                                                                                              | The process feature with a per-scope factory whose four module files the new module mirrors. |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` (the Plan commands row; "Required no-sideways preparations" 1 and 4; "Delivery and composition hazards") | What the module exports, what stays with it, and the hazards it leaves open.                 |
| `libs/wbs/application/core/src/compose.ts` (`CommonServices`, `composeServices`)                                                                                                 | The one installation site.                                                                   |
| `openspec/changes/adopt-di-composition/specs/di-composition/spec.md` ("Writing modules are installed per admitted scope")                                                        | The requirement the per-batch collector and per-scope graph serve.                           |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation"                                                               | The exact `jq -s -e` contract slice 4 uses.                                                  |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `50720e10` on 2026-09-24.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Evidence                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `service/plan-commands.ts` is 393 lines, `use-cases/run-command-batch.ts` 31, `service/command-bindings.ts` 545, `service/working-plan.ts` 629; the five `service/working-plan-{directory,edges,rows,subtrees,values}.ts` are 80, 50, 83, 51 and 69. Their tests: `service/plan-commands.test.ts` (34 tests), `plan-command-scope.test.ts` (1), `command-bindings.test.ts` (0; a type-level fixture), `working-plan.test.ts` (15), `working-plan-directory.test.ts` (5), `working-plan.types.test.ts` (0; a `@ts-expect-error` witness).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `wc -l`; `bun test ./…`.                      |
| **Scope.** `compose.ts` does not construct `PlanCommandRunner`: `servicesOver` builds the seven resources per call and `composeServices` exposes `batch: (scope, broadcast) => servicesOver(scope.stores, …)`. The one production construction is be-01's `mountedEndpoints` (`apps/wbs/be-01/src/app.ts:199`), over `opts.writes.batch`, `opts.writes.uow`, `opts.writes.announcements` and the public resources. Every other construction is a test or `libs/wbs/application/core/testing/portable-composition.ts`. The runner itself holds only its options; `execute` and `walk` create a new `AnnouncementCollector`, a new Working plan (`execute` only) and a new graph per act (`plan-commands.ts:222-237`, `:337-342`). So the module is a process installation beside Plan import, and its per-admission property lives inside the moved body.                                                                                                                                                            | Read; `git grep -n "new PlanCommandRunner("`. |
| `PlanCommandRunnerOptions` (`plan-commands.ts:109-141`) has four required fields: `batchServices`, `publicServices: PlanCommandServices`, `uow: UnitOfWork`, `announcements: Broadcaster`. `WritingServices` satisfies `PlanCommandServices`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Read.                                         |
| **Kinds (K2 to K6), by reading.** The feature imports no other feature. It imports the Work item, Directory, Capacity and Priority band resource classes (types) through their `service/` shims, `service/plan-command.ts` and `directory-usage.ts` (domain moves of 6.1), `service/broadcast.ts` (the collector), `command-bindings.ts` and `working-plan.ts`. It reads no repository port itself: `createWorkingPlan(scope, projectId)` wraps the admitted stores, and the resulting stores are handed to `batchServices`. `run-command-batch.ts` takes `AuthenticatedUser` from `@wbs/contracts`. Delivery: `http/work-item.routes.ts` takes the runner (delivery to feature) beside `WorkItemService` (Work item's K2); be-01 constructs the runner (the composition hazard).                                                                                                                                                                                                                                   | `grep -n "from '"` on every moved file.       |
| **Task 1.2.** Its first half (the neutral `ProjectEvent`/`Broadcaster`/`subscriptionFor` port) landed as `ports/project-event.ts`; `service/broadcast.ts` now holds only those compatibility re-exports and `AnnouncementCollector`/`HeldAnnouncement`. The collector is built by `service/plan-commands.ts:222` and `:337` **and** by `module/plan-import/plan-import.feature.ts:148`, and constructed directly by `service/broadcast.test.ts` and two be-01 database tests. Moving it into `module/plan-commands/` would make Plan import import a sibling feature (K6); a copy would be a second class definition, which the map forbids. `ports/event-port-boundaries.test.ts:11` pins `collectorHome = 'service/broadcast.ts'`. **Decision (planner, 2026-09-24, section 9):** the collector is neutral shared support and stays; its `kinds.json` disposition ("move it there with task 5.2") is corrected in slice 1, `contract.ts` records the correction, and 1.2 and 5.2 are reworded and ticked (10.19). | `git grep -n AnnouncementCollector`; read.    |
| **Working plan's importers.** `service/working-plan.ts` is imported by `plan-commands.ts`, its two tests and the barrel (`index.ts:132`); `libs/wbs/adapters/store-sqlite/src/working-plan-order.db.test.ts` imports `createWorkingPlan` from `@wbs/core`. The five implementation files are imported only by `working-plan.ts` and by `working-plan-directory.test.ts`. So `service/working-plan.ts` stays a shim for the barrel, and the five move **without** shims: their five `kinds.json` rows are removed (93 to 88). The moved `working-plan.ts` is named `working-plan.resource.ts`, so its `resource` kind (term "working plan", which its removed row carried) is declared by suffix (`KIND_SUFFIXES`, `tools/tool-devsync/src/service-kinds.ts:24`).                                                                                                                                                                                                                                                    | `git grep -l`; read.                          |
| **Sideways rows.** `ports/sideways-type-boundaries.test.ts` has nineteen rows. Rows 1, 2 and 10 (`from: path.startsWith('use-cases/')`) cover `use-cases/run-command-batch.ts` today; no row names `service/plan-commands.ts`, `command-bindings.ts` or `working-plan*.ts`. After the move, `module/plan-commands/run-command-batch.ts` is covered by none: rehearsed, a bare `import '../../service/auth.service';` prepended to it leaves the suite passing (row 11). Slice 1 adds three rows for `module/plan-commands/` (auth shim, `authentication.feature.ts`, `http/endpoint.ts`), the Saved plans precedent; the three existing `use-cases/` rows stay.                                                                                                                                                                                                                                                                                                                                                     | Read; rehearsed.                              |
| Nothing pins these paths as strings except comments: `git grep` for `plan-commands.ts`, `command-bindings.ts`, `run-command-batch.ts` and `working-plan*.ts` in `.ts`/`.json` files finds JSDoc text only; `apps/wbs/be-01/src/service/clock.test.ts` scans every module directory (`serviceFolders`) and the moved files read no clock. `service/service-boundaries.test.ts` checks that `service/plan-commands.ts` and `service/command-bindings.ts` exist and lint clean: both stay, as shims.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `git grep`; rehearsed.                        |
| **Frozen-revision predecessor:** `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/plan-commands.ts` prints `100644 blob 720f5d37a03073e4445eeb40bf3b8d8bb0f6a03d`. `libs/core/src/use-cases/run-command-batch.ts` also existed (`ae4a5116…`) and is already a baseline entry of `boundary.application.use-cases`; `command-bindings.ts`, `working-plan.ts` and `plan-commands.test.ts` did not exist then. One predecessor per module directory: `plan-commands.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `git ls-tree`; `grep` in `policy.json`.       |
| `kinds.json` has `K=93` entries. Slice 1 rewrites three rows in place (`service/plan-commands.ts` and `use-cases/run-command-batch.ts` from `feature`, `service/command-bindings.ts` from private support, all to shims) and corrects `service/broadcast.ts`'s disposition; slice 2 rewrites `service/working-plan.ts`'s `resource` row to a shim and removes the five implementation rows (`K - 5 = 88`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `python3`; `grep -n`.                         |
| The wiki pilot holds `M=19` modules and `B=19` boundaries; `module.application.plan-commands` sorts between `module.application.directory` and `module.application.plan-history`; its README sorts before `module/plan-history/README.md` in `pilotPaths`. The pilot suite is `21` tests, `0` failures, `306` `expect()` calls (293 s); the legacy pin is `65`/`283`/`0d78b579…`. `check.core.test` already exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `python3`; rehearsed.                         |
| Baselines at `50720e10`, taken after `wbs-core`/`wbs-be-01` lint and typecheck (exit 0): core `bun test src` `619` over 67 files; be-01 unit set (without `*.db.test.ts` and `app.routes.test.ts`) `520` over 49; `compose.test.ts` `16` tests; OpenSpec `114` passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rehearsed.                                    |

## 4. Why four slices

Sealing everything at once is 43 paths. Slice 1 (21 paths: 11 new, 7 modified, 3 deleted) is the
feature, its use case, its command bindings, the module's four files and the three sideways rows the
use case's move needs at once. Slice 2 (22 paths, all moves but four edits) is the Working plan
alone, so a refusal there cannot strand a half-sealed feature. Slice 3 (4 paths) is the composition
change with its compile red and per-scope negative. Slice 4 (7 paths) is registration, whose pilot
suite takes about five minutes twice.

## 5. File plan

Every path is under `libs/wbs/application/core/src/` unless it starts with `apps/`, `docs/`,
`openspec/` or `tools/`. `m/` is `module/plan-commands/`.

| Path                                                                                            | Slice      | Action                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `m/module.test.ts`                                                                              | 1          | create **first**, for the red (10.1)                                                                             |
| `m/plan-commands.feature.ts`, `m/run-command-batch.ts`, `m/command-bindings.ts`                 | 1          | `cp` from `service/plan-commands.ts`, `use-cases/run-command-batch.ts`, `service/command-bindings.ts`, then 10.2 |
| `m/plan-commands.test.ts`, `m/plan-command-scope.test.ts`, `m/command-bindings.test.ts`         | 1          | **`mv`** from `service/`, then 10.2 (the last one needs no edit)                                                 |
| `service/plan-commands.ts`, `use-cases/run-command-batch.ts`, `service/command-bindings.ts`     | 1          | content replaced by the shims of 10.3                                                                            |
| `m/{contract,module,check}.ts`, `m/README.md`                                                   | 1, 2, 3, 4 | create (10.4); later slices edit the README                                                                      |
| `index.ts`, `docs/code-organization/kinds.json`                                                 | 1, 2       | 10.5; 10.11                                                                                                      |
| `ports/sideways-type-boundaries.test.ts`                                                        | 1          | 10.6, then its Proofs (10.7)                                                                                     |
| `m/working-plan.test.ts`, `m/working-plan-directory.test.ts`, `m/working-plan.types.test.ts`    | 2          | **`mv`** from `service/`, then 10.8                                                                              |
| `m/working-plan.resource.ts`                                                                    | 2          | `cp` from `service/working-plan.ts`, then 10.10                                                                  |
| `m/working-plan-{directory,edges,rows,subtrees,values}.ts`                                      | 2          | **`mv`** from `service/` (no shim), then 10.10                                                                   |
| `service/working-plan.ts`                                                                       | 2          | content replaced by the shim of 10.9                                                                             |
| `compose.ts`, `compose.test.ts`                                                                 | 3          | 10.12, 10.13, then the Proof (10.14)                                                                             |
| `docs/wiki-policy/modules.json`, `policy.json`; `apps/wiki/cli/src/policy/pilot-policy.test.ts` | 4          | three diffs, in order (10.15-10.17)                                                                              |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                       | 4          | legacy re-pin (10.17's numbers, then its Proof, 10.18)                                                           |
| `openspec/changes/adopt-di-composition/tasks.md`                                                | 4          | 1.2 and 5.2 reworded and ticked, 7.5 extended (10.19)                                                            |
| `openspec/changes/adopt-di-composition/verify.md`                                               | 1-4        | each slice appends its own observations                                                                          |

**Directory contents.** After slice 1, `m/` holds **eleven** files: `README.md`, `check.ts`,
`command-bindings.test.ts`, `command-bindings.ts`, `contract.ts`, `module.test.ts`, `module.ts`,
`plan-command-scope.test.ts`, `plan-commands.feature.ts`, `plan-commands.test.ts`,
`run-command-batch.ts`. After slice 2, **twenty**: those and `working-plan-directory.test.ts`,
`working-plan-directory.ts`, `working-plan-edges.ts`, `working-plan-rows.ts`,
`working-plan-subtrees.ts`, `working-plan-values.ts`, `working-plan.resource.ts`,
`working-plan.test.ts`, `working-plan.types.test.ts`. Slice 4's index block names all but the
README (19).

**Neighbours.** E8 owns `module/work-item/`, its shim, and its lines in `compose.ts`, `index.ts`,
`kinds.json`, `clock.test.ts`, `modules.json`, `policy.json`, `pilotPaths`, the legacy pin and
`tasks.md`; this packet inserts beside them and edits none. `tasks.md` has been touched by every
040.6 packet; this packet's edits are to 1.2, 5.2 and 7.5's running note. Section 12's hand-over
lists are scoped to each slice's own `base`.

## 6. Rehearsed observations

Every row was produced on the throwaway branch in a private worktree of `50720e10`, against the
exact listings of section 10, and restored with `cp` + `cmp` before the next. Rows marked
**evidence** are the planner's measurements behind a decision; the executor does not repeat them.

**The six sealed-module faults** (rows 5-10), each on the listings of 10.4 before 10.7's Proofs:

```text
tuple     m/module.ts: .buildModule(['commands'], { label: PLAN_COMMANDS_LABEL });
          -> .buildModule(['commands', 'planCommandOptions'], { label: PLAN_COMMANDS_LABEL });
label     m/module.ts: the same line -> .buildModule(['commands']);
drain     m/module.ts, the object the planCommandOptions factory returns: the line `        announcements,`
          directly before `      }),`
          -> `        announcements: { ...announcements, publish: () => Promise.resolve() },`
collector m/module.ts, the same object: the line `        batchServices,` directly after
          `      }): PlanCommandRunnerOptions => ({`
          -> `        batchServices: (scope) => batchServices(scope, announcements),`
bag       m/check.ts:  return { commands: bag.resolve('commands') };
          -> const exposed = { commands: bag.resolve('commands'), bag };
             return exposed;
resolver  m/check.ts:  return { commands: bag.resolve('commands') };
          -> return { commands: Object.assign(bag.resolve('commands'), { resolve: bag.resolve.bind(bag) }) };
```

`module.ts` contains `        announcements,` twice and `        batchServices,` twice (the parameter
list and the returned object). The parameter list's are followed by `        publicServices,` and
`      }: {`; the returned object's are the ones named above. **Replace** the named line; do not add a
second key beside it: a later shorthand wins in an object literal and the named test stays green.

**The three sideways faults** (rows 12-15): prepend one line to `m/run-command-batch.ts`, each alone:
`import '../../service/auth.service';`, `import '../authentication/authentication.feature';`,
`import '../../http/endpoint';`.

**The Working plan fault** (row 20). In `m/working-plan.resource.ts`, the line
`  readonly stores: PlanTransactionalStores;` (inside `interface WorkingPlan`, the only such line)
is **replaced** by `  readonly stores: PlanTransactionalStores & { readonly users?: unknown };`.

**The per-scope fault** (row 26). In `compose.ts`, insert one line and a blank line immediately
before `export interface ServicesOverOptions {`, and replace the line `      batchServices: batch,`
directly after `    commands: installPlanCommands({` (not the one inside `installPlanImport({`):

```text
let firstBatch: WritingServices | undefined;

      batchServices: batch,  ->  batchServices: (scope, broadcast) => (firstBatch ??= batch(scope, broadcast)),
```

| #   | Where                                                      | Fault injected                                                                    | Test that observed it                                                                                        | Literal fragment observed                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, unchanged tree                                | none; `check.ts` does not exist                                                   | `m/module.test.ts`                                                                                           | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                             |
| 2   | slice 1-3 step 0, unchanged `compose.ts`                   | none                                                                              | `bun build libs/wbs/application/core/src/compose.ts --target=bun`, then `grep -cF application.plan-commands` | build exit 0; `application.plan-commands count=0 (grep exit 1)`                                                                                                                                                                                                                                   |
| 3   | slice 1 green                                              | none                                                                              | `bun test ./libs/wbs/application/core/src/module/plan-commands/`                                             | `41 pass`, `0 fail`, `159 expect() calls`, 4 files                                                                                                                                                                                                                                                |
| 4   | slice 1, after 10.5                                        | none                                                                              | `ports/sideways-type-boundaries.test.ts`                                                                     | `1 pass`, `0 fail`                                                                                                                                                                                                                                                                                |
| 5   | `module.ts`                                                | tuple                                                                             | the private-binding test and the two label tests                                                             | `Received function did not throw`; `Expected to contain: "application.plan-commands/planCommandOptions"`; message `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "planCommandOptions"`; `3 pass`, `3 fail`                                                                                            |
| 6   | `module.ts`                                                | label                                                                             | `labels its private bindings with the module name`, `names itself when a host omits a requirement`           | `4 pass`, `2 fail`; the private-binding test stays green                                                                                                                                                                                                                                          |
| 7   | `module.ts`                                                | drain                                                                             | `drains a committed batch into the broadcaster installPlanCommands wires`                                    | expected `[{ "event": { "type": "capacity_changed" }, "projectId": "project-1" }]`, `+ []`; `5 pass`, `1 fail`                                                                                                                                                                                    |
| 8   | `module.ts`                                                | collector                                                                         | `hands every batch its own collector, never the direct broadcaster`                                          | `expect(received).not.toBe(expected)` at `expect(handed[0]).not.toBe(handed[1])`; `5 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                            |
| 9   | `check.ts`                                                 | bag                                                                               | `exposes only the contract exports from its installer`, first assertion                                      | received keys add `"bag"` (`Expected - 0`, `Received + 1`); `5 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                                                                                       |
| 10  | `check.ts`                                                 | resolver                                                                          | the same test, second assertion                                                                              | `Expected: true`, `Received: false`; `5 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                                                         |
| 11  | slice 1, after 10.5                                        | the auth-shim import of rows 12-15                                                | `ports/sideways-type-boundaries.test.ts`                                                                     | `1 pass`, `0 fail` — the gap the move opens; 10.6 closes it                                                                                                                                                                                                                                       |
| 12  | after 10.6                                                 | auth-shim import                                                                  | the same suite                                                                                               | exactly `"module/plan-commands/run-command-batch.ts: '../../service/auth.service' reaches service/auth.service.ts"`; `0 pass`, `1 fail`                                                                                                                                                           |
| 13  | after 10.6                                                 | Authentication feature import                                                     | the same suite                                                                                               | exactly `"module/plan-commands/run-command-batch.ts: '../authentication/authentication.feature' reaches module/authentication/authentication.feature.ts"`; `0 pass`, `1 fail`                                                                                                                     |
| 14  | after 10.6                                                 | endpoint import                                                                   | the same suite                                                                                               | exactly `"module/plan-commands/run-command-batch.ts: '../../http/endpoint' reaches http/endpoint.ts"`; `0 pass`, `1 fail`                                                                                                                                                                         |
| 15  | slice 1, after 10.6                                        | none                                                                              | the same suite                                                                                               | `1 pass`, `0 fail`                                                                                                                                                                                                                                                                                |
| 16  | slice 1 end                                                | none                                                                              | core `bun test src`; kinds substitute                                                                        | `625` over 68 (`C + 6` over `F + 1`); `93 []`                                                                                                                                                                                                                                                     |
| 17  | slice 2 red, after 10.8                                    | none; the sources have not moved                                                  | the three moved tests                                                                                        | `error: Cannot find module './working-plan.resource'` (twice) and `'./working-plan-directory'`; `0 pass`, `3 fail`                                                                                                                                                                                |
| 18  | slice 2 green                                              | none                                                                              | `bun test ./libs/wbs/application/core/src/module/plan-commands/`                                             | `61 pass`, `0 fail`, `240 expect() calls`, 7 files                                                                                                                                                                                                                                                |
| 19  | slice 2 end                                                | none                                                                              | core; kinds substitute                                                                                       | `625` over 68 (`C` over `F`); `88 []`                                                                                                                                                                                                                                                             |
| 20  | `m/working-plan.resource.ts`                               | the Working plan fault                                                            | `wbs-core:typecheck`                                                                                         | exit 1; `m/working-plan.types.test.ts:11:1 - error TS2578: Unused '@ts-expect-error' directive.`, `Found 1 error` — the moved compile witness is still type-checked                                                                                                                               |
| 21  | slice 3, after 10.12                                       | none; `composeServices` has no `commands`                                         | `compose.test.ts`; `wbs-core:typecheck`                                                                      | `13 pass`, `4 fail`, `TypeError: undefined is not an object (evaluating 'runner.run')` (three) and `(evaluating 'graph.commands.runDirectory')`; typecheck exit 1 with `TS2339: Property 'commands' does not exist on type 'CommonServices'.` at `compose.test.ts:109`, `:241`, `:244` and `:250` |
| 22  | slice 3, after 10.13                                       | none                                                                              | row 2's build and grep                                                                                       | `count=1`                                                                                                                                                                                                                                                                                         |
| 23  | slice 3, after 10.13                                       | none                                                                              | `compose.test.ts`                                                                                            | `17 pass`, `0 fail`                                                                                                                                                                                                                                                                               |
| 24  | slice 3 end                                                | none                                                                              | core                                                                                                         | `626` over 68 (`C + 1` over `F`)                                                                                                                                                                                                                                                                  |
| 25  | **evidence**: row 26 on the whole file; and a second fault | the per-scope fault; separately, a factory over the process's own `source.stores` | the whole `compose.test.ts`; `-t "installs Plan commands once"`                                              | memo: `13 pass`, `4 fail` (the three fixture-runner cases and the new one); process stores: `this test timed out after 5000ms.`, `0 pass`, `1 fail` — rejected as the required negative, see below                                                                                                |
| 26  | `compose.ts`                                               | the per-scope fault                                                               | `-t "installs Plan commands once"`                                                                           | `error: expect(received).toEqual(expected)` with `-   "Second",` (`Expected - 1`, `Received + 0`) at the final `listTeams` assertion; `0 pass`, `16 filtered out`, `1 fail`; typecheck exit 0                                                                                                     |
| 27  | slice 4, row diff alone                                    | `modules.json` row                                                                | `pins exact pre-index tuples and passes observe lint from external trust`                                    | `pilot-policy.test.ts:384` `Expected: 19`, `Received: 20`; `0 pass`, `1 fail`                                                                                                                                                                                                                     |
| 28  | slice 4, row and boundary                                  | `policy.json` boundary                                                            | the same test                                                                                                | `pilot-policy.test.ts:421` `Expected: true`, `Received: false`; `0 pass`, `1 fail`                                                                                                                                                                                                                |
| 29  | slice 4, all three                                         | index                                                                             | the same test                                                                                                | `1 pass`, `0 fail`                                                                                                                                                                                                                                                                                |
| 30  | slice 4 green                                              | registered                                                                        | the whole `pilot-policy.test.ts`                                                                             | `21 pass`, `0 fail`, `307 expect() calls` (baseline `21`/`0`/`306`)                                                                                                                                                                                                                               |
| 31  | slice 4, legacy pin unchanged, after registration          | none                                                                              | `every legacy source occurrence and relevant text family is pinned`                                          | `historical policy selector or baseline` `65` → `67`, `occurrences` `283` → `285`, digest `0d78b579…` → `687c123b315024882f690de60d7a3ac6890f89200a880ebf21b2242b66987a54`; `Expected - 3` / `Received + 3`; `0 pass`, `1 fail`                                                                   |
| 32  | slice 4, after the numbers of 10.17                        | none                                                                              | the same test                                                                                                | `1 pass`                                                                                                                                                                                                                                                                                          |

Each module assertion has its own mutation: tuple and label are independent (the label fault leaves
the private-binding test green); bag and resolver split the installer test's two assertions; drain
and collector break the two wires the module test drives end to end (the collector fault leaves the
drain test green: a directly published `capacity_changed` still reaches the broadcaster). The other
two wires (`publicServices`, `uow`) are held by the type checker and by `compose.test.ts`.

**Why the per-scope negative is the memo, not the process stores.** The new case runs three
directory-only batches (no project, so no Working plan): a commit, a refusal, a commit. Memoizing
the first batch's graph sends the third batch's `Second` into the first batch's settled scope, and
the final assertion fails on the missing name. The more obvious fault, a factory over the
process's own `source.stores`, deadlocks instead — the batch asks for the source's turn while its
own unit of work holds it — and fails only by Bun's 5-second timeout, before any assertion runs;
it is kept as evidence (row 25). With a project the memo is caught earlier still, by the Working
plan's own guard (`Working plan for <id> is closed`), which is why the case uses `runDirectory`.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses with
`if cmd >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"`;
never read a status through `tee`, never `|| true`. Start lint, typecheck and format targets the
same way and poll their logs (preamble rule 19). Scratch lives only under `"$TMPDIR"`, faults and
failing output under `"$TMPDIR/evidence"`; `verify.md` cites basenames only. You never run
`git add`, `git commit`, `git mv` or any other command that changes Git state: moves are `cp` and
`mv`, and the planner stages them. A fault is injected by editing the file, observed, then restored
with `cp` from a `"$TMPDIR"` copy and proved with `cmp`; save each fault as a patch
(`diff -u "$TMPDIR/<copy>" <file>` while it is in place, with the README's
`if diff …; then …; else test $? -eq 1; fi` form, since several files are untracked) and its failing
output beside it. Every step 0 opens with `base=$(git rev-parse HEAD)` and an empty-status check;
every count compared (`K`, `C`, `F`, `E`, `EF`, `M`, `B`, `T`, `TF`, `P`, `N`) is assigned in the
slice that compares it, and the same names mean the same commands in every slice. `m` below is
`libs/wbs/application/core/src/module/plan-commands`.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`. A listing is
written verbatim as the file's whole content. After appending to `verify.md`, run
`GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
before the format check. Strip terminal colour codes before quoting a fragment
(`sed 's/\x1b\[[0-9;]*m//g'`).

**The shared baseline block.** Slices 1 to 3 record their baselines with this block, `<n>` their
slice number. The lint and typecheck run first on purpose (addendum 14).

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
n=<n>
log="$TMPDIR/evidence/slice$n-lint-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core wbs-be-01 --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
log="$TMPDIR/evidence/slice$n-core-baseline.log"
if (cd libs/wbs/application/core && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test src) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice$n-be01-unit-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test $(find src -name '*.test.ts' ! -name '*.db.test.ts' ! -name 'app.routes.test.ts' | sort)) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice$n-compose-bundle-red.log"
bundle="$TMPDIR/evidence/slice$n-compose-red.js"
if bun build libs/wbs/application/core/src/compose.ts --target=bun --outfile="$bundle" >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
test -f "$bundle"
label=application.plan-commands
if count=$(grep -cF "$label" "$bundle"); then echo "$label count=$count"; else status=$?; test "$status" -eq 1; echo "$label count=0 (grep exit 1)"; fi
```

Expect `exit=0` in all four logs. Call the core pass count `C` and file count `F`, and the be-01
unit pass count `E` and file count `EF` (`app.routes.test.ts`'s tests are the planner's). Expect
`count=0 (grep exit 1)` in every slice that runs it (the label enters the bundle only in slice 3
step 3). Slice 3's green bundle reruns the same build with `-green` in place of `-red` in both file
names and expects `count=1`.

**The kinds substitute.** `tools/tool-devsync/src/service-kinds.test.ts` compares `kinds.json` to
`git ls-files`, which the planner's staging settles. Run this filesystem substitute instead:

```sh
python3 -c "import json,os;e=json.load(open('docs/code-organization/kinds.json'))['entries'];print(len(e),[x['path'] for x in e if not os.path.isfile(x['path'])])"
```

### Slice 1 — Seal Plan commands as a DI Bag feature module

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e libs/wbs/application/core/src/module/plan-commands && echo "gate: module absent"
test -f libs/wbs/application/core/src/module/work-item/check.ts && echo "gate: E8 landed"
c=libs/wbs/application/core/src
wc -l < "$c/service/plan-commands.ts"
wc -l < "$c/use-cases/run-command-batch.ts"
wc -l < "$c/service/command-bindings.ts"
grep -cF "export class AnnouncementCollector implements Broadcaster {" "$c/service/broadcast.ts"
grep -cF "new PlanCommandRunner(" "$c/compose.ts" || test $? -eq 1
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `393`, `31`, `545`, `1`, `0`, then a number: call it `K`
(observed `93`). (The `|| test $? -eq 1` follows one `grep` on a file step 0 already proved exists.)
Then run the shared baseline block with `n=1` (observed `C=619` over `F=67`, `E=520` over `EF=49`;
row 2). This slice ends at `C + 6` over `F + 1` (one `module.test.ts` of six tests; the moved tests
keep their 35) and at `E` over `EF`.

**Steps — tests first, then the implementation, in this one slice.**

1. `mkdir -p "$m"`, create `module.test.ts` from 10.1 verbatim, and run
   `bun test ./libs/wbs/application/core/src/module/plan-commands/module.test.ts`. Expect row 1.
   Save the log. This red is evidence, not a commit.
2. Move the code. From the repository root:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
m="$c/module/plan-commands"
cp "$c/service/plan-commands.ts" "$m/plan-commands.feature.ts"
cp "$c/use-cases/run-command-batch.ts" "$m/run-command-batch.ts"
cp "$c/service/command-bindings.ts" "$m/command-bindings.ts"
mv "$c/service/plan-commands.test.ts" "$m/plan-commands.test.ts"
mv "$c/service/plan-command-scope.test.ts" "$m/plan-command-scope.test.ts"
mv "$c/service/command-bindings.test.ts" "$m/command-bindings.test.ts"
```

Then apply 10.2's diff (import lines only, five files), and replace the three former paths' content
with 10.3's shims. The three `mv`s are **authorised deletions** of the old test paths: each test
must exist at exactly one path, and no file imports a test.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` in `$m` from 10.4 verbatim (no
   `Proof:` comments; no `module-index` block yet — slice 4 adds it). Run
   `bun test ./libs/wbs/application/core/src/module/plan-commands/` → row 3.
4. Apply 10.5's diff (`index.ts` gains two export lines; four `kinds.json` rows rewritten in place).
   Run `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → row 4.
5. Row 11, the gap: copy `$m/run-command-batch.ts` to `"$TMPDIR"`, prepend
   `import '../../service/auth.service';`, run the sideways suite → `1 pass`, restore with `cp`,
   prove with `cmp`. Save the patch and log. Then apply 10.6's diff (three rows and their
   paragraph) and rerun → row 15.
6. `wbs-core` and `wbs-be-01` lint and typecheck, under the status wrapper → exit 0. Only rule-17
   diagnostics (`simple-import-sort/*`, `prettier/prettier`) may be fixed with `bunx eslint --fix`
   on files this slice owns; anything else is a stop.
7. The negatives of section 6, **one at a time, each restored and `cmp`-proved before the next**:
   rows 5-10 against `bun test ./libs/wbs/application/core/src/module/plan-commands/module.test.ts`
   (for rows 8, 9 and 10 also run `wbs-core:typecheck` on the mutated tree and record its exit 0);
   rows 12-14 against the sideways suite, each fault alone on the restored file.
8. Only now apply 10.7's diff: the Proof comments in `module.ts`, `check.ts` and the sideways suite.
   Change the date only if yours differs, and change a fragment only if what you saw differs (then
   record the difference).
9. The kinds substitute → `93 []` (`K` unchanged, no row naming a missing file).
10. Closing checks, each under the status wrapper: `(cd libs/wbs/application/core && bun test src)`
    → exit 0, `C + 6` over `F + 1` (observed `625` over 68); the be-01 unit command → `E` over `EF`;
    `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; `bun test ./apps/wbs/be-01/src/service/clock.test.ts`
    → `4 pass`; `test "$(ls "$m" | wc -l)" -eq 11`;
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
11. Append to `openspec/changes/adopt-di-composition/verify.md` a `### Plan commands, Slice 1 — <date>`
    section: `base`, `K`, `C`/`F`, `E`/`EF`, rows 1-4 and 11, every fault of rows 5-10 and 12-14 with
    its fragment and evidence basenames, the kinds substitute, and one line: "The announcement
    collector stays in `service/broadcast.ts` as neutral shared support: Plan import builds one too
    (task 1.2); be-01's
    `mountedEndpoints` still constructs `PlanCommandRunner` directly (tracked under 7.4)". Prettier
    on it, then rerun the format check.
12. Hand-over: section 12's slice-1 modified and deleted paths must equal
    `git diff --name-only "$base"`, and its new paths `git ls-files --others --exclude-standard`.

Planner commit: `refactor(core): seal Plan commands as a DI Bag feature module`. The planner stages
with `git add -A` over exactly section 12's paths; Git's rename detection reports the three moved
tests as renames. The planner then runs `tool-devsync:test` whole on the commit (section 8).

### Slice 2 — Make the Working plan private to Plan commands

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/plan-commands/check.ts && echo "gate: slice 1 landed"
test ! -e libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts && echo "gate: working plan not moved"
c=libs/wbs/application/core/src
wc -l < "$c/service/working-plan.ts"
ls "$c/service" | grep -c '^working-plan'
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `629`, `9`, then `K` (observed `93`). Run the shared baseline
block with `n=2` (observed `C=625` over `F=68`, `E=520` over `EF=49`; `count=0`). This slice ends at
`C` over `F`, `E` over `EF` and `K - 5`.

1. Move the three tests first and apply 10.8's diff (their import lines):

```sh
set -euo pipefail
c=libs/wbs/application/core/src
m="$c/module/plan-commands"
mv "$c/service/working-plan.test.ts" "$m/working-plan.test.ts"
mv "$c/service/working-plan-directory.test.ts" "$m/working-plan-directory.test.ts"
mv "$c/service/working-plan.types.test.ts" "$m/working-plan.types.test.ts"
```

Run `bun test ./libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts ./libs/wbs/application/core/src/module/plan-commands/working-plan-directory.test.ts ./libs/wbs/application/core/src/module/plan-commands/working-plan.types.test.ts`
→ row 17. Save it. This red is evidence, not a commit.

2. Move the sources:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
m="$c/module/plan-commands"
cp "$c/service/working-plan.ts" "$m/working-plan.resource.ts"
for part in directory edges rows subtrees values; do mv "$c/service/working-plan-$part.ts" "$m/working-plan-$part.ts"; done
```

Replace `service/working-plan.ts`'s content with 10.9's shim, then apply 10.10's diff (import lines
only: the six moved sources and the feature's two lines). The five implementation `mv`s are
**authorised deletions**: nothing but `working-plan.ts` and the moved directory test imported them
(section 3). Run `bun test ./libs/wbs/application/core/src/module/plan-commands/` → row 18.

3. Apply 10.11's diff (`kinds.json`: one row rewritten, five removed; the README gains its Working
   plan paragraph). Run the kinds substitute → `88 []` (`K - 5`).
4. `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
5. Row 20, one fault, restored and `cmp`-proved: run `wbs-core:typecheck` on the mutated tree under
   the status wrapper and expect exit 1 with exactly the one `TS2578` of row 20. No Proof comment
   follows it: the witness's own Proof already names this fault, and the moved body may not change.
6. Closing checks, each under the status wrapper: core → `C` over `F` (observed `625` over 68);
   be-01 unit → `E` over `EF`; `wbs-core` and `wbs-be-01` lint and typecheck → exit 0;
   `test "$(ls "$m" | wc -l)" -eq 20`; `ls libs/wbs/application/core/src/service | grep -c '^working-plan'`
   prints `1`; the format check → exit 0.
7. Append `### Working plan, Slice 2 — <date>` to `verify.md`: `base`, `K` before and after, `C`/`F`,
   `E`/`EF`, rows 17-20 with fragments and evidence basenames, and the line: "The five Working plan
   implementation files keep no former path; `service/working-plan.ts` stays a shim for `@wbs/core`'s
   `createWorkingPlan` export, which one SQLite database test uses". Prettier on it, then the format
   check.
8. Hand-over as in slice 1, against section 12's slice-2 lists.

Planner commit: `refactor(core): make the Working plan private to the Plan commands module`. The
planner then runs `tool-devsync:test` (the five removed `kinds.json` rows) and the whole
`wbs-be-01:test` (section 8).

### Slice 3 — Install Plan commands once in `composeServices`

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts && echo "gate: slice 2 landed"
grep -cF "installPlanCommands" libs/wbs/application/core/src/compose.ts || test $? -eq 1
grep -c '^  const runner = new PlanCommandRunner({$' libs/wbs/application/core/src/compose.test.ts
```

Expect `base=…`, the two gate lines, `0`, `1` (the fixture's runner). Run the shared baseline block
with `n=3` (observed `C=625` over `F=68`, `E=520` over `EF=49`; `count=0`, row 2). This slice ends at
`C + 1` over `F` and at `E` over `EF`.

1. Apply 10.12's diff (`compose.test.ts`: the fixture's runner becomes `graph.commands`, and one new
   case). Run `bun test ./libs/wbs/application/core/src/compose.test.ts` and `wbs-core:typecheck`,
   each under the status wrapper → row 21. Save both. This red is evidence, not a commit.
2. Apply 10.13's diff (`compose.ts` installs Plan commands as `commands` on `CommonServices`; the
   README names the installation). Rerun `compose.test.ts` → row 23.
3. Rerun the bundle of the shared block with `-green` names → `count=1` (row 22).
4. `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
5. Row 26, restored and `cmp`-proved, against
   `bun test ./libs/wbs/application/core/src/compose.test.ts -t "installs Plan commands once"`
   (run with `-t`: row 25 shows why), and `wbs-core:typecheck` on the mutated tree → exit 0.
6. Only now apply 10.14's diff (the new case's Proof).
7. Closing checks, each under the status wrapper: core → `C + 1` over `F` (observed `626` over 68);
   be-01 unit → `E` over `EF`; `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; the format
   check → exit 0.
8. Append `### Plan commands installation, Slice 3 — <date>` to `verify.md`: `base`, `C`/`F`,
   `E`/`EF`, the red and green bundle counts, rows 21, 23 and 26 with fragments and evidence
   basenames, and the line: "`composeServices` installs Plan commands once as `commands`; be-01's
   `mountedEndpoints` does not read it yet and still constructs its own runner (tracked under 7.4)".
   Prettier on it, then the format check.
9. Hand-over as in slice 1, against section 12's slice-3 lists.

Planner commit: `refactor(core): install Plan commands once in composeServices`. The planner then
runs the whole `wbs-be-01:test` and the portable build (section 8).

### Slice 4 — Register Plan commands in the wiki content-review pilot and tick tasks 5.2 and 1.2

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- libs/wbs/application/core/src/compose.ts
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/plan-commands.ts
```

Expect `base=…`, the gate, a commit hash (slice 3's), `M` and `B` (observed `19` and `19`), then
exactly `100644 blob 720f5d37a03073e4445eeb40bf3b8d8bb0f6a03d	libs/core/src/service/plan-commands.ts`.
If that line is missing or differs, stop. Then, before any edit, each under the status wrapper:

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all. Call the pilot file's tests, failures and `expect()` calls `T`, `TF`, `P`
(observed `21`, `0`, `306`; the run takes about 300 seconds). The legacy pin passes (`1 pass`). Run
the OpenSpec validation standard block and call `passed` `N` (observed `114`).

**Registration, in the order it must be observed.** The pilot suite clones committed `HEAD` and
overlays only `pilotPaths` from the working tree (`pilot-policy.test.ts:30-57`); slices 1 to 3 are
committed, so the module's files are in `HEAD`, and its README there has no `module-index` block
yet. The filtered command is

```sh
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples")
```

(about 35 seconds).

1. Apply 10.15 (`modules.json`: one row, sorted). Run the filtered command → the PARITY red, row 27
   (`Expected: 19`, `Received: 20`). Save it.
2. Apply 10.16 (`policy.json`: one boundary appended last). Rerun → the DISCOVERED-INDEX red,
   row 28 (`Expected: true`, `Received: false`). Save it.
3. Apply 10.17's first two files — the diff blocks for `pilot-policy.test.ts` and the README (the
   `pilotPaths` entry, sorted; the README's `module-index` block, the `check.core.test` sentence and
   "Wiki registration"). They are one fenced block: apply it whole. Rerun → row 29 (`1 pass`). Save
   it.
4. Rerun the **whole** pilot file → row 30: `T` tests, `TF` failures, `P + 1` assertions. The
   prose-refusal pin does not move.
5. Rerun the legacy-pin test **with the pin unchanged** → red (row 31). Save it. Only then apply
   10.17's numbers block (`repo-namespacing-handoff.test.ts`), rerun → `1 pass` (row 32), and then
   apply 10.18 (the Proof comment). No other pinned literal in that file may move; if one does,
   stop. If the observed digest differs from row 31's, stop: the tree differs from the rehearsal.
6. Apply 10.19 (`tasks.md`: 1.2 and 5.2 reworded to the collector decision and **ticked** with
   dated notes; 7.5's running note extended).
7. Rerun step 0's run-many typecheck, `twilight-burokrat:lint:source` and `tool-devsync:lint` →
   exit 0; rerun the legacy-pin test alone → `1 pass`. Do **not** run
   `repo-namespacing-handoff.test.ts` whole: its `production index checker resolves current
Markdown links` test spawns `check-indexes working`, which writes Git objects, so the whole file
   is planner-only (section 8). The OpenSpec block → `passed` `N`, `failed` `0`.
8. Append `### Plan commands registration, Slice 4 — <date>` to `verify.md`: `base`, `M`, `B`, the
   frozen tuple, rows 27-29 with evidence basenames, `T`/`TF`/`P` before and after, rows 31 and 32,
   the three checks, `N`. Prettier on it, then `GSETTINGS_BACKEND=memory bunx nx format:check --all`
   → exit 0.
9. Hand-over as in slice 1, against section 12's slice-4 lists.

Planner commit: `docs(core): register the Plan commands module in the wiki content-review pilot and tick tasks 5.2 and 1.2`.

**Planner-only, after this commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 4 commit>`
is **index validation** (`checkIndexes`), not the `MOD-LAYOUT` rule. Rehearsed against the
throwaway slice-4 commit: exit 0, 24 indexes, `module.application.plan-commands` with 19 members
and `applicableChecks` `["check.core.test"]`; `reviewDebt` empty.

## 8. Planner-only checks

| Check                                                                                                                                                                             | Why the planner's                                                                                      | Observed on the rehearsed tree                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Moved-code identity: copy the `$base` versions of every moved file to scratch, apply 10.2, 10.8 and 10.10 to them, and `cmp` with the committed module files                      | Proves the moved bodies and tests differ only in import lines                                          | section 15's script does the same; all equal                                                                                    |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged                                                      | Writes Git objects; `service-kinds.test.ts` needs the staged tree (slices 1 and 2 change `kinds.json`) | slice 4 rehearsal commit: `366` tests over 25 files, exit 0 (slices 1-3 **not run** separately)                                 |
| `(cd apps/wbs/be-01 && bun test)` (the whole `wbs-be-01:test` command, without coverage)                                                                                          | Opens SQLite databases and spawns processes; three be-01 database tests construct `PlanCommandRunner`  | `1097 pass`, `1 skip`, `0 fail` over 92 files on the slice-4 rehearsal commit                                                   |
| `bun test ./apps/wbs/be-01/src/app.routes.test.ts`                                                                                                                                | Its health-route framing test listens on a TCP port                                                    | covered by the whole-target row above                                                                                           |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`, then `grep -cF 'application.plan-commands"'` over `dist/libs/wbs/application/core/portable-composition.js` | The portable bundle composes `composeServices` in the browser build; `test:portable` needs Playwright  | build exit 0; `count=1`. `wbs-core:test:portable` itself **not run** (no browser here)                                          |
| `libs/wbs/adapters/store-sqlite` database tests (`working-plan-order.db.test.ts`, `working-plan-performance.test.ts`, `write-coordinator.db.test.ts`)                             | Build `PlanCommandRunner` and `createWorkingPlan` from `@wbs/core` over SQLite                         | **not run** separately; they resolve through the barrel and the shims, which slices 1-2 keep                                    |
| `check-indexes committed` on slice 4                                                                                                                                              | Index validation, not MOD-LAYOUT                                                                       | 24 indexes, the new module with 19 members, no review debt                                                                      |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test` and `:test:package`                                                                                                          | Whole listener suite; package suite listens                                                            | **not run** (only the pilot file was run)                                                                                       |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the whole file                                                                                              | Its `production index checker resolves current Markdown links` test spawns `check-indexes working`     | the executor runs only `-t "every legacy source occurrence"`; the whole file ran green inside the `tool-devsync:test` row above |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                        | Host-wide heavy lock                                                                                   | **not run**                                                                                                                     |

This table supplements the batch-1 README's "Integration verification" matrix.

**Between slices 1 and 4** the new module directory holds a `.feature.ts` file and a README with no
`module-index` block, which the Burokrat rule model's `MOD-LAYOUT` observation reports as "module
directory declares no wiki index", as for E5-E8; slice 4 closes it. The block is withheld on
purpose: with it in `HEAD`, slice 4's DISCOVERED-INDEX red could not be observed.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What the next 040.6 packets should be

1. **Resolved 2026-09-24 (planner decision): the announcement collector is neutral shared
   support.** `AnnouncementCollector` stays in `service/broadcast.ts` beside the neutral
   `ProjectEvent`/`Broadcaster` port it collects — K4 support over the neutral port — and both Plan
   commands and Plan import import it; `ports/event-port-boundaries.test.ts` keeps pinning it there.
   Why not private: a private owner would make the other admitting feature import a sibling feature
   (K6), and a copy would be a second class definition, which the map forbids. The backend module
   map's "Plan commands' private collector" was wrong because it did not see Plan import's use.
   Slice 1 corrects `kinds.json` and the contract's K disclosure; slice 4 rewords and ticks 1.2 and
   5.2.
2. **Delivery reads the composed `commands` (task 7.4).** be-01's `mountedEndpoints` stops
   constructing `PlanCommandRunner` and takes `services.commands` through `AppOptions.writes`; every
   `testWrites()` caller then needs a runner in its fixture, which is why it is its own change.
3. **Optimization (task 3.6)** and **Supervisor (4.2)**, the backend's last modules, after 1.5.
4. **Domain moves (task 6.1)** for `plan-command.ts` and `directory-usage.ts`, which Plan commands
   still imports from `service/`.

## 10. Exact content

`c` below is `libs/wbs/application/core/src` and `m` is `c/module/plan-commands`. Listings are
complete file contents; diffs apply with `git apply` from the repository root.

### 10.1 `m/module.test.ts` (slice 1 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Scope } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanCommands } from './check';
import { PLAN_COMMANDS_LABEL } from './contract';
import { planCommandsModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/**
 * One memory source holding one project, and the four requirements a command
 * batch needs. `handed` records every broadcaster the runner gives a batch's
 * graph, which is how the per-batch collector is observed from outside.
 */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  let next = 0;
  const clock = clockOf({ now: () => 2, newId: () => `item-${String(++next)}` });
  const graphOver = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
    servicesOver(stores, { clock, broadcast, scheduler: fastScheduler });
  const announcements = recordingBroadcaster();
  const handed: Broadcaster[] = [];
  return {
    announcements,
    handed,
    requirements: {
      batchServices: (scope: Scope, broadcast: Broadcaster) => {
        handed.push(broadcast);
        return graphOver(scope.stores, broadcast);
      },
      publicServices: graphOver(source.stores, recordingBroadcaster()),
      uow: source.uow,
      announcements,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  const clock = clockOf({ now: () => 0, newId: () => 'unused' });
  const graphOver = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
    servicesOver(stores, { clock, broadcast, scheduler: fastScheduler });
  return {
    batchServices: DiBag.fromSyncFactory(
      () => (scope: Scope, broadcast: Broadcaster) => graphOver(scope.stores, broadcast),
    ),
    publicServices: DiBag.fromSyncFactory(() => graphOver(source.stores, recordingBroadcaster())),
    uow: DiBag.fromSyncFactory(() => source.uow),
  };
};

/**
 * A complete host graph.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(planCommandsModule)
    .register({
      ...hostRequirements(),
      announcements: DiBag.fromSyncFactory(() => recordingBroadcaster()),
    })
    .build();

describe('the Plan commands module', () => {
  it('drains a committed batch into the broadcaster installPlanCommands wires', async () => {
    const { announcements, requirements } = await seeded();
    const { commands } = installPlanCommands(requirements);

    const outcome = await commands.run(PROJECT, OWNER, [
      { kind: 'createTeam', ref: 'team', name: 'Platform' },
      { kind: 'setCapacity', teamRef: 'team', size: 2 },
    ]);

    expect(outcome).toMatchObject({ ok: true });
    expect(announcements.published).toEqual([
      { projectId: PROJECT, event: { type: 'capacity_changed' } },
    ]);
  });

  /**
   * The per-admission half of the module: the runner is installed once, and
   * every batch it runs is handed a collector of its own — never the direct
   * broadcaster, and never the previous batch's.
   */
  it('hands every batch its own collector, never the direct broadcaster', async () => {
    const { announcements, handed, requirements } = await seeded();
    const { commands } = installPlanCommands(requirements);

    await commands.run(PROJECT, OWNER, []);
    await commands.run(PROJECT, OWNER, []);

    expect(handed).toHaveLength(2);
    expect(handed[0]).not.toBe(handed[1]);
    expect(handed.some((broadcast) => broadcast === announcements)).toBe(false);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `PlanCommandsExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installPlanCommands(requirements);

    expect(Object.keys(exposed)).toEqual(['commands']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('planCommandOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "planCommandOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PLAN_COMMANDS_LABEL}/planCommandOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(planCommandsModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('commands')).toThrow(
      `Cannot resolve "${PLAN_COMMANDS_LABEL}/planCommandOptions": dependency "announcements" is not registered. Resolution path: commands -> ${PLAN_COMMANDS_LABEL}/planCommandOptions -> announcements.`,
    );
  });
});
```

### 10.2 Import lines of the five moved slice-1 files (slice 1 step 2 — applied after the `cp`/`mv`)

`m/command-bindings.test.ts` needs no edit: it imports only `./command-bindings`.

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/command-bindings.ts b/libs/wbs/application/core/src/module/plan-commands/command-bindings.ts
--- a/libs/wbs/application/core/src/module/plan-commands/command-bindings.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/command-bindings.ts
@@ -1,7 +1,7 @@
 import type { PlanCommandKind } from '@wbs/contracts';
 import { commandDefinitions } from '@wbs/contracts';

-import type { PlanCommand } from './plan-command';
+import type { PlanCommand } from '../../service/plan-command';
 import type {
   AppliedBase,
   AppliedCommand,
@@ -9,7 +9,7 @@ import type {
   PlanCommandServices,
   Refusal,
   ServiceRefusal,
-} from './plan-commands';
+} from './plan-commands.feature';

 export type CommandFor<K extends PlanCommandKind> = PlanCommand & { kind: K };
 export type AppliedFor<K extends PlanCommandKind> = AppliedCommand & { kind: K };
diff --git a/libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts b/libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts
--- a/libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts
@@ -1,9 +1,9 @@
 import { describe, expect, it } from 'bun:test';

-import type { Broadcaster } from '../ports/project-event';
-import type { PlanTransactionalStores } from '../ports/stores';
-import type { Decision, Scope, UnitOfWork } from '../ports/unit-of-work';
-import { PlanCommandRunner, type PlanCommandServices } from './plan-commands';
+import type { Broadcaster } from '../../ports/project-event';
+import type { PlanTransactionalStores } from '../../ports/stores';
+import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
+import { PlanCommandRunner, type PlanCommandServices } from './plan-commands.feature';

 interface JournalEntry {
   id: string;
diff --git a/libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts b/libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts
--- a/libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts
@@ -1,16 +1,16 @@
 import { openMemorySource } from '@wbs/store-memory';
 import { describe, expect, it } from 'bun:test';

-import { servicesOver } from '../compose';
-import { clockOf } from '../ports/clock';
-import type { Broadcaster } from '../ports/project-event';
-import type { PlanTransactionalStores } from '../ports/stores';
-import type { Decision, Scope, UnitOfWork } from '../ports/unit-of-work';
-import { testClock } from '../testing/clock-fixture';
-import { fastScheduler } from '../testing/scheduler-fixture';
-import { workItemRow } from '../testing/work-item-fixture';
-import type { PlanCommand } from './plan-command';
-import { PlanCommandRunner } from './plan-commands';
+import { servicesOver } from '../../compose';
+import { clockOf } from '../../ports/clock';
+import type { Broadcaster } from '../../ports/project-event';
+import type { PlanTransactionalStores } from '../../ports/stores';
+import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
+import type { PlanCommand } from '../../service/plan-command';
+import { testClock } from '../../testing/clock-fixture';
+import { fastScheduler } from '../../testing/scheduler-fixture';
+import { workItemRow } from '../../testing/work-item-fixture';
+import { PlanCommandRunner } from './plan-commands.feature';

 const OWNER = 'plan-command-owner';

diff --git a/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts b/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
--- a/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
@@ -5,25 +5,25 @@ import type {
   PersonWithTeams,
   ServiceTeam,
   TeamWithServices,
-} from '../ports/directory-store';
-import type { Broadcaster } from '../ports/project-event';
-import type { Decision, Scope, UnitOfWork } from '../ports/unit-of-work';
-import type { Service, Tag, WorkItemType } from '../ports/work-item-store';
-import { AnnouncementCollector } from './broadcast';
-import type { CapacityService } from './capacity.service';
-import { applyCommand, bindCommands, CommandContext, CommandRefused } from './command-bindings';
+} from '../../ports/directory-store';
+import type { Broadcaster } from '../../ports/project-event';
+import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
+import type { Service, Tag, WorkItemType } from '../../ports/work-item-store';
+import { AnnouncementCollector } from '../../service/broadcast';
+import type { CapacityService } from '../../service/capacity.service';
 import type {
   DirectoryOutcome,
   DirectoryRefusal,
   RemoveDirectoryOutcome,
-} from './directory.service';
-import type { DirectoryService } from './directory.service';
-import type { DirectoryUsage } from './directory-usage';
-import { MOST_COMMANDS_IN_A_BATCH, type PlanCommand } from './plan-command';
-import type { PriorityBandService } from './priority-band.service';
-import type { WorkItemRefusal } from './work-item.service';
-import type { Collected, UndoOutcome, WorkItemService } from './work-item.service';
-import { createWorkingPlan } from './working-plan';
+} from '../../service/directory.service';
+import type { DirectoryService } from '../../service/directory.service';
+import type { DirectoryUsage } from '../../service/directory-usage';
+import { MOST_COMMANDS_IN_A_BATCH, type PlanCommand } from '../../service/plan-command';
+import type { PriorityBandService } from '../../service/priority-band.service';
+import type { WorkItemRefusal } from '../../service/work-item.service';
+import type { Collected, UndoOutcome, WorkItemService } from '../../service/work-item.service';
+import { createWorkingPlan } from '../../service/working-plan';
+import { applyCommand, bindCommands, CommandContext, CommandRefused } from './command-bindings';

 /** The four services a command batch can invoke. */
 export interface PlanCommandServices {
diff --git a/libs/wbs/application/core/src/module/plan-commands/run-command-batch.ts b/libs/wbs/application/core/src/module/plan-commands/run-command-batch.ts
--- a/libs/wbs/application/core/src/module/plan-commands/run-command-batch.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/run-command-batch.ts
@@ -1,7 +1,7 @@
 import type { AuthenticatedUser } from '@wbs/contracts';

-import type { PlanCommand } from '../service/plan-command';
-import type { BatchOutcome, PlanCommandRunner } from '../service/plan-commands';
+import type { PlanCommand } from '../../service/plan-command';
+import type { BatchOutcome, PlanCommandRunner } from './plan-commands.feature';

 export interface RunCommandBatchGraph {
   run(projectId: string, actorId: string, commands: readonly PlanCommand[]): Promise<BatchOutcome>;
```

### 10.3 The three compatibility shims (slice 1 step 2 — full replacement content)

`c/service/plan-commands.ts`:

```ts
/**
 * Compatibility re-export: Plan commands moved into its own sealed module.
 *
 * Kept because `http/work-item.routes.ts`, `testing/writes-fixture.ts`,
 * `compose.test.ts`, `use-cases/admission.test.ts`,
 * `libs/wbs/application/core/testing/portable-composition.ts`, `@wbs/core`'s
 * barrel and be-01's own deep-import shim name this path. It goes when every
 * importer names the module.
 */
export * from '../module/plan-commands/plan-commands.feature';
```

`c/use-cases/run-command-batch.ts`:

```ts
/**
 * Compatibility re-export: the run-command-batch use case moved into the Plan commands module.
 *
 * Kept because `http/work-item.routes.ts`, `use-cases/admission.test.ts` and
 * `libs/wbs/application/core/testing/portable-composition.ts` import this relative
 * path directly and `@wbs/core`'s barrel still deep-imports it. It goes when every
 * importer names the module.
 */
export * from '../module/plan-commands/run-command-batch';
```

`c/service/command-bindings.ts`:

```ts
/**
 * Compatibility re-export: the command bindings moved into the Plan commands module.
 *
 * Kept because `@wbs/core`'s barrel still deep-imports this path and
 * `service/service-boundaries.test.ts` lists it. It goes when neither does.
 */
export * from '../module/plan-commands/command-bindings';
```

### 10.4 Plan commands' `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type { PlanCommandRunner, PlanCommandRunnerOptions } from './plan-commands.feature';

/**
 * What a host must supply to install {@link planCommandsModule}.
 *
 * Exactly {@link PlanCommandRunnerOptions}, unchanged by the move: the
 * per-batch service factory, the public graph used after a batch settles, the
 * unit of work and the direct broadcaster a batch's collected announcements
 * drain into. The runner is installed once for the process; what is per
 * admitted batch — its scope, its announcement collector, its Working plan and
 * the graph built over them — it creates inside every `run`, `runDirectory`,
 * `undo` and `redo`, so no installation holds one.
 *
 * **No K6 debt; K4 support over the neutral port; K2 and composition debt disclosed.**
 * The feature imports no other feature. It names the Work item, Directory,
 * Capacity and Priority band resource classes through their `service/`
 * compatibility paths rather than through their modules' contracts, and reads
 * no repository port itself: the admitted scope's stores reach it only through
 * its private Working plan. Delivery is not closed: be-01's `mountedEndpoints`
 * still constructs `PlanCommandRunner` with `new` — the backend module map's
 * "Move construction to composition" hazard — and `http/work-item.routes.ts`
 * takes `WorkItemService` beside the runner; tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`. The per-batch
 * `AnnouncementCollector` is neutral shared support, not this module's: it
 * stays in `service/broadcast.ts` beside the neutral `Broadcaster` port it
 * collects, and Plan import imports it too. The backend module map's "Plan
 * commands' private collector" did not see that second use; a private owner
 * would make Plan import import a sibling feature (K6), and a copy would be a
 * second class definition (task 1.2).
 */
export type PlanCommandsRequirements = PlanCommandRunnerOptions;

/** What installing {@link planCommandsModule} adds to a host graph. */
export interface PlanCommandsExports {
  readonly commands: PlanCommandRunner;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.plan-commands` and the label drops
 * the `module.` prefix.
 */
export const PLAN_COMMANDS_LABEL = 'application.plan-commands';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { Broadcaster } from '../../ports/project-event';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { PLAN_COMMANDS_LABEL } from './contract';
import {
  PlanCommandRunner,
  type PlanCommandRunnerOptions,
  type PlanCommandServices,
} from './plan-commands.feature';

/**
 * Plan commands as a sealed DI Bag module.
 *
 * Only `commands` is exported. `planCommandOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.plan-commands/planCommandOptions` rather than
 * against an anonymous binding.
 *
 * The module registers no disposer: `PlanCommandRunner` holds a factory, a
 * borrowed graph, the source's unit of work and a broadcaster, and no handle
 * of its own. Every batch's collector and Working plan are made and dropped
 * inside that batch.
 */
export const planCommandsModule = DiBag.createBuilder()
  .register({
    planCommandOptions: DiBag.fromSyncFactory(
      ({
        batchServices,
        publicServices,
        uow,
        announcements,
      }: {
        batchServices: PlanCommandRunnerOptions['batchServices'];
        publicServices: PlanCommandServices;
        uow: UnitOfWork;
        announcements: Broadcaster;
      }): PlanCommandRunnerOptions => ({
        batchServices,
        publicServices,
        uow,
        announcements,
      }),
    ),
  })
  .register({
    commands: DiBag.fromSyncFactory(
      ({
        planCommandOptions,
      }: {
        planCommandOptions: PlanCommandRunnerOptions;
      }): PlanCommandRunner => new PlanCommandRunner(planCommandOptions),
    ),
  })
  .buildModule(['commands'], { label: PLAN_COMMANDS_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { PlanCommandsExports, PlanCommandsRequirements } from './contract';
import { planCommandsModule } from './module';

/**
 * Installs {@link planCommandsModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan commands can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanCommandsExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanCommands(requirements: PlanCommandsRequirements): PlanCommandsExports {
  const bag = DiBag.createBuilder()
    .installModule(planCommandsModule)
    .register({
      batchServices: DiBag.fromSyncFactory(() => requirements.batchServices),
      publicServices: DiBag.fromSyncFactory(() => requirements.publicServices),
      uow: DiBag.fromSyncFactory(() => requirements.uow),
      announcements: DiBag.fromSyncFactory(() => requirements.announcements),
    })
    .build();
  return { commands: bag.resolve('commands') };
}
```

`README.md` (slices 2, 3 and 4 edit it):

```md
# Plan commands

A sealed feature module installed once per composition, whose per-batch parts are made inside every
batch: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the per-batch service factory, the public graph, the unit of work and the
direct broadcaster a host must supply.

`plan-commands.feature.ts` (the moved `service/plan-commands.ts`) applies one command batch, or one
undo or redo, as a single unit of work over a service graph built for that batch alone, holds the
batch's announcements in a collector of its own until the commit has let go of its turn, and drops
them with a rollback. `run-command-batch.ts` (the moved `use-cases/run-command-batch.ts`) is its use
case: it refuses an actor without the `write` scope before a batch is admitted. `command-bindings.ts`
(the moved `service/command-bindings.ts`) is private support: the kind-indexed table that dispatches
each command to the service it belongs to. Private bindings are named under the
`application.plan-commands` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/index.ts` exports the module;
`libs/wbs/application/core/src/service/plan-commands.ts`,
`libs/wbs/application/core/src/service/command-bindings.ts` and
`libs/wbs/application/core/src/use-cases/run-command-batch.ts` keep the former paths for
`http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.5 `index.ts` and `kinds.json` (slice 1 step 4)

```diff
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -26,6 +26,8 @@ export * from './module/capacity/contract';
 export * from './module/capacity/module';
 export * from './module/directory/contract';
 export * from './module/directory/module';
+export * from './module/plan-commands/contract';
+export * from './module/plan-commands/module';
 export * from './module/plan-document/contract';
 export * from './module/plan-document/module';
 export * from './module/plan-history/contract';
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -241,8 +241,8 @@
     {
       "path": "libs/wbs/application/core/src/service/broadcast.ts",
       "kind": "support",
-      "disposition": "Plan commands' batch announcement collector; move it there with task 5.2",
-      "rationale": "import.service.ts and plan-commands.ts collect announcements through it, and the event contracts it re-exports for compatibility now live in ports/project-event.ts"
+      "disposition": "neutral shared support: the per-admission announcement collector over the neutral project-event port, imported by Plan commands and Plan import",
+      "rationale": "the Plan commands and Plan import features each build one AnnouncementCollector per admitted act over the Broadcaster port of ports/project-event.ts, so a private owner would give the other a feature-to-feature edge; the event contracts it re-exports for compatibility live in that port"
     },
     {
       "path": "libs/wbs/application/core/src/service/calendar-marker.service.ts",
@@ -263,8 +263,7 @@
     {
       "path": "libs/wbs/application/core/src/service/command-bindings.ts",
       "kind": "support",
-      "disposition": "private member of plan-commands.ts",
-      "rationale": "plan-commands.ts is its only production importer and uses its bindings and command context to dispatch the batch runner's admitted service graph"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-commands module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/command-normalizers.ts",
@@ -335,9 +334,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/plan-commands.ts",
-      "kind": "feature",
-      "capability": "wbs-domain",
-      "rationale": "run-command-batch and work-item routes call it to own UnitOfWork and coordinate directory, capacity, priority-band and work-item services for one admitted command batch, the user-facing batch behaviour specified by the archived 2026-08-30-plan-commands requirement group"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-commands module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/plan-document.ts",
@@ -488,9 +486,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/use-cases/run-command-batch.ts",
-      "kind": "feature",
-      "capability": "wbs-domain",
-      "rationale": "workItemRoutes and the portable composition call it to enforce write-scope admission before coordinating project or directory command batches through PlanCommandRunner for the same archived 2026-08-30-plan-commands requirement group"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-commands module directly"
     },
     {
       "path": "libs/wbs/application/core/src/use-cases/save-plan.ts",
```

### 10.6 The three sideways rows (slice 1 step 5 — after row 11 was observed)

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -167,6 +167,15 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * reaches module/calendar-marker/calendar-marker.resource.ts"` (0 pass, 1 fail); with this
  * row deleted the same two lines left the suite passing (1 pass), and before the move they
  * were reported against `service/calendar-marker.service.ts`.
+ *
+ * The twentieth through twenty-second rows are the first three rules
+ * re-scoped to the Plan commands module's own directory once
+ * `run-command-batch.ts` moved out of `use-cases/` and stopped being covered
+ * by the first two rows' `path.startsWith('use-cases/')`: the module's own use
+ * case takes its principal type from `@wbs/contracts`, never from
+ * Authentication or the HTTP endpoint, and `plan-commands.feature.ts` never
+ * did either. The Authentication row is spelt twice, once for the
+ * compatibility shim and once for the module's real path, as for Saved plans.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -239,6 +248,18 @@ const routes = [
     reaches: 'module/calendar-marker/calendar-marker.resource.ts',
     from: (path: string) => path.startsWith('module/plan-document/'),
   },
+  {
+    reaches: 'service/auth.service.ts',
+    from: (path: string) => path.startsWith('module/plan-commands/'),
+  },
+  {
+    reaches: 'module/authentication/authentication.feature.ts',
+    from: (path: string) => path.startsWith('module/plan-commands/'),
+  },
+  {
+    reaches: 'http/endpoint.ts',
+    from: (path: string) => path.startsWith('module/plan-commands/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.7 Slice 1's Proof comments (slice 1 step 8 — only after rows 5-14 were observed)

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/check.ts b/libs/wbs/application/core/src/module/plan-commands/check.ts
--- a/libs/wbs/application/core/src/module/plan-commands/check.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/check.ts
@@ -23,5 +23,11 @@ export function installPlanCommands(requirements: PlanCommandsRequirements): Pla
       announcements: DiBag.fromSyncFactory(() => requirements.announcements),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (5 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `PlanCommandRunner` kept the key list
+  // correct but made the no-resolver assertion receive false (5 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { commands: bag.resolve('commands') };
 }
diff --git a/libs/wbs/application/core/src/module/plan-commands/module.ts b/libs/wbs/application/core/src/module/plan-commands/module.ts
--- a/libs/wbs/application/core/src/module/plan-commands/module.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/module.ts
@@ -37,9 +37,17 @@ export const planCommandsModule = DiBag.createBuilder()
         uow: UnitOfWork;
         announcements: Broadcaster;
       }): PlanCommandRunnerOptions => ({
+        // Proof (2026-09-24): handing the runner
+        // `(scope) => batchServices(scope, announcements)` instead of the supplied factory left
+        // `hands every batch its own collector, never the direct broadcaster` failing (5 pass,
+        // 1 fail): both batches received the one direct broadcaster.
         batchServices,
         publicServices,
         uow,
+        // Proof (2026-09-24): handing the runner
+        // `{ ...announcements, publish: () => Promise.resolve() }` instead of the supplied
+        // broadcaster left `drains a committed batch into the broadcaster installPlanCommands
+        // wires` failing (5 pass, 1 fail): it received `[]`.
         announcements,
       }),
     ),
@@ -53,4 +61,12 @@ export const planCommandsModule = DiBag.createBuilder()
       }): PlanCommandRunner => new PlanCommandRunner(planCommandOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['commands', 'planCommandOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (3 pass, 3 fail):
+  // `resolve('planCommandOptions')` did not throw, `inspectGraph()` reported bare
+  // `planCommandOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: PLAN_COMMANDS_LABEL }` left only the two label
+  // assertions failing (4 pass, 2 fail): `inspectGraph()` reported `planCommandOptions`
+  // unlabelled, and the missing-requirement message named `planCommandOptions` instead of
+  // `application.plan-commands/planCommandOptions`.
   .buildModule(['commands'], { label: PLAN_COMMANDS_LABEL });
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -176,6 +176,20 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * Authentication or the HTTP endpoint, and `plan-commands.feature.ts` never
  * did either. The Authentication row is spelt twice, once for the
  * compatibility shim and once for the module's real path, as for Saved plans.
+ *
+ * Proof (2026-09-24): with the move made and these three rows absent, prepending the bare
+ * import `import '../../service/auth.service';` to `module/plan-commands/run-command-batch.ts`
+ * left this suite passing (1 pass). With the rows, the same import failed it with exactly one
+ * violation, `"module/plan-commands/run-command-batch.ts: '../../service/auth.service' reaches
+ * service/auth.service.ts"` (0 pass, 1 fail).
+ * Proof (2026-09-24): independently prepending
+ * `import '../authentication/authentication.feature';` to the same file failed this suite
+ * with exactly one violation, `"module/plan-commands/run-command-batch.ts:
+ * '../authentication/authentication.feature' reaches
+ * module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
+ * Proof (2026-09-24): independently prepending `import '../../http/endpoint';` to the same
+ * file failed this suite with exactly one violation, `"module/plan-commands/run-command-batch.ts:
+ * '../../http/endpoint' reaches http/endpoint.ts"` (0 pass, 1 fail).
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
```

### 10.8 Import lines of the three moved Working plan tests (slice 2 step 1)

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.test.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.test.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.test.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.test.ts
@@ -2,8 +2,8 @@
 import { openMemorySource } from '@wbs/store-memory';
 import { describe, expect, it } from 'bun:test';

-import type { DirectoryStore } from '../ports/directory-store';
-import type { WriteStamp } from '../ports/write-stamp';
+import type { DirectoryStore } from '../../ports/directory-store';
+import type { WriteStamp } from '../../ports/write-stamp';
 import { createWorkingPlanDirectory } from './working-plan-directory';

 const STAMP: WriteStamp = { at: 1, by: 'directory-wrapper-owner' };
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts
@@ -1,14 +1,14 @@
 import { openMemorySource } from '@wbs/store-memory';
 import { describe, expect, it } from 'bun:test';

-import { servicesOver } from '../compose';
-import type { Broadcaster } from '../ports/project-event';
-import type { PlanTransactionalStores } from '../ports/stores';
-import { testClock } from '../testing/clock-fixture';
-import { fastScheduler } from '../testing/scheduler-fixture';
-import { workItemRow } from '../testing/work-item-fixture';
-import { PlanCommandRunner } from './plan-commands';
-import { createWorkingPlan } from './working-plan';
+import { servicesOver } from '../../compose';
+import type { Broadcaster } from '../../ports/project-event';
+import type { PlanTransactionalStores } from '../../ports/stores';
+import { testClock } from '../../testing/clock-fixture';
+import { fastScheduler } from '../../testing/scheduler-fixture';
+import { workItemRow } from '../../testing/work-item-fixture';
+import { PlanCommandRunner } from './plan-commands.feature';
+import { createWorkingPlan } from './working-plan.resource';

 const OWNER = 'working-plan-owner';
 const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 } as const;
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan.types.test.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan.types.test.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan.types.test.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan.types.test.ts
@@ -1,5 +1,5 @@
-import type { Scope } from '../ports/unit-of-work';
-import { createWorkingPlan } from './working-plan';
+import type { Scope } from '../../ports/unit-of-work';
+import { createWorkingPlan } from './working-plan.resource';

 /** Compile-time witness that a plan-only scope is sufficient and remains accountless. */
 export function workingPlanOver(accountlessScope: Scope) {
```

### 10.9 The Working plan shim (slice 2 step 2 — full replacement content of `c/service/working-plan.ts`)

```ts
/**
 * Compatibility re-export: Working plan moved into the Plan commands module, private to it.
 *
 * Kept because `@wbs/core`'s barrel still exports `createWorkingPlan`, which
 * `libs/wbs/adapters/store-sqlite/src/working-plan-order.db.test.ts` builds over a real SQLite
 * source. It goes when that test reaches Working plan through Plan commands.
 */
export * from '../module/plan-commands/working-plan.resource';
```

### 10.10 Import lines of the moved Working plan sources and the feature (slice 2 step 2)

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts b/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
--- a/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
@@ -22,8 +22,8 @@ import { MOST_COMMANDS_IN_A_BATCH, type PlanCommand } from '../../service/plan-c
 import type { PriorityBandService } from '../../service/priority-band.service';
 import type { WorkItemRefusal } from '../../service/work-item.service';
 import type { Collected, UndoOutcome, WorkItemService } from '../../service/work-item.service';
-import { createWorkingPlan } from '../../service/working-plan';
 import { applyCommand, bindCommands, CommandContext, CommandRefused } from './command-bindings';
+import { createWorkingPlan } from './working-plan.resource';

 /** The four services a command batch can invoke. */
 export interface PlanCommandServices {
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan-directory.ts
@@ -1,4 +1,4 @@
-import type { DirectoryStore } from '../ports/directory-store';
+import type { DirectoryStore } from '../../ports/directory-store';

 /**
  * Builds the directory part of a batch-owned working plan.
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan-edges.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan-edges.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan-edges.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan-edges.ts
@@ -1,4 +1,4 @@
-import type { DependencyStore } from '../ports/dependency-store';
+import type { DependencyStore } from '../../ports/dependency-store';

 interface RetainedDependencyReads {
   all(projectId: string): ReturnType<DependencyStore['listByProject']>;
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan-rows.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan-rows.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan-rows.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan-rows.ts
@@ -1,4 +1,4 @@
-import type { WorkItemStore } from '../ports/work-item-store';
+import type { WorkItemStore } from '../../ports/work-item-store';

 interface RetainedWorkItemReads {
   all(): ReturnType<WorkItemStore['listByProject']>;
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan-subtrees.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan-subtrees.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan-subtrees.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan-subtrees.ts
@@ -1,5 +1,5 @@
-import type { SubtreeStore } from '../ports/subtree-store';
-import type { WorkItemStore } from '../ports/work-item-store';
+import type { SubtreeStore } from '../../ports/subtree-store';
+import type { WorkItemStore } from '../../ports/work-item-store';

 interface RetainedSubtreeReads {
   byIds(ids: readonly string[]): ReturnType<WorkItemStore['listByIds']>;
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan-values.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan-values.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan-values.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan-values.ts
@@ -1,5 +1,5 @@
-import type { StepWriteOutcome } from '../ports/estimate-store';
-import type { WriteStamp } from '../ports/write-stamp';
+import type { StepWriteOutcome } from '../../ports/estimate-store';
+import type { WriteStamp } from '../../ports/write-stamp';

 interface StoredValue {
   readonly workItemId: string;
diff --git a/libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts b/libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts
--- a/libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts
@@ -1,11 +1,11 @@
-import type { ActualStore } from '../ports/actual-store';
-import type { DependencyStore } from '../ports/dependency-store';
-import type { EstimateStore } from '../ports/estimate-store';
-import type { MeasureStore } from '../ports/measure-store';
-import type { StepProgressStore } from '../ports/progress-store';
-import type { PlanTransactionalStores } from '../ports/stores';
-import type { Scope } from '../ports/unit-of-work';
-import type { LabelledWorkItem } from '../ports/work-item-store';
+import type { ActualStore } from '../../ports/actual-store';
+import type { DependencyStore } from '../../ports/dependency-store';
+import type { EstimateStore } from '../../ports/estimate-store';
+import type { MeasureStore } from '../../ports/measure-store';
+import type { StepProgressStore } from '../../ports/progress-store';
+import type { PlanTransactionalStores } from '../../ports/stores';
+import type { Scope } from '../../ports/unit-of-work';
+import type { LabelledWorkItem } from '../../ports/work-item-store';
 import { createWorkingPlanDirectory } from './working-plan-directory';
 import { createWorkingPlanEdges } from './working-plan-edges';
 import { createWorkingPlanRows } from './working-plan-rows';
```

### 10.11 `kinds.json` and the README (slice 2 step 3)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -438,41 +438,10 @@
       "kind": "support",
       "disposition": "re-export shim; delete when importers use @wbs/core or the work-item module directly"
     },
-    {
-      "path": "libs/wbs/application/core/src/service/working-plan-directory.ts",
-      "kind": "support",
-      "disposition": "private member of working-plan.ts",
-      "rationale": "working-plan.ts is its only production importer and uses its DirectoryStore wrapper to refresh retained plan rows after directory writes, so the port-backed helper is not pure domain code"
-    },
-    {
-      "path": "libs/wbs/application/core/src/service/working-plan-edges.ts",
-      "kind": "support",
-      "disposition": "private member of working-plan.ts",
-      "rationale": "working-plan.ts is its only production importer and uses its DependencyStore wrapper to refresh retained edge endpoints after writes, so the port-backed helper is not pure domain code"
-    },
-    {
-      "path": "libs/wbs/application/core/src/service/working-plan-rows.ts",
-      "kind": "support",
-      "disposition": "private member of working-plan.ts",
-      "rationale": "working-plan.ts is its only production importer and uses its WorkItemStore wrapper to refresh retained identities and placements after row writes, so the port-backed helper is not pure domain code"
-    },
-    {
-      "path": "libs/wbs/application/core/src/service/working-plan-subtrees.ts",
-      "kind": "support",
-      "disposition": "private member of working-plan.ts",
-      "rationale": "working-plan.ts is its only production importer and uses its SubtreeStore wrapper to refresh copied, reparented and affected rows after atomic subtree writes, so the port-backed helper is not pure domain code"
-    },
-    {
-      "path": "libs/wbs/application/core/src/service/working-plan-values.ts",
-      "kind": "support",
-      "disposition": "private member of working-plan.ts",
-      "rationale": "working-plan.ts is its only production importer and uses its generic step-value store wrapper to refresh retained work-item identities after value writes, so the port-backed helper is not pure domain code"
-    },
     {
       "path": "libs/wbs/application/core/src/service/working-plan.ts",
-      "kind": "resource",
-      "term": "working plan",
-      "rationale": "PlanCommandRunner is its only production caller and uses it for the working plan aggregate's batch-lifetime retained reads, refresh invariants and closed-state refusal over the admitted transactional stores"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-commands module directly"
     },
     {
       "path": "libs/wbs/application/core/src/use-cases/replay.ts",
diff --git a/libs/wbs/application/core/src/module/plan-commands/README.md b/libs/wbs/application/core/src/module/plan-commands/README.md
--- a/libs/wbs/application/core/src/module/plan-commands/README.md
+++ b/libs/wbs/application/core/src/module/plan-commands/README.md
@@ -14,6 +14,15 @@ case: it refuses an actor without the `write` scope before a batch is admitted.
 each command to the service it belongs to. Private bindings are named under the
 `application.plan-commands` label, so a DI failure says which module asked.

+`working-plan.resource.ts` (the moved `service/working-plan.ts`) is the Working plan, a resource
+private to this module: one project's lazily retained reads, owned by one admitted batch, which the
+batch's graph writes through and which refuses every read once the batch closes it.
+`working-plan-directory.ts`, `working-plan-edges.ts`, `working-plan-rows.ts`,
+`working-plan-subtrees.ts` and `working-plan-values.ts` are its implementation and keep no former
+path: nothing but the Working plan and its own moved tests imported them. No module export names the
+Working plan; `@wbs/core`'s barrel still exports `createWorkingPlan` through the former path for one
+SQLite database test.
+
 ## Checks

 The module's tests run under the `wbs-core:test` target declared in
@@ -23,6 +32,7 @@ The module's tests run under the `wbs-core:test` target declared in

 `libs/wbs/application/core/src/index.ts` exports the module;
 `libs/wbs/application/core/src/service/plan-commands.ts`,
-`libs/wbs/application/core/src/service/command-bindings.ts` and
+`libs/wbs/application/core/src/service/command-bindings.ts`,
+`libs/wbs/application/core/src/service/working-plan.ts` and
 `libs/wbs/application/core/src/use-cases/run-command-batch.ts` keep the former paths for
 `http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.12 `compose.test.ts`: the fixture and the new case (slice 3 step 1)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -102,17 +102,11 @@ function fixture() {
   const accountSource = openMemorySource();
   const source = accountlessSource(accountSource);
   const graph = composeServices({ source, runtime, shared: fixtureShared });
-  const runner = new PlanCommandRunner({
-    batchServices: graph.batch,
-    publicServices: graph,
-    uow: graph.uow,
-    announcements: graph.announcements,
-  });
   return {
     source,
     accountSource,
     graph,
-    runner,
+    runner: graph.commands,
     clock,
     runtime,
     pushed,
@@ -234,6 +228,34 @@ describe('composeServices', () => {
     expect((await graph.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
   });

+  /**
+   * Plan commands is installed once, where `composeServices` runs, and builds
+   * every batch over the scope that batch's own unit of work admits: the
+   * `Writing modules are installed per admitted scope` requirement, for the
+   * one feature whose batches are admitted.
+   */
+  test('installs Plan commands once, building every batch over its own admitted scope', async () => {
+    const { graph } = fixture();
+
+    expect(
+      await graph.commands.runDirectory('owner', [{ kind: 'createTeam', name: 'First' }]),
+    ).toMatchObject({ ok: true });
+    expect(
+      await graph.commands.runDirectory('owner', [
+        { kind: 'createTeam', name: 'Rolled back' },
+        { kind: 'createWorkItem', parentId: null, afterId: null, name: 'Needs a project' },
+      ]),
+    ).toMatchObject({ ok: false, at: 1, reason: 'project_required' });
+    expect(
+      await graph.commands.runDirectory('owner', [{ kind: 'createTeam', name: 'Second' }]),
+    ).toMatchObject({ ok: true });
+
+    expect((await graph.directory.listTeams()).map((team) => team.name).sort()).toEqual([
+      'First',
+      'Second',
+    ]);
+  });
+
   /**
    * `plans` and `savedPlans` are two names for one Saved plans feature identity, never two
    * instances: the backend module map's "Alias exports must not instantiate duplicates".
```

### 10.13 `compose.ts` and the README (slice 3 step 2)

```diff
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -8,6 +8,8 @@ import type { RetentionTimer } from './module/bounded-replay-sweep/retention-tim
 import { installCalendarMarker } from './module/calendar-marker/check';
 import { installCapacity } from './module/capacity/check';
 import { installDirectory } from './module/directory/check';
+import { installPlanCommands } from './module/plan-commands/check';
+import type { PlanCommandRunner } from './module/plan-commands/plan-commands.feature';
 import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
 import { installPlanImport } from './module/plan-import/check';
@@ -153,6 +155,13 @@ interface CommonServices extends WritingServices {
   readonly replay: ReplayOrchestrator;
   readonly retention: RetentionTimer;
   readonly imports: ImportService;
+  /**
+   * Plan commands, installed once for the process over {@link batch}: every
+   * batch it runs builds its own graph over the scope its own unit of work
+   * admits. be-01's `mountedEndpoints` does not read this yet and constructs a
+   * second, stateless `PlanCommandRunner` over the same values (task 7.4).
+   */
+  readonly commands: PlanCommandRunner;
 }

 export type AccountlessServices = CommonServices;
@@ -248,6 +257,12 @@ export function composeServices(
       announcements,
       batchServices: batch,
     }).imports,
+    commands: installPlanCommands({
+      batchServices: batch,
+      publicServices,
+      uow: source.uow,
+      announcements,
+    }).commands,
     history: installPlanHistory({
       projectStore: source.stores.projects,
       planEventStore: source.stores.planEvents,
diff --git a/libs/wbs/application/core/src/module/plan-commands/README.md b/libs/wbs/application/core/src/module/plan-commands/README.md
--- a/libs/wbs/application/core/src/module/plan-commands/README.md
+++ b/libs/wbs/application/core/src/module/plan-commands/README.md
@@ -30,9 +30,11 @@ The module's tests run under the `wbs-core:test` target declared in

 ## Consumers

-`libs/wbs/application/core/src/index.ts` exports the module;
+`libs/wbs/application/core/src/compose.ts` installs the module once per composition as `commands`;
+`libs/wbs/application/core/src/index.ts` exports it;
 `libs/wbs/application/core/src/service/plan-commands.ts`,
 `libs/wbs/application/core/src/service/command-bindings.ts`,
 `libs/wbs/application/core/src/service/working-plan.ts` and
 `libs/wbs/application/core/src/use-cases/run-command-batch.ts` keep the former paths for
-`http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
+`http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim,
+through which `apps/wbs/be-01/src/app.ts` still constructs a runner of its own.
```

### 10.14 Slice 3's Proof comment (slice 3 step 6 — only after row 26 was observed)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -250,6 +250,10 @@ describe('composeServices', () => {
       await graph.commands.runDirectory('owner', [{ kind: 'createTeam', name: 'Second' }]),
     ).toMatchObject({ ok: true });

+    // Proof (2026-09-24): memoizing the first batch's graph in `composeServices`
+    // (`(scope, broadcast) => (firstBatch ??= batch(scope, broadcast))` as the installed batch
+    // factory) left this test failing on this assertion (0 pass, 1 fail, run alone with `-t`):
+    // `Second` went into the first batch's settled scope and only `First` was listed.
     expect((await graph.directory.listTeams()).map((team) => team.name).sort()).toEqual([
       'First',
       'Second',
```

### 10.15 Registration: the `modules.json` row (slice 4 step 1)

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -167,6 +167,48 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.plan-commands",
+      "name": "Plan commands sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/plan-commands",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/plan-commands/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/compose.ts"
+          },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/index.ts"
+          },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/service/command-bindings.ts"
+          },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/service/plan-commands.ts"
+          },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/service/working-plan.ts"
+          },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/use-cases/run-command-batch.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.plan-history",
       "name": "Plan history sealed DI Bag module",
```

### 10.16 Registration: the `policy.json` boundary (slice 4 step 2)

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1125,6 +1125,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.plan-commands",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/plan-commands"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/plan-commands.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "720f5d37a03073e4445eeb40bf3b8d8bb0f6a03d",
+          "path": "libs/core/src/service/plan-commands.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

### 10.17 Registration: `pilotPaths` and the README index (slice 4 step 3), then the legacy re-pin numbers (slice 4 step 5 — only after row 31 was observed)

The README diff names its predecessor by filename only: `tool-devsync`'s `LEGACY_ROOT` scan refuses
a current README that spells a pre-namespacing path. The first block is step 3's; the second is
step 5's.

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -40,6 +40,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/calendar-marker/README.md',
   'libs/wbs/application/core/src/module/capacity/README.md',
   'libs/wbs/application/core/src/module/directory/README.md',
+  'libs/wbs/application/core/src/module/plan-commands/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/priority-band/README.md',
   'libs/wbs/application/core/src/module/project/README.md',
diff --git a/libs/wbs/application/core/src/module/plan-commands/README.md b/libs/wbs/application/core/src/module/plan-commands/README.md
--- a/libs/wbs/application/core/src/module/plan-commands/README.md
+++ b/libs/wbs/application/core/src/module/plan-commands/README.md
@@ -1,5 +1,7 @@
 # Plan commands

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-commands","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"command-bindings.test.ts"},{"kind":"path","path":"command-bindings.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-command-scope.test.ts"},{"kind":"path","path":"plan-commands.feature.ts"},{"kind":"path","path":"plan-commands.test.ts"},{"kind":"path","path":"run-command-batch.ts"},{"kind":"path","path":"working-plan-directory.test.ts"},{"kind":"path","path":"working-plan-directory.ts"},{"kind":"path","path":"working-plan-edges.ts"},{"kind":"path","path":"working-plan-rows.ts"},{"kind":"path","path":"working-plan-subtrees.ts"},{"kind":"path","path":"working-plan-values.ts"},{"kind":"path","path":"working-plan.resource.ts"},{"kind":"path","path":"working-plan.test.ts"},{"kind":"path","path":"working-plan.types.test.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the four compatibility shims."},{"section":"invariants","reason":"The commit-then-announce and one-graph-per-batch invariants are documented on PlanCommandRunner; the Working plan's closed-state refusal is documented on createWorkingPlan."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/command-bindings.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/plan-commands.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/working-plan.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/run-command-batch.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the four compatibility shims are declared; the work-item routes, the test fixtures, be-01's app and deep-import shim, and the SQLite database tests reach this module through the shims or the barrel and are not tracked here."}} -->
+
 A sealed feature module installed once per composition, whose per-batch parts are made inside every
 batch: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
 `contract.ts` states the per-batch service factory, the public graph, the unit of work and the
@@ -25,8 +27,8 @@ SQLite database test.

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

@@ -38,3 +40,14 @@ The module's tests run under the `wbs-core:test` target declared in
 `libs/wbs/application/core/src/use-cases/run-command-batch.ts` keep the former paths for
 `http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim,
 through which `apps/wbs/be-01/src/app.ts` still constructs a runner of its own.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.plan-commands` (`docs/wiki-policy/policy.json`'s
+`boundary.application.plan-commands`). The boundary's `sourceSelector` binds this directory to
+`plan-commands.feature.ts`'s own single pre-namespacing predecessor, `plan-commands.ts`, which existed
+at the pilot's frozen `sourceRevision` — the same mechanism `boundary.application.work-item` uses. The
+other files here have no separate baseline entry: the registration's guarantee is one predecessor per
+module directory, not one per file it holds. `run-command-batch.ts`'s own predecessor existed then
+too and stays under `boundary.application.use-cases`'s baseline.
```

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 65,
+      'historical policy selector or baseline': 67,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -838,8 +838,8 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // naming the pre-namespacing `libs/core/src/service/work-item.service.ts` it was extracted
     // from; raised `historical policy selector or baseline` from 63 to 65 and occurrences from
     // 281 to 283, no unclassified entries (2026-09-24).
-    digest: '0d78b5794663e2bd708b6d307ba2643d33a414d717771b682392445958fe4e07',
-    occurrences: 283,
+    digest: '687c123b315024882f690de60d7a3ac6890f89200a880ebf21b2242b66987a54',
+    occurrences: 285,
     unclassified: [],
   });
 });
```

### 10.18 Legacy re-pin, the Proof (slice 4 step 5 — after row 32)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -838,6 +838,11 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // naming the pre-namespacing `libs/core/src/service/work-item.service.ts` it was extracted
     // from; raised `historical policy selector or baseline` from 63 to 65 and occurrences from
     // 281 to 283, no unclassified entries (2026-09-24).
+    // Proof: registering Plan commands, the last feature module of the backend core, added
+    // `boundary.application.plan-commands`'s `sourceSelector` and one `baselineEntries` path, both
+    // naming the pre-namespacing `libs/core/src/service/plan-commands.ts` it was extracted from;
+    // raised `historical policy selector or baseline` from 65 to 67 and occurrences from 283 to
+    // 285, no unclassified entries (2026-09-24).
     digest: '687c123b315024882f690de60d7a3ac6890f89200a880ebf21b2242b66987a54',
     occurrences: 285,
     unclassified: [],
```

### 10.19 Task records (slice 4 step 6)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -5,13 +5,24 @@
       compatibility export of the Project resource. Proof: `libs/wbs/domain/domain/src/project-ownership.test.ts`;
       negative: `announces nothing for a write it refused` in
       `libs/wbs/application/core/src/service/broadcast.test.ts` with the rule forced to `true`.
-- [ ] 1.2 Split `broadcast.ts`: `ProjectEvent`, `Broadcaster` and `subscriptionFor` to a neutral
-      application event port; `AnnouncementCollector` and `HeldAnnouncement` into Plan commands.
+- [x] 1.2 Split `broadcast.ts`: `ProjectEvent`, `Broadcaster` and `subscriptionFor` to a neutral
+      application event port, and the announcement collector stays neutral shared support in
+      `service/broadcast.ts`, imported by Plan commands and Plan import.
       Negative: a resource publishing through the port with the port unregistered.
       Port landed 2026-09-22 as `libs/wbs/application/core/src/ports/project-event.ts`, with
       `ports/event-port-boundaries.test.ts` as its checked rule. The collector stays in
       `service/broadcast.ts` and moves with 5.2: `import.service.ts:148` builds one too, so Plan
       commands cannot own it privately before that module exists without a K6 feature-to-feature edge.
+      **Decided 2026-09-24, with the Plan commands module landed (5.2): the collector is neutral
+      shared support, not Plan commands' private class.** `module/plan-commands/plan-commands.feature.ts`
+      and `module/plan-import/plan-import.feature.ts` each build one `AnnouncementCollector` per
+      admitted act over the neutral `Broadcaster` port, so a private owner would make the other
+      import a sibling feature (K6), and a copy would be a second class definition. The backend
+      module map's "Plan commands' private collector" was wrong because it did not see Plan
+      import's use; this task's wording is corrected accordingly. `AnnouncementCollector` stays in
+      `service/broadcast.ts` beside the port it collects (K4 support over the neutral port),
+      `ports/event-port-boundaries.test.ts` keeps pinning it there, and its `kinds.json`
+      disposition says so.
 - [x] 1.3 Change Plan document's marker read to an owner-neutral read port and move
       `CalendarMarkerListOutcome` out of the Calendar marker service file. Landed 2026-09-22 as
       `libs/wbs/application/core/src/ports/calendar-marker-read.ts`, with `CalendarMarkerReader` as the
@@ -184,7 +195,28 @@
       five negatives, its provider edge being the broadcaster. `clock.test.ts`'s `coreWorkItems`
       now names the moved file, watched failing on the shim first. No `servicesOver` resource is
       constructed with `new` any more.
-- [ ] 5.2 Plan commands, with Working plan and the announcement collector private to it.
+- [x] 5.2 Plan commands, with Working plan private to it and the announcement collector as neutral
+      shared support. Landed 2026-09-24 as
+      `libs/wbs/application/core/src/module/plan-commands/`: the moved `plan-commands.feature.ts`,
+      its use case `run-command-batch.ts` and its private `command-bindings.ts`, a module exporting
+      only `commands`, and `composeServices` installing it once as `commands` over the per-batch
+      `batch` factory; `service/plan-commands.ts`, `service/command-bindings.ts` and
+      `use-cases/run-command-batch.ts` are compatibility re-export shims and their `kinds.json`
+      rows are rewritten in place. The Working plan is private to the module as
+      `working-plan.resource.ts` with its five implementation files, which keep no former path
+      (their five `kinds.json` rows are removed, 93 to 88 entries); `service/working-plan.ts` stays
+      a shim only because `@wbs/core`'s barrel exports `createWorkingPlan` to one SQLite database
+      test. The announcement collector is neutral shared support in `service/broadcast.ts`,
+      imported by Plan commands and Plan import: the backend module map's "Plan commands' private
+      collector" did not see Plan import's use, and the task was reworded 2026-09-24 (see 1.2).
+      Proof: the module's own tests; negatives for the installer leaking its bag, its resolver
+      leaking through the returned runner, the private `planCommandOptions` binding exported, the
+      label dropped, the supplied broadcaster replaced, and every batch handed the direct
+      broadcaster instead of its own collector; `compose.test.ts`'s own case failed when the
+      installed batch factory memoized the first batch's graph; three
+      `ports/sideways-type-boundaries.test.ts` rows follow `run-command-batch.ts` out of
+      `use-cases/`, each watched failing. be-01's `mountedEndpoints` still constructs its own
+      `PlanCommandRunner` (the map's composition hazard), tracked under 7.4.

 ## 6. Domain moves the map names

@@ -278,6 +310,10 @@
       `module.application.work-item` and `boundary.application.work-item`, bound to the
       pre-namespacing `work-item.service.ts` alone; the moved `work-item.resource.test.ts` has no
       separate baseline entry.
+      Landed again 2026-09-24 for Plan commands (task 5.2) as `module.application.plan-commands`
+      and `boundary.application.plan-commands`, bound to the pre-namespacing `plan-commands.ts`
+      alone; `run-command-batch.ts`'s own predecessor stays in `boundary.application.use-cases`'s
+      baseline, and the other moved files have no separate baseline entry.
       **Not landed for Plan document (task 4.1)**, for Plan import's reason below:
       `libs/core/src/service/plan-document.ts` was introduced at commit `8c34a33f` and renamed
       `R100` at `7c5dee9e`, both after the pilot's frozen `sourceRevision`.
```

## 11. Global stop conditions

- A red checkpoint reports `0 tests ran`.
- A mutation leaves its named test passing: restore, check the location against section 6, redo
  once, stop if it still passes.
- A step-0 line does not print what it says, or the step-0 tree is not clean.
- `git apply --check` refuses any section-10 diff: the file drifted; report, do not repair.
- A pin differs from step 0 other than by this packet's own prescribed change (`kinds.json` 93 in
  slice 1 and 88 after slice 2; wiki modules and boundaries +1 each in slice 4; the legacy pin
  exactly as row 31 states; the prose-refusal pin unchanged).
- Any change to what a moved file does. The **only** permitted changes to moved code are the import
  lines of 10.2, 10.8 and 10.10; the only permitted `compose.ts` change is 10.13's.
- A network access or an OpenSpec download.
- A check needs an edit this packet does not prescribe (in particular, any importer of the four
  shimmed paths, `service/broadcast.ts`, or be-01's `app.ts` needing an edit).

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.
Paths under `libs/wbs/application/core/src/` are written from `src/`; `src/m/` is
`src/module/plan-commands/`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                                  | Untracked (new)                                                                                                                                                                                                                                                          | Deleted                                                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `index.ts`, `ports/sideways-type-boundaries.test.ts`, `service/command-bindings.ts`, `service/plan-commands.ts`, `use-cases/run-command-batch.ts`                                         | the **eleven** files under `src/m/`: `README.md`, `check.ts`, `command-bindings.test.ts`, `command-bindings.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `plan-command-scope.test.ts`, `plan-commands.feature.ts`, `plan-commands.test.ts`, `run-command-batch.ts` | `src/service/command-bindings.test.ts`, `src/service/plan-command-scope.test.ts`, `src/service/plan-commands.test.ts` (moved)                                                                                                                            |
| 2     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `m/README.md`, `m/plan-commands.feature.ts`, `service/working-plan.ts`                                                                                                                    | under `src/m/`: `working-plan-directory.test.ts`, `working-plan-directory.ts`, `working-plan-edges.ts`, `working-plan-rows.ts`, `working-plan-subtrees.ts`, `working-plan-values.ts`, `working-plan.resource.ts`, `working-plan.test.ts`, `working-plan.types.test.ts`   | under `src/service/`: `working-plan-directory.test.ts`, `working-plan-directory.ts`, `working-plan-edges.ts`, `working-plan-rows.ts`, `working-plan-subtrees.ts`, `working-plan-values.ts`, `working-plan.test.ts`, `working-plan.types.test.ts` (moved) |
| 3     | `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `compose.test.ts`, `compose.ts`, `m/README.md`                                                                                                                                                                                 | nothing                                                                                                                                                                                                                                                                  | nothing                                                                                                                                                                                                                                                  |
| 4     | `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `src/m/README.md`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing                                                                                                                                                                                                                                                                  | nothing                                                                                                                                                                                                                                                  |

Slice 1: 7 modified, 11 new, 3 deleted (21 paths). Slice 2: 5 modified, 9 new, 8 deleted (22).
Slice 3: 4 modified. Slice 4: 7 modified. The planner may add a revised packet file to its own
commits; the lists are scoped to `$base`, so that does not break them.

## 13. Findings

- **The map's "collector private to Plan commands" was wrong.** Both features build
  `AnnouncementCollector` per admitted act; private ownership by either is a K6 edge for the other.
  Resolved as neutral shared support (section 9, item 1); 1.2 and 5.2 are reworded and ticked.
- **Plan commands is not a per-admission installation.** The design's "Per-admission modules (the
  seven resource responsibilities and Plan commands) are installed by `servicesOver`" does not fit
  the runner, which owns admission itself (it holds the unit of work). Its per-admission state is
  created inside each act, which the module test and `compose.test.ts` now watch through the
  installer and the composition respectively.
- **A move silently narrowed three sideways rows.** The `use-cases/` rows stopped covering the moved
  use case (row 11); slice 1 re-scopes them to the module (rows 12-14), as E5 did for Saved plans.
- **`service/service-boundaries.test.ts` now lints two shims** for `plan-commands` and
  `command-bindings`; the moved files are still linted by `wbs-core:lint`. Its list is what task 7.1
  reads to delete shims, so it is left unchanged.
- **Landed code of packets A-E8:** no defect found.

## 14. Document exemption (precondition, not a slice)

Sections 3, 7 (slice 4 step 0), 10.16, 10.18 and 10.19 cite `libs/core/src/service/plan-commands.ts`,
the predecessor this packet registers. `docs/findings/current-document-check-exemptions.json` carries
this packet's `legacy-root` entry, committed with the packet itself (inserted before E7's entry, so
it does not share context with E8's appended one); no slice touches that file.

## 15. `git apply --check` verification

Every fenced `diff` block above was extracted from this document by the script below and applied
in slice order to a disposable worktree of `50720e10`, with the filesystem steps each slice
prescribes in between, and the resulting tree compared with the rehearsed slice commits.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <slice1-sha> <slice2-sha> <slice3-sha> <slice4-sha>
set -euo pipefail
repo=$1; packet=$2; s1=$3; s2=$4; s3=$5; s4=$6
work=$(mktemp -d "${TMPDIR:?}/g-extract-XXXXXX")
python3 - "$packet" "$work" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
body = text[text.index('## 10. Exact content'):text.index('## 11. Global stop conditions')]
diffs = re.findall(r'^```diff\n(.*?)^```$', text, re.S | re.M)
for number, patch in enumerate(diffs, 1):
    open(f'{sys.argv[2]}/{number:02d}.patch', 'w').write(patch)
listings = re.findall(r'^```(?:ts|md)\n(.*?)^```$', body, re.S | re.M)
for number, listing in enumerate(listings, 1):
    open(f'{sys.argv[2]}/{number:02d}.listing', 'w').write(listing)
print(f'diffs={len(diffs)} listings={len(listings)}')
PY
test "$(ls "$work"/*.patch | wc -l)" -eq 16
test "$(ls "$work"/*.listing | wc -l)" -eq 9
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" 50720e10
cd "$wt"
c=libs/wbs/application/core/src
m="$c/module/plan-commands"
apply() {
  git apply --check "$work/$1.patch"
  git apply "$work/$1.patch"
  echo "applied $1"
}
same_as() {
  git add -A
  if git diff --cached --quiet "$1"; then echo "tree equals $1"; else git diff --cached --stat "$1"; exit 1; fi
}
# Slice 1
mkdir -p "$m"
cp "$work/01.listing" "$m/module.test.ts"
cp "$c/service/plan-commands.ts" "$m/plan-commands.feature.ts"
cp "$c/use-cases/run-command-batch.ts" "$m/run-command-batch.ts"
cp "$c/service/command-bindings.ts" "$m/command-bindings.ts"
mv "$c/service/plan-commands.test.ts" "$m/plan-commands.test.ts"
mv "$c/service/plan-command-scope.test.ts" "$m/plan-command-scope.test.ts"
mv "$c/service/command-bindings.test.ts" "$m/command-bindings.test.ts"
apply 01
cp "$work/02.listing" "$c/service/plan-commands.ts"
cp "$work/03.listing" "$c/use-cases/run-command-batch.ts"
cp "$work/04.listing" "$c/service/command-bindings.ts"
cp "$work/05.listing" "$m/contract.ts"
cp "$work/06.listing" "$m/module.ts"
cp "$work/07.listing" "$m/check.ts"
cp "$work/08.listing" "$m/README.md"
apply 02
apply 03
apply 04
test "$(ls "$m" | wc -l)" -eq 11
same_as "$s1"
# Slice 2
mv "$c/service/working-plan.test.ts" "$m/working-plan.test.ts"
mv "$c/service/working-plan-directory.test.ts" "$m/working-plan-directory.test.ts"
mv "$c/service/working-plan.types.test.ts" "$m/working-plan.types.test.ts"
apply 05
cp "$c/service/working-plan.ts" "$m/working-plan.resource.ts"
for part in directory edges rows subtrees values; do mv "$c/service/working-plan-$part.ts" "$m/working-plan-$part.ts"; done
cp "$work/09.listing" "$c/service/working-plan.ts"
apply 06
apply 07
test "$(ls "$m" | wc -l)" -eq 20
same_as "$s2"
# Slice 3
for n in 08 09 10; do apply "$n"; done
same_as "$s3"
# Slice 4
for n in $(seq 11 16); do apply "$(printf %02d "$n")"; done
same_as "$s4"
cd "$repo"
git worktree remove --force "$wt"
echo "all 16 diffs applied in slice order; every slice tree equals its rehearsal commit"
````

Output:

```text
diffs=16 listings=9
applied 01
applied 02
applied 03
applied 04
tree equals df4d314d
applied 05
applied 06
applied 07
tree equals 4eb19e81
applied 08
applied 09
applied 10
tree equals 352aeeb9
applied 11
applied 12
applied 13
applied 14
applied 15
applied 16
tree equals eee564ec
all 16 diffs applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits are throwaway: slice 1 `df4d314d`, slice 2 `4eb19e81`, slice 3 `352aeeb9`,
slice 4 `eee564ec`, on branch `rehearse/040-6-g-plan-commands-r2` above `50720e10` (not pushed; kept
only as the comparison target of the script above). None of them touches `verify.md`, which only
the executor writes. Their subjects are rehearsal labels; the planner commits every slice with
section 7's subject, and only the trees are compared. Lefthook ran on all four.

## 16. Deferred: label agreement

Whether the README's `moduleId` names the label the module seals its bag under is not checked,
matching packet D's deferral.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fixture reproduces the failure first | §6 rows 1 (module red), 2 (bundle red), 11 (the sideways gap the move opens), 17 (moved tests before their sources), 21 (compile and runtime red before `commands` exists), 27-28 and 31 (registration and pin reds), all on code the slice has not fixed                                                                                                                                                                          |
| 2   | Test code passes typecheck and lint  | `wbs-core` and `wbs-be-01` lint and typecheck on each rehearsed slice; lefthook passed on all four rehearsal commits                                                                                                                                                                                                                                                                                                               |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                                                                                                                                                                                                                                                                                                                                                |
| 4   | Commands can show failure            | §7 status wrapper; `if count=$(grep -cF …)` form for every bundle grep                                                                                                                                                                                                                                                                                                                                                             |
| 5   | Tests reading `HEAD`                 | §7 slice 4 preamble: slices 1-3 are committed before the pilot suite runs, and the README block arrives only through `pilotPaths`                                                                                                                                                                                                                                                                                                  |
| 6   | Sandbox facts                        | §7 kinds substitute (service-kinds is planner-only); `app.routes.test.ts` excluded; §8                                                                                                                                                                                                                                                                                                                                             |
| 7   | Known race                           | §8                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | Names                                | `module.application.plan-commands`; label `application.plan-commands`; Twilight Burokrat                                                                                                                                                                                                                                                                                                                                           |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines                                                                                                                                                                                                                                                                                                                                                  |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change; `di-bag` stays 0.4.0                                                                                                                                                                                                                                                                                                                                                      |
| 11  | `\|\| test $? -eq 1` after pipelines | used only after one `grep` on a file the same step 0 proved exists (slices 1 and 3); every bundle grep uses the single-command `if … then … else status=$?` form                                                                                                                                                                                                                                                                   |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                                                                                                                                                                                                                                                                                                                                           |
| 13  | Index every module file              | §10.17's index names all 19 non-README files; `check-indexes committed` reported them (§7 slice 4)                                                                                                                                                                                                                                                                                                                                 |
| 14  | Bun path vs filter                   | every focused run uses `./…` or `cd <project>`; lint and typecheck before baselines                                                                                                                                                                                                                                                                                                                                                |
| 15  | Interleaving property tests          | not triggered: no owner, queue, lock or retry logic is added or changed; the per-batch collector and per-scope graph are construction facts, each proved by one substitution fault failing an assertion (rows 8 and 26)                                                                                                                                                                                                            |
| 16  | Model-based tests                    | not triggered                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed` (dispatch paragraph)                                                                                                                                                                                                                                                                                                                                                                  |
| 18  | Symbol-based boundary checks         | the three new rows ride the existing `TypeChecker` identity checker; each watched failing (rows 12-14) after the gap was observed (row 11)                                                                                                                                                                                                                                                                                         |
| 19  | ugrep exits 1 on missing file        | `test -f "$bundle"` precedes every `grep -cF` on a bundle; step-0 greps follow existence gates                                                                                                                                                                                                                                                                                                                                     |
| 20  | Promise only what a check keeps      | 5.2 and 1.2 ticked only after their wording records the collector decision (neutral shared support, not private); K2 and the composition hazard disclosed in `contract.ts` and on `CommonServices.commands`; K3/K6 stated as read, not watched; `check-indexes` called index validation; Working plan privacy claimed only as "no module export, no importer outside the module but the barrel's shim" (§3), not as a checked rule |
