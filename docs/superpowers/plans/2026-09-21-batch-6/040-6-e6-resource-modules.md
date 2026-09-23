# 040.6 E6 — Plan document and the Solver launcher as sealed modules

| Field      | Value                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — eleventh packet                                                                                           |
| Size class | S, in three slices                                                                                                                                                                                   |
| Slices     | 1 seals Plan document and installs it where it is built, 2 seals the Solver launcher as the first backend module and installs it from both entrypoints, 3 registers the Solver launcher in the pilot |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` task 4.1 (ticked) and the Local solver launcher half of task 4.2 (left unticked; section 4 says why the Supervisor half is not in this packet)      |
| Planned on | 2026-09-24; every slice rehearsed end to end and committed on a throwaway branch cut from `2ae5cfdec6be4c7f29e7cf2b424f28ad03e2cd7d`                                                                 |

**Dates.** Every `Proof:` comment and task note below carries the planner's rehearsal date,
2026-09-24. Write the date you actually observe (`date -u +%F`) when you add them; if it differs,
change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e6-resource-modules.md`
must print an entry) and must descend from `ef0ad26a47821a20a2f2098b6475aad18116a39e`, packet E5's
slice-3 commit (`git merge-base --is-ancestor ef0ad26a47821a20a2f2098b6475aad18116a39e <checkout>`
must exit 0). Every count below was measured on `2ae5cfde`, which is the batch-6 planning branch
(`f8e2bec3`, main `e8dc24ab` plus the planning documents) merged with that E5 commit; the Saved plans
module, its `kinds.json` rows, its wiki row and its legacy re-pin (49, 267, `86721c9c…`) are all
already in the tree this packet starts from. Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e6-resource-modules 1 <packet-containing commit sha> --batch batch-6 --require-ancestor ef0ad26a47821a20a2f2098b6475aad18116a39e --slice-note 'reviewed base <sha>' --preserve evidence
```

Slices 2 and 3 resume the clone the previous slice built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e6-resource-modules 2 <the same sha> --batch batch-6 --resume --require-ancestor <slice 1 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e6-resource-modules 3 <the same sha> --batch batch-6 --resume --require-ancestor <slice 2 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

No slice binds a port or needs the network (`bun build` and the pilot suite's local `git clone` run
offline), so **no slice needs `--network`**. No slice reads an earlier attempt's evidence, only the
committed tree, so **no slice needs `--seed`**.

## 1. Goal and non-goals

**Goal.** Seal the map's two remaining standalone non-optimization responsibilities that can be
sealed without new preparation work, following Saved plans' pattern exactly: a module directory
with a README, a contract, a labelled `module.ts` and a composition `check.ts`, tested to prove that
the production installer hands out the contract's exports and nothing else and that the module's
label names a binding in a real DI failure message.

- **Plan document** (task 4.1), the map's `Plan document` resource row, becomes
  `libs/wbs/application/core/src/module/plan-document/`, over the neutral marker read port packet C
  landed (`ports/calendar-marker-read.ts`). Its one production construction site,
  `http/project.routes.ts:120`, installs it through the module instead of calling `new`.
- **Local solver launcher** (the first half of task 4.2), the map's `Local solver launcher`
  repository row, becomes `apps/wbs/be-01/src/module/solver-launcher/`, the **first** sealed module
  under `apps/wbs/be-01`, identified `module.backend.solver-launcher`. Both be-01 entrypoints read
  the solver version through it. It is registered in the wiki content-review pilot through its
  frozen-revision predecessor.

The former files stay as compatibility re-export shims, their `kinds.json` rows are rewritten in
place, and each moved test moves with its owner.

**Non-goals.**

- **No Supervisor module** in this packet (section 4 is the evidence): its mapper imports the
  Optimization feature's types, a repository-to-feature edge K5 forbids, and task 1.5's destination
  for those types does not exist yet. Task 4.2 stays unticked.
- No change to what exporting or classifying a plan document does, or to how the launcher is
  probed or spawned. The moved code differs from its source only in its import lines and, for the
  launcher, one relative-depth path literal (sections 10.2 and 10.9 are the exact diffs).
- No move of Plan document's construction out of delivery. `projectRoutes` keeps its signature:
  making `planDocuments` a composition export would change `AppOptions`, which 21 files under
  `apps/wbs/be-01` name (`git grep -l "buildApp(\|AppOptions" -- apps/wbs/be-01`). That is K2 debt, recorded in `contract.ts` and tracked under task 7.4.
- No wiki registration of Plan document: it has no frozen-revision predecessor (section 3).
- No change to `dev/local-solver-spawner.ts`: its per-spawn child environment is a per-call seam,
  and it keeps calling `spawnSolverLauncher` through the shim.
- No library version bump (`di-bag` stays 0.4.0). No frontend, gateway or MCP change. No change to
  the six earlier modules. No new checker: the one new sideways row uses the existing
  identity-based mechanism in `ports/sideways-type-boundaries.test.ts`; the one new wiki check fact
  is validated by the existing `committed-target-facts.test.ts`.

## 2. Read first

| File                                                                                                                                                                                                         | Why                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                                                                                 | Rules R1 to R5.                                                                                                                                                                             |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` (the `Plan document` row; "Backend optimization and repository ownership"; preparations 3 and 7; "Delivery and composition hazards") | Plan document's requirements; the Local solver launcher and Supervisor rows; why the Supervisor mapper needs preparation 7 (task 1.5) first; `project.routes.ts` constructing the resource. |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e5-saved-plans.md`                                                                                                                                          | The precedent this packet mirrors section by section.                                                                                                                                       |
| `libs/wbs/application/core/src/module/saved-plans/`                                                                                                                                                          | The module files this packet's `contract.ts`, `module.ts`, `check.ts` and `module.test.ts` mirror.                                                                                          |
| `libs/wbs/application/core/src/service/plan-document.ts` (208 lines), `apps/wbs/be-01/src/service/solver-launcher-process.ts` (163 lines)                                                                    | The two files that move.                                                                                                                                                                    |
| `apps/wbs/be-01/src/production-entrypoint.test.ts`                                                                                                                                                           | Why the backend module is `solver-launcher`, not `local-solver-launcher` (section 4).                                                                                                       |
| `openspec/changes/adopt-di-composition/specs/di-composition/spec.md` ("A module's label names its private bindings in failures")                                                                             | The identifier grammar: `module.<runtime>.<name>` under an app, `module.<ring>.<name>` in a library; the label drops `module.`.                                                             |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation"                                                                                           | The exact `jq -s -e` contract slice 3 uses.                                                                                                                                                 |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `2ae5cfde` on 2026-09-24.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Plan document's edges: `service/plan-document.ts` imports `@wbs/contracts` and five port files (`calendar-marker-read`, `clock`, `directory-store`, `project-store`, `work-item-store`) and nothing else. Its options are `directory: Pick<DirectoryStore, six list reads>`, `markers: CalendarMarkerReader`, `clock: Pick<Clock, 'now'>`.                                                                                                                                             | `grep -n "from '"`; lines 10-30.                                                        |
| Its one construction is delivery's: `http/project.routes.ts:120` `new PlanDocumentService({ directory, markers: calendarMarkers, clock })`, once per `projectRoutes(...)` call, over the Directory and Calendar marker resources be-01's `app.ts:238-245` hands it. `projectRoutes`' `directory`, `calendarMarkers` and `clock` parameters are used for nothing else. It is neither on `CommonServices` nor built by `servicesOver`, and it reads only.                                | `grep -n "PlanDocumentService\|directory\|calendarMarkers\|clock"` over the route file. |
| Other importers of the old path, all kept working by the shim: `http/import.routes.ts:4` (`classifyPlanDocument`), `testing/import-service-source-contract.ts:14` (and its own `new PlanDocumentService` at `:221`), `index.ts:98`, and `ports/sideways-type-boundaries.test.ts:156`'s fifth row `path === 'service/plan-document.ts'`. be-01 reaches it only through `@wbs/core`.                                                                                                     | `grep -rn "plan-document" --include=*.ts apps libs`.                                    |
| **K3 and K4.** Plan document is a resource, so K4 binds it, not K3: repository ports and the domain library are what a resource may import, and it imports no other resource. The debt is delivery's (K2): `project.routes.ts` builds the resource from two other resources. `contract.ts` records it against task 7.4.                                                                                                                                                                | Code-organization design, "Direction rules" (K2-K4) and the import matrix.              |
| **No wiki predecessor for Plan document.** `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/plan-document.ts` prints nothing: the file was added as `libs/core/src/service/plan-document.ts` at `8c34a33f` (2026-09-13) and renamed `R100` at `7c5dee9e`, both after the frozen revision (2026-09-10). Plan import's precedent (task 7.5's note) applies: no registration.                                                                               | `git ls-tree`; `git log --follow --diff-filter=AR`.                                     |
| The launcher file's edges: `node:fs` only. Its production readers are `main.ts:6,22` and `dev/main.ts:19,64` (`readRuntimeSolverVersion(process.env.NODE_ENV)`); `dev/local-solver-spawner.ts:34,157` calls `spawnSolverLauncher` with a per-spawn Bun seam; `services.db.test.ts:31` and `service/solver-child-lifecycle.db.test.ts:13` import through the old path.                                                                                                                  | `grep -rn`.                                                                             |
| The moved launcher resolves the solver's source module **relative to its own file**: `new URL('../../../../../libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py', import.meta.url)` at line 67. One directory deeper, that literal must gain one `../`, or the development read fails `ENOENT` (section 6 row 23). No existing unit test reads the real file; `services.db.test.ts:556,634` does, through the shim.                                                               | Read; rehearsed.                                                                        |
| **be-01 today.** It has no DI module: `boot.ts:89` owns the only bag (source, services, retention and server disposal), `services.ts` `buildServices` composes the core, and the two entrypoints `main.ts` and `dev/main.ts` pick the solver spawner and read the solver version by calling functions directly. There is no be-01 sideways or type-identity boundary check (task 1.6's note: "be-01 has no type-identity boundary check"). `di-bag` resolves from be-01 (`boot.ts:4`). | Read.                                                                                   |
| `production-entrypoint.test.ts:54` lists `'local-solver'` among the strings the production bundle of `main.ts` must not contain, and `main.ts` reads the solver version through this module after slice 2.                                                                                                                                                                                                                                                                             | Read; section 6 row 17.                                                                 |
| `kinds.json` has `K=93` entries at `2ae5cfde`. This packet rewrites two rows in place: `libs/wbs/application/core/src/service/plan-document.ts` (line 346, `resource`) in slice 1 and `apps/wbs/be-01/src/service/solver-launcher-process.ts` (line 195, `repository`) in slice 2. Both become `support` shim rows; the count stays 93.                                                                                                                                                | `python3` count; `grep -n`.                                                             |
| The Local solver launcher's frozen-revision predecessor exists: `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- apps/be-01/src/service/solver-launcher-process.ts` prints `100644 blob cb21f58d1daaa28e7e5159ef038c0a38c4cf190e`. Its test existed then too, but one predecessor per module directory is the registration's guarantee.                                                                                                                                        | `git ls-tree`.                                                                          |
| The wiki pilot holds `M=11` modules and `B=11` boundaries (E5 added the eleventh). No `module.backend.*` row exists yet; `module.backend.solver-launcher` sorts between `module.archive.bounded-replay-sweep` and `module.docs.wbs-table-extraction`.                                                                                                                                                                                                                                  | `python3` over `modules.json`, `policy.json`.                                           |
| **The pilot requires an applicable check on every index** (`pilot-policy.test.ts:414`, `applicableChecks.length > 0`), and `docs/wiki-policy/relationships.json` declares none for `wbs-be-01` (its seven facts are core, domain, store-memory, tool-dagger and three wiki-cli ones). Slice 3 therefore declares `check.be-01.test`, whose `expectedConfiguration` `apps/wiki/cli/src/relationships/committed-target-facts.test.ts` compares with the real `wbs-be-01:test` target.    | Read; section 6 rows 27 and 31.                                                         |
| `pilot-policy.test.ts:549-580`, `refuses prose facts presented as applicable checks`, pins the **first** refused index in path order, `apps/wiki/cli/README.md`. `apps/wbs/be-01/…` sorts before it, so registering this module moves that pin (section 6 row 28).                                                                                                                                                                                                                     | Read; rehearsed.                                                                        |
| The legacy pin (`tools/tool-devsync/src/repo-namespacing-handoff.test.ts:612-829`) stands at `historical policy selector or baseline` 49, occurrences 267, digest `86721c9c2457e04146bd4db56db16869936be5a012fddc671bf2e39989c23d0f` after E5; slice 3's registration moves it to 51, 269, `113681cd…` (row 30). `openspec/changes/adopt-di-composition/tasks.md` is not scanned, so the task notes' pre-namespacing paths do not move it.                                             | Rehearsed.                                                                              |

## 4. Task 4.2: what lands, what does not, and the identifier

**The Local solver launcher lands.** Its file imports `node:fs` alone, so a repository module
around it imports nothing above it (K5), and it needs none of the map's preparations.

**The Supervisor does not, and cannot without task 1.5.** The map puts `solver-supervisor-client.ts`
and, as its adapter-private support, `solver-supervisor-spawner.ts` (the request/attempt mapper) in
one repository module that exports the adapted `ReservedSpawner`. Measured at `2ae5cfde`:

1. `solver-supervisor-spawner.ts:1` is
   `import type { ReservedSolverChild, ReservedSpawner } from './optimization-coordinator';` — the
   Optimization **feature** file. Moving the mapper into a Supervisor module keeps that edge, and a
   repository imports nothing above it (K5; the import matrix's "Repository adapter" row allows
   domain, contracts and the port it implements, never a feature).
2. Cutting that edge is exactly task 1.5 (map preparation 7): "Move the Optimization spawn and child
   interfaces into the Optimization contract". That contract is the Optimization module's
   `contract.ts` (task 3.6), which does not exist, and be-01 has no neutral port location.
3. The types are not yet neutral either: `ReservedSpawnRequest` extends `SpawnRequest`, which
   `optimization-coordinator.ts:40-41` imports from be-01's one-line re-export
   `apps/wbs/be-01/src/repository/optimized-schedule-cache.ts:1` of
   `@wbs/store-sqlite/optimized-schedule-cache`, and names `SolverSlotAdmission` from
   `repository/optimization-admission`, and `ReservedSolverChild` extends `SolverChildProcess` from
   `service/solver-child-lifecycle.ts`, Optimization's private support. A "type-only half" moved
   now would be a new port file carrying adapter-row types, moved again by 3.6.

So a Supervisor module here would either keep a forbidden edge or invent a port location and move
it twice. This packet records the reason on task 4.2 (section 10.18) and leaves 4.2 unticked.

**A correction to the brief, recorded.** `solver-request-pair.ts` is not the Supervisor's mapper:
it builds the two solver requests for `OptimizationCoordinator` (`optimization-coordinator.ts:55`)
and is classified `support`, "pure domain code; move to the domain library" (`kinds.json:200`,
task 6.2). The request/attempt mapper is `solver-supervisor-spawner.ts`.

**The identifier is `module.backend.solver-launcher`, not `module.backend.local-solver-launcher`.**
The map's names are "stable responsibilities for planning, not proposed runtime IDs" (its own
line 8). The spec's grammar gives `module.backend.<name>` for a module under `apps/wbs/be-01`. The
name cannot contain `local-solver`: `main.ts` reads the solver version through this module after
slice 2, so its label is in the production bundle, and `production-entrypoint.test.ts`'s
`cannot reach the local solver` refuses that string (row 17 shows it failing). The launcher is not
local-only in any case: production reads the installed version through it.

## 5. File plan

| Path                                                                                                                  | Slice   | Action                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `libs/wbs/application/core/src/module/plan-document/module.test.ts`                                                   | 1       | create **first**, for the red (10.1)                                                                   |
| `…/module/plan-document/plan-document.resource.ts`                                                                    | 1       | `cp` from `service/plan-document.ts`, then 10.2's import diff                                          |
| `…/module/plan-document/plan-document.resource.test.ts`                                                               | 1       | **`mv`** from `service/plan-document.test.ts`, then 10.2's import diff (old path deleted, not shimmed) |
| `…/module/plan-document/contract.ts`, `module.ts`, `check.ts`, `README.md`                                            | 1       | create (10.4); the README is final in slice 1                                                          |
| `libs/wbs/application/core/src/service/plan-document.ts`                                                              | 1       | content replaced by the shim of 10.3                                                                   |
| `libs/wbs/application/core/src/http/project.routes.ts`, `index.ts`, `docs/code-organization/kinds.json`               | 1       | 10.5                                                                                                   |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                                                | 1       | one row and one JSDoc paragraph (10.6), then its Proof (10.7)                                          |
| `apps/wbs/be-01/src/module/solver-launcher/module.test.ts`                                                            | 2       | create **first**, for the red (10.8)                                                                   |
| `…/module/solver-launcher/solver-launcher.repository.ts`                                                              | 2       | `cp` from `service/solver-launcher-process.ts`, then 10.9's diff                                       |
| `…/module/solver-launcher/solver-launcher.repository.test.ts`                                                         | 2       | **`mv`** from `service/solver-launcher-process.test.ts`, then 10.9's diff                              |
| `…/module/solver-launcher/contract.ts`, `module.ts`, `check.ts`, `README.md`                                          | 2, 3    | create (10.11); slice 3 replaces the README (10.15)                                                    |
| `apps/wbs/be-01/src/service/solver-launcher-process.ts`                                                               | 2       | content replaced by the shim of 10.10                                                                  |
| `apps/wbs/be-01/src/main.ts`, `apps/wbs/be-01/src/dev/main.ts`, `docs/code-organization/kinds.json`                   | 2       | 10.12                                                                                                  |
| `docs/wiki-policy/modules.json`, `policy.json`, `relationships.json`; `apps/wiki/cli/src/policy/pilot-policy.test.ts` | 3       | 10.14 and 10.16                                                                                        |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                             | 3       | legacy re-pin (10.17)                                                                                  |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                      | 3       | tick 4.1, note 4.2 (unticked), extend 7.5 (10.18)                                                      |
| `openspec/changes/adopt-di-composition/verify.md`                                                                     | 1, 2, 3 | each slice appends its own observations                                                                |

**Each module directory holds exactly seven files**, and every section that counts them says
seven. Plan document: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`,
`plan-document.resource.test.ts`, `plan-document.resource.ts`. Solver launcher: `README.md`,
`check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `solver-launcher.repository.test.ts`,
`solver-launcher.repository.ts`. Each README's index names the six that are not the README.

**Neighbours.** Packet E5 owns `module/saved-plans/` and the Saved plans lines of `compose.ts`,
`index.ts` and `kinds.json`; this packet touches none of them (its `index.ts` hunk sits between the
Bounded replay sweep and Plan history lines; its `kinds.json` hunks are two other rows). `tasks.md`
has been touched by every 040.6 packet; this packet's edits are to lines no one else edits. Section
12's hand-over lists are scoped to each slice's own `base`, so the planner's own commits cannot
break them.

## 6. Rehearsed observations

Every row was produced on the throwaway branch in a private worktree of `2ae5cfde`, against the
exact listings of section 10, and restored with `cp` + `cmp` before the next. Rows marked
**evidence** are the planner's measurements behind a decision; the executor does not repeat them.

| #   | Where                                                                                                           | Fault injected                                                                                                 | Test that observed it                                                                                                        | Literal fragment observed                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, unchanged tree                                                                                     | none; `check.ts` does not exist                                                                                | `module/plan-document/module.test.ts`                                                                                        | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                          |
| 2   | slice 1 green                                                                                                   | none                                                                                                           | `bun test ./libs/wbs/application/core/src/module/plan-document/`                                                             | `13 pass`, `0 fail`, `33 expect() calls`, 2 files                                                                                                                                                                                                              |
| 3   | slice 1 step 0, unchanged `project.routes.ts`                                                                   | none                                                                                                           | `bun build libs/wbs/application/core/src/http/project.routes.ts --target=bun`, then `grep -c "application.plan-document"`    | build exit 0; grep exit 1, `count=0`                                                                                                                                                                                                                           |
| 4   | slice 1, after 10.5                                                                                             | `projectRoutes` installs the module                                                                            | the same build and `grep -c`                                                                                                 | `count=1`                                                                                                                                                                                                                                                      |
| 5   | `module.ts`, the `buildModule` key tuple                                                                        | `['planDocuments', 'planDocumentOptions']`                                                                     | the private-binding test and the two label tests                                                                             | `Received function did not throw`; `Expected to contain: "application.plan-document/planDocumentOptions"`; message `Cannot resolve "planDocumentOptions"`; `2 pass`, `3 fail`                                                                                  |
| 6   | `module.ts`, the label argument alone                                                                           | `.buildModule(['planDocuments'])`                                                                              | `labels its private bindings with the module name`, `names itself when a host omits a requirement`                           | `3 pass`, `2 fail`; the private-binding test stays green                                                                                                                                                                                                       |
| 7   | `module.ts`, the `planDocumentOptions` factory's return                                                         | `({ directory, markers, clock })` → `({ directory, markers, clock: { now: () => 0 } })`                        | `exports a project with its markers over the graph installPlanDocument wires`                                                | `- "exportedAt": "2026-09-24T09:00:00.000Z"`, `+ "exportedAt": "1970-01-01T00:00:00.000Z"`; `4 pass`, `1 fail`                                                                                                                                                 |
| 8   | `check.ts`, the single `return`                                                                                 | `const exposed = { planDocuments: bag.resolve('planDocuments'), bag };` then `return exposed;`                 | `exposes only the contract exports from its installer`, first assertion                                                      | received keys add `"bag"`; `4 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                                                                                     |
| 9   | `check.ts`, the same `return`                                                                                   | `return { planDocuments: Object.assign(bag.resolve('planDocuments'), { resolve: bag.resolve.bind(bag) }) };`   | the same test, second assertion                                                                                              | `Expected: true`, `Received: false`; `4 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                      |
| 10  | `module/plan-document/plan-document.resource.ts`                                                                | `import '../../service/calendar-marker.service';` prepended                                                    | `rejects the checked sideways-type import routes`                                                                            | exactly `"module/plan-document/plan-document.resource.ts: '../../service/calendar-marker.service' reaches service/calendar-marker.service.ts"`; `0 pass`, `1 fail`                                                                                             |
| 11  | **evidence**: row 10 again with 10.6's new row deleted                                                          | same import                                                                                                    | same test                                                                                                                    | `1 pass`, `0 fail` — the fifth row alone does not cover the moved file                                                                                                                                                                                         |
| 12  | **evidence**: a first draft of 10.1 that seeded the marker through `services.calendarMarkers`                   | none                                                                                                           | same test                                                                                                                    | three violations from `module/plan-document/module.test.ts` (`create`, `ok`, `value` reach `service/calendar-marker.service.ts`) — the row covers tests too, which is why 10.1 uses a stub `CalendarMarkerReader`                                              |
| 13  | slice 2 red, unchanged tree                                                                                     | none                                                                                                           | `module/solver-launcher/module.test.ts`                                                                                      | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                          |
| 14  | slice 2 green                                                                                                   | none                                                                                                           | `bun test ./apps/wbs/be-01/src/module/solver-launcher/`                                                                      | `13 pass`, `0 fail`, `28 expect() calls`, 2 files                                                                                                                                                                                                              |
| 15  | slice 2 step 0, unchanged entrypoints                                                                           | none                                                                                                           | `bun build apps/wbs/be-01/src/main.ts --target=bun` and the same for `dev/main.ts`, then `grep -c "backend.solver-launcher"` | both builds exit 0; both greps exit 1, `count=0`                                                                                                                                                                                                               |
| 16  | slice 2, after 10.12                                                                                            | both entrypoints install the module                                                                            | the same builds and greps                                                                                                    | `count=1` each                                                                                                                                                                                                                                                 |
| 17  | **evidence**: `contract.ts`'s label set to `'backend.local-solver-launcher'`                                    | the name the map's row would suggest                                                                           | `production-entrypoint.test.ts` › `cannot reach the local solver`                                                            | `+ [ "local-solver" ]`; `1 pass`, `1 fail`                                                                                                                                                                                                                     |
| 18  | `module.ts`, the `buildModule` key tuple                                                                        | `['solverLauncher', 'launcherSeams']`                                                                          | the private-binding test and the two label tests                                                                             | `Received function did not throw`; message `Cannot resolve "launcherSeams"`; `4 pass`, `3 fail`                                                                                                                                                                |
| 19  | `module.ts`, the label argument alone                                                                           | `.buildModule(['solverLauncher'])`                                                                             | the two label tests                                                                                                          | `5 pass`, `2 fail`                                                                                                                                                                                                                                             |
| 20  | `module.ts`, `readInstalledVersion`                                                                             | `readInstalledSolverVersion(launcherSeams.probe)` → `readInstalledSolverVersion()`                             | `reads the installed version through the probe installSolverLauncher wires`                                                  | `error: Executable not found in $PATH: "wbs-solver-launcher"` (a host with the launcher installed would instead receive its real version, still not `9.9.9`); `6 pass`, `1 fail`                                                                               |
| 21  | `check.ts`, the single `return`                                                                                 | `const exposed = { solverLauncher: bag.resolve('solverLauncher'), bag };` then `return exposed;`               | `exposes only the contract exports from its installer`                                                                       | received keys add `"bag"`; `6 pass`, `1 fail`; `wbs-be-01:typecheck` exit 0                                                                                                                                                                                    |
| 22  | `check.ts`, the same `return`                                                                                   | `return { solverLauncher: Object.assign(bag.resolve('solverLauncher'), { resolve: bag.resolve.bind(bag) }) };` | the same test                                                                                                                | `Expected: true`, `Received: false`; `6 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                      |
| 23  | `solver-launcher.repository.ts`, the source-module URL                                                          | the pre-move `'../../../../../libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py'` kept                    | `reads the development version from the solver source module`                                                                | `error: ENOENT: no such file or directory, open '…/apps/libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py'`; `6 pass`, `1 fail`                                                                                                                           |
| 24  | **evidence**: a first draft of that test that read `__init__.py` itself for the expected version                | none                                                                                                           | whole `tool-devsync:test` › `names every file a suite reads from outside its own project`                                    | `Received: [ "wbs-be-01:test does not declare libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py" ]` — why 10.8 asserts a version shape with a throwing probe instead                                                                                      |
| 25  | slice 3, `modules.json` row alone                                                                               | none; a genuine partial registration                                                                           | `pins exact pre-index tuples and passes observe lint from external trust`                                                    | `pilot-policy.test.ts:376`: `Expected: 11`, `Received: 12`; `0 pass`, `1 fail`, `23 expect() calls`                                                                                                                                                            |
| 26  | slice 3, `policy.json` boundary added, README not yet in `pilotPaths`                                           | none                                                                                                           | same test                                                                                                                    | `pilot-policy.test.ts:413`: `Expected: true`, `Received: false`; `0 pass`, `1 fail`, `27 expect() calls`                                                                                                                                                       |
| 27  | slice 3, `relationships.json`'s new fact, its `command` changed to `"bun test --coverage"`                      | a fact that disagrees with the real target                                                                     | `committed-target-facts.test.ts`                                                                                             | `- "command": "bun test --coverage --coverage-reporter=lcov"`, `+ "command": "bun test --coverage"`, naming `check.be-01.test`; `1 pass`, `1 fail`                                                                                                             |
| 28  | slice 3, fact, `pilotPaths` entry and final README added, prose pin unchanged                                   | none; the registration alone moves it                                                                          | the whole `pilot-policy.test.ts`                                                                                             | `refuses prose facts presented as applicable checks` fails: `Received: "applicable check has no executable authority in apps/wbs/be-01/src/module/solver-launcher/README.md: check.be-01.test (external-consumer)"`; `20 pass`, `1 fail`, `299 expect() calls` |
| 29  | slice 3 green                                                                                                   | 10.16's pin moved                                                                                              | the whole `pilot-policy.test.ts`                                                                                             | `21 pass`, `0 fail`, `299 expect() calls` (baseline `21`/`0`/`298`: one more per-boundary assertion)                                                                                                                                                           |
| 30  | slice 3, legacy pin unchanged, after registration                                                               | none                                                                                                           | `every legacy source occurrence and relevant text family is pinned`                                                          | `historical policy selector or baseline` `49` → `51`, `occurrences` `267` → `269`, digest `86721c9c…` → `113681cd7a2c98566f565cca8176456eb50fb453b6fb94ce5bf3f611a0d576bb`; `Expected - 3` / `Received + 3`; `0 pass`, `1 fail`                                |
| 31  | **evidence**: the final README with `"applicableChecks": []` and a `checks` inapplicability reason, no new fact | none                                                                                                           | `pins exact pre-index tuples …`                                                                                              | `pilot-policy.test.ts:414` (`applicableChecks.length > 0`): `Expected: true`, `Received: false` — why slice 3 declares `check.be-01.test`                                                                                                                      |

Each module assertion has its own mutation: rows 5 and 6 (and 18 and 19) are independent, the label
fault leaving the private-binding test green; rows 8 and 9 (21 and 22) split the installer test's
two assertions; rows 7 and 20 break one real provider edge each; row 23 is the one fault the move
itself can introduce. Row 10 produces **exactly one** violation, and row 11 shows no other row
catches it.

**No compile red, on purpose.** Neither slice changes a type anyone else sees: `projectRoutes`
keeps its signature, and `main.ts` and `dev/main.ts` keep passing a `string` as `solverVersion`. A
`@ts-expect-error` would have nothing true to assert. The installation reds are rows 3 and 15: the
bundles of the three installing entry files do not contain the module's label until the installer
is called. **Not injected:** dropping the `spawn` seam in `module.ts` would make the spawn test
start a real `wbs-solver-launcher` on any host that has one installed; that pass-through is one
expression and its test asserts the fake received the call.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses with
`if cmd >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"`;
never read a status through `tee`, never `|| true`. Start lint, typecheck and format targets the
same way and poll their logs (preamble rule 19). Scratch lives only under `"$TMPDIR"`, faults and
failing output under `"$TMPDIR/evidence"`; `verify.md` cites basenames only. You never run
`git add`, `git commit` or `git mv`: moves are `cp` and `mv`, and the planner stages them. A fault
is injected by editing the file, observed, then restored with `cp` from a `"$TMPDIR"` copy and
proved with `cmp`. Every step 0 opens with `base=$(git rev-parse HEAD)` and an empty-status check;
every count compared (`K`, `C`, `F`, `E`, `EF`, `D`, `DF`, `M`, `B`, `T`, `TF`, `P`, `Q`, `N`) is
assigned in the slice that compares it.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`. After
appending to `verify.md`, run `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
before the format check.

### Slice 1 — Seal Plan document as a resource module and install it where it is built

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e libs/wbs/application/core/src/module/plan-document && echo "gate: module absent"
test -f libs/wbs/application/core/src/module/saved-plans/module.ts && echo "gate: E5 landed"
wc -l < libs/wbs/application/core/src/service/plan-document.ts
grep -cF "new PlanDocumentService({ directory, markers: calendarMarkers, clock });" libs/wbs/application/core/src/http/project.routes.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `208`, `1`, then a number: call it `K` (observed `93`). Then
record, before any edit:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
log="$TMPDIR/evidence/slice1-lint-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core wbs-be-01 --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
log="$TMPDIR/evidence/slice1-core-baseline.log"
if (cd libs/wbs/application/core && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test src) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice1-be01-unit-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test $(find src -name '*.test.ts' ! -name '*.db.test.ts' | sort)) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice1-routes-bundle-red.log"
bundle="$TMPDIR/evidence/slice1-project-routes-red.js"
if bun build libs/wbs/application/core/src/http/project.routes.ts --target=bun --outfile="$bundle" >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
test -f "$bundle"
if count=$(grep -c "application.plan-document" "$bundle"); then echo "count=$count"; else status=$?; test "$status" -eq 1; echo "count=0 (grep exit 1)"; fi
```

The lint and typecheck run first on purpose (addendum 14). Expect `exit=0` in the first three logs.
Call the core pass count `C` and file count `F` (observed `572` over 59); call the be-01 unit pass
count `E` and file count `EF` (observed `519` over 49). Expect `exit=0` in the bundle log and
`count=0 (grep exit 1)` (row 3). This slice ends at `C + 5` over `F + 1` (`module.test.ts` adds
five tests and one file; the moved `plan-document.resource.test.ts` keeps its eight) and at `E`
over `EF`.

**Steps — test first, then the implementation, in this one slice.**

1. `mkdir -p libs/wbs/application/core/src/module/plan-document`, create `module.test.ts` there
   from 10.1 verbatim, and run
   `bun test ./libs/wbs/application/core/src/module/plan-document/module.test.ts`. Expect row 1's
   red. Save the log. This red is evidence, not a commit.
2. Move the code. From the repository root:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
cp "$c/service/plan-document.ts" "$c/module/plan-document/plan-document.resource.ts"
mv "$c/service/plan-document.test.ts" "$c/module/plan-document/plan-document.resource.test.ts"
```

Then apply 10.2's diff (import lines only, two files), and replace
`service/plan-document.ts`'s content with 10.3's shim. The `mv` is an **authorised deletion** of
the old test path: its eight tests must exist at exactly one path, and no file imports a test.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from 10.4 verbatim (no `Proof:`
   comments yet). The README is final: it already carries its `module-index` block.
4. `bun test ./libs/wbs/application/core/src/module/plan-document/` → exit 0, row 2.
5. Apply 10.5's diff (`project.routes.ts` installs through `installPlanDocument`; `index.ts` gains
   two export lines; one `kinds.json` row rewritten in place). Rerun the bundle command of step 0
   with `--outfile="$TMPDIR/evidence/slice1-project-routes-green.js"` and its own log name, then the
   same `grep -c` → `count=1` (row 4).
6. Apply 10.6's diff to `ports/sideways-type-boundaries.test.ts` (one row plus a JSDoc paragraph;
   the existing rows are unchanged). `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`
   → `1 pass`.
7. `wbs-core` lint and typecheck, and `wbs-be-01:typecheck`, each under the status wrapper →
   exit 0. Only rule-17 diagnostics (`simple-import-sort/*`, `prettier/prettier`) may be fixed with
   `bunx eslint --fix` on files this slice owns; anything else is a stop.
8. The negatives of section 6, **one at a time, each restored and `cmp`-proved before the next**:
   rows 5, 6, 7 (`module.ts`), 8, 9 (`check.ts`) against
   `bun test ./libs/wbs/application/core/src/module/plan-document/module.test.ts`; row 10 (one line
   prepended to `module/plan-document/plan-document.resource.ts`) against the sideways suite. For
   rows 8 and 9 also run `wbs-core:typecheck` on the mutated tree and record its exit 0. Save each
   mutation as a patch and each failing output beside it. Rows 11 and 12 are not required.
9. Only now apply 10.7's diff: the three observed `Proof:` comments in `module.ts`, the two in
   `check.ts` and the one in the sideways test's JSDoc. Change the date only if yours differs, and
   change a fragment only if what you saw differs (then record the difference).
10. Planner-only, and why: `tools/tool-devsync/src/service-kinds.test.ts` compares `kinds.json` to
    `git ls-files`, which the planner's staging settles. Run this filesystem substitute instead and
    expect `93 []` (`K` unchanged, no row naming a missing file):

```sh
python3 -c "import json,os;e=json.load(open('docs/code-organization/kinds.json'))['entries'];print(len(e),[x['path'] for x in e if not os.path.isfile(x['path'])])"
```

11. Closing checks, each under the status wrapper: `(cd libs/wbs/application/core && bun test src)`
    → exit 0, `C + 5` passes over `F + 1` files (observed `577` over 60); the be-01 unit command of
    step 0 → `E` over `EF` (observed `519` over 49); `wbs-core` lint and typecheck and
    `wbs-be-01:typecheck` → exit 0; `test "$(ls libs/wbs/application/core/src/module/plan-document | wc -l)" -eq 7`;
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
12. Append to `openspec/changes/adopt-di-composition/verify.md` a `### Plan document, Slice 1 — <date>`
    section: `base`, `K`, `C`/`F`, `E`/`EF`, the red, the green, the bundle red and green, every
    fault of rows 5-10 with its fragment and evidence basenames, the step-10 substitute, and one
    line stating the recorded K2 debt (delivery installs the resource, tracked under 7.4). Run
    Prettier on it, then rerun the format check.
13. Hand-over: section 12's slice-1 modified and deleted paths must equal
    `git diff --name-only "$base"`, and its new paths `git ls-files --others --exclude-standard`.

Planner commit: `refactor(core): seal Plan document as a resource module installed where it is built`.
The planner stages with `git add -A` over exactly section 12's paths; Git's rename detection
reports `plan-document.resource.test.ts` as a rename. The planner then runs `tool-devsync:test`
whole and `check-indexes committed` on the commit (section 8).

### Slice 2 — Seal the Solver launcher as the first backend module and install it from both entrypoints

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/plan-document/module.ts && echo "gate: slice 1 landed"
test ! -e apps/wbs/be-01/src/module && echo "gate: no backend module yet"
wc -l < apps/wbs/be-01/src/service/solver-launcher-process.ts
grep -cF "'../../../../../libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py'," apps/wbs/be-01/src/service/solver-launcher-process.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `163`, `1`, then `K` (observed `93`). Then record, before
any edit:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
log="$TMPDIR/evidence/slice2-lint-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-be-01 --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
log="$TMPDIR/evidence/slice2-be01-unit-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test $(find src -name '*.test.ts' ! -name '*.db.test.ts' | sort)) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice2-be01-db-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test src/services.db.test.ts src/service/solver-child-lifecycle.db.test.ts) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
for entry in main dev/main; do
  name=$(printf '%s' "$entry" | tr / -)
  log="$TMPDIR/evidence/slice2-$name-bundle-red.log"
  bundle="$TMPDIR/evidence/slice2-$name-red.js"
  if bun build "apps/wbs/be-01/src/$entry.ts" --target=bun --outfile="$bundle" >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
  test -f "$bundle"
  if count=$(grep -c "backend.solver-launcher" "$bundle"); then echo "$entry count=$count"; else status=$?; test "$status" -eq 1; echo "$entry count=0 (grep exit 1)"; fi
done
```

Expect `exit=0` in every log. Call the be-01 unit pass count `E` and file count `EF` (observed
`519` over 49) and the two database files' pass count `D` and file count `DF` (observed `13` over 2 in
the author's own worktree, **not** inside a sandbox; `services.db.test.ts` reads the real solver
source module through the shim). If the pair cannot run in your sandbox, record its output, mark
it "pending planner verification" with the author's observed `13` over 2, and continue without
comparing `D` in step 10. Expect
`main count=0 (grep exit 1)` and `dev/main count=0 (grep exit 1)` (row 15). This slice ends at
`E + 7` over `EF + 1` and at `D` over `DF`.

1. `mkdir -p apps/wbs/be-01/src/module/solver-launcher`, create `module.test.ts` there from 10.8
   verbatim, and run `bun test ./apps/wbs/be-01/src/module/solver-launcher/module.test.ts`. Expect
   row 13's red. Save the log.
2. Move the code. From the repository root:

```sh
set -euo pipefail
b=apps/wbs/be-01/src
cp "$b/service/solver-launcher-process.ts" "$b/module/solver-launcher/solver-launcher.repository.ts"
mv "$b/service/solver-launcher-process.test.ts" "$b/module/solver-launcher/solver-launcher.repository.test.ts"
```

Then apply 10.9's diff (the moved test's import line, and the moved file's one relative-depth
literal, which gains one `../` because the file is one directory deeper), and replace
`service/solver-launcher-process.ts`'s content with 10.10's shim. The `mv` is an **authorised
deletion** of the old test path.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from 10.11 verbatim (no `Proof:`
   comments; the README has no `module-index` block and no "Wiki registration" section yet).
4. `bun test ./apps/wbs/be-01/src/module/solver-launcher/` → exit 0, row 14.
5. Apply 10.12's diff (`main.ts` and `dev/main.ts` read the solver version through
   `installSolverLauncher({})`; one `kinds.json` row rewritten in place). Rerun step 0's bundle loop
   with `-green` in place of `-red` in both file names → `main count=1` and `dev/main count=1`
   (row 16). Then `bun test ./apps/wbs/be-01/src/production-entrypoint.test.ts` → `2 pass`: the
   production bundle still reaches no `local-solver` string (row 17 is why the name matters).
6. `wbs-be-01` lint and typecheck under the status wrapper → exit 0. Rule-17 fixes only, as in
   slice 1.
7. The negatives of section 6, one at a time, each restored and `cmp`-proved: rows 18, 19, 20
   (`module.ts`), 21, 22 (`check.ts`) and 23 (`solver-launcher.repository.ts`, the literal only)
   against `bun test ./apps/wbs/be-01/src/module/solver-launcher/module.test.ts`. For rows 21 and 22
   also run `wbs-be-01:typecheck` on the mutated tree and record its exit 0. Rows 17 and 24 are not
   required.
8. Only now apply 10.13's diff: three `Proof:` comments in `module.ts`, two in `check.ts` and one in
   `module.test.ts`'s JSDoc for the source-module test. Row 23's proof lives in the test, not in the
   moved file, so the moved file keeps differing from its source by the one literal alone.
9. The step-10 substitute of slice 1 → `93 []`.
10. Closing checks, each under the status wrapper: the be-01 unit command → `E + 7` over `EF + 1`
    (observed `526` over 50); the database command → `D` over `DF` (observed `13` over 2); the
    entrypoint test → `2 pass`; `wbs-be-01` lint and typecheck → exit 0;
    `test "$(ls apps/wbs/be-01/src/module/solver-launcher | wc -l)" -eq 7`;
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
11. Append `### Solver launcher, Slice 2 — <date>` to `verify.md`: `base`, `K`, `E`/`EF`, `D`/`DF`,
    the red, the green, the two bundle reds and greens, rows 18-23 with fragments and evidence
    basenames, the substitute, and one line: "be-01 has no sideways or type-identity boundary
    check; the module's K5 compliance (imports `node:fs`, `di-bag` and its own files) is read, not
    watched". Prettier on it, then the format check.
12. Hand-over as in slice 1, against section 12's slice-2 lists.

Planner commit: `refactor(be-01): seal the Solver launcher as the first backend DI Bag module`. The
planner then runs `tool-devsync:test` whole (it covers `workspace-targets.test.ts`, row 24's
check) and whole `wbs-be-01:test` (section 8).

### Slice 3 — Register the Solver launcher in the wiki content-review pilot and record the tasks

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- apps/wbs/be-01/src/module/solver-launcher/module.ts
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/relationships.json'))['facts']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- apps/be-01/src/service/solver-launcher-process.ts
```

Expect `base=…`, the gate, a commit hash, `M` and `B` (observed `11` and `11`), a fact count (observed
`7`), then exactly
`100644 blob cb21f58d1daaa28e7e5159ef038c0a38c4cf190e	apps/be-01/src/service/solver-launcher-process.ts`.
If that line prints nothing, stop. Then, before any edit, each under the status wrapper:

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
(cd apps/wiki/cli && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/relationships/committed-target-facts.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all. Call the pilot file's tests, failures and `expect()` calls `T`, `TF`, `P`
(observed `21`, `0`, `298`; the run takes about 290 seconds), and the target-facts file's
`expect()` calls `Q` (observed `2 pass`, `16`). The legacy pin passes (`1 pass`). Run the OpenSpec
validation standard block and call `passed` `N` (observed `114`).

**Registration, in the order it must be observed.** The pilot suite clones committed `HEAD` and
overlays only `pilotPaths` from the working tree (`pilot-policy.test.ts:30-49`); slices 1 and 2 are
committed, so the module's files are in `HEAD`.

1. Apply 10.14a (`modules.json`: one row, sorted before `module.docs.wbs-table-extraction`). Run
   `(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples")`
   → the PARITY red (row 25).
2. Apply 10.14b (`policy.json`: one boundary after `boundary.application.saved-plans`). Rerun the
   same command → the DISCOVERED-INDEX red (row 26).
3. Apply 10.14c (`relationships.json`: the `check.be-01.test` fact first in `facts`). Rerun the
   target-facts command of step 0 → `2 pass`, `Q + 1` calls. Then row 27: change that fact's
   `"command": "bun test --coverage --coverage-reporter=lcov",` (the **first** occurrence in the file,
   inside `check.be-01.test`) to `"command": "bun test --coverage",`, rerun → `1 pass`, `1 fail`,
   restore with `cp`, `cmp`, rerun green.
4. Apply 10.14d (`pilotPaths` entry) and replace the module README with 10.15 verbatim. Rerun the
   **whole** pilot file → row 28: exactly `refuses prose facts presented as applicable checks`
   fails, naming this README. Save it.
5. Apply 10.16 (the prose pin and its Proof text). Rerun the whole pilot file → green (row 29): `T`
   tests, `TF` failures, `P + 1` assertions.
6. Rerun the legacy-pin test **with the pin unchanged** → red (row 30). Save it. Only then apply
   10.17's first diff (the numbers), rerun → `1 pass`, and then apply 10.17's second diff (the Proof
   comment). No other pinned literal in that file may move; if one does, stop.
7. Apply 10.18 (`tasks.md`: tick 4.1, note 4.2 **unticked**, extend 7.5).
8. Rerun step 0's run-many typecheck, `twilight-burokrat:lint:source` and `tool-devsync:lint` →
   exit 0; rerun the legacy-pin test alone,
   `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"`
   → `1 pass`. Do **not** run that file whole: its `production index checker resolves current
Markdown links` test spawns `check-indexes working`, which writes Git objects, so the whole file
   is planner-only (section 8). The pilot suite already reran green in step 5; the OpenSpec block → `passed` `N`,
   `failed` `0`.
9. Append `### Solver launcher registration, Slice 3 — <date>` to `verify.md`: `base`, `M`, `B`,
   the frozen tuple, rows 25-30 with evidence basenames, `T`/`TF`/`P` and `Q` before and after, the
   four checks, `N`. Prettier on it, then `GSETTINGS_BACKEND=memory bunx nx format:check --all` →
   exit 0.

Planner commit: `docs(be-01): register the Solver launcher's sealed module in the wiki content-review pilot`.

**Planner-only, after this commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 3 commit>`
is **index validation** (`checkIndexes`), not the `MOD-LAYOUT` rule. Rehearsed against the
throwaway slice-3 commit `dd7e7667`: 16 indexes, among them `module.backend.solver-launcher` with
the six non-README files and `applicableChecks` `["check.be-01.test"]`, and
`module.application.plan-document` with its six and `["check.core.test"]`; no `reviewDebt` entry.

## 8. Planner-only checks

| Check                                                                                                                                                                                                        | Why the planner's                                                                                                                         | Observed on the rehearsed tree                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Moved-code identity: for each file of 10.2 and 10.9, copy the `$base` version of the source path to a scratch file, apply that file's section of the diff to it, and `cmp` it with the committed module file | Proves the moved bodies differ only in 10.2's import lines and 10.9's import line and one literal                                         | the extraction script of section 15 does the same; all four equal                                               |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged                                                                                 | Writes Git objects; `service-kinds.test.ts` needs the staged tree                                                                         | slices 1, 2 and 3: `366` tests over 25 files, exit 0                                                            |
| `(cd apps/wbs/be-01 && bun test)` (the whole `wbs-be-01:test` command, without coverage)                                                                                                                     | Opens SQLite databases and spawns processes as a whole target                                                                             | `1090 pass`, `1 skip` over 91 files at `2ae5cfde`; `1097 pass`, `1 skip` over 92 at slice 3                     |
| `apps/wiki/cli` `trusted-policy.test.ts`, `relocation-activation.test.ts` and `committed-target-facts.test.ts` together                                                                                      | They read `relationships.json`                                                                                                            | `88 pass`, `0 fail` at slice 3                                                                                  |
| `check-indexes committed` on slices 1 and 3                                                                                                                                                                  | Index validation, not MOD-LAYOUT                                                                                                          | slice 3: 16 indexes, both new modules with six members each, no review debt                                     |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                                                                                                                                                         | Playwright; no browser in the sandbox                                                                                                     | **not run**; the portable bundle does not import Plan document                                                  |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test` and `:test:package`                                                                                                                                     | Whole listener suite; package suite listens                                                                                               | **not run** (only the pilot, target-facts, trusted-policy and relocation files were run)                        |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the whole file                                                                                                                         | Its `production index checker resolves current Markdown links` test spawns `check-indexes working` (`git add --update`, `git write-tree`) | **pending planner verification**; the author observed `15 pass`, `0 fail` on the slice-3 tree outside a sandbox |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                                   | Host-wide heavy lock                                                                                                                      | **not run**                                                                                                     |
| Rows 8, 9, 21 and 22's typecheck on the mutated `check.ts`                                                                                                                                                   | Still required of the executor                                                                                                            | exit 0 all four times in the author's rehearsal                                                                 |

This table supplements the batch-1 README's "Integration verification" matrix.

**Between slices 2 and 3** the Solver launcher directory holds a `.repository.ts` file and a README
with no `module-index` block, which the Burokrat rule model's `MOD-LAYOUT` observation reports as
"module directory declares no wiki index". Packet E5 had the same one-commit gap; nothing gates on
it, and slice 3 closes it.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What the next 040.6 packets should be

1. **Task 1.5 with Optimization (3.6).** Create the Optimization module's `contract.ts` with the
   spawn and child types made neutral (no `@wbs/store-sqlite` row types, no reference to
   `solver-child-lifecycle.ts`), then seal the Supervisor as `module.backend.supervisor` exporting
   the adapted `ReservedSpawner`, with `solver-supervisor-spawner.ts` private to it and its
   `kinds.json` row amended to adapter-private support. That closes task 4.2.
2. **Plan document's construction into composition.** Make `planDocuments` a composition export and
   pass it to `projectRoutes` in place of `directory`, `calendarMarkers` and `clock`; that changes
   `AppOptions` and the 21 be-01 files that name it, so it needs its own packet (K2, task 7.4).
3. **A be-01 boundary check.** be-01's first module has no machine-checked K5 rule; the Optimization
   module is where task 1.6 puts one.

## 10. Exact content

### 10.1 `libs/wbs/application/core/src/module/plan-document/module.test.ts` (slice 1 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import type { CalendarMarkerReader } from '../../ports/calendar-marker-read';
import type { CalendarMarker } from '../../ports/calendar-marker-store';
import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanDocument } from './check';
import { PLAN_DOCUMENT_LABEL } from './contract';
import { planDocumentModule } from './module';

const EXPORTED_AT = Date.parse('2026-09-24T09:00:00.000Z');

/**
 * One memory source holding a project, and the requirements that export it:
 * the directory store, a marker read answering one marker, and a fixed clock.
 *
 * The marker read is a stub rather than the Calendar marker resource on
 * purpose: `ports/sideways-type-boundaries.test.ts` refuses any file of this
 * module that reaches `service/calendar-marker.service.ts`, tests included.
 */
async function seeded() {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => EXPORTED_AT, newId: () => `id-${String(++next)}` });
  const services = servicesOver(source.stores, {
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const { project } = await services.projects.create('Plan', 'owner');
  const tree = await services.workItems.tree(project.id);
  if (tree === null || 'kind' in tree) throw new Error('the seeded project has no tree');
  const marker: CalendarMarker = {
    id: 'marker-1',
    projectId: project.id,
    date: '2026-09-30',
    name: 'Launch',
    color: null,
    createdAt: EXPORTED_AT,
  };
  const markers: CalendarMarkerReader = {
    list: (projectId) =>
      Promise.resolve(
        projectId === project.id
          ? { ok: true, value: [marker] }
          : { ok: false, reason: 'not_found', about: 'project' },
      ),
  };
  return { project, tree, requirements: { directory: source.stores.directory, markers, clock } };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    directory: DiBag.fromSyncFactory(() => source.stores.directory),
    markers: DiBag.fromSyncFactory(() => ({
      list: () => Promise.resolve({ ok: true as const, value: [] }),
    })),
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
    .installModule(planDocumentModule)
    .register({ ...hostRequirements(), clock: DiBag.fromSyncFactory(() => ({ now: () => 0 })) })
    .build();

describe('the Plan document module', () => {
  it('exports a project with its markers over the graph installPlanDocument wires', async () => {
    const { project, tree, requirements } = await seeded();
    const { planDocuments } = installPlanDocument(requirements);

    const exported = await planDocuments.export(project, tree);

    expect(exported.document).toEqual({
      format: 'wbs-plan',
      version: 1,
      exportedAt: '2026-09-24T09:00:00.000Z',
    });
    expect(exported.calendarMarkers).toEqual([
      { id: 'marker-1', date: '2026-09-30', name: 'Launch', color: null },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `PlanDocumentExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installPlanDocument(requirements);

    expect(Object.keys(exposed)).toEqual(['planDocuments']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('planDocumentOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "planDocumentOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PLAN_DOCUMENT_LABEL}/planDocumentOptions`,
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
      .installModule(planDocumentModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('planDocuments')).toThrow(
      `Cannot resolve "${PLAN_DOCUMENT_LABEL}/planDocumentOptions": dependency "clock" is not registered. Resolution path: planDocuments -> ${PLAN_DOCUMENT_LABEL}/planDocumentOptions -> clock.`,
    );
  });
});
```

### 10.2 Import lines of the two moved Plan document files (slice 1 step 2 — applied after the `cp`/`mv`)

```diff
diff --git a/libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts b/libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts
--- a/libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts
+++ b/libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts
@@ -7,11 +7,15 @@
   type WorkItemTree,
 } from '@wbs/contracts';

-import type { CalendarMarkerReader } from '../ports/calendar-marker-read';
-import type { Clock } from '../ports/clock';
-import type { DirectoryStore, PersonWithTeams, TeamWithServices } from '../ports/directory-store';
-import type { Project } from '../ports/project-store';
-import type { ExternalSystem, Service, Tag, WorkItemType } from '../ports/work-item-store';
+import type { CalendarMarkerReader } from '../../ports/calendar-marker-read';
+import type { Clock } from '../../ports/clock';
+import type {
+  DirectoryStore,
+  PersonWithTeams,
+  TeamWithServices,
+} from '../../ports/directory-store';
+import type { Project } from '../../ports/project-store';
+import type { ExternalSystem, Service, Tag, WorkItemType } from '../../ports/work-item-store';

 type PlanDirectory = Pick<
   DirectoryStore,
diff --git a/libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts b/libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts
--- a/libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts
+++ b/libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts
@@ -1,8 +1,8 @@
 import { planDocumentResponse, validateSchema, type WorkItemTree } from '@wbs/contracts';
 import { expect, test } from 'bun:test';

-import type { CalendarMarker, DirectoryStore, Project } from '../index';
-import { classifyPlanDocument, PlanDocumentService } from './plan-document';
+import type { CalendarMarker, DirectoryStore, Project } from '../../index';
+import { classifyPlanDocument, PlanDocumentService } from './plan-document.resource';

 const PROJECT: Project = {
   id: 'project-1',
```

### 10.3 The Plan document compatibility shim (slice 1 step 2 — full replacement content)

`libs/wbs/application/core/src/service/plan-document.ts`:

```ts
/**
 * Compatibility re-export: Plan document moved into its own sealed module.
 *
 * Kept because `http/import.routes.ts`, `testing/import-service-source-contract.ts`
 * and `ports/sideways-type-boundaries.test.ts`'s fifth row name this path and
 * `@wbs/core`'s barrel still deep-imports it. It goes when every importer names
 * the module.
 */
export * from '../module/plan-document/plan-document.resource';
```

### 10.4 `contract.ts`, `module.ts`, `check.ts`, `README.md` of Plan document (slice 1 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type { PlanDocumentService, PlanDocumentServiceOptions } from './plan-document.resource';

/**
 * What a host must supply to install {@link planDocumentModule}.
 *
 * Exactly {@link PlanDocumentServiceOptions}, unchanged by the move: the six
 * directory list reads, the owner-neutral marker read and the clock.
 *
 * **No K3 debt; K2 debt disclosed.** Plan document is a resource, so the
 * direction rule that binds it is K4, not K3: it reads the `DirectoryStore`
 * repository port and the neutral `CalendarMarkerReader`, never another
 * resource's file, and `ports/sideways-type-boundaries.test.ts` watches the
 * Calendar marker half. What this extraction does not close is delivery's
 * side: `http/project.routes.ts` still installs the module itself and hands it
 * the Calendar marker and Directory resources, a direct resource dependency
 * of delivery (K2) the backend module map lists under its composition
 * hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type PlanDocumentRequirements = PlanDocumentServiceOptions;

/** What installing {@link planDocumentModule} adds to a host graph. */
export interface PlanDocumentExports {
  readonly planDocuments: PlanDocumentService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.plan-document` and the label drops
 * the `module.` prefix.
 */
export const PLAN_DOCUMENT_LABEL = 'application.plan-document';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { CalendarMarkerReader } from '../../ports/calendar-marker-read';
import type { Clock } from '../../ports/clock';
import { PLAN_DOCUMENT_LABEL } from './contract';
import { PlanDocumentService, type PlanDocumentServiceOptions } from './plan-document.resource';

/**
 * Plan document as a sealed DI Bag module.
 *
 * Only `planDocuments` is exported. `planDocumentOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.plan-document/planDocumentOptions` rather
 * than against an anonymous binding.
 *
 * The module registers no disposer: `PlanDocumentService` holds borrowed
 * reads and a clock and no timer, socket or handle of its own.
 */
export const planDocumentModule = DiBag.createBuilder()
  .register({
    planDocumentOptions: DiBag.fromSyncFactory(
      ({
        directory,
        markers,
        clock,
      }: {
        directory: PlanDocumentServiceOptions['directory'];
        markers: CalendarMarkerReader;
        clock: Pick<Clock, 'now'>;
      }): PlanDocumentServiceOptions => ({ directory, markers, clock }),
    ),
  })
  .register({
    planDocuments: DiBag.fromSyncFactory(
      ({
        planDocumentOptions,
      }: {
        planDocumentOptions: PlanDocumentServiceOptions;
      }): PlanDocumentService => new PlanDocumentService(planDocumentOptions),
    ),
  })
  .buildModule(['planDocuments'], { label: PLAN_DOCUMENT_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { PlanDocumentExports, PlanDocumentRequirements } from './contract';
import { planDocumentModule } from './module';

/**
 * Installs {@link planDocumentModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan document can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanDocumentExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanDocument(requirements: PlanDocumentRequirements): PlanDocumentExports {
  const bag = DiBag.createBuilder()
    .installModule(planDocumentModule)
    .register({
      directory: DiBag.fromSyncFactory(() => requirements.directory),
      markers: DiBag.fromSyncFactory(() => requirements.markers),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  return { planDocuments: bag.resolve('planDocuments') };
}
```

`README.md` (final; the module is not registered, section 3):

```md
# Plan document

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-document","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-document.resource.test.ts"},{"kind":"path","path":"plan-document.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading project.routes.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The complete-directory-closure and version-header-first invariants are documented on PlanDocumentService and classifyPlanDocument; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/http/project.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/plan-document.ts"}],"knowledgeLimit":"Only the one installer call site, the core barrel and the compatibility shim are declared; import.routes.ts, the import source-contract fixture and the be-01 boundary tests reach this module through the shim or the barrel and are not tracked here."}} -->

The first sealed resource module in the core, following the six feature modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the directory reads, the owner-neutral marker read and the clock a host must supply.

`plan-document.resource.ts` (the moved `service/plan-document.ts`) builds the versioned archival
document around a project tree, naming every directory row the tree references, and classifies an
incoming document by its version header before validating it. Private bindings are named under the
`application.plan-document` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/http/project.routes.ts` installs the module once per route set, over
the Directory and Calendar marker resources it is handed; `libs/wbs/application/core/src/index.ts`
and `libs/wbs/application/core/src/service/plan-document.ts` keep the former `@wbs/core` deep-import
names.

## Wiki registration

Not a member of `docs/wiki-policy/modules.json`'s content-review pilot, for the reason Plan import
is not: every pilot boundary under this namespaced tree binds a predecessor that existed at the
pilot's frozen `sourceRevision`, and `plan-document.ts` was introduced after it, so no
`sourceSelector` can yield a baseline entry. This directory still declares the module layout the
Burokrat rule model requires independently of the pilot: this `module-index` block and
`contract.ts`.
```

### 10.5 `project.routes.ts`, `index.ts` and `kinds.json` (slice 1 step 5)

```diff
diff --git a/libs/wbs/application/core/src/http/project.routes.ts b/libs/wbs/application/core/src/http/project.routes.ts
--- a/libs/wbs/application/core/src/http/project.routes.ts
+++ b/libs/wbs/application/core/src/http/project.routes.ts
@@ -10,12 +10,12 @@
 import type { SolverObjectiveName } from '@wbs/domain';
 import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

+import { installPlanDocument } from '../module/plan-document/check';
 import type { Clock } from '../ports/clock';
 import type { Project } from '../ports/project-store';
 import type { OptimizationVariantState } from '../ports/scheduler';
 import type { CalendarMarkerService } from '../service/calendar-marker.service';
 import type { DirectoryService } from '../service/directory.service';
-import { PlanDocumentService } from '../service/plan-document';
 import { canEdit, type ProjectService } from '../service/project.service';
 import type { WorkItemService } from '../service/work-item.service';
 import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
@@ -117,7 +117,7 @@
   clock: Pick<Clock, 'now'>,
   optimizer?: OptimizationRetry,
 ) {
-  const planDocuments = new PlanDocumentService({ directory, markers: calendarMarkers, clock });
+  const { planDocuments } = installPlanDocument({ directory, markers: calendarMarkers, clock });
   return [
     bind(
       createProject,
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -20,6 +20,8 @@
 export * from './module/authentication/module';
 export * from './module/bounded-replay-sweep/contract';
 export * from './module/bounded-replay-sweep/module';
+export * from './module/plan-document/contract';
+export * from './module/plan-document/module';
 export * from './module/plan-history/contract';
 export * from './module/plan-history/module';
 export * from './module/plan-import/contract';
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -344,9 +344,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/plan-document.ts",
-      "kind": "resource",
-      "term": "plan document",
-      "rationale": "project and import routes call it for plan document export and classification rules over DirectoryStore, CalendarMarkerService and Clock-backed document metadata"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-document module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/prepare-import.ts",
```

### 10.6 The sideways row (slice 1 step 6)

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -139,6 +139,13 @@
  * Proof (2026-09-23): independently prepending `import '../../http/endpoint';` to the same
  * file failed this suite with exactly one violation, `"module/saved-plans/save-plan.ts:
  * '../../http/endpoint' reaches http/endpoint.ts"` (0 pass, 1 fail).
+ *
+ * The eighteenth row is the fifth row re-scoped to the Plan document module's
+ * own directory once `plan-document.ts` moved to
+ * `module/plan-document/plan-document.resource.ts`: the fifth row's
+ * `path === 'service/plan-document.ts'` now names only the compatibility shim,
+ * so the moved resource, and every other file of its module, would otherwise
+ * be free to read markers through the Calendar marker resource again.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -203,6 +210,10 @@
     reaches: 'http/endpoint.ts',
     from: (path: string) => path.startsWith('module/saved-plans/'),
   },
+  {
+    reaches: 'service/calendar-marker.service.ts',
+    from: (path: string) => path.startsWith('module/plan-document/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.7 Slice 1's Proof comments (slice 1 step 9 — only after rows 5-10 were observed)

```diff
diff --git a/libs/wbs/application/core/src/module/plan-document/module.ts b/libs/wbs/application/core/src/module/plan-document/module.ts
--- a/libs/wbs/application/core/src/module/plan-document/module.ts
+++ b/libs/wbs/application/core/src/module/plan-document/module.ts
@@ -28,6 +28,9 @@
         directory: PlanDocumentServiceOptions['directory'];
         markers: CalendarMarkerReader;
         clock: Pick<Clock, 'now'>;
+        // Proof (2026-09-24): handing the feature `clock: { now: () => 0 }` instead of the supplied
+        // clock left `exports a project with its markers over the graph installPlanDocument wires`
+        // failing (4 pass, 1 fail): `exportedAt` read "1970-01-01T00:00:00.000Z".
       }): PlanDocumentServiceOptions => ({ directory, markers, clock }),
     ),
   })
@@ -40,4 +43,12 @@
       }): PlanDocumentService => new PlanDocumentService(planDocumentOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['planDocuments', 'planDocumentOptions']` left
+  // the private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('planDocumentOptions')` did not throw, `inspectGraph()` reported bare
+  // `planDocumentOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: PLAN_DOCUMENT_LABEL }` left only the two label
+  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `planDocumentOptions`
+  // unlabelled, and the missing-requirement message named `planDocumentOptions` instead of
+  // `application.plan-document/planDocumentOptions`.
   .buildModule(['planDocuments'], { label: PLAN_DOCUMENT_LABEL });
diff --git a/libs/wbs/application/core/src/module/plan-document/check.ts b/libs/wbs/application/core/src/module/plan-document/check.ts
--- a/libs/wbs/application/core/src/module/plan-document/check.ts
+++ b/libs/wbs/application/core/src/module/plan-document/check.ts
@@ -22,5 +22,11 @@
       clock: DiBag.fromSyncFactory(() => requirements.clock),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `PlanDocumentService` kept the key
+  // list correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { planDocuments: bag.resolve('planDocuments') };
 }
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -146,6 +146,13 @@
  * `path === 'service/plan-document.ts'` now names only the compatibility shim,
  * so the moved resource, and every other file of its module, would otherwise
  * be free to read markers through the Calendar marker resource again.
+ *
+ * Proof (2026-09-24): prepending the bare import
+ * `import '../../service/calendar-marker.service';` to
+ * `module/plan-document/plan-document.resource.ts` failed this suite with exactly one
+ * violation, `"module/plan-document/plan-document.resource.ts:
+ * '../../service/calendar-marker.service' reaches service/calendar-marker.service.ts"`
+ * (0 pass, 1 fail); with this row deleted the same import left the suite passing (1 pass).
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
```

### 10.8 `apps/wbs/be-01/src/module/solver-launcher/module.test.ts` (slice 2 step 1)

```ts
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installSolverLauncher } from './check';
import { SOLVER_LAUNCHER_LABEL } from './contract';
import { solverLauncherModule } from './module';
import type {
  SolverLauncherProcess,
  SolverLauncherSpawnOptions,
  SolverVersionProbe,
} from './solver-launcher.repository';

/** A probe that answers one fixed version and records every command it was asked to run. */
function recordingProbe(version: string): { probe: SolverVersionProbe; commands: string[][] } {
  const commands: string[][] = [];
  return {
    commands,
    probe: (command) => {
      commands.push([...command]);
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(`${version}\n`),
        stderr: new Uint8Array(),
      };
    },
  };
}

const fakeProcess: SolverLauncherProcess = {
  pid: 42,
  stdin: { write: () => undefined, end: () => undefined },
  stdout: new ReadableStream<Uint8Array>(),
  stderr: new ReadableStream<Uint8Array>(),
  exited: Promise.resolve(0),
  kill: () => undefined,
};

const hostRequirements = () => ({
  probe: DiBag.fromSyncFactory(() => recordingProbe('9.9.9').probe),
});

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
    .installModule(solverLauncherModule)
    .register({ ...hostRequirements(), spawn: DiBag.fromSyncFactory(() => () => fakeProcess) })
    .build();

describe('the Solver launcher module', () => {
  it('reads the installed version through the probe installSolverLauncher wires', () => {
    const { probe, commands } = recordingProbe('9.9.9');
    const { solverLauncher } = installSolverLauncher({ probe });

    expect(solverLauncher.readInstalledVersion()).toBe('9.9.9');
    expect(solverLauncher.readRuntimeVersion('production')).toBe('9.9.9');
    expect(commands).toEqual([
      ['wbs-solver-launcher', '--version'],
      ['wbs-solver-launcher', '--version'],
    ]);
  });

  /**
   * The moved file resolves the solver's source module relative to its own
   * location, so the move is exactly what could break this read. The probe
   * throws, so a version can only come from that source module; the expected
   * value is a shape rather than the literal, because a literal path read here
   * would be a second outside read `wbs-be-01:test` does not declare.
   */
  it('reads the development version from the solver source module', () => {
    const { solverLauncher } = installSolverLauncher({
      probe: () => {
        throw new Error('the installed launcher must not run in source development');
      },
    });

    expect(solverLauncher.readRuntimeVersion('development')).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('spawns the launcher through the process seam installSolverLauncher wires', () => {
    const calls: SolverLauncherSpawnOptions[] = [];
    const { solverLauncher } = installSolverLauncher({
      spawn: (options) => {
        calls.push(options);
        return fakeProcess;
      },
    });

    const child = solverLauncher.spawn({
      attemptToken: 'attempt-1',
      childDeadlineAt: 12_345,
      searchWorkers: 2,
      memoryLimitMb: 512,
      request: { wireVersion: 1 },
    });

    expect(child.pid).toBe(42);
    expect(calls.map((options) => options.cmd[0])).toEqual(['wbs-solver-launcher']);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `SolverLauncherExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installSolverLauncher({});

    expect(Object.keys(exposed)).toEqual(['solverLauncher']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('launcherSeams'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "launcherSeams" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${SOLVER_LAUNCHER_LABEL}/launcherSeams`,
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
      .installModule(solverLauncherModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('solverLauncher')).toThrow(
      `Cannot resolve "${SOLVER_LAUNCHER_LABEL}/launcherSeams": dependency "spawn" is not registered. Resolution path: solverLauncher -> ${SOLVER_LAUNCHER_LABEL}/launcherSeams -> spawn.`,
    );
  });
});
```

### 10.9 The two moved Solver launcher files (slice 2 step 2 — applied after the `cp`/`mv`)

```diff
diff --git a/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.ts b/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.ts
@@ -64,7 +64,7 @@
     sourceModule ??
     readFileSync(
       new URL(
-        '../../../../../libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py',
+        '../../../../../../libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py',
         import.meta.url,
       ),
       'utf8',
diff --git a/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.test.ts b/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.test.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.test.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/solver-launcher.repository.test.ts
@@ -6,7 +6,7 @@
   type SolverLauncherProcess,
   type SolverLauncherSpawnOptions,
   spawnSolverLauncher,
-} from './solver-launcher-process';
+} from './solver-launcher.repository';

 interface Harness {
   readonly calls: SolverLauncherSpawnOptions[];
```

### 10.10 The Solver launcher compatibility shim (slice 2 step 2 — full replacement content)

`apps/wbs/be-01/src/service/solver-launcher-process.ts`:

```ts
/**
 * Compatibility re-export: the Solver launcher moved into its own sealed module.
 *
 * Kept because `dev/local-solver-spawner.ts`, `services.db.test.ts` and
 * `service/solver-child-lifecycle.db.test.ts` import this path. It goes when
 * every importer names the module.
 */
export * from '../module/solver-launcher/solver-launcher.repository';
```

### 10.11 `contract.ts`, `module.ts`, `check.ts`, slice-2 `README.md` of the Solver launcher (slice 2 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type {
  SolverLauncherRequest,
  SolverLauncherSpawn,
  SolverVersionProbe,
  SpawnedSolverLauncher,
} from './solver-launcher.repository';

/**
 * What a host may supply to install {@link solverLauncherModule}: the two
 * process seams the moved functions already take as parameters.
 *
 * Both are optional, and an absent seam is registered as `undefined`, so the
 * moved functions fall back to their own Bun defaults — `Bun.spawnSync` for the
 * version probe and `Bun.spawn` for the launcher — exactly as their direct
 * callers get today. The source-module read of `readRuntimeSolverVersion` is
 * not a requirement: no caller outside the moved file's own tests supplies it.
 *
 * **No K3 or K5 debt.** This is a repository adapter: it imports `node:fs`,
 * `di-bag` and its own files, nothing above it. be-01 has no type-identity
 * boundary check that would prove it (task 1.6's note), so this is a reading,
 * not a watched rule.
 */
export interface SolverLauncherRequirements {
  readonly probe?: SolverVersionProbe;
  readonly spawn?: SolverLauncherSpawn;
}

/** The launcher boundary one installation hands out, over that installation's seams. */
export interface SolverLauncher {
  /** `readInstalledSolverVersion` over the installed probe. */
  readonly readInstalledVersion: () => string;
  /** `readRuntimeSolverVersion` over the installed probe and the real solver source module. */
  readonly readRuntimeVersion: (nodeEnv: string | undefined) => string;
  /** `spawnSolverLauncher` over the installed process seam. */
  readonly spawn: (request: SolverLauncherRequest) => SpawnedSolverLauncher;
}

/** What installing {@link solverLauncherModule} adds to a host graph. */
export interface SolverLauncherExports {
  readonly solverLauncher: SolverLauncher;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The module lives under `apps/wbs/be-01`, so its wiki module identifier
 * carries the runtime word, `module.backend.solver-launcher`, and the label
 * drops the `module.` prefix.
 */
export const SOLVER_LAUNCHER_LABEL = 'backend.solver-launcher';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import {
  SOLVER_LAUNCHER_LABEL,
  type SolverLauncher,
  type SolverLauncherRequirements,
} from './contract';
import {
  readInstalledSolverVersion,
  readRuntimeSolverVersion,
  type SolverLauncherSpawn,
  type SolverVersionProbe,
  spawnSolverLauncher,
} from './solver-launcher.repository';

/**
 * The Solver launcher as a sealed DI Bag module.
 *
 * Only `solverLauncher` is exported. `launcherSeams` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `backend.solver-launcher/launcherSeams` rather than
 * against an anonymous binding. Both seams are registered even when absent,
 * as `undefined`, the way Saved plans registers its optional quota.
 *
 * The module registers no disposer: it holds two borrowed seams and no
 * process. A spawned launcher belongs to its caller, whose lifecycle drains
 * and kills it.
 */
export const solverLauncherModule = DiBag.createBuilder()
  .register({
    launcherSeams: DiBag.fromSyncFactory(
      ({
        probe,
        spawn,
      }: {
        probe: SolverVersionProbe | undefined;
        spawn: SolverLauncherSpawn | undefined;
      }): SolverLauncherRequirements => ({ probe, spawn }),
    ),
  })
  .register({
    solverLauncher: DiBag.fromSyncFactory(
      ({ launcherSeams }: { launcherSeams: SolverLauncherRequirements }): SolverLauncher => ({
        readInstalledVersion: () => readInstalledSolverVersion(launcherSeams.probe),
        readRuntimeVersion: (nodeEnv) =>
          readRuntimeSolverVersion(nodeEnv, undefined, launcherSeams.probe),
        spawn: (request) => spawnSolverLauncher(request, launcherSeams.spawn),
      }),
    ),
  })
  .buildModule(['solverLauncher'], { label: SOLVER_LAUNCHER_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { SolverLauncherExports, SolverLauncherRequirements } from './contract';
import { solverLauncherModule } from './module';

/**
 * Installs {@link solverLauncherModule} over supplied seams and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of the Solver
 * launcher can reach a private binding or a host key through it. The type
 * checker does not enforce that on its own: an object with an extra property
 * returned through a variable still satisfies {@link SolverLauncherExports},
 * so the module's tests enumerate what this function returns.
 */
export function installSolverLauncher(
  requirements: SolverLauncherRequirements,
): SolverLauncherExports {
  const bag = DiBag.createBuilder()
    .installModule(solverLauncherModule)
    .register({
      probe: DiBag.fromSyncFactory(() => requirements.probe),
      spawn: DiBag.fromSyncFactory(() => requirements.spawn),
    })
    .build();
  return { solverLauncher: bag.resolve('solverLauncher') };
}
```

`README.md`:

```md
# Solver launcher

The first sealed DI Bag module under `apps/wbs/be-01`, following the core modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the two optional process seams a host may supply.

`solver-launcher.repository.ts` (the moved `service/solver-launcher-process.ts`) reads the installed
`wbs-solver-launcher` version, reads the source module's version in the source-run development
container, and spawns the launcher child with its one-byte verdict transport. Private bindings are
named under the `backend.solver-launcher` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.

## Consumers

`apps/wbs/be-01/src/main.ts` and `apps/wbs/be-01/src/dev/main.ts` install the module to read the
solver version; `apps/wbs/be-01/src/service/solver-launcher-process.ts` keeps the former path for
`dev/local-solver-spawner.ts`, `services.db.test.ts` and `solver-child-lifecycle.db.test.ts`.
```

### 10.12 `main.ts`, `dev/main.ts` and `kinds.json` (slice 2 step 5)

```diff
diff --git a/apps/wbs/be-01/src/main.ts b/apps/wbs/be-01/src/main.ts
--- a/apps/wbs/be-01/src/main.ts
+++ b/apps/wbs/be-01/src/main.ts
@@ -3,7 +3,7 @@
 import { bootBe01 } from './boot';
 import { loadConfig } from './config';
 import { oidcRouteOptionsFromEnv } from './controller/oidc-options';
-import { readRuntimeSolverVersion } from './service/solver-launcher-process';
+import { installSolverLauncher } from './module/solver-launcher/check';
 import { solverSupervisorSpawner } from './service/solver-supervisor-spawner';

 const cfg = loadConfig();
@@ -19,7 +19,8 @@
 // Local dev opts in through `apps/wbs/be-01/.env`.
 let running;
 try {
-  const solverVersion = readRuntimeSolverVersion(process.env.NODE_ENV);
+  const { solverLauncher } = installSolverLauncher({});
+  const solverVersion = solverLauncher.readRuntimeVersion(process.env.NODE_ENV);
   const callerId = process.env['HOSTNAME'];
   if (callerId === undefined || callerId.length === 0) {
     throw new Error('HOSTNAME is required for solver supervisor authentication');
diff --git a/apps/wbs/be-01/src/dev/main.ts b/apps/wbs/be-01/src/dev/main.ts
--- a/apps/wbs/be-01/src/dev/main.ts
+++ b/apps/wbs/be-01/src/dev/main.ts
@@ -16,7 +16,7 @@
 import { bootBe01 } from '../boot';
 import { loadConfig } from '../config';
 import { oidcRouteOptionsFromEnv } from '../controller/oidc-options';
-import { readRuntimeSolverVersion } from '../service/solver-launcher-process';
+import { installSolverLauncher } from '../module/solver-launcher/check';
 import {
   createLocalSolverSpawner,
   localSolverCapabilities,
@@ -61,7 +61,9 @@
     version: process.env['VERSION'],
     migrateOnStartup: process.env['MIGRATE_ON_STARTUP'] === 'true',
     optimizer: {
-      solverVersion: readRuntimeSolverVersion(process.env.NODE_ENV),
+      solverVersion: installSolverLauncher({}).solverLauncher.readRuntimeVersion(
+        process.env.NODE_ENV,
+      ),
       budgetMs: cfg.SOLVER_BUDGET_MS,
       spawn: createLocalSolverSpawner({
         binDirectory,
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -193,8 +193,8 @@
     },
     {
       "path": "apps/wbs/be-01/src/service/solver-launcher-process.ts",
-      "kind": "repository",
-      "rationale": "the local solver spawner and backend entrypoints use it to probe the installed solver and spawn the wbs-solver-launcher child process behind injected process boundaries"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use the solver-launcher module directly"
     },
     {
       "path": "apps/wbs/be-01/src/service/solver-request-pair.ts",
```

### 10.13 Slice 2's Proof comments (slice 2 step 8 — only after rows 18-23 were observed)

```diff
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.ts b/apps/wbs/be-01/src/module/solver-launcher/module.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/module.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.ts
@@ -42,6 +42,10 @@
   .register({
     solverLauncher: DiBag.fromSyncFactory(
       ({ launcherSeams }: { launcherSeams: SolverLauncherRequirements }): SolverLauncher => ({
+        // Proof (2026-09-24): calling `readInstalledSolverVersion()` without the installed probe
+        // left `reads the installed version through the probe installSolverLauncher wires` failing
+        // (6 pass, 1 fail) on `Executable not found in $PATH: "wbs-solver-launcher"`: the Bun
+        // default ran instead of the supplied probe.
         readInstalledVersion: () => readInstalledSolverVersion(launcherSeams.probe),
         readRuntimeVersion: (nodeEnv) =>
           readRuntimeSolverVersion(nodeEnv, undefined, launcherSeams.probe),
@@ -49,4 +53,12 @@
       }),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['solverLauncher', 'launcherSeams']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (4 pass, 3 fail):
+  // `resolve('launcherSeams')` did not throw, `inspectGraph()` reported bare `launcherSeams`, and
+  // the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: SOLVER_LAUNCHER_LABEL }` left only the two label
+  // assertions failing (5 pass, 2 fail): `inspectGraph()` reported `launcherSeams` unlabelled, and
+  // the missing-requirement message named `launcherSeams` instead of
+  // `backend.solver-launcher/launcherSeams`.
   .buildModule(['solverLauncher'], { label: SOLVER_LAUNCHER_LABEL });
diff --git a/apps/wbs/be-01/src/module/solver-launcher/check.ts b/apps/wbs/be-01/src/module/solver-launcher/check.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/check.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/check.ts
@@ -23,5 +23,11 @@
       spawn: DiBag.fromSyncFactory(() => requirements.spawn),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (6 pass, 1 fail), with
+  // `wbs-be-01:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned launcher kept the key list correct but
+  // made the no-resolver assertion receive false (6 pass, 1 fail), with `wbs-be-01:typecheck` at
+  // exit 0.
   return { solverLauncher: bag.resolve('solverLauncher') };
 }
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.test.ts b/apps/wbs/be-01/src/module/solver-launcher/module.test.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/module.test.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.test.ts
@@ -72,6 +72,11 @@
    * throws, so a version can only come from that source module; the expected
    * value is a shape rather than the literal, because a literal path read here
    * would be a second outside read `wbs-be-01:test` does not declare.
+   *
+   * Proof (2026-09-24): keeping the moved file's pre-move five-level
+   * `new URL('../../../../../libs/…/__init__.py', import.meta.url)` failed this
+   * test (6 pass, 1 fail) on `ENOENT: no such file or directory, open
+   * '…/apps/libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py'`.
    */
   it('reads the development version from the solver source module', () => {
     const { solverLauncher } = installSolverLauncher({
```

### 10.14 Registration (slice 3 steps 1-4)

10.14a, `modules.json`:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -222,6 +222,27 @@
         ]
       }
     },
+    {
+      "moduleId": "module.backend.solver-launcher",
+      "name": "Solver launcher sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/be-01/src/module/solver-launcher",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/be-01/src/module/solver-launcher/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/be-01/src/dev/main.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/main.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/service/solver-launcher-process.ts" }
+        ]
+      }
+    },
     {
       "moduleId": "module.docs.wbs-table-extraction",
       "name": "Historical WbsTable extraction pilot boundary",
```

10.14b, `policy.json`:

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -973,6 +973,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.backend.solver-launcher",
+      "selector": {
+        "kind": "prefix",
+        "value": "apps/wbs/be-01/src/module/solver-launcher"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/be-01/src/service/solver-launcher-process.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "cb21f58d1daaa28e7e5159ef038c0a38c4cf190e",
+          "path": "apps/be-01/src/service/solver-launcher-process.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

10.14c, `relationships.json` (its `expectedConfiguration` is the real `wbs-be-01:test` target as Nx
resolves it; `committed-target-facts.test.ts` compares the two):

```diff
diff --git a/docs/wiki-policy/relationships.json b/docs/wiki-policy/relationships.json
--- a/docs/wiki-policy/relationships.json
+++ b/docs/wiki-policy/relationships.json
@@ -4,6 +4,34 @@
   "selectorVersion": 1,
   "coverage": "selected-facts-only",
   "facts": [
+    {
+      "factId": "check.be-01.test",
+      "family": "targets",
+      "at": {
+        "kind": "current"
+      },
+      "kind": "nx-target",
+      "project": "wbs-be-01",
+      "target": "test",
+      "expectedConfiguration": {
+        "cache": true,
+        "executor": "nx:run-commands",
+        "inputs": [
+          "default",
+          "^production",
+          "{workspaceRoot}/libs/wbs/domain/domain/src/schedule.ts",
+          "{workspaceRoot}/openspec/changes/dual-optimized-scheduler/design.md",
+          "{workspaceRoot}/tools/tool-remote-scripts/src/fixtures/solver-supervisor-orphan-host.ts"
+        ],
+        "options": {
+          "command": "bun test --coverage --coverage-reporter=lcov",
+          "cwd": "apps/wbs/be-01"
+        },
+        "outputs": ["{projectRoot}/coverage"],
+        "configurations": {},
+        "parallelism": true
+      }
+    },
     {
       "factId": "check.core.test",
       "family": "targets",
```

10.14d, `pilotPaths`:

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -45,6 +45,7 @@
   'libs/wbs/adapters/store-memory/src/README.md',
   'openspec/changes/archive/2026-09-08-bounded-replay-sweep/README.md',
   'tools/tool-dagger/src/lib/README.md',
+  'apps/wbs/be-01/src/module/solver-launcher/README.md',
   'apps/wiki/cli/README.md',
 ] as const;
 const scratch: string[] = [];
```

### 10.15 The final Solver launcher README (slice 3 step 4 — full content)

It names its predecessor by filename only: `tool-devsync`'s `LEGACY_ROOT` scan refuses a current
README that spells a pre-namespacing path.

```md
# Solver launcher

<!-- module-index {"schemaVersion":1,"moduleId":"module.backend.solver-launcher","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"solver-launcher.repository.test.ts"},{"kind":"path","path":"solver-launcher.repository.ts"}],"relationshipSelectors":[],"applicableChecks":["check.be-01.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading main.ts, dev/main.ts and the compatibility shim."},{"section":"invariants","reason":"The verdict-before-request stdin framing and the one-authority version read are documented on spawnSolverLauncher and readRuntimeSolverVersion; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/dev/main.ts"},{"kind":"path","path":"apps/wbs/be-01/src/main.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/solver-launcher-process.ts"}],"knowledgeLimit":"Only the two entrypoints and the compatibility shim are declared; the local solver spawner and the two database tests reach this module through the shim and are not tracked here."}} -->

The first sealed DI Bag module under `apps/wbs/be-01`, following the core modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the two optional process seams a host may supply.

`solver-launcher.repository.ts` (the moved `service/solver-launcher-process.ts`) reads the installed
`wbs-solver-launcher` version, reads the source module's version in the source-run development
container, and spawns the launcher child with its one-byte verdict transport. Private bindings are
named under the `backend.solver-launcher` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`,
recorded above as `check.be-01.test` and declared in `docs/wiki-policy/relationships.json`.

## Consumers

`apps/wbs/be-01/src/main.ts` and `apps/wbs/be-01/src/dev/main.ts` install the module to read the
solver version; `apps/wbs/be-01/src/service/solver-launcher-process.ts` keeps the former path for
`dev/local-solver-spawner.ts`, `services.db.test.ts` and `solver-child-lifecycle.db.test.ts`.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.backend.solver-launcher` (`docs/wiki-policy/policy.json`'s
`boundary.backend.solver-launcher`). The boundary's `sourceSelector` binds this directory to
`solver-launcher.repository.ts`'s own single pre-namespacing predecessor,
`solver-launcher-process.ts`, which existed at the pilot's frozen `sourceRevision` — the same
mechanism `boundary.application.saved-plans` uses for its `saved-plan.service.ts` predecessor. The
other files here have no separate baseline entry: the registration's guarantee is one predecessor
per module directory, not one per file it holds.
```

### 10.16 The prose-refusal pin (slice 3 step 5 — only after row 28)

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -572,10 +572,12 @@
     expect(invocation.exitCode, observed).toBe(1);
     // Proof: replacing every executable check with external-consumer prose was refused at
     // `apps/wiki/cli/README.md: check.wiki-cli.test (external-consumer)`. The refusal names the
-    // first offending index in path order, which moved from `docs/findings/README.md` to this
-    // one when tool-wiki became `apps/wiki/cli` (2026-09-16).
+    // first offending index in path order, which moved from `docs/findings/README.md` to that
+    // one when tool-wiki became `apps/wiki/cli` (2026-09-16), and from there to the Solver
+    // launcher's index when the first backend module registered `check.be-01.test`
+    // (2026-09-24).
     expect(observed).toContain(
-      'applicable check has no executable authority in apps/wiki/cli/README.md: check.wiki-cli.test (external-consumer)',
+      'applicable check has no executable authority in apps/wbs/be-01/src/module/solver-launcher/README.md: check.be-01.test (external-consumer)',
     );
   }, 120_000);

```

### 10.17 Legacy re-pin (slice 3 step 6 — the numbers only after the red, the Proof after the green)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 49,
+      'historical policy selector or baseline': 51,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -822,8 +822,8 @@
     // naming the pre-move `libs/core/src/service/saved-plan.service.ts` this module was extracted
     // from; raised `historical policy selector or baseline` from 47 to 49 and occurrences from 265
     // to 267, no unclassified entries (2026-09-23).
-    digest: '86721c9c2457e04146bd4db56db16869936be5a012fddc671bf2e39989c23d0f',
-    occurrences: 267,
+    digest: '113681cd7a2c98566f565cca8176456eb50fb453b6fb94ce5bf3f611a0d576bb',
+    occurrences: 269,
     unclassified: [],
   });
 });
```

Then:

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -822,6 +822,11 @@
     // naming the pre-move `libs/core/src/service/saved-plan.service.ts` this module was extracted
     // from; raised `historical policy selector or baseline` from 47 to 49 and occurrences from 265
     // to 267, no unclassified entries (2026-09-23).
+    // Proof: registering `module.backend.solver-launcher` added its
+    // `boundary.backend.solver-launcher`'s `sourceSelector` and one `baselineEntries` path, both
+    // naming the pre-namespacing `apps/be-01/src/service/solver-launcher-process.ts` this module
+    // was extracted from; raised `historical policy selector or baseline` from 49 to 51 and
+    // occurrences from 267 to 269, no unclassified entries (2026-09-24).
     digest: '113681cd7a2c98566f565cca8176456eb50fb453b6fb94ce5bf3f611a0d576bb',
     occurrences: 269,
     unclassified: [],
```

### 10.18 Task records (slice 3 step 7)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -128,9 +128,35 @@

 ## 4. Plan document and the adapter-side modules

-- [ ] 4.1 Plan document as a resource module over the neutral marker read port from 1.3.
+- [x] 4.1 Plan document as a resource module over the neutral marker read port from 1.3. Landed
+      2026-09-24 as `libs/wbs/application/core/src/module/plan-document/`, with
+      `service/plan-document.ts` kept as a compatibility re-export shim, its `kinds.json` row
+      rewritten in place (93 entries, unchanged) and `plan-document.test.ts` moved beside it.
+      `http/project.routes.ts` installs it through `installPlanDocument` where it used to construct
+      `PlanDocumentService`; moving that construction into composition, the map's delivery
+      hazard, is K2 debt tracked under 7.4, not done here. `ports/sideways-type-boundaries.test.ts`
+      carries a module-directory row beside the shim's own. Proof: the module's own tests;
+      negatives for the installer leaking its bag, its resolver leaking through the returned
+      `PlanDocumentService`, the private `planDocumentOptions` binding exported, the label
+      dropped, the supplied clock replaced, and the moved resource importing the Calendar marker
+      service. Wiki registration (7.5) is not landed for this module; see 7.5's own note below.
 - [ ] 4.2 Local solver launcher as a standalone repository module; Supervisor as a repository
-      module with the request/attempt mapper private to it.
+      module with the request/attempt mapper private to it. Local solver launcher landed
+      2026-09-24 as `apps/wbs/be-01/src/module/solver-launcher/`, identified
+      `module.backend.solver-launcher` rather than `local-solver-launcher` because
+      `apps/wbs/be-01/src/production-entrypoint.test.ts` refuses any `local-solver` string in the
+      production bundle and `main.ts` reads the solver version through this module.
+      `service/solver-launcher-process.ts` is a compatibility re-export shim and its `kinds.json`
+      row is rewritten in place (93 entries, unchanged). Proof: the module's own tests; negatives
+      for the installer leaking its bag, its resolver leaking through the returned launcher, the
+      private `launcherSeams` binding exported, the label dropped, the supplied probe bypassed,
+      and the moved file keeping its pre-move source-module depth. **Supervisor is not landed, so
+      not ticked:** `solver-supervisor-spawner.ts`, the mapper that would become its private
+      support, imports `ReservedSpawner` and `ReservedSolverChild` from
+      `optimization-coordinator.ts`, the Optimization feature, which a repository module may not
+      do (K5). Task 1.5 moves those types into the Optimization contract, which does not exist
+      before 3.6, and they still name `@wbs/store-sqlite`'s `SpawnRequest` and
+      `SolverSlotAdmission` and Optimization's private `SolverChildProcess`.

 ## 5. The per-admission modules

@@ -213,6 +239,16 @@
       alone — the file `kinds.json` classified as the Saved plans feature before the move.
       `save-plan.ts`, `saved-plan-integrity.ts` and `saved-plan-schedule.ts` have no separate
       baseline entry, for the same reason.
+      Landed again 2026-09-24 for the Solver launcher, the first backend module, as
+      `apps/wbs/be-01/src/module/solver-launcher/README.md`, `docs/wiki-policy/modules.json`'s
+      `module.backend.solver-launcher` row and `docs/wiki-policy/policy.json`'s
+      `boundary.backend.solver-launcher`, using a `sourceSelector` bound to the pre-namespacing
+      `apps/be-01/src/service/solver-launcher-process.ts` alone. Its index names
+      `check.be-01.test`, a new `docs/wiki-policy/relationships.json` fact for `wbs-be-01:test`,
+      because the pilot requires every index to name an applicable check.
+      **Not landed for Plan document (task 4.1)**, for Plan import's reason below:
+      `libs/core/src/service/plan-document.ts` was introduced at commit `8c34a33f` and renamed
+      `R100` at `7c5dee9e`, both after the pilot's frozen `sourceRevision`.
       **Not landed for Plan import (task 3.4).** Every existing pilot boundary under the
       namespaced tree is registered through a `sourceSelector` bound to a pre-namespacing
       predecessor file that existed at the pilot's frozen `sourceRevision`. Both of Plan import's
```

## 11. Global stop conditions

- A red checkpoint reports `0 tests ran`.
- A mutation leaves its named test passing: restore, check the location against section 6, redo
  once, stop if it still passes.
- A step-0 line does not print what it says, or the step-0 tree is not clean.
- `git apply --check` refuses any section-10 diff: the file drifted; report, do not repair.
- A pin differs from step 0 other than by this packet's own prescribed change (`kinds.json` 93
  unchanged in every slice; wiki modules and boundaries +1 each and relationship facts +1 in slice
  3; the legacy pin exactly as row 30 states; the prose pin exactly as row 28 states).
- Any change to what `PlanDocumentService`, `classifyPlanDocument` or the launcher functions do.
  The **only** permitted source changes to moved code are 10.2's and 10.9's lines; the only
  permitted installer changes are 10.5's `project.routes.ts` hunk and 10.12's two entrypoint hunks.
- A network access or an OpenSpec download.
- A check needs an edit this packet does not prescribe.

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                                                                                                             | Untracked (new)                                                                                                                                                                                                       | Deleted                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `libs/wbs/application/core/src/`: `http/project.routes.ts`, `index.ts`, `ports/sideways-type-boundaries.test.ts`, `service/plan-document.ts`                                                                                                                                 | all **seven** files under `libs/wbs/application/core/src/module/plan-document/`: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `plan-document.resource.test.ts`, `plan-document.resource.ts` | `libs/wbs/application/core/src/service/plan-document.test.ts` (moved) |
| 2     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `apps/wbs/be-01/src/`: `dev/main.ts`, `main.ts`, `service/solver-launcher-process.ts`                                                                                                                                                                                        | all **seven** files under `apps/wbs/be-01/src/module/solver-launcher/`: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `solver-launcher.repository.test.ts`, `solver-launcher.repository.ts`  | `apps/wbs/be-01/src/service/solver-launcher-process.test.ts` (moved)  |
| 3     | `apps/wbs/be-01/src/module/solver-launcher/README.md`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `docs/wiki-policy/relationships.json`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing                                                                                                                                                                                                               | nothing                                                               |

Slice 1: 6 modified, 7 new, 1 deleted (14 paths). Slice 2: 5 modified, 7 new, 1 deleted (13
paths). Slice 3: 8 modified. The planner may add a revised packet file to its own commits; the
lists are scoped to `$base`, so that does not break them.

## 13. Findings

- **Map:** the Supervisor row cannot be executed before its own preparation 7 (section 4); the map
  already says preparations come first, so this is a sequencing fact, not a defect. Its
  "Local solver launcher" name, read as an identifier, would break
  `production-entrypoint.test.ts` (row 17); the map disclaims its names as identifiers.
- **Brief:** `solver-request-pair.ts` is Optimization's domain-bound support (task 6.2), not the
  Supervisor's mapper; the mapper is `solver-supervisor-spawner.ts`.
- **Pilot:** every pilot index needs an applicable check, and no check fact existed for any app
  project; the first backend registration therefore adds `check.be-01.test` and moves the prose
  pin, whose first offending index is now a be-01 path.
- **Workspace inputs:** a be-01 test that reads a file outside `apps/wbs/be-01` is refused by
  `workspace-targets.test.ts` unless `wbs-be-01:test` declares it (row 24). `services.db.test.ts`
  already reads `wbs_solver/__init__.py` through production code, which that check cannot see.
- **Landed code of packets A-E5:** no defect found.

## 14. Document exemption (precondition, not a slice)

Sections 3, 4, 10.14 and 10.18 cite `libs/core/src/service/plan-document.ts` (to prove it has no
frozen-revision predecessor) and `apps/be-01/src/service/solver-launcher-process.ts` (the Solver
launcher's predecessor). `docs/findings/current-document-check-exemptions.json` carries this
packet's `legacy-root` entry, committed with the packet itself; no slice touches that file.

## 15. `git apply --check` verification

Every fenced `diff` block above was extracted from this document by the script below and applied
in slice order to a disposable worktree of `2ae5cfde`, with the filesystem steps each slice
prescribes in between, and the resulting tree compared with the rehearsed slice commits.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <slice1-sha> <slice2-sha> <slice3-sha>
set -euo pipefail
repo=$1; packet=$2; s1=$3; s2=$4; s3=$5
work=$(mktemp -d "${TMPDIR:?}/e6-extract-XXXXXX")
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
test "$(ls "$work"/*.patch | wc -l)" -eq 15
test "$(ls "$work"/*.listing | wc -l)" -eq 13
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" 2ae5cfdec6be4c7f29e7cf2b424f28ad03e2cd7d
cd "$wt"
c=libs/wbs/application/core/src
p=$c/module/plan-document
b=apps/wbs/be-01/src
l=$b/module/solver-launcher
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
mkdir -p "$p"
cp "$work/01.listing" "$p/module.test.ts"
cp "$c/service/plan-document.ts" "$p/plan-document.resource.ts"
mv "$c/service/plan-document.test.ts" "$p/plan-document.resource.test.ts"
apply 01
cp "$work/02.listing" "$c/service/plan-document.ts"
cp "$work/03.listing" "$p/contract.ts"
cp "$work/04.listing" "$p/module.ts"
cp "$work/05.listing" "$p/check.ts"
cp "$work/06.listing" "$p/README.md"
apply 02
apply 03
apply 04
test "$(ls "$p" | wc -l)" -eq 7
same_as "$s1"
# Slice 2
mkdir -p "$l"
cp "$work/07.listing" "$l/module.test.ts"
cp "$b/service/solver-launcher-process.ts" "$l/solver-launcher.repository.ts"
mv "$b/service/solver-launcher-process.test.ts" "$l/solver-launcher.repository.test.ts"
apply 05
cp "$work/08.listing" "$b/service/solver-launcher-process.ts"
cp "$work/09.listing" "$l/contract.ts"
cp "$work/10.listing" "$l/module.ts"
cp "$work/11.listing" "$l/check.ts"
cp "$work/12.listing" "$l/README.md"
apply 06
apply 07
test "$(ls "$l" | wc -l)" -eq 7
same_as "$s2"
# Slice 3
apply 08
apply 09
apply 10
apply 11
cp "$work/13.listing" "$l/README.md"
apply 12
apply 13
apply 14
apply 15
same_as "$s3"
cd "$repo"
git worktree remove --force "$wt"
echo "all 15 diffs applied in slice order; every slice tree equals its rehearsal commit"
````

Output:

```text
diffs=15 listings=13
applied 01
applied 02
applied 03
applied 04
tree equals e2102e14
applied 05
applied 06
applied 07
tree equals de09e84c
applied 08
applied 09
applied 10
applied 11
applied 12
applied 13
applied 14
applied 15
tree equals dd7e7667
all 15 diffs applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits are throwaway: slice 1 `e2102e14`, slice 2 `de09e84c`, slice 3 `dd7e7667`,
on branch `rehearse/040-6-e6-resource-modules` above `2ae5cfde` (not pushed; kept only as the
comparison target of the script above). None of them touches `verify.md`, which only the executor
writes. Their subjects are rehearsal labels, and slice 1's differs from section 7's (`… and install
it through its installer`); the planner commits every slice with section 7's subject, and only the
trees are compared.

## 16. Deferred: label agreement

Whether each README's `moduleId` names the label its module seals its bag under is not checked,
matching packet D's deferral.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                                                             |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Fixture reproduces the failure first | §6 rows 1 and 13 (module reds), 3 and 15 (bundle reds), 25, 26, 28 and 30 (registration and pin reds), all on unchanged code                           |
| 2   | Test code passes typecheck and lint  | §6 rows 2 and 14; `wbs-core` and `wbs-be-01` lint and typecheck on each rehearsed slice; lefthook passed on all three rehearsal commits                |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                                                                    |
| 4   | Commands can show failure            | §7 status wrapper; `if count=$(grep …)` form for every bundle grep                                                                                     |
| 5   | Tests reading `HEAD`                 | §7 slice 3 preamble: slices 1-2 are committed before the pilot suite runs                                                                              |
| 6   | Sandbox facts                        | §7 slice 1 step 10 (service-kinds is planner-only); §8                                                                                                 |
| 7   | Known race                           | §8                                                                                                                                                     |
| 8   | Names                                | `module.application.plan-document`, `module.backend.solver-launcher`; labels `application.plan-document`, `backend.solver-launcher`; Twilight Burokrat |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines                                                                      |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change                                                                                                |
| 11  | `\|\| test $? -eq 1` after pipelines | not used; single-command `if … then … else status=$?` form only                                                                                        |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                                                               |
| 13  | Index every module file              | §10.4's and §10.15's blocks name all six non-README files of each module                                                                               |
| 14  | Bun path vs filter                   | every focused run uses `./…` or `cd <project>`; lint and typecheck before baselines                                                                    |
| 15  | Interleaving property tests          | not triggered: no owner, queue, lock or retry logic is added                                                                                           |
| 16  | Model-based tests                    | not triggered                                                                                                                                          |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed` (dispatch paragraph)                                                                                      |
| 18  | Symbol-based boundary checks         | §10.6 reuses the TypeChecker-based checker; row 11 proves the new row is needed                                                                        |
| 19  | ugrep exits 1 on missing file        | `test -f` precedes every `grep -c` on a bundle                                                                                                         |
| 20  | Promise only what a check keeps      | 4.2 left unticked; be-01's K5 stated as read, not watched; `check-indexes` called index validation; no compile red claimed (§6)                        |
