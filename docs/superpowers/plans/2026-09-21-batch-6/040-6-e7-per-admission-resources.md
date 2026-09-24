# 040.6 E7 — The six per-admission resource modules, installed per supplied scope

| Field      | Value                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — twelfth packet                                                                                                                     |
| Size class | M, in four slices                                                                                                                                                                                                             |
| Slices     | 1 seals Calendar marker and Capacity and installs them in `servicesOver`, 2 does the same for Priority band and Step, 3 for Project and Directory, 4 registers the six in the wiki content-review pilot and records the tasks |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` task 5.1 for six of its seven resources (left unticked with a dated note; packet E8 seals Work item and ticks it), and task 7.5 for the six new module directories           |
| Planned on | 2026-09-24; every slice rehearsed end to end and committed on a throwaway branch cut from `c17702371858fd0858a23c858111e848ef2ae10e`                                                                                          |

**Dates.** Every `Proof:` comment and task note below carries the planner's rehearsal date,
2026-09-24. Write the date you actually observe (`date -u +%F`) when you add them; if it differs,
change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e7-per-admission-resources.md`
must print an entry) and must descend from `cf4028dfe491081d343346461e81305e5d0f4ebc`, packet E6's
slice-3 commit. Every count below was measured on `c1770237`, which is the batch-6 planning branch
(`1698ed98`) merged with that E6 commit: the Plan document and Solver launcher modules, their
`kinds.json` rows, the Solver launcher's wiki row, `check.be-01.test` and the legacy re-pin (51,
269, `113681cd…`) are all already in the tree this packet starts from. This packet does not edit
any of E6's files or rows; it adds one sideways row after E6's and one legacy Proof after E6's.
Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e7-per-admission-resources 1 <packet-containing commit sha> --batch batch-6 --require-ancestor cf4028dfe491081d343346461e81305e5d0f4ebc --slice-note 'reviewed base <sha>' --preserve evidence
```

Slices 2 to 4 resume the clone the previous slice built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e7-per-admission-resources 2 <the same sha> --batch batch-6 --resume --require-ancestor <slice 1 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e7-per-admission-resources 3 <the same sha> --batch batch-6 --resume --require-ancestor <slice 2 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e7-per-admission-resources 4 <the same sha> --batch batch-6 --resume --require-ancestor <slice 3 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

The executor never runs `apps/wbs/be-01/src/app.routes.test.ts`: its `refuses framed GET and HEAD
bodies on the production health route` test binds a port through `Bun.serve`, which a sandbox
refuses with `EPERM: operation not permitted, listen` while the network is off. The be-01 unit
command below excludes that file and the planner runs it (section 8). Nothing else binds a port or
needs the network (`bun build` and the pilot suite's local `git clone` run offline), so **no slice
needs `--network`**. No slice reads an earlier attempt's evidence, only the committed tree, so **no
slice needs `--seed`**.

## 1. Goal and non-goals

**Goal.** Make `servicesOver(stores, shared)` — the function `composeServices` calls once for the
public graph and once per admitted batch or import — install each per-admission resource through a
sealed DI Bag module's installer, over the stores it is handed, on every call. Six of the map's
seven resource rows become modules with the Saved plans and Plan document pattern (a README, a
contract, a labelled `module.ts`, a composition `check.ts`, a moved `<name>.resource.ts`):

| Module directory under `libs/wbs/application/core/src/module/` | Moved from `service/`        | Export            | Label                         |
| -------------------------------------------------------------- | ---------------------------- | ----------------- | ----------------------------- |
| `calendar-marker/` (slice 1)                                   | `calendar-marker.service.ts` | `calendarMarkers` | `application.calendar-marker` |
| `capacity/` (slice 1)                                          | `capacity.service.ts`        | `capacity`        | `application.capacity`        |
| `priority-band/` (slice 2)                                     | `priority-band.service.ts`   | `priorityBands`   | `application.priority-band`   |
| `step/` (slice 2)                                              | `step.service.ts`            | `steps`           | `application.step`            |
| `project/` (slice 3)                                           | `project.service.ts`         | `projects`        | `application.project`         |
| `directory/` (slice 3)                                         | `directory.service.ts`       | `directory`       | `application.directory`       |

Task 5.1's own negative — two admitted batches must not share staged stores — becomes one
`compose.test.ts` case per resource: two `servicesOver` calls over two distinct memory sources, a
write through the first, and a read through the second that must not see it. Each case is proved by
memoizing that one resource's installation across calls and watching exactly that case fail. Slice
4 registers all six in the wiki content-review pilot through their frozen-revision predecessors.

**Non-goals.**

- **No Work item** (section 4 is the measurement and packet E8's scope). `servicesOver` keeps its
  `new WorkItemService({...})` line, so task 5.1 stays unticked with a dated note.
- No change to what any moved service does. Each moved body differs from its source only in import
  depth (sections 10.3, 10.14 and 10.23 are the exact diffs); `servicesOver`'s argument values and
  `WritingServices`' shape are unchanged (the installers return the same classes).
- No move of delivery's direct resource dependencies (K2): the routes keep their parameters and
  keep importing the old paths, now compatibility shims. Recorded per module in `contract.ts` and
  tracked under task 7.4.
- No domain moves (task 6.1): Step and Directory keep importing `service/assumed-assignee.ts`,
  `service/clean-name.ts` and `service/directory-usage.ts` through deeper relative paths.
- No change to be-01's deep-import shims (`apps/wbs/be-01/src/service/<name>.service.ts`, each
  `export * from '@wbs/core/service/<name>.service'`), which keep working through the core shims.
- No library version bump (`di-bag` stays 0.4.0). No frontend, gateway or MCP change. No change to
  the eight earlier modules. No new checker: the one new sideways row uses the existing
  identity-based mechanism, and the be-01 clock scan is extended in place.

## 2. Read first

| File                                                                                                                                                                                          | Why                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                                                                  | Rules R1 to R5.                                                                                                     |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` (the seven resource rows; "Delivery and composition hazards", the `servicesOver` bullet; the ledger's resource files) | What each module exports and requires; why a singleton installation inside `servicesOver` would leak staged stores. |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e6-resource-modules.md`                                                                                                                      | The precedent this packet mirrors section by section.                                                               |
| `libs/wbs/application/core/src/module/plan-document/`                                                                                                                                         | The resource module whose `contract.ts`, `module.ts`, `check.ts` and `module.test.ts` each new module mirrors.      |
| `libs/wbs/application/core/src/compose.ts` (`servicesOver`, lines 75-130 at `c1770237`)                                                                                                       | The one installation site.                                                                                          |
| `openspec/changes/adopt-di-composition/specs/di-composition/spec.md` ("Writing modules are installed per admitted scope"); `design.md` ("Two lifetimes")                                      | The requirement task 5.1 implements.                                                                                |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation"                                                                            | The exact `jq -s -e` contract slice 4 uses.                                                                         |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `c1770237` on 2026-09-24.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Evidence                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `compose.ts:76` `servicesOver(stores: PlanTransactionalStores, shared: ServicesOverOptions)` builds seven resources with `new` on every call; `composeServices` calls it for the public graph (`:206`) and inside `batch` for every admitted scope (`:211-216`); `WritingServices = ReturnType<typeof servicesOver>` (`:130`). No other production file constructs any of the six (`git grep -l "new <Class>(" -- '*.ts' ':!*.test.ts'` names only `compose.ts` and `libs/wbs/adapters/store-memory/src/testing/service-fixtures.ts`, a test fixture that reaches them through `@wbs/core`).                                                                                                                                                      | Read; `git grep`.                       |
| Sizes: `calendar-marker.service.ts` 193 lines, `capacity.service.ts` 96, `directory.service.ts` 743, `priority-band.service.ts` 82, `project.service.ts` 310, `step.service.ts` 244, `work-item.service.ts` 4598. Only Calendar marker and Work item have a core unit test beside them (`calendar-marker.service.test.ts`, 164 lines, whose run reports 17 tests; `work-item.service.test.ts`, 2321 lines).                                                                                                                                                                                                                                                                                                                                       | `wc -l`; `ls service/*.test.ts`.        |
| **Edges.** None of the seven imports another resource: each imports `@wbs/domain` (Project also `@wbs/validation`) and `ports/*` only, except Step (`./assumed-assignee`, `./clean-name`) and Directory (`./clean-name`, `./directory-usage`), the support files task 6.1 moves to the domain library, and Work item (five such support files). K4 and K6 therefore hold by reading; the support imports are disclosed per module.                                                                                                                                                                                                                                                                                                                | `grep -n "from '"` over each file.      |
| **Host-key collisions.** Four resources are exported under the same name as one of their own requirements in `servicesOver` (`projects`, `capacity`, `steps`, `directory` are both a `PlanTransactionalStores` store and a `WritingServices` export). Every module therefore takes its stores under a `<name>Store` host key (`projectStore`, `capacityStore`, …) while its installer keeps accepting the unchanged `<Name>ServiceOptions`.                                                                                                                                                                                                                                                                                                       | `ports/stores.ts`; `compose.ts:78-127`. |
| Two options are optional: `CalendarMarkerServiceOptions.broadcast?` and `ProjectServiceOptions.optimizerAvailable?`. Each is registered even when absent, as `undefined`, the Saved plans quota precedent; `tsconfig.base.json` sets no `exactOptionalPropertyTypes`, so passing `undefined` is what an absent key already meant.                                                                                                                                                                                                                                                                                                                                                                                                                 | Read.                                   |
| Importers of the old core paths, all kept working by the shims: delivery (`http/calendar-marker.routes.ts`, `project.routes.ts`, `directory.routes.ts`, `step.routes.ts`, `saved-plan.routes.ts`, `solution.routes.ts`), `service/plan-commands.ts`, `module/plan-import/plan-import.feature.ts`, `module/saved-plans/save-plan.ts`, `testing/writes-fixture.ts`, core tests, `index.ts`, and be-01's six deep-import shims (each `export * from '@wbs/core/service/<name>.service'`), which 20 other be-01 files import (`git grep -l` over `apps/wbs/be-01`).                                                                                                                                                                                   | `git grep -n "service/<name>.service"`. |
| **The move breaks one check silently and one loudly.** (a) `ports/sideways-type-boundaries.test.ts`'s fifth and eighteenth rows forbid Plan document from reaching `service/calendar-marker.service.ts`. After the move, a `CalendarMarkerService` named through the `@wbs/core` barrel resolves to `module/calendar-marker/calendar-marker.resource.ts` without passing the shim, and the suite stays green (section 6 rows 21-23). (b) `apps/wbs/be-01/src/service/clock.test.ts` scans `FOLDERS` (the two `service/` directories) and asserts `libs/wbs/application/core/src/service/capacity.service.ts` contains `export class CapacityService`; the shim does not (row 4). Every moved stamper would also fall out of its two shape checks. | Rehearsed.                              |
| `service/service-boundaries.test.ts` lints the listed `service/*.ts` paths, which after the move are shims; the moved bodies are linted by `wbs-core:lint`, whose command covers `libs/wbs/application/core/src`. Its list decides when a shim may go (task 7.1), so it is left alone, as E4 and E5 left it.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Read.                                   |
| **Frozen-revision predecessors exist for all six** (and for Work item): `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/<name>.service.ts` prints `1e36dc086592483df3c5facd52dc756c00a46b08` (calendar-marker), `ae86655ecd969b4016c1b9b96fb5eb60dec35a96` (capacity), `8deae4ad476af259c2ecc4b90345557dca80eab3` (directory), `b9c1342e6c7f0e112a0538c19eb4ad47359386cc` (priority-band), `1b40cb91901c693b8a9e9970b938e7327954988b` (project), `1e53de89b1d4f1b1ebf901696bdf36dbfc6d1944` (step), `29ab341f9befec90944900d13f9c9c823d06de95` (work-item), each mode `100644`.                                                                                                                                    | `git ls-tree`.                          |
| `kinds.json` has `K=93` entries. This packet rewrites six rows in place (`resource` → `support` shim rows: `calendar-marker.service.ts` line 248, `capacity.service.ts` 254, `directory.service.ts` 296, `priority-band.service.ts` 356, `project.service.ts` 362, `step.service.ts` 439); the count stays 93. Each `<name>.resource.ts` declares its kind by suffix (`KIND_SUFFIXES`, `tools/tool-devsync/src/service-kinds.ts:24`).                                                                                                                                                                                                                                                                                                             | `python3` count; `grep -n`.             |
| The wiki pilot holds `M=12` modules and `B=12` boundaries; the six new `module.application.*` ids sort between `module.application.bounded-replay-sweep` and `module.application.use-cases`. The pilot suite is `21` tests, `0` failures, `299` `expect()` calls (343 s); the legacy pin is `51`/`269`/`113681cd…`. `check.core.test` already exists, so no relationship fact is added, and the prose-refusal pin (first refused index in path order, a be-01 README) does not move.                                                                                                                                                                                                                                                              | `python3`; rehearsed.                   |
| Baselines at `c1770237`: core `bun test src` `577` over 60 files; be-01 unit set (without `*.db.test.ts` and `app.routes.test.ts`) `520` over 49; `compose.test.ts` `9` tests; whole `wbs-be-01:test` `1097 pass`, `1 skip` over 92; `tool-devsync:test` `366` over 25; OpenSpec `114` passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Rehearsed.                              |

## 4. Why six, and what packet E8 carries

The measure is what one slice asks of one executor attempt. E6's two module slices changed 14 and
13 paths and its executor returned in 8.5 and 6 minutes; its registration slice took 22 minutes
(`puni-plan/exec/ledger.jsonl`, 2026-09-23). One resource module here is five or six new files, one
shim, one `servicesOver` line, a `compose.test.ts` case and six negatives. Two per slice gives
19-23 changed paths and 12-14 negatives per slice, all of one repeated shape, which fits one
attempt; three per slice would not.

Work item does not fit beside anything else, and not because of its line count (the move is a `cp`
plus one import-depth diff):

- Its options take **fifteen** requirements (`WorkItemServiceOptions`, `work-item.service.ts:788`),
  so its `module.ts`, `check.ts`, host graph and missing-requirement test are three times any other.
- **51** files name its old path (`git grep -l "work-item.service'"` on the rehearsal base), among them
  `module/saved-plans/saved-plan-schedule.ts:14` (a value import of `NO_DEADLINES` and `slicesOf`),
  `testing/available-work-item-service.ts`, `testing/harness.ts` and the be-01 type tests
  `clock-requirements.types.test.ts` and `deadline-plan-read.test.ts`.
- Its 2321-line, 98-test `work-item.service.test.ts` moves with it.
- `apps/wbs/be-01/src/service/clock.test.ts:90,93` pins `coreWorkItems` at
  `libs/wbs/application/core/src/service/work-item.service.ts` and asserts
  `export class WorkItemService` there, exactly as it pinned Capacity.
- `compose.test.ts`'s `runtimeOf` reads `WorkItemService`'s private `clock`, `opts.scheduler` and
  `opts.broadcast` through a cast; the installed service must keep them.

**Packet E8 — Work item, and the tick of 5.1** (two slices): seal
`libs/wbs/application/core/src/module/work-item/` (`work-item.resource.ts`,
`work-item.resource.test.ts` moved with it, `module.ts` over fifteen `<name>Store`-style host keys
plus `broadcast`, `scheduler` and `clock`), install it in `servicesOver`, add a `compose.test.ts`
per-scope case with its own reuse negative, repoint `clock.test.ts`'s `coreWorkItems` at the moved
file (the module scan this packet adds already covers the directory), then register
`module.application.work-item` (predecessor blob `29ab341f9befec90944900d13f9c9c823d06de95`), re-pin
the legacy digest, and tick 5.1.

## 5. File plan

Every path is under `libs/wbs/application/core/src/` unless it starts with `apps/`, `docs/`,
`openspec/` or `tools/`.

| Path                                                                                                                    | Slice      | Action                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `module/calendar-marker/module.test.ts`, `module/capacity/module.test.ts`                                               | 1          | create **first**, for the reds (10.1, 10.2)                                       |
| `module/calendar-marker/calendar-marker.resource.ts`, `module/capacity/capacity.resource.ts`                            | 1          | `cp` from `service/<name>.service.ts`, then 10.3's import diff                    |
| `module/calendar-marker/calendar-marker.resource.test.ts`                                                               | 1          | **`mv`** from `service/calendar-marker.service.test.ts`, then 10.3's import diff  |
| `service/calendar-marker.service.ts`, `service/capacity.service.ts`                                                     | 1          | content replaced by the shims of 10.4                                             |
| `module/calendar-marker/{contract,module,check}.ts`, `README.md`; the same four under `module/capacity/`                | 1, 4       | create (10.5, 10.6); slice 4 adds the index block and "Wiki registration" by diff |
| `compose.ts`, `index.ts`, `docs/code-organization/kinds.json`                                                           | 1, 2, 3    | 10.7, 10.18, 10.27                                                                |
| `compose.test.ts`                                                                                                       | 1, 2, 3    | the per-scope cases (10.8, 10.19, 10.28), then their Proofs (10.11, 10.20, 10.29) |
| `ports/sideways-type-boundaries.test.ts`                                                                                | 1          | one row and one JSDoc paragraph (10.9), then its Proof (10.11)                    |
| `apps/wbs/be-01/src/service/clock.test.ts`                                                                              | 1          | the module scan and the moved Capacity path (10.10), then two Proofs (10.11)      |
| `module/priority-band/*`, `module/step/*`, `service/priority-band.service.ts`, `service/step.service.ts`                | 2          | as slice 1 (10.12-10.20)                                                          |
| `module/project/*`, `module/directory/*`, `service/project.service.ts`, `service/directory.service.ts`                  | 3          | as slice 1 (10.21-10.26)                                                          |
| `docs/wiki-policy/modules.json`, `policy.json`; `apps/wiki/cli/src/policy/pilot-policy.test.ts`; the six module READMEs | 4          | three diffs per module, in order (10.30)                                          |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                               | 4          | legacy re-pin (10.31)                                                             |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                        | 4          | 5.1's dated note (unticked), 7.5 extended (10.32)                                 |
| `openspec/changes/adopt-di-composition/verify.md`                                                                       | 1, 2, 3, 4 | each slice appends its own observations                                           |

**Directory contents.** `module/calendar-marker/` holds **seven** files: `README.md`,
`calendar-marker.resource.test.ts`, `calendar-marker.resource.ts`, `check.ts`, `contract.ts`,
`module.test.ts`, `module.ts`. Each of the other five holds **six**: `README.md`, `<name>.resource.ts`,
`check.ts`, `contract.ts`, `module.test.ts`, `module.ts`. Slice 4's index block names every file but
the README.

**Neighbours.** Packet E6 owns `module/plan-document/`, `apps/wbs/be-01/src/module/solver-launcher/`,
the eighteenth sideways row, the Solver launcher's wiki rows and the legacy pin's last Proof; this
packet appends after each and edits none. The only E6 file an executor touches is
`module/plan-document/plan-document.resource.ts`, and only as the transient fault of row 21,
restored with `cp` and proved with `cmp`. `tasks.md` has been touched by every 040.6 packet; this
packet's edits are to 5.1 and to 7.5's running note. Section 12's hand-over lists are scoped to each
slice's own `base`, so the planner's own commits cannot break them.

## 6. Rehearsed observations

Every row was produced on the throwaway branch in a private worktree of `c1770237`, against the
exact listings of section 10, and restored with `cp` + `cmp` before the next. Rows marked
**evidence** are the planner's measurements behind a decision; the executor does not repeat them.

**The five sealed-module faults, per module.** Rows 9-18, 32-41 and 51-60 apply one of these to one
module's files. `<export>`, `<Options>` and `<LABEL>` are that module's export key, private
binding and label constant (`calendarMarkers`/`calendarMarkerOptions`/`CALENDAR_MARKER_LABEL`,
`capacity`/`capacityOptions`/`CAPACITY_LABEL`, `priorityBands`/`priorityBandOptions`/`PRIORITY_BAND_LABEL`,
`steps`/`stepOptions`/`STEP_LABEL`, `projects`/`projectOptions`/`PROJECT_LABEL`,
`directory`/`directoryOptions`/`DIRECTORY_LABEL`).

```text
tuple     module.ts: .buildModule(['<export>'], { label: <LABEL> })
          -> .buildModule(['<export>', '<Options>'], { label: <LABEL> })
label     module.ts: .buildModule(['<export>'], { label: <LABEL> })  ->  .buildModule(['<export>'])
bag       check.ts:  return { <export>: bag.resolve('<export>') };
          -> const exposed = { <export>: bag.resolve('<export>'), bag };
             return exposed;
resolver  check.ts:  return { <export>: bag.resolve('<export>') };
          -> return { <export>: Object.assign(bag.resolve('<export>'), { resolve: bag.resolve.bind(bag) }) };
```

**The per-scope fault, per resource** (rows 19, 20, 42, 43, 61, 62). In `compose.ts`, insert one
line and a blank line immediately before `export interface ServicesOverOptions {`, and wrap that
resource's installer call in `servicesOver` in a memo. For Capacity:

```text
let reusedCapacity: ReturnType<typeof installCapacity> | undefined;

    capacity: installCapacity({ ...unchanged fields... }).capacity,
 -> capacity: (reusedCapacity ??= installCapacity({ ...unchanged fields... })).capacity,
```

The others use `reusedCalendarMarker`/`installCalendarMarker`/`calendarMarkers`,
`reusedPriorityBand`/`installPriorityBand`/`priorityBands`, `reusedStep`/`installStep`/`steps`,
`reusedProject`/`installProject`/`projects` and `reusedDirectory`/`installDirectory`/`directory`.
Run only that resource's case with `-t` (the title prefix is in the row): a whole-file run fails
the same case, but on its first assertion, because an earlier test's composition fills the memo.

| #     | Where                                                                                                    | Fault injected                                                                                                                                     | Test that observed it                                                                              | Literal fragment observed                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | slice 1 red, unchanged tree                                                                              | none; `check.ts` does not exist                                                                                                                    | `module/calendar-marker/module.test.ts`                                                            | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                            |
| 2     | slice 1 red                                                                                              | none                                                                                                                                               | `module/capacity/module.test.ts`                                                                   | the same, `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                          |
| 3     | slice 1 step 0, unchanged `compose.ts`                                                                   | none                                                                                                                                               | `bun build libs/wbs/application/core/src/compose.ts --target=bun`, then `grep -cF` for each label  | build exit 0; `application.calendar-marker count=0 (grep exit 1)`, `application.capacity count=0 (grep exit 1)`                                                                                                                                                                                  |
| 4     | slice 1, after 10.4's Capacity shim                                                                      | none; the move itself                                                                                                                              | `apps/wbs/be-01/src/service/clock.test.ts`                                                         | `is reading real service sources, not an empty list` fails: `Expected to contain: "export class CapacityService"`, `Received:` the shim's text; `3 pass`, `1 fail`                                                                                                                               |
| 5     | slice 1 green                                                                                            | none                                                                                                                                               | `bun test ./libs/wbs/application/core/src/module/calendar-marker/`                                 | `22 pass`, `0 fail`, `40 expect() calls`, 2 files                                                                                                                                                                                                                                                |
| 6     | slice 1 green                                                                                            | none                                                                                                                                               | `bun test ./libs/wbs/application/core/src/module/capacity/`                                        | `5 pass`, `0 fail`, `7 expect() calls`                                                                                                                                                                                                                                                           |
| 7     | slice 1, after 10.10                                                                                     | none                                                                                                                                               | `clock.test.ts`                                                                                    | `4 pass`, `0 fail`                                                                                                                                                                                                                                                                               |
| 8     | slice 1, after 10.7                                                                                      | `servicesOver` installs both                                                                                                                       | row 3's build and greps                                                                            | `count=1` each                                                                                                                                                                                                                                                                                   |
| 9     | Calendar marker, `module.ts`                                                                             | tuple                                                                                                                                              | the private-binding test and the two label tests                                                   | `Received function did not throw`; `Expected to contain: "application.calendar-marker/calendarMarkerOptions"`; message `Cannot resolve "calendarMarkerOptions"`; `2 pass`, `3 fail`                                                                                                              |
| 10    | Calendar marker, `module.ts`                                                                             | label                                                                                                                                              | `labels its private bindings with the module name`, `names itself when a host omits a requirement` | `3 pass`, `2 fail`; the private-binding test stays green                                                                                                                                                                                                                                         |
| 11    | Calendar marker, `module.ts`, the `calendarMarkerOptions` factory's return                               | the line `        broadcast,` after `        clock,` deleted from the returned object                                                              | `announces a created marker through the broadcaster installCalendarMarker wires`                   | `- [ { "event": { "type": "calendar_markers_changed" }, … } ]`, `+ []`; `4 pass`, `1 fail`                                                                                                                                                                                                       |
| 12    | Calendar marker, `check.ts`                                                                              | bag                                                                                                                                                | `exposes only the contract exports from its installer`, first assertion                            | received keys add `"bag"`; `4 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                                                                                                                       |
| 13    | Calendar marker, `check.ts`                                                                              | resolver                                                                                                                                           | the same test, second assertion                                                                    | `Expected: true`, `Received: false`; `4 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                                                        |
| 14-15 | Capacity, `module.ts`                                                                                    | tuple; label                                                                                                                                       | as rows 9 and 10                                                                                   | `2 pass`, `3 fail`; `3 pass`, `2 fail`                                                                                                                                                                                                                                                           |
| 16    | Capacity, `module.ts`, the `capacityOptions` factory's return                                            | `        broadcast,` → `        broadcast: { ...broadcast, publish: () => Promise.resolve() },`                                                    | `announces a capacity write through the broadcaster installCapacity wires`                         | `+ []`; `4 pass`, `1 fail`                                                                                                                                                                                                                                                                       |
| 17-18 | Capacity, `check.ts`                                                                                     | bag; resolver                                                                                                                                      | as rows 12 and 13                                                                                  | `4 pass`, `1 fail` each; typecheck exit 0 each                                                                                                                                                                                                                                                   |
| 19    | `compose.ts`                                                                                             | the per-scope fault for Calendar marker                                                                                                            | `-t "installs Calendar marker per supplied scope"`                                                 | `-   "value": [],` / `+   "value": [` … `"name": "Launch"` …; `0 pass`, `10 filtered out`, `1 fail`; typecheck exit 0                                                                                                                                                                            |
| 20    | `compose.ts`                                                                                             | the per-scope fault for Capacity                                                                                                                   | `-t "installs Capacity per supplied scope"`                                                        | `- []` / `+ [ { "serviceTeamId": "team-1", "size": 3 } ]`; `0 pass`, `10 filtered out`, `1 fail`; typecheck exit 0                                                                                                                                                                               |
| 21    | `module/plan-document/plan-document.resource.ts` (E6's file; restored)                                   | two lines prepended: `import type { CalendarMarkerService } from '../../index';` and `export type BarrelMarkers = CalendarMarkerService;`          | `ports/sideways-type-boundaries.test.ts`                                                           | exactly `"module/plan-document/plan-document.resource.ts: CalendarMarkerService reaches module/calendar-marker/calendar-marker.resource.ts"`; `Expected - 1`, `Received + 3`; `0 pass`, `1 fail`                                                                                                 |
| 22    | **evidence**: row 21 before 10.9's row existed                                                           | same two lines                                                                                                                                     | same suite                                                                                         | `1 pass`, `0 fail` — the fifth and eighteenth rows no longer see a barrel-named `CalendarMarkerService`                                                                                                                                                                                          |
| 23    | **evidence**: row 21 on the unchanged `c1770237` tree                                                    | same two lines                                                                                                                                     | same suite                                                                                         | `"…: CalendarMarkerService reaches service/calendar-marker.service.ts"`; `0 pass`, `1 fail` — the coverage the move would have lost                                                                                                                                                              |
| 24    | `module/capacity/capacity.resource.ts`, `CapacityServiceOptions`                                         | `  now?: () => number;` inserted after `  clock: Clock;`                                                                                           | `clock.test.ts` › `is the only clock a service that stamps a write reads`                          | `+   "libs/wbs/application/core/src/module/capacity/capacity.resource.ts",`; `3 pass`, `1 fail`                                                                                                                                                                                                  |
| 25    | `clock.test.ts`, `serviceFolders`                                                                        | `  return [...FOLDERS, ...modules];` → `  return [...FOLDERS];`                                                                                    | `is reading real service sources, not an empty list`                                               | `Received: undefined` at the `coreCapacity` assertion; `3 pass`, `1 fail`                                                                                                                                                                                                                        |
| 26-27 | slice 2 reds                                                                                             | none                                                                                                                                               | `module/priority-band/module.test.ts`, `module/step/module.test.ts`                                | `Cannot find module './check'`; `0 pass`, `1 fail`, `1 error` each                                                                                                                                                                                                                               |
| 28    | slice 2 step 0                                                                                           | none                                                                                                                                               | row 3's build; greps for `application.priority-band`, `application.step`                           | `count=0 (grep exit 1)` each                                                                                                                                                                                                                                                                     |
| 29-30 | slice 2 greens                                                                                           | none                                                                                                                                               | `bun test ./…/module/priority-band/`, `./…/module/step/`                                           | `5 pass`, `0 fail`, `7 expect() calls` each                                                                                                                                                                                                                                                      |
| 31    | slice 2, after 10.18                                                                                     | `servicesOver` installs both                                                                                                                       | the same build and greps                                                                           | `count=1` each                                                                                                                                                                                                                                                                                   |
| 32-33 | Priority band, `module.ts`                                                                               | tuple; label                                                                                                                                       | as rows 9 and 10                                                                                   | `2 pass`, `3 fail`; `3 pass`, `2 fail`                                                                                                                                                                                                                                                           |
| 34    | Priority band, the `priorityBandOptions` factory's return                                                | `        broadcast,` → `        broadcast: { ...broadcast, publish: () => Promise.resolve() },`                                                    | `announces a ladder write through the broadcaster installPriorityBand wires`                       | `+ []`; `4 pass`, `1 fail`                                                                                                                                                                                                                                                                       |
| 35-36 | Priority band, `check.ts`                                                                                | bag; resolver                                                                                                                                      | as rows 12 and 13                                                                                  | `4 pass`, `1 fail` each; typecheck exit 0 each                                                                                                                                                                                                                                                   |
| 37-38 | Step, `module.ts`                                                                                        | tuple; label                                                                                                                                       | as rows 9 and 10                                                                                   | `2 pass`, `3 fail`; `3 pass`, `2 fail`                                                                                                                                                                                                                                                           |
| 39    | Step, the `stepOptions` factory's return                                                                 | `        broadcast,` → `        broadcast: { ...broadcast, publish: () => Promise.resolve() },`                                                    | `announces an added step through the broadcaster installStep wires`                                | `+ []`; `4 pass`, `1 fail`                                                                                                                                                                                                                                                                       |
| 40-41 | Step, `check.ts`                                                                                         | bag; resolver                                                                                                                                      | as rows 12 and 13                                                                                  | `4 pass`, `1 fail` each; typecheck exit 0 each                                                                                                                                                                                                                                                   |
| 42    | `compose.ts`                                                                                             | the per-scope fault for Priority band                                                                                                              | `-t "installs Priority band per supplied scope"`                                                   | `-     "label": "Critical",` / `+     "label": "Critical now",` (five rungs); `0 pass`, `12 filtered out`, `1 fail`                                                                                                                                                                              |
| 43    | `compose.ts`                                                                                             | the per-scope fault for Step                                                                                                                       | `-t "installs Step per supplied scope"`                                                            | `-   "ok": false,` `-   "reason": "not_found",` / `+   "ok": true,` `+   "value": { … "name": "Renamed" … }`; `0 pass`, `12 filtered out`, `1 fail`                                                                                                                                              |
| 44    | **evidence**: a first draft of 10.12 and 10.19 that wrote `{ startsAt: 1, label: 'Now' }`                | none                                                                                                                                               | `wbs-core:typecheck`                                                                               | `TS2741: Property 'defaultValue' is missing in type '{ startsAt: number; label: string; }'` — why both listings carry `defaultValue`                                                                                                                                                             |
| 45-46 | slice 3 reds                                                                                             | none                                                                                                                                               | `module/project/module.test.ts`, `module/directory/module.test.ts`                                 | `Cannot find module './check'`; `0 pass`, `1 fail`, `1 error` each                                                                                                                                                                                                                               |
| 47    | slice 3 step 0                                                                                           | none                                                                                                                                               | row 3's build; greps for `application.project`, `application.directory`                            | `count=0 (grep exit 1)` each                                                                                                                                                                                                                                                                     |
| 48-49 | slice 3 greens                                                                                           | none                                                                                                                                               | `bun test ./…/module/project/`, `./…/module/directory/`                                            | `5 pass`, `0 fail`, `7 expect() calls` each                                                                                                                                                                                                                                                      |
| 50    | slice 3, after 10.27                                                                                     | `servicesOver` installs both                                                                                                                       | the same build and greps                                                                           | `count=1` each                                                                                                                                                                                                                                                                                   |
| 51-52 | Project, `module.ts`                                                                                     | tuple; label                                                                                                                                       | as rows 9 and 10                                                                                   | `2 pass`, `3 fail`; `3 pass`, `2 fail`                                                                                                                                                                                                                                                           |
| 53    | Project, the `projectOptions` factory's return                                                           | the line `        optimizerAvailable,` deleted from the returned object                                                                            | `switches the optimizer on through the availability installProject wires`                          | `+   "ok": false,` `+   "reason": "optimizer_unavailable",`; `4 pass`, `1 fail`                                                                                                                                                                                                                  |
| 54-55 | Project, `check.ts`                                                                                      | bag; resolver                                                                                                                                      | as rows 12 and 13                                                                                  | `4 pass`, `1 fail` each; typecheck exit 0 each                                                                                                                                                                                                                                                   |
| 56-57 | Directory, `module.ts`                                                                                   | tuple; label                                                                                                                                       | as rows 9 and 10                                                                                   | `2 pass`, `3 fail`; `3 pass`, `2 fail`                                                                                                                                                                                                                                                           |
| 58    | Directory, the `directoryOptions` factory's return                                                       | `({ directory: directoryStore, broadcast, clock })` → `({ directory: directoryStore, broadcast, clock: { ...clock, newId: () => 'unsupplied' } })` | `names a new team with the clock installDirectory wires`                                           | `-   "id": "team-1",` / `+   "id": "unsupplied",`; `4 pass`, `1 fail`                                                                                                                                                                                                                            |
| 59-60 | Directory, `check.ts`                                                                                    | bag; resolver                                                                                                                                      | as rows 12 and 13                                                                                  | `4 pass`, `1 fail` each; typecheck exit 0 each                                                                                                                                                                                                                                                   |
| 61    | `compose.ts`                                                                                             | the per-scope fault for Project                                                                                                                    | `-t "installs Project per supplied scope"`                                                         | `expect(received).toBeNull()`, `Received: {` (the first scope's project); `0 pass`, `14 filtered out`, `1 fail`                                                                                                                                                                                  |
| 62    | `compose.ts`                                                                                             | the per-scope fault for Directory                                                                                                                  | `-t "installs Directory per supplied scope"`                                                       | `+   "Operations",`; `0 pass`, `14 filtered out`, `1 fail`                                                                                                                                                                                                                                       |
| 63-80 | slice 4, for each module in the order Calendar marker, Capacity, Directory, Priority band, Project, Step | its `modules.json` row alone; then its boundary; then its `pilotPaths` entry and final README                                                      | `pins exact pre-index tuples and passes observe lint from external trust`                          | row alone: `pilot-policy.test.ts:377` `Expected: 12`, `Received: 13` (the line and both numbers rise by one per module: `:378` 13/14, `:379` 14/15, `:380` 15/16, `:381` 16/17, `:382` 17/18); boundary: `:414` `Expected: true`, `Received: false` (`:415` … `:419`); index: `1 pass`, `0 fail` |
| 81    | slice 4 green                                                                                            | all six registered                                                                                                                                 | the whole `pilot-policy.test.ts`                                                                   | `21 pass`, `0 fail`, `305 expect() calls` (baseline `21`/`0`/`299`: one more per-boundary assertion each)                                                                                                                                                                                        |
| 82    | slice 4, legacy pin unchanged, after registration                                                        | none                                                                                                                                               | `every legacy source occurrence and relevant text family is pinned`                                | `historical policy selector or baseline` `51` → `63`, `occurrences` `269` → `281`, digest `113681cd…` → `5864733ccd1d50e0a81c9c0f71b3bb20a46565ed4200f417ed0b9b1d56f9a5e2`; `Expected - 3` / `Received + 3`; `0 pass`, `1 fail`                                                                  |
| 83    | slice 4, after 10.31's first diff                                                                        | none                                                                                                                                               | the same test                                                                                      | `1 pass`                                                                                                                                                                                                                                                                                         |

Each module assertion has its own mutation: tuple and label are independent (the label fault leaves
the private-binding test green); bag and resolver split the installer test's two assertions; one
provider edge per module breaks one real requirement (the broadcaster for four, the optimizer
availability for Project, the clock for Directory); each per-scope case has its own memo. Row 21
produces **exactly one** violation, and rows 22-23 show the new row is what restores the coverage
the move removed. The expect() counts in rows 63-80 rise by one per registered boundary (24, 28 and
34 for Calendar marker up to 29, 33 and 39 for Step).

**No compile red, on purpose.** No slice changes a type anyone else sees: each installer returns the
class `servicesOver` used to construct, so `WritingServices` is unchanged, and a `@ts-expect-error`
would have nothing true to assert. The installation reds are rows 3, 28 and 47: the `compose.ts`
bundle contains no module label until `servicesOver` calls the installer. The per-scope cases are
green on unchanged code, because `new` already builds per call; rows 19, 20, 42, 43, 61 and 62 are
what prove they can fail.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses with
`if cmd >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"`;
never read a status through `tee`, never `|| true`. Start lint, typecheck and format targets the
same way and poll their logs (preamble rule 19). Scratch lives only under `"$TMPDIR"`, faults and
failing output under `"$TMPDIR/evidence"`; `verify.md` cites basenames only. You never run
`git add`, `git commit` or `git mv`: moves are `cp` and `mv`, and the planner stages them. A fault
is injected by editing the file, observed, then restored with `cp` from a `"$TMPDIR"` copy and
proved with `cmp`; save each fault as a patch (`git diff -- <file>` while it is in place) and its
failing output beside it. Every step 0 opens with `base=$(git rev-parse HEAD)` and an empty-status
check; every count compared (`K`, `C`, `F`, `E`, `EF`, `M`, `B`, `T`, `TF`, `P`, `N`) is assigned in
the slice that compares it.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`. After
appending to `verify.md`, run `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
before the format check.

**The shared baseline block.** Slices 1 to 3 record their baselines with this block, with `<n>`
their slice number and `<label1>`, `<label2>` the two labels the slice installs
(`application.calendar-marker` and `application.capacity`; `application.priority-band` and
`application.step`; `application.project` and `application.directory`). The lint and typecheck
run first on purpose (addendum 14).

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
for label in <label1> <label2>; do
  if count=$(grep -cF "$label" "$bundle"); then echo "$label count=$count"; else status=$?; test "$status" -eq 1; echo "$label count=0 (grep exit 1)"; fi
done
```

Expect `exit=0` in all four logs. Call the core pass count `C` and file count `F`, and the be-01
unit pass count `E` and file count `EF` (`app.routes.test.ts`'s six tests are the planner's). Expect
both labels at `count=0 (grep exit 1)`. The green bundle (step 4 of each slice) reruns the same
build with `-green` in place of `-red` in both file names and expects `count=1` for each label.

### Slice 1 — Seal Calendar marker and Capacity and install them per supplied scope

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e libs/wbs/application/core/src/module/calendar-marker && test ! -e libs/wbs/application/core/src/module/capacity && echo "gate: modules absent"
test -f libs/wbs/application/core/src/module/plan-document/module.ts && test -f apps/wbs/be-01/src/module/solver-launcher/module.ts && echo "gate: E6 landed"
wc -l < libs/wbs/application/core/src/service/calendar-marker.service.ts
wc -l < libs/wbs/application/core/src/service/capacity.service.ts
grep -cF "calendarMarkers: new CalendarMarkerService({" libs/wbs/application/core/src/compose.ts
grep -cF "capacity: new CapacityService({" libs/wbs/application/core/src/compose.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `193`, `96`, `1`, `1`, then a number: call it `K` (observed
`93`). Then run the shared baseline block with `n=1` and the labels `application.calendar-marker`
and `application.capacity` (observed `C=577` over `F=60`, `E=520` over `EF=49`; row 3). This slice
ends at `C + 12` over `F + 2` (two `module.test.ts` files of five tests each, two `compose.test.ts`
cases; the moved resource test keeps its seventeen) and at `E` over `EF`.

**Steps — tests first, then the implementation, in this one slice.**

1. `mkdir -p libs/wbs/application/core/src/module/calendar-marker libs/wbs/application/core/src/module/capacity`,
   create each `module.test.ts` from 10.1 and 10.2 verbatim, and run
   `bun test ./libs/wbs/application/core/src/module/calendar-marker/module.test.ts` and the same
   for `capacity`. Expect rows 1 and 2. Save both logs. These reds are evidence, not commits.
2. Move the code. From the repository root:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
cp "$c/service/calendar-marker.service.ts" "$c/module/calendar-marker/calendar-marker.resource.ts"
mv "$c/service/calendar-marker.service.test.ts" "$c/module/calendar-marker/calendar-marker.resource.test.ts"
cp "$c/service/capacity.service.ts" "$c/module/capacity/capacity.resource.ts"
```

Then apply 10.3's diff (import lines only, three files), and replace both `service/` files' content
with 10.4's shims. The `mv` is an **authorised deletion** of the old test path: its seventeen tests
must exist at exactly one path, and no file imports a test. Now run
`bun test ./apps/wbs/be-01/src/service/clock.test.ts` and expect row 4's red: the move itself
removes `export class CapacityService` from the path that test pins. Save it.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` in both directories from 10.5 and
   10.6 verbatim (no `Proof:` comments; no `module-index` block yet — slice 4 adds it). Run
   `bun test ./libs/wbs/application/core/src/module/calendar-marker/` → row 5, and
   `bun test ./libs/wbs/application/core/src/module/capacity/` → row 6.
4. Apply 10.7's diff (`compose.ts` installs both through their installers and documents why
   `servicesOver` installs per call; `index.ts` gains four export lines; two `kinds.json` rows
   rewritten in place). Rerun the bundle of the shared block with `-green` names → `count=1` for
   both labels (row 8).
5. Apply 10.8's diff (`compose.test.ts`: the `servicesOver` describe with its two first cases).
   `bun test ./libs/wbs/application/core/src/compose.test.ts` → `11 pass`, `0 fail`. They are green
   on the installed tree and would be green on `new` too; rows 19 and 20 prove they can fail.
6. Apply 10.9's diff (one sideways row and one JSDoc paragraph; the existing rows are unchanged) and
   run `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → `1 pass`.
   Apply 10.10's diff (the module scan and the moved Capacity path in `clock.test.ts`) and rerun
   `clock.test.ts` → row 7.
7. `wbs-core` and `wbs-be-01` lint and typecheck, under the status wrapper → exit 0. Only rule-17
   diagnostics (`simple-import-sort/*`, `prettier/prettier`) may be fixed with `bunx eslint --fix`
   on files this slice owns; anything else is a stop.
8. The negatives of section 6, **one at a time, each restored and `cmp`-proved before the next**:
   rows 9-13 against `bun test ./libs/wbs/application/core/src/module/calendar-marker/module.test.ts`;
   rows 14-18 against the Capacity `module.test.ts`; rows 19 and 20 against
   `bun test ./libs/wbs/application/core/src/compose.test.ts -t "<the row's title>"`; row 21 (E6's
   `module/plan-document/plan-document.resource.ts`, two lines prepended) against the sideways
   suite; rows 24 and 25 against `clock.test.ts`. For rows 12, 13, 17, 18, 19 and 20 also run
   `wbs-core:typecheck` on the mutated tree and record its exit 0. Rows 22 and 23 are not required.
9. Only now apply 10.11's diff: the Proof comments in both `module.ts` and both `check.ts`, the two
   `compose.test.ts` cases, the sideways JSDoc and `clock.test.ts`. Change the date only if yours
   differs, and change a fragment only if what you saw differs (then record the difference).
10. Planner-only, and why: `tools/tool-devsync/src/service-kinds.test.ts` compares `kinds.json` to
    `git ls-files`, which the planner's staging settles. Run this filesystem substitute instead and
    expect `93 []` (`K` unchanged, no row naming a missing file):

```sh
python3 -c "import json,os;e=json.load(open('docs/code-organization/kinds.json'))['entries'];print(len(e),[x['path'] for x in e if not os.path.isfile(x['path'])])"
```

11. Closing checks, each under the status wrapper: `(cd libs/wbs/application/core && bun test src)`
    → exit 0, `C + 12` over `F + 2` (observed `589` over 62); the be-01 unit command → `E` over `EF`
    (observed `520` over 49); `wbs-core` and `wbs-be-01` lint and typecheck → exit 0;
    `test "$(ls libs/wbs/application/core/src/module/calendar-marker | wc -l)" -eq 7`;
    `test "$(ls libs/wbs/application/core/src/module/capacity | wc -l)" -eq 6`;
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
12. Append to `openspec/changes/adopt-di-composition/verify.md` a
    `### Calendar marker and Capacity, Slice 1 — <date>` section: `base`, `K`, `C`/`F`, `E`/`EF`,
    rows 1-8, every fault of rows 9-21, 24 and 25 with its fragment and evidence basenames, the
    step-10 substitute, and one line: "delivery still accepts `CalendarMarkerService` and reaches
    `CapacityService` through the composed graph (K2), tracked under 7.4". Prettier on it, then
    rerun the format check.
13. Hand-over: section 12's slice-1 modified and deleted paths must equal
    `git diff --name-only "$base"`, and its new paths `git ls-files --others --exclude-standard`.

Planner commit: `refactor(core): seal Calendar marker and Capacity and install them per supplied scope`.
The planner stages with `git add -A` over exactly section 12's paths; Git's rename detection
reports `calendar-marker.resource.test.ts` as a rename. The planner then runs `tool-devsync:test`
whole on the commit (section 8).

### Slice 2 — Seal Priority band and Step and install them per supplied scope

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/capacity/module.ts && echo "gate: slice 1 landed"
test ! -e libs/wbs/application/core/src/module/priority-band && test ! -e libs/wbs/application/core/src/module/step && echo "gate: modules absent"
wc -l < libs/wbs/application/core/src/service/priority-band.service.ts
wc -l < libs/wbs/application/core/src/service/step.service.ts
grep -cF "priorityBands: new PriorityBandService({" libs/wbs/application/core/src/compose.ts
grep -cF "steps: new StepService({" libs/wbs/application/core/src/compose.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `82`, `244`, `1`, `1`, then `K` (observed `93`). Run the
shared baseline block with `n=2` and the labels `application.priority-band` and `application.step`
(observed `C=589` over `F=62`, `E=520` over `EF=49`; row 28). This slice ends at `C + 12` over
`F + 2` and at `E` over `EF`.

1. `mkdir -p` both `module/priority-band` and `module/step`, create each `module.test.ts` from 10.12
   and 10.13 verbatim, run each → rows 26 and 27. Save both logs.
2. Move the code:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
cp "$c/service/priority-band.service.ts" "$c/module/priority-band/priority-band.resource.ts"
cp "$c/service/step.service.ts" "$c/module/step/step.resource.ts"
```

Then apply 10.14's diff (import lines only; Step's two support imports become
`../../service/assumed-assignee` and `../../service/clean-name`), and replace both `service/` files'
content with 10.15's shims.

3. Create the four files of each module from 10.16 and 10.17 verbatim. Run both directories →
   rows 29 and 30.
4. Apply 10.18's diff (`compose.ts`, `index.ts`, two `kinds.json` rows). Green bundle → row 31.
5. Apply 10.19's diff (two more `compose.test.ts` cases). `bun test ./libs/wbs/application/core/src/compose.test.ts`
   → `13 pass`, `0 fail`.
6. `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
7. The negatives, one at a time, each restored and `cmp`-proved: rows 32-36 against the Priority
   band `module.test.ts`, rows 37-41 against the Step `module.test.ts`, rows 42 and 43 against
   `compose.test.ts -t "<the row's title>"`. For rows 35, 36, 40, 41, 42 and 43 also run
   `wbs-core:typecheck` on the mutated tree and record its exit 0. Row 44 is not required.
8. Only now apply 10.20's diff (Proofs in both `module.ts`, both `check.ts` and the two new
   `compose.test.ts` cases).
9. The step-10 substitute of slice 1 → `93 []`.
10. Closing checks, each under the status wrapper: core → `C + 12` over `F + 2` (observed `601` over
    64); be-01 unit → `E` over `EF`; `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; each of
    the two directories holds exactly six files (`ls … | wc -l`); the format check → exit 0.
11. Append `### Priority band and Step, Slice 2 — <date>` to `verify.md` with the same items as
    slice 1 for rows 26-43, and the line: "Step still imports `service/assumed-assignee.ts` and
    `service/clean-name.ts` (task 6.1); delivery still accepts `StepService` (K2, task 7.4)".
    Prettier on it, then the format check.
12. Hand-over as in slice 1, against section 12's slice-2 lists.

Planner commit: `refactor(core): seal Priority band and Step and install them per supplied scope`.

### Slice 3 — Seal Project and Directory and install them per supplied scope

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/step/module.ts && echo "gate: slice 2 landed"
test ! -e libs/wbs/application/core/src/module/project && test ! -e libs/wbs/application/core/src/module/directory && echo "gate: modules absent"
wc -l < libs/wbs/application/core/src/service/project.service.ts
wc -l < libs/wbs/application/core/src/service/directory.service.ts
grep -cF "projects: new ProjectService({" libs/wbs/application/core/src/compose.ts
grep -cF "directory: new DirectoryService({ clock, directory: stores.directory, broadcast })," libs/wbs/application/core/src/compose.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `310`, `743`, `1`, `1`, then `K` (observed `93`). Run the
shared baseline block with `n=3` and the labels `application.project` and `application.directory`
(observed `C=601` over `F=64`, `E=520` over `EF=49`; row 47). This slice ends at `C + 12` over
`F + 2` and at `E` over `EF`.

1. `mkdir -p` both `module/project` and `module/directory`, create each `module.test.ts` from 10.21
   and 10.22 verbatim, run each → rows 45 and 46.
2. Move the code:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
cp "$c/service/project.service.ts" "$c/module/project/project.resource.ts"
cp "$c/service/directory.service.ts" "$c/module/directory/directory.resource.ts"
```

Then apply 10.23's diff (import lines only; Directory's two support imports become
`../../service/clean-name` and `../../service/directory-usage`), and replace both `service/` files'
content with 10.24's shims.

3. Create the four files of each module from 10.25 and 10.26 verbatim. Run both directories →
   rows 48 and 49.
4. Apply 10.27's diff. Green bundle → row 50.
5. Apply 10.28's diff. `bun test ./libs/wbs/application/core/src/compose.test.ts` → `15 pass`,
   `0 fail`.
6. `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
7. The negatives, one at a time, each restored and `cmp`-proved: rows 51-55 against the Project
   `module.test.ts`, rows 56-60 against the Directory `module.test.ts`, rows 61 and 62 against
   `compose.test.ts -t "<the row's title>"`. For rows 54, 55, 59, 60, 61 and 62 also run
   `wbs-core:typecheck` on the mutated tree and record its exit 0.
8. Only now apply 10.29's diff.
9. The step-10 substitute of slice 1 → `93 []`.
10. Closing checks: core → `C + 12` over `F + 2` (observed `613` over 66); be-01 unit → `E` over
    `EF`; lint and typecheck → exit 0; each of the two directories holds exactly six files; the
    format check → exit 0.
11. Append `### Project and Directory, Slice 3 — <date>` to `verify.md` with the same items for rows
    45-62 and the line: "Directory still imports `service/clean-name.ts` and
    `service/directory-usage.ts` (task 6.1); delivery, Plan import, Plan commands and Saved plans
    still name the two resources directly (K2, task 7.4)". Prettier on it, then the format check.
12. Hand-over as in slice 1, against section 12's slice-3 lists.

Planner commit: `refactor(core): seal Project and Directory and install them per supplied scope`.
The planner then runs `tool-devsync:test` and whole `wbs-be-01:test` (section 8).

### Slice 4 — Register the six resource modules in the wiki content-review pilot and record the tasks

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- libs/wbs/application/core/src/module/directory/module.ts
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
for name in calendar-marker capacity directory priority-band project step; do git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- "libs/core/src/service/$name.service.ts"; done
```

Expect `base=…`, the gate, a commit hash, `M` and `B` (observed `12` and `12`), then exactly six
lines, each `100644 blob <sha>	libs/core/src/service/<name>.service.ts`, with the six shas of
section 3 in this order. If any line is missing or differs, stop. Then, before any edit, each under
the status wrapper:

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all. Call the pilot file's tests, failures and `expect()` calls `T`, `TF`, `P`
(observed `21`, `0`, `299`; the run takes about 340 seconds). The legacy pin passes (`1 pass`). Run
the OpenSpec validation standard block and call `passed` `N` (observed `114`).

**Registration, one module at a time, in the order it must be observed.** The pilot suite clones
committed `HEAD` and overlays only `pilotPaths` from the working tree
(`pilot-policy.test.ts:30-49`); slices 1-3 are committed, so each module's files are in `HEAD`, and
its README there has no `module-index` block yet. The filtered command is

```sh
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples")
```

(about 35 seconds). 10.30 holds eighteen diffs, three per module, in the order Calendar marker,
Capacity, Directory, Priority band, Project, Step. For each module, in that order:

1. Apply its **row** diff (`modules.json`: one row, sorted). Run the filtered command → the PARITY
   red of rows 63-80 (`Expected: <n>`, `Received: <n + 1>`). Save it.
2. Apply its **boundary** diff (`policy.json`: one boundary appended last). Rerun → the
   DISCOVERED-INDEX red (`Expected: true`, `Received: false`). Save it.
3. Apply its **index** diff (the `pilotPaths` entry, sorted, and that module's README gaining its
   `module-index` block, the `check.core.test` sentence and "Wiki registration"). Rerun →
   `1 pass`. Save it.

Then:

4. Rerun the **whole** pilot file → row 81: `T` tests, `TF` failures, `P + 6` assertions. The
   prose-refusal pin does not move (its first refused index is a be-01 README, which sorts first).
5. Rerun the legacy-pin test **with the pin unchanged** → red (row 82). Save it. Only then apply
   10.31's first diff (the numbers), rerun → `1 pass` (row 83), and then apply 10.31's second diff
   (the Proof comment). No other pinned literal in that file may move; if one does, stop.
6. Apply 10.32 (`tasks.md`: 5.1's dated note, **unticked**; 7.5's running note extended).
7. Rerun step 0's run-many typecheck, `twilight-burokrat:lint:source` and `tool-devsync:lint` →
   exit 0; rerun the legacy-pin test alone → `1 pass`. Do **not** run
   `repo-namespacing-handoff.test.ts` whole: its `production index checker resolves current Markdown
links` test spawns `check-indexes working`, which writes Git objects, so the whole file is
   planner-only (section 8). The OpenSpec block → `passed` `N`, `failed` `0`.
8. Append `### Resource module registration, Slice 4 — <date>` to `verify.md`: `base`, `M`, `B`,
   the six frozen tuples, the eighteen observations of rows 63-80 with evidence basenames,
   `T`/`TF`/`P` before and after, rows 82 and 83, the three checks, `N`. Prettier on it, then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `docs(core): register the six per-admission resource modules in the wiki content-review pilot`.

**Planner-only, after this commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 4 commit>`
is **index validation** (`checkIndexes`), not the `MOD-LAYOUT` rule. Rehearsed against the
throwaway slice-4 commit `7661c212`: exit 0, 22 indexes, among them the six
`module.application.*` ids with six members (Calendar marker) or five members (the others) and
`applicableChecks` `["check.core.test"]`; `reviewDebt` empty.

## 8. Planner-only checks

| Check                                                                                                                                                                                                          | Why the planner's                                                                                                                         | Observed on the rehearsed tree                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moved-code identity: for each file of 10.3, 10.14 and 10.23, copy the `$base` version of the source path to a scratch file, apply that file's section of the diff, and `cmp` it with the committed module file | Proves the six moved bodies and the moved test differ only in import depth                                                                | section 15's script does the same; all seven equal                                                                                                            |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged                                                                                   | Writes Git objects; `service-kinds.test.ts` needs the staged tree                                                                         | slices 1, 2, 3 and 4: `366` tests over 25 files, exit 0 each                                                                                                  |
| `(cd apps/wbs/be-01 && bun test)` (the whole `wbs-be-01:test` command, without coverage)                                                                                                                       | Opens SQLite databases and spawns processes; 20 be-01 files construct the moved services through the deep-import shims                    | `1097 pass`, `1 skip` over 92 files at slice 4 (the same as `c1770237`)                                                                                       |
| `bun test ./apps/wbs/be-01/src/app.routes.test.ts`                                                                                                                                                             | Its health-route framing test listens on a TCP port, which a sandbox refuses (`EPERM … listen`)                                           | covered by the whole-target row above                                                                                                                         |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`, then `grep -cF 'application.<name>"'` over `dist/libs/wbs/application/core/portable-composition.js` for the six names                   | The portable bundle composes `servicesOver` in the browser build; `test:portable` needs Playwright                                        | build exit 0; `count=1` for each of the six labels. `wbs-core:test:portable` itself **not run** (no browser here)                                             |
| `check-indexes committed` on slice 4                                                                                                                                                                           | Index validation, not MOD-LAYOUT                                                                                                          | 22 indexes, the six new modules with their members, no review debt                                                                                            |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test` and `:test:package`                                                                                                                                       | Whole listener suite; package suite listens                                                                                               | **not run** (only the pilot file was run)                                                                                                                     |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the whole file                                                                                                                           | Its `production index checker resolves current Markdown links` test spawns `check-indexes working` (`git add --update`, `git write-tree`) | the executor runs only `-t "every legacy source occurrence"`; the whole file ran green inside the `tool-devsync:test` row above on all four rehearsal commits |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                                     | Host-wide heavy lock                                                                                                                      | **not run**                                                                                                                                                   |

This table supplements the batch-1 README's "Integration verification" matrix.

**Between slices 1 and 4** each new module directory holds a `.resource.ts` file and a README with
no `module-index` block, which the Burokrat rule model's `MOD-LAYOUT` observation reports as
"module directory declares no wiki index". Packets E5 and E6 had the same gap; nothing gates on it,
and slice 4 closes it. The block is withheld on purpose: with it in `HEAD`, slice 4's
DISCOVERED-INDEX red could not be observed.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What the next 040.6 packets should be

1. **E8 — Work item and the tick of 5.1**, scoped in section 4.
2. **Task 5.2, Plan commands**, whose per-scope `batchServices` then resolves seven installed
   resources; its Working plan and announcement collector become private.
3. **Delivery's resource dependencies (K2, task 7.4).** Every module this packet seals is still
   named directly by routes and by two features; that is one change for an accepted K2 design, not a
   module move.

## 10. Exact content

`c` below is `libs/wbs/application/core/src`. Listings are complete file contents; diffs apply with
`git apply` from the repository root.

### 10.1 `c/module/calendar-marker/module.test.ts` (slice 1 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installCalendarMarker } from './check';
import { CALENDAR_MARKER_LABEL } from './contract';
import { calendarMarkerModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/** One memory source holding one project, and the requirements a marker write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  let next = 0;
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      projects: source.stores.projects,
      markers: source.stores.calendarMarkers,
      clock: clockOf({ now: () => 2, newId: () => `marker-${String(++next)}` }),
      broadcast,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    projectStore: DiBag.fromSyncFactory(() => source.stores.projects),
    calendarMarkerStore: DiBag.fromSyncFactory(() => source.stores.calendarMarkers),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
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
    .installModule(calendarMarkerModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Calendar marker module', () => {
  it('announces a created marker through the broadcaster installCalendarMarker wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { calendarMarkers } = installCalendarMarker(requirements);

    const created = await calendarMarkers.create(PROJECT, OWNER, {
      date: '2026-09-30',
      name: 'Launch',
    });

    expect(created).toEqual({
      ok: true,
      value: {
        id: 'marker-1',
        projectId: PROJECT,
        date: '2026-09-30',
        name: 'Launch',
        color: null,
        createdAt: 2,
      },
    });
    expect(broadcast.published).toEqual([
      { projectId: PROJECT, event: { type: 'calendar_markers_changed' } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `CalendarMarkerExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installCalendarMarker(requirements);

    expect(Object.keys(exposed)).toEqual(['calendarMarkers']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('calendarMarkerOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "calendarMarkerOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${CALENDAR_MARKER_LABEL}/calendarMarkerOptions`,
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
      .installModule(calendarMarkerModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('calendarMarkers')).toThrow(
      `Cannot resolve "${CALENDAR_MARKER_LABEL}/calendarMarkerOptions": dependency "clock" is not registered. Resolution path: calendarMarkers -> ${CALENDAR_MARKER_LABEL}/calendarMarkerOptions -> clock.`,
    );
  });
});
```

### 10.2 `c/module/capacity/module.test.ts` (slice 1 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installCapacity } from './check';
import { CAPACITY_LABEL } from './contract';
import { capacityModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';
const TEAM = 'team-1';

/** One memory source holding one project and one team, and the requirements a capacity write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  await source.stores.directory.addTeam({ id: TEAM, name: 'Platform' }, { at: 1, by: OWNER });
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      projects: source.stores.projects,
      capacity: source.stores.capacity,
      clock: clockOf({ now: () => 2, newId: () => 'unused' }),
      broadcast,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    projectStore: DiBag.fromSyncFactory(() => source.stores.projects),
    capacityStore: DiBag.fromSyncFactory(() => source.stores.capacity),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
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
    .installModule(capacityModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Capacity module', () => {
  it('announces a capacity write through the broadcaster installCapacity wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { capacity } = installCapacity(requirements);

    const written = await capacity.set(PROJECT, OWNER, TEAM, 3);

    expect(written).toEqual({ ok: true, value: [{ serviceTeamId: TEAM, size: 3 }] });
    expect(broadcast.published).toEqual([
      { projectId: PROJECT, event: { type: 'capacity_changed' } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `CapacityExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installCapacity(requirements);

    expect(Object.keys(exposed)).toEqual(['capacity']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('capacityOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "capacityOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${CAPACITY_LABEL}/capacityOptions`,
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
      .installModule(capacityModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('capacity')).toThrow(
      `Cannot resolve "${CAPACITY_LABEL}/capacityOptions": dependency "clock" is not registered. Resolution path: capacity -> ${CAPACITY_LABEL}/capacityOptions -> clock.`,
    );
  });
});
```

### 10.3 Import lines of the three moved files (slice 1 step 2 — applied after the `cp`/`mv`)

```diff
diff --git a/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.ts b/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.ts
@@ -3,11 +3,11 @@ import { canEditProject, type IsoDate } from '@wbs/domain';
 import type {
   CalendarMarkerListOutcome,
   CalendarMarkerRefused,
-} from '../ports/calendar-marker-read';
-import type { CalendarMarker, CalendarMarkerStore } from '../ports/calendar-marker-store';
-import type { Clock } from '../ports/clock';
-import type { Broadcaster } from '../ports/project-event';
-import type { ProjectStore } from '../ports/project-store';
+} from '../../ports/calendar-marker-read';
+import type { CalendarMarker, CalendarMarkerStore } from '../../ports/calendar-marker-store';
+import type { Clock } from '../../ports/clock';
+import type { Broadcaster } from '../../ports/project-event';
+import type { ProjectStore } from '../../ports/project-store';

 export interface CalendarMarkerServiceOptions {
   projects: ProjectStore;
@@ -36,7 +36,7 @@ export type {
   CalendarMarkerRefusal,
   CalendarMarkerRefused,
   CalendarMarkerSubject,
-} from '../ports/calendar-marker-read';
+} from '../../ports/calendar-marker-read';

 /** What a create carries that is not the project or the actor. */
 export interface NewCalendarMarker {
diff --git a/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.test.ts b/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.test.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.test.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/calendar-marker.resource.test.ts
@@ -3,13 +3,13 @@ import { inMemoryProjects, projectRow } from '@wbs/store-memory/project-fixture'
 import { testCalendarMarkerService } from '@wbs/store-memory/testing/service-fixtures';
 import { describe, expect, it } from 'bun:test';

-import type { CalendarMarker } from '../index';
-import { type RecordingBroadcaster, recordingBroadcaster } from '../testing/broadcast-fixture';
+import type { CalendarMarker } from '../../index';
+import { type RecordingBroadcaster, recordingBroadcaster } from '../../testing/broadcast-fixture';
 import type {
   CalendarMarkerOutcome,
   CalendarMarkerRefusal,
   CalendarMarkerService,
-} from './calendar-marker.service';
+} from './calendar-marker.resource';

 const PROJECT = 'proj-1';
 const OWNER = 'owner';
diff --git a/libs/wbs/application/core/src/module/capacity/capacity.resource.ts b/libs/wbs/application/core/src/module/capacity/capacity.resource.ts
--- a/libs/wbs/application/core/src/module/capacity/capacity.resource.ts
+++ b/libs/wbs/application/core/src/module/capacity/capacity.resource.ts
@@ -1,9 +1,9 @@
 import { canEditProject } from '@wbs/domain';

-import type { CapacityStore, TeamCapacity } from '../ports/capacity-store';
-import type { Clock } from '../ports/clock';
-import type { Broadcaster } from '../ports/project-event';
-import type { ProjectStore } from '../ports/project-store';
+import type { CapacityStore, TeamCapacity } from '../../ports/capacity-store';
+import type { Clock } from '../../ports/clock';
+import type { Broadcaster } from '../../ports/project-event';
+import type { ProjectStore } from '../../ports/project-store';

 export interface CapacityServiceOptions {
   projects: ProjectStore;
```

### 10.4 The two compatibility shims (slice 1 step 2 — full replacement content)

`c/service/calendar-marker.service.ts`:

```ts
/**
 * Compatibility re-export: Calendar marker moved into its own sealed module.
 *
 * Kept because delivery (`http/calendar-marker.routes.ts`, `http/project.routes.ts`),
 * test fixtures, two rows of `ports/sideways-type-boundaries.test.ts`, `@wbs/core`'s
 * barrel and be-01's own deep-import shim name this path. It goes when every
 * importer names the module.
 */
export * from '../module/calendar-marker/calendar-marker.resource';
```

`c/service/capacity.service.ts`:

```ts
/**
 * Compatibility re-export: Capacity moved into its own sealed module.
 *
 * Kept because `service/plan-commands.ts`, `@wbs/core`'s barrel and be-01's own
 * deep-import shim name this path. It goes when every importer names the
 * module.
 */
export * from '../module/capacity/capacity.resource';
```

### 10.5 Calendar marker's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type {
  CalendarMarkerService,
  CalendarMarkerServiceOptions,
} from './calendar-marker.resource';

/**
 * What a host must supply to install {@link calendarMarkerModule}.
 *
 * Exactly {@link CalendarMarkerServiceOptions}, unchanged by the move: the
 * project and marker stores of the one scope being installed over, the clock,
 * and the optional broadcaster. `servicesOver` supplies the stores of each
 * admitted scope, so one installation never outlives the scope it was built
 * over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Calendar marker is a resource: it
 * imports the domain library and repository ports and no other resource, and
 * `ports/sideways-type-boundaries.test.ts` keeps Plan document from reading
 * markers through it. What this extraction does not close is delivery's side:
 * `http/calendar-marker.routes.ts` and `http/project.routes.ts` still accept
 * `CalendarMarkerService` directly, the direct resource dependency of delivery
 * (K2) the backend module map lists under its composition hazards. Tracked
 * under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type CalendarMarkerRequirements = CalendarMarkerServiceOptions;

/** What installing {@link calendarMarkerModule} adds to a host graph. */
export interface CalendarMarkerExports {
  readonly calendarMarkers: CalendarMarkerService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.calendar-marker` and the label
 * drops the `module.` prefix.
 */
export const CALENDAR_MARKER_LABEL = 'application.calendar-marker';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { CalendarMarkerStore } from '../../ports/calendar-marker-store';
import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import {
  CalendarMarkerService,
  type CalendarMarkerServiceOptions,
} from './calendar-marker.resource';
import { CALENDAR_MARKER_LABEL } from './contract';

/**
 * Calendar marker as a sealed DI Bag module.
 *
 * Only `calendarMarkers` is exported. `calendarMarkerOptions` stays private to
 * each installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.calendar-marker/calendarMarkerOptions` rather
 * than against an anonymous binding. The two stores are required as
 * `projectStore` and `calendarMarkerStore` because the host graph's
 * `calendarMarkers` key is this module's export. `broadcast` is registered
 * even when absent, as `undefined`, the way Saved plans registers its optional
 * quota: the resource then announces nothing, as it always has.
 *
 * The module registers no disposer: `CalendarMarkerService` holds the borrowed
 * stores of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const calendarMarkerModule = DiBag.createBuilder()
  .register({
    calendarMarkerOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        calendarMarkerStore,
        clock,
        broadcast,
      }: {
        projectStore: ProjectStore;
        calendarMarkerStore: CalendarMarkerStore;
        clock: Clock;
        broadcast: Broadcaster | undefined;
      }): CalendarMarkerServiceOptions => ({
        projects: projectStore,
        markers: calendarMarkerStore,
        clock,
        broadcast,
      }),
    ),
  })
  .register({
    calendarMarkers: DiBag.fromSyncFactory(
      ({
        calendarMarkerOptions,
      }: {
        calendarMarkerOptions: CalendarMarkerServiceOptions;
      }): CalendarMarkerService => new CalendarMarkerService(calendarMarkerOptions),
    ),
  })
  .buildModule(['calendarMarkers'], { label: CALENDAR_MARKER_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { CalendarMarkerExports, CalendarMarkerRequirements } from './contract';
import { calendarMarkerModule } from './module';

/**
 * Installs {@link calendarMarkerModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Calendar marker
 * can reach a private binding or a host key through it. The type checker does
 * not enforce that on its own: an object with an extra property returned
 * through a variable still satisfies {@link CalendarMarkerExports}, so the
 * module's tests enumerate what this function returns.
 */
export function installCalendarMarker(
  requirements: CalendarMarkerRequirements,
): CalendarMarkerExports {
  const bag = DiBag.createBuilder()
    .installModule(calendarMarkerModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      calendarMarkerStore: DiBag.fromSyncFactory(() => requirements.markers),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
    })
    .build();
  return { calendarMarkers: bag.resolve('calendarMarkers') };
}
```

`README.md` (slice 4 adds the index block and "Wiki registration"):

```md
# Calendar marker

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the clock and the optional broadcaster
a host must supply.

`calendar-marker.resource.ts` (the moved `service/calendar-marker.service.ts`) lists a project's
markers and gates their four writes on `canEditProject`, announcing `calendar_markers_changed` after
each. Private bindings are named under the `application.calendar-marker` label, so a DI failure says
which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/calendar-marker.service.ts` keeps the former path for
delivery, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.6 Capacity's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type { CapacityService, CapacityServiceOptions } from './capacity.resource';

/**
 * What a host must supply to install {@link capacityModule}.
 *
 * Exactly {@link CapacityServiceOptions}, unchanged by the move: the project
 * and capacity stores of the one scope being installed over, the broadcaster
 * and the clock. `servicesOver` supplies the stores of each admitted scope, so
 * one installation never outlives the scope it was built over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Capacity is a resource: it imports
 * the domain library and repository ports and no other resource. What this
 * extraction does not close is delivery's and Plan commands' side:
 * `service/plan-commands.ts` still names `CapacityService` directly, and
 * delivery reaches it through the composed graph rather than a feature
 * contract (K2), which the backend module map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type CapacityRequirements = CapacityServiceOptions;

/** What installing {@link capacityModule} adds to a host graph. */
export interface CapacityExports {
  readonly capacity: CapacityService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.capacity` and the label drops the
 * `module.` prefix.
 */
export const CAPACITY_LABEL = 'application.capacity';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { CapacityStore } from '../../ports/capacity-store';
import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import { CapacityService, type CapacityServiceOptions } from './capacity.resource';
import { CAPACITY_LABEL } from './contract';

/**
 * Capacity as a sealed DI Bag module.
 *
 * Only `capacity` is exported. `capacityOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.capacity/capacityOptions` rather than against
 * an anonymous binding. The two stores are required as `projectStore` and
 * `capacityStore` because the host graph's `capacity` key is this module's
 * export.
 *
 * The module registers no disposer: `CapacityService` holds the borrowed
 * stores of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const capacityModule = DiBag.createBuilder()
  .register({
    capacityOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        capacityStore,
        broadcast,
        clock,
      }: {
        projectStore: ProjectStore;
        capacityStore: CapacityStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): CapacityServiceOptions => ({
        projects: projectStore,
        capacity: capacityStore,
        broadcast,
        clock,
      }),
    ),
  })
  .register({
    capacity: DiBag.fromSyncFactory(
      ({ capacityOptions }: { capacityOptions: CapacityServiceOptions }): CapacityService =>
        new CapacityService(capacityOptions),
    ),
  })
  .buildModule(['capacity'], { label: CAPACITY_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { CapacityExports, CapacityRequirements } from './contract';
import { capacityModule } from './module';

/**
 * Installs {@link capacityModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Capacity can reach
 * a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link CapacityExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installCapacity(requirements: CapacityRequirements): CapacityExports {
  const bag = DiBag.createBuilder()
    .installModule(capacityModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      capacityStore: DiBag.fromSyncFactory(() => requirements.capacity),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  return { capacity: bag.resolve('capacity') };
}
```

`README.md`:

```md
# Capacity

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the broadcaster and the clock a host
must supply.

`capacity.resource.ts` (the moved `service/capacity.service.ts`) lists how many of each team a
project may have at work at once and gates the write on `canEditProject`, announcing
`capacity_changed` to that project alone. Private bindings are named under the
`application.capacity` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/capacity.service.ts` keeps the former path for Plan commands,
`@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.7 `compose.ts`, `index.ts` and `kinds.json` (slice 1 step 4)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -246,15 +246,13 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/calendar-marker.service.ts",
-      "kind": "resource",
-      "term": "calendar marker",
-      "rationale": "calendar-marker and project routes call it for the calendar marker aggregate's rules over CalendarMarkerStore and ProjectStore, with Clock and Broadcaster ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the calendar-marker module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/capacity.service.ts",
-      "kind": "resource",
-      "term": "capacity",
-      "rationale": "composeServices and PlanCommandRunner use it for the capacity aggregate's edit rules over CapacityStore and ProjectStore, with Clock and Broadcaster ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the capacity module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/clean-name.ts",
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -5,6 +5,8 @@ import { installAuthentication } from './module/authentication/check';
 import type { LoginThrottle } from './module/authentication/login-throttle';
 import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
 import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
+import { installCalendarMarker } from './module/calendar-marker/check';
+import { installCapacity } from './module/capacity/check';
 import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
 import { installPlanImport } from './module/plan-import/check';
@@ -25,8 +27,6 @@ import type { Source } from './ports/source';
 import type { PlanTransactionalStores, TransactionalStores } from './ports/stores';
 import type { Intervals, Timers } from './ports/timers';
 import type { Scope } from './ports/unit-of-work';
-import { CalendarMarkerService } from './service/calendar-marker.service';
-import { CapacityService } from './service/capacity.service';
 import { DirectoryService } from './service/directory.service';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
 import { PriorityBandService } from './service/priority-band.service';
@@ -72,7 +72,17 @@ export interface ServicesOverOptions {
   readonly scheduler: Scheduler;
 }

-/** Builds the writing services over exactly the stores admitted to this act. */
+/**
+ * Builds the writing services over exactly the stores admitted to this act.
+ *
+ * Called once for the public graph and once per admitted batch or import, so
+ * every resource module is installed here, per call, over the stores it is
+ * handed — never once for the process. A shared installation would hand one
+ * batch's staged stores to the next: the backend module map's "A singleton
+ * module installation here would leak staged stores" hazard, and the
+ * `Writing modules are installed per admitted scope` requirement of
+ * `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`.
+ */
 export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOverOptions) {
   const { clock, broadcast, scheduler } = shared;
   return {
@@ -82,18 +92,18 @@ export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOv
       broadcast,
       optimizerAvailable: () => scheduler.supports('optimized'),
     }),
-    capacity: new CapacityService({
+    capacity: installCapacity({
       clock,
       projects: stores.projects,
       capacity: stores.capacity,
       broadcast,
-    }),
-    calendarMarkers: new CalendarMarkerService({
+    }).capacity,
+    calendarMarkers: installCalendarMarker({
       clock,
       projects: stores.projects,
       markers: stores.calendarMarkers,
       broadcast,
-    }),
+    }).calendarMarkers,
     priorityBands: new PriorityBandService({
       clock,
       projects: stores.projects,
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -20,6 +20,10 @@ export * from './module/authentication/contract';
 export * from './module/authentication/module';
 export * from './module/bounded-replay-sweep/contract';
 export * from './module/bounded-replay-sweep/module';
+export * from './module/calendar-marker/contract';
+export * from './module/calendar-marker/module';
+export * from './module/capacity/contract';
+export * from './module/capacity/module';
 export * from './module/plan-document/contract';
 export * from './module/plan-document/module';
 export * from './module/plan-history/contract';
```

### 10.8 The first two per-scope cases (slice 1 step 5)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -1,11 +1,14 @@
 import { noopLogger } from '@wbs/contracts';
 import { openMemorySource } from '@wbs/store-memory';
+import { projectRow } from '@wbs/store-memory/project-fixture';
 import { describe, expect, test } from 'bun:test';

 import {
   type AccountlessSource,
   composeServices,
   type RuntimePorts,
+  servicesOver,
+  type ServicesOverOptions,
   type SharedComposition,
   type WritingServices,
 } from './compose';
@@ -14,6 +17,7 @@ import type { Broadcaster } from './ports/project-event';
 import type { Scope } from './ports/unit-of-work';
 import type { Decision } from './ports/unit-of-work';
 import { PlanCommandRunner } from './service/plan-commands';
+import { recordingBroadcaster } from './testing/broadcast-fixture';
 import { fastScheduler } from './testing/scheduler-fixture';
 import { replay } from './use-cases/replay';
 import { savePlan } from './use-cases/save-plan';
@@ -380,3 +384,57 @@ describe('composeServices', () => {
     });
   });
 });
+
+/**
+ * `servicesOver` installs each per-admission resource over the stores it is
+ * handed, once per call, so two admitted scopes over distinct stores never
+ * share one: the `Writing modules are installed per admitted scope`
+ * requirement. Each resource has a case of its own, so a shared installation
+ * of any one of them fails its own case.
+ */
+describe('servicesOver', () => {
+  const PROJECT = 'project-1';
+  const OWNER = 'owner';
+  const TEAM = 'team-1';
+
+  /** One source holding the project and the team, and a writing graph over its stores. */
+  async function scopeOver(shared: ServicesOverOptions): Promise<WritingServices> {
+    const source = openMemorySource();
+    await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
+      at: 1,
+      by: OWNER,
+    });
+    await source.stores.directory.addTeam({ id: TEAM, name: 'Platform' }, { at: 1, by: OWNER });
+    return servicesOver(source.stores, shared);
+  }
+
+  /** Two such scopes, sharing only what every admission shares. */
+  async function twoScopes(): Promise<{
+    readonly first: WritingServices;
+    readonly second: WritingServices;
+  }> {
+    let next = 0;
+    const shared: ServicesOverOptions = {
+      clock: clockOf({ now: () => 1_000, newId: () => `id-${String(++next)}` }),
+      broadcast: recordingBroadcaster(),
+      scheduler: fastScheduler,
+    };
+    return { first: await scopeOver(shared), second: await scopeOver(shared) };
+  }
+
+  test("installs Calendar marker per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    expect(
+      await first.calendarMarkers.create(PROJECT, OWNER, { date: '2026-09-30', name: 'Launch' }),
+    ).toMatchObject({ ok: true });
+    expect(await second.calendarMarkers.list(PROJECT)).toEqual({ ok: true, value: [] });
+  });
+
+  test("installs Capacity per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    expect(await first.capacity.set(PROJECT, OWNER, TEAM, 3)).toMatchObject({ ok: true });
+    expect(await second.capacity.listFor(PROJECT)).toEqual([]);
+  });
+});
```

### 10.9 The nineteenth sideways row (slice 1 step 6)

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -153,6 +153,12 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * violation, `"module/plan-document/plan-document.resource.ts:
  * '../../service/calendar-marker.service' reaches service/calendar-marker.service.ts"`
  * (0 pass, 1 fail); with this row deleted the same import left the suite passing (1 pass).
+ *
+ * The nineteenth row follows the Calendar marker resource into its own module:
+ * once `service/calendar-marker.service.ts` became a compatibility re-export of
+ * `module/calendar-marker/calendar-marker.resource.ts`, a `CalendarMarkerService`
+ * named through the `@wbs/core` barrel resolves to the moved file without
+ * passing through the shim, so the fifth and eighteenth rows stopped seeing it.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -221,6 +227,10 @@ const routes = [
     reaches: 'service/calendar-marker.service.ts',
     from: (path: string) => path.startsWith('module/plan-document/'),
   },
+  {
+    reaches: 'module/calendar-marker/calendar-marker.resource.ts',
+    from: (path: string) => path.startsWith('module/plan-document/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.10 The clock scan over sealed modules (slice 1 step 6)

```diff
diff --git a/apps/wbs/be-01/src/service/clock.test.ts b/apps/wbs/be-01/src/service/clock.test.ts
--- a/apps/wbs/be-01/src/service/clock.test.ts
+++ b/apps/wbs/be-01/src/service/clock.test.ts
@@ -10,6 +10,13 @@ import { describe, expect, it } from 'bun:test';
  * not moved yet.
  */
 const FOLDERS = ['apps/wbs/be-01/src/service', 'libs/wbs/application/core/src/service'];
+/**
+ * Where a core service goes when it is sealed as a DI Bag module. Its body
+ * lives in `<module>/<name>.resource.ts` or `.feature.ts` and its former
+ * `service/` path is a one-line re-export, so a scan of {@link FOLDERS} alone
+ * would stop reading every service the moment it is sealed.
+ */
+const MODULES = 'libs/wbs/application/core/src/module';
 const ROOT = join(import.meta.dir, '../../../../..');

 /**
@@ -27,8 +34,16 @@ const AGE_THEIR_OWN_ENTRIES = new Set([
   'login-throttle.ts',
 ]);

+/** {@link FOLDERS} and every sealed core module's own directory. */
+function serviceFolders(): string[] {
+  const modules = readdirSync(join(ROOT, MODULES), { withFileTypes: true })
+    .filter((entry) => entry.isDirectory())
+    .map((entry) => `${MODULES}/${entry.name}`);
+  return [...FOLDERS, ...modules];
+}
+
 function serviceSources(): { name: string; path: string; text: string }[] {
-  return FOLDERS.flatMap((folder) =>
+  return serviceFolders().flatMap((folder) =>
     readdirSync(join(ROOT, folder))
       .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
       .map((name) => ({
@@ -84,7 +99,7 @@ describe('one clock', () => {
     expect(sources.map((file) => file.name)).toContain('work-item.service.ts');
     expect(sources.some((file) => file.text.includes('this.clock.stampFor('))).toBe(true);
     const coreCapacity = sources.find(
-      (file) => file.path === 'libs/wbs/application/core/src/service/capacity.service.ts',
+      (file) => file.path === 'libs/wbs/application/core/src/module/capacity/capacity.resource.ts',
     );
     const coreWorkItems = sources.find(
       (file) => file.path === 'libs/wbs/application/core/src/service/work-item.service.ts',
```

### 10.11 Slice 1's Proof comments (slice 1 step 9 — only after rows 9-21, 24 and 25 were observed)

```diff
diff --git a/libs/wbs/application/core/src/module/calendar-marker/module.ts b/libs/wbs/application/core/src/module/calendar-marker/module.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/module.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/module.ts
@@ -39,6 +39,9 @@ export const calendarMarkerModule = DiBag.createBuilder()
         calendarMarkerStore: CalendarMarkerStore;
         clock: Clock;
         broadcast: Broadcaster | undefined;
+        // Proof (2026-09-24): leaving `broadcast` out of the returned options left
+        // `announces a created marker through the broadcaster installCalendarMarker wires` failing
+        // (4 pass, 1 fail): the recording broadcaster received `[]`.
       }): CalendarMarkerServiceOptions => ({
         projects: projectStore,
         markers: calendarMarkerStore,
@@ -56,4 +59,12 @@ export const calendarMarkerModule = DiBag.createBuilder()
       }): CalendarMarkerService => new CalendarMarkerService(calendarMarkerOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['calendarMarkers', 'calendarMarkerOptions']`
+  // left the private-binding, graph-label and missing-requirement assertions failing (2 pass,
+  // 3 fail): `resolve('calendarMarkerOptions')` did not throw, `inspectGraph()` reported bare
+  // `calendarMarkerOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: CALENDAR_MARKER_LABEL }` left only the two label
+  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `calendarMarkerOptions`
+  // unlabelled, and the missing-requirement message named `calendarMarkerOptions` instead of
+  // `application.calendar-marker/calendarMarkerOptions`.
   .buildModule(['calendarMarkers'], { label: CALENDAR_MARKER_LABEL });
diff --git a/libs/wbs/application/core/src/module/calendar-marker/check.ts b/libs/wbs/application/core/src/module/calendar-marker/check.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/check.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/check.ts
@@ -25,5 +25,11 @@ export function installCalendarMarker(
       broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `CalendarMarkerService` kept the key
+  // list correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { calendarMarkers: bag.resolve('calendarMarkers') };
 }
diff --git a/libs/wbs/application/core/src/module/capacity/module.ts b/libs/wbs/application/core/src/module/capacity/module.ts
--- a/libs/wbs/application/core/src/module/capacity/module.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.ts
@@ -37,6 +37,10 @@ export const capacityModule = DiBag.createBuilder()
       }): CapacityServiceOptions => ({
         projects: projectStore,
         capacity: capacityStore,
+        // Proof (2026-09-24): handing the resource
+        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
+        // broadcaster left `announces a capacity write through the broadcaster installCapacity wires`
+        // failing (4 pass, 1 fail): it received `[]`.
         broadcast,
         clock,
       }),
@@ -48,4 +52,12 @@ export const capacityModule = DiBag.createBuilder()
         new CapacityService(capacityOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['capacity', 'capacityOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('capacityOptions')` did not throw, `inspectGraph()` reported bare `capacityOptions`,
+  // and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: CAPACITY_LABEL }` left only the two label assertions
+  // failing (3 pass, 2 fail): `inspectGraph()` reported `capacityOptions` unlabelled, and the
+  // missing-requirement message named `capacityOptions` instead of
+  // `application.capacity/capacityOptions`.
   .buildModule(['capacity'], { label: CAPACITY_LABEL });
diff --git a/libs/wbs/application/core/src/module/capacity/check.ts b/libs/wbs/application/core/src/module/capacity/check.ts
--- a/libs/wbs/application/core/src/module/capacity/check.ts
+++ b/libs/wbs/application/core/src/module/capacity/check.ts
@@ -23,5 +23,11 @@ export function installCapacity(requirements: CapacityRequirements): CapacityExp
       clock: DiBag.fromSyncFactory(() => requirements.clock),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `CapacityService` kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { capacity: bag.resolve('capacity') };
 }
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -428,6 +428,9 @@ describe('servicesOver', () => {
     expect(
       await first.calendarMarkers.create(PROJECT, OWNER, { date: '2026-09-30', name: 'Launch' }),
     ).toMatchObject({ ok: true });
+    // Proof (2026-09-24): memoizing one `installCalendarMarker(...)` result in a module-level
+    // `let` and handing it to every `servicesOver` call left this case failing (0 pass, 1 fail,
+    // run alone with `-t`): the second scope listed the first scope's `Launch` marker.
     expect(await second.calendarMarkers.list(PROJECT)).toEqual({ ok: true, value: [] });
   });

@@ -435,6 +438,9 @@ describe('servicesOver', () => {
     const { first, second } = await twoScopes();

     expect(await first.capacity.set(PROJECT, OWNER, TEAM, 3)).toMatchObject({ ok: true });
+    // Proof (2026-09-24): memoizing one `installCapacity(...)` result in a module-level `let` and
+    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
+    // with `-t`): the second scope listed the first scope's `{ serviceTeamId: "team-1", size: 3 }`.
     expect(await second.capacity.listFor(PROJECT)).toEqual([]);
   });
 });
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -159,6 +159,14 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * `module/calendar-marker/calendar-marker.resource.ts`, a `CalendarMarkerService`
  * named through the `@wbs/core` barrel resolves to the moved file without
  * passing through the shim, so the fifth and eighteenth rows stopped seeing it.
+ *
+ * Proof (2026-09-24): prepending `import type { CalendarMarkerService } from '../../index';`
+ * and `export type BarrelMarkers = CalendarMarkerService;` to
+ * `module/plan-document/plan-document.resource.ts` failed this suite with exactly one
+ * violation, `"module/plan-document/plan-document.resource.ts: CalendarMarkerService
+ * reaches module/calendar-marker/calendar-marker.resource.ts"` (0 pass, 1 fail); with this
+ * row deleted the same two lines left the suite passing (1 pass), and before the move they
+ * were reported against `service/calendar-marker.service.ts`.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
diff --git a/apps/wbs/be-01/src/service/clock.test.ts b/apps/wbs/be-01/src/service/clock.test.ts
--- a/apps/wbs/be-01/src/service/clock.test.ts
+++ b/apps/wbs/be-01/src/service/clock.test.ts
@@ -34,7 +34,15 @@ const AGE_THEIR_OWN_ENTRIES = new Set([
   'login-throttle.ts',
 ]);

-/** {@link FOLDERS} and every sealed core module's own directory. */
+/**
+ * {@link FOLDERS} and every sealed core module's own directory.
+ *
+ * Proof (2026-09-24): adding `now?: () => number;` to the moved
+ * `CapacityServiceOptions` in `module/capacity/capacity.resource.ts` failed
+ * `is the only clock a service that stamps a write reads` on expected [],
+ * received ["libs/wbs/application/core/src/module/capacity/capacity.resource.ts"]
+ * (3 pass, 1 fail).
+ */
 function serviceFolders(): string[] {
   const modules = readdirSync(join(ROOT, MODULES), { withFileTypes: true })
     .filter((entry) => entry.isDirectory())
@@ -98,6 +106,8 @@ describe('one clock', () => {
     expect(sources.length).toBeGreaterThan(20);
     expect(sources.map((file) => file.name)).toContain('work-item.service.ts');
     expect(sources.some((file) => file.text.includes('this.clock.stampFor('))).toBe(true);
+    // Proof (2026-09-24): returning `[...FOLDERS]` from `serviceFolders` failed the
+    // `coreCapacity` assertion below on Received: undefined (3 pass, 1 fail).
     const coreCapacity = sources.find(
       (file) => file.path === 'libs/wbs/application/core/src/module/capacity/capacity.resource.ts',
     );
```

### 10.12 `c/module/priority-band/module.test.ts` (slice 2 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installPriorityBand } from './check';
import { PRIORITY_BAND_LABEL } from './contract';
import { priorityBandModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/** One memory source holding one project, and the requirements a ladder write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      projects: source.stores.projects,
      bands: source.stores.priorityBands,
      clock: clockOf({ now: () => 2, newId: () => 'unused' }),
      broadcast,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    projectStore: DiBag.fromSyncFactory(() => source.stores.projects),
    priorityBandStore: DiBag.fromSyncFactory(() => source.stores.priorityBands),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
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
    .installModule(priorityBandModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Priority band module', () => {
  it('announces a ladder write through the broadcaster installPriorityBand wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { priorityBands } = installPriorityBand(requirements);

    const written = await priorityBands.set(PROJECT, OWNER, [
      { startsAt: 1, label: ' Now ', defaultValue: 10 },
    ]);

    expect(written).toEqual({ ok: true, value: [{ startsAt: 1, label: 'Now', defaultValue: 10 }] });
    expect(broadcast.published).toEqual([
      { projectId: PROJECT, event: { type: 'priority_bands_changed' } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `PriorityBandExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installPriorityBand(requirements);

    expect(Object.keys(exposed)).toEqual(['priorityBands']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('priorityBandOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "priorityBandOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PRIORITY_BAND_LABEL}/priorityBandOptions`,
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
      .installModule(priorityBandModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('priorityBands')).toThrow(
      `Cannot resolve "${PRIORITY_BAND_LABEL}/priorityBandOptions": dependency "clock" is not registered. Resolution path: priorityBands -> ${PRIORITY_BAND_LABEL}/priorityBandOptions -> clock.`,
    );
  });
});
```

### 10.13 `c/module/step/module.test.ts` (slice 2 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installStep } from './check';
import { STEP_LABEL } from './contract';
import { stepModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/** One memory source holding one project, and the requirements a step write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  let next = 0;
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      projects: source.stores.projects,
      steps: source.stores.steps,
      clock: clockOf({ now: () => 2, newId: () => `step-${String(++next)}` }),
      broadcast,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    projectStore: DiBag.fromSyncFactory(() => source.stores.projects),
    stepStore: DiBag.fromSyncFactory(() => source.stores.steps),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
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
    .installModule(stepModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Step module', () => {
  it('announces an added step through the broadcaster installStep wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { steps } = installStep(requirements);

    const added = await steps.add(PROJECT, OWNER, ' Review ');
    if (!added.ok) throw new Error(`the step was refused: ${added.reason}`);

    expect(added.value).toMatchObject({ id: 'step-1', projectId: PROJECT, name: 'Review' });
    expect(broadcast.published).toEqual([
      { projectId: PROJECT, event: { type: 'step_added', step: added.value } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `StepExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installStep(requirements);

    expect(Object.keys(exposed)).toEqual(['steps']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('stepOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "stepOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${STEP_LABEL}/stepOptions`,
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
      .installModule(stepModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('steps')).toThrow(
      `Cannot resolve "${STEP_LABEL}/stepOptions": dependency "clock" is not registered. Resolution path: steps -> ${STEP_LABEL}/stepOptions -> clock.`,
    );
  });
});
```

### 10.14 Import lines of the two moved files (slice 2 step 2)

```diff
diff --git a/libs/wbs/application/core/src/module/priority-band/priority-band.resource.ts b/libs/wbs/application/core/src/module/priority-band/priority-band.resource.ts
--- a/libs/wbs/application/core/src/module/priority-band/priority-band.resource.ts
+++ b/libs/wbs/application/core/src/module/priority-band/priority-band.resource.ts
@@ -1,9 +1,9 @@
 import { canEditProject, type PriorityBand } from '@wbs/domain';

-import type { Clock } from '../ports/clock';
-import type { PriorityBandStore } from '../ports/priority-band-store';
-import type { Broadcaster } from '../ports/project-event';
-import type { ProjectStore } from '../ports/project-store';
+import type { Clock } from '../../ports/clock';
+import type { PriorityBandStore } from '../../ports/priority-band-store';
+import type { Broadcaster } from '../../ports/project-event';
+import type { ProjectStore } from '../../ports/project-store';

 export interface PriorityBandServiceOptions {
   projects: ProjectStore;
diff --git a/libs/wbs/application/core/src/module/step/step.resource.ts b/libs/wbs/application/core/src/module/step/step.resource.ts
--- a/libs/wbs/application/core/src/module/step/step.resource.ts
+++ b/libs/wbs/application/core/src/module/step/step.resource.ts
@@ -1,11 +1,11 @@
 import { canEditProject, stepIsInUse } from '@wbs/domain';

-import type { Clock } from '../ports/clock';
-import type { Broadcaster } from '../ports/project-event';
-import type { ProjectStore } from '../ports/project-store';
-import type { Step, StepStore, StepUsageRows } from '../ports/step-store';
-import { type AssumedAssigneeFlip, assumedAssigneeFlips } from './assumed-assignee';
-import { cleanName } from './clean-name';
+import type { Clock } from '../../ports/clock';
+import type { Broadcaster } from '../../ports/project-event';
+import type { ProjectStore } from '../../ports/project-store';
+import type { Step, StepStore, StepUsageRows } from '../../ports/step-store';
+import { type AssumedAssigneeFlip, assumedAssigneeFlips } from '../../service/assumed-assignee';
+import { cleanName } from '../../service/clean-name';

 export interface StepServiceOptions {
   projects: ProjectStore;
```

### 10.15 The two compatibility shims (slice 2 step 2 — full replacement content)

`c/service/priority-band.service.ts`:

```ts
/**
 * Compatibility re-export: Priority band moved into its own sealed module.
 *
 * Kept because `service/plan-commands.ts`, `@wbs/core`'s barrel and be-01's own
 * deep-import shim name this path. It goes when every importer names the
 * module.
 */
export * from '../module/priority-band/priority-band.resource';
```

`c/service/step.service.ts`:

```ts
/**
 * Compatibility re-export: Step moved into its own sealed module.
 *
 * Kept because delivery (`http/step.routes.ts`), test fixtures, `@wbs/core`'s
 * barrel and be-01's own deep-import shim name this path. It goes when every
 * importer names the module.
 */
export * from '../module/step/step.resource';
```

### 10.16 Priority band's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 2 step 3)

`contract.ts`:

```ts
import type { PriorityBandService, PriorityBandServiceOptions } from './priority-band.resource';

/**
 * What a host must supply to install {@link priorityBandModule}.
 *
 * Exactly {@link PriorityBandServiceOptions}, unchanged by the move: the
 * project and ladder stores of the one scope being installed over, the
 * broadcaster and the clock. `servicesOver` supplies the stores of each
 * admitted scope, so one installation never outlives the scope it was built
 * over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Priority band is a resource: it
 * imports the domain library and repository ports and no other resource. What
 * this extraction does not close is Plan commands' and delivery's side:
 * `service/plan-commands.ts` still names `PriorityBandService` directly, and
 * delivery reaches it through the composed graph rather than a feature
 * contract (K2), which the backend module map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type PriorityBandRequirements = PriorityBandServiceOptions;

/** What installing {@link priorityBandModule} adds to a host graph. */
export interface PriorityBandExports {
  readonly priorityBands: PriorityBandService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.priority-band` and the label drops
 * the `module.` prefix.
 */
export const PRIORITY_BAND_LABEL = 'application.priority-band';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import { PRIORITY_BAND_LABEL } from './contract';
import { PriorityBandService, type PriorityBandServiceOptions } from './priority-band.resource';

/**
 * Priority band as a sealed DI Bag module.
 *
 * Only `priorityBands` is exported. `priorityBandOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.priority-band/priorityBandOptions` rather than
 * against an anonymous binding. The two stores are required as `projectStore`
 * and `priorityBandStore`, the naming every resource module here shares so
 * that no host key can collide with a module's export.
 *
 * The module registers no disposer: `PriorityBandService` holds the borrowed
 * stores of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const priorityBandModule = DiBag.createBuilder()
  .register({
    priorityBandOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        priorityBandStore,
        broadcast,
        clock,
      }: {
        projectStore: ProjectStore;
        priorityBandStore: PriorityBandStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): PriorityBandServiceOptions => ({
        projects: projectStore,
        bands: priorityBandStore,
        broadcast,
        clock,
      }),
    ),
  })
  .register({
    priorityBands: DiBag.fromSyncFactory(
      ({
        priorityBandOptions,
      }: {
        priorityBandOptions: PriorityBandServiceOptions;
      }): PriorityBandService => new PriorityBandService(priorityBandOptions),
    ),
  })
  .buildModule(['priorityBands'], { label: PRIORITY_BAND_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { PriorityBandExports, PriorityBandRequirements } from './contract';
import { priorityBandModule } from './module';

/**
 * Installs {@link priorityBandModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Priority band can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PriorityBandExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPriorityBand(requirements: PriorityBandRequirements): PriorityBandExports {
  const bag = DiBag.createBuilder()
    .installModule(priorityBandModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      priorityBandStore: DiBag.fromSyncFactory(() => requirements.bands),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  return { priorityBands: bag.resolve('priorityBands') };
}
```

`README.md`:

```md
# Priority band

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the broadcaster and the clock a host
must supply.

`priority-band.resource.ts` (the moved `service/priority-band.service.ts`) reads a project's
priority ladder and replaces it on a `canEditProject`-gated write, announcing
`priority_bands_changed` to that project. Private bindings are named under the
`application.priority-band` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/priority-band.service.ts` keeps the former path for Plan
commands, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.17 Step's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 2 step 3)

`contract.ts`:

```ts
import type { StepService, StepServiceOptions } from './step.resource';

/**
 * What a host must supply to install {@link stepModule}.
 *
 * Exactly {@link StepServiceOptions}, unchanged by the move: the project and
 * step stores of the one scope being installed over, the broadcaster and the
 * clock. `servicesOver` supplies the stores of each admitted scope, so one
 * installation never outlives the scope it was built over.
 *
 * **No K6 debt; K4 support and K2 debt disclosed.** Step is a resource: it
 * imports the domain library, repository ports and no other resource. It
 * still imports two support files from `service/`, `assumed-assignee.ts` and
 * `clean-name.ts`, which the backend module map moves to the domain library
 * (task 6.1); until then that is a resource reading application-ring support
 * rather than the domain. Delivery's side is not closed either:
 * `http/step.routes.ts` still accepts `StepService` directly, the direct
 * resource dependency of delivery (K2) the map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type StepRequirements = StepServiceOptions;

/** What installing {@link stepModule} adds to a host graph. */
export interface StepExports {
  readonly steps: StepService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.step` and the label drops the
 * `module.` prefix.
 */
export const STEP_LABEL = 'application.step';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { StepStore } from '../../ports/step-store';
import { STEP_LABEL } from './contract';
import { StepService, type StepServiceOptions } from './step.resource';

/**
 * Step as a sealed DI Bag module.
 *
 * Only `steps` is exported. `stepOptions` stays private to each installation,
 * so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.step/stepOptions` rather than against an
 * anonymous binding. The two stores are required as `projectStore` and
 * `stepStore` because the host graph's `steps` key is this module's export.
 *
 * The module registers no disposer: `StepService` holds the borrowed stores of
 * one scope, a clock and a broadcaster, and no handle of its own.
 */
export const stepModule = DiBag.createBuilder()
  .register({
    stepOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        stepStore,
        broadcast,
        clock,
      }: {
        projectStore: ProjectStore;
        stepStore: StepStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): StepServiceOptions => ({
        projects: projectStore,
        steps: stepStore,
        broadcast,
        clock,
      }),
    ),
  })
  .register({
    steps: DiBag.fromSyncFactory(
      ({ stepOptions }: { stepOptions: StepServiceOptions }): StepService =>
        new StepService(stepOptions),
    ),
  })
  .buildModule(['steps'], { label: STEP_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { StepExports, StepRequirements } from './contract';
import { stepModule } from './module';

/**
 * Installs {@link stepModule} over supplied requirements and returns only what
 * the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Step can reach a
 * private binding or a host key through it. The type checker does not enforce
 * that on its own: an object with an extra property returned through a
 * variable still satisfies {@link StepExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installStep(requirements: StepRequirements): StepExports {
  const bag = DiBag.createBuilder()
    .installModule(stepModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      stepStore: DiBag.fromSyncFactory(() => requirements.steps),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  return { steps: bag.resolve('steps') };
}
```

`README.md`:

```md
# Step

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the broadcaster and the clock a host
must supply.

`step.resource.ts` (the moved `service/step.service.ts`) adds, renames and removes a project's
steps on `canEditProject`-gated writes, refusing an uncascaded removal of a step that still holds
estimates, actuals or assignments, and announces each change to that project. Private bindings are
named under the `application.step` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/step.service.ts` keeps the former path for delivery, test
fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.18 `compose.ts`, `index.ts` and `kinds.json` (slice 2 step 4)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -352,9 +352,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/priority-band.service.ts",
-      "kind": "resource",
-      "term": "priority band",
-      "rationale": "composeServices and PlanCommandRunner use it for the priority band aggregate's edit rules over PriorityBandStore and ProjectStore, with Clock and Broadcaster ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the priority-band module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/project.service.ts",
@@ -435,9 +434,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/step.service.ts",
-      "kind": "resource",
-      "term": "step",
-      "rationale": "step routes and PlanCommandRunner call it for step aggregate add, rename, usage and removal rules over StepStore and ProjectStore, with Clock and Broadcaster ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the step module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/work-item.service.ts",
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -11,12 +11,14 @@ import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
 import { installPlanImport } from './module/plan-import/check';
 import type { ImportService } from './module/plan-import/plan-import.feature';
+import { installPriorityBand } from './module/priority-band/check';
 import { installRealtime } from './module/realtime/check';
 import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
 import type { ReplayBuffer } from './module/realtime/replay-buffer';
 import type { ReplayOrchestrator } from './module/realtime/replay-orchestrator';
 import { installSavedPlans } from './module/saved-plans/check';
 import type { SavedPlanService } from './module/saved-plans/saved-plans.feature';
+import { installStep } from './module/step/check';
 import type { Clock } from './ports/clock';
 import type { OidcVerifier } from './ports/oidc-verifier';
 import type { Broadcaster } from './ports/project-event';
@@ -29,9 +31,7 @@ import type { Intervals, Timers } from './ports/timers';
 import type { Scope } from './ports/unit-of-work';
 import { DirectoryService } from './service/directory.service';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
-import { PriorityBandService } from './service/priority-band.service';
 import { ProjectService } from './service/project.service';
-import { StepService } from './service/step.service';
 import { WorkItemService } from './service/work-item.service';

 /** Runtime capabilities required by every service composition. */
@@ -104,18 +104,18 @@ export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOv
       markers: stores.calendarMarkers,
       broadcast,
     }).calendarMarkers,
-    priorityBands: new PriorityBandService({
+    priorityBands: installPriorityBand({
       clock,
       projects: stores.projects,
       bands: stores.priorityBands,
       broadcast,
-    }),
-    steps: new StepService({
+    }).priorityBands,
+    steps: installStep({
       clock,
       projects: stores.projects,
       steps: stores.steps,
       broadcast,
-    }),
+    }).steps,
     directory: new DirectoryService({ clock, directory: stores.directory, broadcast }),
     workItems: new WorkItemService({
       clock,
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -30,10 +30,14 @@ export * from './module/plan-history/contract';
 export * from './module/plan-history/module';
 export * from './module/plan-import/contract';
 export * from './module/plan-import/module';
+export * from './module/priority-band/contract';
+export * from './module/priority-band/module';
 export * from './module/realtime/contract';
 export * from './module/realtime/module';
 export * from './module/saved-plans/contract';
 export * from './module/saved-plans/module';
+export * from './module/step/contract';
+export * from './module/step/module';
 export * from './ports/actual-store';
 // The owner-neutral marker read: `CalendarMarkerReader` and the list outcome it answers with.
 export * from './ports/calendar-marker-read';
```

### 10.19 Two more per-scope cases (slice 2 step 5)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -1,4 +1,5 @@
 import { noopLogger } from '@wbs/contracts';
+import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain';
 import { openMemorySource } from '@wbs/store-memory';
 import { projectRow } from '@wbs/store-memory/project-fixture';
 import { describe, expect, test } from 'bun:test';
@@ -443,4 +444,23 @@ describe('servicesOver', () => {
     // with `-t`): the second scope listed the first scope's `{ serviceTeamId: "team-1", size: 3 }`.
     expect(await second.capacity.listFor(PROJECT)).toEqual([]);
   });
+
+  test("installs Priority band per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    const ladder = DEFAULT_PRIORITY_BANDS.map((band) => ({ ...band, label: `${band.label} now` }));
+    expect(await first.priorityBands.set(PROJECT, OWNER, ladder)).toMatchObject({ ok: true });
+    expect(await second.priorityBands.listFor(PROJECT)).toEqual([...DEFAULT_PRIORITY_BANDS]);
+  });
+
+  test("installs Step per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    const added = await first.steps.add(PROJECT, OWNER, 'Review');
+    if (!added.ok) throw new Error(`the first scope refused the step: ${added.reason}`);
+    expect(await second.steps.rename(PROJECT, added.value.id, OWNER, 'Renamed')).toEqual({
+      ok: false,
+      reason: 'not_found',
+    });
+  });
 });
```

### 10.20 Slice 2's Proof comments (slice 2 step 8)

```diff
diff --git a/libs/wbs/application/core/src/module/priority-band/module.ts b/libs/wbs/application/core/src/module/priority-band/module.ts
--- a/libs/wbs/application/core/src/module/priority-band/module.ts
+++ b/libs/wbs/application/core/src/module/priority-band/module.ts
@@ -37,6 +37,10 @@ export const priorityBandModule = DiBag.createBuilder()
       }): PriorityBandServiceOptions => ({
         projects: projectStore,
         bands: priorityBandStore,
+        // Proof (2026-09-24): handing the resource
+        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
+        // broadcaster left `announces a ladder write through the broadcaster installPriorityBand wires`
+        // failing (4 pass, 1 fail): it received `[]`.
         broadcast,
         clock,
       }),
@@ -51,4 +55,12 @@ export const priorityBandModule = DiBag.createBuilder()
       }): PriorityBandService => new PriorityBandService(priorityBandOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['priorityBands', 'priorityBandOptions']`
+  // left the private-binding, graph-label and missing-requirement assertions failing (2 pass,
+  // 3 fail): `resolve('priorityBandOptions')` did not throw, `inspectGraph()` reported bare
+  // `priorityBandOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: PRIORITY_BAND_LABEL }` left only the two label
+  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `priorityBandOptions`
+  // unlabelled, and the missing-requirement message named `priorityBandOptions` instead of
+  // `application.priority-band/priorityBandOptions`.
   .buildModule(['priorityBands'], { label: PRIORITY_BAND_LABEL });
diff --git a/libs/wbs/application/core/src/module/priority-band/check.ts b/libs/wbs/application/core/src/module/priority-band/check.ts
--- a/libs/wbs/application/core/src/module/priority-band/check.ts
+++ b/libs/wbs/application/core/src/module/priority-band/check.ts
@@ -23,5 +23,11 @@ export function installPriorityBand(requirements: PriorityBandRequirements): Pri
       clock: DiBag.fromSyncFactory(() => requirements.clock),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `PriorityBandService` kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { priorityBands: bag.resolve('priorityBands') };
 }
diff --git a/libs/wbs/application/core/src/module/step/module.ts b/libs/wbs/application/core/src/module/step/module.ts
--- a/libs/wbs/application/core/src/module/step/module.ts
+++ b/libs/wbs/application/core/src/module/step/module.ts
@@ -36,6 +36,10 @@ export const stepModule = DiBag.createBuilder()
       }): StepServiceOptions => ({
         projects: projectStore,
         steps: stepStore,
+        // Proof (2026-09-24): handing the resource
+        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
+        // broadcaster left `announces an added step through the broadcaster installStep wires`
+        // failing (4 pass, 1 fail): it received `[]`.
         broadcast,
         clock,
       }),
@@ -47,4 +51,12 @@ export const stepModule = DiBag.createBuilder()
         new StepService(stepOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['steps', 'stepOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('stepOptions')` did not throw, `inspectGraph()` reported bare `stepOptions`,
+  // and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: STEP_LABEL }` left only the two label assertions
+  // failing (3 pass, 2 fail): `inspectGraph()` reported `stepOptions` unlabelled, and the
+  // missing-requirement message named `stepOptions` instead of
+  // `application.step/stepOptions`.
   .buildModule(['steps'], { label: STEP_LABEL });
diff --git a/libs/wbs/application/core/src/module/step/check.ts b/libs/wbs/application/core/src/module/step/check.ts
--- a/libs/wbs/application/core/src/module/step/check.ts
+++ b/libs/wbs/application/core/src/module/step/check.ts
@@ -23,5 +23,11 @@ export function installStep(requirements: StepRequirements): StepExports {
       clock: DiBag.fromSyncFactory(() => requirements.clock),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `StepService` kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { steps: bag.resolve('steps') };
 }
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -450,6 +450,9 @@ describe('servicesOver', () => {

     const ladder = DEFAULT_PRIORITY_BANDS.map((band) => ({ ...band, label: `${band.label} now` }));
     expect(await first.priorityBands.set(PROJECT, OWNER, ladder)).toMatchObject({ ok: true });
+    // Proof (2026-09-24): memoizing one `installPriorityBand(...)` result in a module-level `let`
+    // and handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run
+    // alone with `-t`): the second scope read the first scope's `Critical now` ladder.
     expect(await second.priorityBands.listFor(PROJECT)).toEqual([...DEFAULT_PRIORITY_BANDS]);
   });

@@ -458,6 +461,9 @@ describe('servicesOver', () => {

     const added = await first.steps.add(PROJECT, OWNER, 'Review');
     if (!added.ok) throw new Error(`the first scope refused the step: ${added.reason}`);
+    // Proof (2026-09-24): memoizing one `installStep(...)` result in a module-level `let` and
+    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
+    // with `-t`): the second scope renamed the first scope's step and answered `ok: true`.
     expect(await second.steps.rename(PROJECT, added.value.id, OWNER, 'Renamed')).toEqual({
       ok: false,
       reason: 'not_found',
```

### 10.21 `c/module/project/module.test.ts` (slice 3 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installProject } from './check';
import { PROJECT_LABEL } from './contract';
import { projectModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/**
 * One memory source holding one project, and the requirements a settings
 * write needs, on a deployment that has an optimizer.
 */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      projects: source.stores.projects,
      clock: clockOf({ now: () => 2, newId: () => 'unused' }),
      broadcast,
      optimizerAvailable: () => true,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    projectStore: DiBag.fromSyncFactory(() => source.stores.projects),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
    optimizerAvailable: DiBag.fromSyncFactory(() => undefined),
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
    .installModule(projectModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Project module', () => {
  it('switches the optimizer on through the availability installProject wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { projects } = installProject(requirements);

    const updated = await projects.update(PROJECT, OWNER, { optimizationEnabled: true });

    expect(updated).toMatchObject({ ok: true, value: { optimizationEnabled: true } });
    expect(broadcast.published.map((entry) => entry.event.type)).toEqual([
      'project_settings_changed',
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `ProjectExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installProject(requirements);

    expect(Object.keys(exposed)).toEqual(['projects']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('projectOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "projectOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PROJECT_LABEL}/projectOptions`,
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
      .installModule(projectModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('projects')).toThrow(
      `Cannot resolve "${PROJECT_LABEL}/projectOptions": dependency "clock" is not registered. Resolution path: projects -> ${PROJECT_LABEL}/projectOptions -> clock.`,
    );
  });
});
```

### 10.22 `c/module/directory/module.test.ts` (slice 3 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { installDirectory } from './check';
import { DIRECTORY_LABEL } from './contract';
import { directoryModule } from './module';

const ACTOR = 'owner';

/** One memory source, and the requirements a directory write needs. */
function seeded() {
  const source = openMemorySource();
  let next = 0;
  return {
    requirements: {
      directory: source.stores.directory,
      broadcast: recordingBroadcaster(),
      clock: clockOf({ now: () => 2, newId: () => `team-${String(++next)}` }),
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    directoryStore: DiBag.fromSyncFactory(() => source.stores.directory),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
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
    .installModule(directoryModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Directory module', () => {
  it('names a new team with the clock installDirectory wires', async () => {
    const { requirements } = seeded();
    const { directory } = installDirectory(requirements);

    const team = await directory.addTeam(ACTOR, ' Platform ');

    expect(team).toEqual({ id: 'team-1', name: 'Platform' });
    expect((await directory.listTeams()).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'team-1', name: 'Platform' },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `DirectoryExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const { requirements } = seeded();
    const exposed: object = installDirectory(requirements);

    expect(Object.keys(exposed)).toEqual(['directory']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('directoryOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "directoryOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${DIRECTORY_LABEL}/directoryOptions`,
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
      .installModule(directoryModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('directory')).toThrow(
      `Cannot resolve "${DIRECTORY_LABEL}/directoryOptions": dependency "clock" is not registered. Resolution path: directory -> ${DIRECTORY_LABEL}/directoryOptions -> clock.`,
    );
  });
});
```

### 10.23 Import lines of the two moved files (slice 3 step 2)

```diff
diff --git a/libs/wbs/application/core/src/module/project/project.resource.ts b/libs/wbs/application/core/src/module/project/project.resource.ts
--- a/libs/wbs/application/core/src/module/project/project.resource.ts
+++ b/libs/wbs/application/core/src/module/project/project.resource.ts
@@ -2,17 +2,17 @@ import { canEditProject, DEFAULT_ESTIMATE_RULE, isIsoDate, PertWeights } from '@
 import { STEP_POSITION_STEP } from '@wbs/domain';
 import { type } from '@wbs/validation';

-import type { Clock } from '../ports/clock';
-import type { Broadcaster } from '../ports/project-event';
+import type { Clock } from '../../ports/clock';
+import type { Broadcaster } from '../../ports/project-event';
 import type {
   NewProject,
   Project,
   ProjectPatch,
   ProjectStore,
   ProjectWithAccess,
-} from '../ports/project-store';
-import type { OptimizerAvailability } from '../ports/scheduler';
-import type { Step } from '../ports/step-store';
+} from '../../ports/project-store';
+import type { OptimizerAvailability } from '../../ports/scheduler';
+import type { Step } from '../../ports/step-store';

 /**
  * The steps a project starts with, **in step order**. Two sets of estimates is
diff --git a/libs/wbs/application/core/src/module/directory/directory.resource.ts b/libs/wbs/application/core/src/module/directory/directory.resource.ts
--- a/libs/wbs/application/core/src/module/directory/directory.resource.ts
+++ b/libs/wbs/application/core/src/module/directory/directory.resource.ts
@@ -1,7 +1,7 @@
 import type { PersonKind } from '@wbs/domain';
 import { PERSON_KINDS } from '@wbs/domain';

-import type { Clock } from '../ports/clock';
+import type { Clock } from '../../ports/clock';
 import type {
   DirectoryRemoved,
   DirectoryStore,
@@ -13,11 +13,11 @@ import type {
   TeamPatch,
   TeamWithServices,
   TouchedProjects,
-} from '../ports/directory-store';
-import type { Broadcaster } from '../ports/project-event';
-import type { ExternalSystem, Service, Tag, WorkItemType } from '../ports/work-item-store';
-import type { WriteStamp } from '../ports/write-stamp';
-import { cleanName } from './clean-name';
+} from '../../ports/directory-store';
+import type { Broadcaster } from '../../ports/project-event';
+import type { ExternalSystem, Service, Tag, WorkItemType } from '../../ports/work-item-store';
+import type { WriteStamp } from '../../ports/write-stamp';
+import { cleanName } from '../../service/clean-name';
 import {
   type DirectoryUsage,
   directoryUsageOfPerson,
@@ -25,7 +25,7 @@ import {
   directoryUsageOfTag,
   directoryUsageOfTeam,
   directoryUsageOfWorkItemType,
-} from './directory-usage';
+} from '../../service/directory-usage';

 export interface DirectoryServiceOptions {
   directory: DirectoryStore;
```

### 10.24 The two compatibility shims (slice 3 step 2 — full replacement content)

`c/service/project.service.ts`:

```ts
/**
 * Compatibility re-export: Project moved into its own sealed module.
 *
 * Kept because delivery (`http/project.routes.ts`, `http/saved-plan.routes.ts`,
 * `http/solution.routes.ts`), `module/saved-plans/save-plan.ts`, test fixtures,
 * `@wbs/core`'s barrel and be-01's own deep-import shim name this path. It goes
 * when every importer names the module.
 */
export * from '../module/project/project.resource';
```

`c/service/directory.service.ts`:

```ts
/**
 * Compatibility re-export: Directory moved into its own sealed module.
 *
 * Kept because delivery (`http/directory.routes.ts`, `http/project.routes.ts`),
 * `module/plan-import/plan-import.feature.ts`, `service/plan-commands.ts`,
 * `@wbs/core`'s barrel and be-01's own deep-import shim name this path. It goes
 * when every importer names the module.
 */
export * from '../module/directory/directory.resource';
```

### 10.25 Project's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 3 step 3)

`contract.ts`:

```ts
import type { ProjectService, ProjectServiceOptions } from './project.resource';

/**
 * What a host must supply to install {@link projectModule}.
 *
 * Exactly {@link ProjectServiceOptions}, unchanged by the move: the project
 * store of the one scope being installed over, the clock, the broadcaster and
 * the optional optimizer availability. `servicesOver` supplies the store of
 * each admitted scope, so one installation never outlives the scope it was
 * built over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Project is a resource: it imports
 * the domain library, `@wbs/validation` and repository ports, and no other
 * resource. The `canEdit` it still exports is the compatibility alias of the
 * domain's `canEditProject`, kept for delivery. What this extraction does not
 * close is delivery's and features' side: `http/project.routes.ts`,
 * `http/saved-plan.routes.ts`, `http/solution.routes.ts` and Saved plans'
 * `save-plan.ts` still name `ProjectService` directly, the direct resource
 * dependency (K2) the backend module map lists under its composition hazards.
 * Tracked under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type ProjectRequirements = ProjectServiceOptions;

/** What installing {@link projectModule} adds to a host graph. */
export interface ProjectExports {
  readonly projects: ProjectService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.project` and the label drops the
 * `module.` prefix.
 */
export const PROJECT_LABEL = 'application.project';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { OptimizerAvailability } from '../../ports/scheduler';
import { PROJECT_LABEL } from './contract';
import { ProjectService, type ProjectServiceOptions } from './project.resource';

/**
 * Project as a sealed DI Bag module.
 *
 * Only `projects` is exported. `projectOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.project/projectOptions` rather than against
 * an anonymous binding. The store is required as `projectStore` because the
 * host graph's `projects` key is this module's export. `optimizerAvailable`
 * is registered even when absent, as `undefined`, the way Saved plans
 * registers its optional quota: the resource then refuses to switch an
 * optimizer on, as it always has.
 *
 * The module registers no disposer: `ProjectService` holds the borrowed store
 * of one scope, a clock, a broadcaster and a predicate, and no handle of its
 * own.
 */
export const projectModule = DiBag.createBuilder()
  .register({
    projectOptions: DiBag.fromSyncFactory(
      ({
        projectStore,
        clock,
        broadcast,
        optimizerAvailable,
      }: {
        projectStore: ProjectStore;
        clock: Clock;
        broadcast: Broadcaster;
        optimizerAvailable: OptimizerAvailability | undefined;
      }): ProjectServiceOptions => ({
        projects: projectStore,
        clock,
        broadcast,
        optimizerAvailable,
      }),
    ),
  })
  .register({
    projects: DiBag.fromSyncFactory(
      ({ projectOptions }: { projectOptions: ProjectServiceOptions }): ProjectService =>
        new ProjectService(projectOptions),
    ),
  })
  .buildModule(['projects'], { label: PROJECT_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { ProjectExports, ProjectRequirements } from './contract';
import { projectModule } from './module';

/**
 * Installs {@link projectModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Project can reach
 * a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link ProjectExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installProject(requirements: ProjectRequirements): ProjectExports {
  const bag = DiBag.createBuilder()
    .installModule(projectModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      optimizerAvailable: DiBag.fromSyncFactory(() => requirements.optimizerAvailable),
    })
    .build();
  return { projects: bag.resolve('projects') };
}
```

`README.md`:

```md
# Project

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the store, the clock, the broadcaster and the
optional optimizer availability a host must supply.

`project.resource.ts` (the moved `service/project.service.ts`) creates a project with its starting
steps, lists and reads projects, and updates their settings on a `canEditProject`-gated write,
refusing to switch an optimizer on where the deployment has none and announcing
`project_settings_changed` when a setting moved. Private bindings are named under the
`application.project` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/project.service.ts` keeps the former path for delivery, Saved
plans, test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.26 Directory's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 3 step 3)

`contract.ts`:

```ts
import type { DirectoryService, DirectoryServiceOptions } from './directory.resource';

/**
 * What a host must supply to install {@link directoryModule}.
 *
 * Exactly {@link DirectoryServiceOptions}, unchanged by the move: the
 * directory store of the one scope being installed over, the broadcaster and
 * the clock. `servicesOver` supplies the store of each admitted scope, so one
 * installation never outlives the scope it was built over.
 *
 * **No K6 debt; K4 support and K2 debt disclosed.** Directory is a resource:
 * it imports the domain library, repository ports and no other resource. It
 * still imports two support files from `service/`, `clean-name.ts` and
 * `directory-usage.ts`, which the backend module map moves to the domain
 * library (task 6.1); until then that is a resource reading application-ring
 * support rather than the domain. Delivery's and features' side is not closed
 * either: `http/directory.routes.ts`, `http/project.routes.ts`, Plan import's
 * `plan-import.feature.ts` and `service/plan-commands.ts` still name
 * `DirectoryService` directly, the direct resource dependency (K2) the map
 * lists under its composition hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type DirectoryRequirements = DirectoryServiceOptions;

/** What installing {@link directoryModule} adds to a host graph. */
export interface DirectoryExports {
  readonly directory: DirectoryService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.directory` and the label drops the
 * `module.` prefix.
 */
export const DIRECTORY_LABEL = 'application.directory';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type { Broadcaster } from '../../ports/project-event';
import { DIRECTORY_LABEL } from './contract';
import { DirectoryService, type DirectoryServiceOptions } from './directory.resource';

/**
 * Directory as a sealed DI Bag module.
 *
 * Only `directory` is exported. `directoryOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.directory/directoryOptions` rather than
 * against an anonymous binding. The store is required as `directoryStore`
 * because the host graph's `directory` key is this module's export.
 *
 * The module registers no disposer: `DirectoryService` holds the borrowed
 * store of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const directoryModule = DiBag.createBuilder()
  .register({
    directoryOptions: DiBag.fromSyncFactory(
      ({
        directoryStore,
        broadcast,
        clock,
      }: {
        directoryStore: DirectoryStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): DirectoryServiceOptions => ({ directory: directoryStore, broadcast, clock }),
    ),
  })
  .register({
    directory: DiBag.fromSyncFactory(
      ({ directoryOptions }: { directoryOptions: DirectoryServiceOptions }): DirectoryService =>
        new DirectoryService(directoryOptions),
    ),
  })
  .buildModule(['directory'], { label: DIRECTORY_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { DirectoryExports, DirectoryRequirements } from './contract';
import { directoryModule } from './module';

/**
 * Installs {@link directoryModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Directory can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link DirectoryExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installDirectory(requirements: DirectoryRequirements): DirectoryExports {
  const bag = DiBag.createBuilder()
    .installModule(directoryModule)
    .register({
      directoryStore: DiBag.fromSyncFactory(() => requirements.directory),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  return { directory: bag.resolve('directory') };
}
```

`README.md`:

```md
# Directory

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the store, the broadcaster and the clock a host
must supply.

`directory.resource.ts` (the moved `service/directory.service.ts`) keeps the global vocabulary —
teams, people, services, tags, work item types and external systems — adding, renaming and removing
its rows, refusing a removal that is still in use unless it cascades, and announcing a rename or a
removal to every project it touches. Private bindings are named under the `application.directory`
label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/directory.service.ts` keeps the former path for delivery,
Plan import, Plan commands, `@wbs/core`'s barrel and be-01's deep-import shim.
```

### 10.27 `compose.ts`, `index.ts` and `kinds.json` (slice 3 step 4)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -292,9 +292,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/directory.service.ts",
-      "kind": "resource",
-      "term": "directory",
-      "rationale": "directory and project routes, ImportService and PlanCommandRunner call it for directory vocabulary invariants over DirectoryStore, with Clock and Broadcaster ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the directory module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/gateway-broadcaster.ts",
@@ -357,9 +356,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/project.service.ts",
-      "kind": "resource",
-      "term": "project",
-      "rationale": "project, solution and saved-plan routes plus several resource services call it for project aggregate creation, access and settings rules over ProjectStore, with Clock, Broadcaster and optimizer-availability ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the project module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/replay-buffer.ts",
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -7,11 +7,13 @@ import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
 import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
 import { installCalendarMarker } from './module/calendar-marker/check';
 import { installCapacity } from './module/capacity/check';
+import { installDirectory } from './module/directory/check';
 import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
 import { installPlanImport } from './module/plan-import/check';
 import type { ImportService } from './module/plan-import/plan-import.feature';
 import { installPriorityBand } from './module/priority-band/check';
+import { installProject } from './module/project/check';
 import { installRealtime } from './module/realtime/check';
 import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
 import type { ReplayBuffer } from './module/realtime/replay-buffer';
@@ -29,9 +31,7 @@ import type { Source } from './ports/source';
 import type { PlanTransactionalStores, TransactionalStores } from './ports/stores';
 import type { Intervals, Timers } from './ports/timers';
 import type { Scope } from './ports/unit-of-work';
-import { DirectoryService } from './service/directory.service';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
-import { ProjectService } from './service/project.service';
 import { WorkItemService } from './service/work-item.service';

 /** Runtime capabilities required by every service composition. */
@@ -86,12 +86,12 @@ export interface ServicesOverOptions {
 export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOverOptions) {
   const { clock, broadcast, scheduler } = shared;
   return {
-    projects: new ProjectService({
+    projects: installProject({
       clock,
       projects: stores.projects,
       broadcast,
       optimizerAvailable: () => scheduler.supports('optimized'),
-    }),
+    }).projects,
     capacity: installCapacity({
       clock,
       projects: stores.projects,
@@ -116,7 +116,7 @@ export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOv
       steps: stores.steps,
       broadcast,
     }).steps,
-    directory: new DirectoryService({ clock, directory: stores.directory, broadcast }),
+    directory: installDirectory({ clock, directory: stores.directory, broadcast }).directory,
     workItems: new WorkItemService({
       clock,
       workItems: stores.workItems,
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -24,6 +24,8 @@ export * from './module/calendar-marker/contract';
 export * from './module/calendar-marker/module';
 export * from './module/capacity/contract';
 export * from './module/capacity/module';
+export * from './module/directory/contract';
+export * from './module/directory/module';
 export * from './module/plan-document/contract';
 export * from './module/plan-document/module';
 export * from './module/plan-history/contract';
@@ -32,6 +34,8 @@ export * from './module/plan-import/contract';
 export * from './module/plan-import/module';
 export * from './module/priority-band/contract';
 export * from './module/priority-band/module';
+export * from './module/project/contract';
+export * from './module/project/module';
 export * from './module/realtime/contract';
 export * from './module/realtime/module';
 export * from './module/saved-plans/contract';
```

### 10.28 The last two per-scope cases (slice 3 step 5)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -469,4 +469,20 @@ describe('servicesOver', () => {
       reason: 'not_found',
     });
   });
+
+  test("installs Project per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    const created = await first.projects.create('Alpha', OWNER);
+    expect(await second.projects.read(created.project.id)).toBeNull();
+  });
+
+  test("installs Directory per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    expect(await first.directory.addTeam(OWNER, 'Operations')).toMatchObject({
+      name: 'Operations',
+    });
+    expect((await second.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
+  });
 });
```

### 10.29 Slice 3's Proof comments (slice 3 step 8)

```diff
diff --git a/libs/wbs/application/core/src/module/project/module.ts b/libs/wbs/application/core/src/module/project/module.ts
--- a/libs/wbs/application/core/src/module/project/module.ts
+++ b/libs/wbs/application/core/src/module/project/module.ts
@@ -41,6 +41,9 @@ export const projectModule = DiBag.createBuilder()
         projects: projectStore,
         clock,
         broadcast,
+        // Proof (2026-09-24): leaving `optimizerAvailable` out of the returned options left
+        // `switches the optimizer on through the availability installProject wires` failing
+        // (4 pass, 1 fail): the update answered `optimizer_unavailable`.
         optimizerAvailable,
       }),
     ),
@@ -51,4 +54,12 @@ export const projectModule = DiBag.createBuilder()
         new ProjectService(projectOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['projects', 'projectOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('projectOptions')` did not throw, `inspectGraph()` reported bare `projectOptions`,
+  // and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: PROJECT_LABEL }` left only the two label assertions
+  // failing (3 pass, 2 fail): `inspectGraph()` reported `projectOptions` unlabelled, and the
+  // missing-requirement message named `projectOptions` instead of
+  // `application.project/projectOptions`.
   .buildModule(['projects'], { label: PROJECT_LABEL });
diff --git a/libs/wbs/application/core/src/module/project/check.ts b/libs/wbs/application/core/src/module/project/check.ts
--- a/libs/wbs/application/core/src/module/project/check.ts
+++ b/libs/wbs/application/core/src/module/project/check.ts
@@ -23,5 +23,11 @@ export function installProject(requirements: ProjectRequirements): ProjectExport
       optimizerAvailable: DiBag.fromSyncFactory(() => requirements.optimizerAvailable),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `ProjectService` kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { projects: bag.resolve('projects') };
 }
diff --git a/libs/wbs/application/core/src/module/directory/module.ts b/libs/wbs/application/core/src/module/directory/module.ts
--- a/libs/wbs/application/core/src/module/directory/module.ts
+++ b/libs/wbs/application/core/src/module/directory/module.ts
@@ -30,6 +30,9 @@ export const directoryModule = DiBag.createBuilder()
         directoryStore: DirectoryStore;
         broadcast: Broadcaster;
         clock: Clock;
+        // Proof (2026-09-24): handing the resource `{ ...clock, newId: () => 'unsupplied' }`
+        // instead of the supplied clock left `names a new team with the clock installDirectory
+        // wires` failing (4 pass, 1 fail): the team's id read "unsupplied".
       }): DirectoryServiceOptions => ({ directory: directoryStore, broadcast, clock }),
     ),
   })
@@ -39,4 +42,12 @@ export const directoryModule = DiBag.createBuilder()
         new DirectoryService(directoryOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['directory', 'directoryOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('directoryOptions')` did not throw, `inspectGraph()` reported bare `directoryOptions`,
+  // and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: DIRECTORY_LABEL }` left only the two label assertions
+  // failing (3 pass, 2 fail): `inspectGraph()` reported `directoryOptions` unlabelled, and the
+  // missing-requirement message named `directoryOptions` instead of
+  // `application.directory/directoryOptions`.
   .buildModule(['directory'], { label: DIRECTORY_LABEL });
diff --git a/libs/wbs/application/core/src/module/directory/check.ts b/libs/wbs/application/core/src/module/directory/check.ts
--- a/libs/wbs/application/core/src/module/directory/check.ts
+++ b/libs/wbs/application/core/src/module/directory/check.ts
@@ -22,5 +22,11 @@ export function installDirectory(requirements: DirectoryRequirements): Directory
       clock: DiBag.fromSyncFactory(() => requirements.clock),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `DirectoryService` kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { directory: bag.resolve('directory') };
 }
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -474,6 +474,9 @@ describe('servicesOver', () => {
     const { first, second } = await twoScopes();

     const created = await first.projects.create('Alpha', OWNER);
+    // Proof (2026-09-24): memoizing one `installProject(...)` result in a module-level `let` and
+    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
+    // with `-t`): the second scope read the first scope's `Alpha` project instead of null.
     expect(await second.projects.read(created.project.id)).toBeNull();
   });

@@ -483,6 +486,9 @@ describe('servicesOver', () => {
     expect(await first.directory.addTeam(OWNER, 'Operations')).toMatchObject({
       name: 'Operations',
     });
+    // Proof (2026-09-24): memoizing one `installDirectory(...)` result in a module-level `let` and
+    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
+    // with `-t`): the second scope listed the first scope's `Operations` team.
     expect((await second.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
   });
 });
```

### 10.30 Registration, three diffs per module (slice 4 steps 1-3)

Each README diff names its predecessor by filename only: `tool-devsync`'s `LEGACY_ROOT` scan
refuses a current README that spells a pre-namespacing path.

Calendar marker — row, boundary, index:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -77,6 +77,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.calendar-marker",
+      "name": "Calendar marker sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/calendar-marker",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/calendar-marker/README.md",
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
+            "path": "libs/wbs/application/core/src/service/calendar-marker.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.plan-history",
       "name": "Plan history sealed DI Bag module",
```

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -992,6 +992,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.calendar-marker",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/calendar-marker"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/calendar-marker.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "1e36dc086592483df3c5facd52dc756c00a46b08",
+          "path": "libs/core/src/service/calendar-marker.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -37,6 +37,7 @@ const pilotPaths = [
   'docs/wiki-policy/relationships.bootstrap.json',
   'libs/wbs/application/core/src/module/authentication/README.md',
   'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
+  'libs/wbs/application/core/src/module/calendar-marker/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
diff --git a/libs/wbs/application/core/src/module/calendar-marker/README.md b/libs/wbs/application/core/src/module/calendar-marker/README.md
--- a/libs/wbs/application/core/src/module/calendar-marker/README.md
+++ b/libs/wbs/application/core/src/module/calendar-marker/README.md
@@ -1,5 +1,7 @@
 # Calendar marker

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.calendar-marker","memberships":[{"kind":"path","path":"calendar-marker.resource.test.ts"},{"kind":"path","path":"calendar-marker.resource.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The single-clock-reading `createdAt` and announce-after-write rules are documented on CalendarMarkerService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/calendar-marker.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; the calendar-marker and project routes, the writes fixture, the sideways-type boundary test and the be-01 shim and controller tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
@@ -13,11 +15,22 @@ which module asked.

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

 `libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
 `libs/wbs/application/core/src/service/calendar-marker.service.ts` keeps the former path for
 delivery, `@wbs/core`'s barrel and be-01's deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.calendar-marker` (`docs/wiki-policy/policy.json`'s `boundary.application.calendar-marker`). The
+boundary's `sourceSelector` binds this directory to `calendar-marker.resource.ts`'s own single
+pre-namespacing predecessor, `calendar-marker.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds. The moved `calendar-marker.resource.test.ts` has no baseline entry either, although its own
+predecessor existed then too.
```

Capacity — row, boundary, index:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -107,6 +107,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.capacity",
+      "name": "Capacity sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/capacity",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/capacity/README.md",
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
+            "path": "libs/wbs/application/core/src/service/capacity.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.plan-history",
       "name": "Plan history sealed DI Bag module",
```

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1011,6 +1011,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.capacity",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/capacity"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/capacity.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "ae86655ecd969b4016c1b9b96fb5eb60dec35a96",
+          "path": "libs/core/src/service/capacity.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -38,6 +38,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/authentication/README.md',
   'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
   'libs/wbs/application/core/src/module/calendar-marker/README.md',
+  'libs/wbs/application/core/src/module/capacity/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
diff --git a/libs/wbs/application/core/src/module/capacity/README.md b/libs/wbs/application/core/src/module/capacity/README.md
--- a/libs/wbs/application/core/src/module/capacity/README.md
+++ b/libs/wbs/application/core/src/module/capacity/README.md
@@ -1,5 +1,7 @@
 # Capacity

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.capacity","memberships":[{"kind":"path","path":"capacity.resource.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The canEditProject gate and the one-project announcement are documented on CapacityService.set; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/capacity.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; Plan commands, the be-01 clock test and the be-01 shim and controller tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
@@ -13,11 +15,21 @@ project may have at work at once and gates the write on `canEditProject`, announ

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

 `libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
 `libs/wbs/application/core/src/service/capacity.service.ts` keeps the former path for Plan commands,
 `@wbs/core`'s barrel and be-01's deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.capacity` (`docs/wiki-policy/policy.json`'s `boundary.application.capacity`). The
+boundary's `sourceSelector` binds this directory to `capacity.resource.ts`'s own single
+pre-namespacing predecessor, `capacity.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds.
```

Directory — row, boundary, index:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -137,6 +137,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.directory",
+      "name": "Directory sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/directory",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/directory/README.md",
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
+            "path": "libs/wbs/application/core/src/service/directory.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.plan-history",
       "name": "Plan history sealed DI Bag module",
```

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1030,6 +1030,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.directory",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/directory"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/directory.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "8deae4ad476af259c2ecc4b90345557dca80eab3",
+          "path": "libs/core/src/service/directory.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -39,6 +39,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
   'libs/wbs/application/core/src/module/calendar-marker/README.md',
   'libs/wbs/application/core/src/module/capacity/README.md',
+  'libs/wbs/application/core/src/module/directory/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
diff --git a/libs/wbs/application/core/src/module/directory/README.md b/libs/wbs/application/core/src/module/directory/README.md
--- a/libs/wbs/application/core/src/module/directory/README.md
+++ b/libs/wbs/application/core/src/module/directory/README.md
@@ -1,5 +1,7 @@
 # Directory

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.directory","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"directory.resource.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The rename-only announcement and the cascade-confirmed removal are documented on DirectoryService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/directory.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; the directory and project routes, Plan import, Plan commands and the be-01 shim and database tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
@@ -14,11 +16,21 @@ label, so a DI failure says which module asked.

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

 `libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
 `libs/wbs/application/core/src/service/directory.service.ts` keeps the former path for delivery,
 Plan import, Plan commands, `@wbs/core`'s barrel and be-01's deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.directory` (`docs/wiki-policy/policy.json`'s `boundary.application.directory`). The
+boundary's `sourceSelector` binds this directory to `directory.resource.ts`'s own single
+pre-namespacing predecessor, `directory.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds.
```

Priority band — row, boundary, index:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -191,6 +191,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.priority-band",
+      "name": "Priority band sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/priority-band",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/priority-band/README.md",
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
+            "path": "libs/wbs/application/core/src/service/priority-band.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.realtime",
       "name": "Realtime sealed DI Bag module",
```

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1049,6 +1049,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.priority-band",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/priority-band"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/priority-band.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "b9c1342e6c7f0e112a0538c19eb4ad47359386cc",
+          "path": "libs/core/src/service/priority-band.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -41,6 +41,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/capacity/README.md',
   'libs/wbs/application/core/src/module/directory/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
+  'libs/wbs/application/core/src/module/priority-band/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
diff --git a/libs/wbs/application/core/src/module/priority-band/README.md b/libs/wbs/application/core/src/module/priority-band/README.md
--- a/libs/wbs/application/core/src/module/priority-band/README.md
+++ b/libs/wbs/application/core/src/module/priority-band/README.md
@@ -1,5 +1,7 @@
 # Priority band

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.priority-band","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"priority-band.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The whole-ladder replacement under one stamp is documented on PriorityBandService.set; it spans no more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/priority-band.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; Plan commands and the be-01 shim and controller tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
@@ -13,11 +15,21 @@ priority ladder and replaces it on a `canEditProject`-gated write, announcing

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

 `libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
 `libs/wbs/application/core/src/service/priority-band.service.ts` keeps the former path for Plan
 commands, `@wbs/core`'s barrel and be-01's deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.priority-band` (`docs/wiki-policy/policy.json`'s `boundary.application.priority-band`). The
+boundary's `sourceSelector` binds this directory to `priority-band.resource.ts`'s own single
+pre-namespacing predecessor, `priority-band.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds.
```

Project — row, boundary, index:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -221,6 +221,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.project",
+      "name": "Project sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/project",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/project/README.md",
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
+            "path": "libs/wbs/application/core/src/service/project.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.realtime",
       "name": "Realtime sealed DI Bag module",
```

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1068,6 +1068,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.project",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/project"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/project.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "1b40cb91901c693b8a9e9970b938e7327954988b",
+          "path": "libs/core/src/service/project.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -42,6 +42,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/directory/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/priority-band/README.md',
+  'libs/wbs/application/core/src/module/project/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
diff --git a/libs/wbs/application/core/src/module/project/README.md b/libs/wbs/application/core/src/module/project/README.md
--- a/libs/wbs/application/core/src/module/project/README.md
+++ b/libs/wbs/application/core/src/module/project/README.md
@@ -1,5 +1,7 @@
 # Project

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.project","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"project.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The fail-closed optimizer gate and the settings-moved announcement are documented on ProjectService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/project.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; the project, saved-plan and solution routes, Saved plans, the writes fixture and the be-01 shim, controller and database tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
@@ -14,11 +16,21 @@ refusing to switch an optimizer on where the deployment has none and announcing

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

 `libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
 `libs/wbs/application/core/src/service/project.service.ts` keeps the former path for delivery, Saved
 plans, test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.project` (`docs/wiki-policy/policy.json`'s `boundary.application.project`). The
+boundary's `sourceSelector` binds this directory to `project.resource.ts`'s own single
+pre-namespacing predecessor, `project.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds.
```

Step — row, boundary, index:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -317,6 +317,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.step",
+      "name": "Step sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/step",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/step/README.md",
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
+            "path": "libs/wbs/application/core/src/service/step.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.application.use-cases",
       "name": "Core application use cases pilot boundary",
```

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1087,6 +1087,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.step",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/step"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/step.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "1e53de89b1d4f1b1ebf901696bdf36dbfc6d1944",
+          "path": "libs/core/src/service/step.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -45,6 +45,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/project/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
+  'libs/wbs/application/core/src/module/step/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
   'libs/wbs/domain/domain/src/saved-plan/README.md',
   'libs/wbs/adapters/store-memory/src/README.md',
diff --git a/libs/wbs/application/core/src/module/step/README.md b/libs/wbs/application/core/src/module/step/README.md
--- a/libs/wbs/application/core/src/module/step/README.md
+++ b/libs/wbs/application/core/src/module/step/README.md
@@ -1,5 +1,7 @@
 # Step

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.step","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"step.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The announce-after-commit order and the in-use removal refusal are documented on StepService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/step.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; the step routes, the writes fixture and the be-01 shim, controller and database tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
@@ -13,11 +15,21 @@ named under the `application.step` label, so a DI failure says which module aske

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

 `libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
 `libs/wbs/application/core/src/service/step.service.ts` keeps the former path for delivery, test
 fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.step` (`docs/wiki-policy/policy.json`'s `boundary.application.step`). The
+boundary's `sourceSelector` binds this directory to `step.resource.ts`'s own single
+pre-namespacing predecessor, `step.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds.
```

### 10.31 Legacy re-pin (slice 4 step 5 — the numbers only after the red, the Proof after the green)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 51,
+      'historical policy selector or baseline': 63,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -827,8 +827,8 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // naming the pre-namespacing `apps/be-01/src/service/solver-launcher-process.ts` this module
     // was extracted from; raised `historical policy selector or baseline` from 49 to 51 and
     // occurrences from 267 to 269, no unclassified entries (2026-09-23).
-    digest: '113681cd7a2c98566f565cca8176456eb50fb453b6fb94ce5bf3f611a0d576bb',
-    occurrences: 269,
+    digest: '5864733ccd1d50e0a81c9c0f71b3bb20a46565ed4200f417ed0b9b1d56f9a5e2',
+    occurrences: 281,
     unclassified: [],
   });
 });
```

Then:

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -827,6 +827,12 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // naming the pre-namespacing `apps/be-01/src/service/solver-launcher-process.ts` this module
     // was extracted from; raised `historical policy selector or baseline` from 49 to 51 and
     // occurrences from 267 to 269, no unclassified entries (2026-09-23).
+    // Proof: registering the six per-admission resource modules — Calendar marker, Capacity,
+    // Directory, Priority band, Project and Step — added each `boundary.application.<name>`'s
+    // `sourceSelector` and one `baselineEntries` path, all naming the pre-namespacing
+    // `libs/core/src/service/<name>.service.ts` each module was extracted from; raised
+    // `historical policy selector or baseline` from 51 to 63 and occurrences from 269 to 281, no
+    // unclassified entries (2026-09-24).
     digest: '5864733ccd1d50e0a81c9c0f71b3bb20a46565ed4200f417ed0b9b1d56f9a5e2',
     occurrences: 281,
     unclassified: [],
```

### 10.32 Task records (slice 4 step 6)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -161,7 +161,22 @@
 ## 5. The per-admission modules

 - [ ] 5.1 Install the seven resource responsibilities per supplied scope inside `servicesOver`.
-      Negative: two admitted batches sharing staged stores.
+      Negative: two admitted batches sharing staged stores. Six of the seven landed 2026-09-24 as
+      the `calendar-marker`, `capacity`, `directory`, `priority-band`, `project` and `step`
+      directories under `libs/wbs/application/core/src/module/`, each a sealed resource module
+      that `servicesOver` installs through its own installer on every call, over the stores it
+      is handed; each former `service/<name>.service.ts` is a compatibility re-export shim and
+      its `kinds.json` row is rewritten in place (93 entries, unchanged). `compose.test.ts`
+      builds two `servicesOver` graphs over distinct memory sources and proves, per resource,
+      that the second never reads the first one's writes. Proof: a module-level memo reusing one
+      installation across scopes failed each resource's own case; per module, negatives for the
+      installer leaking its bag, its resolver leaking through the returned service, the private
+      options binding exported, the label dropped and one real provider edge replaced. The same
+      slices extend `apps/wbs/be-01/src/service/clock.test.ts`'s scan to every sealed core
+      module's directory and add a Calendar marker row to `ports/sideways-type-boundaries.test.ts`,
+      both watched failing. **Not ticked:** Work item (`service/work-item.service.ts`, 4598
+      lines, fifteen requirements) is still constructed with `new` inside `servicesOver`; packet
+      E8 seals and installs it and ticks this task.
 - [ ] 5.2 Plan commands, with Working plan and the announcement collector private to it.

 ## 6. Domain moves the map names
@@ -246,6 +261,12 @@
       `apps/be-01/src/service/solver-launcher-process.ts` alone. Its index names
       `check.be-01.test`, a new `docs/wiki-policy/relationships.json` fact for `wbs-be-01:test`,
       because the pilot requires every index to name an applicable check.
+      Landed again 2026-09-24 for the six per-admission resource modules of task 5.1 — Calendar
+      marker, Capacity, Directory, Priority band, Project and Step — as each module's `README.md`,
+      a `docs/wiki-policy/modules.json` row `module.application.<name>` and a
+      `docs/wiki-policy/policy.json` boundary `boundary.application.<name>`, each using a
+      `sourceSelector` bound to that module's own pre-namespacing `<name>.service.ts` predecessor
+      alone; the moved `calendar-marker.resource.test.ts` has no separate baseline entry.
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
- A pin differs from step 0 other than by this packet's own prescribed change (`kinds.json` 93
  unchanged in every slice; wiki modules and boundaries +6 each in slice 4; the legacy pin exactly as
  row 82 states; the prose-refusal pin unchanged).
- Any change to what a moved service does. The **only** permitted changes to moved code are the
  import lines of 10.3, 10.14 and 10.23; the only permitted `compose.ts` changes are 10.7's, 10.18's
  and 10.27's.
- A network access or an OpenSpec download.
- A check needs an edit this packet does not prescribe.

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.
Paths under `libs/wbs/application/core/src/` are written from `src/`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                                                                                                                              | Untracked (new)                                                                                                                                                                                                                                                                                                                                 | Deleted                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1     | `apps/wbs/be-01/src/service/clock.test.ts`, `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `compose.test.ts`, `compose.ts`, `index.ts`, `ports/sideways-type-boundaries.test.ts`, `service/calendar-marker.service.ts`, `service/capacity.service.ts`                                                                                | the **seven** files under `src/module/calendar-marker/` (`README.md`, `calendar-marker.resource.test.ts`, `calendar-marker.resource.ts`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`) and the **six** under `src/module/capacity/` (`README.md`, `capacity.resource.ts`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`) | `src/service/calendar-marker.service.test.ts` (moved) |
| 2     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `compose.test.ts`, `compose.ts`, `index.ts`, `service/priority-band.service.ts`, `service/step.service.ts`                                                                                                                                                                            | the six files under `src/module/priority-band/` and the six under `src/module/step/`                                                                                                                                                                                                                                                            | nothing                                               |
| 3     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `compose.test.ts`, `compose.ts`, `index.ts`, `service/directory.service.ts`, `service/project.service.ts`                                                                                                                                                                             | the six files under `src/module/directory/` and the six under `src/module/project/`                                                                                                                                                                                                                                                             | nothing                                               |
| 4     | `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, the six `README.md` files under `src/module/{calendar-marker,capacity,directory,priority-band,project,step}/`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing                                                                                                                                                                                                                                                                                                                                         | nothing                                               |

Slice 1: 9 modified, 13 new, 1 deleted (23 paths). Slice 2: 7 modified, 12 new (19). Slice 3: 7
modified, 12 new (19). Slice 4: 12 modified. The planner may add a revised packet file to its own
commits; the lists are scoped to `$base`, so that does not break them.

## 13. Findings

- **A move can silently weaken an identity-based boundary row.** The sideways checker resolves a
  barrel-named symbol to its declaring file, so a row that names a service's old path stops seeing
  barrel imports once that path becomes a shim (rows 21-23). Every later move of a file some row
  `reaches` needs the moved file's own row; E8 must check the rows for `work-item.service.ts` (none
  today).
- **A path-pinned scan loses its subjects when services move.** `clock.test.ts` read only the two
  `service/` folders, so every earlier sealed module had already dropped out of its two shape
  checks without a failure; only Capacity's pinned path made the move visible. The scan now covers
  every core module directory.
- **Host keys must not reuse export names.** Four of the six resources are exported under the name
  of one of their own store requirements in `servicesOver`; `<name>Store` host keys avoid a
  collision a shared DI graph would otherwise hit.
- **Map:** no defect found in the seven resource rows; its Work item row's "existing store ports" is
  fifteen requirements, which is why E8 is separate.
- **Landed code of packets A-E6:** no defect found.

## 14. Document exemption (precondition, not a slice)

Sections 3, 7 (slice 4 step 0), 10.30, 10.31 and 10.32 cite `libs/core/src/service/<name>.service.ts`
paths, the six predecessors this packet registers. `docs/findings/current-document-check-exemptions.json`
carries this packet's `legacy-root` entry, committed with the packet itself; no slice touches that
file.

## 15. `git apply --check` verification

Every fenced `diff` block above was extracted from this document by the script below and applied
in slice order to a disposable worktree of `c1770237`, with the filesystem steps each slice
prescribes in between, and the resulting tree compared with the rehearsed slice commits.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <slice1-sha> <slice2-sha> <slice3-sha> <slice4-sha>
set -euo pipefail
repo=$1; packet=$2; s1=$3; s2=$4; s3=$5; s4=$6
work=$(mktemp -d "${TMPDIR:?}/e7-extract-XXXXXX")
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
test "$(ls "$work"/*.patch | wc -l)" -eq 35
test "$(ls "$work"/*.listing | wc -l)" -eq 36
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" c17702371858fd0858a23c858111e848ef2ae10e
cd "$wt"
c=libs/wbs/application/core/src
apply() {
  git apply --check "$work/$1.patch"
  git apply "$work/$1.patch"
  echo "applied $1"
}
same_as() {
  git add -A
  if git diff --cached --quiet "$1"; then echo "tree equals $1"; else git diff --cached --stat "$1"; exit 1; fi
}
# module <listing-start> <name>: contract, module, check, README from four consecutive listings
module_files() {
  local n=$1 d=$c/module/$2
  cp "$work/$(printf %02d "$n").listing" "$d/contract.ts"
  cp "$work/$(printf %02d $((n + 1))).listing" "$d/module.ts"
  cp "$work/$(printf %02d $((n + 2))).listing" "$d/check.ts"
  cp "$work/$(printf %02d $((n + 3))).listing" "$d/README.md"
}
# Slice 1
mkdir -p "$c/module/calendar-marker" "$c/module/capacity"
cp "$work/01.listing" "$c/module/calendar-marker/module.test.ts"
cp "$work/02.listing" "$c/module/capacity/module.test.ts"
cp "$c/service/calendar-marker.service.ts" "$c/module/calendar-marker/calendar-marker.resource.ts"
mv "$c/service/calendar-marker.service.test.ts" "$c/module/calendar-marker/calendar-marker.resource.test.ts"
cp "$c/service/capacity.service.ts" "$c/module/capacity/capacity.resource.ts"
apply 01
cp "$work/03.listing" "$c/service/calendar-marker.service.ts"
cp "$work/04.listing" "$c/service/capacity.service.ts"
module_files 5 calendar-marker
module_files 9 capacity
apply 02
apply 03
apply 04
apply 05
apply 06
test "$(ls "$c/module/calendar-marker" | wc -l)" -eq 7
test "$(ls "$c/module/capacity" | wc -l)" -eq 6
same_as "$s1"
# Slice 2
mkdir -p "$c/module/priority-band" "$c/module/step"
cp "$work/13.listing" "$c/module/priority-band/module.test.ts"
cp "$work/14.listing" "$c/module/step/module.test.ts"
cp "$c/service/priority-band.service.ts" "$c/module/priority-band/priority-band.resource.ts"
cp "$c/service/step.service.ts" "$c/module/step/step.resource.ts"
apply 07
cp "$work/15.listing" "$c/service/priority-band.service.ts"
cp "$work/16.listing" "$c/service/step.service.ts"
module_files 17 priority-band
module_files 21 step
apply 08
apply 09
apply 10
test "$(ls "$c/module/priority-band" | wc -l)" -eq 6
test "$(ls "$c/module/step" | wc -l)" -eq 6
same_as "$s2"
# Slice 3
mkdir -p "$c/module/project" "$c/module/directory"
cp "$work/25.listing" "$c/module/project/module.test.ts"
cp "$work/26.listing" "$c/module/directory/module.test.ts"
cp "$c/service/project.service.ts" "$c/module/project/project.resource.ts"
cp "$c/service/directory.service.ts" "$c/module/directory/directory.resource.ts"
apply 11
cp "$work/27.listing" "$c/service/project.service.ts"
cp "$work/28.listing" "$c/service/directory.service.ts"
module_files 29 project
module_files 33 directory
apply 12
apply 13
apply 14
test "$(ls "$c/module/project" | wc -l)" -eq 6
test "$(ls "$c/module/directory" | wc -l)" -eq 6
same_as "$s3"
# Slice 4
for n in $(seq 15 35); do apply "$(printf %02d "$n")"; done
same_as "$s4"
cd "$repo"
git worktree remove --force "$wt"
echo "all 35 diffs applied in slice order; every slice tree equals its rehearsal commit"
````

Output:

```text
diffs=35 listings=36
applied 01
applied 02
applied 03
applied 04
applied 05
applied 06
tree equals a081b59f
applied 07
applied 08
applied 09
applied 10
tree equals 98c986b0
applied 11
applied 12
applied 13
applied 14
tree equals 576f8c84
applied 15
applied 16
applied 17
applied 18
applied 19
applied 20
applied 21
applied 22
applied 23
applied 24
applied 25
applied 26
applied 27
applied 28
applied 29
applied 30
applied 31
applied 32
applied 33
applied 34
applied 35
tree equals 7661c212
all 35 diffs applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits are throwaway: slice 1 `a081b59f`, slice 2 `98c986b0`, slice 3 `576f8c84`,
slice 4 `7661c212`, on branch `rehearse/040-6-e7-per-admission-resources` above `c1770237` (not
pushed; kept only as the comparison target of the script above). None of them touches `verify.md`,
which only the executor writes. Their subjects are rehearsal labels; the planner commits every
slice with section 7's subject, and only the trees are compared. Lefthook ran on all four.

## 16. Deferred: label agreement

Whether each README's `moduleId` names the label its module seals its bag under is not checked,
matching packet D's deferral.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                                                                                                    |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fixture reproduces the failure first | §6 rows 1-2, 26-27, 45-46 (module reds), 3, 28, 47 (bundle reds), 4 (the clock scan broken by the move itself), 63-80 and 82 (registration and pin reds), all on code the slice has not fixed |
| 2   | Test code passes typecheck and lint  | `wbs-core` and `wbs-be-01` lint and typecheck on each rehearsed slice; row 44 is the typecheck failure a first draft hit; lefthook passed on all four rehearsal commits                       |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                                                                                                           |
| 4   | Commands can show failure            | §7 status wrapper; `if count=$(grep -cF …)` form for every bundle grep                                                                                                                        |
| 5   | Tests reading `HEAD`                 | §7 slice 4 preamble: slices 1-3 are committed before the pilot suite runs, and the README blocks arrive only through `pilotPaths`                                                             |
| 6   | Sandbox facts                        | §7 slice 1 step 10 (service-kinds is planner-only); `app.routes.test.ts` excluded; §8                                                                                                         |
| 7   | Known race                           | §8                                                                                                                                                                                            |
| 8   | Names                                | `module.application.<name>` for six library modules; labels `application.<name>`; Twilight Burokrat                                                                                           |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines                                                                                                             |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change; `di-bag` stays 0.4.0                                                                                                                 |
| 11  | `\|\| test $? -eq 1` after pipelines | not used; single-command `if … then … else status=$?` form only                                                                                                                               |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                                                                                                      |
| 13  | Index every module file              | §10.30's six index diffs name every non-README file of each module; `check-indexes committed` reported them (§7 slice 4)                                                                      |
| 14  | Bun path vs filter                   | every focused run uses `./…` or `cd <project>`; lint and typecheck before baselines                                                                                                           |
| 15  | Interleaving property tests          | not triggered: no owner, queue, lock or retry logic is added; the per-scope property is a construction fact, proved by one memo fault per resource                                            |
| 16  | Model-based tests                    | not triggered                                                                                                                                                                                 |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed` (dispatch paragraph)                                                                                                                             |
| 18  | Symbol-based boundary checks         | §10.9 reuses the TypeChecker-based checker; rows 22-23 prove the new row is needed and what the move had removed                                                                              |
| 19  | ugrep exits 1 on missing file        | `test -f "$bundle"` precedes every `grep -cF` on a bundle                                                                                                                                     |
| 20  | Promise only what a check keeps      | 5.1 left unticked (Work item remains); K4 and K6 stated as read, not watched, except the one Calendar marker row; `check-indexes` called index validation; no compile red claimed (§6)        |
