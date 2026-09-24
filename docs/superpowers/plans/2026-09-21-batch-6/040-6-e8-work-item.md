# 040.6 E8 — Work item as a per-admission resource module, and the tick of task 5.1

| Field      | Value                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — thirteenth packet                                                                      |
| Size class | M, in three slices                                                                                                                                                                |
| Slices     | 1 seals Work item as a module (moved resource and test, shim, clock-scan pin), 2 installs it per supplied scope in `servicesOver`, 3 registers it in the wiki pilot and ticks 5.1 |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` task 5.1 (its seventh and last resource; ticked with a dated note), and task 7.5 for `module/work-item/`                         |
| Planned on | 2026-09-24; every slice rehearsed end to end and committed on a throwaway branch cut from `57557dcc5dd0d46d9f2963937131a97022007598`                                              |

**Dates.** Every `Proof:` comment and task note below carries the planner's rehearsal date,
2026-09-24. Write the date you actually observe (`date -u +%F`) when you add them; if it differs,
change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e8-work-item.md` must
print an entry) and its `legacy-root` exemption entry, and must descend from
`57557dcc5dd0d46d9f2963937131a97022007598`, packet E7's slice-4 commit. Every count below was
measured on `57557dcc`: the six E7 modules, their shims, E7's `compose.ts`, `index.ts`,
`kinds.json`, wiki rows and legacy pin (63, 281, `5864733c…`), E7's widened `clock.test.ts` and the
nineteenth sideways row are all in the tree this packet starts from. This packet edits none of E7's
files except by the named diffs to `compose.ts`, `compose.test.ts`, `index.ts`, `kinds.json`,
`clock.test.ts` and the three wiki files, each of which appends after E7's lines or rewrites the
Work item line alone. Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e8-work-item 1 <packet-containing commit sha> --batch batch-6 --require-ancestor 57557dcc5dd0d46d9f2963937131a97022007598 --slice-note 'reviewed base <sha>' --preserve evidence
```

Slices 2 and 3 resume the clone the previous slice built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e8-work-item 2 <the same sha> --batch batch-6 --resume --require-ancestor <slice 1 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e8-work-item 3 <the same sha> --batch batch-6 --resume --require-ancestor <slice 2 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

The executor never runs `apps/wbs/be-01/src/app.routes.test.ts`: its `refuses framed GET and HEAD
bodies on the production health route` test binds a port through `Bun.serve`, which a sandbox
refuses with `EPERM: operation not permitted, listen` while the network is off. The be-01 unit
command below excludes that file and the planner runs it (section 8). Nothing else binds a port or
needs the network (`bun build` and the pilot suite's local `git clone` run offline), so **no slice
needs `--network`**. No slice reads an earlier attempt's evidence, only the committed tree, so **no
slice needs `--seed`**.

## 1. Goal and non-goals

**Goal.** Make `servicesOver(stores, shared)` install its last `new`-constructed resource, Work
item, through a sealed DI Bag module's installer, over the stores it is handed, on every call —
the seventh of task 5.1's seven resources, after which 5.1 is ticked. Work item gets the E7 shape
(a README, a contract, a labelled `module.ts`, a composition `check.ts`, the moved
`work-item.resource.ts` and its moved test):

| Module directory under `libs/wbs/application/core/src/module/` | Moved from `service/`                                                                   | Export      | Label                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| `work-item/`                                                   | `work-item.service.ts` (4598 lines), `work-item.service.test.ts` (2321 lines, 98 tests) | `workItems` | `application.work-item` |

Task 5.1's own negative — two admitted batches must not share staged stores — gets one more
`compose.test.ts` case: two `servicesOver` calls over two distinct memory sources, a create through
the first, and a tree read through the second that must list nothing. It is proved by memoizing
the Work item installation across calls and watching that case fail. Slice 3 registers the module
in the wiki content-review pilot through its frozen-revision predecessor.

**Non-goals.**

- No change to what Work item does. The moved body differs from its source only in import depth
  (10.2 is the exact diff); `servicesOver`'s argument values and `WritingServices`' shape are
  unchanged (the installer returns the same class).
- No importer is repointed. All 46 code files that name the old path keep it: the old path becomes
  a one-line `export *` shim, which preserves class identity (`testing/available-work-item-service.ts`
  keeps `extends WorkItemService` over the same class). Delivery's direct dependency (K2) stays, is
  recorded in `contract.ts` and is tracked under task 7.4.
- No domain moves (task 6.1): the moved file keeps importing `service/assumed-assignee.ts`,
  `compensating.ts`, `dependency.ts`, `numbered-work-item.ts` and `roll-up.ts` through deeper
  relative paths.
- No new sideways row: no row of `ports/sideways-type-boundaries.test.ts` names
  `work-item.service.ts` (section 3), so the move weakens none.
- No change to `compose.test.ts`'s `runtimeOf` (section 3 measures why none is needed), to
  `service/service-boundaries.test.ts` (its list decides when a shim may go, task 7.1), to be-01's
  deep-import shim, or to any library version (`di-bag` stays 0.4.0). No frontend, gateway or MCP
  change.

## 2. Read first

| File                                                                                                                                                       | Why                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                               | Rules R1 to R5.                                                                              |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e7-per-admission-resources.md`                                                                            | The precedent this packet mirrors; its section 4 is this packet's scope.                     |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` (the Work item row; "Delivery and composition hazards", the `servicesOver` bullet) | What the module exports and requires; why a singleton installation would leak staged stores. |
| `libs/wbs/application/core/src/module/project/`                                                                                                            | The resource module whose four files the new module mirrors.                                 |
| `libs/wbs/application/core/src/compose.ts` (`servicesOver`, lines 86-138 at `57557dcc`)                                                                    | The one installation site.                                                                   |
| `openspec/changes/adopt-di-composition/specs/di-composition/spec.md` ("Writing modules are installed per admitted scope")                                  | The requirement task 5.1 implements.                                                         |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation"                                         | The exact `jq -s -e` contract slice 3 uses.                                                  |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `57557dcc` on 2026-09-24.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Evidence                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `compose.ts:86` `servicesOver(stores, shared)` installs six resources through installers and builds `workItems: new WorkItemService({...})` (`:120-136`) with fifteen fields; `WritingServices = ReturnType<typeof servicesOver>` (`:140`). `compose.ts:35` is the only production `import { WorkItemService }` value import in core.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Read.                                                 |
| `WorkItemServiceOptions` (`work-item.service.ts:788-856`) has **fifteen** required fields: twelve repository ports — `workItems: WorkItemStore`, `projects: ProjectStore`, `estimates: EstimateStore`, `actuals: ActualStore`, `measures: MeasureStore`, `progress: StepProgressStore`, `directory: DirectoryStore`, `capacity: CapacityStore`, `priorityBands: PriorityBandStore`, `dependencies: DependencyStore`, `subtrees: SubtreeStore`, `journal: CommandJournalStore` — and `broadcast: Broadcaster`, `scheduler: Scheduler`, `clock: Clock`. None is optional. Five field names (`workItems`, `projects`, `directory`, `capacity`, `priorityBands`) are also `WritingServices` keys, so the module takes every store under a `<name>Store` host key.                                                                                                                                                                                                                                                                                                                                                                                                                            | Read.                                                 |
| The moved file's non-port imports are `@wbs/domain` and five `service/` support files (`assumed-assignee`, `compensating`, `dependency`, `numbered-work-item`, `roll-up`); it imports no other resource, so K4 and K6 hold by reading. It has no dynamic import, `import.meta` or file read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `grep -n "from '"`, `grep -n "import(\|import.meta"`. |
| `git grep -l "work-item.service'"` prints **52** files at `57557dcc`: 46 code files and six batch-6 packets. The 46: in core `compose.ts`, `index.ts`, `http/project.routes.ts`, `http/work-item.routes.ts`, `module/plan-import/plan-import.feature.ts` (type), `module/saved-plans/saved-plan-schedule.ts:14` (values `NO_DEADLINES`, `slicesOf`), `service/plan-commands.ts`, `testing/available-work-item-service.ts` (`extends WorkItemService`), `testing/harness.ts`, the moved test itself, `service/service-boundaries.test.ts` (a lint list) and eight core `service/*.test.ts`; `libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts`; in be-01 `app.ts`, the deep-import shim `service/work-item.service.ts`, `testing/available-work-item-service.ts`, `tools/capture-capacity-oracle.ts` and 22 tests, one of them `service/clock.test.ts`, which names the path as a string. **Every import resolves through the shim** (`export *` re-exports the class binding itself); the one string pin is repointed (row 3): the rehearsed slice 1 keeps core at `C + 5`, be-01 unit at `E`, and lint and typecheck of both projects at exit 0 with no importer touched. | `git grep`; rehearsed.                                |
| Direct constructions (`new WorkItemService(` / `new AvailableWorkItemService(`): `compose.ts`, `testing/harness.ts`, the moved test (3), `store-sqlite/src/write-coordinator.db.test.ts`, be-01 `tools/capture-capacity-oracle.ts` and 20 be-01 test files (38 sites; 45 in all). All keep constructing the class directly; none needs the module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `git grep -n`.                                        |
| **`compose.test.ts`'s private reads.** `runtimeOf` (`compose.test.ts:125-139`) casts `services.workItems` to read the private `clock` field and `opts.scheduler`, `opts.broadcast`, and `shares runtime identities while creating a fresh scope, collector and graph per batch` compares them with `toEqual`. The installer builds `new WorkItemService(workItemOptions)`, whose `opts` is the module's options object and whose `clock` is `opts.clock`, so both reads keep working **with no test edit**; the rehearsed slice 2 keeps that test green, and row 15 shows it still sees a replaced scheduler. It compares with `toEqual`, not identity: row 16 records that a structurally equal copy (`{ ...scheduler }`) passes (section 13).                                                                                                                                                                                                                                                                                                                                                                                                                                          | Read; rehearsed.                                      |
| **The move breaks one check loudly.** `apps/wbs/be-01/src/service/clock.test.ts:114-127` pins `coreWorkItems` at `libs/wbs/application/core/src/service/work-item.service.ts` and asserts `export class WorkItemService`; the shim does not contain it (row 3). E7's module scan (`serviceFolders`, `:46-51`) already reads `module/work-item/`, so after the repoint both shape checks see the moved file (row 11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rehearsed.                                            |
| No row of `ports/sideways-type-boundaries.test.ts` names `work-item.service.ts` or any path this packet moves (`grep -n work-item` prints nothing), so the move silently weakens no identity row (E7 section 13's first finding, checked).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `grep`.                                               |
| **Frozen-revision predecessor:** `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/work-item.service.ts` prints `100644 blob 29ab341f9befec90944900d13f9c9c823d06de95`. The moved test's predecessor `work-item.service.test.ts` also existed then (`5d25e3880c70c401fc7e156d93965263af6b90f4`) and, as for Calendar marker in E7, gets no baseline entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `git ls-tree`.                                        |
| `kinds.json` has `K=93` entries; `libs/wbs/application/core/src/service/work-item.service.ts` is the `resource` row at line 439, rewritten in place to `support`; the count stays 93. `work-item.resource.ts` declares its kind by suffix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `python3`; `grep -n`.                                 |
| The wiki pilot holds `M=18` modules and `B=18` boundaries; `module.application.work-item` sorts between `module.application.use-cases` and `module.archive.bounded-replay-sweep`; its README sorts after `module/step/README.md` in `pilotPaths`. The pilot suite is `21` tests, `0` failures, `305` `expect()` calls (300 s); the legacy pin is `63`/`281`/`5864733c…`. `check.core.test` already exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `python3`; rehearsed.                                 |
| Baselines at `57557dcc`, taken after `wbs-core`/`wbs-be-01` lint and typecheck (exit 0): core `bun test src` `613` over 66 files; be-01 unit set (without `*.db.test.ts` and `app.routes.test.ts`) `520` over 49; `compose.test.ts` `15` tests; `work-item.service.test.ts` `98`; OpenSpec `114` passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Rehearsed.                                            |

## 4. Why three slices

E7's slices changed 19-23 paths each. Here slice 1 is 13 paths (seven new files, five modified, one
deleted) but the heaviest per path: a 4598-line move, a 2321-line moved test, a fifteen-key module
and its five negatives, and the clock pin the move itself breaks. Slice 2 is the composition change
alone (three paths) with the per-scope negative and the runtime-identity observation, so a
`compose.ts` refusal cannot strand a half-sealed module. Slice 3 is registration (seven paths),
whose pilot suite alone takes about five minutes twice.

## 5. File plan

Every path is under `libs/wbs/application/core/src/` unless it starts with `apps/`, `docs/`,
`openspec/` or `tools/`.

| Path                                                                                                        | Slice   | Action                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `module/work-item/module.test.ts`                                                                           | 1       | create **first**, for the red (10.1)                                       |
| `module/work-item/work-item.resource.ts`                                                                    | 1       | `cp` from `service/work-item.service.ts`, then 10.2's import diff          |
| `module/work-item/work-item.resource.test.ts`                                                               | 1       | **`mv`** from `service/work-item.service.test.ts`, then 10.2's import diff |
| `service/work-item.service.ts`                                                                              | 1       | content replaced by the shim of 10.3                                       |
| `module/work-item/{contract,module,check}.ts`, `README.md`                                                  | 1, 3    | create (10.4); slice 3 adds the index block and "Wiki registration"        |
| `index.ts`, `docs/code-organization/kinds.json`, `apps/wbs/be-01/src/service/clock.test.ts`                 | 1       | 10.5, then the Proofs of 10.6                                              |
| `compose.ts`                                                                                                | 2       | 10.7                                                                       |
| `compose.test.ts`                                                                                           | 2       | the per-scope case (10.8), then its Proof (10.9)                           |
| `docs/wiki-policy/modules.json`, `policy.json`; `apps/wiki/cli/src/policy/pilot-policy.test.ts`; the README | 3       | three diffs, in order (10.10-10.12)                                        |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                   | 3       | legacy re-pin (10.13, 10.14)                                               |
| `openspec/changes/adopt-di-composition/tasks.md`                                                            | 3       | 5.1 ticked with its dated note, 7.5 extended (10.15)                       |
| `openspec/changes/adopt-di-composition/verify.md`                                                           | 1, 2, 3 | each slice appends its own observations                                    |

**Directory contents.** `module/work-item/` holds **seven** files: `README.md`, `check.ts`,
`contract.ts`, `module.test.ts`, `module.ts`, `work-item.resource.test.ts`, `work-item.resource.ts`.
Slice 3's index block names every file but the README.

**Neighbours.** E7 owns the six other resource modules, their shims and rows, the nineteenth
sideways row and the legacy pin's last Proof; this packet appends after each and edits none of their
lines. `tasks.md` has been touched by every 040.6 packet; this packet's edits are to 5.1 and to 7.5's
running note. Section 12's hand-over lists are scoped to each slice's own `base`.

## 6. Rehearsed observations

Every row was produced on the throwaway branch in a private worktree of `57557dcc`, against the
exact listings of section 10, and restored with `cp` + `cmp` before the next. Rows marked
**evidence** are the planner's measurements behind a decision; the executor does not repeat them.

**The five sealed-module faults** (rows 6-10), as in E7:

```text
tuple     module.ts: .buildModule(['workItems'], { label: WORK_ITEM_LABEL })
          -> .buildModule(['workItems', 'workItemOptions'], { label: WORK_ITEM_LABEL })
label     module.ts: .buildModule(['workItems'], { label: WORK_ITEM_LABEL })  ->  .buildModule(['workItems'])
edge      module.ts, the object the workItemOptions factory returns: the line `        broadcast,`
          directly after `        journal: journalStore,`
          -> `        broadcast: { ...broadcast, publish: () => Promise.resolve() },`
bag       check.ts:  return { workItems: bag.resolve('workItems') };
          -> const exposed = { workItems: bag.resolve('workItems'), bag };
             return exposed;
resolver  check.ts:  return { workItems: bag.resolve('workItems') };
          -> return { workItems: Object.assign(bag.resolve('workItems'), { resolve: bag.resolve.bind(bag) }) };
```

`module.ts` contains `        broadcast,` twice (the parameter list and the returned object); the
edge fault edits only the one directly after `        journal: journalStore,`.

**The per-scope fault** (row 14). In `compose.ts`, insert one line and a blank line immediately
before `export interface ServicesOverOptions {`, and wrap the Work item installer call:

```text
let reusedWorkItem: ReturnType<typeof installWorkItem> | undefined;

    workItems: installWorkItem({            ->  workItems: (reusedWorkItem ??= installWorkItem({
    }).workItems,                           ->  })).workItems,
```

**The runtime fault** (row 15). In `module.ts`, in the returned object, the two lines
`        scheduler,` / `        clock,` directly before `      }),` become
`        scheduler: { ...scheduler, supports: () => true },` / `        clock,`.

| #   | Where                                                              | Fault injected                                                                                                                      | Test that observed it                                                                                    | Literal fragment observed                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, unchanged tree                                        | none; `check.ts` does not exist                                                                                                     | `module/work-item/module.test.ts`                                                                        | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                           |
| 2   | slice 1 step 0, unchanged `compose.ts`                             | none                                                                                                                                | `bun build libs/wbs/application/core/src/compose.ts --target=bun`, then `grep -cF application.work-item` | build exit 0; `application.work-item count=0 (grep exit 1)`                                                                                                                                                                     |
| 3   | slice 1, after 10.3's shim                                         | none; the move itself                                                                                                               | `apps/wbs/be-01/src/service/clock.test.ts`                                                               | `is reading real service sources, not an empty list` fails: `Expected to contain: "export class WorkItemService"`, `Received:` the shim's text; `3 pass`, `1 fail`                                                              |
| 4   | slice 1 green                                                      | none                                                                                                                                | `bun test ./libs/wbs/application/core/src/module/work-item/`                                             | `103 pass`, `0 fail`, `225 expect() calls`, 2 files                                                                                                                                                                             |
| 5   | slice 1, after 10.5                                                | none                                                                                                                                | `clock.test.ts`                                                                                          | `4 pass`, `0 fail`                                                                                                                                                                                                              |
| 6   | `module.ts`                                                        | tuple                                                                                                                               | the private-binding test and the two label tests                                                         | `Received function did not throw`; `Expected to contain: "application.work-item/workItemOptions"`; message `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "workItemOptions"`; `2 pass`, `3 fail`                                    |
| 7   | `module.ts`                                                        | label                                                                                                                               | `labels its private bindings with the module name`, `names itself when a host omits a requirement`       | `3 pass`, `2 fail`; the private-binding test stays green                                                                                                                                                                        |
| 8   | `module.ts`, the `workItemOptions` factory's return                | edge                                                                                                                                | `announces a created work item through the broadcaster installWorkItem wires`                            | `- [ [ "Scope", ], ]` / `+ []`; `4 pass`, `1 fail`                                                                                                                                                                              |
| 9   | `check.ts`                                                         | bag                                                                                                                                 | `exposes only the contract exports from its installer`, first assertion                                  | received keys add `"bag"` (`Expected - 0`, `Received + 1`); `4 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                     |
| 10  | `check.ts`                                                         | resolver                                                                                                                            | the same test, second assertion                                                                          | `Expected: true`, `Received: false`; `4 pass`, `1 fail`; typecheck exit 0                                                                                                                                                       |
| 11  | `module/work-item/work-item.resource.ts`, `WorkItemServiceOptions` | `  now?: () => number;` inserted after its last field `  clock: Clock;` (line 859, the only line that is exactly `  clock: Clock;`) | `clock.test.ts` › `is the only clock a service that stamps a write reads`                                | `+   "libs/wbs/application/core/src/module/work-item/work-item.resource.ts",`; `3 pass`, `1 fail`                                                                                                                               |
| 12  | slice 2, after 10.7                                                | `servicesOver` installs Work item                                                                                                   | row 2's build and grep                                                                                   | `count=1`                                                                                                                                                                                                                       |
| 13  | slice 2, after 10.8                                                | none                                                                                                                                | `bun test ./libs/wbs/application/core/src/compose.test.ts`                                               | `16 pass`, `0 fail`                                                                                                                                                                                                             |
| 14  | `compose.ts`                                                       | the per-scope fault                                                                                                                 | `-t "installs Work item per supplied scope"`                                                             | `-   "workItems": [],` and, in the received tree's `workItems`, `"name": "Scope",`; `0 pass`, `15 filtered out`, `1 fail`; typecheck exit 0                                                                                     |
| 15  | `module.ts`, the `workItemOptions` factory's return                | the runtime fault                                                                                                                   | `-t "shares runtime identities"`                                                                         | `expect(graphs.map(runtimeOf)).toEqual(` fails with `- Expected  - 0` / `+ Received  + 0` (the two `supports` functions differ by identity only); `0 pass`, `15 filtered out`, `1 fail`; typecheck exit 0                       |
| 16  | **evidence**: row 15 with `scheduler: { ...scheduler }`            | a structurally equal copy                                                                                                           | same test                                                                                                | `1 pass`, `0 fail` — `runtimeOf` compares with `toEqual`, so only a changed member is seen (section 13)                                                                                                                         |
| 17  | **evidence**: row 14 on the whole file                             | the per-scope fault                                                                                                                 | the whole `compose.test.ts`                                                                              | `11 pass`, `5 fail`: the memo also breaks four `composeServices` cases, which is why the row is run with `-t`                                                                                                                   |
| 18  | slice 3, row diff alone                                            | `modules.json` row                                                                                                                  | `pins exact pre-index tuples and passes observe lint from external trust`                                | `pilot-policy.test.ts:383` `Expected: 18`, `Received: 19`; `0 pass`, `1 fail`                                                                                                                                                   |
| 19  | slice 3, row and boundary                                          | `policy.json` boundary                                                                                                              | the same test                                                                                            | `pilot-policy.test.ts:420` `Expected: true`, `Received: false`; `0 pass`, `1 fail`                                                                                                                                              |
| 20  | slice 3, all three                                                 | index                                                                                                                               | the same test                                                                                            | `1 pass`, `0 fail`                                                                                                                                                                                                              |
| 21  | slice 3 green                                                      | registered                                                                                                                          | the whole `pilot-policy.test.ts`                                                                         | `21 pass`, `0 fail`, `306 expect() calls` (baseline `21`/`0`/`305`: one more per-boundary assertion)                                                                                                                            |
| 22  | slice 3, legacy pin unchanged, after registration                  | none                                                                                                                                | `every legacy source occurrence and relevant text family is pinned`                                      | `historical policy selector or baseline` `63` → `65`, `occurrences` `281` → `283`, digest `5864733c…` → `0d78b5794663e2bd708b6d307ba2643d33a414d717771b682392445958fe4e07`; `Expected - 3` / `Received + 3`; `0 pass`, `1 fail` |
| 23  | slice 3, after 10.13                                               | none                                                                                                                                | the same test                                                                                            | `1 pass`                                                                                                                                                                                                                        |

Each module assertion has its own mutation: tuple and label are independent (the label fault leaves
the private-binding test green); bag and resolver split the installer test's two assertions; the
edge breaks the one wire the module test drives end to end (create → journal → tree → scheduler →
broadcast). The other fourteen wires are held by the type checker — each store port is a distinct
interface, so a swapped store does not compile — and by row 15 for the scheduler.

**No compile red, on purpose.** No slice changes a type anyone else sees: the installer returns the
class `servicesOver` used to construct, so `WritingServices` is unchanged. The installation red is
row 2: the `compose.ts` bundle contains no `application.work-item` until `servicesOver` calls the
installer. The per-scope case is green on unchanged code, because `new` already builds per call;
row 14 is what proves it can fail.

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
`if diff …; then …; else test $? -eq 1; fi` form, since the module files are untracked) and its
failing output beside it. Every step 0 opens with `base=$(git rev-parse HEAD)` and an empty-status
check; every count compared (`K`, `C`, `F`, `E`, `EF`, `M`, `B`, `T`, `TF`, `P`, `N`) is assigned
in the slice that compares it, and the same names mean the same commands in every slice.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`. After
appending to `verify.md`, run `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
before the format check.

**The shared baseline block.** Slices 1 and 2 record their baselines with this block, `<n>` their
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
label=application.work-item
if count=$(grep -cF "$label" "$bundle"); then echo "$label count=$count"; else status=$?; test "$status" -eq 1; echo "$label count=0 (grep exit 1)"; fi
```

Expect `exit=0` in all four logs. Call the core pass count `C` and file count `F`, and the be-01
unit pass count `E` and file count `EF` (`app.routes.test.ts`'s six tests are the planner's). Expect
`count=0 (grep exit 1)` in both slices (the label enters the bundle only in slice 2 step 2). Slice
2's green bundle reruns the same build with `-green` in place of `-red` in both file names and
expects `count=1`.

### Slice 1 — Seal Work item as a DI Bag resource module

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e libs/wbs/application/core/src/module/work-item && echo "gate: module absent"
test -f libs/wbs/application/core/src/module/directory/module.ts && test -f libs/wbs/application/core/src/module/project/module.ts && echo "gate: E7 landed"
wc -l < libs/wbs/application/core/src/service/work-item.service.ts
wc -l < libs/wbs/application/core/src/service/work-item.service.test.ts
grep -cF "workItems: new WorkItemService({" libs/wbs/application/core/src/compose.ts
grep -cF "(file) => file.path === 'libs/wbs/application/core/src/service/work-item.service.ts'," apps/wbs/be-01/src/service/clock.test.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `4598`, `2321`, `1`, `1`, then a number: call it `K`
(observed `93`). Then run the shared baseline block with `n=1` (observed `C=613` over `F=66`,
`E=520` over `EF=49`; row 2). This slice ends at `C + 5` over `F + 1` (one `module.test.ts` of five
tests; the moved resource test keeps its 98) and at `E` over `EF`.

**Steps — tests first, then the implementation, in this one slice.**

1. `mkdir -p libs/wbs/application/core/src/module/work-item`, create `module.test.ts` from 10.1
   verbatim, and run `bun test ./libs/wbs/application/core/src/module/work-item/module.test.ts`.
   Expect row 1. Save the log. This red is evidence, not a commit.
2. Move the code. From the repository root:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
cp "$c/service/work-item.service.ts" "$c/module/work-item/work-item.resource.ts"
mv "$c/service/work-item.service.test.ts" "$c/module/work-item/work-item.resource.test.ts"
```

Then apply 10.2's diff (import lines only, two files), and replace `service/work-item.service.ts`'s
content with 10.3's shim. The `mv` is an **authorised deletion** of the old test path: its 98 tests
must exist at exactly one path, and no file imports a test. Now run
`bun test ./apps/wbs/be-01/src/service/clock.test.ts` and expect row 3's red: the move itself
removes `export class WorkItemService` from the path that test pins. Save it.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` in `module/work-item/` from 10.4
   verbatim (no `Proof:` comments; no `module-index` block yet — slice 3 adds it). Run
   `bun test ./libs/wbs/application/core/src/module/work-item/` → row 4.
4. Apply 10.5's diff (`index.ts` gains two export lines; the `kinds.json` row rewritten in place;
   `clock.test.ts`'s `coreWorkItems` names the moved file) and rerun `clock.test.ts` → row 5. Do
   **not** touch `compose.ts`: the installation is slice 2's.
5. `wbs-core` and `wbs-be-01` lint and typecheck, under the status wrapper → exit 0. Only rule-17
   diagnostics (`simple-import-sort/*`, `prettier/prettier`) may be fixed with `bunx eslint --fix`
   on files this slice owns; anything else is a stop.
6. The negatives of section 6, **one at a time, each restored and `cmp`-proved before the next**:
   rows 6-10 against `bun test ./libs/wbs/application/core/src/module/work-item/module.test.ts`;
   row 11 against `clock.test.ts`. For rows 9 and 10 also run `wbs-core:typecheck` on the mutated
   tree and record its exit 0.
7. Only now apply 10.6's diff: the Proof comments in `module.ts`, `check.ts` and `clock.test.ts`.
   Change the date only if yours differs, and change a fragment only if what you saw differs (then
   record the difference).
8. Planner-only, and why: `tools/tool-devsync/src/service-kinds.test.ts` compares `kinds.json` to
   `git ls-files`, which the planner's staging settles. Run this filesystem substitute instead and
   expect `93 []` (`K` unchanged, no row naming a missing file):

```sh
python3 -c "import json,os;e=json.load(open('docs/code-organization/kinds.json'))['entries'];print(len(e),[x['path'] for x in e if not os.path.isfile(x['path'])])"
```

9. Closing checks, each under the status wrapper: `(cd libs/wbs/application/core && bun test src)`
   → exit 0, `C + 5` over `F + 1` (observed `618` over 67); the be-01 unit command → `E` over `EF`
   (observed `520` over 49); `wbs-core` and `wbs-be-01` lint and typecheck → exit 0;
   `test "$(ls libs/wbs/application/core/src/module/work-item | wc -l)" -eq 7`;
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
10. Append to `openspec/changes/adopt-di-composition/verify.md` a `### Work item, Slice 1 — <date>`
    section: `base`, `K`, `C`/`F`, `E`/`EF`, rows 1-5, every fault of rows 6-11 with its fragment
    and evidence basenames, the step-8 substitute, and one line: "46 code files still name
    `service/work-item.service.ts` and resolve through the shim; delivery, Plan commands, Plan
    import and Saved plans still name `WorkItemService` or its values directly (K2), tracked under
    7.4". Prettier on it, then rerun the format check.
11. Hand-over: section 12's slice-1 modified and deleted paths must equal
    `git diff --name-only "$base"`, and its new paths `git ls-files --others --exclude-standard`.

Planner commit: `refactor(core): seal Work item as a per-admission resource module`. The planner
stages with `git add -A` over exactly section 12's paths; Git's rename detection reports
`work-item.resource.test.ts` as a rename. The planner then runs `tool-devsync:test` whole on the
commit (section 8).

### Slice 2 — Install Work item per supplied scope inside `servicesOver`

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/work-item/check.ts && echo "gate: slice 1 landed"
grep -cF "workItems: new WorkItemService({" libs/wbs/application/core/src/compose.ts
grep -cF "import { WorkItemService } from './service/work-item.service';" libs/wbs/application/core/src/compose.ts
grep -cF 'test("installs' libs/wbs/application/core/src/compose.test.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the two gate lines, `1`, `1`, `6`, then `K` (observed `93`). Run the shared
baseline block with `n=2` (observed `C=618` over `F=67`, `E=520` over `EF=49`; `count=0`, row 2).
This slice ends at `C + 1` over `F` and at `E` over `EF`.

1. Run `bun test ./libs/wbs/application/core/src/compose.test.ts` → `15 pass`, `0 fail`. Save it.
2. Apply 10.7's diff (`compose.ts` imports `installWorkItem`, drops the `WorkItemService` value
   import, and installs Work item through the installer). Rerun the bundle of the shared block with
   `-green` names → `count=1` (row 12).
3. Apply 10.8's diff (one `compose.test.ts` case). Rerun `compose.test.ts` → row 13
   (`16 pass`, `0 fail`); the existing `shares runtime identities while creating a fresh scope,
collector and graph per batch` stays green with **no** edit to `runtimeOf` (section 3).
4. `wbs-core` and `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
5. The negatives, one at a time, each restored and `cmp`-proved: row 14 against
   `bun test ./libs/wbs/application/core/src/compose.test.ts -t "installs Work item per supplied scope"`
   (run with `-t`: row 17 shows why), and row 15 against
   `bun test ./libs/wbs/application/core/src/compose.test.ts -t "shares runtime identities"`. For
   both also run `wbs-core:typecheck` on the mutated tree and record its exit 0. Rows 16 and 17 are
   not required.
6. Only now apply 10.9's diff (the Proof in the new case). Row 15 needs no Proof comment: it
   observes an existing test, which this packet does not change; it is recorded in `verify.md`.
7. The step-8 substitute of slice 1 → `93 []`.
8. Closing checks, each under the status wrapper: core → `C + 1` over `F` (observed `619` over
   67); be-01 unit → `E` over `EF`; `wbs-core` and `wbs-be-01` lint and typecheck → exit 0;
   `grep -cF "new WorkItemService(" libs/wbs/application/core/src/compose.ts` prints `0` with exit 1
   (use the `if count=$(grep …)` form of the shared block); the format check → exit 0.
9. Append `### Work item installation, Slice 2 — <date>` to `verify.md`: `base`, `K`, `C`/`F`,
   `E`/`EF`, the red and green bundle counts, rows 13-15 with fragments and evidence basenames,
   and the line: "`runtimeOf` still reads the installed service's private `clock` and
   `opts.scheduler`/`opts.broadcast`; no `servicesOver` resource is constructed with `new`".
   Prettier on it, then the format check.
10. Hand-over as in slice 1, against section 12's slice-2 lists.

Planner commit: `refactor(core): install Work item per supplied scope inside servicesOver`. The
planner then runs `tool-devsync:test`, whole `wbs-be-01:test` and the portable build (section 8).

### Slice 3 — Register Work item in the wiki content-review pilot and tick task 5.1

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- libs/wbs/application/core/src/compose.ts
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/work-item.service.ts
```

Expect `base=…`, the gate, a commit hash (slice 2's), `M` and `B` (observed `18` and `18`), then
exactly `100644 blob 29ab341f9befec90944900d13f9c9c823d06de95	libs/core/src/service/work-item.service.ts`.
If that line is missing or differs, stop. Then, before any edit, each under the status wrapper:

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all. Call the pilot file's tests, failures and `expect()` calls `T`, `TF`, `P`
(observed `21`, `0`, `305`; the run takes about 300 seconds). The legacy pin passes (`1 pass`). Run
the OpenSpec validation standard block and call `passed` `N` (observed `114`).

**Registration, in the order it must be observed.** The pilot suite clones committed `HEAD` and
overlays only `pilotPaths` from the working tree (`pilot-policy.test.ts:30-57`); slices 1 and 2 are
committed, so the module's files are in `HEAD`, and its README there has no `module-index` block
yet. The filtered command is

```sh
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples")
```

(about 35 seconds).

1. Apply 10.10 (`modules.json`: one row, sorted). Run the filtered command → the PARITY red, row 18
   (`Expected: 18`, `Received: 19`). Save it.
2. Apply 10.11 (`policy.json`: one boundary appended last). Rerun → the DISCOVERED-INDEX red,
   row 19 (`Expected: true`, `Received: false`). Save it.
3. Apply 10.12 (the `pilotPaths` entry, sorted, and the README gaining its `module-index` block,
   the `check.core.test` sentence and "Wiki registration"). Rerun → row 20 (`1 pass`). Save it.
4. Rerun the **whole** pilot file → row 21: `T` tests, `TF` failures, `P + 1` assertions. The
   prose-refusal pin does not move.
5. Rerun the legacy-pin test **with the pin unchanged** → red (row 22). Save it. Only then apply
   10.13 (the numbers), rerun → `1 pass` (row 23), and then apply 10.14 (the Proof comment). No
   other pinned literal in that file may move; if one does, stop. If the observed digest differs
   from row 22's, stop: the tree differs from the rehearsal.
6. Apply 10.15 (`tasks.md`: 5.1 **ticked** with its dated note; 7.5's running note extended).
7. Rerun step 0's run-many typecheck, `twilight-burokrat:lint:source` and `tool-devsync:lint` →
   exit 0; rerun the legacy-pin test alone → `1 pass`. Do **not** run
   `repo-namespacing-handoff.test.ts` whole: its `production index checker resolves current
Markdown links` test spawns `check-indexes working`, which writes Git objects, so the whole file
   is planner-only (section 8). The OpenSpec block → `passed` `N`, `failed` `0`.
8. Append `### Work item registration, Slice 3 — <date>` to `verify.md`: `base`, `M`, `B`, the
   frozen tuple, rows 18-20 with evidence basenames, `T`/`TF`/`P` before and after, rows 22 and 23,
   the three checks, `N`. Prettier on it, then `GSETTINGS_BACKEND=memory bunx nx format:check --all`
   → exit 0.
9. Hand-over as in slice 1, against section 12's slice-3 lists.

Planner commit: `docs(core): register the Work item module in the wiki content-review pilot and tick task 5.1`.

**Planner-only, after this commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 3 commit>`
is **index validation** (`checkIndexes`), not the `MOD-LAYOUT` rule. Rehearsed against the
throwaway slice-3 commit: exit 0, 23 indexes, `module.application.work-item` with six members and
`applicableChecks` `["check.core.test"]`; `reviewDebt` empty.

## 8. Planner-only checks

| Check                                                                                                                                                                                                    | Why the planner's                                                                                                    | Observed on the rehearsed tree                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Moved-code identity: copy the `$base` versions of `service/work-item.service.ts` and `service/work-item.service.test.ts` to scratch files, apply 10.2 to them, and `cmp` with the committed module files | Proves the moved body and test differ only in import depth                                                           | section 15's script does the same; both equal                                                                                   |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged                                                                             | Writes Git objects; `service-kinds.test.ts` needs the staged tree                                                    | slice 3 rehearsal commit: `366` tests over 25 files, exit 0 (slices 1 and 2 **not run** separately)                             |
| `(cd apps/wbs/be-01 && bun test)` (the whole `wbs-be-01:test` command, without coverage)                                                                                                                 | Opens SQLite databases and spawns processes; 20 be-01 files construct `WorkItemService` through the deep-import shim | `1097 pass`, `1 skip`, `0 fail` over 92 files on the slice-3 rehearsal commit (E7 recorded the same count on its own slice 4)   |
| `bun test ./apps/wbs/be-01/src/app.routes.test.ts`                                                                                                                                                       | Its health-route framing test listens on a TCP port                                                                  | covered by the whole-target row above                                                                                           |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`, then `grep -cF 'application.work-item"'` over `dist/libs/wbs/application/core/portable-composition.js`                            | The portable bundle composes `servicesOver` in the browser build; `test:portable` needs Playwright                   | build exit 0; `count=1`. `wbs-core:test:portable` itself **not run** (no browser here)                                          |
| `check-indexes committed` on slice 3                                                                                                                                                                     | Index validation, not MOD-LAYOUT                                                                                     | 23 indexes, the new module with six members, no review debt                                                                     |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test` and `:test:package`                                                                                                                                 | Whole listener suite; package suite listens                                                                          | **not run** (only the pilot file was run)                                                                                       |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the whole file                                                                                                                     | Its `production index checker resolves current Markdown links` test spawns `check-indexes working`                   | the executor runs only `-t "every legacy source occurrence"`; the whole file ran green inside the `tool-devsync:test` row above |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                               | Host-wide heavy lock                                                                                                 | **not run**                                                                                                                     |

This table supplements the batch-1 README's "Integration verification" matrix.

**Between slices 1 and 3** the new module directory holds a `.resource.ts` file and a README with no
`module-index` block, which the Burokrat rule model's `MOD-LAYOUT` observation reports as "module
directory declares no wiki index", as for E5-E7; slice 3 closes it. The block is withheld on
purpose: with it in `HEAD`, slice 3's DISCOVERED-INDEX red could not be observed.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What the next 040.6 packets should be

1. **Task 5.2, Plan commands**, whose per-scope `batchServices` now resolves seven installed
   resources; its Working plan and announcement collector become private.
2. **Delivery's resource dependencies (K2, task 7.4).** Every resource module is still named
   directly by routes and features; that is one change for an accepted K2 design, not a module move.
3. **Domain moves (task 6.1)** for the five `service/` helpers Work item still imports.

## 10. Exact content

`c` below is `libs/wbs/application/core/src`. Listings are complete file contents; diffs apply with
`git apply` from the repository root.

### 10.1 `c/module/work-item/module.test.ts` (slice 1 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installWorkItem } from './check';
import { WORK_ITEM_LABEL } from './contract';
import { workItemModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/** One memory source holding one project, and the fifteen requirements a work item write needs. */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  const { stores } = source;
  let next = 0;
  const broadcast = recordingBroadcaster();
  return {
    broadcast,
    requirements: {
      workItems: stores.workItems,
      projects: stores.projects,
      estimates: stores.estimates,
      actuals: stores.actuals,
      measures: stores.measures,
      progress: stores.progress,
      directory: stores.directory,
      capacity: stores.capacity,
      priorityBands: stores.priorityBands,
      dependencies: stores.dependencies,
      subtrees: stores.subtrees,
      journal: stores.journal,
      broadcast,
      scheduler: fastScheduler,
      clock: clockOf({ now: () => 2, newId: () => `item-${String(++next)}` }),
    },
  };
}

const hostRequirements = () => {
  const { stores } = openMemorySource();
  return {
    workItemStore: DiBag.fromSyncFactory(() => stores.workItems),
    projectStore: DiBag.fromSyncFactory(() => stores.projects),
    estimateStore: DiBag.fromSyncFactory(() => stores.estimates),
    actualStore: DiBag.fromSyncFactory(() => stores.actuals),
    measureStore: DiBag.fromSyncFactory(() => stores.measures),
    progressStore: DiBag.fromSyncFactory(() => stores.progress),
    directoryStore: DiBag.fromSyncFactory(() => stores.directory),
    capacityStore: DiBag.fromSyncFactory(() => stores.capacity),
    priorityBandStore: DiBag.fromSyncFactory(() => stores.priorityBands),
    dependencyStore: DiBag.fromSyncFactory(() => stores.dependencies),
    subtreeStore: DiBag.fromSyncFactory(() => stores.subtrees),
    journalStore: DiBag.fromSyncFactory(() => stores.journal),
    broadcast: DiBag.fromSyncFactory(() => recordingBroadcaster()),
    scheduler: DiBag.fromSyncFactory(() => fastScheduler),
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
    .installModule(workItemModule)
    .register({
      ...hostRequirements(),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 0, newId: () => 'unused' })),
    })
    .build();

describe('the Work item module', () => {
  it('announces a created work item through the broadcaster installWorkItem wires', async () => {
    const { broadcast, requirements } = await seeded();
    const { workItems } = installWorkItem(requirements);

    const created = await workItems.create(PROJECT, OWNER, {
      parentId: null,
      afterId: null,
      name: 'Scope',
    });

    expect(created).toMatchObject({ ok: true, value: { id: 'item-1', name: 'Scope' } });
    expect(
      broadcast.published.map(({ event }) =>
        event.type === 'tree_replaced' ? event.workItems.map((row) => row.name) : event.type,
      ),
    ).toEqual([['Scope']]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `WorkItemExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installWorkItem(requirements);

    expect(Object.keys(exposed)).toEqual(['workItems']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('workItemOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "workItemOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${WORK_ITEM_LABEL}/workItemOptions`,
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
      .installModule(workItemModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('workItems')).toThrow(
      `Cannot resolve "${WORK_ITEM_LABEL}/workItemOptions": dependency "clock" is not registered. Resolution path: workItems -> ${WORK_ITEM_LABEL}/workItemOptions -> clock.`,
    );
  });
});
```

### 10.2 Import lines of the two moved files (slice 1 step 2 — applied after the `cp`/`mv`)

```diff
diff --git a/libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts b/libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts
index dafc8ed8..b7958559 100644
--- a/libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts
+++ b/libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts
@@ -12,13 +12,13 @@ import type {
   ProjectStore,
   WorkItemStore,
   WriteStamp,
-} from '../index';
-import { AvailableWorkItemService as WorkItemService } from '../testing/available-work-item-service';
-import { type RecordingBroadcaster } from '../testing/broadcast-fixture';
-import { testClock } from '../testing/clock-fixture';
-import { inMemoryServices } from '../testing/harness';
-import { workItemRow } from '../testing/work-item-fixture';
-import { poolsFor, type WorkItemServiceOptions } from './work-item.service';
+} from '../../index';
+import { AvailableWorkItemService as WorkItemService } from '../../testing/available-work-item-service';
+import { type RecordingBroadcaster } from '../../testing/broadcast-fixture';
+import { testClock } from '../../testing/clock-fixture';
+import { inMemoryServices } from '../../testing/harness';
+import { workItemRow } from '../../testing/work-item-fixture';
+import { poolsFor, type WorkItemServiceOptions } from './work-item.resource';

 const OWNER = 'owner-account';
 const STRANGER = 'stranger-account';
diff --git a/libs/wbs/application/core/src/module/work-item/work-item.resource.ts b/libs/wbs/application/core/src/module/work-item/work-item.resource.ts
index e7cf79f6..bbd42c27 100644
--- a/libs/wbs/application/core/src/module/work-item/work-item.resource.ts
+++ b/libs/wbs/application/core/src/module/work-item/work-item.resource.ts
@@ -48,35 +48,39 @@ import {
 import { arrangeBySchedule as arrangeSiblingsBySchedule } from '@wbs/domain/arrange-siblings';
 import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

-import type { ActualStore, StoredActual } from '../ports/actual-store';
-import type { CapacityStore, TeamCapacity } from '../ports/capacity-store';
-import type { Clock } from '../ports/clock';
-import type { CommandJournalStore, JournalEntry, UndoState } from '../ports/command-journal-store';
-import type { DependencyStore, StoredDependency } from '../ports/dependency-store';
-import type { Assignment, DirectoryStore } from '../ports/directory-store';
-import type { EstimateStore, StoredEstimate } from '../ports/estimate-store';
-import type { MeasureStore, StoredMeasure } from '../ports/measure-store';
-import type { PriorityBandStore } from '../ports/priority-band-store';
-import type { StepProgressStore, StoredProgress } from '../ports/progress-store';
-import type { Broadcaster } from '../ports/project-event';
-import type { Project, ProjectStore } from '../ports/project-store';
+import type { ActualStore, StoredActual } from '../../ports/actual-store';
+import type { CapacityStore, TeamCapacity } from '../../ports/capacity-store';
+import type { Clock } from '../../ports/clock';
+import type {
+  CommandJournalStore,
+  JournalEntry,
+  UndoState,
+} from '../../ports/command-journal-store';
+import type { DependencyStore, StoredDependency } from '../../ports/dependency-store';
+import type { Assignment, DirectoryStore } from '../../ports/directory-store';
+import type { EstimateStore, StoredEstimate } from '../../ports/estimate-store';
+import type { MeasureStore, StoredMeasure } from '../../ports/measure-store';
+import type { PriorityBandStore } from '../../ports/priority-band-store';
+import type { StepProgressStore, StoredProgress } from '../../ports/progress-store';
+import type { Broadcaster } from '../../ports/project-event';
+import type { Project, ProjectStore } from '../../ports/project-store';
 import type {
   EngineUnavailable,
   OptimizationVariantState,
   OptimizedScheduleRead,
   Scheduler,
-} from '../ports/scheduler';
-import type { Step } from '../ports/step-store';
-import type { SubtreeStore } from '../ports/subtree-store';
+} from '../../ports/scheduler';
+import type { Step } from '../../ports/step-store';
+import type { SubtreeStore } from '../../ports/subtree-store';
 import type {
   LabelledWorkItem,
   Reparented,
   WorkItem,
   WorkItemPatch,
   WorkItemStore,
-} from '../ports/work-item-store';
-import type { WriteStamp } from '../ports/write-stamp';
-import { assumedAssignee } from './assumed-assignee';
+} from '../../ports/work-item-store';
+import type { WriteStamp } from '../../ports/write-stamp';
+import { assumedAssignee } from '../../service/assumed-assignee';
 import {
   type CompensatingCommand,
   quoteName,
@@ -86,9 +90,9 @@ import {
   type Revisions,
   subjectOf,
   touchedBy,
-} from './compensating';
-import { canDepend } from './dependency';
-import type { NumberedWorkItem } from './numbered-work-item';
+} from '../../service/compensating';
+import { canDepend } from '../../service/dependency';
+import type { NumberedWorkItem } from '../../service/numbered-work-item';
 import {
   type Days,
   rollUp,
@@ -98,7 +102,7 @@ import {
   rollUpProgress,
   rollUpWorkItemStatuses,
   workedStepsOf,
-} from './roll-up';
+} from '../../service/roll-up';

 /**
  * What a work item shows before any schedule could be computed for it.
@@ -4595,4 +4599,4 @@ export class WorkItemService {
     return { ok: true, value: { workItem, project, rows } };
   }
 }
-export type { NumberedWorkItem } from './numbered-work-item';
+export type { NumberedWorkItem } from '../../service/numbered-work-item';
```

### 10.3 The compatibility shim (slice 1 step 2 — full replacement content of `c/service/work-item.service.ts`)

```ts
/**
 * Compatibility re-export: Work item moved into its own sealed module.
 *
 * Kept because delivery (`http/project.routes.ts`, `http/work-item.routes.ts`),
 * Plan commands, Plan import, Saved plans' `saved-plan-schedule.ts`, the test
 * harness and `testing/available-work-item-service.ts`, `@wbs/core`'s barrel and
 * be-01's own deep-import shim name this path. It goes when every importer names
 * the module.
 */
export * from '../module/work-item/work-item.resource';
```

### 10.4 Work item's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type { WorkItemService, WorkItemServiceOptions } from './work-item.resource';

/**
 * What a host must supply to install {@link workItemModule}.
 *
 * Exactly {@link WorkItemServiceOptions}, unchanged by the move: the twelve
 * stores of the one scope being installed over, the broadcaster, the
 * scheduler and the clock. `servicesOver` supplies the stores of each admitted
 * scope, so one installation never outlives the scope it was built over.
 *
 * **No K3 or K6 debt; K2 debt disclosed.** Work item is a resource, so the
 * direction rule that binds it is K4, not K3: it reads twelve repository
 * ports — `WorkItemStore`, `ProjectStore`, `EstimateStore`, `ActualStore`,
 * `MeasureStore`, `StepProgressStore`, `DirectoryStore`, `CapacityStore`,
 * `PriorityBandStore`, `DependencyStore`, `SubtreeStore` and
 * `CommandJournalStore` — and imports no other resource. The pure helpers it
 * still reaches under `service/` (`assumed-assignee.ts`, `compensating.ts`,
 * `dependency.ts`, `numbered-work-item.ts`, `roll-up.ts`) are the domain moves
 * of task 6.1. What this extraction does not close is its consumers' side:
 * `http/project.routes.ts` and `http/work-item.routes.ts` accept
 * `WorkItemService` directly, Plan commands and Plan import name it, and Saved
 * plans' `saved-plan-schedule.ts` imports its `NO_DEADLINES` and `slicesOf`
 * values — the direct resource dependency (K2) the backend module map lists
 * under its composition hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type WorkItemRequirements = WorkItemServiceOptions;

/** What installing {@link workItemModule} adds to a host graph. */
export interface WorkItemExports {
  readonly workItems: WorkItemService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.work-item` and the label drops the
 * `module.` prefix.
 */
export const WORK_ITEM_LABEL = 'application.work-item';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { ActualStore } from '../../ports/actual-store';
import type { CapacityStore } from '../../ports/capacity-store';
import type { Clock } from '../../ports/clock';
import type { CommandJournalStore } from '../../ports/command-journal-store';
import type { DependencyStore } from '../../ports/dependency-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { EstimateStore } from '../../ports/estimate-store';
import type { MeasureStore } from '../../ports/measure-store';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { StepProgressStore } from '../../ports/progress-store';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { Scheduler } from '../../ports/scheduler';
import type { SubtreeStore } from '../../ports/subtree-store';
import type { WorkItemStore } from '../../ports/work-item-store';
import { WORK_ITEM_LABEL } from './contract';
import { WorkItemService, type WorkItemServiceOptions } from './work-item.resource';

/**
 * Work item as a sealed DI Bag module.
 *
 * Only `workItems` is exported. `workItemOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.work-item/workItemOptions` rather than against
 * an anonymous binding. Every store is required under a `<name>Store` host key
 * because five of them (`workItems`, `projects`, `directory`, `capacity`,
 * `priorityBands`) share their `servicesOver` name with a writing service, and
 * one host graph cannot hold a store and a service under one key.
 *
 * The module registers no disposer: `WorkItemService` holds the borrowed
 * stores of one scope, a broadcaster, a scheduler and a clock, and no handle
 * of its own.
 */
export const workItemModule = DiBag.createBuilder()
  .register({
    workItemOptions: DiBag.fromSyncFactory(
      ({
        workItemStore,
        projectStore,
        estimateStore,
        actualStore,
        measureStore,
        progressStore,
        directoryStore,
        capacityStore,
        priorityBandStore,
        dependencyStore,
        subtreeStore,
        journalStore,
        broadcast,
        scheduler,
        clock,
      }: {
        workItemStore: WorkItemStore;
        projectStore: ProjectStore;
        estimateStore: EstimateStore;
        actualStore: ActualStore;
        measureStore: MeasureStore;
        progressStore: StepProgressStore;
        directoryStore: DirectoryStore;
        capacityStore: CapacityStore;
        priorityBandStore: PriorityBandStore;
        dependencyStore: DependencyStore;
        subtreeStore: SubtreeStore;
        journalStore: CommandJournalStore;
        broadcast: Broadcaster;
        scheduler: Scheduler;
        clock: Clock;
      }): WorkItemServiceOptions => ({
        workItems: workItemStore,
        projects: projectStore,
        estimates: estimateStore,
        actuals: actualStore,
        measures: measureStore,
        progress: progressStore,
        directory: directoryStore,
        capacity: capacityStore,
        priorityBands: priorityBandStore,
        dependencies: dependencyStore,
        subtrees: subtreeStore,
        journal: journalStore,
        broadcast,
        scheduler,
        clock,
      }),
    ),
  })
  .register({
    workItems: DiBag.fromSyncFactory(
      ({ workItemOptions }: { workItemOptions: WorkItemServiceOptions }): WorkItemService =>
        new WorkItemService(workItemOptions),
    ),
  })
  .buildModule(['workItems'], { label: WORK_ITEM_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { WorkItemExports, WorkItemRequirements } from './contract';
import { workItemModule } from './module';

/**
 * Installs {@link workItemModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Work item can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link WorkItemExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installWorkItem(requirements: WorkItemRequirements): WorkItemExports {
  const bag = DiBag.createBuilder()
    .installModule(workItemModule)
    .register({
      workItemStore: DiBag.fromSyncFactory(() => requirements.workItems),
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      estimateStore: DiBag.fromSyncFactory(() => requirements.estimates),
      actualStore: DiBag.fromSyncFactory(() => requirements.actuals),
      measureStore: DiBag.fromSyncFactory(() => requirements.measures),
      progressStore: DiBag.fromSyncFactory(() => requirements.progress),
      directoryStore: DiBag.fromSyncFactory(() => requirements.directory),
      capacityStore: DiBag.fromSyncFactory(() => requirements.capacity),
      priorityBandStore: DiBag.fromSyncFactory(() => requirements.priorityBands),
      dependencyStore: DiBag.fromSyncFactory(() => requirements.dependencies),
      subtreeStore: DiBag.fromSyncFactory(() => requirements.subtrees),
      journalStore: DiBag.fromSyncFactory(() => requirements.journal),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      scheduler: DiBag.fromSyncFactory(() => requirements.scheduler),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  return { workItems: bag.resolve('workItems') };
}
```

`README.md` (slice 3 adds the index block and "Wiki registration"):

```md
# Work item

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the twelve stores, the broadcaster, the scheduler
and the clock a host must supply.

`work-item.resource.ts` (the moved `service/work-item.service.ts`) reads a project's numbered,
scheduled tree, gates its writes on `canEditProject`, journals the reversible ones for undo and
redo, and announces the rebuilt tree after a write. Private bindings are named under the
`application.work-item` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/work-item.service.ts` keeps the former path for delivery,
Plan commands, Plan import, Saved plans, the test harness, `@wbs/core`'s barrel and be-01's
deep-import shim.
```

### 10.5 `index.ts`, `kinds.json` and `clock.test.ts` (slice 1 step 4)

```diff
diff --git a/apps/wbs/be-01/src/service/clock.test.ts b/apps/wbs/be-01/src/service/clock.test.ts
index 4a10ea12..e32bf1d6 100644
--- a/apps/wbs/be-01/src/service/clock.test.ts
+++ b/apps/wbs/be-01/src/service/clock.test.ts
@@ -112,7 +112,8 @@ describe('one clock', () => {
       (file) => file.path === 'libs/wbs/application/core/src/module/capacity/capacity.resource.ts',
     );
     const coreWorkItems = sources.find(
-      (file) => file.path === 'libs/wbs/application/core/src/service/work-item.service.ts',
+      (file) =>
+        file.path === 'libs/wbs/application/core/src/module/work-item/work-item.resource.ts',
     );
     const beWorkItems = sources.find(
       (file) => file.path === 'apps/wbs/be-01/src/service/work-item.service.ts',
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
index 510da0e2..71d23a46 100644
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -437,9 +437,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/work-item.service.ts",
-      "kind": "resource",
-      "term": "work item",
-      "rationale": "project and work-item routes, ImportService and PlanCommandRunner call it for the work item aggregate's tree, estimate, assignment, dependency, scheduling and revision rules over its admitted stores and ports"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the work-item module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/working-plan-directory.ts",
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
index 0e413efd..1a0ada33 100644
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -42,6 +42,8 @@ export * from './module/saved-plans/contract';
 export * from './module/saved-plans/module';
 export * from './module/step/contract';
 export * from './module/step/module';
+export * from './module/work-item/contract';
+export * from './module/work-item/module';
 export * from './ports/actual-store';
 // The owner-neutral marker read: `CalendarMarkerReader` and the list outcome it answers with.
 export * from './ports/calendar-marker-read';
```

### 10.6 Slice 1's Proof comments (slice 1 step 7 — only after rows 6-11 were observed)

```diff
diff --git a/apps/wbs/be-01/src/service/clock.test.ts b/apps/wbs/be-01/src/service/clock.test.ts
index e32bf1d6..e48eb554 100644
--- a/apps/wbs/be-01/src/service/clock.test.ts
+++ b/apps/wbs/be-01/src/service/clock.test.ts
@@ -111,6 +111,12 @@ describe('one clock', () => {
     const coreCapacity = sources.find(
       (file) => file.path === 'libs/wbs/application/core/src/module/capacity/capacity.resource.ts',
     );
+    // Proof (2026-09-24): with Work item moved into `module/work-item/` and this path still
+    // naming the `service/work-item.service.ts` shim, the `export class WorkItemService`
+    // assertion below failed on the shim's re-export text (3 pass, 1 fail); adding
+    // `now?: () => number;` to the moved `WorkItemServiceOptions` failed
+    // `is the only clock a service that stamps a write reads` on received
+    // ["libs/wbs/application/core/src/module/work-item/work-item.resource.ts"] (3 pass, 1 fail).
     const coreWorkItems = sources.find(
       (file) =>
         file.path === 'libs/wbs/application/core/src/module/work-item/work-item.resource.ts',
diff --git a/libs/wbs/application/core/src/module/work-item/check.ts b/libs/wbs/application/core/src/module/work-item/check.ts
index 38e93917..b98d55f1 100644
--- a/libs/wbs/application/core/src/module/work-item/check.ts
+++ b/libs/wbs/application/core/src/module/work-item/check.ts
@@ -34,5 +34,11 @@ export function installWorkItem(requirements: WorkItemRequirements): WorkItemExp
       clock: DiBag.fromSyncFactory(() => requirements.clock),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `WorkItemService` kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { workItems: bag.resolve('workItems') };
 }
diff --git a/libs/wbs/application/core/src/module/work-item/module.ts b/libs/wbs/application/core/src/module/work-item/module.ts
index bd90491b..9224a5d1 100644
--- a/libs/wbs/application/core/src/module/work-item/module.ts
+++ b/libs/wbs/application/core/src/module/work-item/module.ts
@@ -82,6 +82,10 @@ export const workItemModule = DiBag.createBuilder()
         dependencies: dependencyStore,
         subtrees: subtreeStore,
         journal: journalStore,
+        // Proof (2026-09-24): handing the resource
+        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
+        // broadcaster left `announces a created work item through the broadcaster installWorkItem
+        // wires` failing (4 pass, 1 fail): it received `[]`.
         broadcast,
         scheduler,
         clock,
@@ -94,4 +98,12 @@ export const workItemModule = DiBag.createBuilder()
         new WorkItemService(workItemOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['workItems', 'workItemOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('workItemOptions')` did not throw, `inspectGraph()` reported bare `workItemOptions`,
+  // and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: WORK_ITEM_LABEL }` left only the two label assertions
+  // failing (3 pass, 2 fail): `inspectGraph()` reported `workItemOptions` unlabelled, and the
+  // missing-requirement message named `workItemOptions` instead of
+  // `application.work-item/workItemOptions`.
   .buildModule(['workItems'], { label: WORK_ITEM_LABEL });
```

### 10.7 `compose.ts` (slice 2 step 2)

```diff
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
index e8350d8f..6aa58d0e 100644
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -21,6 +21,7 @@ import type { ReplayOrchestrator } from './module/realtime/replay-orchestrator';
 import { installSavedPlans } from './module/saved-plans/check';
 import type { SavedPlanService } from './module/saved-plans/saved-plans.feature';
 import { installStep } from './module/step/check';
+import { installWorkItem } from './module/work-item/check';
 import type { Clock } from './ports/clock';
 import type { OidcVerifier } from './ports/oidc-verifier';
 import type { Broadcaster } from './ports/project-event';
@@ -32,7 +33,6 @@ import type { PlanTransactionalStores, TransactionalStores } from './ports/store
 import type { Intervals, Timers } from './ports/timers';
 import type { Scope } from './ports/unit-of-work';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
-import { WorkItemService } from './service/work-item.service';

 /** Runtime capabilities required by every service composition. */
 export interface RuntimePorts {
@@ -117,7 +117,7 @@ export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOv
       broadcast,
     }).steps,
     directory: installDirectory({ clock, directory: stores.directory, broadcast }).directory,
-    workItems: new WorkItemService({
+    workItems: installWorkItem({
       clock,
       workItems: stores.workItems,
       projects: stores.projects,
@@ -133,7 +133,7 @@ export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOv
       journal: stores.journal,
       broadcast,
       scheduler,
-    }),
+    }).workItems,
   };
 }

```

### 10.8 The Work item per-scope case (slice 2 step 3)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
index ac0bb74e..cbb012ec 100644
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -491,4 +491,17 @@ describe('servicesOver', () => {
     // with `-t`): the second scope listed the first scope's `Operations` team.
     expect((await second.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
   });
+
+  test("installs Work item per supplied scope, over that scope's own stores", async () => {
+    const { first, second } = await twoScopes();
+
+    expect(
+      await first.workItems.create(PROJECT, OWNER, {
+        parentId: null,
+        afterId: null,
+        name: 'Scope',
+      }),
+    ).toMatchObject({ ok: true });
+    expect(await second.workItems.tree(PROJECT)).toMatchObject({ workItems: [] });
+  });
 });
```

### 10.9 Slice 2's Proof comment (slice 2 step 6 — only after row 14 was observed)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
index cbb012ec..67252d85 100644
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -502,6 +502,9 @@ describe('servicesOver', () => {
         name: 'Scope',
       }),
     ).toMatchObject({ ok: true });
+    // Proof (2026-09-24): memoizing one `installWorkItem(...)` result in a module-level `let` and
+    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
+    // with `-t`): the second scope's tree listed the first scope's `Scope` work item.
     expect(await second.workItems.tree(PROJECT)).toMatchObject({ workItems: [] });
   });
 });
```

### 10.10 Registration: the `modules.json` row (slice 3 step 1)

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
index d22baae8..4e2902e3 100644
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -381,6 +381,36 @@
         ]
       }
     },
+    {
+      "moduleId": "module.application.work-item",
+      "name": "Work item sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/work-item",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/work-item/README.md",
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
+            "path": "libs/wbs/application/core/src/service/work-item.service.ts"
+          }
+        ]
+      }
+    },
     {
       "moduleId": "module.archive.bounded-replay-sweep",
       "name": "Frozen bounded replay sweep pilot boundary",
```

### 10.11 Registration: the `policy.json` boundary (slice 3 step 2)

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
index faba8b5a..06d05c12 100644
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1106,6 +1106,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.work-item",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/work-item"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/work-item.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "29ab341f9befec90944900d13f9c9c823d06de95",
+          "path": "libs/core/src/service/work-item.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

### 10.12 Registration: `pilotPaths` and the README index (slice 3 step 3)

The README diff names its predecessor by filename only: `tool-devsync`'s `LEGACY_ROOT` scan refuses
a current README that spells a pre-namespacing path.

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
index a2da4c4d..ece8e107 100644
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -46,6 +46,7 @@ const pilotPaths = [
   'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/module/saved-plans/README.md',
   'libs/wbs/application/core/src/module/step/README.md',
+  'libs/wbs/application/core/src/module/work-item/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
   'libs/wbs/domain/domain/src/saved-plan/README.md',
   'libs/wbs/adapters/store-memory/src/README.md',
diff --git a/libs/wbs/application/core/src/module/work-item/README.md b/libs/wbs/application/core/src/module/work-item/README.md
index 0e3b8b09..be5a9c75 100644
--- a/libs/wbs/application/core/src/module/work-item/README.md
+++ b/libs/wbs/application/core/src/module/work-item/README.md
@@ -1,5 +1,7 @@
 # Work item

+<!-- module-index {"schemaVersion":1,"moduleId":"module.application.work-item","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"work-item.resource.test.ts"},{"kind":"path","path":"work-item.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The one-stamp-per-act and stale-undo rules are documented on WorkItemService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/work-item.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; the project and work-item routes, Plan commands, Plan import, Saved plans, the core test harness and the be-01 shim, controller and database tests reach this module through the shim or the barrel and are not tracked here."}} -->
+
 A sealed resource module installed per admitted scope: `servicesOver` in
 `libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
 admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
@@ -13,8 +15,8 @@ redo, and announces the rebuilt tree after a write. Private bindings are named u

 ## Checks

-The module's tests run under the `wbs-core:test` target declared in
-`libs/wbs/application/core/project.json`.
+The applicable check is the `wbs-core:test` target declared in
+`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

 ## Consumers

@@ -22,3 +24,15 @@ The module's tests run under the `wbs-core:test` target declared in
 `libs/wbs/application/core/src/service/work-item.service.ts` keeps the former path for delivery,
 Plan commands, Plan import, Saved plans, the test harness, `@wbs/core`'s barrel and be-01's
 deep-import shim.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.application.work-item` (`docs/wiki-policy/policy.json`'s `boundary.application.work-item`).
+The boundary's `sourceSelector` binds this directory to `work-item.resource.ts`'s own single
+pre-namespacing predecessor, `work-item.service.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
+`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
+registration's guarantee is one predecessor per module directory, not one per file it holds. The
+moved `work-item.resource.test.ts` has no baseline entry either, although its own predecessor
+existed then too.
```

### 10.13 Legacy re-pin, the numbers (slice 3 step 5 — only after row 22 was observed)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
index ead89cc1..3a00ffce 100644
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 63,
+      'historical policy selector or baseline': 65,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -833,8 +833,8 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // `libs/core/src/service/<name>.service.ts` each module was extracted from; raised
     // `historical policy selector or baseline` from 51 to 63 and occurrences from 269 to 281, no
     // unclassified entries (2026-09-24).
-    digest: '5864733ccd1d50e0a81c9c0f71b3bb20a46565ed4200f417ed0b9b1d56f9a5e2',
-    occurrences: 281,
+    digest: '0d78b5794663e2bd708b6d307ba2643d33a414d717771b682392445958fe4e07',
+    occurrences: 283,
     unclassified: [],
   });
 });
```

### 10.14 Legacy re-pin, the Proof (slice 3 step 5 — after row 23)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -833,6 +833,11 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // `libs/core/src/service/<name>.service.ts` each module was extracted from; raised
     // `historical policy selector or baseline` from 51 to 63 and occurrences from 269 to 281, no
     // unclassified entries (2026-09-24).
+    // Proof: registering Work item, the seventh per-admission resource module, added
+    // `boundary.application.work-item`'s `sourceSelector` and one `baselineEntries` path, both
+    // naming the pre-namespacing `libs/core/src/service/work-item.service.ts` it was extracted
+    // from; raised `historical policy selector or baseline` from 63 to 65 and occurrences from
+    // 281 to 283, no unclassified entries (2026-09-24).
     digest: '0d78b5794663e2bd708b6d307ba2643d33a414d717771b682392445958fe4e07',
     occurrences: 283,
     unclassified: [],
```

### 10.15 Task records (slice 3 step 6)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
index 83515e34..83a7ad2b 100644
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -160,7 +160,7 @@

 ## 5. The per-admission modules

-- [ ] 5.1 Install the seven resource responsibilities per supplied scope inside `servicesOver`.
+- [x] 5.1 Install the seven resource responsibilities per supplied scope inside `servicesOver`.
       Negative: two admitted batches sharing staged stores. Six of the seven landed 2026-09-24 as
       the `calendar-marker`, `capacity`, `directory`, `priority-band`, `project` and `step`
       directories under `libs/wbs/application/core/src/module/`, each a sealed resource module
@@ -174,9 +174,16 @@
       options binding exported, the label dropped and one real provider edge replaced. The same
       slices extend `apps/wbs/be-01/src/service/clock.test.ts`'s scan to every sealed core
       module's directory and add a Calendar marker row to `ports/sideways-type-boundaries.test.ts`,
-      both watched failing. **Not ticked:** Work item (`service/work-item.service.ts`, 4598
-      lines, fifteen requirements) is still constructed with `new` inside `servicesOver`; packet
-      E8 seals and installs it and ticks this task.
+      both watched failing. The seventh, Work item, landed 2026-09-24 as
+      `libs/wbs/application/core/src/module/work-item/`: the moved `work-item.resource.ts` and its
+      98-test `work-item.resource.test.ts`, a module over fifteen requirements (twelve stores under
+      `<name>Store` host keys, the broadcaster, the scheduler and the clock), and
+      `servicesOver` installing it through `installWorkItem` on every call; the former path is a
+      compatibility re-export shim and its `kinds.json` row is rewritten in place (93 entries).
+      Proof: the same memo fault failed its own `compose.test.ts` case, and the module has the same
+      five negatives, its provider edge being the broadcaster. `clock.test.ts`'s `coreWorkItems`
+      now names the moved file, watched failing on the shim first. No `servicesOver` resource is
+      constructed with `new` any more.
 - [ ] 5.2 Plan commands, with Working plan and the announcement collector private to it.

 ## 6. Domain moves the map names
@@ -267,6 +274,10 @@
       `docs/wiki-policy/policy.json` boundary `boundary.application.<name>`, each using a
       `sourceSelector` bound to that module's own pre-namespacing `<name>.service.ts` predecessor
       alone; the moved `calendar-marker.resource.test.ts` has no separate baseline entry.
+      Landed again 2026-09-24 for Work item, the seventh resource of task 5.1, as
+      `module.application.work-item` and `boundary.application.work-item`, bound to the
+      pre-namespacing `work-item.service.ts` alone; the moved `work-item.resource.test.ts` has no
+      separate baseline entry.
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
  unchanged in every slice; wiki modules and boundaries +1 each in slice 3; the legacy pin exactly
  as row 22 states; the prose-refusal pin unchanged).
- Any change to what the moved service does. The **only** permitted changes to moved code are the
  import lines of 10.2; the only permitted `compose.ts` change is 10.7's.
- A network access or an OpenSpec download.
- A check needs an edit this packet does not prescribe (in particular, any importer of
  `service/work-item.service.ts` or `runtimeOf` needing an edit).

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.
Paths under `libs/wbs/application/core/src/` are written from `src/`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                                                 | Untracked (new)                                                                                                                                                                  | Deleted                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1     | `apps/wbs/be-01/src/service/clock.test.ts`, `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `index.ts`, `service/work-item.service.ts`                                                                                                                   | the **seven** files under `src/module/work-item/` (`README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `work-item.resource.test.ts`, `work-item.resource.ts`) | `src/service/work-item.service.test.ts` (moved) |
| 2     | `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `compose.test.ts`, `compose.ts`                                                                                                                                                                                                               | nothing                                                                                                                                                                          | nothing                                         |
| 3     | `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `src/module/work-item/README.md`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing                                                                                                                                                                          | nothing                                         |

Slice 1: 5 modified, 7 new, 1 deleted (13 paths). Slice 2: 3 modified. Slice 3: 7 modified. The
planner may add a revised packet file to its own commits; the lists are scoped to `$base`, so that
does not break them.

## 13. Findings

- **`runtimeOf` compares by value, not identity.** `shares runtime identities while creating a
fresh scope, collector and graph per batch` reads the private runtime fields but asserts them with
  `toEqual`, so a structurally equal replacement of the scheduler, clock or broadcaster passes
  (row 16); only a changed member fails (row 15). Not fixed here (it is not this packet's check and
  the installed service keeps the same objects); a later packet can assert each field with `toBe`.
- **Every importer survives the move through the shim.** 46 code files, including a subclass
  (`AvailableWorkItemService`) and a feature's value imports (`NO_DEADLINES`, `slicesOf`), needed no
  edit; the pinned clock path was the only test that noticed the move.
- **No `servicesOver` resource is built with `new` any more**; task 5.1 is complete. The
  sideways-row risk E7 recorded does not apply to Work item (no row names its path).
- **Map:** no defect found in the Work item row; its "existing store ports" are the eight ports
  besides the five it names, twelve stores in all.
- **Landed code of packets A-E7:** no defect found.

## 14. Document exemption (precondition, not a slice)

Sections 3, 7 (slice 3 step 0), 10.11, 10.14 and 10.15 cite
`libs/core/src/service/work-item.service.ts`, the predecessor this packet registers.
`docs/findings/current-document-check-exemptions.json` carries this packet's `legacy-root` entry,
committed with the packet itself; no slice touches that file.

## 15. `git apply --check` verification

Every fenced `diff` block above was extracted from this document by the script below and applied
in slice order to a disposable worktree of `57557dcc`, with the filesystem steps each slice
prescribes in between, and the resulting tree compared with the rehearsed slice commits.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <slice1-sha> <slice2-sha> <slice3-sha>
set -euo pipefail
repo=$1; packet=$2; s1=$3; s2=$4; s3=$5
work=$(mktemp -d "${TMPDIR:?}/e8-extract-XXXXXX")
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
test "$(ls "$work"/*.patch | wc -l)" -eq 12
test "$(ls "$work"/*.listing | wc -l)" -eq 6
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" 57557dcc5dd0d46d9f2963937131a97022007598
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
# Slice 1
mkdir -p "$c/module/work-item"
cp "$work/01.listing" "$c/module/work-item/module.test.ts"
cp "$c/service/work-item.service.ts" "$c/module/work-item/work-item.resource.ts"
mv "$c/service/work-item.service.test.ts" "$c/module/work-item/work-item.resource.test.ts"
apply 01
cp "$work/02.listing" "$c/service/work-item.service.ts"
cp "$work/03.listing" "$c/module/work-item/contract.ts"
cp "$work/04.listing" "$c/module/work-item/module.ts"
cp "$work/05.listing" "$c/module/work-item/check.ts"
cp "$work/06.listing" "$c/module/work-item/README.md"
apply 02
apply 03
test "$(ls "$c/module/work-item" | wc -l)" -eq 7
same_as "$s1"
# Slice 2
apply 04
apply 05
apply 06
same_as "$s2"
# Slice 3
for n in $(seq 7 12); do apply "$(printf %02d "$n")"; done
same_as "$s3"
cd "$repo"
git worktree remove --force "$wt"
echo "all 12 diffs applied in slice order; every slice tree equals its rehearsal commit"
````

Output:

```text
diffs=12 listings=6
applied 01
applied 02
applied 03
tree equals e881efc9
applied 04
applied 05
applied 06
tree equals 07dcd609
applied 07
applied 08
applied 09
applied 10
applied 11
applied 12
tree equals 59b2ade4
all 12 diffs applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits are throwaway: slice 1 `e881efc9`, slice 2 `07dcd609`, slice 3 `59b2ade4`, on
branch `rehearse/040-6-e8-work-item` above `57557dcc` (not pushed; kept only as the comparison
target of the script above). None of them touches `verify.md`, which only the executor writes.
Their subjects are rehearsal labels; the planner commits every slice with section 7's subject, and
only the trees are compared. Lefthook ran on all three.

## 16. Deferred: label agreement

Whether the README's `moduleId` names the label the module seals its bag under is not checked,
matching packet D's deferral.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                                                                                                                                                                 |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fixture reproduces the failure first | §6 rows 1 (module red), 2 (bundle red), 3 (the clock pin broken by the move itself), 18-19 and 22 (registration and pin reds), all on code the slice has not fixed                                                                                         |
| 2   | Test code passes typecheck and lint  | `wbs-core` and `wbs-be-01` lint and typecheck on each rehearsed slice; lefthook passed on all three rehearsal commits                                                                                                                                      |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                                                                                                                                                                        |
| 4   | Commands can show failure            | §7 status wrapper; `if count=$(grep -cF …)` form for every bundle grep                                                                                                                                                                                     |
| 5   | Tests reading `HEAD`                 | §7 slice 3 preamble: slices 1-2 are committed before the pilot suite runs, and the README block arrives only through `pilotPaths`                                                                                                                          |
| 6   | Sandbox facts                        | §7 slice 1 step 8 (service-kinds is planner-only); `app.routes.test.ts` excluded; §8                                                                                                                                                                       |
| 7   | Known race                           | §8                                                                                                                                                                                                                                                         |
| 8   | Names                                | `module.application.work-item`; label `application.work-item`; Twilight Burokrat                                                                                                                                                                           |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines                                                                                                                                                                          |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change; `di-bag` stays 0.4.0                                                                                                                                                                              |
| 11  | `\|\| test $? -eq 1` after pipelines | not used; single-command `if … then … else status=$?` form only                                                                                                                                                                                            |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                                                                                                                                                                   |
| 13  | Index every module file              | §10.12's index names all six non-README files; `check-indexes committed` reported them (§7 slice 3)                                                                                                                                                        |
| 14  | Bun path vs filter                   | every focused run uses `./…` or `cd <project>`; lint and typecheck before baselines                                                                                                                                                                        |
| 15  | Interleaving property tests          | not triggered: no owner, queue, lock or retry logic is added; the per-scope property is a construction fact, proved by one memo fault                                                                                                                      |
| 16  | Model-based tests                    | not triggered                                                                                                                                                                                                                                              |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed` (dispatch paragraph)                                                                                                                                                                                          |
| 18  | Symbol-based boundary checks         | no new boundary check; §3 records that no identity row names the moved path                                                                                                                                                                                |
| 19  | ugrep exits 1 on missing file        | `test -f "$bundle"` precedes every `grep -cF` on a bundle                                                                                                                                                                                                  |
| 20  | Promise only what a check keeps      | 5.1 ticked only because no `new` resource remains (slice 2 step 8's grep); K2 disclosed, K4/K6 stated as read, not watched; `runtimeOf`'s value comparison recorded as a limit (§13); `check-indexes` called index validation; no compile red claimed (§6) |
