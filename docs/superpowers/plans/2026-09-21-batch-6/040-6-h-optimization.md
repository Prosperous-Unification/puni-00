# 040.6 H — Optimization and the Solver supervisor as backend modules

| Field      | Value                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — fifteenth packet                                                                                                                                                                                                                                                |
| Size class | M, in four slices                                                                                                                                                                                                                                                                                                                                          |
| Slices     | 1 seals Optimization as a feature module with the neutral spawn and child port in its contract and installs it from `buildServices`, 2 injects the cache-key port and adds be-01's first import-route check, 3 seals the Solver supervisor as a repository module and installs it from `main.ts`, 4 registers both in the wiki pilot and records the tasks |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` tasks 1.5 and 1.6 (ticked), the Supervisor half of 4.2 (ticked, closing 4.2), task 3.6 (recorded, **not ticked**: section 4 says why the repository ports are the next packet's), and task 7.5 for both new directories                                                                                   |
| Planned on | 2026-09-24; every slice rehearsed end to end and committed on a throwaway branch cut from `1378c1dd` (planning `57f8c265` merged with packet G's rehearsal tree `fdd74667`)                                                                                                                                                                                |

**Dates.** Every `Proof:` comment and task note below carries the planner's rehearsal date,
2026-09-24. Write the date you actually observe (`date -u +%F`) when you add them; if it differs,
change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-h-optimization.md` must
print an entry) and its `legacy-root` exemption entry, and must descend from packet G's slice-4
planner commit. This packet was rehearsed on `1378c1dd`, whose E8 and G files are those packets'
rehearsal trees; their real commits differ from the rehearsal trees in more than dates (G's `kinds.json` broadcast row,
`plan-commands/contract.ts`, `tasks.md` 1.2 and 5.2 wording); none of those lines is context of an H
hunk, but the dated G lines in 10.23–10.25 are, so §15 is rerun against the real base before
dispatch. **Before dispatch the planner reruns section 15's script against the real base** (with the
real base in place of `1378c1dd`): three diffs here carry dated G lines as context — 10.23 and
10.24 sit beside G's legacy-pin `Proof:` line and 10.25 beside G's `tasks.md` notes — and if G's
executor observed a date other than 2026-09-24 those lines differ. A refusal there is re-cut by the planner, never repaired by the executor. Every count below
was measured on `1378c1dd`; every comparison is relative to the slice's own step 0. Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-h-optimization 1 <packet-containing commit sha> --batch batch-6 --require-ancestor <G slice-4 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

Slices 2 to 4 resume the clone the previous slice built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-h-optimization 2 <the same sha> --batch batch-6 --resume --require-ancestor <slice 1 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-h-optimization 3 <the same sha> --batch batch-6 --resume --require-ancestor <slice 2 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-h-optimization 4 <the same sha> --batch batch-6 --resume --require-ancestor <slice 3 planner commit> --slice-note 'reviewed base <sha>' --preserve evidence
```

The executor never runs `apps/wbs/be-01/src/app.routes.test.ts` (its health-route framing test binds
a port through `Bun.serve`, which the sandbox refuses with `EPERM: operation not permitted, listen`)
nor either `*.proc.db.test.ts` suite: `optimization-spawn-handshake.proc.db.test.ts` fails inside the
sandbox (row E1) and `optimization-orphan.proc.db.test.ts` skips everywhere without the host
supervisor. Both are the planner's (section 8). Nothing else binds a port or needs the network
(`bun build`, the TypeScript program of the new check and the pilot suite's local `git clone` all run
offline), so **no slice needs `--network`**. No slice reads an earlier attempt's evidence, only the
committed tree, so **no slice needs `--seed`**.

## 1. Goal and non-goals

**Goal.** Seal the last backend feature, Optimization, and the Supervisor it launches through, in
the shape every earlier 040.6 module has (a README, a contract, a labelled `module.ts`, a
composition `check.ts`), together with the two preparations that block them:

| Module directory under `apps/wbs/be-01/src/module/` | Moved from (`apps/wbs/be-01/src/service/`)                                                                                       | Export      | Label                       | Kind       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------- | ---------- |
| `optimization/`                                     | `optimization-coordinator.ts` (737 lines), its private `solver-child-lifecycle.ts` (106) and `optimized-schedule-reader.ts` (29) | `optimizer` | `backend.optimization`      | feature    |
| `solver-supervisor/`                                | `solver-supervisor-client.ts` (277) and its private request/attempt mapper `solver-supervisor-spawner.ts` (47)                   | `spawner`   | `backend.solver-supervisor` | repository |

- **Task 1.5.** The spawn and child interfaces move out of the coordinator into
  `module/optimization/contract.ts` as a neutral port: no `@wbs/store-sqlite` row type, nothing of the
  private child lifecycle. The mapper becomes the Supervisor's private support and imports only that
  contract (K5); its `kinds.json` repository row goes, because no `service/` path remains to classify.
- **Task 1.6, second half.** The coordinator hashes an input through an injected cache-key port,
  `hashInput`, which `services.ts` backs with SQLite's existing `scheduleInputHash`. be-01 gains its
  first import-route check, `apps/wbs/be-01/src/module-boundaries.test.ts`, the rule task 1.6's own
  note says the Optimization module owes.
- **Task 3.6, the module.** The three outcome events become contract projections over the neutral
  `ProjectEvent`; `buildServices` installs the module through `installOptimization`.
- **Task 4.2, the Supervisor half.** The module exports the already-adapted launcher port;
  `connectSolverSupervisor` stays a TypeScript diagnostic and test surface; `main.ts` installs it.

The former files stay as compatibility re-export shims where anything still imports them, their
`kinds.json` rows are rewritten in place, and each moved unit test moves with its owner.

**Non-goals.**

- **No repository ports** (section 4, "Split decision"): the feature keeps its `db` and its direct
  `@wbs/store-sqlite` queue, admission, drain, generation, cache and outcome calls, disclosed as K3
  debt in `contract.ts`. Task 3.6 stays unticked with a dated note.
- No change to what the coordinator, the lifecycle, the reader, the Supervisor client or the mapper
  does. Moved bodies differ from their sources only in import lines and in type declarations that
  moved verbatim into the contract (sections 4 and 10.2); slice 2 changes exactly three expressions,
  `scheduleInputHash(x)` to `this.options.hashInput(x)`. The erased-body comparison of section 7
  proves both.
- No domain moves (task 6.2): the feature keeps importing `service/solver-exit-outcome.ts` and
  `service/solver-request-pair.ts` through their `service/` paths. Task 1.5 forces no type out of
  them: neither declares a spawn or child type.
- No change to `optimizer-wiring.ts` (root wiring, the map's disposition), to core's
  `optimizer-trigger-broadcaster.ts` (root-private realtime/optimizer wiring), to
  `dev/local-solver-spawner.ts` or `app.ts` (both keep the coordinator's compatibility path), to the
  two Supervisor diagnostic scripts (they keep the client's), to `boot.ts` (it still starts and stops
  the one coordinator), or to any library version (`di-bag` stays 0.4.0). No frontend, gateway, MCP or
  core change.

## 2. Read first

| File                                                                                                                                                                | Why                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                                        | Rules R1 to R5.                                                                                                              |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` ("Backend optimization and repository ownership"; preparations 7 and 8; public-symbol rule) | What each module exports and keeps private.                                                                                  |
| `apps/wbs/be-01/src/module/solver-launcher/`                                                                                                                        | The first backend module, whose four module files these two mirror.                                                          |
| `apps/wbs/be-01/src/service/optimization-coordinator.ts`, `solver-supervisor-spawner.ts`                                                                            | The feature and the mapper whose edge task 1.5 cuts.                                                                         |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                                                                                              | The core's identity-based checker; the new be-01 check asks the same two questions of resolved identities in a smaller form. |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation"                                                  | The exact `jq -s -e` contract slice 4 uses.                                                                                  |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `1378c1dd` on 2026-09-24.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **The K5 edge 1.5 cuts.** `solver-supervisor-spawner.ts:1` imports `ReservedSolverChild` and `ReservedSpawner` from `./optimization-coordinator`, the feature. `ReservedSpawnRequest` (`optimization-coordinator.ts:110`) extends `SpawnRequest` from be-01's one-line shim of `@wbs/store-sqlite/optimized-schedule-cache` and types `admission` as `Extract<SolverSlotAdmission, …>` from `repository/optimization-admission`; `ReservedSolverChild` (`:126`) extends `SolverChildProcess` from `solver-child-lifecycle.ts`.                                                                                       | `grep -n`; read.                                                      |
| Nothing but the coordinator names `SolverChildProcess` (`git grep`), so it can move to the contract and the lifecycle import it back. `SpawnRequest` is `{ key: OptimizedCacheKey; objective }`, `OptimizedCacheKey` four `readonly` fields, and the reserved admission five: the contract restates exactly these, so SQLite's values stay assignable without a conversion.                                                                                                                                                                                                                                          | `optimized-schedule-cache.ts:62,403`; `optimization-admission.ts:29`. |
| **The hash shim.** The coordinator imports `scheduleInputHash` from `../repository/schedule-input-hash` (`:42`), a one-line re-export of `@wbs/store-sqlite/schedule-input-hash`, and calls it three times (`:428`, `:488`, `:607`), each synchronously in place of a string. `SolverObjectiveName` already comes from `@wbs/domain` (task 1.6's first half).                                                                                                                                                                                                                                                        | `grep -n`.                                                            |
| **Constructions.** `new OptimizationCoordinator(` appears once in production (`services.ts:136`) and fourteen times in five database test files (`optimization-coordinator.db.test.ts` 7, `optimization-events.db.test.ts` 3, `optimization-cancel.two-coordinator.db.test.ts`, `optimization-restart.db.test.ts`, `optimization-spawn-handshake.proc.db.test.ts` 1 each). A required `hashInput` option therefore touches those five files; four already import `scheduleInputHash`.                                                                                                                                | `git grep -c`.                                                        |
| **Event projections.** The coordinator declares `ScheduleOptimizedEvent`, `ScheduleOptimizationFailedEvent` and `ScheduleOptimizationInfeasibleEvent` over `ProjectEvent` (`:95-103`) and re-exports `@wbs/store-sqlite`'s `OptimizationOutcomeEvent` and `storeOptimizedOutcomeAndRecord` (`:104-107`). No file imports `storeOptimizedOutcomeAndRecord` through the coordinator; `optimization-events.db.test.ts` imports `OptimizationOutcomeEvent` through it.                                                                                                                                                   | `git grep`.                                                           |
| **Importers kept working by shims.** Coordinator path: `app.ts`, `dev/local-solver-spawner.ts`, `controller/project.controller.test.ts`, `services.db.test.ts` and the five optimization database tests. Lifecycle path: three database tests. Reader path: `controller/work-item.controller.test.ts` and four plan-read tests (`deadline-plan-read`, `optimized-plan-read`, `optimized-plan-read-annotations`, `optimizer-availability`). Client path: `apps/wbs/be-01/scripts/solver-supervisor-{image,orphan}-client.ts`. The mapper's only importers are `main.ts` and its own test, so it keeps no former path. | `git grep -n`.                                                        |
| **Kinds.** `kinds.json` has `K=88` entries. Rows rewritten to shims: `optimization-coordinator.ts` (line 70, `feature`), `optimized-schedule-reader.ts` (76) and `solver-child-lifecycle.ts` (183) in slice 1; `solver-supervisor-client.ts` (206, `repository`) in slice 3, which also removes `solver-supervisor-spawner.ts` (211): `K - 1 = 87`. `SERVICE_ROOTS` does not scan `src/module`.                                                                                                                                                                                                                      | `python3`; `grep -n`; `service-kinds.ts:15`.                          |
| **A scan the move would narrow.** `apps/wbs/be-01/src/service/clock.test.ts` reads `apps/wbs/be-01/src/service` and core's module directories but no backend module directory; with the coordinator moved, a `now?: () => number;` added to its options passes unnoticed (row 4). Slice 1 extends the scan.                                                                                                                                                                                                                                                                                                          | Read; rehearsed.                                                      |
| **No be-01 import-route check exists** (task 1.6's note; E4 and E6). The core's checkers compile `libs/wbs/application/core` only. `typescript` 6.0.2 resolves from be-01; `tsconfig.lib.json` carries the `@wbs/*` paths through `tsconfig.base.json`.                                                                                                                                                                                                                                                                                                                                                              | Read; rehearsed.                                                      |
| **Frozen-revision predecessors.** `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- apps/be-01/src/service/optimization-coordinator.ts` prints `100644 blob 5a8c8f54f430cd67e29d12d3f35b4d77a2d9ae39`; the same for `solver-supervisor-client.ts` prints `100644 blob 31b66e999d627f2b2cd2709893c449dcfab8b3f8`. `solver-supervisor-spawner.ts` (`7cf29c87…`), `solver-child-lifecycle.ts` (`53878ae5…`) and `optimized-schedule-reader.ts` (`1e50a52a…`) existed then too; one predecessor per module directory.                                                                                             | `git ls-tree`.                                                        |
| **Pilot.** `M=20` modules, `B=20` boundaries. `module.backend.optimization` sorts before `module.backend.solver-launcher`, `module.backend.solver-supervisor` after it. `check.be-01.test` exists (E6). The whole pilot file is `21` tests, `0` failures, `307` `expect()` calls (310 s); the legacy pin is `67`/`285`/`687c123b…`. The prose-refusal pin names the first offending index in path order, `apps/wbs/be-01/src/module/solver-launcher/README.md`, which `module/optimization/README.md` precedes.                                                                                                      | `python3`; rehearsed.                                                 |
| **Baselines**, after `wbs-be-01` lint and typecheck (exit 0): be-01 unit set (without `*.db.test.ts` and `app.routes.test.ts`) `520` over 49 files; the six optimizer database files of section 7 `54` over 6; OpenSpec `114` passed. Inside the Codex sandbox the executor uses (`codex sandbox`, `workspace-write`, network off) the six database files pass and the spawn-handshake suite fails (row E1).                                                                                                                                                                                                         | Rehearsed.                                                            |

## 4. Designs, and what triggers no interleaving test

**Task 1.5: a neutral port in the Optimization contract.** `contract.ts` declares
`OptimizationCacheKey`, `ReservedSolverAdmission`, `ReservedSpawnRequest`, `ReservedSolverTerminal`,
`SolverChildProcess`, `ReservedSolverChild` and `ReservedSpawner` from `@wbs/contracts` and
`@wbs/domain` types alone. The coordinator imports them from the contract; the lifecycle imports
`SolverChildProcess` from it; the moved mapper imports `ReservedSolverChild` and `ReservedSpawner`
from `../optimization/contract`, never the feature. The coordinator's shim re-exports contract and
feature, so every old importer keeps compiling.

**Task 1.6: an injected cache-key port and the rule its note owes.** `ScheduleInputHasher =
(input: ScheduleInput) => string` in the contract; `hashInput` a required coordinator option;
`services.ts` supplies `@wbs/store-sqlite`'s `scheduleInputHash`, and each database test the same
function. The rule is `apps/wbs/be-01/src/module-boundaries.test.ts`: one TypeScript program over
every `.ts` under `apps/wbs/be-01/src/module`, built with be-01's own `tsconfig.lib.json`, asking of
every module specifier where it resolves and of every identifier which files its alias chain is
declared in. Three rules: files of `module/optimization/` may not reach the repository schema or
the repository hash helper (be-01 shim or `@wbs/store-sqlite` file); `module/optimization/contract.ts`
may not reach any be-01 `repository/` file, any `libs/wbs/adapters/` file or the private lifecycle;
files of `module/solver-supervisor/` may not reach any Optimization file but `contract.ts`, nor the
coordinator's shim. A positive control (the feature must reach `@wbs/domain`'s
`stored-vocabularies.ts`) and a scanned-file control keep an unresolved program from reading as a
pass. **Its stated residual** (addendum 20): a member selected by string key out of an allowed
forwarding barrel is neither an identifier naming the forbidden declaration nor a specifier naming
the forbidden file; the core's sideways checker resolves such selections by type identity, this one
does not, and says so in its JSDoc.

**Why the interleaving lessons (addendum 15 and 16) are not triggered.** The coordinator owns the
spawn, cancel and restart interleavings, so any change to that logic needs a model-based test with
sabotage proofs. This packet changes none: slice 1's moved coordinator and lifecycle, transpiled by
Bun with their `import` and re-export statements removed, are **byte-identical** to their sources,
and slice 2's feature differs from slice 1's in exactly three lines, each replacing
`scheduleInputHash(…)` by `this.options.hashInput(…)` in place — no `await`, branch or call order
moves (row 15 and row 31; section 7 has every executor repeat both comparisons). The next packet's
repository ports do change those call sites, which is why they are not here.

**Split decision: no H2 split of this packet; the repository ports are the next packet.** Every
slice here fits one attempt (17, 14, 17 and 8 paths). What 3.6 still owes is recorded, not split
out: replacing the feature's `db` and its fourteen direct repository functions (`reconcileOptimizationDrains`,
`bindSolverSlot`, `releaseSolverSlot`, `dequeueSolverRequest`, `storeOptimizedOutcomeAndRecord`,
the immediate retry transaction over `readGeneration`, `readOptimizedPair`,
`optimizedVariantIsLive`, `reserveSolverSlotIn` and `enqueueSolverRequestIn`, and
`allocateEnabledGeneration`, `readOptimizedPairAndSpawn`, `reserveSolverSlot`,
`enqueueSolverRequest`), plus the lifecycle's `heartbeatSolverSlot` and `releaseSolverSlot`, with
queue, generation, cache, slot and outcome ports; rewriting the fourteen test constructions; and,
because those are the interleaving's own call sites, a written state machine and an
`fc.asyncModelRun` model-based test with four sabotage proofs first (section 9).

**Identifiers.** `module.backend.optimization` and `module.backend.solver-supervisor`: the grammar
of E6 (`module.<runtime>.<name>` under an app), R2's domain word (`solver-`), and no `local-solver`
substring, which `production-entrypoint.test.ts` refuses in `main.ts`'s bundle. Labels drop
`module.`.

## 5. File plan

`o/` is `apps/wbs/be-01/src/module/optimization/`, `s/` is `apps/wbs/be-01/src/module/solver-supervisor/`,
`svc/` is `apps/wbs/be-01/src/service/`.

| Path                                                                                                              | Slice   | Action                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `o/module.test.ts`                                                                                                | 1, 2    | create **first**, for the red (10.1); slice 2 extends it first (10.9)                                 |
| `o/optimization.feature.ts`, `o/solver-child-lifecycle.ts`, `o/optimized-schedule-reader.ts`                      | 1, 2    | `cp` from `svc/`, then 10.2; slice 2's port (10.10)                                                   |
| `o/optimized-schedule-reader.test.ts`                                                                             | 1       | **`mv`** from `svc/`, then 10.2                                                                       |
| `svc/optimization-coordinator.ts`, `svc/solver-child-lifecycle.ts`, `svc/optimized-schedule-reader.ts`            | 1       | content replaced by the shims of 10.3                                                                 |
| `o/contract.ts`, `o/module.ts`, `o/check.ts`, `o/README.md`                                                       | 1-4     | create (10.4); later slices edit them                                                                 |
| `apps/wbs/be-01/src/services.ts`, `docs/code-organization/kinds.json`                                             | 1, 2, 3 | 10.5; 10.10; 10.16 (`kinds.json` only)                                                                |
| `svc/clock.test.ts`                                                                                               | 1       | 10.6, then its Proofs (10.7)                                                                          |
| `apps/wbs/be-01/src/module-boundaries.test.ts`                                                                    | 2, 3    | create **first** (10.8); slice 3's rule (10.17); Proofs (10.11, 10.18)                                |
| five optimization database tests under `svc/`                                                                     | 2       | one `hashInput: scheduleInputHash,` per construction (10.10)                                          |
| `s/module.test.ts`                                                                                                | 3       | create **first** (10.12)                                                                              |
| `s/solver-supervisor.repository.ts`                                                                               | 3       | `cp` from `svc/solver-supervisor-client.ts`, **unchanged**                                            |
| `s/solver-supervisor.repository.test.ts`, `s/solver-supervisor-spawner.ts`, `s/solver-supervisor-spawner.test.ts` | 3       | **`mv`** from `svc/solver-supervisor-client.test.ts`, `…-spawner.ts`, `…-spawner.test.ts`, then 10.13 |
| `svc/solver-supervisor-client.ts`                                                                                 | 3       | content replaced by the shim of 10.14                                                                 |
| `s/contract.ts`, `s/module.ts`, `s/check.ts`, `s/README.md`                                                       | 3, 4    | create (10.15)                                                                                        |
| `apps/wbs/be-01/src/main.ts`                                                                                      | 3       | 10.16                                                                                                 |
| `docs/wiki-policy/modules.json`, `policy.json`; `apps/wiki/cli/src/policy/pilot-policy.test.ts`                   | 4       | 10.19-10.22                                                                                           |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                         | 4       | legacy re-pin (10.23, then 10.24)                                                                     |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                  | 4       | 10.25                                                                                                 |
| `openspec/changes/adopt-di-composition/verify.md`                                                                 | 1-4     | each slice appends its own observations                                                               |

**Directory contents.** `o/` holds **nine** files from slice 1 on: `README.md`, `check.ts`,
`contract.ts`, `module.test.ts`, `module.ts`, `optimization.feature.ts`,
`optimized-schedule-reader.test.ts`, `optimized-schedule-reader.ts`, `solver-child-lifecycle.ts`.
`s/` holds **nine** from slice 3 on: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`,
`module.ts`, `solver-supervisor-spawner.test.ts`, `solver-supervisor-spawner.ts`,
`solver-supervisor.repository.test.ts`, `solver-supervisor.repository.ts`. Each README's slice-4 index
names the eight that are not the README.

**Neighbours.** E6 owns `module/solver-launcher/` and its wiki rows; E8 and G own `module/work-item/`,
`module/plan-commands/`, their shims and their lines in `compose.ts`, `kinds.json`, `modules.json`,
`policy.json`, `pilotPaths`, the legacy pin and `tasks.md`. This packet edits none of their lines:
its `kinds.json` hunks are be-01 rows, its registration rows sit beside E6's, its policy boundaries
are appended after G's, and its `tasks.md` hunks are 1.5, 1.6, 3.6, 4.2 and one line after G's 7.5
note. Section 12's hand-over lists are scoped to each slice's own `base`.

## 6. Rehearsed observations

Every row was produced on the throwaway branch in a private worktree of `1378c1dd`, against the exact
listings of section 10 before any `Proof:` diff, each fault restored with `cp` + `cmp` before the next.
Rows marked **evidence** are the planner's measurements behind a decision; the executor does not
repeat them. Faults are written for section 7's `fault.py` helper as
_file, occurrence, exact line → replacement_, or as one line _prepended_ to a file.

**Slice 1 faults** (`o` = `apps/wbs/be-01/src/module/optimization`):

```text
tuple     o/module.ts, 1, "  .buildModule(['optimizer'], { label: OPTIMIZATION_LABEL });"
          -> "  .buildModule(['optimizer', 'optimizationOptions'], { label: OPTIMIZATION_LABEL });"
label     o/module.ts, 1, the same line -> "  .buildModule(['optimizer']);"
edge      o/module.ts, 2, "        contractVersion," -> "        contractVersion: solverVersion,"
sink      o/module.ts, 2, "        onChildError," -> "        onChildError: () => undefined,"
bag       o/check.ts, 1, "  return { optimizer: bag.resolve('optimizer') };"
          -> "  const exposed = { optimizer: bag.resolve('optimizer'), bag };" + newline + "  return exposed;"
resolver  o/check.ts, 1, the same line
          -> "  return { optimizer: Object.assign(bag.resolve('optimizer'), { resolve: bag.resolve.bind(bag) }) };"
clock     o/optimization.feature.ts, 1, "export interface OptimizationCoordinatorOptions {"
          -> that line + newline + "  now?: () => number;"
scan      apps/wbs/be-01/src/service/clock.test.ts, 1,
          "  return [...FOLDERS, ...modulesIn(MODULES), ...modulesIn(BACKEND_MODULES)];"
          -> "  return [...FOLDERS, ...modulesIn(MODULES)];"
```

The first occurrence of `        contractVersion,` and of `        onChildError,` in `module.ts` is the
destructured parameter; the **second** is the returned object, the one each fault replaces. Replace
the line; never add a second key beside it — a later shorthand wins in an object literal and the named
test stays green.

**Slice 2 faults:**

```text
port      o/module.ts, 2, "        hashInput," -> "        hashInput: () => 'module-hash',"
schema    prepend to o/optimization.feature.ts:
          "import type { SolverObjectiveName as StoredObjectiveName } from '../../repository/schema';"
package   prepend to o/optimization.feature.ts: "import '@wbs/store-sqlite/schema';"
repo      prepend to o/contract.ts: "import '../../repository/optimization-admission';"
adapter   prepend to o/contract.ts: "import '@wbs/store-sqlite/optimization-admission';"
private   prepend to o/contract.ts: "import './solver-child-lifecycle';"
absent    apps/wbs/be-01/src/module-boundaries.test.ts, 1,
          "const configPath = `${backendRoot}tsconfig.lib.json`;"
          -> "const configPath = `${backendRoot}tsconfig.absent.json`;"
invalid   apps/wbs/be-01/tsconfig.lib.json, 1, '    "declaration": true'
          -> '    "declaration": true,' + newline + '    "module": "invalid"'
paths     apps/wbs/be-01/src/module-boundaries.test.ts, 1,
          "    options: { ...parsed.options, noEmit: true },"
          -> "    options: { ...parsed.options, paths: undefined, noEmit: true },"
missing   apps/wbs/be-01/src/module-boundaries.test.ts, 1, "    .sort();"
          -> "    .concat('module/missing.ts')" + newline + "    .sort();"
scanned   apps/wbs/be-01/src/module-boundaries.test.ts, 1,
          "    .filter((path) => path.endsWith('.ts'))" -> "    .filter((path) => path.endsWith('.tsx'))"
```

**Slice 3 faults** (`s` = `apps/wbs/be-01/src/module/solver-supervisor`):

```text
tuple     s/module.ts, 1, "  .buildModule(['spawner'], { label: SOLVER_SUPERVISOR_LABEL });"
          -> "  .buildModule(['spawner', 'supervisorOptions'], { label: SOLVER_SUPERVISOR_LABEL });"
label     s/module.ts, 1, the same line -> "  .buildModule(['spawner']);"
edge      s/module.ts, 2, "        searchWorkers," -> "        searchWorkers: 1,"
bag       s/check.ts, 1, "  return { spawner: bag.resolve('spawner') };"
          -> "  const exposed = { spawner: bag.resolve('spawner'), bag };" + newline + "  return exposed;"
resolver  s/check.ts, 1, the same line
          -> "  return { spawner: Object.assign(bag.resolve('spawner'), { resolve: bag.resolve.bind(bag) }) };"
shim      prepend to s/solver-supervisor-spawner.ts:
          "import type { ReservedSpawner as FeatureSpawner } from '../../service/optimization-coordinator';"
feature   prepend to s/solver-supervisor-spawner.ts: "import '../optimization/optimization.feature';"
```

| #   | Where                                   | Fault                                    | Test that observed it                                                                                 | Literal fragment observed                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, unchanged tree             | none; `check.ts` does not exist          | `o/module.test.ts`                                                                                    | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                                                                                   |
| 2   | slice 1 step 0                          | none                                     | the bundles of `main.ts` and `dev/main.ts`                                                            | build exit 0; `backend.optimization` and `backend.solver-supervisor` `count=0 (grep exit 1)` in both                                                                                                                                                                                                                                                                                    |
| 3   | slice 1 green                           | none                                     | `bun test ./apps/wbs/be-01/src/module/optimization/`                                                  | `11 pass`, `0 fail`, `17 expect() calls`, 2 files                                                                                                                                                                                                                                                                                                                                       |
| 4   | slice 1, before 10.6                    | clock                                    | `svc/clock.test.ts`                                                                                   | `4 pass`, `0 fail` — the gap the move opens; 10.6 closes it                                                                                                                                                                                                                                                                                                                             |
| 5   | slice 1, after 10.5                     | none                                     | row 2's bundles and greps                                                                             | `backend.optimization count=1` in both; `backend.solver-supervisor` still 0                                                                                                                                                                                                                                                                                                             |
| 6   | `o/module.ts`                           | tuple                                    | the private-binding test and the two label tests                                                      | `Received function did not throw`; `Expected to contain: "backend.optimization/optimizationOptions"`; message `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "optimizationOptions"`; `3 pass`, `3 fail`                                                                                                                                                                                     |
| 7   | `o/module.ts`                           | label                                    | `labels its private bindings with the module name`, `names itself when a host omits a requirement`    | `4 pass`, `2 fail`; the private-binding test stays green                                                                                                                                                                                                                                                                                                                                |
| 8   | `o/module.ts`                           | edge                                     | `reads an idle plan under the identity installOptimization wires`                                     | `-   "contractVersion": "7+0.1.0",`, `+   "contractVersion": "0.1.0",`; `5 pass`, `1 fail`                                                                                                                                                                                                                                                                                              |
| 9   | `o/module.ts`                           | sink                                     | `reports a failed edit read to the error sink installOptimization wires`                              | expected `[ [Error: enabled read refused] ]`, `+ []`; `5 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                |
| 10  | `o/check.ts`                            | bag                                      | `exposes only the contract exports from its installer`, first assertion                               | `+   "bag",` (`Expected - 0`, `Received + 1`); `5 pass`, `1 fail`; `wbs-be-01:typecheck` exit 0                                                                                                                                                                                                                                                                                         |
| 11  | `o/check.ts`                            | resolver                                 | the same test, second assertion                                                                       | `Expected: true`, `Received: false`; `5 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                                                                                                                                               |
| 12  | after 10.6                              | clock                                    | `is the only clock a service that stamps a write reads`                                               | `+   "apps/wbs/be-01/src/module/optimization/optimization.feature.ts",`; `3 pass`, `1 fail`                                                                                                                                                                                                                                                                                             |
| 13  | after 10.6                              | scan                                     | `is reading real service sources, not an empty list`                                                  | `expect(received).toBeDefined()`, `Received: undefined`; `3 pass`, `1 fail`                                                                                                                                                                                                                                                                                                             |
| 14  | slice 1 end                             | none                                     | be-01 unit; the six database files; `clock.test.ts`; kinds substitute; entrypoint test                | `526` over 50 (`E + 6` over `EF + 1`); `54` over 6; `4 pass`; `88 []`; `2 pass`                                                                                                                                                                                                                                                                                                         |
| 15  | **evidence**, slice 1 end               | none                                     | section 7's erased-body comparison                                                                    | `coordinator body identical`, `lifecycle body identical`                                                                                                                                                                                                                                                                                                                                |
| 16  | slice 2 red, after 10.8 only            | none; the feature still imports the shim | `apps/wbs/be-01/src/module-boundaries.test.ts`                                                        | exactly `"module/optimization/optimization.feature.ts: '../../repository/schedule-input-hash' reaches apps/wbs/be-01/src/repository/schedule-input-hash.ts"` and `"module/optimization/optimization.feature.ts: scheduleInputHash reaches libs/wbs/adapters/store-sqlite/src/schedule-input-hash.ts"`; `0 pass`, `1 fail`                                                               |
| 17  | slice 2 red, after 10.9                 | none; no port yet                        | `o/module.test.ts`; `wbs-be-01:typecheck`                                                             | `5 pass`, `2 fail`: `-   "inputHash": "port-hash",` and `-   "currentInputHash": "port-hash",` against `a2aad9dfa76c921e25b3204345d3216920dcf8787577905f5c9ac0637120ab11`; typecheck exit 1 with `TS2353: Object literal may only specify known properties, and 'hashInput' does not exist in type 'OptimizationCoordinatorOptions'.` at `module.test.ts:51:5` and `TS2339` at `:73:53` |
| 18  | slice 2 green, after 10.10              | none                                     | `bun test ./apps/wbs/be-01/src/module/optimization/`; the boundary file                               | `13 pass`, `0 fail` over 3 files: the module directory's 12 (`18 expect() calls`) and the boundary file's 1 (`4 expect() calls`)                                                                                                                                                                                                                                                        |
| 19  | `o/module.ts`                           | port                                     | the identity test and `hashes a Retry through the cache-key port installOptimization wires`           | `+   "inputHash": "module-hash",`, `+   "currentInputHash": "module-hash",`; `5 pass`, `2 fail`                                                                                                                                                                                                                                                                                         |
| 20  | `o/optimization.feature.ts`             | schema                                   | the boundary file                                                                                     | exactly `"…: '../../repository/schema' reaches apps/wbs/be-01/src/repository/schema.ts"` and `"…: SolverObjectiveName reaches libs/wbs/adapters/store-sqlite/src/schema.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                        |
| 21  | `o/optimization.feature.ts`             | package                                  | the boundary file                                                                                     | exactly `"…: '@wbs/store-sqlite/schema' reaches libs/wbs/adapters/store-sqlite/src/schema.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                      |
| 22  | `o/contract.ts`                         | repo                                     | the boundary file                                                                                     | exactly `"module/optimization/contract.ts: '../../repository/optimization-admission' reaches apps/wbs/be-01/src/repository/optimization-admission.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                                              |
| 23  | `o/contract.ts`                         | adapter                                  | the boundary file                                                                                     | exactly `"…: '@wbs/store-sqlite/optimization-admission' reaches libs/wbs/adapters/store-sqlite/src/optimization-admission.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                                                                      |
| 24  | `o/contract.ts`                         | private                                  | the boundary file                                                                                     | exactly `"…: './solver-child-lifecycle' reaches apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                  |
| 25  | the boundary file                       | absent                                   | the boundary file                                                                                     | `error: Cannot read file '…/apps/wbs/be-01/tsconfig.absent.json'.`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                  |
| 26  | `apps/wbs/be-01/tsconfig.lib.json`      | invalid                                  | the boundary file                                                                                     | `error: refused tsconfig.lib.json: 6046`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                            |
| 27  | the boundary file                       | paths                                    | the boundary file, positive control                                                                   | `Expected to contain: "libs/wbs/domain/domain/src/stored-vocabularies.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                          |
| 28  | the boundary file                       | missing                                  | the boundary file                                                                                     | `error: the program holds no module/missing.ts`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                     |
| 29  | the boundary file                       | scanned                                  | the boundary file, scanned-file control                                                               | `Expected to contain: "module/optimization/contract.ts"`, `Received: []`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                            |
| 30  | slice 2 end                             | none                                     | be-01 unit; the six database files                                                                    | `528` over 51 (`E + 2` over `EF + 1`); `54` over 6                                                                                                                                                                                                                                                                                                                                      |
| 31  | **evidence**, slice 2 end               | none                                     | section 7's erased-body comparison against slice 1's feature                                          | exactly three changed lines: `scheduleInputHash(input) !== next.inputHash`, `const currentInputHash = scheduleInputHash(ask.input);`, `const inputHash = scheduleInputHash(ask.input);`, each now `this.options.hashInput(…)`                                                                                                                                                           |
| 32  | slice 3 red, unchanged tree             | none; `check.ts` does not exist          | `s/module.test.ts`                                                                                    | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                                                                                   |
| 33  | slice 3, after the moves, before 10.13  | none; the mapper keeps its old imports   | `wbs-be-01:typecheck`                                                                                 | exit 1; among the errors `s/solver-supervisor-spawner.ts:1:59 - error TS2307: Cannot find module './optimization-coordinator'`                                                                                                                                                                                                                                                          |
| 34  | slice 3 green                           | none                                     | `bun test ./apps/wbs/be-01/src/module/solver-supervisor/`                                             | `9 pass`, `0 fail`, `25 expect() calls`, 3 files                                                                                                                                                                                                                                                                                                                                        |
| 35  | slice 3, after 10.16                    | none                                     | row 2's bundles and greps; `production-entrypoint.test.ts`                                            | `main backend.solver-supervisor count=1`; `dev/main backend.solver-supervisor count=0 (grep exit 1)`; `backend.optimization count=1` in both; `2 pass`                                                                                                                                                                                                                                  |
| 36  | `s/module.ts`                           | tuple                                    | the private-binding test and the two label tests                                                      | `Received function did not throw`; `Expected to contain: "backend.solver-supervisor/supervisorOptions"`; message `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "supervisorOptions"`; `2 pass`, `3 fail`                                                                                                                                                                                    |
| 37  | `s/module.ts`                           | label                                    | the two label tests                                                                                   | `3 pass`, `2 fail`                                                                                                                                                                                                                                                                                                                                                                      |
| 38  | `s/module.ts`                           | edge                                     | `hands the reserved attempt to the connector installSolverSupervisor wires`                           | `-     "searchWorkers": 2,`, `+     "searchWorkers": 1,`; `4 pass`, `1 fail`                                                                                                                                                                                                                                                                                                            |
| 39  | `s/check.ts`                            | bag                                      | `exposes only the contract exports from its installer`                                                | `+   "bag",`; `4 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                                                                                                                                                                      |
| 40  | `s/check.ts`                            | resolver                                 | the same test                                                                                         | `Expected: true`, `Received: false`; `4 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                                                                                                                                               |
| 41  | `s/solver-supervisor-spawner.ts`        | shim                                     | the boundary file                                                                                     | exactly `"module/solver-supervisor/solver-supervisor-spawner.ts: '../../service/optimization-coordinator' reaches apps/wbs/be-01/src/service/optimization-coordinator.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                          |
| 42  | `s/solver-supervisor-spawner.ts`        | feature                                  | the boundary file                                                                                     | exactly `"…: '../optimization/optimization.feature' reaches apps/wbs/be-01/src/module/optimization/optimization.feature.ts"`; `0 pass`, `1 fail`                                                                                                                                                                                                                                        |
| 43  | slice 3 end                             | none                                     | be-01 unit; database files; kinds substitute; `cmp` of the moved client                               | `533` over 52 (`E + 5` over `EF + 1`); `54` over 6; `87 []`; identical                                                                                                                                                                                                                                                                                                                  |
| 44  | slice 4, `modules.json` rows alone      | none                                     | `pins exact pre-index tuples and passes observe lint from external trust`                             | `pilot-policy.test.ts:385`: `Expected: 20`, `Received: 22`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                          |
| 45  | slice 4, rows and boundaries            | none                                     | the same test                                                                                         | `pilot-policy.test.ts:422`: `Expected: true`, `Received: false`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                     |
| 46  | slice 4, `pilotPaths` and READMEs added | none                                     | the same test                                                                                         | `1 pass`, `0 fail`                                                                                                                                                                                                                                                                                                                                                                      |
| 47  | slice 4, prose pin unchanged            | none; the registration alone moves it    | the whole `pilot-policy.test.ts`                                                                      | `refuses prose facts presented as applicable checks` fails: `Received: "applicable check has no executable authority in apps/wbs/be-01/src/module/optimization/README.md: check.be-01.test (external-consumer)\n"`; `20 pass`, `1 fail`, `309 expect() calls`                                                                                                                           |
| 48  | slice 4 green                           | 10.22's pin moved                        | the whole `pilot-policy.test.ts`                                                                      | `21 pass`, `0 fail`, `309 expect() calls` (baseline `21`/`0`/`307`: one more per-boundary assertion each); 288 s                                                                                                                                                                                                                                                                        |
| 49  | slice 4, legacy pin unchanged           | none                                     | `every legacy source occurrence and relevant text family is pinned`                                   | `historical policy selector or baseline` `67` → `71`, `occurrences` `285` → `289`, digest `687c123b…` → `8d9667b7d195746954849db31d5e6e106858109737d058581c5d33b4e7097d2e`; `Expected - 3` / `Received + 3`; `0 pass`, `1 fail`                                                                                                                                                         |
| 50  | slice 4, after 10.23                    | none                                     | the same test                                                                                         | `1 pass`                                                                                                                                                                                                                                                                                                                                                                                |
| E1  | **evidence**, planner-observed          | none                                     | `optimization-spawn-handshake.proc.db.test.ts`, inside `codex sandbox` (workspace-write, network off) | `error: spawn-handshake condition did not arrive`, `0 pass`, `1 fail`; outside the sandbox `1 pass` — why it is planner-only                                                                                                                                                                                                                                                            |
| E2  | **evidence**, planner-observed          | none                                     | `app.routes.test.ts` inside the same sandbox                                                          | `EPERM: operation not permitted, listen` — the same sandbox reproduces E6's reason; the six database files pass in it (`54` over 6)                                                                                                                                                                                                                                                     |

Each module assertion has its own mutation: tuple and label are independent (the label fault leaves the
private-binding test green); bag and resolver split the installer test's two assertions; edge, sink
and port break one real provider edge each. Each boundary route clause has its own single-violation
fault (rows 20-24, 41, 42), and each guard of the check its own (rows 25-29). Rows 12 and 13 split
the clock scan's two effects.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses with
`if cmd >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"`;
never read a status through `tee`, never `|| true`. Start lint, typecheck and format targets the
same way and poll their logs (preamble rule 19). Scratch lives only under `"$TMPDIR"`, faults and
failing output under `"$TMPDIR/evidence"`; `verify.md` cites basenames only. You never run
`git add`, `git commit`, `git mv` or any other command that changes Git state (`git show`,
`git diff` and `git ls-files` only read): moves are `cp` and `mv`, and the planner stages them. A
fault is injected on a file first copied to `"$TMPDIR"`, observed, then restored with `cp` from that
copy and proved with `cmp`; save each fault as a patch (`diff -u "$TMPDIR/<copy>" <file>` while it is
in place, with the README's `if diff …; then …; else test $? -eq 1; fi` form) and its failing output
beside it. Every step 0 opens with `base=$(git rev-parse HEAD)` and an empty-status check; every
count compared (`K`, `E`, `EF`, `D`, `DF`, `M`, `B`, `T`, `TF`, `P`, `N`) is assigned in the slice that
compares it, and the same names mean the same commands in every slice. `o` is
`apps/wbs/be-01/src/module/optimization`, `s` is `apps/wbs/be-01/src/module/solver-supervisor`, `b` is
`apps/wbs/be-01/src`.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`. A listing is
written verbatim as the file's whole content. After appending to `verify.md`, run
`GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
before the format check. Strip terminal colour codes before quoting a fragment
(`sed 's/\x1b\[[0-9;]*m//g'`).

**The helpers.** Write both once per attempt:

```sh
set -euo pipefail
cat >"$TMPDIR/fault.py" <<'PY'
import sys
path, occurrence, old, new = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
lines = open(path).read().split('\n')
hits = [index for index, line in enumerate(lines) if line == old]
if len(hits) < occurrence:
    sys.exit(f'{path}: {len(hits)} line(s) equal {old!r}, wanted occurrence {occurrence}')
lines[hits[occurrence - 1]] = new
open(path, 'w').write('\n'.join(lines))
PY
cat >"$TMPDIR/erase.ts" <<'TS'
const transpiler = new Bun.Transpiler({ loader: 'ts' });
const [path] = Bun.argv.slice(2);
if (path === undefined) throw new Error('usage: erase.ts <file>');
const code = transpiler.transformSync(await Bun.file(path).text());
process.stdout.write(
  code.replace(/^import [\s\S]*?;\n/gm, '').replace(/^export (\{[\s\S]*?\}|\*) from [^;]+;\n/gm, ''),
);
TS
```

A fault of section 6 is `python3 "$TMPDIR/fault.py" <file> <occurrence> '<exact line>' $'<replacement>'`
(write a newline inside the replacement as `\n`). An exact line or replacement that contains `'` is
passed in double quotes (`"…"`), or with `\'` inside `$'…'`; for example row 10 is
`python3 "$TMPDIR/fault.py" "$o/check.ts" 1 "  return { optimizer: bag.resolve('optimizer') };" $'  const exposed = { optimizer: bag.resolve(\'optimizer\'), bag };\n  return exposed;'`.
Rows 11, 28, 39 and 40, and every other fault whose line holds a `'`, take the same form. A _prepend_ is
`{ printf '%s\n' '<line>'; cat <file>; } >"$TMPDIR/prepended.ts"` followed by
`cp "$TMPDIR/prepended.ts" <file>`. `erase.ts` is Bun's own TypeScript transpiler with every `import`
and `export … from` statement removed from its output: two files whose erased bodies are equal run the
same statements.

**The shared baseline block.** Slices 1 to 3 record their baselines with this block, `<n>` their
slice number; the lint and typecheck run first on purpose (addendum 14).

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
n=<n>
log="$TMPDIR/evidence/slice$n-lint-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-be-01 --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
log="$TMPDIR/evidence/slice$n-be01-unit-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test $(find src -name '*.test.ts' ! -name '*.db.test.ts' ! -name 'app.routes.test.ts' | sort)) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice$n-be01-db-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./src/service/optimization-coordinator.db.test.ts ./src/service/optimization-cancel.two-coordinator.db.test.ts ./src/service/optimization-events.db.test.ts ./src/service/optimization-restart.db.test.ts ./src/service/solver-child-lifecycle.db.test.ts ./src/services.db.test.ts) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
for entry in main dev/main; do
  name=$(printf '%s' "$entry" | tr / -)
  log="$TMPDIR/evidence/slice$n-$name-bundle-red.log"
  bundle="$TMPDIR/evidence/slice$n-$name-red.js"
  if bun build "apps/wbs/be-01/src/$entry.ts" --target=bun --outfile="$bundle" >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
  test -f "$bundle"
  for label in backend.optimization backend.solver-supervisor; do
    if count=$(grep -cF "$label" "$bundle"); then echo "$entry $label count=$count"; else status=$?; test "$status" -eq 1; echo "$entry $label count=0 (grep exit 1)"; fi
  done
done
```

Expect `exit=0` in all five logs. Call the be-01 unit pass count `E` and file count `EF`
(`app.routes.test.ts` and the two `*.proc.db.test.ts` suites are the planner's), and the database
pass count `D` and file count `DF` (observed `54` over 6 in every slice). A slice's `-green` bundle
rerun is the same loop with `-green` in place of `-red` in both file names.

**The kinds substitute.** `tools/tool-devsync/src/service-kinds.test.ts` compares `kinds.json` to
`git ls-files`, which the planner's staging settles. Run this filesystem substitute instead:

```sh
python3 -c "import json,os;e=json.load(open('docs/code-organization/kinds.json'))['entries'];print(len(e),[x['path'] for x in e if not os.path.isfile(x['path'])])"
```

### Slice 1 — Seal Optimization as a feature module and install it from `buildServices`

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e apps/wbs/be-01/src/module/optimization && echo "gate: module absent"
test -f libs/wbs/application/core/src/module/plan-commands/check.ts && echo "gate: G landed"
b=apps/wbs/be-01/src
wc -l < "$b/service/optimization-coordinator.ts"
wc -l < "$b/service/solver-child-lifecycle.ts"
grep -cF "coordinator = new OptimizationCoordinator({" "$b/services.ts"
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `737`, `106`, `1`, then a number: call it `K` (observed `88`).
Write the helpers, then run the shared baseline block with `n=1` (observed `E=520` over `EF=49`,
`D=54` over `DF=6`; every bundle count `0`, row 2). This slice ends at `E + 6` over `EF + 1`, `D` over
`DF`, and `K`.

1. `mkdir -p "$o"`, create `module.test.ts` there from 10.1 verbatim, and run
   `bun test ./apps/wbs/be-01/src/module/optimization/module.test.ts`. Expect row 1. Save the log.
   This red is evidence, not a commit.
2. Move the code. From the repository root:

```sh
set -euo pipefail
b=apps/wbs/be-01/src
o="$b/module/optimization"
cp "$b/service/optimization-coordinator.ts" "$o/optimization.feature.ts"
cp "$b/service/solver-child-lifecycle.ts" "$o/solver-child-lifecycle.ts"
cp "$b/service/optimized-schedule-reader.ts" "$o/optimized-schedule-reader.ts"
mv "$b/service/optimized-schedule-reader.test.ts" "$o/optimized-schedule-reader.test.ts"
```

Then apply 10.2's diff (four files: import lines, and the type declarations that move verbatim into
the contract), and replace the three former paths' content with 10.3's shims. The `mv` is an
**authorised deletion** of the old test path: its five tests must exist at exactly one path.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` in `$o` from 10.4 verbatim (no
   `Proof:` comments; no `module-index` block — slice 4 adds it). Run
   `bun test ./apps/wbs/be-01/src/module/optimization/` → row 3.
4. Apply 10.5's diff (`services.ts` installs through `installOptimization`; three `kinds.json` rows
   rewritten in place). Rerun the bundle loop with `-green` names → row 5.
5. Row 4, the gap: copy `$o/optimization.feature.ts` to `"$TMPDIR"`, inject the **clock** fault, run
   `bun test ./apps/wbs/be-01/src/service/clock.test.ts` → `4 pass`, restore with `cp`, prove with
   `cmp`. Save the patch and log. Then apply 10.6's diff (`clock.test.ts` scans every backend module
   directory and reads the moved coordinator) and rerun → `4 pass`.
6. `wbs-be-01` lint and typecheck under the status wrapper → exit 0. Only rule-17 diagnostics
   (`simple-import-sort/*`, `prettier/prettier`) may be fixed with `bunx eslint --fix` on files this
   slice owns; anything else is a stop.
7. The negatives, **one at a time, each restored and `cmp`-proved before the next**: rows 6-11
   against `bun test ./apps/wbs/be-01/src/module/optimization/module.test.ts` (for rows 10 and 11 also
   run `wbs-be-01:typecheck` on the mutated tree and record its exit 0); rows 12 (the **clock** fault
   again) and 13 (the **scan** fault) against `clock.test.ts`.
8. Only now apply 10.7's diff: the Proof comments in `module.ts`, `check.ts` and `clock.test.ts`.
   Change the date only if yours differs, and change a fragment only if what you saw differs (then
   record the difference).
9. Row 15, the erased-body comparison, with `base` set to step 0's value:

```sh
set -euo pipefail
b=apps/wbs/be-01/src
o="$b/module/optimization"
for pair in optimization-coordinator:optimization.feature solver-child-lifecycle:solver-child-lifecycle; do
  before=${pair%%:*}; after=${pair##*:}
  git show "$base:$b/service/$before.ts" >"$TMPDIR/erase-before-$before.ts"
  bun "$TMPDIR/erase.ts" "$TMPDIR/erase-before-$before.ts" >"$TMPDIR/evidence/slice1-erased-before-$before.js"
  bun "$TMPDIR/erase.ts" "$o/$after.ts" >"$TMPDIR/evidence/slice1-erased-after-$before.js"
  cmp "$TMPDIR/evidence/slice1-erased-before-$before.js" "$TMPDIR/evidence/slice1-erased-after-$before.js"
  echo "$before body identical"
done
```

Expect `optimization-coordinator body identical` and `solver-child-lifecycle body identical`. A
`cmp` difference is a stop: the move changed a statement.

10. The kinds substitute → `88 []` (`K` unchanged, no row naming a missing file).
11. Closing checks, each under the status wrapper: the be-01 unit command → `E + 6` over `EF + 1`
    (observed `526` over 50); the database command → `D` over `DF`; `bun test ./apps/wbs/be-01/src/service/clock.test.ts`
    → `4 pass`; `bun test ./apps/wbs/be-01/src/production-entrypoint.test.ts` → `2 pass`;
    `wbs-be-01` lint and typecheck → exit 0; `test "$(ls "$o" | wc -l)" -eq 9`;
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
12. Append to `openspec/changes/adopt-di-composition/verify.md` a `### Optimization, Slice 1 — <date>`
    section: `base`, `K`, `E`/`EF`, `D`/`DF`, rows 1-5, every fault of rows 6-13 with its fragment and
    evidence basenames, the erased-body result, the kinds substitute, and one line: "The feature still
    takes the SQLite `db` and calls the repository functions directly (K3, recorded in `contract.ts`,
    tracked under 3.6 and 7.4)". Prettier on it, then rerun the format check.
13. Hand-over: section 12's slice-1 modified and deleted paths must equal
    `git diff --name-only "$base"`, and its new paths `git ls-files --others --exclude-standard`.

Planner commit: `refactor(be-01): seal Optimization as a backend feature module`. The planner stages
with `git add -A` over exactly section 12's paths; Git's rename detection reports
`optimized-schedule-reader.test.ts` as a rename. The planner then runs `tool-devsync:test` whole
(three `kinds.json` rows) and the whole `wbs-be-01:test` (section 8).

### Slice 2 — Inject the cache-key port and add be-01's import-route check

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f apps/wbs/be-01/src/module/optimization/check.ts && echo "gate: slice 1 landed"
test ! -e apps/wbs/be-01/src/module-boundaries.test.ts && echo "gate: no be-01 route check yet"
grep -cF "scheduleInputHash(" apps/wbs/be-01/src/module/optimization/optimization.feature.ts
grep -c "new OptimizationCoordinator({" apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
```

Expect `base=…`, the three gate lines, `3`, `7`. Write the helpers, then run the shared baseline block
with `n=2` (observed `E=526` over `EF=50`, `D=54` over `DF=6`; `backend.optimization count=1` in both
bundles, `backend.solver-supervisor` `0`). This slice ends at `E + 2` over `EF + 1` and `D` over `DF`.

1. Create `apps/wbs/be-01/src/module-boundaries.test.ts` from 10.8 verbatim and run
   `bun test ./apps/wbs/be-01/src/module-boundaries.test.ts` → row 16 (about four seconds). Save it.
   This red on the unchanged feature is the check's own first observation.
2. Apply 10.9's diff (`o/module.test.ts`: the `hashInput` requirement and host key, the new Retry case,
   and `inputHash` in the identity case). Run `bun test ./apps/wbs/be-01/src/module/optimization/module.test.ts`
   and `wbs-be-01:typecheck`, each under the status wrapper → row 17. Save both. This red is evidence,
   not a commit.
3. Apply 10.10's diff (the port: `contract.ts`, the feature's three expressions and its option,
   `module.ts`, `check.ts`, the README sentence, `services.ts`, and one `hashInput: scheduleInputHash,`
   in each of the fourteen database-test constructions, plus that import in the spawn-handshake suite).
   Run `bun test ./apps/wbs/be-01/src/module/optimization/ ./apps/wbs/be-01/src/module-boundaries.test.ts`
   → row 18.
4. `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
5. The negatives, one at a time, each restored and `cmp`-proved: row 19 against the module test;
   rows 20-29 against `bun test ./apps/wbs/be-01/src/module-boundaries.test.ts`. Each of rows 20-24 must
   show **exactly** the violation(s) named, no more.
6. Only now apply 10.11's diff (the Proofs in `module.ts` and the boundary file).
7. Row 31, with `base` set to step 0's value:

```sh
set -euo pipefail
o=apps/wbs/be-01/src/module/optimization
git show "$base:$o/optimization.feature.ts" >"$TMPDIR/erase-before-feature.ts"
bun "$TMPDIR/erase.ts" "$TMPDIR/erase-before-feature.ts" >"$TMPDIR/evidence/slice2-erased-before.js"
bun "$TMPDIR/erase.ts" "$o/optimization.feature.ts" >"$TMPDIR/evidence/slice2-erased-after.js"
log="$TMPDIR/evidence/slice2-erased.diff"
if diff "$TMPDIR/evidence/slice2-erased-before.js" "$TMPDIR/evidence/slice2-erased-after.js" >"$log"; then status=0; else status=$?; fi
test "$status" -eq 1
grep -c '^[<>]' "$log"
cat "$log"
```

Expect `6` and exactly three `<`/`>` pairs, each pair differing only in `scheduleInputHash(` →
`this.options.hashInput(` (section 15 pastes the rehearsed output). Anything else is a stop.

8. Closing checks, each under the status wrapper: the be-01 unit command → `E + 2` over `EF + 1`
   (observed `528` over 51); the database command → `D` over `DF`; `wbs-be-01` lint and typecheck →
   exit 0; the format check → exit 0.
9. Append `### Optimization cache-key port, Slice 2 — <date>` to `verify.md`: `base`, `E`/`EF`,
   `D`/`DF`, rows 16-18, every fault of rows 19-29 with fragments and evidence basenames, the
   erased-body diff, and the line: "`module-boundaries.test.ts` resolves module specifiers and
   identifiers; a member selected by string key out of an allowed barrel is its stated residual".
   Prettier on it, then the format check.
10. Hand-over as in slice 1, against section 12's slice-2 lists.

Planner commit: `refactor(be-01): inject the Optimization cache-key port and check its import routes`.
The planner then runs the whole `wbs-be-01:test`, which includes the spawn-handshake suite this slice
edits (section 8).

### Slice 3 — Seal the Solver supervisor as a repository module and install it from `main.ts`

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f apps/wbs/be-01/src/module-boundaries.test.ts && echo "gate: slice 2 landed"
test ! -e apps/wbs/be-01/src/module/solver-supervisor && echo "gate: module absent"
b=apps/wbs/be-01/src
wc -l < "$b/service/solver-supervisor-client.ts"
wc -l < "$b/service/solver-supervisor-spawner.ts"
head -1 "$b/service/solver-supervisor-spawner.ts"
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the three gate lines, `277`, `47`,
`import type { ReservedSolverChild, ReservedSpawner } from './optimization-coordinator';`, then `K`
(observed `88`). Write the helpers, then run the shared baseline block with `n=3` (observed `E=528`
over `EF=51`, `D=54` over `DF=6`; `backend.optimization count=1` in both bundles,
`backend.solver-supervisor count=0` in both). This slice ends at `E + 5` over `EF + 1`, `D` over `DF`
and `K - 1`.

1. `mkdir -p "$s"`, create `module.test.ts` there from 10.12 verbatim, and run
   `bun test ./apps/wbs/be-01/src/module/solver-supervisor/module.test.ts` → row 32. Save it.
2. Move the code:

```sh
set -euo pipefail
b=apps/wbs/be-01/src
s="$b/module/solver-supervisor"
cp "$b/service/solver-supervisor-client.ts" "$s/solver-supervisor.repository.ts"
mv "$b/service/solver-supervisor-client.test.ts" "$s/solver-supervisor.repository.test.ts"
mv "$b/service/solver-supervisor-spawner.ts" "$s/solver-supervisor-spawner.ts"
mv "$b/service/solver-supervisor-spawner.test.ts" "$s/solver-supervisor-spawner.test.ts"
```

Run `wbs-be-01:typecheck` under the status wrapper → row 33 (exit 1: the moved mapper still imports the
coordinator by its old relative path). Save it; it is evidence, not a commit. Then apply 10.13's diff
(import lines of the three moved files; the copied repository file needs none), and replace
`service/solver-supervisor-client.ts`'s content with 10.14's shim. The three `mv`s are **authorised
deletions**: the mapper's only production importer is `main.ts`, which step 4 moves to the installer,
and each test must exist at exactly one path.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` in `$s` from 10.15 verbatim (no
   `Proof:` comments; no `module-index` block). Run `bun test ./apps/wbs/be-01/src/module/solver-supervisor/`
   → row 34.
4. Apply 10.16's diff (`main.ts` installs through `installSolverSupervisor`; `kinds.json` rewrites the
   client row to a shim and removes the mapper's). Rerun the bundle loop with `-green` names, then
   `bun test ./apps/wbs/be-01/src/production-entrypoint.test.ts` → row 35.
5. Apply 10.17's diff (the boundary file's Supervisor rule, its JSDoc sentence and the scanned-file
   control for the mapper). Rerun `bun test ./apps/wbs/be-01/src/module-boundaries.test.ts` → `1 pass`.
6. `wbs-be-01` lint and typecheck → exit 0; rule-17 fixes only.
7. The negatives, one at a time, each restored and `cmp`-proved: rows 36-40 against
   `bun test ./apps/wbs/be-01/src/module/solver-supervisor/module.test.ts` (rows 39 and 40 also with
   `wbs-be-01:typecheck` on the mutated tree, exit 0); rows 41 and 42 against the boundary file.
8. Only now apply 10.18's diff (the Proofs in `s/module.ts`, `s/check.ts` and the boundary file).
9. `cmp "$s/solver-supervisor.repository.ts" <(git show "$base:apps/wbs/be-01/src/service/solver-supervisor-client.ts")`
   → exit 0 (the repository file moved unchanged); the kinds substitute → `87 []` (`K - 1`).
10. Closing checks, each under the status wrapper: the be-01 unit command → `E + 5` over `EF + 1`
    (observed `533` over 52); the database command → `D` over `DF`; the entrypoint test → `2 pass`;
    `wbs-be-01` lint and typecheck → exit 0; `test "$(ls "$s" | wc -l)" -eq 9`; the format check → exit 0.
11. Append `### Solver supervisor, Slice 3 — <date>` to `verify.md`: `base`, `K` before and after,
    `E`/`EF`, `D`/`DF`, rows 32-35, every fault of rows 36-42 with fragments and evidence basenames, the
    `cmp` result, and the line: "The mapper keeps no former path; its `kinds.json` repository row is
    removed, the module README names it private support". Prettier on it, then the format check.
12. Hand-over as in slice 1, against section 12's slice-3 lists.

Planner commit: `refactor(be-01): seal the Solver supervisor as a backend repository module`. The
planner then runs `tool-devsync:test` whole (one row rewritten, one removed) and the whole
`wbs-be-01:test` (section 8).

### Slice 4 — Register both modules in the wiki content-review pilot and record the tasks

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- apps/wbs/be-01/src/module/solver-supervisor/module.ts
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- apps/be-01/src/service/optimization-coordinator.ts
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- apps/be-01/src/service/solver-supervisor-client.ts
```

Expect `base=…`, the gate, a commit hash (slice 3's), `M` and `B` (observed `20` and `20`), then
exactly `100644 blob 5a8c8f54f430cd67e29d12d3f35b4d77a2d9ae39	apps/be-01/src/service/optimization-coordinator.ts`
and `100644 blob 31b66e999d627f2b2cd2709893c449dcfab8b3f8	apps/be-01/src/service/solver-supervisor-client.ts`.
If either line is missing or differs, stop. Then, before any edit, each under the status wrapper:

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all. Call the pilot file's tests, failures and `expect()` calls `T`, `TF`, `P`
(observed `21`, `0`, `307`; the run takes about 300 seconds). The legacy pin passes (`1 pass`). Run the
OpenSpec validation standard block and call `passed` `N` (observed `114`).

**Registration, in the order it must be observed.** The pilot suite clones committed `HEAD` and
overlays only `pilotPaths` from the working tree (`pilot-policy.test.ts:30-58`); slices 1 to 3 are
committed, so both modules' files are in `HEAD`, and their READMEs there have no `module-index` block
yet. The filtered command is

```sh
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples")
```

(about 35 seconds).

1. Apply 10.19 (`modules.json`: two rows, sorted around E6's). Run the filtered command → the
   PARITY red, row 44. Save it.
2. Apply 10.20 (`policy.json`: two boundaries appended last). Rerun → the DISCOVERED-INDEX red, row 45.
   Save it.
3. Apply 10.21 whole (the two `pilotPaths` entries around E6's, and each README's `module-index` block,
   `check.be-01.test` sentence and "Wiki registration"; the Optimization README also names the
   Supervisor as a consumer). Rerun → row 46.
4. Rerun the **whole** pilot file → row 47: exactly `refuses prose facts presented as applicable
checks` fails, naming the Optimization README. Save it.
5. Apply 10.22 (the prose pin and its note). Rerun the whole pilot file → row 48: `T` tests, `TF`
   failures, `P + 2` assertions.
6. Rerun the legacy-pin test **with the pin unchanged** → red (row 49). Save it. Only then apply
   10.23 (the numbers), rerun → `1 pass` (row 50), and then apply 10.24 (the Proof comment). No other
   pinned literal in that file may move; if one does, stop. If the observed digest differs from row
   49's, stop: the tree differs from the rehearsal.
7. Apply 10.25 (`tasks.md`: 1.5, 1.6 and 4.2 ticked with dated notes; 3.6's dated note, **not ticked**;
   E6's 4.2 sentence "Supervisor is not landed, so not ticked" becomes "Supervisor was not landed then";
   7.5's running note extended).
8. Rerun step 0's run-many typecheck, `twilight-burokrat:lint:source` and `tool-devsync:lint` →
   exit 0; rerun the legacy-pin test alone → `1 pass`. Do **not** run
   `repo-namespacing-handoff.test.ts` whole: its `production index checker resolves current Markdown
links` test spawns `check-indexes working`, which writes Git objects, so the whole file is
   planner-only (section 8). The OpenSpec block → `passed` `N`, `failed` `0`.
9. Append `### Optimization and Solver supervisor registration, Slice 4 — <date>` to `verify.md`:
   `base`, `M`, `B`, both frozen tuples, rows 44-47 with evidence basenames, `T`/`TF`/`P` before and
   after, rows 49 and 50, the three checks, `N`. Prettier on it, then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
10. Hand-over as in slice 1, against section 12's slice-4 lists.

Planner commit: `docs(be-01): register Optimization and the Solver supervisor in the wiki content-review pilot`.

**Planner-only, after this commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 4 commit>`
is **index validation** (`checkIndexes`), not the `MOD-LAYOUT` rule. Rehearsed against the throwaway
slice-4 commit: exit 0, 26 indexes, `module.backend.optimization` and `module.backend.solver-supervisor`
with eight members each and `applicableChecks` `["check.be-01.test"]`; `reviewDebt` empty.

## 8. Planner-only checks

| Check                                                                                                                                                                                             | Why the planner's                                                                                               | Observed on the rehearsed tree                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moved-code identity: copy the `$base` versions of every moved file to scratch, apply 10.2 and 10.13 to them, and `cmp` with the committed module files; rerun section 7's erased-body comparisons | Proves the moved bodies differ only in 10.2's and 10.13's lines, and the port only in its three expressions     | section 15's script reproduces every tree; erased bodies identical (slice 1) and three lines apart (slice 2)                                                      |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged                                                                      | Writes Git objects; `service-kinds.test.ts` needs the staged tree (slices 1 and 3 change `kinds.json`)          | slice-4 rehearsal commit: `366 pass`, `0 fail` over 25 files, exit 0 (37 s); slices 1 and 3 **not run** separately                                                |
| `(cd apps/wbs/be-01 && bun test)` (the whole `wbs-be-01:test` command, without coverage)                                                                                                          | Opens SQLite databases, spawns processes, and holds `app.routes.test.ts` and the two `*.proc.db.test.ts` suites | `1110 pass`, `1 skip`, `0 fail` over 95 files on the slice-4 rehearsal commit (97 s); `optimization-spawn-handshake.proc.db.test.ts` alone `1 pass` after slice 2 |
| `apps/wiki/cli` `trusted-policy`, `relocation-activation`, `committed-target-facts`, `classification`, `activation`, `gate-entrypoints` and `release` test files together                         | They read `modules.json` or `policy.json`                                                                       | `187 pass`, `0 fail` on the slice-4 rehearsal commit (209 s)                                                                                                      |
| `check-indexes committed` on slice 4                                                                                                                                                              | Index validation, not MOD-LAYOUT                                                                                | 26 indexes, both new modules with eight members, no review debt                                                                                                   |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the whole file                                                                                                              | Its `production index checker resolves current Markdown links` test spawns `check-indexes working`              | the executor runs only `-t "every legacy source occurrence"`; the whole file ran green inside the `tool-devsync:test` row above                                   |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test` and `:test:package`, and `apps/wiki/cli`'s packaging suites                                                                                  | Whole listener suite; package suites listen and read the policy files                                           | **not run**                                                                                                                                                       |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                        | Host-wide heavy lock                                                                                            | **not run**                                                                                                                                                       |

This table supplements the batch-1 README's "Integration verification" matrix.

**Stage the moves before `tool-devsync:test`.** `repo-namespacing-handoff.test.ts` enumerates
`git ls-files` and reads those paths from disk, so on a tree where slice 1's or slice 3's `mv` is not
yet staged it throws `ENOENT` on the moved test's former path; the planner runs that target only after
`git add -A` over section 12's paths.

**Between slices 1 and 4** each new module directory holds a `.feature.ts` or `.repository.ts` file and
a README with no `module-index` block, which the Burokrat rule model's `MOD-LAYOUT` observation reports
as "module directory declares no wiki index", as for E5-G; slice 4 closes it. The blocks are withheld on
purpose: with them in `HEAD`, slice 4's DISCOVERED-INDEX red could not be observed.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What the next 040.6 packets should be

1. **Optimization's repository ports (closes task 3.6).** First a written state machine of the
   coordinator's admission, launch, heartbeat, cancel, restart and retry, with its invariants; then an
   `fc.asyncModelRun` model-based test over a fake repository port and a scheduler, with re-entrant
   requests from inside callbacks, partial acquisition and controlled timeouts, proven by four
   sabotages with pasted shrunk counterexamples (addendum 16); only then queue, generation, cache,
   slot (admission, bind, heartbeat, release, drain) and outcome ports replacing the feature's `db`,
   its fourteen repository functions and the lifecycle's two, with `@wbs/store-sqlite` implementing them in
   `services.ts`, and the fourteen test constructions moved to the ports. Widen
   `module-boundaries.test.ts`'s first rule to every `libs/wbs/adapters/` and be-01 `repository/` file.
2. **Task 6.2's domain moves** for `solver-exit-outcome.ts` and `solver-request-pair.ts`, which the
   feature and the Supervisor's test still import through `service/`.
3. **Retire the shims** whose importers can move (task 7.1): `app.ts` and `dev/local-solver-spawner.ts`
   can name the Optimization contract and feature directly; the Supervisor scripts the module's
   repository file.

## 10. Exact content

`o` below is `apps/wbs/be-01/src/module/optimization`, `s` is
`apps/wbs/be-01/src/module/solver-supervisor`. Listings are complete file contents; diffs apply with
`git apply` from the repository root.

### 10.1 `o/module.test.ts` (slice 1 step 1)

```ts
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installOptimization } from './check';
import { OPTIMIZATION_LABEL, type OptimizationRequirements } from './contract';
import { optimizationModule } from './module';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CONTRACT = '7+0.1.0';
const BUDGET_MS = 60_000;

const INPUT: ScheduleInput = {
  rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: null }],
  edges: [],
  slices: [
    {
      workItemId: 'w-1',
      stepId: 's-1',
      days: 1,
      personId: null,
      width: 1,
      poolIds: [],
    },
  ],
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
};

/**
 * Requirements whose SQLite handles are empty stand-ins.
 *
 * Every case below stops before the coordinator's first repository call — an
 * idle plan read, a Retry refused as stale, an edit whose enabled read
 * fails — so a real database would only make this a `*.db.test.ts` suite
 * without being read. A case that reached SQLite would fail on the stand-in.
 */
function requirements(): OptimizationRequirements {
  return {
    db: {} as unknown as OptimizationRequirements['db'],
    contractVersion: CONTRACT,
    solverVersion: '0.1.0',
    budgetMs: BUDGET_MS,
    ownerId: 'owner',
    now: () => 10,
    attemptToken: () => 'attempt-1',
    inputOf: () => Promise.resolve(INPUT),
    enabledOf: () => Promise.resolve(true),
    spawn: () => Promise.reject(new Error('the module test launches no solver')),
    onChildError: (error) => {
      throw error;
    },
    eventLog: {} as unknown as OptimizationRequirements['eventLog'],
    pushRecorded: () => Promise.resolve(),
  };
}

const hostRequirements = () => {
  const supplied = requirements();
  return {
    db: DiBag.fromSyncFactory(() => supplied.db),
    contractVersion: DiBag.fromSyncFactory(() => supplied.contractVersion),
    solverVersion: DiBag.fromSyncFactory(() => supplied.solverVersion),
    budgetMs: DiBag.fromSyncFactory(() => supplied.budgetMs),
    ownerId: DiBag.fromSyncFactory(() => supplied.ownerId),
    now: DiBag.fromSyncFactory(() => supplied.now),
    attemptToken: DiBag.fromSyncFactory(() => supplied.attemptToken),
    inputOf: DiBag.fromSyncFactory(() => supplied.inputOf),
    enabledOf: DiBag.fromSyncFactory(() => supplied.enabledOf),
    spawn: DiBag.fromSyncFactory(() => supplied.spawn),
    runChild: DiBag.fromSyncFactory(() => supplied.runChild),
    eventLog: DiBag.fromSyncFactory(() => supplied.eventLog),
    pushRecorded: DiBag.fromSyncFactory(() => supplied.pushRecorded),
    editDebounceMs: DiBag.fromSyncFactory(() => supplied.editDebounceMs),
    sleep: DiBag.fromSyncFactory(() => supplied.sleep),
    setInterval: DiBag.fromSyncFactory(() => supplied.setInterval),
    clearInterval: DiBag.fromSyncFactory(() => supplied.clearInterval),
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
    .installModule(optimizationModule)
    .register({
      ...hostRequirements(),
      onChildError: DiBag.fromSyncFactory(() => requirements().onChildError),
    })
    .build();

describe('the Optimization module', () => {
  it('reads an idle plan under the identity installOptimization wires', () => {
    const { optimizer } = installOptimization(requirements());

    const read = optimizer.readPlan({
      projectId: PROJECT,
      objective: 'pri',
      input: INPUT,
      enabled: false,
    });

    expect(read).toMatchObject({
      projectId: PROJECT,
      contractVersion: CONTRACT,
      budgetMs: BUDGET_MS,
      generation: null,
      variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
      schedules: { pri: null, time: null },
    });
  });

  it('reports a failed edit read to the error sink installOptimization wires', async () => {
    const refused = new Error('enabled read refused');
    const failures: unknown[] = [];
    const { optimizer } = installOptimization({
      ...requirements(),
      editDebounceMs: 0,
      sleep: () => Promise.resolve(),
      enabledOf: () => Promise.reject(refused),
      onChildError: (error) => {
        failures.push(error);
      },
    });

    optimizer.inputChanged(PROJECT);
    await optimizer.drain();

    expect(failures).toEqual([refused]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `OptimizationExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installOptimization(requirements());

    expect(Object.keys(exposed)).toEqual(['optimizer']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('optimizationOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "optimizationOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${OPTIMIZATION_LABEL}/optimizationOptions`,
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
      .installModule(optimizationModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('optimizer')).toThrow(
      `Cannot resolve "${OPTIMIZATION_LABEL}/optimizationOptions": dependency "onChildError" is not registered. Resolution path: optimizer -> ${OPTIMIZATION_LABEL}/optimizationOptions -> onChildError.`,
    );
  });
});
```

### 10.2 The four moved Optimization files (slice 1 step 2 — applied after the `cp`/`mv`)

Import lines, the spawn, child and event declarations that move verbatim into `contract.ts`, the
dropped `@wbs/store-sqlite` re-export no importer used, and the lifecycle's `SolverChildProcess`
declaration, which it now imports from the contract.

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/optimization.feature.ts b/apps/wbs/be-01/src/module/optimization/optimization.feature.ts
--- a/apps/wbs/be-01/src/module/optimization/optimization.feature.ts
+++ b/apps/wbs/be-01/src/module/optimization/optimization.feature.ts
@@ -1,45 +1,54 @@
-import type { BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
 import {
   dispositionOfExitCode,
   dispositionOfPreflightFailure,
 } from '@wbs/contracts/solver/solver-failure-disposition';
-import type { ProjectEvent, RecordedEvent } from '@wbs/core';
+import type { RecordedEvent } from '@wbs/core';
 import type { Schedule, SolverObjectiveName } from '@wbs/domain';
 import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
-import {
-  type OptimizationOutcomeEvent,
-  storeOptimizedOutcomeAndRecord,
-} from '@wbs/store-sqlite/optimized-outcome';
+import { storeOptimizedOutcomeAndRecord } from '@wbs/store-sqlite/optimized-outcome';

-import type { Drizzle } from '../repository/db';
-import type { EventLogTransactionalWrite } from '../repository/event-log';
+import type { Drizzle } from '../../repository/db';
+import type { EventLogTransactionalWrite } from '../../repository/event-log';
 import {
   bindSolverSlot,
   reserveSolverSlot,
   reserveSolverSlotIn,
   solverAdmissionStartedAt,
   type SolverSlotAdmission,
-} from '../repository/optimization-admission';
+} from '../../repository/optimization-admission';
 import {
   DRAIN_RECONCILE_INTERVAL_MS,
   reconcileOptimizationDrains,
   releaseSolverSlot,
-} from '../repository/optimization-drain';
-import { allocateEnabledGeneration, readGeneration } from '../repository/optimization-generation';
+} from '../../repository/optimization-drain';
+import {
+  allocateEnabledGeneration,
+  readGeneration,
+} from '../../repository/optimization-generation';
 import {
   dequeueSolverRequest,
   enqueueSolverRequest,
   enqueueSolverRequestIn,
-} from '../repository/optimization-queue';
+} from '../../repository/optimization-queue';
 import {
   optimizedVariantIsLive,
   type OutcomeWrite,
   type OutcomeWriteResult,
   readOptimizedPair,
   readOptimizedPairAndSpawn,
-  type SpawnRequest,
-} from '../repository/optimized-schedule-cache';
-import { scheduleInputHash } from '../repository/schedule-input-hash';
+} from '../../repository/optimized-schedule-cache';
+import { scheduleInputHash } from '../../repository/schedule-input-hash';
+import {
+  evaluateSolverOutcome,
+  type SolverProcessOutcome,
+} from '../../service/solver-exit-outcome';
+import { buildSolverRequestPair, type SolverRequestPair } from '../../service/solver-request-pair';
+import type {
+  OptimizationOutcomeEvent,
+  ReservedSolverChild,
+  ReservedSpawner,
+  ReservedSpawnRequest,
+} from './contract';
 import {
   type OptimizationVariantState,
   optimizationVariantState,
@@ -49,10 +58,7 @@ import {
   runSolverChildLifecycle,
   type SolverChildLifecycleOptions,
   type SolverChildLifecycleResult,
-  type SolverChildProcess,
 } from './solver-child-lifecycle';
-import { evaluateSolverOutcome, type SolverProcessOutcome } from './solver-exit-outcome';
-import { buildSolverRequestPair, type SolverRequestPair } from './solver-request-pair';

 export interface OptimizationCoordinatorOptions {
   readonly db: Drizzle;
@@ -91,44 +97,6 @@ export interface OptimizationCoordinatorOptions {
 }

 type ReservedAdmission = Extract<SolverSlotAdmission, { kind: 'reserved' }>;
-type SolverRequest = Extract<BuiltSolverRequest, { readonly ok: true }>['request'];
-export type ScheduleOptimizedEvent = Extract<ProjectEvent, { type: 'schedule_optimized' }>;
-export type ScheduleOptimizationFailedEvent = Extract<
-  ProjectEvent,
-  { type: 'schedule_optimization_failed' }
->;
-export type ScheduleOptimizationInfeasibleEvent = Extract<
-  ProjectEvent,
-  { type: 'schedule_optimization_infeasible' }
->;
-export {
-  type OptimizationOutcomeEvent,
-  storeOptimizedOutcomeAndRecord,
-} from '@wbs/store-sqlite/optimized-outcome';
-
-/** Everything the launcher needs from the read and its successful reservation. */
-export interface ReservedSpawnRequest extends SpawnRequest {
-  readonly generation: number;
-  readonly admission: ReservedAdmission;
-  /** The exact deterministic request written to the launcher's stdin after bind. */
-  readonly request: SolverRequest;
-  /** The canonical input used to materialise and independently revalidate the response. */
-  readonly input: ScheduleInput;
-}
-
-export interface ReservedSolverTerminal {
-  readonly exitCode: number;
-  readonly deadlineKilled: boolean;
-  readonly oomKilled: boolean;
-}
-
-/** The authenticated host child and the streams its lifecycle drains immediately. */
-export interface ReservedSolverChild extends SolverChildProcess {
-  readonly terminal?: Promise<ReservedSolverTerminal>;
-  readonly verdict: (verdict: 'bound' | 'abort') => void | Promise<void>;
-}
-
-export type ReservedSpawner = (request: ReservedSpawnRequest) => Promise<ReservedSolverChild>;

 export type OptimizationRetryResult =
   | { readonly kind: 'stale-input-hash'; readonly currentInputHash: string }
diff --git a/apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts b/apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts
--- a/apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts
+++ b/apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts
@@ -1,9 +1,10 @@
-import type { Drizzle } from '../repository/db';
+import type { Drizzle } from '../../repository/db';
 import {
   heartbeatSolverSlot,
   type SolverSlotHeartbeatOutcome,
-} from '../repository/optimization-admission';
-import { releaseSolverSlot, type SolverSlotRelease } from '../repository/optimization-drain';
+} from '../../repository/optimization-admission';
+import { releaseSolverSlot, type SolverSlotRelease } from '../../repository/optimization-drain';
+import type { SolverChildProcess } from './contract';
 export const SOLVER_HEARTBEAT_INTERVAL_MS = 5_000;

 export interface SolverChildSlot extends SolverSlotRelease {
@@ -16,14 +17,6 @@ export interface SolverChildExit {
   readonly stderr: string;
 }

-export interface SolverChildProcess {
-  readonly pid: number;
-  readonly stdout: ReadableStream<Uint8Array>;
-  readonly stderr: ReadableStream<Uint8Array>;
-  readonly exited: Promise<number>;
-  readonly kill: () => void | Promise<void>;
-}
-
 export type SolverChildLifecycleResult =
   | { readonly kind: 'exited'; readonly code: number }
   | {
diff --git a/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.ts b/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.ts
--- a/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.ts
+++ b/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.ts
@@ -1,6 +1,6 @@
 import type { OptimizedScheduleAsk, OptimizedScheduleRead } from '@wbs/core';

-export { optimizationVariantState } from '../repository/optimized-schedule-cache';
+export { optimizationVariantState } from '../../repository/optimized-schedule-cache';
 export type {
   OptimizationVariantState,
   OptimizedScheduleAsk,
diff --git a/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.test.ts b/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.test.ts
--- a/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.test.ts
+++ b/apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.test.ts
@@ -1,7 +1,7 @@
 import type { OptimizedResult } from '@wbs/contracts/solver/optimized-result';
 import { describe, expect, it } from 'bun:test';

-import type { CachedOutcome } from '../repository/optimized-schedule-cache';
+import type { CachedOutcome } from '../../repository/optimized-schedule-cache';
 import { optimizationVariantState } from './optimized-schedule-reader';

 const STORED = { generation: 4, createdAt: 12 } as const;
```

### 10.3 The three compatibility shims (slice 1 step 2 — full replacement content)

`apps/wbs/be-01/src/service/optimization-coordinator.ts`:

```ts
/**
 * Compatibility re-export: the Optimization coordinator moved into its own
 * sealed module, and the spawn, child and outcome-event types it declared moved
 * into that module's contract.
 *
 * Kept because `app.ts`, `dev/local-solver-spawner.ts`,
 * `controller/project.controller.test.ts`, `services.db.test.ts` and the
 * optimization database tests import this path.
 * It goes when every importer names the module.
 */
export * from '../module/optimization/contract';
export * from '../module/optimization/optimization.feature';
```

`apps/wbs/be-01/src/service/solver-child-lifecycle.ts`:

```ts
/**
 * Compatibility re-export: the solver child lifecycle moved into the
 * Optimization module as its private support.
 *
 * Kept because `service/solver-child-lifecycle.db.test.ts`,
 * `service/optimization-coordinator.db.test.ts` and
 * `service/optimization-cancel.two-coordinator.db.test.ts` import this path.
 * It goes when every importer names the module.
 */
export * from '../module/optimization/solver-child-lifecycle';
```

`apps/wbs/be-01/src/service/optimized-schedule-reader.ts`:

```ts
/**
 * Compatibility re-export: the optimized schedule reader moved into the
 * Optimization module as its private support.
 *
 * Kept because `controller/work-item.controller.test.ts` and the plan-read
 * tests under `service/` import this path. It goes when every importer names
 * the module.
 */
export * from '../module/optimization/optimized-schedule-reader';
```

### 10.4 Optimization's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type { BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
import type { ProjectEvent } from '@wbs/core';
import type { SolverObjectiveName } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type {
  OptimizationCoordinator,
  OptimizationCoordinatorOptions,
} from './optimization.feature';

/** The exact deterministic request a launcher writes to the solver's stdin. */
type SolverRequest = Extract<BuiltSolverRequest, { readonly ok: true }>['request'];

/**
 * The cache address one solve answers: a plan read's key without its
 * objective.
 *
 * Declared here, and not borrowed from `@wbs/store-sqlite`'s
 * `OptimizedCacheKey`, so that the spawn port names no repository row type.
 * SQLite's key carries exactly these four members, so it is assignable here
 * without a conversion.
 */
export interface OptimizationCacheKey {
  readonly projectId: string;
  readonly inputHash: string;
  readonly contractVersion: string;
  readonly budgetMs: number;
}

/**
 * The counted solver seat an attempt holds while its launcher runs.
 *
 * The `reserved` answer of SQLite's slot admission, restated as the port's own
 * type for the reason {@link OptimizationCacheKey} gives.
 */
export interface ReservedSolverAdmission {
  readonly kind: 'reserved';
  readonly attemptToken: string;
  readonly admittedCancelEpoch: number;
  readonly childDeadlineAt: number;
  readonly admittedDeadlineAt: number;
}

/** Everything the launcher needs from the read and its successful reservation. */
export interface ReservedSpawnRequest {
  readonly key: OptimizationCacheKey;
  readonly objective: SolverObjectiveName;
  readonly generation: number;
  readonly admission: ReservedSolverAdmission;
  /** The exact deterministic request written to the launcher's stdin after bind. */
  readonly request: SolverRequest;
  /** The canonical input used to materialise and independently revalidate the response. */
  readonly input: ScheduleInput;
}

export interface ReservedSolverTerminal {
  readonly exitCode: number;
  readonly deadlineKilled: boolean;
  readonly oomKilled: boolean;
}

/** A solver child as the coordinator's lifecycle owns it: both streams, its exit and a kill. */
export interface SolverChildProcess {
  readonly pid: number;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly kill: () => void | Promise<void>;
}

/** The authenticated host child and the streams its lifecycle drains immediately. */
export interface ReservedSolverChild extends SolverChildProcess {
  readonly terminal?: Promise<ReservedSolverTerminal>;
  readonly verdict: (verdict: 'bound' | 'abort') => void | Promise<void>;
}

/**
 * The launcher port: called only after SQLite returned this attempt's counted
 * `starting` row. The Supervisor and the development-only local launcher each
 * implement it; the Optimization feature never names either.
 */
export type ReservedSpawner = (request: ReservedSpawnRequest) => Promise<ReservedSolverChild>;

/** A stored `ok` result's project event, projected from the neutral `ProjectEvent`. */
export type ScheduleOptimizedEvent = Extract<ProjectEvent, { type: 'schedule_optimized' }>;
/** A stored failure's project event, projected from the neutral `ProjectEvent`. */
export type ScheduleOptimizationFailedEvent = Extract<
  ProjectEvent,
  { type: 'schedule_optimization_failed' }
>;
/** A stored infeasibility certificate's project event, projected from the neutral `ProjectEvent`. */
export type ScheduleOptimizationInfeasibleEvent = Extract<
  ProjectEvent,
  { type: 'schedule_optimization_infeasible' }
>;
/** The three events a stored solver outcome publishes, and nothing else. */
export type OptimizationOutcomeEvent =
  ScheduleOptimizedEvent | ScheduleOptimizationFailedEvent | ScheduleOptimizationInfeasibleEvent;

/**
 * What a host must supply to install {@link optimizationModule}.
 *
 * Exactly {@link OptimizationCoordinatorOptions}, unchanged by the move but
 * for the spawn, child and outcome-event types it now takes from this
 * contract. `bootBe01` starts and stops the one coordinator a process holds;
 * the module registers no disposer.
 *
 * **K3 debt disclosed.** The backend module map gives Optimization queue,
 * generation, cache, slot and outcome repository ports. This extraction does
 * not add them: the feature still takes the SQLite `db` and calls
 * `@wbs/store-sqlite`'s queue, admission, drain, generation, cache and
 * outcome functions directly, and its private `solver-child-lifecycle.ts`
 * does the same for heartbeat and release. Those calls sit inside the spawn,
 * cancel and restart interleavings the coordinator owns, so replacing them is
 * its own change with an interleaving test. Tracked under tasks 3.6 and 7.4
 * of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type OptimizationRequirements = OptimizationCoordinatorOptions;

/** What installing {@link optimizationModule} adds to a host graph. */
export interface OptimizationExports {
  readonly optimizer: OptimizationCoordinator;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The module lives under `apps/wbs/be-01`, so its wiki module identifier
 * carries the runtime word, `module.backend.optimization`, and the label drops
 * the `module.` prefix.
 */
export const OPTIMIZATION_LABEL = 'backend.optimization';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import { OPTIMIZATION_LABEL } from './contract';
import {
  OptimizationCoordinator,
  type OptimizationCoordinatorOptions,
} from './optimization.feature';

type CoordinatorOption<K extends keyof OptimizationCoordinatorOptions> =
  OptimizationCoordinatorOptions[K];

/**
 * Optimization as a sealed DI Bag module.
 *
 * Only `optimizer` is exported. `optimizationOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `backend.optimization/optimizationOptions` rather than
 * against an anonymous binding. The five optional seams (`runChild`,
 * `editDebounceMs`, `sleep`, `setInterval`, `clearInterval`) are registered
 * even when absent, as `undefined`, so the coordinator keeps its own defaults
 * exactly as a direct construction does.
 *
 * The module registers no disposer: `bootBe01` starts the coordinator's
 * reconciliation after composition and awaits its `stop()` in its tested
 * shutdown order, and a second owner here would stop it twice.
 */
export const optimizationModule = DiBag.createBuilder()
  .register({
    optimizationOptions: DiBag.fromSyncFactory(
      ({
        db,
        contractVersion,
        solverVersion,
        budgetMs,
        ownerId,
        now,
        attemptToken,
        inputOf,
        enabledOf,
        spawn,
        runChild,
        onChildError,
        eventLog,
        pushRecorded,
        editDebounceMs,
        sleep,
        setInterval,
        clearInterval,
      }: {
        db: CoordinatorOption<'db'>;
        contractVersion: CoordinatorOption<'contractVersion'>;
        solverVersion: CoordinatorOption<'solverVersion'>;
        budgetMs: CoordinatorOption<'budgetMs'>;
        ownerId: CoordinatorOption<'ownerId'>;
        now: CoordinatorOption<'now'>;
        attemptToken: CoordinatorOption<'attemptToken'>;
        inputOf: CoordinatorOption<'inputOf'>;
        enabledOf: CoordinatorOption<'enabledOf'>;
        spawn: CoordinatorOption<'spawn'>;
        runChild: CoordinatorOption<'runChild'>;
        onChildError: CoordinatorOption<'onChildError'>;
        eventLog: CoordinatorOption<'eventLog'>;
        pushRecorded: CoordinatorOption<'pushRecorded'>;
        editDebounceMs: CoordinatorOption<'editDebounceMs'>;
        sleep: CoordinatorOption<'sleep'>;
        setInterval: CoordinatorOption<'setInterval'>;
        clearInterval: CoordinatorOption<'clearInterval'>;
      }): OptimizationCoordinatorOptions => ({
        db,
        contractVersion,
        solverVersion,
        budgetMs,
        ownerId,
        now,
        attemptToken,
        inputOf,
        enabledOf,
        spawn,
        runChild,
        onChildError,
        eventLog,
        pushRecorded,
        editDebounceMs,
        sleep,
        setInterval,
        clearInterval,
      }),
    ),
  })
  .register({
    optimizer: DiBag.fromSyncFactory(
      ({
        optimizationOptions,
      }: {
        optimizationOptions: OptimizationCoordinatorOptions;
      }): OptimizationCoordinator => new OptimizationCoordinator(optimizationOptions),
    ),
  })
  .buildModule(['optimizer'], { label: OPTIMIZATION_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { OptimizationExports, OptimizationRequirements } from './contract';
import { optimizationModule } from './module';

/**
 * Installs {@link optimizationModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Optimization can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link OptimizationExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installOptimization(requirements: OptimizationRequirements): OptimizationExports {
  const bag = DiBag.createBuilder()
    .installModule(optimizationModule)
    .register({
      db: DiBag.fromSyncFactory(() => requirements.db),
      contractVersion: DiBag.fromSyncFactory(() => requirements.contractVersion),
      solverVersion: DiBag.fromSyncFactory(() => requirements.solverVersion),
      budgetMs: DiBag.fromSyncFactory(() => requirements.budgetMs),
      ownerId: DiBag.fromSyncFactory(() => requirements.ownerId),
      now: DiBag.fromSyncFactory(() => requirements.now),
      attemptToken: DiBag.fromSyncFactory(() => requirements.attemptToken),
      inputOf: DiBag.fromSyncFactory(() => requirements.inputOf),
      enabledOf: DiBag.fromSyncFactory(() => requirements.enabledOf),
      spawn: DiBag.fromSyncFactory(() => requirements.spawn),
      runChild: DiBag.fromSyncFactory(() => requirements.runChild),
      onChildError: DiBag.fromSyncFactory(() => requirements.onChildError),
      eventLog: DiBag.fromSyncFactory(() => requirements.eventLog),
      pushRecorded: DiBag.fromSyncFactory(() => requirements.pushRecorded),
      editDebounceMs: DiBag.fromSyncFactory(() => requirements.editDebounceMs),
      sleep: DiBag.fromSyncFactory(() => requirements.sleep),
      setInterval: DiBag.fromSyncFactory(() => requirements.setInterval),
      clearInterval: DiBag.fromSyncFactory(() => requirements.clearInterval),
    })
    .build();
  return { optimizer: bag.resolve('optimizer') };
}
```

`README.md` (slices 2 and 4 edit it):

```md
# Optimization

The optimized-schedule feature as a sealed DI Bag module under `apps/wbs/be-01`: `module.ts` seals
the graph, `check.ts` is the only place that builds a bag, and `contract.ts` states what a host must
supply and the neutral port types Optimization shares with its launchers — the reserved spawn
request, the solver child and the spawner — and the three outcome events it publishes, projected
from the neutral `ProjectEvent`.

`optimization.feature.ts` (the moved `service/optimization-coordinator.ts`) admits, queues, launches,
heartbeats and records solver attempts for the plan read and for Retry. `solver-child-lifecycle.ts`
and `optimized-schedule-reader.ts` are its private support: the one drains, heartbeats and releases
a bound child, the other names the plan read's question of the optimized cache. Private bindings are
named under the `backend.optimization` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.

## Consumers

`apps/wbs/be-01/src/services.ts` installs the module once per composition; `bootBe01` starts and
stops the coordinator it returns. `apps/wbs/be-01/src/service/optimization-coordinator.ts`,
`service/solver-child-lifecycle.ts` and `service/optimized-schedule-reader.ts` keep the former paths
for `app.ts`, the local solver launcher, the controller tests and the optimization database tests.
```

### 10.5 `services.ts` and `kinds.json` (slice 1 step 4)

```diff
diff --git a/apps/wbs/be-01/src/services.ts b/apps/wbs/be-01/src/services.ts
--- a/apps/wbs/be-01/src/services.ts
+++ b/apps/wbs/be-01/src/services.ts
@@ -17,6 +17,9 @@ import {
   type SqliteSource,
 } from '@wbs/store-sqlite';

+import { installOptimization } from './module/optimization/check';
+import type { ReservedSpawner } from './module/optimization/contract';
+import type { OptimizationCoordinator } from './module/optimization/optimization.feature';
 import { PLAN_EVENT_RETENTION_DAYS } from './repository';
 import {
   bunPasswordHasher,
@@ -25,7 +28,6 @@ import {
   systemInterval,
 } from './runtime/bun-runtime';
 import type { AuthenticatedUser } from './service/auth.service';
-import { OptimizationCoordinator, type ReservedSpawner } from './service/optimization-coordinator';
 import { optimizerWiring } from './service/optimizer-wiring';

 const EVENT_LOG_MAX_PER_SUBSCRIPTION = 1_000;
@@ -133,7 +135,7 @@ export function buildServices(options: ServicesOptions): BeServices {
   });
   if (options.optimizer !== undefined) {
     const optimizer = options.optimizer;
-    coordinator = new OptimizationCoordinator({
+    coordinator = installOptimization({
       db: source.db,
       contractVersion: contractVersionOf(optimizer.solverVersion),
       solverVersion: optimizer.solverVersion,
@@ -151,7 +153,7 @@ export function buildServices(options: ServicesOptions): BeServices {
       onChildError: (error) => {
         options.logger.error({ err: error }, 'optimizer child failed');
       },
-    });
+    }).optimizer;
   }

   return { ...graph, optimizer: coordinator, gate: source.gate };
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -68,15 +68,13 @@
     },
     {
       "path": "apps/wbs/be-01/src/service/optimization-coordinator.ts",
-      "kind": "feature",
-      "capability": "scheduler-runtime-port",
-      "rationale": "buildServices and AppOptions use it to coordinate optimization generation, queue, cache and admission repositories with solver child lifecycles and outcome broadcasts for optimized scheduling and Retry"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use the optimization module directly"
     },
     {
       "path": "apps/wbs/be-01/src/service/optimized-schedule-reader.ts",
       "kind": "support",
-      "disposition": "private member of optimization-coordinator.ts",
-      "rationale": "OptimizationCoordinator is its only production importer and uses its reader alias while the file otherwise re-exports the core optimizer projection types without accessing the cache"
+      "disposition": "re-export shim; delete when importers use the optimization module directly"
     },
     {
       "path": "apps/wbs/be-01/src/service/optimizer-trigger-broadcaster.ts",
@@ -182,8 +180,7 @@
     {
       "path": "apps/wbs/be-01/src/service/solver-child-lifecycle.ts",
       "kind": "support",
-      "disposition": "private member of optimization-coordinator.ts",
-      "rationale": "OptimizationCoordinator is its only production importer (the other two are its database tests) and calls it to drain one child, heartbeat its solver-slot repository row and release capacity; it holds lifecycle policy, not raw process access"
+      "disposition": "re-export shim; delete when importers use the optimization module directly"
     },
     {
       "path": "apps/wbs/be-01/src/service/solver-exit-outcome.ts",
```

### 10.6 `clock.test.ts` scans backend modules (slice 1 step 5 — after row 4)

```diff
diff --git a/apps/wbs/be-01/src/service/clock.test.ts b/apps/wbs/be-01/src/service/clock.test.ts
--- a/apps/wbs/be-01/src/service/clock.test.ts
+++ b/apps/wbs/be-01/src/service/clock.test.ts
@@ -17,6 +17,12 @@ const FOLDERS = ['apps/wbs/be-01/src/service', 'libs/wbs/application/core/src/se
  * would stop reading every service the moment it is sealed.
  */
 const MODULES = 'libs/wbs/application/core/src/module';
+/**
+ * Where a be-01 service goes when it is sealed as a backend module, for the
+ * same reason as {@link MODULES}: the Optimization coordinator moved out of
+ * {@link FOLDERS} into `module/optimization/optimization.feature.ts`.
+ */
+const BACKEND_MODULES = 'apps/wbs/be-01/src/module';
 const ROOT = join(import.meta.dir, '../../../../..');

 /**
@@ -35,7 +41,8 @@ const AGE_THEIR_OWN_ENTRIES = new Set([
 ]);

 /**
- * {@link FOLDERS} and every sealed core module's own directory.
+ * {@link FOLDERS}, every sealed core module's own directory and every sealed
+ * backend module's own directory.
  *
  * Proof (2026-09-24): adding `now?: () => number;` to the moved
  * `CapacityServiceOptions` in `module/capacity/capacity.resource.ts` failed
@@ -44,10 +51,11 @@ const AGE_THEIR_OWN_ENTRIES = new Set([
  * (3 pass, 1 fail).
  */
 function serviceFolders(): string[] {
-  const modules = readdirSync(join(ROOT, MODULES), { withFileTypes: true })
-    .filter((entry) => entry.isDirectory())
-    .map((entry) => `${MODULES}/${entry.name}`);
-  return [...FOLDERS, ...modules];
+  const modulesIn = (root: string): string[] =>
+    readdirSync(join(ROOT, root), { withFileTypes: true })
+      .filter((entry) => entry.isDirectory())
+      .map((entry) => `${root}/${entry.name}`);
+  return [...FOLDERS, ...modulesIn(MODULES), ...modulesIn(BACKEND_MODULES)];
 }

 function serviceSources(): { name: string; path: string; text: string }[] {
@@ -124,6 +132,9 @@ describe('one clock', () => {
     const beWorkItems = sources.find(
       (file) => file.path === 'apps/wbs/be-01/src/service/work-item.service.ts',
     );
+    const beOptimization = sources.find(
+      (file) => file.path === 'apps/wbs/be-01/src/module/optimization/optimization.feature.ts',
+    );
     // Proof: removing the core folder from FOLDERS failed this assertion on
     // Received: undefined while the two shape checks passed (2026-09-09).
     expect(coreCapacity).toBeDefined();
@@ -134,6 +145,8 @@ describe('one clock', () => {
     expect(coreWorkItems?.text).toContain('export class WorkItemService');
     expect(beWorkItems).toBeDefined();
     expect(beWorkItems?.text).toContain("export * from '@wbs/core/service/work-item.service'");
+    expect(beOptimization).toBeDefined();
+    expect(beOptimization?.text).toContain('export class OptimizationCoordinator');
   });

   it('dates one act from one reading of the clock', () => {
```

### 10.7 Slice 1's Proof comments (slice 1 step 8 — only after rows 6-13 were observed)

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -68,6 +68,10 @@ export const optimizationModule = DiBag.createBuilder()
         clearInterval: CoordinatorOption<'clearInterval'>;
       }): OptimizationCoordinatorOptions => ({
         db,
+        // Proof (2026-09-24): handing the coordinator `contractVersion: solverVersion` instead of
+        // the supplied contract version left `reads an idle plan under the identity
+        // installOptimization wires` failing (5 pass, 1 fail): the read carried
+        // `"contractVersion": "0.1.0"`.
         contractVersion,
         solverVersion,
         budgetMs,
@@ -78,6 +82,9 @@ export const optimizationModule = DiBag.createBuilder()
         enabledOf,
         spawn,
         runChild,
+        // Proof (2026-09-24): handing the coordinator `onChildError: () => undefined` instead of
+        // the supplied sink left `reports a failed edit read to the error sink installOptimization
+        // wires` failing (5 pass, 1 fail): it received `[]`.
         onChildError,
         eventLog,
         pushRecorded,
@@ -97,4 +104,12 @@ export const optimizationModule = DiBag.createBuilder()
       }): OptimizationCoordinator => new OptimizationCoordinator(optimizationOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['optimizer', 'optimizationOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (3 pass, 3 fail):
+  // `resolve('optimizationOptions')` did not throw, `inspectGraph()` reported bare
+  // `optimizationOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: OPTIMIZATION_LABEL }` left only the two label
+  // assertions failing (4 pass, 2 fail): `inspectGraph()` reported `optimizationOptions`
+  // unlabelled, and the missing-requirement message named `optimizationOptions` instead of
+  // `backend.optimization/optimizationOptions`.
   .buildModule(['optimizer'], { label: OPTIMIZATION_LABEL });
diff --git a/apps/wbs/be-01/src/module/optimization/check.ts b/apps/wbs/be-01/src/module/optimization/check.ts
--- a/apps/wbs/be-01/src/module/optimization/check.ts
+++ b/apps/wbs/be-01/src/module/optimization/check.ts
@@ -37,5 +37,11 @@ export function installOptimization(requirements: OptimizationRequirements): Opt
       clearInterval: DiBag.fromSyncFactory(() => requirements.clearInterval),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (5 pass, 1 fail), with
+  // `wbs-be-01:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned `OptimizationCoordinator` kept the key
+  // list correct but made the no-resolver assertion receive false (5 pass, 1 fail), with
+  // `wbs-be-01:typecheck` at exit 0.
   return { optimizer: bag.resolve('optimizer') };
 }
diff --git a/apps/wbs/be-01/src/service/clock.test.ts b/apps/wbs/be-01/src/service/clock.test.ts
--- a/apps/wbs/be-01/src/service/clock.test.ts
+++ b/apps/wbs/be-01/src/service/clock.test.ts
@@ -49,6 +49,12 @@ const AGE_THEIR_OWN_ENTRIES = new Set([
  * `is the only clock a service that stamps a write reads` on expected [],
  * received ["libs/wbs/application/core/src/module/capacity/capacity.resource.ts"]
  * (3 pass, 1 fail).
+ * Proof (2026-09-24): with the Optimization coordinator moved into
+ * `apps/wbs/be-01/src/module/optimization/` and only core modules scanned, adding
+ * `now?: () => number;` to the moved `OptimizationCoordinatorOptions` left all four cases
+ * passing; with every backend module directory scanned as well, the same fault failed
+ * `is the only clock a service that stamps a write reads` on received
+ * ["apps/wbs/be-01/src/module/optimization/optimization.feature.ts"] (3 pass, 1 fail).
  */
 function serviceFolders(): string[] {
   const modulesIn = (root: string): string[] =>
@@ -145,6 +151,8 @@ describe('one clock', () => {
     expect(coreWorkItems?.text).toContain('export class WorkItemService');
     expect(beWorkItems).toBeDefined();
     expect(beWorkItems?.text).toContain("export * from '@wbs/core/service/work-item.service'");
+    // Proof (2026-09-24): returning `[...FOLDERS, ...modulesIn(MODULES)]` from `serviceFolders`
+    // failed the `beOptimization` assertion below on Received: undefined (3 pass, 1 fail).
     expect(beOptimization).toBeDefined();
     expect(beOptimization?.text).toContain('export class OptimizationCoordinator');
   });
```

### 10.8 `apps/wbs/be-01/src/module-boundaries.test.ts` (slice 2 step 1)

```ts
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const backendRoot = fileURLToPath(new URL('..', import.meta.url));
const backendSource = `${backendRoot}src/`;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const configPath = `${backendRoot}tsconfig.lib.json`;

/**
 * One group of backend module files and the files none of them may reach.
 *
 * `from` takes a path under `apps/wbs/be-01/src`; `reaches` takes the
 * repository-relative path of a file a module specifier or an identifier
 * resolved to.
 */
interface ImportRule {
  readonly from: (path: string) => boolean;
  readonly reaches: (declared: string) => boolean;
}

/**
 * The routes the backend module map's preparations 7 and 8 closed, so that they
 * cannot return unnoticed.
 *
 * The first is preparation 8 (task 1.6): Optimization takes
 * `SolverObjectiveName` from `@wbs/domain` rather than through the repository
 * schema, and hashes an input through its injected cache-key port rather than
 * through the repository's SHA-256 helper. The second is preparation 7's
 * neutral half (task 1.5): the Optimization contract's spawn, child and event
 * types name no repository row type and nothing of the private solver child
 * lifecycle, so a launcher that imports the contract imports no adapter.
 */
const rules: readonly ImportRule[] = [
  {
    from: (path) => path.startsWith('module/optimization/'),
    reaches: (declared) =>
      [
        'apps/wbs/be-01/src/repository/schema.ts',
        'apps/wbs/be-01/src/repository/schedule-input-hash.ts',
        'libs/wbs/adapters/store-sqlite/src/schema.ts',
        'libs/wbs/adapters/store-sqlite/src/schedule-input-hash.ts',
      ].includes(declared),
  },
  {
    from: (path) => path === 'module/optimization/contract.ts',
    reaches: (declared) =>
      declared.startsWith('apps/wbs/be-01/src/repository/') ||
      declared.startsWith('libs/wbs/adapters/') ||
      declared === 'apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts',
  },
];

function underRepository(fileName: string): string {
  return fileName.startsWith(repositoryRoot) ? fileName.slice(repositoryRoot.length) : fileName;
}

/** Every TypeScript file of the backend's sealed modules, as a path under `src`. */
async function scannedSources(): Promise<readonly string[]> {
  return (await readdir(`${backendSource}module`, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `module/${path.replaceAll('\\', '/')}`)
    .sort();
}

/**
 * The backend compiled as one program, with its own `tsconfig.lib.json` options.
 *
 * Both throws are load-bearing: without the real options there are no path
 * mappings, `@wbs/*` does not resolve, and every identity this rule asks about
 * comes back unresolved — which reads as an empty violation list.
 */
function backendProgram(rootNames: readonly string[]): ts.Program {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, backendRoot);
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => `${backendSource}${path}`),
    options: { ...parsed.options, noEmit: true },
  });
}

/** The end of an alias chain, and every symbol passed through on the way. */
function aliasChain(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
  const chain = [symbol];
  let current = symbol;
  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
    const next = checker.getAliasedSymbol(current);
    if (chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

function declarationFiles(symbol: ts.Symbol): readonly string[] {
  return (symbol.declarations ?? []).map((each) => underRepository(each.getSourceFile().fileName));
}

/** The module specifier of a node that introduces one. */
function moduleSpecifierOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return node.argument.literal;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return node.arguments[0];
  }
  return undefined;
}

/** What a scan found: the forbidden routes, and every file each scanned file reached. */
interface ImportReport {
  readonly violations: readonly string[];
  readonly reached: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Every route by which a scanned file reaches a file its rules forbid.
 *
 * Two questions are asked of every node, both of **resolved identities**,
 * never of spelling: where a module specifier resolves, and every file an
 * identifier's alias chain is declared in. That covers a named, type-only or
 * bare side-effect import of a forbidden file, a `typeof import(…)` of one, and
 * a name forwarded to it through any number of re-exports.
 *
 * **Not covered, by construction.** A member selected out of an allowed
 * forwarding barrel by a string key — `store['scheduleInputHash']` after
 * `import * as store from '@wbs/store-sqlite'` — has no identifier naming the
 * forbidden declaration and no specifier naming the forbidden file.
 * `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`
 * resolves such selections by type identity; this rule does not, and is a
 * tripwire for the routes the two preparations removed, not a proof that no
 * route exists.
 */
function importReport(paths: readonly string[]): ImportReport {
  const program = backendProgram(paths);
  const checker = program.getTypeChecker();
  const violations: string[] = [];
  const reached = new Map<string, Set<string>>();

  for (const path of paths) {
    const file = program.getSourceFile(`${backendSource}${path}`);
    if (file === undefined) throw new Error(`the program holds no ${path}`);
    const applying = rules.filter((rule) => rule.from(path));
    const seen = new Set<string>();
    reached.set(path, seen);
    const judge = (files: readonly string[], how: string): void => {
      for (const declared of files) {
        seen.add(declared);
        if (applying.some((rule) => rule.reaches(declared))) {
          violations.push(`${path}: ${how} reaches ${declared}`);
        }
      }
    };

    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierOf(node);
      if (specifier !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(specifier);
        if (moduleSymbol !== undefined) judge(declarationFiles(moduleSymbol), specifier.getText());
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined) {
          judge(aliasChain(checker, symbol).flatMap(declarationFiles), node.getText());
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { violations: [...new Set(violations)].sort(), reached };
}

describe('the checked import routes of the backend modules', () => {
  it('rejects every route a rule forbids', async () => {
    const scanned = await scannedSources();
    const report = importReport(scanned);

    expect(scanned).toContain('module/optimization/contract.ts');
    expect(report.reached.get('module/optimization/optimization.feature.ts')).toContain(
      'libs/wbs/domain/domain/src/stored-vocabularies.ts',
    );
    expect(report.violations).toEqual([]);
  }, 120_000);
});
```

### 10.9 The Optimization module test, first (slice 2 step 2)

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.test.ts b/apps/wbs/be-01/src/module/optimization/module.test.ts
--- a/apps/wbs/be-01/src/module/optimization/module.test.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.test.ts
@@ -48,6 +48,7 @@ function requirements(): OptimizationRequirements {
     attemptToken: () => 'attempt-1',
     inputOf: () => Promise.resolve(INPUT),
     enabledOf: () => Promise.resolve(true),
+    hashInput: () => 'port-hash',
     spawn: () => Promise.reject(new Error('the module test launches no solver')),
     onChildError: (error) => {
       throw error;
@@ -69,6 +70,7 @@ const hostRequirements = () => {
     attemptToken: DiBag.fromSyncFactory(() => supplied.attemptToken),
     inputOf: DiBag.fromSyncFactory(() => supplied.inputOf),
     enabledOf: DiBag.fromSyncFactory(() => supplied.enabledOf),
+    hashInput: DiBag.fromSyncFactory(() => supplied.hashInput),
     spawn: DiBag.fromSyncFactory(() => supplied.spawn),
     runChild: DiBag.fromSyncFactory(() => supplied.runChild),
     eventLog: DiBag.fromSyncFactory(() => supplied.eventLog),
@@ -110,6 +112,7 @@ describe('the Optimization module', () => {

     expect(read).toMatchObject({
       projectId: PROJECT,
+      inputHash: 'port-hash',
       contractVersion: CONTRACT,
       budgetMs: BUDGET_MS,
       generation: null,
@@ -118,6 +121,24 @@ describe('the Optimization module', () => {
     });
   });

+  /**
+   * The cache-key port is the only hash the coordinator reads: a Retry whose
+   * hash differs from the port's answer is refused as stale, with the port's
+   * own value, before any repository call.
+   */
+  it('hashes a Retry through the cache-key port installOptimization wires', () => {
+    const { optimizer } = installOptimization(requirements());
+
+    const refused = optimizer.retry({
+      projectId: PROJECT,
+      objective: 'pri',
+      inputHash: 'stale-hash',
+      input: INPUT,
+    });
+
+    expect(refused).toEqual({ kind: 'stale-input-hash', currentInputHash: 'port-hash' });
+  });
+
   it('reports a failed edit read to the error sink installOptimization wires', async () => {
     const refused = new Error('enabled read refused');
     const failures: unknown[] = [];
```

### 10.10 The cache-key port (slice 2 step 3)

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/contract.ts b/apps/wbs/be-01/src/module/optimization/contract.ts
--- a/apps/wbs/be-01/src/module/optimization/contract.ts
+++ b/apps/wbs/be-01/src/module/optimization/contract.ts
@@ -81,6 +81,15 @@ export interface ReservedSolverChild extends SolverChildProcess {
  */
 export type ReservedSpawner = (request: ReservedSpawnRequest) => Promise<ReservedSolverChild>;

+/**
+ * The cache-key port: the storage key of one exact scheduler input.
+ *
+ * The domain owns the canonical bytes and SQLite's adapter owns the SHA-256
+ * over them (`@wbs/store-sqlite/schedule-input-hash`); the composition root
+ * supplies that function, so the feature names no repository helper.
+ */
+export type ScheduleInputHasher = (input: ScheduleInput) => string;
+
 /** A stored `ok` result's project event, projected from the neutral `ProjectEvent`. */
 export type ScheduleOptimizedEvent = Extract<ProjectEvent, { type: 'schedule_optimized' }>;
 /** A stored failure's project event, projected from the neutral `ProjectEvent`. */
@@ -102,8 +111,9 @@ export type OptimizationOutcomeEvent =
  *
  * Exactly {@link OptimizationCoordinatorOptions}, unchanged by the move but
  * for the spawn, child and outcome-event types it now takes from this
- * contract. `bootBe01` starts and stops the one coordinator a process holds;
- * the module registers no disposer.
+ * contract and the cache-key port `hashInput` task 1.6 added. `bootBe01`
+ * starts and stops the one coordinator a process holds; the module registers
+ * no disposer.
  *
  * **K3 debt disclosed.** The backend module map gives Optimization queue,
  * generation, cache, slot and outcome repository ports. This extraction does
diff --git a/apps/wbs/be-01/src/module/optimization/optimization.feature.ts b/apps/wbs/be-01/src/module/optimization/optimization.feature.ts
--- a/apps/wbs/be-01/src/module/optimization/optimization.feature.ts
+++ b/apps/wbs/be-01/src/module/optimization/optimization.feature.ts
@@ -37,7 +37,6 @@ import {
   readOptimizedPair,
   readOptimizedPairAndSpawn,
 } from '../../repository/optimized-schedule-cache';
-import { scheduleInputHash } from '../../repository/schedule-input-hash';
 import {
   evaluateSolverOutcome,
   type SolverProcessOutcome,
@@ -48,6 +47,7 @@ import type {
   ReservedSolverChild,
   ReservedSpawner,
   ReservedSpawnRequest,
+  ScheduleInputHasher,
 } from './contract';
 import {
   type OptimizationVariantState,
@@ -75,6 +75,8 @@ export interface OptimizationCoordinatorOptions {
   readonly inputOf: (projectId: string) => Promise<ScheduleInput | null>;
   /** Whether an edit-triggered read may spend solver capacity for this project. */
   readonly enabledOf: (projectId: string) => Promise<boolean>;
+  /** The cache-key port: the composition root supplies SQLite's SHA-256 of the canonical input. */
+  readonly hashInput: ScheduleInputHasher;
   /**
    * The launcher boundary, called only after SQLite returned this attempt's
    * counted `starting` row. Slice 6.2b binds that row to the launcher PID.
@@ -393,7 +395,7 @@ export class OptimizationCoordinator {
         releaseSolverSlot(this.options.db, slot);
         continue;
       }
-      if (scheduleInputHash(input) !== next.inputHash) {
+      if (this.options.hashInput(input) !== next.inputHash) {
         releaseSolverSlot(this.options.db, slot);
         const enabled = await this.options.enabledOf(next.entry.projectId);
         if (!enabled) continue;
@@ -453,7 +455,7 @@ export class OptimizationCoordinator {
     readonly inputHash: string;
     readonly input: ScheduleInput;
   }): OptimizationRetryResult => {
-    const currentInputHash = scheduleInputHash(ask.input);
+    const currentInputHash = this.options.hashInput(ask.input);
     if (ask.inputHash !== currentInputHash) {
       return { kind: 'stale-input-hash', currentInputHash };
     }
@@ -572,7 +574,7 @@ export class OptimizationCoordinator {
    * to the service cannot lose the coordinator instance as `this`.
    */
   readonly readPlan: OptimizedScheduleReader = (ask) => {
-    const inputHash = scheduleInputHash(ask.input);
+    const inputHash = this.options.hashInput(ask.input);
     const key = {
       projectId: ask.projectId,
       inputHash,
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -38,6 +38,7 @@ export const optimizationModule = DiBag.createBuilder()
         attemptToken,
         inputOf,
         enabledOf,
+        hashInput,
         spawn,
         runChild,
         onChildError,
@@ -57,6 +58,7 @@ export const optimizationModule = DiBag.createBuilder()
         attemptToken: CoordinatorOption<'attemptToken'>;
         inputOf: CoordinatorOption<'inputOf'>;
         enabledOf: CoordinatorOption<'enabledOf'>;
+        hashInput: CoordinatorOption<'hashInput'>;
         spawn: CoordinatorOption<'spawn'>;
         runChild: CoordinatorOption<'runChild'>;
         onChildError: CoordinatorOption<'onChildError'>;
@@ -80,6 +82,7 @@ export const optimizationModule = DiBag.createBuilder()
         attemptToken,
         inputOf,
         enabledOf,
+        hashInput,
         spawn,
         runChild,
         // Proof (2026-09-24): handing the coordinator `onChildError: () => undefined` instead of
diff --git a/apps/wbs/be-01/src/module/optimization/check.ts b/apps/wbs/be-01/src/module/optimization/check.ts
--- a/apps/wbs/be-01/src/module/optimization/check.ts
+++ b/apps/wbs/be-01/src/module/optimization/check.ts
@@ -26,6 +26,7 @@ export function installOptimization(requirements: OptimizationRequirements): Opt
       attemptToken: DiBag.fromSyncFactory(() => requirements.attemptToken),
       inputOf: DiBag.fromSyncFactory(() => requirements.inputOf),
       enabledOf: DiBag.fromSyncFactory(() => requirements.enabledOf),
+      hashInput: DiBag.fromSyncFactory(() => requirements.hashInput),
       spawn: DiBag.fromSyncFactory(() => requirements.spawn),
       runChild: DiBag.fromSyncFactory(() => requirements.runChild),
       onChildError: DiBag.fromSyncFactory(() => requirements.onChildError),
diff --git a/apps/wbs/be-01/src/module/optimization/README.md b/apps/wbs/be-01/src/module/optimization/README.md
--- a/apps/wbs/be-01/src/module/optimization/README.md
+++ b/apps/wbs/be-01/src/module/optimization/README.md
@@ -3,8 +3,8 @@
 The optimized-schedule feature as a sealed DI Bag module under `apps/wbs/be-01`: `module.ts` seals
 the graph, `check.ts` is the only place that builds a bag, and `contract.ts` states what a host must
 supply and the neutral port types Optimization shares with its launchers — the reserved spawn
-request, the solver child and the spawner — and the three outcome events it publishes, projected
-from the neutral `ProjectEvent`.
+request, the solver child and the spawner — the cache-key port it hashes an input through, and the
+three outcome events it publishes, projected from the neutral `ProjectEvent`.

 `optimization.feature.ts` (the moved `service/optimization-coordinator.ts`) admits, queues, launches,
 heartbeats and records solver attempts for the plan read and for Retry. `solver-child-lifecycle.ts`
diff --git a/apps/wbs/be-01/src/services.ts b/apps/wbs/be-01/src/services.ts
--- a/apps/wbs/be-01/src/services.ts
+++ b/apps/wbs/be-01/src/services.ts
@@ -14,6 +14,7 @@ import { type FetchLike, PushClient, systemTimers } from '@wbs/runtime-portable'
 import {
   capturedOptimizationReaderOf,
   DrizzleEventLogStore,
+  scheduleInputHash,
   type SqliteSource,
 } from '@wbs/store-sqlite';

@@ -146,6 +147,7 @@ export function buildServices(options: ServicesOptions): BeServices {
       inputOf: async (projectId) => await graph.workItems.scheduleInput(projectId),
       enabledOf: async (projectId) =>
         (await source.stores.projects.findById(projectId))?.optimizationEnabled === true,
+      hashInput: scheduleInputHash,
       spawn: optimizer.spawn,
       eventLog: new DrizzleEventLogStore(source.db, source.gate),
       pushRecorded: (subscription, recorded, event) =>
diff --git a/apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts b/apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts
--- a/apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts
+++ b/apps/wbs/be-01/src/service/optimization-cancel.two-coordinator.db.test.ts
@@ -228,6 +228,7 @@ describe('cross-coordinator cancellation', () => {
     const errors: unknown[] = [];
     const instance = new OptimizationCoordinator({
       db: blue,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
diff --git a/apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts b/apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
--- a/apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
+++ b/apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
@@ -159,6 +159,7 @@ function coordinator(
   let token = 0;
   return new OptimizationCoordinator({
     db,
+    hashInput: scheduleInputHash,
     contractVersion: CONTRACT,
     solverVersion: '0.1.0',
     budgetMs: BUDGET,
@@ -204,6 +205,7 @@ describe('OptimizationCoordinator read', () => {
     const errors: unknown[] = [];
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -252,6 +254,7 @@ describe('OptimizationCoordinator read', () => {
     let enabled = true;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -609,6 +612,7 @@ describe('OptimizationCoordinator read', () => {
     let inputReads = 0;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -676,6 +680,7 @@ describe('OptimizationCoordinator read', () => {
     const calls: ReservedSpawnRequest[] = [];
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -1541,6 +1546,7 @@ describe('OptimizationCoordinator Retry admission', () => {
     let contention: unknown;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -1641,6 +1647,7 @@ describe('OptimizationCoordinator Retry admission', () => {
     let token = 0;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
diff --git a/apps/wbs/be-01/src/service/optimization-events.db.test.ts b/apps/wbs/be-01/src/service/optimization-events.db.test.ts
--- a/apps/wbs/be-01/src/service/optimization-events.db.test.ts
+++ b/apps/wbs/be-01/src/service/optimization-events.db.test.ts
@@ -88,6 +88,7 @@ describe('optimized outcome events', () => {
     let token = 0;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -140,6 +141,7 @@ describe('optimized outcome events', () => {
     let token = 0;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
@@ -241,6 +243,7 @@ describe('optimized outcome events', () => {
     let token = 0;
     const instance = new OptimizationCoordinator({
       db,
+      hashInput: scheduleInputHash,
       contractVersion: CONTRACT,
       solverVersion: '0.1.0',
       budgetMs: BUDGET,
diff --git a/apps/wbs/be-01/src/service/optimization-restart.db.test.ts b/apps/wbs/be-01/src/service/optimization-restart.db.test.ts
--- a/apps/wbs/be-01/src/service/optimization-restart.db.test.ts
+++ b/apps/wbs/be-01/src/service/optimization-restart.db.test.ts
@@ -105,6 +105,7 @@ function restarted(
   let token = 0;
   return new OptimizationCoordinator({
     db,
+    hashInput: scheduleInputHash,
     contractVersion: CONTRACT,
     solverVersion: '0.1.0',
     budgetMs: BUDGET,
diff --git a/apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts b/apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts
--- a/apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts
+++ b/apps/wbs/be-01/src/service/optimization-spawn-handshake.proc.db.test.ts
@@ -9,6 +9,7 @@ import { openDatabase, openDrizzle } from '../repository/db';
 import { DrizzleEventLogStore } from '../repository/event-log';
 import { OPEN } from '../repository/gate';
 import { runMigrations } from '../repository/migrate';
+import { scheduleInputHash } from '../repository/schedule-input-hash';
 import { solverSlot } from '../repository/schema';
 import {
   OptimizationCoordinator,
@@ -150,6 +151,7 @@ describe('the two-coordinator spawn handshake', () => {
     const coordinator = (db: typeof blue, owner: string): OptimizationCoordinator =>
       new OptimizationCoordinator({
         db,
+        hashInput: scheduleInputHash,
         contractVersion: CONTRACT,
         solverVersion: '0.1.0',
         budgetMs: BUDGET_MS,
```

### 10.11 Slice 2's Proof comments (slice 2 step 6 — only after rows 19-29 were observed)

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -82,6 +82,10 @@ export const optimizationModule = DiBag.createBuilder()
         attemptToken,
         inputOf,
         enabledOf,
+        // Proof (2026-09-24): handing the coordinator `hashInput: () => 'module-hash'` instead of
+        // the supplied port left `reads an idle plan under the identity installOptimization wires`
+        // and `hashes a Retry through the cache-key port installOptimization wires` failing
+        // (5 pass, 2 fail): both received `module-hash` for `port-hash`.
         hashInput,
         spawn,
         runChild,
diff --git a/apps/wbs/be-01/src/module-boundaries.test.ts b/apps/wbs/be-01/src/module-boundaries.test.ts
--- a/apps/wbs/be-01/src/module-boundaries.test.ts
+++ b/apps/wbs/be-01/src/module-boundaries.test.ts
@@ -32,6 +32,25 @@ interface ImportRule {
  * neutral half (task 1.5): the Optimization contract's spawn, child and event
  * types name no repository row type and nothing of the private solver child
  * lifecycle, so a launcher that imports the contract imports no adapter.
+ *
+ * Proof (2026-09-24): on the Optimization module as sealed before its
+ * cache-key port, this suite failed with exactly
+ * `"module/optimization/optimization.feature.ts: '../../repository/schedule-input-hash' reaches apps/wbs/be-01/src/repository/schedule-input-hash.ts"`
+ * and `"module/optimization/optimization.feature.ts: scheduleInputHash reaches libs/wbs/adapters/store-sqlite/src/schedule-input-hash.ts"`
+ * (0 pass, 1 fail).
+ * Proof (2026-09-24): prepending
+ * `import type { SolverObjectiveName as StoredObjectiveName } from '../../repository/schema';`
+ * to `module/optimization/optimization.feature.ts` failed it with exactly the
+ * `'../../repository/schema' reaches apps/wbs/be-01/src/repository/schema.ts` and
+ * `SolverObjectiveName reaches libs/wbs/adapters/store-sqlite/src/schema.ts` violations;
+ * prepending `import '@wbs/store-sqlite/schema';` instead failed it with exactly
+ * `'@wbs/store-sqlite/schema' reaches libs/wbs/adapters/store-sqlite/src/schema.ts` (0 pass, 1 fail each).
+ * Proof (2026-09-24): prepending, one at a time, `import '../../repository/optimization-admission';`,
+ * `import '@wbs/store-sqlite/optimization-admission';` and `import './solver-child-lifecycle';`
+ * to `module/optimization/contract.ts` failed it with exactly one violation each, naming
+ * `apps/wbs/be-01/src/repository/optimization-admission.ts`,
+ * `libs/wbs/adapters/store-sqlite/src/optimization-admission.ts` and
+ * `apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts` (0 pass, 1 fail each).
  */
 const rules: readonly ImportRule[] = [
   {
@@ -74,10 +93,14 @@ async function scannedSources(): Promise<readonly string[]> {
  */
 function backendProgram(rootNames: readonly string[]): ts.Program {
   const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
+  // Proof (2026-09-24): pointing `configPath` at `tsconfig.absent.json` threw
+  // `Cannot read file '…/apps/wbs/be-01/tsconfig.absent.json'.` (0 pass, 1 fail).
   if (read.error !== undefined) {
     throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
   }
   const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, backendRoot);
+  // Proof (2026-09-24): `"module": "invalid"` in the real `tsconfig.lib.json` threw
+  // `refused tsconfig.lib.json: 6046` (0 pass, 1 fail).
   if (parsed.errors.length > 0) {
     throw new Error(
       `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
@@ -150,6 +173,8 @@ function importReport(paths: readonly string[]): ImportReport {

   for (const path of paths) {
     const file = program.getSourceFile(`${backendSource}${path}`);
+    // Proof (2026-09-24): appending `'module/missing.ts'` to what `scannedSources` returns threw
+    // `the program holds no module/missing.ts` (0 pass, 1 fail).
     if (file === undefined) throw new Error(`the program holds no ${path}`);
     const applying = rules.filter((rule) => rule.from(path));
     const seen = new Set<string>();
@@ -187,7 +212,11 @@ describe('the checked import routes of the backend modules', () => {
     const scanned = await scannedSources();
     const report = importReport(scanned);

+    // Proof (2026-09-24): filtering `scannedSources` on `.tsx` instead of `.ts` failed here on
+    // `Received: []` (0 pass, 1 fail).
     expect(scanned).toContain('module/optimization/contract.ts');
+    // Proof (2026-09-24): building the program with `paths: undefined` failed here: the feature
+    // no longer reached `libs/wbs/domain/domain/src/stored-vocabularies.ts` (0 pass, 1 fail).
     expect(report.reached.get('module/optimization/optimization.feature.ts')).toContain(
       'libs/wbs/domain/domain/src/stored-vocabularies.ts',
     );
```

### 10.12 `s/module.test.ts` (slice 3 step 1)

```ts
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { buildSolverRequestPair } from '../../service/solver-request-pair';
import type { ReservedSpawnRequest } from '../optimization/contract';
import { installSolverSupervisor } from './check';
import { SOLVER_SUPERVISOR_LABEL } from './contract';
import { solverSupervisorModule } from './module';
import type {
  SolverSupervisorAttempt,
  SolverSupervisorRequest,
} from './solver-supervisor.repository';

const INPUT: ScheduleInput = {
  rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: null }],
  edges: [],
  slices: [
    {
      workItemId: 'w-1',
      stepId: 's-1',
      days: 1,
      personId: null,
      width: 1,
      poolIds: [],
    },
  ],
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
};

function reservedRequest(): ReservedSpawnRequest {
  const built = buildSolverRequestPair(INPUT, '0.1.0', 60_000).pri;
  if (!built.ok) throw new Error('fixture request did not pass preflight');
  return {
    key: {
      projectId: '11111111-1111-4111-8111-111111111111',
      inputHash: 'input-hash',
      contractVersion: '7+0.1.0',
      budgetMs: 60_000,
    },
    objective: 'pri',
    generation: 7,
    admission: {
      kind: 'reserved',
      attemptToken: '22222222-2222-4222-8222-222222222222',
      admittedCancelEpoch: 3,
      childDeadlineAt: 70_000,
      admittedDeadlineAt: 85_000,
    },
    request: { ...built.request },
    input: INPUT,
  };
}

/** A connector that records the one wire request it is handed and answers a started attempt. */
function recordingConnector(): {
  connect: (request: SolverSupervisorRequest) => Promise<SolverSupervisorAttempt>;
  requests: SolverSupervisorRequest[];
} {
  const requests: SolverSupervisorRequest[] = [];
  return {
    requests,
    connect: (request) => {
      requests.push(request);
      return Promise.resolve({
        pid: 4321,
        stdout: new ReadableStream<Uint8Array>(),
        stderr: new ReadableStream<Uint8Array>(),
        terminal: Promise.resolve({
          type: 'terminal' as const,
          exitCode: 0,
          deadlineKilled: false,
          oomKilled: false,
        }),
        verdict: () => Promise.resolve(),
        kill: () => Promise.resolve(),
      });
    },
  };
}

const hostRequirements = () => ({
  unix: DiBag.fromSyncFactory(() => '/run/wbs-solver/supervisor.sock'),
  callerId: DiBag.fromSyncFactory(() => 'a'.repeat(12)),
  searchWorkers: DiBag.fromSyncFactory(() => 2),
  connect: DiBag.fromSyncFactory(() => recordingConnector().connect),
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
    .installModule(solverSupervisorModule)
    .register({ ...hostRequirements(), memoryLimitMb: DiBag.fromSyncFactory(() => 512) })
    .build();

describe('the Solver supervisor module', () => {
  it('hands the reserved attempt to the connector installSolverSupervisor wires', async () => {
    const { connect, requests } = recordingConnector();
    const { spawner } = installSolverSupervisor({
      unix: '/run/wbs-solver/supervisor.sock',
      callerId: 'a'.repeat(12),
      searchWorkers: 2,
      memoryLimitMb: 512,
      connect,
    });
    const request = reservedRequest();

    const child = await spawner(request);

    expect(requests).toEqual([
      {
        unix: '/run/wbs-solver/supervisor.sock',
        callerId: 'aaaaaaaaaaaa',
        projectId: request.key.projectId,
        objective: 'pri',
        attemptToken: request.admission.attemptToken,
        childDeadlineAt: request.admission.childDeadlineAt,
        searchWorkers: 2,
        memoryLimitMb: 512,
        request: { ...request.request },
      },
    ]);
    expect(child.pid).toBe(4321);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `SolverSupervisorExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installSolverSupervisor({
      unix: '/run/wbs-solver/supervisor.sock',
      callerId: 'a'.repeat(12),
      searchWorkers: 2,
      memoryLimitMb: 512,
    });

    expect(Object.keys(exposed)).toEqual(['spawner']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('supervisorOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "supervisorOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${SOLVER_SUPERVISOR_LABEL}/supervisorOptions`,
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
      .installModule(solverSupervisorModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('spawner')).toThrow(
      `Cannot resolve "${SOLVER_SUPERVISOR_LABEL}/supervisorOptions": dependency "memoryLimitMb" is not registered. Resolution path: spawner -> ${SOLVER_SUPERVISOR_LABEL}/supervisorOptions -> memoryLimitMb.`,
    );
  });
});
```

### 10.13 Import lines of the three moved Supervisor files (slice 3 step 2 — applied after the `cp`/`mv`)

`s/solver-supervisor.repository.ts` needs no edit: the client imports only `node:buffer` and
`@wbs/contracts`.

```diff
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts b/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts
@@ -1,9 +1,9 @@
-import type { ReservedSolverChild, ReservedSpawner } from './optimization-coordinator';
+import type { ReservedSolverChild, ReservedSpawner } from '../optimization/contract';
 import {
   connectSolverSupervisor,
   type SolverSupervisorAttempt,
   type SolverSupervisorRequest,
-} from './solver-supervisor-client';
+} from './solver-supervisor.repository';

 export interface SolverSupervisorSpawnerOptions {
   readonly unix: string;
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.test.ts b/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.test.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.test.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.test.ts
@@ -1,9 +1,9 @@
 import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
 import { describe, expect, it } from 'bun:test';

-import type { ReservedSpawnRequest } from './optimization-coordinator';
-import { buildSolverRequestPair } from './solver-request-pair';
-import type { SolverSupervisorRequest } from './solver-supervisor-client';
+import { buildSolverRequestPair } from '../../service/solver-request-pair';
+import type { ReservedSpawnRequest } from '../optimization/contract';
+import type { SolverSupervisorRequest } from './solver-supervisor.repository';
 import { solverSupervisorSpawner } from './solver-supervisor-spawner';

 const INPUT: ScheduleInput = {
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor.repository.test.ts b/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor.repository.test.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor.repository.test.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor.repository.test.ts
@@ -3,8 +3,8 @@ import { describe, expect, it } from 'bun:test';
 import type {
   SolverSupervisorConnect,
   SolverSupervisorSocketEvents,
-} from './solver-supervisor-client';
-import { connectSolverSupervisor } from './solver-supervisor-client';
+} from './solver-supervisor.repository';
+import { connectSolverSupervisor } from './solver-supervisor.repository';

 const request = {
   unix: '/run/wbs-solver/supervisor.sock',
```

### 10.14 The client shim (slice 3 step 2 — full replacement content of `apps/wbs/be-01/src/service/solver-supervisor-client.ts`)

```ts
/**
 * Compatibility re-export: the Solver supervisor client moved into its own
 * sealed repository module.
 *
 * Kept because `apps/wbs/be-01/scripts/solver-supervisor-image-client.ts` and
 * `apps/wbs/be-01/scripts/solver-supervisor-orphan-client.ts` call
 * `connectSolverSupervisor` through this path. It goes when both name the
 * module.
 */
export * from '../module/solver-supervisor/solver-supervisor.repository';
```

### 10.15 The Supervisor's `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 3 step 3 — no `Proof:` comments)

`contract.ts`:

```ts
import type { ReservedSpawner } from '../optimization/contract';
import type { SolverSupervisorSpawnerOptions } from './solver-supervisor-spawner';

/**
 * What a host must supply to install {@link solverSupervisorModule}.
 *
 * Exactly {@link SolverSupervisorSpawnerOptions}, unchanged by the move: the
 * host supervisor's Unix socket, this backend's caller identity, the child's
 * worker and memory requests, and an optional connector a test replaces.
 * Image, Docker and systemd authority stay with the host.
 *
 * **K5 by the map's carve-out.** This is a repository adapter: it imports the
 * Supervisor wire protocol from `@wbs/contracts`, `node:buffer`, `di-bag` and
 * its own files. Its one edge above is the neutral spawn port it implements,
 * declared in the Optimization contract — never the Optimization feature or
 * its private support — which the backend module map sanctions and
 * `apps/wbs/be-01/src/module-boundaries.test.ts` watches; its end state is a
 * neutral `ports/` location.
 */
export type SolverSupervisorRequirements = SolverSupervisorSpawnerOptions;

/** What installing {@link solverSupervisorModule} adds to a host graph. */
export interface SolverSupervisorExports {
  /** The already-adapted launcher port the Optimization coordinator spawns through. */
  readonly spawner: ReservedSpawner;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The module lives under `apps/wbs/be-01`, so its wiki module identifier
 * carries the runtime word, `module.backend.solver-supervisor`, and the label
 * drops the `module.` prefix.
 */
export const SOLVER_SUPERVISOR_LABEL = 'backend.solver-supervisor';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { ReservedSpawner } from '../optimization/contract';
import { SOLVER_SUPERVISOR_LABEL } from './contract';
import {
  solverSupervisorSpawner,
  type SolverSupervisorSpawnerOptions,
} from './solver-supervisor-spawner';

/**
 * The Solver supervisor as a sealed DI Bag module.
 *
 * Only `spawner` is exported: the request/attempt mapper
 * (`solver-supervisor-spawner.ts`) already adapted to the Optimization
 * contract's launcher port. The mapper is this module's private support, and
 * `connectSolverSupervisor` stays a TypeScript diagnostic and test surface of
 * `solver-supervisor.repository.ts`, not a second DI service.
 * `supervisorOptions` stays private to each installation, so a host cannot
 * name it — resolving it answers `DI_BAG_MISSING_REGISTRATION` — and a
 * requirement the host forgot is reported against
 * `backend.solver-supervisor/supervisorOptions` rather than against an
 * anonymous binding. The optional connector is registered even when absent,
 * as `undefined`, so the mapper keeps its own Unix-socket default.
 *
 * The module registers no disposer: each attempt's socket belongs to the
 * coordinator's lifecycle, which drains, kills and awaits it.
 */
export const solverSupervisorModule = DiBag.createBuilder()
  .register({
    supervisorOptions: DiBag.fromSyncFactory(
      ({
        unix,
        callerId,
        searchWorkers,
        memoryLimitMb,
        connect,
      }: {
        unix: string;
        callerId: string;
        searchWorkers: number;
        memoryLimitMb: number;
        connect: SolverSupervisorSpawnerOptions['connect'];
      }): SolverSupervisorSpawnerOptions => ({
        unix,
        callerId,
        searchWorkers,
        memoryLimitMb,
        connect,
      }),
    ),
  })
  .register({
    spawner: DiBag.fromSyncFactory(
      ({
        supervisorOptions,
      }: {
        supervisorOptions: SolverSupervisorSpawnerOptions;
      }): ReservedSpawner => solverSupervisorSpawner(supervisorOptions),
    ),
  })
  .buildModule(['spawner'], { label: SOLVER_SUPERVISOR_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { SolverSupervisorExports, SolverSupervisorRequirements } from './contract';
import { solverSupervisorModule } from './module';

/**
 * Installs {@link solverSupervisorModule} over supplied requirements and
 * returns only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of the Supervisor can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link SolverSupervisorExports}, so the module's
 * tests enumerate what this function returns.
 */
export function installSolverSupervisor(
  requirements: SolverSupervisorRequirements,
): SolverSupervisorExports {
  const bag = DiBag.createBuilder()
    .installModule(solverSupervisorModule)
    .register({
      unix: DiBag.fromSyncFactory(() => requirements.unix),
      callerId: DiBag.fromSyncFactory(() => requirements.callerId),
      searchWorkers: DiBag.fromSyncFactory(() => requirements.searchWorkers),
      memoryLimitMb: DiBag.fromSyncFactory(() => requirements.memoryLimitMb),
      connect: DiBag.fromSyncFactory(() => requirements.connect),
    })
    .build();
  return { spawner: bag.resolve('spawner') };
}
```

`README.md` (slice 4 edits it):

```md
# Solver supervisor

The host Solver supervisor's client as a sealed DI Bag repository module under `apps/wbs/be-01`:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the socket, caller identity and resource requests a host must supply.

`solver-supervisor.repository.ts` (the moved `service/solver-supervisor-client.ts`) speaks the
bounded, non-multiplexed Supervisor protocol over one Unix socket per attempt.
`solver-supervisor-spawner.ts` is its private support: the request/attempt mapper that adapts the
Optimization contract's reserved spawn request to one Supervisor request and the returned attempt
to the contract's solver child. The module exports that adapted launcher port and nothing else.
Private bindings are named under the `backend.solver-supervisor` label, so a DI failure says which
module asked.

## Checks

The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.

## Consumers

`apps/wbs/be-01/src/main.ts` installs the module and hands its launcher port to the Optimization
coordinator; `apps/wbs/be-01/src/service/solver-supervisor-client.ts` keeps the former path for the
two Supervisor diagnostic scripts under `apps/wbs/be-01/scripts/`.
```

### 10.16 `main.ts` and `kinds.json` (slice 3 step 4)

```diff
diff --git a/apps/wbs/be-01/src/main.ts b/apps/wbs/be-01/src/main.ts
--- a/apps/wbs/be-01/src/main.ts
+++ b/apps/wbs/be-01/src/main.ts
@@ -4,7 +4,7 @@ import { bootBe01 } from './boot';
 import { loadConfig } from './config';
 import { oidcRouteOptionsFromEnv } from './controller/oidc-options';
 import { installSolverLauncher } from './module/solver-launcher/check';
-import { solverSupervisorSpawner } from './service/solver-supervisor-spawner';
+import { installSolverSupervisor } from './module/solver-supervisor/check';

 const cfg = loadConfig();
 const logger = createLogger({ service: 'be-01', level: cfg.LOG_LEVEL });
@@ -43,12 +43,12 @@ try {
     optimizer: {
       solverVersion,
       budgetMs: cfg.SOLVER_BUDGET_MS,
-      spawn: solverSupervisorSpawner({
+      spawn: installSolverSupervisor({
         unix: '/run/wbs-solver/supervisor.sock',
         callerId,
         searchWorkers: cfg.SOLVER_SEARCH_WORKERS,
         memoryLimitMb: cfg.SOLVER_MEMORY_LIMIT_MB,
-      }),
+      }).spawner,
     },
   });
 } catch (err) {
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -201,13 +201,8 @@
     },
     {
       "path": "apps/wbs/be-01/src/service/solver-supervisor-client.ts",
-      "kind": "repository",
-      "rationale": "solverSupervisorSpawner and diagnostic scripts call it as the bounded protocol adapter for one external Unix supervisor socket and its streamed child output"
-    },
-    {
-      "path": "apps/wbs/be-01/src/service/solver-supervisor-spawner.ts",
-      "kind": "repository",
-      "rationale": "main uses it to adapt a ReservedSpawnRequest to the external host supervisor client and expose that socket-backed attempt as the coordinator's child-process port"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use the solver-supervisor module directly"
     },
     {
       "path": "apps/wbs/be-01/src/service/step.service.ts",
```

### 10.17 The Supervisor's route rule (slice 3 step 5)

```diff
diff --git a/apps/wbs/be-01/src/module-boundaries.test.ts b/apps/wbs/be-01/src/module-boundaries.test.ts
--- a/apps/wbs/be-01/src/module-boundaries.test.ts
+++ b/apps/wbs/be-01/src/module-boundaries.test.ts
@@ -31,7 +31,11 @@ interface ImportRule {
  * through the repository's SHA-256 helper. The second is preparation 7's
  * neutral half (task 1.5): the Optimization contract's spawn, child and event
  * types name no repository row type and nothing of the private solver child
- * lifecycle, so a launcher that imports the contract imports no adapter.
+ * lifecycle, so a launcher that imports the contract imports no adapter. The
+ * third is preparation 7's other half (tasks 1.5 and 4.2): the Supervisor, a
+ * repository module, reaches Optimization only through that contract — never
+ * the feature, its private support or the coordinator's compatibility path
+ * (K5).
  *
  * Proof (2026-09-24): on the Optimization module as sealed before its
  * cache-key port, this suite failed with exactly
@@ -70,6 +74,13 @@ const rules: readonly ImportRule[] = [
       declared.startsWith('libs/wbs/adapters/') ||
       declared === 'apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts',
   },
+  {
+    from: (path) => path.startsWith('module/solver-supervisor/'),
+    reaches: (declared) =>
+      declared === 'apps/wbs/be-01/src/service/optimization-coordinator.ts' ||
+      (declared.startsWith('apps/wbs/be-01/src/module/optimization/') &&
+        declared !== 'apps/wbs/be-01/src/module/optimization/contract.ts'),
+  },
 ];

 function underRepository(fileName: string): string {
@@ -215,6 +226,7 @@ describe('the checked import routes of the backend modules', () => {
     // Proof (2026-09-24): filtering `scannedSources` on `.tsx` instead of `.ts` failed here on
     // `Received: []` (0 pass, 1 fail).
     expect(scanned).toContain('module/optimization/contract.ts');
+    expect(scanned).toContain('module/solver-supervisor/solver-supervisor-spawner.ts');
     // Proof (2026-09-24): building the program with `paths: undefined` failed here: the feature
     // no longer reached `libs/wbs/domain/domain/src/stored-vocabularies.ts` (0 pass, 1 fail).
     expect(report.reached.get('module/optimization/optimization.feature.ts')).toContain(
```

### 10.18 Slice 3's Proof comments (slice 3 step 8 — only after rows 36-42 were observed)

```diff
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/module.ts b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/module.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
@@ -43,6 +43,9 @@ export const solverSupervisorModule = DiBag.createBuilder()
       }): SolverSupervisorSpawnerOptions => ({
         unix,
         callerId,
+        // Proof (2026-09-24): handing the mapper `searchWorkers: 1` instead of the supplied
+        // request left `hands the reserved attempt to the connector installSolverSupervisor wires`
+        // failing (4 pass, 1 fail): the wire request carried `"searchWorkers": 1`.
         searchWorkers,
         memoryLimitMb,
         connect,
@@ -58,4 +61,12 @@ export const solverSupervisorModule = DiBag.createBuilder()
       }): ReservedSpawner => solverSupervisorSpawner(supervisorOptions),
     ),
   })
+  // Proof (2026-09-24): widening the key tuple to `['spawner', 'supervisorOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
+  // `resolve('supervisorOptions')` did not throw, `inspectGraph()` reported bare
+  // `supervisorOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-24): dropping `{ label: SOLVER_SUPERVISOR_LABEL }` left only the two label
+  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `supervisorOptions`
+  // unlabelled, and the missing-requirement message named `supervisorOptions` instead of
+  // `backend.solver-supervisor/supervisorOptions`.
   .buildModule(['spawner'], { label: SOLVER_SUPERVISOR_LABEL });
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/check.ts b/apps/wbs/be-01/src/module/solver-supervisor/check.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/check.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/check.ts
@@ -26,5 +26,11 @@ export function installSolverSupervisor(
       connect: DiBag.fromSyncFactory(() => requirements.connect),
     })
     .build();
+  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
+  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
+  // `wbs-be-01:typecheck` at exit 0.
+  // Proof (2026-09-24): attaching `resolve` to the returned launcher port kept the key list
+  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
+  // `wbs-be-01:typecheck` at exit 0.
   return { spawner: bag.resolve('spawner') };
 }
diff --git a/apps/wbs/be-01/src/module-boundaries.test.ts b/apps/wbs/be-01/src/module-boundaries.test.ts
--- a/apps/wbs/be-01/src/module-boundaries.test.ts
+++ b/apps/wbs/be-01/src/module-boundaries.test.ts
@@ -55,6 +55,13 @@ interface ImportRule {
  * `apps/wbs/be-01/src/repository/optimization-admission.ts`,
  * `libs/wbs/adapters/store-sqlite/src/optimization-admission.ts` and
  * `apps/wbs/be-01/src/module/optimization/solver-child-lifecycle.ts` (0 pass, 1 fail each).
+ * Proof (2026-09-24): prepending
+ * `import type { ReservedSpawner as FeatureSpawner } from '../../service/optimization-coordinator';`
+ * to `module/solver-supervisor/solver-supervisor-spawner.ts` failed it with exactly
+ * `'../../service/optimization-coordinator' reaches apps/wbs/be-01/src/service/optimization-coordinator.ts`;
+ * prepending `import '../optimization/optimization.feature';` instead failed it with exactly
+ * `'../optimization/optimization.feature' reaches apps/wbs/be-01/src/module/optimization/optimization.feature.ts`
+ * (0 pass, 1 fail each).
  */
 const rules: readonly ImportRule[] = [
   {
```

### 10.19 Registration: the two `modules.json` rows (slice 4 step 1)

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -474,6 +474,34 @@
         ]
       }
     },
+    {
+      "moduleId": "module.backend.optimization",
+      "name": "Optimization sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/be-01/src/module/optimization",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/be-01/src/module/optimization/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/be-01/src/module/solver-supervisor/contract.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/module/solver-supervisor/module.ts" },
+          {
+            "kind": "path",
+            "path": "apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts"
+          },
+          { "kind": "path", "path": "apps/wbs/be-01/src/service/optimization-coordinator.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/service/optimized-schedule-reader.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/service/solver-child-lifecycle.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/services.ts" }
+        ]
+      }
+    },
     {
       "moduleId": "module.backend.solver-launcher",
       "name": "Solver launcher sealed DI Bag module",
@@ -495,6 +523,26 @@
         ]
       }
     },
+    {
+      "moduleId": "module.backend.solver-supervisor",
+      "name": "Solver supervisor sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/be-01/src/module/solver-supervisor",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/be-01/src/module/solver-supervisor/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/be-01/src/main.ts" },
+          { "kind": "path", "path": "apps/wbs/be-01/src/service/solver-supervisor-client.ts" }
+        ]
+      }
+    },
     {
       "moduleId": "module.docs.wbs-table-extraction",
       "name": "Historical WbsTable extraction pilot boundary",
```

### 10.20 Registration: the two `policy.json` boundaries (slice 4 step 2)

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1144,6 +1144,44 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.backend.optimization",
+      "selector": {
+        "kind": "prefix",
+        "value": "apps/wbs/be-01/src/module/optimization"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/be-01/src/service/optimization-coordinator.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "5a8c8f54f430cd67e29d12d3f35b4d77a2d9ae39",
+          "path": "apps/be-01/src/service/optimization-coordinator.ts"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.backend.solver-supervisor",
+      "selector": {
+        "kind": "prefix",
+        "value": "apps/wbs/be-01/src/module/solver-supervisor"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/be-01/src/service/solver-supervisor-client.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "31b66e999d627f2b2cd2709893c449dcfab8b3f8",
+          "path": "apps/be-01/src/service/solver-supervisor-client.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

### 10.21 Registration: `pilotPaths` and both README indexes (slice 4 step 3)

Each README names its predecessor by filename only: `tool-devsync`'s `LEGACY_ROOT` scan refuses a
current README that spells a pre-namespacing path.

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -53,7 +53,9 @@ const pilotPaths = [
   'libs/wbs/adapters/store-memory/src/README.md',
   'openspec/changes/archive/2026-09-08-bounded-replay-sweep/README.md',
   'tools/tool-dagger/src/lib/README.md',
+  'apps/wbs/be-01/src/module/optimization/README.md',
   'apps/wbs/be-01/src/module/solver-launcher/README.md',
+  'apps/wbs/be-01/src/module/solver-supervisor/README.md',
   'apps/wiki/cli/README.md',
 ] as const;
 const scratch: string[] = [];
diff --git a/apps/wbs/be-01/src/module/optimization/README.md b/apps/wbs/be-01/src/module/optimization/README.md
--- a/apps/wbs/be-01/src/module/optimization/README.md
+++ b/apps/wbs/be-01/src/module/optimization/README.md
@@ -1,5 +1,7 @@
 # Optimization

+<!-- module-index {"schemaVersion":1,"moduleId":"module.backend.optimization","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"optimization.feature.ts"},{"kind":"path","path":"optimized-schedule-reader.test.ts"},{"kind":"path","path":"optimized-schedule-reader.ts"},{"kind":"path","path":"solver-child-lifecycle.ts"}],"relationshipSelectors":[],"applicableChecks":["check.be-01.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading services.ts, the Supervisor module and the three compatibility shims."},{"section":"invariants","reason":"The admit-before-spawn, heartbeat-before-release and commit-then-push invariants are documented on OptimizationCoordinator and runSolverChildLifecycle; apps/wbs/be-01/src/module-boundaries.test.ts checks the import routes the contract must not take."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/module/solver-supervisor/contract.ts"},{"kind":"path","path":"apps/wbs/be-01/src/module/solver-supervisor/module.ts"},{"kind":"path","path":"apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/optimization-coordinator.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/optimized-schedule-reader.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/solver-child-lifecycle.ts"},{"kind":"path","path":"apps/wbs/be-01/src/services.ts"}],"knowledgeLimit":"Only the composition root, the Supervisor module's production files and the three compatibility shims are declared; app.ts, the local solver launcher, the controller tests and the optimization database tests reach this module through the shims and are not tracked here."}} -->
+
 The optimized-schedule feature as a sealed DI Bag module under `apps/wbs/be-01`: `module.ts` seals
 the graph, `check.ts` is the only place that builds a bag, and `contract.ts` states what a host must
 supply and the neutral port types Optimization shares with its launchers — the reserved spawn
@@ -14,7 +16,10 @@ named under the `backend.optimization` label, so a DI failure says which module

 ## Checks

-The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.
+The applicable check is the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`,
+recorded above as `check.be-01.test` and declared in `docs/wiki-policy/relationships.json`. Its
+`apps/wbs/be-01/src/module-boundaries.test.ts` refuses the repository-schema and repository-hash
+routes back into this module and any adapter route into `contract.ts`.

 ## Consumers

@@ -22,3 +27,14 @@ The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/b
 stops the coordinator it returns. `apps/wbs/be-01/src/service/optimization-coordinator.ts`,
 `service/solver-child-lifecycle.ts` and `service/optimized-schedule-reader.ts` keep the former paths
 for `app.ts`, the local solver launcher, the controller tests and the optimization database tests.
+The Solver supervisor module imports `contract.ts` for the launcher port it implements.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.backend.optimization` (`docs/wiki-policy/policy.json`'s `boundary.backend.optimization`).
+The boundary's `sourceSelector` binds this directory to `optimization.feature.ts`'s own single
+pre-namespacing predecessor, `optimization-coordinator.ts`, which existed at the pilot's frozen
+`sourceRevision` — the same mechanism `boundary.backend.solver-launcher` uses. The other files here
+have no separate baseline entry: the registration's guarantee is one predecessor per module
+directory, not one per file it holds.
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/README.md b/apps/wbs/be-01/src/module/solver-supervisor/README.md
--- a/apps/wbs/be-01/src/module/solver-supervisor/README.md
+++ b/apps/wbs/be-01/src/module/solver-supervisor/README.md
@@ -1,5 +1,7 @@
 # Solver supervisor

+<!-- module-index {"schemaVersion":1,"moduleId":"module.backend.solver-supervisor","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"solver-supervisor-spawner.test.ts"},{"kind":"path","path":"solver-supervisor-spawner.ts"},{"kind":"path","path":"solver-supervisor.repository.test.ts"},{"kind":"path","path":"solver-supervisor.repository.ts"}],"relationshipSelectors":[],"applicableChecks":["check.be-01.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading main.ts and the compatibility shim."},{"section":"invariants","reason":"The one-attempt-per-connection, verdict-before-kill and bounded-reply invariants are documented on connectSolverSupervisor; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/main.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/solver-supervisor-client.ts"}],"knowledgeLimit":"Only the production entrypoint and the compatibility shim are declared; the two Supervisor diagnostic scripts under apps/wbs/be-01/scripts reach this module through the shim and are not tracked here."}} -->
+
 The host Solver supervisor's client as a sealed DI Bag repository module under `apps/wbs/be-01`:
 `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
 states the socket, caller identity and resource requests a host must supply.
@@ -14,10 +16,23 @@ module asked.

 ## Checks

-The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.
+The applicable check is the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`,
+recorded above as `check.be-01.test` and declared in `docs/wiki-policy/relationships.json`. Its
+`apps/wbs/be-01/src/module-boundaries.test.ts` refuses any route from this module into the
+Optimization feature, its private support or the coordinator's compatibility path.

 ## Consumers

 `apps/wbs/be-01/src/main.ts` installs the module and hands its launcher port to the Optimization
 coordinator; `apps/wbs/be-01/src/service/solver-supervisor-client.ts` keeps the former path for the
 two Supervisor diagnostic scripts under `apps/wbs/be-01/scripts/`.
+
+## Wiki registration
+
+A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
+`module.backend.solver-supervisor` (`docs/wiki-policy/policy.json`'s
+`boundary.backend.solver-supervisor`). The boundary's `sourceSelector` binds this directory to
+`solver-supervisor.repository.ts`'s own single pre-namespacing predecessor,
+`solver-supervisor-client.ts`, which existed at the pilot's frozen `sourceRevision`. The mapper's
+own predecessor existed then too; the registration's guarantee is one predecessor per module
+directory, not one per file it holds.
```

### 10.22 The prose-refusal pin (slice 4 step 5 — only after row 47)

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -583,11 +583,12 @@ describe('reviewed radical-modularity pilot through production CLI', () => {
     // Proof: replacing every executable check with external-consumer prose was refused at
     // `apps/wiki/cli/README.md: check.wiki-cli.test (external-consumer)`. The refusal names the
     // first offending index in path order, which moved from `docs/findings/README.md` to that
-    // one when tool-wiki became `apps/wiki/cli` (2026-09-16), and from there to the Solver
+    // one when tool-wiki became `apps/wiki/cli` (2026-09-16), from there to the Solver
     // launcher's index when the first backend module registered `check.be-01.test`
-    // (2026-09-23).
+    // (2026-09-23), and from there to the Optimization module's index, which sorts before it
+    // (2026-09-24).
     expect(observed).toContain(
-      'applicable check has no executable authority in apps/wbs/be-01/src/module/solver-launcher/README.md: check.be-01.test (external-consumer)',
+      'applicable check has no executable authority in apps/wbs/be-01/src/module/optimization/README.md: check.be-01.test (external-consumer)',
     );
   }, 120_000);

```

### 10.23 Legacy re-pin, the numbers (slice 4 step 6 — only after row 49)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 67,
+      'historical policy selector or baseline': 71,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -843,8 +843,8 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // naming the pre-namespacing `libs/core/src/service/plan-commands.ts` it was extracted from;
     // raised `historical policy selector or baseline` from 65 to 67 and occurrences from 283 to
     // 285, no unclassified entries (2026-09-24).
-    digest: '687c123b315024882f690de60d7a3ac6890f89200a880ebf21b2242b66987a54',
-    occurrences: 285,
+    digest: '8d9667b7d195746954849db31d5e6e106858109737d058581c5d33b4e7097d2e',
+    occurrences: 289,
     unclassified: [],
   });
 });
```

### 10.24 Legacy re-pin, the Proof (slice 4 step 6 — after row 50)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -843,6 +843,13 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // naming the pre-namespacing `libs/core/src/service/plan-commands.ts` it was extracted from;
     // raised `historical policy selector or baseline` from 65 to 67 and occurrences from 283 to
     // 285, no unclassified entries (2026-09-24).
+    // Proof: registering Optimization and the Solver supervisor, the second and third backend
+    // modules, added `boundary.backend.optimization`'s and `boundary.backend.solver-supervisor`'s
+    // `sourceSelector` and one `baselineEntries` path each, naming the pre-namespacing
+    // `apps/be-01/src/service/optimization-coordinator.ts` and
+    // `apps/be-01/src/service/solver-supervisor-client.ts` they were extracted from; raised
+    // `historical policy selector or baseline` from 67 to 71 and occurrences from 285 to 289, no
+    // unclassified entries (2026-09-24).
     digest: '8d9667b7d195746954849db31d5e6e106858109737d058581c5d33b4e7097d2e',
     occurrences: 289,
     unclassified: [],
```

### 10.25 Task records (slice 4 step 7)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -32,16 +32,35 @@
       `AuthenticatedUser` only; `http/endpoint.ts` re-exports both and keeps `Identity` built from them.
       `service/retention-timer.ts` moved with the use cases. Checked by
       `ports/sideways-type-boundaries.test.ts`.
-- [ ] 1.5 Move the Optimization spawn and child interfaces into the Optimization contract; keep the
+- [x] 1.5 Move the Optimization spawn and child interfaces into the Optimization contract; keep the
       Supervisor request/attempt mapper private beside the Supervisor client and amend its
-      classification to adapter-private support.
-- [ ] 1.6 Import `SolverObjectiveName` from `@wbs/domain` and replace the repository hash shim with
+      classification to adapter-private support. Landed 2026-09-24: `ReservedSpawnRequest`,
+      `ReservedSolverChild`, `ReservedSolverTerminal`, `ReservedSpawner` and the child port
+      `SolverChildProcess` are declared in `apps/wbs/be-01/src/module/optimization/contract.ts`
+      over the contract's own `OptimizationCacheKey` and `ReservedSolverAdmission`, so the port
+      names no `@wbs/store-sqlite` row type and nothing of the private child lifecycle. The mapper
+      moved into `apps/wbs/be-01/src/module/solver-supervisor/` as `solver-supervisor-spawner.ts`,
+      private support of the Supervisor repository module, and imports the port from that
+      contract; its `kinds.json` repository row is removed rather than rewritten, because no path
+      under `service/` remains to classify (88 to 87 entries). Checked by
+      `apps/wbs/be-01/src/module-boundaries.test.ts`: the contract reaching a repository file or the
+      lifecycle, and the Supervisor reaching the feature or the coordinator's compatibility path,
+      each watched failing.
+- [x] 1.6 Import `SolverObjectiveName` from `@wbs/domain` and replace the repository hash shim with
       an injected cache-key port backed by SQLite's existing SHA-256. First half landed 2026-09-22:
       `apps/wbs/be-01/src/service/optimization-coordinator.ts` and `…/optimized-plan-read.test.ts` take
       `SolverObjectiveName` from `@wbs/domain`, and the coordinator takes `ProjectEvent` from `@wbs/core`
       rather than through `service/broadcast.ts`. No rule prevents the repository-schema path returning:
       be-01 has no type-identity boundary check, and the Optimization module of 3.6 owns that rule. The
-      cache-key port is still owed.
+      cache-key port is still owed. Second half landed 2026-09-24: the coordinator hashes an input
+      through the injected cache-key port `hashInput`, typed `ScheduleInputHasher` in the Optimization
+      contract, which `apps/wbs/be-01/src/services.ts` backs with `@wbs/store-sqlite`'s
+      `scheduleInputHash`; the feature no longer imports the repository hash shim.
+      `apps/wbs/be-01/src/module-boundaries.test.ts` is the owed rule: any file of the Optimization
+      module reaching the repository schema or the repository hash helper, through be-01's shims or
+      `@wbs/store-sqlite` directly, fails it — watched on the tree before the port and on two injected
+      schema imports. It resolves module specifiers and identifiers; a member selected by string key
+      out of an allowed barrel is a stated residual.
 - [x] 1.7 Wire or delete `saved-plan-retry.ts` under the accepted saved-plans obligation. Deleted
       2026-09-23, with its unit test, be-01's re-export shim and its database test, its barrel
       export, its `service/service-boundaries.test.ts` entry and both `kinds.json` rows (95 to 93
@@ -132,7 +151,24 @@
       the two private bindings (`authOptions`, `throttleOptions`) exported independently, and the
       label dropped. Wiki registration (task 7.5) IS landed for this module; see 7.5's own note
       below.
-- [ ] 3.6 Optimization, with its repository ports and event projections.
+- [ ] 3.6 Optimization, with its repository ports and event projections. Sealed 2026-09-24 as
+      `apps/wbs/be-01/src/module/optimization/` (`module.backend.optimization`): the moved
+      `optimization.feature.ts`, its private `solver-child-lifecycle.ts` and
+      `optimized-schedule-reader.ts`, a module exporting only `optimizer`, and `buildServices`
+      installing it through `installOptimization`; the three former `service/` paths are
+      compatibility re-export shims and their `kinds.json` rows are rewritten in place. The three
+      outcome events are contract projections over the neutral `ProjectEvent`, and the feature no
+      longer re-exports `@wbs/store-sqlite`'s `storeOptimizedOutcomeAndRecord`. Proof: the module's
+      own tests; negatives for the installer leaking its bag, its resolver leaking through the
+      returned coordinator, the private `optimizationOptions` binding exported, the label dropped, and
+      the supplied contract version, error sink and cache-key port each replaced;
+      `apps/wbs/be-01/src/service/clock.test.ts` now scans every backend module directory, watched
+      failing. **Not ticked: the repository ports are not landed.** The feature still takes the
+      SQLite `db` and calls `@wbs/store-sqlite`'s queue, admission, drain, generation, cache and
+      outcome functions directly, and its lifecycle does the same for heartbeat and release — K3
+      debt recorded in the module's `contract.ts` and tracked under 7.4. Those calls sit inside the
+      spawn, cancel and restart interleavings the coordinator owns, so replacing them needs an
+      interleaving model-based test with sabotage proofs, in a change of its own.

 ## 4. Plan document and the adapter-side modules

@@ -148,7 +184,7 @@
       `PlanDocumentService`, the private `planDocumentOptions` binding exported, the label
       dropped, the supplied clock replaced, and the moved resource importing the Calendar marker
       service. Wiki registration (7.5) is not landed for this module; see 7.5's own note below.
-- [ ] 4.2 Local solver launcher as a standalone repository module; Supervisor as a repository
+- [x] 4.2 Local solver launcher as a standalone repository module; Supervisor as a repository
       module with the request/attempt mapper private to it. Local solver launcher landed
       2026-09-23 as `apps/wbs/be-01/src/module/solver-launcher/`, identified
       `module.backend.solver-launcher` rather than `local-solver-launcher` because
@@ -158,13 +194,23 @@
       row is rewritten in place (93 entries, unchanged). Proof: the module's own tests; negatives
       for the installer leaking its bag, its resolver leaking through the returned launcher, the
       private `launcherSeams` binding exported, the label dropped, the supplied probe bypassed,
-      and the moved file keeping its pre-move source-module depth. **Supervisor is not landed, so
-      not ticked:** `solver-supervisor-spawner.ts`, the mapper that would become its private
+      and the moved file keeping its pre-move source-module depth. **Supervisor was not landed
+      then:** `solver-supervisor-spawner.ts`, the mapper that would become its private
       support, imports `ReservedSpawner` and `ReservedSolverChild` from
       `optimization-coordinator.ts`, the Optimization feature, which a repository module may not
       do (K5). Task 1.5 moves those types into the Optimization contract, which does not exist
       before 3.6, and they still name `@wbs/store-sqlite`'s `SpawnRequest` and
-      `SolverSlotAdmission` and Optimization's private `SolverChildProcess`.
+      `SolverSlotAdmission` and Optimization's private `SolverChildProcess`. Supervisor landed
+      2026-09-24, after 1.5, as `apps/wbs/be-01/src/module/solver-supervisor/`
+      (`module.backend.solver-supervisor`): the moved `solver-supervisor.repository.ts`, its private
+      request/attempt mapper `solver-supervisor-spawner.ts`, a module exporting only the adapted
+      launcher port `spawner`, and `main.ts` installing it through `installSolverSupervisor`.
+      `service/solver-supervisor-client.ts` is a compatibility re-export shim for the two
+      diagnostic scripts, whose `connectSolverSupervisor` stays a TypeScript diagnostic and test
+      surface rather than a second DI service; its `kinds.json` row is rewritten in place. Proof:
+      the module's own tests; negatives for the installer leaking its bag, its resolver leaking
+      through the returned port, the private `supervisorOptions` binding exported, the label dropped
+      and the supplied worker request replaced; its K5 edge is 1.5's check.

 ## 5. The per-admission modules

@@ -310,6 +356,13 @@
       and `boundary.application.plan-commands`, bound to the pre-namespacing `plan-commands.ts`
       alone; `run-command-batch.ts`'s own predecessor stays in `boundary.application.use-cases`'s
       baseline, and the other moved files have no separate baseline entry.
+      Landed again 2026-09-24 for Optimization (task 3.6) and the Solver supervisor (task 4.2) as
+      `module.backend.optimization` and `module.backend.solver-supervisor`, with
+      `boundary.backend.optimization` and `boundary.backend.solver-supervisor` bound to the
+      pre-namespacing `apps/be-01/src/service/optimization-coordinator.ts` and
+      `apps/be-01/src/service/solver-supervisor-client.ts` alone. Both indexes name
+      `check.be-01.test`, and `pilot-policy.test.ts`'s prose-refusal pin now names the Optimization
+      index, the first offending index in path order.
       **Not landed for Plan document (task 4.1)**, for Plan import's reason below:
       `libs/core/src/service/plan-document.ts` was introduced at commit `8c34a33f` and renamed
       `R100` at `7c5dee9e`, both after the pilot's frozen `sourceRevision`.
```

## 11. Global stop conditions

- A red checkpoint reports `0 tests ran`.
- A mutation leaves its named test passing: restore, check the location against section 6, redo once,
  stop if it still passes. `fault.py` refusing (fewer matching lines than the occurrence) is a
  location stop, not a retry.
- A boundary fault of rows 20-24, 41 or 42 reports a violation other than the one named, or more
  than it.
- A step-0 line does not print what it says, or the step-0 tree is not clean.
- `git apply --check` refuses any section-10 diff: the file drifted; report, do not repair.
- An erased-body comparison differs from rows 15 and 31.
- A pin differs from step 0 other than by this packet's own prescribed change (`kinds.json` 88 in
  slices 1 and 2 and 87 after slice 3; wiki modules and boundaries +2 each in slice 4; the legacy pin
  exactly as row 49 states; the prose-refusal pin exactly as row 47 states).
- Any change to what a moved file does. The **only** permitted changes to moved code are 10.2's,
  10.10's feature hunk and 10.13's lines; the only permitted installer changes are 10.5's
  `services.ts` hunk and 10.16's `main.ts` hunk.
- A network access or an OpenSpec download.
- A check needs an edit this packet does not prescribe (in particular, any importer of the four
  shimmed paths, `app.ts`, `boot.ts`, `dev/local-solver-spawner.ts` or a Supervisor script needing an
  edit).

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.
Paths under `apps/wbs/be-01/src/` are written from `src/`; `src/o/` is `src/module/optimization/` and
`src/s/` is `src/module/solver-supervisor/`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                                                                                                                                                                                     | Untracked (new)                                                                                                                                                                                                                                          | Deleted                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `service/clock.test.ts`, `service/optimization-coordinator.ts`, `service/optimized-schedule-reader.ts`, `service/solver-child-lifecycle.ts`, `services.ts`                                                                                                                                                                                   | the **nine** files under `src/o/`: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `optimization.feature.ts`, `optimized-schedule-reader.test.ts`, `optimized-schedule-reader.ts`, `solver-child-lifecycle.ts`                    | `src/service/optimized-schedule-reader.test.ts` (moved)                                                                                             |
| 2     | `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `o/README.md`, `o/check.ts`, `o/contract.ts`, `o/module.test.ts`, `o/module.ts`, `o/optimization.feature.ts`, `service/optimization-cancel.two-coordinator.db.test.ts`, `service/optimization-coordinator.db.test.ts`, `service/optimization-events.db.test.ts`, `service/optimization-restart.db.test.ts`, `service/optimization-spawn-handshake.proc.db.test.ts`, `services.ts` | `src/module-boundaries.test.ts`                                                                                                                                                                                                                          | nothing                                                                                                                                             |
| 3     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `src/`: `main.ts`, `module-boundaries.test.ts`, `service/solver-supervisor-client.ts`                                                                                                                                                                                                                                                                | the **nine** files under `src/s/`: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `solver-supervisor-spawner.test.ts`, `solver-supervisor-spawner.ts`, `solver-supervisor.repository.test.ts`, `solver-supervisor.repository.ts` | `src/service/solver-supervisor-client.test.ts`, `src/service/solver-supervisor-spawner.test.ts`, `src/service/solver-supervisor-spawner.ts` (moved) |
| 4     | `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `src/o/README.md`, `src/s/README.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                                                                                 | nothing                                                                                                                                                                                                                                                  | nothing                                                                                                                                             |

Every "modified" count includes `verify.md`, which the rehearsal commits never touch, so a rehearsal commit's `--name-status` shows one fewer. Slice 1: 7 modified, 9 new, 1 deleted (17 paths). Slice 2: 13 modified, 1 new (14). Slice 3: 5
modified, 9 new, 3 deleted (17). Slice 4: 8 modified. The planner may add a revised packet file to its
own commits; the lists are scoped to `$base`, so that does not break them.

## 13. Findings

- **Task 3.6 cannot be closed by a move.** Its repository ports replace calls that sit inside the
  coordinator's spawn, cancel and restart interleavings; addendum 15 and 16 make that its own packet
  with a model-based test first (section 9, item 1). The module lands with the K3 debt disclosed.
- **A move silently narrowed a scan.** `clock.test.ts` read no backend module directory, so the moved
  coordinator left its rule (row 4); slice 1 extends it, as E7 did for the core's modules.
- **be-01 had no import-route check at all.** The new file is deliberately smaller than the core's
  sideways checker (specifiers and identifiers, not string-keyed selections) and says so; each of its
  guards and route clauses has a watched negative.
- **The prose-refusal pin moves again**, from the Solver launcher's index to the Optimization index,
  because `optimization` sorts before `solver-launcher` (row 47).
- **Landed code of packets A-G:** no defect found.

## 14. Document exemption (precondition, not a slice)

Sections 3, 7 (slice 4 step 0), 10.20, 10.24 and 10.25 cite
`apps/be-01/src/service/optimization-coordinator.ts` and
`apps/be-01/src/service/solver-supervisor-client.ts`, the predecessors this packet registers, and
section 3 cites three more files under that pre-namespacing root.
`docs/findings/current-document-check-exemptions.json` carries this packet's `legacy-root` entry,
committed with the packet itself (inserted after E4's entry, away from the entries E5-G added); no slice
touches that file.

## 15. `git apply --check` verification

Every fenced `diff` block above was extracted from this document by the script below and applied in
slice order to a disposable worktree of `1378c1dd`, with the filesystem steps each slice prescribes in
between, and the resulting tree compared with the rehearsed slice commits.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <base> <slice1-sha> <slice2-sha> <slice3-sha> <slice4-sha>
set -euo pipefail
repo=$1; packet=$2; base=$3; s1=$4; s2=$5; s3=$6; s4=$7
work=$(mktemp -d "${TMPDIR:?}/h-extract-XXXXXX")
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
test "$(ls "$work"/*.patch | wc -l)" -eq 18
test "$(ls "$work"/*.listing | wc -l)" -eq 15
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" "$base"
cd "$wt"
b=apps/wbs/be-01/src
o=$b/module/optimization
s=$b/module/solver-supervisor
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
mkdir -p "$o"
cp "$work/01.listing" "$o/module.test.ts"
cp "$b/service/optimization-coordinator.ts" "$o/optimization.feature.ts"
cp "$b/service/solver-child-lifecycle.ts" "$o/solver-child-lifecycle.ts"
cp "$b/service/optimized-schedule-reader.ts" "$o/optimized-schedule-reader.ts"
mv "$b/service/optimized-schedule-reader.test.ts" "$o/optimized-schedule-reader.test.ts"
apply 01
cp "$work/02.listing" "$b/service/optimization-coordinator.ts"
cp "$work/03.listing" "$b/service/solver-child-lifecycle.ts"
cp "$work/04.listing" "$b/service/optimized-schedule-reader.ts"
cp "$work/05.listing" "$o/contract.ts"
cp "$work/06.listing" "$o/module.ts"
cp "$work/07.listing" "$o/check.ts"
cp "$work/08.listing" "$o/README.md"
apply 02
apply 03
apply 04
test "$(ls "$o" | wc -l)" -eq 9
same_as "$s1"
# Slice 2
cp "$work/09.listing" "$b/module-boundaries.test.ts"
apply 05
apply 06
apply 07
same_as "$s2"
# Slice 3
mkdir -p "$s"
cp "$work/10.listing" "$s/module.test.ts"
cp "$b/service/solver-supervisor-client.ts" "$s/solver-supervisor.repository.ts"
mv "$b/service/solver-supervisor-client.test.ts" "$s/solver-supervisor.repository.test.ts"
mv "$b/service/solver-supervisor-spawner.ts" "$s/solver-supervisor-spawner.ts"
mv "$b/service/solver-supervisor-spawner.test.ts" "$s/solver-supervisor-spawner.test.ts"
apply 08
cp "$work/11.listing" "$b/service/solver-supervisor-client.ts"
cp "$work/12.listing" "$s/contract.ts"
cp "$work/13.listing" "$s/module.ts"
cp "$work/14.listing" "$s/check.ts"
cp "$work/15.listing" "$s/README.md"
apply 09
apply 10
apply 11
test "$(ls "$s" | wc -l)" -eq 9
same_as "$s3"
# Slice 4
for n in $(seq 12 18); do apply "$(printf %02d "$n")"; done
same_as "$s4"
cd "$repo"
git worktree remove --force "$wt"
echo "all 18 diffs applied in slice order; every slice tree equals its rehearsal commit"
````

Output:

```text
diffs=18 listings=15
applied 01
applied 02
applied 03
applied 04
tree equals c91aac09
applied 05
applied 06
applied 07
tree equals 31c3f98a
applied 08
applied 09
applied 10
applied 11
tree equals 984e390e
applied 12
applied 13
applied 14
applied 15
applied 16
applied 17
applied 18
tree equals 7a57b1e7
all 18 diffs applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits are throwaway: slice 1 `c91aac09` and slice 2 `31c3f98a` on
`rehearse/040-6-h-optimization-r2` above `1378c1dd`; slice 3 `984e390e` and slice 4 `7a57b1e7` on
`rehearse/040-6-h-optimization-r3`, cut from `31c3f98a` after the round-1 review reworded
`s/contract.ts`'s K5 paragraph (r2's `e6741ce0` and `7fe6d030` are superseded). None is pushed; they are
kept only as the comparison targets of the script above. None of them touches `verify.md`, which only
the executor writes. Their subjects are rehearsal labels; the planner commits every slice with section
7's subject, and only the trees are compared. Lefthook ran on all six rehearsal commits
(planner-observed).

The same rehearsed tree also produced this erased-body comparison for slice 2 (row 31):

```text
6
212c212
<       if (scheduleInputHash(input) !== next.inputHash) {
---
>       if (this.options.hashInput(input) !== next.inputHash) {
256c256
<     const currentInputHash = scheduleInputHash(ask.input);
---
>     const currentInputHash = this.options.hashInput(ask.input);
361c361
<     const inputHash = scheduleInputHash(ask.input);
---
>     const inputHash = this.options.hashInput(ask.input);
```

## 16. Deferred: label agreement

Whether each README's `moduleId` names the label its module seals its bag under is not checked,
matching packet D's deferral.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fixture reproduces the failure first | §6 rows 1 and 32 (module reds), 2 (bundle reds), 4 (the clock gap the move opens), 16 (the new check red on the unchanged feature), 17 (test-first compile and runtime red before the port), 33 (compile red on the moved mapper), 44, 45, 47 and 49 (registration and pin reds), all on code the slice has not fixed                                                           |
| 2   | Test code passes typecheck and lint  | `wbs-be-01` lint and typecheck on each rehearsed slice; `tool-devsync` and `twilight-burokrat` typecheck and lints on slice 4; lefthook passed on all six rehearsal commits (planner-observed)                                                                                                                                                                                  |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                                                                                                                                                                                                                                                                                             |
| 4   | Commands can show failure            | §7 status wrapper; `if count=$(grep -cF …)` form for every bundle grep; the erased-body `diff` status captured, then asserted `1`                                                                                                                                                                                                                                               |
| 5   | Tests reading `HEAD`                 | §7 slice 4 preamble: slices 1-3 are committed before the pilot suite runs, and the README blocks arrive only through `pilotPaths`                                                                                                                                                                                                                                               |
| 6   | Sandbox facts                        | measured in `codex sandbox` (row E1, E2): `app.routes.test.ts` and both `*.proc.db.test.ts` suites excluded; the six database files run; kinds substitute (service-kinds is planner-only); §8                                                                                                                                                                                   |
| 7   | Known race                           | §8                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | Names                                | `module.backend.optimization`, `module.backend.solver-supervisor`; labels `backend.optimization`, `backend.solver-supervisor`; no `local-solver` substring (row 35's entrypoint test); Twilight Burokrat                                                                                                                                                                        |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines                                                                                                                                                                                                                                                                                               |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change; `di-bag` stays 0.4.0                                                                                                                                                                                                                                                                                                   |
| 11  | `\|\| test $? -eq 1` after pipelines | not used; single-command `if … then … else status=$?` forms only                                                                                                                                                                                                                                                                                                                |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                                                                                                                                                                                                                                                                                        |
| 13  | Index every module file              | §10.21's two blocks name all eight non-README files of each module; `check-indexes committed` listed exactly those (§7 slice 4)                                                                                                                                                                                                                                                 |
| 14  | Bun path vs filter                   | every focused run uses `./…` or `cd <project>` with `./src/…`; lint and typecheck before baselines                                                                                                                                                                                                                                                                              |
| 15  | Interleaving property tests          | not triggered, with evidence: the moved coordinator and lifecycle are statement-identical after type erasure (row 15) and the port changes three synchronous expressions in place (row 31); the repository ports that would change the interleavings' call sites are the next packet, which §9 gives a model-based test first                                                   |
| 16  | Model-based tests                    | not triggered, for row 15's reason; required and scoped for the next packet (§9, item 1)                                                                                                                                                                                                                                                                                        |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed` (dispatch paragraph)                                                                                                                                                                                                                                                                                                               |
| 18  | Symbol-based boundary checks         | `module-boundaries.test.ts` resolves specifiers and identifiers with the installed TypeScript `TypeChecker` and compares declaration files, never spelling; every route clause and guard watched (rows 20-29, 41, 42)                                                                                                                                                           |
| 19  | ugrep exits 1 on missing file        | `test -f "$bundle"` precedes every bundle grep; step-0 greps follow existence gates                                                                                                                                                                                                                                                                                             |
| 20  | Promise only what a check keeps      | 3.6 **not** ticked, its K3 debt disclosed in `contract.ts`; the new check's string-keyed selection residual stated in its JSDoc and in 1.6's note; K5 claimed only for the Supervisor's Optimization edge it watches; `check-indexes` called index validation; the mapper's classification recorded as a removed row plus the README's "private support", not as a checked rule |
