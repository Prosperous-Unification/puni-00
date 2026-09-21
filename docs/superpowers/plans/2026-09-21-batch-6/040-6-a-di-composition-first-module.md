# 040.6 A DI composition, and the first sealed core module

> **Re-pointed by the planner on 2026-09-22.** This packet was rehearsed on the commit that pull request 30
> merged; the dispatch base is main after the product's rename to Twilight Burokrat (Nx project
> `twilight-burokrat`, CI policy directory `infra/ci/burokrat/`, short command `twib` unchanged). No command in
> this packet names a renamed identifier, and `apps/wiki/cli` did not move, so the `check.wiki-cli.*`
> identifiers are unaffected.
>
> **Dispatch:** `--batch batch-6` (the launcher's batch-6 default supplies
> `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`). No slice binds a port, so **no slice
> needs `--network`**; section 7 scopes every command to what the sandbox can run.

| Field      | Value                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — first packet  |
| Size class | M, in five slices                                                                                        |
| Slices     | 1 open the change, 2 the domain gate, 3 the six importers, 4 the first module, 5 install it              |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, preparation 2 and one module    |
| Planned on | 2026-09-21, every slice rehearsed end to end in a private worktree of `72627001`; revised after review 1 |

**You execute one slice and stop.** The end of your instructions names which. Each slice in section 7
opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

## 1. Goal and non-goals

**Goal.** Open the OpenSpec change `adopt-di-composition` over the whole of 040.6's target shape, so
every later packet only ticks its tasks; then land the map's smallest independent no-sideways
preparation (the project write gate moves to the domain library as `canEditProject`); then extract
Plan history as the pattern-setting sealed DI Bag module, with a README, a contract, a labelled
`module.ts` and a composition check, proving by test that **the production installer** hands out the
contract's exports and nothing else, and that the module's label names a binding in a real DI failure
message.

**Non-goals.** No library version bump: `di-bag` stays 0.4.0, `application-exception` 0.5.0,
`caught-object-report-json` 11.0.1, and `bun.lock` and `package.json` are the planner's. No frontend,
no gateway, no MCP. No second core module — the map's other responsibilities are later packets,
listed in section 9. **No K2 feature owner is invented:** the map is explicit that direct CRUD
delivery for Calendar marker, Capacity, Directory, Priority band, Project, Step and Work item still
lacks accepted feature owners, so full K2 closure stays outside 040.6's claim. **No K3 debt is closed
either:** `HistoryService` reads two repository ports directly, which K3 forbids a feature-service;
sealing the module makes that dependency declared instead of implicit and nothing more, and
`tasks.md` 7.4 is where it is tracked. No wiki-module registration (section 3 says why it cannot
happen here). No per-admission module: `servicesOver` keeps hand-wiring in this packet.

## 2. Read first

| File                                                                    | Why                                                                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                             | Rules R1 to R5. R5 and R3 decide most of the review of this work.                                        |
| `LLM_README.md`                                                         | The index. Read only the entry your slice needs.                                                         |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                   | "Execution contract" and "Standard blocks every packet uses". Slice 1 runs two of those blocks verbatim. |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` | The ownership map. Slice 1 turns it into artifacts; sections 3 and 14 correct it.                        |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`         | "Modules", "Module layout", "Import matrix", K1 to K9.                                                   |
| `libs/wbs/application/core/src/compose.ts`                              | 297 lines. Slice 5 edits two places in it; read `servicesOver` and `composeServices`.                    |
| `apps/wbs/be-01/src/boot.ts`                                            | How DI Bag is already used, and what disposal `bootBe01` owns. Not edited.                               |
| `libs/wbs/application/core/src/service/project.service.ts`              | Slices 2 and 3 move `canEdit` out of it.                                                                 |
| `libs/wbs/application/core/src/service/history.service.ts`              | 40 lines. Slice 4 moves it and leaves a shim.                                                            |

## 3. Verified facts

Every line was read in the repository at `72627001` on 2026-09-21; every command result was observed
in a private worktree of that commit.

| Fact                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-di-composition` does not exist. The schema is `sdd-lean`.                                                                                                                                                                                   | `ls openspec/changes`; `openspec/config.yaml:1`                                                                                                                                       |
| `openspec new change <name> --schema sdd-lean` creates **only** `.openspec.yaml` (`schema: sdd-lean`, `created: <date>`). The five artifacts are then written by hand.                                                                                              | Observed: `Created change 'adopt-di-composition' … Schema: sdd-lean`, then `ls -a` showed `.openspec.yaml` alone                                                                      |
| Strict validation on the unmodified tree: `items` 112, `passed` 112, `failed` 0. With this change added: 113/113/0, and the README's `jq -s -e` contract exits 0.                                                                                                   | Observed 2026-09-21                                                                                                                                                                   |
| `canEdit` is a two-line pure function reading only `restricted` and `ownerId`.                                                                                                                                                                                      | `libs/wbs/application/core/src/service/project.service.ts:94-96`                                                                                                                      |
| Five core service files import it sideways, plus `savePlan`: `grep -rc "^import { canEdit } from './project.service';" libs/wbs/application/core/src/service/*.ts \| grep -c ':1$'` is **5**.                                                                       | `priority-band.service.ts:7`, `capacity.service.ts:5`, `calendar-marker.service.ts:7`, `step.service.ts:9`, `work-item.service.ts:87`, `use-cases/save-plan.ts:3`                     |
| `http/project.routes.ts:19` also imports it, but it is delivery and already imports `ProjectService`, so the compatibility alias keeps it valid and this packet leaves it alone.                                                                                    | `libs/wbs/application/core/src/http/project.routes.ts:19`, `:204`                                                                                                                     |
| `history.service.ts` is 40 lines, one method, two store requirements, and is built once at process level rather than per admitted scope.                                                                                                                            | `libs/wbs/application/core/src/service/history.service.ts`; `compose.ts:228-231`                                                                                                      |
| It is the smallest responsibility in the map. The next smallest are priority band (83 lines) and capacity (95), and both are per-admission and need `canEditProject`.                                                                                               | `wc -l` over `libs/wbs/application/core/src/service/*.service.ts`                                                                                                                     |
| `service-boundaries.test.ts` asserts `libs/wbs/application/core/src/service/history.service.ts` **exists** and lints it. The shim is required, not optional, and that list is what decides when any shim may go.                                                    | `libs/wbs/application/core/src/service/service-boundaries.test.ts:22`, `:53-55`                                                                                                       |
| `docs/code-organization/kinds.json` holds **95** entries. Rewriting the history row in place keeps 95; adding a row for the `.feature.ts` file is refused, and removing the shim's row is refused too.                                                              | `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`; `tools/tool-devsync/src/service-kinds.test.ts:237`, `:259`                    |
| Exactly **one** `wbs-be-01:test:unit` file binds a TCP port: `src/app.routes.test.ts:548` calls `Bun.serve` inside `refuses framed GET and HEAD bodies on the production health route`. No other non-DB be-01 test does.                                            | `(cd apps/wbs/be-01 && grep -rln "Bun.serve" $(find src -name '*.test.ts' ! -name '*.db.test.ts'))` returned `src/app.routes.test.ts` alone; there is no `src` at the repository root |
| `wbs-core:build:portable` bundles `testing/portable-composition.ts` for `--target=browser`, and that entrypoint imports `composeServices`. With the module wired the build exits 0 and the bundle contains `application.plan-history` and `historySettings`.        | `libs/wbs/application/core/project.json`; `testing/portable-composition.ts:4`, `:78`; observed 2026-09-21                                                                             |
| DI Bag 0.4.0 `buildModule(keys, { label })` names non-exported bindings `<label>/<key>` in error messages, cycle paths and `inspectGraph()`; exported bindings keep the bare key.                                                                                   | `node_modules/di-bag/dist/module.d.ts:9-22`, and every row of section 6                                                                                                               |
| A test helper that returns **either** of two registration objects gives DI Bag's builder a union it refuses: `TS2345 … is not assignable to parameter of type 'never'` plus `TS2684`. The two host graphs are written out separately for that reason.               | Observed `wbs-core:typecheck` exit 1 on the helper form, 2026-09-21                                                                                                                   |
| `lint:source` exists **only** on the Burokrat project. For `wbs-core` and `wbs-domain` the source-lint target is `lint`.                                                                                                                                            | `bunx nx show project wbs-core --json`; `package.json:13`                                                                                                                             |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative Markdown link against the file that carries it, so such a link inside a listing quoted in a plan document fails `every routed current document resolves its local links and anchors`. | Observed: four failures naming this packet's own path, then `364 pass`, `2 fail`. The module README therefore uses workspace-relative paths in backticks.                             |
| The six wiki module identifiers use the grammar `module.<ring>.<name>`: `adapter`, `application`, `archive`, `docs`, `domain`, `infra`.                                                                                                                             | `docs/wiki-policy/modules.json`                                                                                                                                                       |
| A new `<!-- module-index -->` block anywhere breaks `pilot-policy.test.ts:380`, and a new `modules.json` row additionally breaks `:363` (`toHaveLength(6)`) and is refused by the CLI as "pilot module ownership has no exact trusted boundary".                    | Observed, section 6 row 8. **This is why this packet registers no wiki module.**                                                                                                      |
| `pilot-policy.test.ts` clones the repository at HEAD and overlays only `pilotPaths`, so it cannot see an uncommitted change to any other file; it also needs `TOOL_WIKI_TRUSTED_NODE_MODULES`.                                                                      | `pilot-policy.test.ts:101-118`; `apps/wiki/cli/project.json:23`; `apps/wiki/cli/src/relationships/index.ts:82`                                                                        |
| `bootBe01` already owns source, retention, optimizer and listener disposal in a tested order. The Plan history module registers no disposer, because nothing it owns has one.                                                                                       | `apps/wbs/be-01/src/boot.ts:89-140`                                                                                                                                                   |

## 4. Why this preparation and why this module

**Preparation.** The map lists eight required no-sideways preparations. Measured:

| Preparation                                                      | Measured size                                                                                                                | Verdict                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1, split `broadcast.ts`                                          | 3 exported contracts plus a collector, consumed by every resource                                                            | Largest. Not first.                                                                                    |
| **2, move `canEdit`**                                            | one 2-line pure function, 6 sideways production imports, 1 compatibility alias                                               | **Chosen.** Smallest preparation that carries a real rule, so it has a production-path negative.       |
| 3, Plan document's marker read                                   | `plan-document.ts:28-30` is **already** a structural port; only the `CalendarMarkerListOutcome` type import at `:14` remains | Smaller in lines, but type-only: no behaviour changes, so R5 has no production-path negative to watch. |
| 8's first half, `SolverObjectiveName`                            | 1 import line in `optimization-coordinator.ts:43` plus 1 test                                                                | Type-only, same objection; and 8's other half (the cache-key port) is not independent of Optimization. |
| 6, the root-supplied optimizer callback and realtime broadcaster | this is already how `compose.ts` wires `OptimizerTriggerBroadcaster`; it becomes a requirement of Realtime and Optimization  | Cannot land before preparation 1 supplies the neutral event port.                                      |
| 4, 5, 7                                                          | Depend on contracts that do not exist yet                                                                                    | Not independent.                                                                                       |

Preparation 2 also breaks the most edges per line changed: six of the map's resource and feature
paths, with no event or service dependency introduced.

**Module.** Plan history, measured smallest in the map at 40 lines and one method, and the only small
one that is **process-level**. Every resource responsibility (priority band 83 lines, capacity 95) is
built inside `servicesOver`, which runs once per admitted transaction; the map warns that a singleton
installation there would leak staged stores between transactions, so the first module must not be one
of those. Plan history needs no `Broadcaster`, no `Clock` and no `canEditProject`, so it isolates the
composition question from every other change.

**Size.** Five slices, each one 20 to 40 minutes. Section 10 gives every artifact and listing
verbatim, which is what keeps slice 1 to one slice. Nothing is padded and nothing is cut.

## 5. File plan

| Path                                                                        | Slice      | Create or modify                                                                                                                   |
| --------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-di-composition/.openspec.yaml`                      | 1          | created by `openspec new change`, not by hand                                                                                      |
| `openspec/changes/adopt-di-composition/proposal.md`                         | 1          | create, verbatim from section 10.1                                                                                                 |
| `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`        | 1          | create, verbatim from section 10.2                                                                                                 |
| `openspec/changes/adopt-di-composition/design.md`                           | 1          | create, verbatim from section 10.3                                                                                                 |
| `openspec/changes/adopt-di-composition/tasks.md`                            | 1, 3, 4, 5 | slice 1 creates it verbatim from section 10.4; slice 3 ticks 1.1, slice 4 ticks 2.1, slice 5 ticks 2.2                             |
| `openspec/changes/adopt-di-composition/verify.md`                           | 1–5        | slice 1 creates it verbatim from section 10.5; slices 2, 3, 4 and 5 each append their own baselines, deltas and evidence basenames |
| `libs/wbs/domain/domain/src/project-ownership.ts`                           | 2          | create                                                                                                                             |
| `libs/wbs/domain/domain/src/project-ownership.test.ts`                      | 2          | create                                                                                                                             |
| `libs/wbs/domain/domain/src/index.ts`                                       | 2          | modify, one export in the named sorted position                                                                                    |
| `libs/wbs/domain/domain/README.md`                                          | 2          | modify, one row naming `project-ownership.ts`                                                                                      |
| `libs/wbs/application/core/src/service/project.service.ts`                  | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/service/priority-band.service.ts`            | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/service/capacity.service.ts`                 | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/service/calendar-marker.service.ts`          | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/service/step.service.ts`                     | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/service/work-item.service.ts`                | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/use-cases/save-plan.ts`                      | 3          | modify                                                                                                                             |
| `libs/wbs/application/core/src/service/broadcast.test.ts`                   | 3          | modify, the stale `canEdit` mention at line 274                                                                                    |
| `libs/wbs/application/core/src/module/plan-history/module.test.ts`          | 4          | create **first**, for the red                                                                                                      |
| `libs/wbs/application/core/src/module/plan-history/plan-history.feature.ts` | 4          | the moved `service/history.service.ts`                                                                                             |
| `libs/wbs/application/core/src/module/plan-history/contract.ts`             | 4          | create                                                                                                                             |
| `libs/wbs/application/core/src/module/plan-history/module.ts`               | 4          | create                                                                                                                             |
| `libs/wbs/application/core/src/module/plan-history/check.ts`                | 4          | create                                                                                                                             |
| `libs/wbs/application/core/src/module/plan-history/README.md`               | 4          | create                                                                                                                             |
| `libs/wbs/application/core/src/service/history.service.ts`                  | 4          | replaced by a re-export shim at the same path                                                                                      |
| `libs/wbs/application/core/src/compose.ts`                                  | 5          | modify, two places                                                                                                                 |
| `libs/wbs/application/core/src/index.ts`                                    | 5          | modify, three export lines                                                                                                         |
| `docs/code-organization/kinds.json`                                         | 5          | modify, one entry rewritten in place                                                                                               |

**Neighbours.** No other batch-6 packet owns any of these paths. `docs/code-organization/kinds.json`
is also the subject of `tasks.md` 1.8, which stays unticked. Section 12's cumulative check is a
`git diff --name-only` against a base the slice records itself, so the planner's own commits —
including a revision of this packet file — cannot break it.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of `72627001` **against the final
listings in section 10**, and the literal fragment is what the runner printed. Restore a mutated file
from a copy under `"$TMPDIR"` and prove it with `cmp` before asserting on any captured status.

| #   | Where                                                                    | Fault injected                                                                                                   | Test that observed it                                                                                                                                            | Literal fragment observed                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | slice 2 red, on the unchanged tree                                       | none; the module does not exist yet                                                                              | `project-ownership.test.ts`                                                                                                                                      | `error: Cannot find module './project-ownership'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                          |
| 2   | slice 4 red, on the unchanged tree                                       | none; `contract.ts`, `module.ts` and `check.ts` do not exist yet                                                 | `module.test.ts`                                                                                                                                                 | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                      |
| 3   | `libs/wbs/domain/domain/src/project-ownership.ts`, `canEditProject` body | `return true;` in place of the rule                                                                              | `announces nothing for a write it refused` in `libs/wbs/application/core/src/service/broadcast.test.ts`                                                          | `- "reason": "forbidden",` / `+ "ok": true,`; `(fail) a calendar marker write announces itself > announces nothing for a write it refused`; `0 pass`, `1 fail`, `10 filtered out`                                                                                                          |
| 4   | `check.ts`, the single `return` of `installPlanHistory`                  | `const exposed = { history: bag.resolve('history'), bag };` then `return exposed;`                               | `exposes only the contract exports from its installer`                                                                                                           | `expect(Object.keys(exposed)).toEqual(['history']);` → `[ "history", + "bag", ]`, `- Expected - 0 / + Received + 1`; `5 pass`, `1 fail`. `wbs-core:typecheck` **still exits 0** on the leak, which is why the enumeration test exists.                                                     |
| 5   | `module.ts`, the key tuple of its single `buildModule` call              | `['history', 'historySettings']` in place of `['history']`                                                       | `keeps its private bindings out of a host graph`, and also `labels its private bindings with the module name` and `names itself when a host omits a requirement` | `Expected substring: "DI_BAG_MISSING_REGISTRATION: Service \"historySettings\" is not registered."` / `Received function did not throw`; and `Received: [ "history", "historySettings", "projectStore", "planEventStore" ]`; `3 pass`, `3 fail`                                            |
| 6   | `module.ts`, the options object of that same call                        | the `{ label: PLAN_HISTORY_LABEL }` argument removed                                                             | `labels its private bindings with the module name`, and `names itself when a host omits a requirement`                                                           | `Expected to contain: "application.plan-history/historySettings"` / `Received: [ "history", "projectStore", "planEventStore", "historySettings" ]`; and `Received message: "DI_BAG_MISSING_DEPENDENCY: Cannot resolve \"historySettings\": …"`; `4 pass`, `2 fail`                         |
| 7   | `check.ts`, the same `return`, made type-correct                         | `const history = Object.assign(bag.resolve('history'), { resolve: bag.resolve.bind(bag) }); return { history };` | `exposes only the contract exports from its installer`, its SECOND assertion                                                                                     | `expect(Object.values(exposed).every(…)).toBe(true);` → `error: expect(received).toBe(expected)`, `Expected: true`, `Received: false`; `5 pass`, `1 fail`. `wbs-core:typecheck` **exits 0** on this mutation too, and the key list stays `['history']`, so fault 4 cannot stand in for it. |
| 8   | `libs/wbs/application/core/src/module/plan-history/README.md`            | a `<!-- module-index -->` block added (a rehearsal of the refusal, not a prescription)                           | `pins exact pre-index tuples and passes observe lint from external trust`                                                                                        | `+   "module.application.plan-history",` at `pilot-policy.test.ts:380`. Adding the `modules.json` row too gave `Expected length: 6` / `Received length: 7` at `:363` and `pilot module ownership has no exact trusted boundary: module.application.plan-history`                           |

**Each assertion has a mutation that names it.** Fault 4 fails only the installer-surface test's
FIRST assertion, and because that one throws, the second never runs — which is why fault 7 exists:
it leaves the key list correct and fails only the second assertion. Fault 5 fails the
private-registration test (and two more, both recorded); fault 6 fails only the two label tests. No
check is masked: the privacy and label assertions live in **three separate `it` blocks**, so one
throwing does not stop the others being executed, and the two assertions inside the installer test
each have their own mutation.

**Also observed, and prescribed because of it:** renaming `canEdit` to `canEditProject` pushes
`calendar-marker.service.ts:216` past the print width, and the pre-commit `format` hook refused the
commit with `[warn] libs/wbs/application/core/src/service/calendar-marker.service.ts`. Section 10.7
shows that statement in the exact two-line form Prettier produced at its real indentation. Appending
the new export to the end of `libs/wbs/domain/domain/src/index.ts` failed `wbs-domain:lint` with
`Run autofix to sort these exports! simple-import-sort/exports`; `bunx eslint --fix` moves it under a
comment about `tree-order`, so section 10.6 gives the correct insertion point instead.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `cmd > log 2>&1; echo "exit=$?"`; never read a status through
`tee` and never `|| true`. Scratch only under `"$TMPDIR"`, mutation patches and failing output under
`"$TMPDIR/evidence"`; **evidence references in `verify.md` are basenames relative to that directory,
never absolute clone, home or temporary paths.** The executor cannot change Git state, so the planner
commits each slice; restore a mutated file with `cp` from a copy under `"$TMPDIR"` and prove it with
`cmp`. Every slice also records `base=$(git rev-parse HEAD)` in its step 0, for section 12.

### Slice 1 — Open `adopt-di-composition`

**Step 0.** Every line must print what it says; if one does not, stop.

```sh
test ! -d openspec/changes/adopt-di-composition && echo "gate: change absent"
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | jq -r '.summary.totals.items'
```

Record that item count as `N`. It was **112** on the rehearsed tree; require `N + 1` at the end.

1. Create the change with the README's "Creating an OpenSpec change" block verbatim:
   `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-di-composition --schema sdd-lean`,
   then `grep -n "schema: sdd-lean" openspec/changes/adopt-di-composition/.openspec.yaml`. Expected:
   `Created change 'adopt-di-composition' … Schema: sdd-lean`, then exactly one grep line. If the
   grep prints nothing, stop. The command creates `.openspec.yaml` **only**.
2. Write the five artifacts of sections 10.1 to 10.5.
3. `GSETTINGS_BACKEND=memory bunx prettier --write 'openspec/changes/adopt-di-composition/**/*.md'`
   then `--check` the same glob. Expected exit 0 and `All matched files use Prettier code style!`.
4. Validate with the README's "OpenSpec validation" block verbatim — the `jq -s -e` contract, not a
   loose success check. Expected: the block exits 0, and `jq -r '.summary.totals' "$report"` prints
   `items` and `passed` equal to `N + 1` with `failed` 0. Observed: `112` →
   `{"items": 113, "passed": 113, "failed": 0}`, jq contract exit 0. The report stays under
   `"$TMPDIR/evidence"`; never delete it, and never `rm -f`.
5. Append to `verify.md`: the `N` you recorded, the `N + 1` you observed, and the evidence basename of
   the validation report. That edit is part of this slice's handoff.
6. Only now the repository-wide format check, because step 5 changed a file:
   `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
   then `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0. The execution contract assigns
   that check to the executor, and `--all` is required because the base-ref default is empty on main.
   Every later slice does the same: the append comes first, then the format of the appended file, then
   the check.

Planner commit: `feat(openspec): open adopt-di-composition for the 040.6 module split`.

### Slice 2 — The write gate becomes domain code

**Step 0.**

```sh
test -f openspec/changes/adopt-di-composition/tasks.md && echo "gate: slice 1 landed"
test ! -f libs/wbs/domain/domain/src/project-ownership.ts && echo "gate: nothing to overwrite"
grep -cF "export function canEdit(project: Project, actorId: string): boolean {" libs/wbs/application/core/src/service/project.service.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-domain --skip-nx-cache
```

The grep must print `1`; the Nx run must exit 0. Record `bun test libs/wbs/domain/domain/src` counts
as this slice's baseline. All four lines behaved as written on the base tree (observed).

1. Write `project-ownership.test.ts` (section 10.6) and run it. Expect the red of row 1:
   `error: Cannot find module './project-ownership'`. This red is evidence, not a commit.
2. Write `project-ownership.ts` (section 10.6), insert the export at the position section 10.6 names,
   and add the README row.
3. Green: `bun test libs/wbs/domain/domain/src/project-ownership.test.ts` → exit 0, `2 pass`,
   `0 fail`, `3 expect() calls` (observed). The whole-directory count is the step-0 baseline plus 2.
4. `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-domain --skip-nx-cache` →
   exit 0.
5. Append to `verify.md` the baseline you recorded and the green count you observed, and write into it
   that the R5 negative belongs to slice 3: until the six callers use the moved rule the injected fault
   has no production path through a service. `tasks.md` 1.1 is **not** ticked here — slice 3 finishes
   its work.
6. Only now `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0, because step 5 changed a
   file. The format check is the executor's, per the execution contract.

Planner commit: `refactor(core): move the project write gate into the domain library`.

### Slice 3 — The six sideways importers

**Step 0.**

```sh
grep -c canEditProject libs/wbs/domain/domain/src/project-ownership.ts
grep -rc "^import { canEdit } from './project.service';" libs/wbs/application/core/src/service/*.ts | grep -c ':1$'
grep -cF "import { canEdit, type ProjectService } from '../service/project.service';" libs/wbs/application/core/src/use-cases/save-plan.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache
```

Expect `1` or more, then **5**, then `1`, then exit 0. All four behaved as written after slice 2 on
the rehearsed tree (observed). **This slice does not touch
`libs/wbs/application/core/src/service/history.service.ts`**: slice 4's own gate reads its line count.

Apply section 10.7's edits to the seven core files, and correct the stale `canEdit` mention at
`broadcast.test.ts:274`.

| Command                                                                                                     | Expect                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache`                                            | exit 0. This slice re-declares an exported symbol, so the type check runs here. |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint -p wbs-core,wbs-domain --skip-nx-cache`                 | exit 0                                                                          |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                       | exit 0                                                                          |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                                                       | exit 0                                                                          |
| `grep -cF "export { canEditProject as canEdit };" libs/wbs/application/core/src/service/project.service.ts` | `1`                                                                             |

The zero-import check must not certify a scan that failed. Under `pipefail` Bash returns the
**rightmost** nonzero pipeline status, so a first `grep` exiting 2 behind a second exiting 1 is
accepted by a trailing `|| test $? -eq 1`: with a nonexistent input path that shape printed
`No such file or directory`, then `remaining=0`, and **exited 0**. Use this form instead, which
branches on the scan's own status:

```sh
set -euo pipefail
if remaining=$(grep -nH "^import { canEdit } from './project.service';" \
  libs/wbs/application/core/src/service/*.ts); then
  printf '%s\n' "$remaining" >&2
  exit 1
else
  scan_status=$?
  test "$scan_status" -eq 1
fi
echo "remaining=0"
```

Expected: `remaining=0` and exit 0 only when the scan finds no remaining imports. A remaining import
prints its location and exits nonzero; a missing or unreadable input also exits nonzero. Stop on
either failure. Rehearsed three ways, against the **5** recorded at step 0:

| Case                                 | Observed                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| after this slice's edits, no matches | `remaining=0`, exit **0**                                                                                                            |
| one sideways import left behind      | `libs/wbs/application/core/src/service/step.service.ts:9:import { canEdit } from './project.service';`, exit **1**, no `remaining=0` |
| a missing input path                 | `grep: libs/wbs/application/core/src/NO_SUCH_DIR/*.ts: No such file or directory`, exit **1**, no `remaining=0`                      |

A bare command followed by `|| test $? -eq 1` — the README's `if diff …; then …; else test $? -eq 1; fi`
patch form, for instance — stays fine, because there is no pipeline to hide a second status. Only a
pipeline needs the branching form above, and this packet prescribes no other.

Then the negative, row 3 of section 6: replace the body of `canEditProject` with `return true;` and
run
`bun test libs/wbs/application/core/src/service/broadcast.test.ts -t 'announces nothing for a write it refused'`.
Expect exit 1 with the fragment in that row and `0 pass`, `1 fail`, `10 filtered out`. A run reporting
`0 tests ran` is a stop, not a pass. Save the patch under `"$TMPDIR"/evidence` with the README's
`if diff …; then …; else test $? -eq 1; fi` form, restore with `cp` and prove with `cmp` **before**
asserting on the captured status. Add beside `canEditProject` in
`libs/wbs/domain/domain/src/project-ownership.ts` a dated `Proof:` comment naming the injected fault
and the observed test — that comment changes the **domain** file, not `project.service.ts`.

Then tick `tasks.md` 1.1, whose work this slice completes, and append to `verify.md` the step-0
counts, the `remaining=0` result, the observed negative fragment and the evidence basenames. Only
after those three edits rerun
`NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain --skip-nx-cache`
and `GSETTINGS_BACKEND=memory bunx nx format:check --all`, both exit 0.

Planner commit: `refactor(core): point every resource at the domain write gate`.

### Slice 4 — Plan history as the first sealed module

**Step 0.**

```sh
grep -c canEditProject libs/wbs/application/core/src/service/priority-band.service.ts
test ! -d libs/wbs/application/core/src/module && echo "gate: no module directory yet"
wc -l < libs/wbs/application/core/src/service/history.service.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache
```

Expect `1` or more, the gate line, **40**, then exit 0. All four behaved as written after slice 3 on
the rehearsed tree (observed). Then record this slice's own whole-core baseline and name it:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/core-baseline.log"
```

Call that pass count `C` and that file count `F`. Observed on the rehearsed tree: `535 pass`,
`0 fail`, 52 files. The end of this slice requires `C + 6` and `F + 1`, never an absolute number.

Tests first, then the implementation, both inside this one slice:

1. Create `libs/wbs/application/core/src/module/plan-history/module.test.ts` from section 10.8 and
   run it. Expect the red of row 2: `error: Cannot find module './check'`, `0 pass`, `1 fail`,
   `1 error`. This red is evidence, not a commit: the commit hook lints test files under
   `strictTypeChecked`, so the tests and the code that makes them type-check land together.
2. Move the service. The planner's form is
   `git mv libs/wbs/application/core/src/service/history.service.ts libs/wbs/application/core/src/module/plan-history/plan-history.feature.ts`;
   the executor copies the file to the new path, rewrites its two `../ports/` imports to
   `../../ports/`, and replaces the old path with the shim of section 10.8. **Do not delete the old
   path:** `service-boundaries.test.ts:22` asserts it exists.
3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from section 10.8.
4. `bun test libs/wbs/application/core/src/module/plan-history/module.test.ts` → exit 0, `6 pass`,
   `0 fail`, `7 expect() calls` (observed).
5. `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0.
6. The four module negatives, rows 4, 5, 6 and 7, **one at a time**, each restored and `cmp`-proved
   before the next. Rows 4 and 7 both replace the single `return` statement of `installPlanHistory` in
   `check.ts` — row 4 adds a top-level `bag` property, row 7 hangs `resolve` on the returned service
   instead, which is what reaches the second assertion; rows 5 and 6 are the single
   `.buildModule(['history'], { label: PLAN_HISTORY_LABEL });` line in `module.ts` — its key tuple for
   row 5, its options object for row 6. Then add the dated `Proof:` comments: two beside that
   `buildModule` call, and two beside `installPlanHistory`'s `return`, one per assertion.
7. Tick `tasks.md` 2.1 in the OpenSpec change, and append to `verify.md`: `C` and `F`, the four
   faults with the literal fragments you saw, and the evidence basenames. Those two edits are part of
   this slice's handoff.
8. Only now run the closing checks, because steps 6 and 7 changed files:
   `(cd libs/wbs/application/core && bun test src)` → exit 0 with `C + 6` passes over `F + 1` files
   (observed `541 pass`, `0 fail`, 53 files); then
   `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0; then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

The README carries no `<!-- module-index -->` block, uses workspace-relative paths in backticks rather
than Markdown links, and `docs/wiki-policy/modules.json` is not touched. Row 8 and the devsync link
fact in section 3 are why, and the README says so in its own words.

Planner commit: `refactor(core): seal Plan history as the first DI Bag module`.

### Slice 5 — Install it from the composition root

**Step 0.**

```sh
test -f libs/wbs/application/core/src/module/plan-history/module.ts && echo "gate: slice 4 landed"
grep -cF "history: new HistoryService({" libs/wbs/application/core/src/compose.ts
python3 -c "import json,sys; e=[x for x in json.load(open('docs/code-organization/kinds.json'))['entries'] if x['path']=='libs/wbs/application/core/src/service/history.service.ts']; sys.exit(0 if len(e)==1 and e[0].get('capability')=='core-lib-extraction' else 1)" && echo "gate: the history row is still the feature row"
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect the gate line, `1`, the second gate line, then a number. Call that number `K` and record it;
the end of this slice requires **`K`, unchanged**, never an absolute figure. It was **95** on the
rehearsed tree, which is historical evidence rather than the requirement. Record this slice's own
whole-core baseline too, the way slice 4 does, and call it `C`; it was `541 pass` over 53 files after
slice 4. All four step-0 lines behaved as written after slice 4 on the rehearsed tree (observed).

Apply section 10.9: `compose.ts` (two places), `index.ts` (three export lines), and
`docs/code-organization/kinds.json` (the `history.service.ts` row is rewritten **in place**; **no** row
is added for the `.feature.ts` file, and none is removed).

| Command                                                                                                | Expect                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain --skip-nx-cache`  | exit 0 (observed)                                                                                                                |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                  | exit 0, and `grep -c "application.plan-history" dist/libs/wbs/application/core/portable-composition.js` is at least 1 (observed) |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                      | exit 0 (observed)                                                                                                                |
| `cd apps/wbs/be-01 && bun test src/app.test.ts src/controller/history.controller.test.ts`              | exit 0, `11 pass`, `0 fail`, `33 expect() calls` (observed). Neither file binds a port.                                          |
| `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"` | `K`, the step-0 value, unchanged                                                                                                 |
| `(cd libs/wbs/application/core && bun test src)`                                                       | exit 0, `C` passes, `0 fail` — this slice adds no test                                                                           |

Then tick `tasks.md` 2.2 and append to `verify.md`: `K`, `C`, the portable-bundle grep result and the
be-01 values. Only after those two edits run `GSETTINGS_BACKEND=memory bunx nx format:check --all` →
exit 0, because they changed files.

**`wbs-be-01:test:unit` is the planner's, and so are `tool-devsync:test` and `wbs-core:test`** —
section 8 says why, with the values observed. Do not run them; do not treat their absence as skipped
checks, and say in `verify.md` that they are pending planner verification with those values.

Planner commit: `refactor(core): compose Plan history from its sealed module`.

## 8. Planner-only checks

| Check                                                                                                                                                                     | Why it is the planner's                                                                                                                                                                                                                                                | Value observed on the rehearsed tree                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-be-01:test:unit`                                                                                                                         | `src/app.routes.test.ts:548` calls `Bun.serve` in `refuses framed GET and HEAD bodies on the production health route`; the launcher dispatches with the network disabled, and nothing else in this packet needs loopback, so the target moves rather than the dispatch | exit 0                                                                                    |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                           | The index checker refuses untracked files, so it needs the slice staged or committed, and it spawns processes                                                                                                                                                          | `366 pass`, `0 fail`                                                                      |
| `cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts` | Clones the repository at HEAD, so it needs the slices committed, and it spawns the CLI many times                                                                                                                                                                      | exit 0, `21 pass`, `0 fail`                                                               |
| `NX_DAEMON=false bunx nx run wbs-core:test`                                                                                                                               | Planner integration verification of the whole target with coverage. It does **not** bind a port: it runs `bun test src` over the same files `test:unit` discovers, and no core test calls `Bun.serve` or `.listen(`                                                    | `541 pass`, `0 fail`, 53 files with the module; `535 pass`, `0 fail`, 52 files without it |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                                                                                                                              | Whole target: opens SQLite databases and includes the listener test                                                                                                                                                                                                    | pending planner verification                                                              |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                                                                                                                      | Runs Playwright; the executor has no browser. `build:portable` is the executor's and is what proves the new DI dependency bundles                                                                                                                                      | pending planner verification                                                              |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                | Takes the host-wide heavy lock                                                                                                                                                                                                                                         | pending planner verification                                                              |

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once: it failed one host gate on 2026-09-21 because its holder's `COMMIT` has
`busy_timeout = 0`. Do not edit that test, and do not edit any other test this packet does not name.

No slice adds a file under `apps/wiki/cli`, so the Twilight Burokrat validator identity does not move.
No slice adds a project target or a scanned-source line, so
`tools/tool-devsync/src/workspace-inventory.test.ts` counts and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s digest do not move — `tool-devsync:test`
was observed at `366 pass`, `0 fail` with every slice applied and the packet staged.

## 9. What the next 040.6 packets should be

1. **B — the neutral event port.** `tasks.md` 1.2: split `broadcast.ts` into a neutral
   `ProjectEvent`/`Broadcaster`/`subscriptionFor` location plus Plan commands' private collector.
   Every remaining module depends on it, and it is the largest preparation.
2. **C — the small preparations.** `tasks.md` 1.3 to 1.7: Plan document's marker read port, the
   principal and actor types, `SolverObjectiveName`, the cache-key port, `saved-plan-retry.ts`.
3. **D — the wiki registration of a module.** `docs/wiki-policy/policy.json` trusted boundary, the
   `modules.json` row, the `module-index` block, and the two pins at `pilot-policy.test.ts:363` and
   `:380`. It must land before any further module README carries index metadata.
4. **E — the remaining process modules** (`tasks.md` 3.1 to 3.6), one per packet or two where they
   share a contract: Bounded replay sweep, Realtime, Saved plans, Plan import, Authentication,
   Optimization.
5. **F — Plan document and the adapter-side modules** (`tasks.md` 4.1 and 4.2).
6. **G — per-admission installation** (`tasks.md` 5.1): `servicesOver` installing the seven resource
   modules per supplied scope, with the leak negative the map demands. This is the only remaining
   composition question and should not be attempted before B.
7. **H — Plan commands** (`tasks.md` 5.2), last, because Working plan and the collector are private to
   it and it consumes almost every other contract.
8. **I — the domain moves and the ledger** (`tasks.md` 6 and 7), including the isolated type check
   the design asks for. The target name `typecheck:module` is `tasks.md` 7.3's own proposal, not a name
   the design supplies.

## 10. Exact content

### 10.1 `openspec/changes/adopt-di-composition/proposal.md`

**399 words**, measured with `wc -w` on the file exactly as the executor writes it, under R4's
400-word cap. Count it again after Prettier: `wc -w openspec/changes/adopt-di-composition/proposal.md`.
No commit hook enforces this cap — `lefthook.yml:24-26` globs `doc-caps` to `LLM_README.md` alone, and it
reported `doc-caps (skip) no matching staged files` on the rehearsed slice-1 commit — so the number is
the executor's to check.

```md
## Why

The backend core keeps about fifty service files in one directory. Nothing declares what a service
needs or seals what it hides, and a DI failure names an anonymous binding. The accepted code
organization design answers this with one sealed DI Bag module per responsibility, and the reviewed
040.6 map settles which file each owns. DI Bag 0.4.0 is installed and startup uses it, so only the
composition shape is left.

## What Changes

**Sealed module composition**

- From: `compose.ts` builds every service by hand, and services import siblings for shared rules.
- To: each 040.6 responsibility is one sealed module with a README, a contract, a labelled
  `module.ts` and a composition check; sideways rules move to the domain library or a neutral event
  port; `@wbs/core` keeps every export.
- Impact: architectural; no wire or table change.

## Non-Goals

No library version bump, no frontend lifetimes, no gateway or MCP composition, and no invented
capability for the CRUD delivery reaches directly.

## Constraints

Rules R1 to R5 govern. `bootBe01` keeps owning source, retention, optimizer and listener disposal in
its tested order; modules borrow them without a second disposer. `servicesOver` stays per-admission:
no singleton may leak staged stores or announcements between transactions. Every changed check ships
a watched negative.

## Capabilities

### New Capabilities

- `di-composition`: how a responsibility is sealed, what it may require, and what a composition root
  sees.

### Modified Capabilities

None. Plan history, Plan commands and Saved plans keep `wbs-domain`; Plan import keeps `plan-import`.

## Domain Terms

None new; the map's nine resource terms are in `CONTEXT.md`.

## Module identifiers

A library module is named ring then name, as `module.application.plan-history` is. A module under an
app carries the runtime word by location: `module.backend.<name>`, `module.frontend.<name>`,
`module.gateway.<name>`, `module.mcp.<name>`. Optimization, the Local solver launcher and the
Supervisor are backend modules, so `module.backend.*`. A label drops only the `module.` prefix. The
nine existing identifiers are untouched.

## Decisions Recorded

- Full K2 closure stays outside this change: CRUD delivery for the seven resources lacks feature
  owners, and none is invented here.
- K3 debt is preserved, not fixed: a feature-service reading a repository port keeps doing so,
  declared rather than implicit. Task 7.4 records it.
- Wiki registration is separate: `policy.json` needs a boundary per identifier, and
  `pilot-policy.test.ts` pins the mapping length and identifiers.

## Impact

`libs/wbs/application/core/src`, `libs/wbs/domain/domain/src` and `kinds.json`. `apps/wbs/be-01`
changes only where a shim path moves.
```

### 10.2 `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`

```md
## ADDED Requirements

### Requirement: One sealed module per service responsibility

Every service responsibility named in the 040.6 backend module map SHALL be one sealed DI Bag
module whose directory holds a README, a `contract.ts` stating its exports and requirements, a
`module.ts` sealed with `buildModule`, and a composition check, and SHALL export only the
contract's services.

#### Scenario: A module exports its service and nothing else

- **GIVEN** a sealed module for one service responsibility
- **WHEN** a host installs it and names an export the contract does not state
- **THEN** the graph refuses the name instead of resolving it

#### Scenario: A module names what a host must supply

- **GIVEN** a sealed module whose requirements are repository ports
- **WHEN** a host omits one of them
- **THEN** the composition is refused before the service is used

### Requirement: A module's label names its private bindings in failures

Every sealed module SHALL be built with a `label` that is its module identifier with only the
`module.` prefix dropped, so that its private bindings appear as `<label>/<key>` in DI failure
messages and in `inspectGraph()`. A module that lives in a library SHALL be identified as
`module.<ring>.<name>`; a module that lives under an app SHALL be identified as
`module.<runtime>.<name>`, where the runtime is `backend`, `frontend`, `gateway` or `mcp` by the app
it lives under. The nine existing identifiers SHALL NOT change.

#### Scenario: A missing requirement names the module that asked

- **GIVEN** a host graph missing one of a module's requirements
- **WHEN** the module's exported service is resolved
- **THEN** the refusal names the private binding as `<label>/<key>` and the resolution path through it

#### Scenario: A library module and an app module are identified

- **GIVEN** Plan history in the portable core and Optimization under `apps/wbs/be-01`
- **WHEN** each module's identifier is read
- **THEN** Plan history is `module.application.plan-history` and Optimization is
  `module.backend.optimization`, and each label drops only the `module.` prefix

### Requirement: The bag is reachable only from a composition root

A bag SHALL be built only by a module's own composition function or by a composition root, and the
value that function returns SHALL carry the contract's exports and nothing else.

#### Scenario: A consumer cannot reach a private binding

- **GIVEN** a module installed in a host graph
- **WHEN** a private binding key is resolved from that host
- **THEN** the host answers that the service is not registered

#### Scenario: The installer's returned surface carries no bag

- **GIVEN** a module's composition function
- **WHEN** the properties of the value it returns are enumerated
- **THEN** they are exactly the contract's exports and none of them is a bag

### Requirement: No service imports a same-kind sibling

A resource-service SHALL NOT import another module's resource-service and a feature-service SHALL
NOT import another module's feature-service; a rule two of them share SHALL live in the domain
library, and sideways work SHALL go through a neutral published event port.

#### Scenario: A shared write gate lives in the domain library

- **GIVEN** two resource-services that gate writes on project ownership
- **WHEN** each one asks the question
- **THEN** both call the domain library's rule and neither imports the other

#### Scenario: A publisher does not import Realtime

- **GIVEN** a resource-service that announces a change
- **WHEN** it publishes
- **THEN** it depends on the neutral event port and not on the Realtime module

### Requirement: A module records the layering debt it does not close

A module whose contract requires a repository port from a feature-service SHALL state that the
dependency is preserved K3 debt rather than compliance, and the change SHALL track it.

#### Scenario: A feature module requires a store port

- **GIVEN** a feature-service module that reads a repository port
- **WHEN** its contract is read
- **THEN** it names the K3 obligation it leaves open and where that obligation is tracked

### Requirement: Existing core exports keep working through the move

Every symbol `@wbs/core` and its deep service paths export today SHALL keep its name and its single
definition while a responsibility moves, with the former path retained as a compatibility
re-export and no second class or type definition created.

#### Scenario: A moved service keeps its former deep path

- **GIVEN** a service file moved into its module directory
- **WHEN** a caller imports the former `@wbs/core/service/<name>` path
- **THEN** it receives the same declaration the module exports

### Requirement: Core modules own no process lifetime

A core module SHALL register a disposer only for a resource it creates, and SHALL borrow the
source, retention timer, optimizer runtime and listener whose disposal `bootBe01` already owns in
its tested order.

#### Scenario: Installing a core module adds no disposer to boot

- **GIVEN** a core module installed into the composed services
- **WHEN** the process shuts down
- **THEN** the shutdown order and the set of closed resources are unchanged

### Requirement: Writing modules are installed per admitted scope

The services built over an admitted transaction's stores SHALL be installed per supplied scope, so
that no staged store, announcement collector or working plan is shared between two transactions.

#### Scenario: Two command batches do not share staged state

- **GIVEN** two command batches admitted in turn
- **WHEN** each builds its writing services
- **THEN** neither sees the other's staged stores or collected announcements
```

### 10.3 `openspec/changes/adopt-di-composition/design.md`

```md
## Context

`compose.ts` hand-builds the graph; `bootBe01` owns the only bag. The 040.6 map settles ownership
but leaves the composition shape open, and the shape is not obvious: the core has two lifetimes in
one function, the process graph and the per-admission graph, and a naive module installation would
collapse them.

## Composition shape

Three layers, and only the third sees a bag.

1. `contract.ts` — the module's exported service types and the requirements a host supplies. It
   imports repository ports and domain types, never another module's implementation.
2. `module.ts` — `DiBag.createBuilder().register(...).buildModule([...exports], { label })`. Every
   collaborator that is not in the contract's exports stays unselected and therefore private to each
   installation. The label is the wiki module identifier without its `module.` prefix.
3. `check.ts` — the one function that installs the module over supplied requirements, builds the
   bag and returns the contract's exports. Callers receive services; nobody else builds a bag.

The label in step 2 is the module identifier without its `module.` prefix. A library module is
`module.<ring>.<name>`; a module under an app is `module.<runtime>.<name>` with the runtime taken
from the app it lives under, so Optimization, the Local solver launcher and the Supervisor are
`module.backend.*` while Plan history in the portable core is `module.application.plan-history`.

Layer 3 is the one that has to be tested rather than typed. An object carrying an extra property
still satisfies the exports interface when it is returned through a variable, so the type checker
does not refuse a returned bag; the module's tests enumerate the returned surface instead.

## Two lifetimes

- **Process modules** (Plan history, Realtime, Bounded replay sweep, Saved plans, Plan import,
  Authentication, Optimization) are installed once, where `composeServices` runs.
- **Per-admission modules** (the seven resource responsibilities and Plan commands) are installed
  by `servicesOver`, once per supplied scope. The map is explicit that a singleton here would leak
  staged stores and announcement collectors between transactions, so the scope is an input to the
  installation, never a value resolved from a process bag.

Because `buildServices` closes over the optimizer coordinator, the loud read-before-composition
error stays; the optimizer is not resolved lazily from a bag inside services.

## Disposal

Core modules register disposers only for resources they create. Today none of the core
responsibilities creates one: the source, the retention timer, the optimizer runtime and the
listener are all acquired and released by `bootBe01` in a tested order, and a nested
`withDisposal` inside a core module would double-close or reorder that shutdown.

## What sealing does not fix

Sealing declares a dependency; it does not relayer one. A feature-service that reads a repository
port still violates K3 after extraction, and delivery that reaches a resource-service directly
still violates K2. Both are recorded per module rather than hidden behind a module boundary, and
closing them needs resource-services and feature owners no accepted change supplies.

## Order of work

The map's eight no-sideways preparations come first, because every one of them removes an import a
module move would otherwise have to keep. `canEdit` and the `broadcast.ts` split are the two that
unblock the most modules. Each responsibility then moves with `git mv`, keeping its former path as
a compatibility re-export; `docs/code-organization/kinds.json` keeps one row per retained unsuffixed
shim and none for a file whose name declares its kind by suffix, because
`tools/tool-devsync/src/service-kinds.test.ts` refuses both the missing row and the duplicate one.

## Not decided here

Wiki registration of the new modules, and the K2 feature owners for the resources delivery reaches
directly. Both are named in the proposal as outside this change's claim.
```

### 10.4 `openspec/changes/adopt-di-composition/tasks.md`

```md
## 1. No-sideways preparations

- [ ] 1.1 Move the project write gate to the domain library as `canEditProject`, point Calendar
      marker, Capacity, Priority band, Step, Work item and `savePlan` at it, and keep `canEdit` as a
      compatibility export of the Project resource. Proof: `libs/wbs/domain/domain/src/project-ownership.test.ts`;
      negative: `announces nothing for a write it refused` in
      `libs/wbs/application/core/src/service/broadcast.test.ts` with the rule forced to `true`.
- [ ] 1.2 Split `broadcast.ts`: `ProjectEvent`, `Broadcaster` and `subscriptionFor` to a neutral
      application event port; `AnnouncementCollector` and `HeldAnnouncement` into Plan commands.
      Negative: a resource publishing through the port with the port unregistered.
- [ ] 1.3 Change Plan document's marker read to an owner-neutral read port and move
      `CalendarMarkerListOutcome` out of the Calendar marker service file.
- [ ] 1.4 Move the actor and principal types `runCommandBatch`, `replay`, `savePlan` and
      `retention-sweep.ts` share to a neutral contract location so none of them imports Authentication.
- [ ] 1.5 Move the Optimization spawn and child interfaces into the Optimization contract; keep the
      Supervisor request/attempt mapper private beside the Supervisor client and amend its
      classification to adapter-private support.
- [ ] 1.6 Import `SolverObjectiveName` from `@wbs/domain` and replace the repository hash shim with
      an injected cache-key port backed by SQLite's existing SHA-256.
- [ ] 1.7 Wire or delete `saved-plan-retry.ts` under the accepted saved-plans obligation.
- [ ] 1.8 Correct the four `kinds.json` capability values to `wbs-domain` and `plan-import`.

## 2. The first sealed module

- [ ] 2.1 Extract Plan history as the pattern-setter: module directory, contract, labelled
      `module.ts`, composition check, and the compatibility re-export at the former service path.
      Proof: the module's own tests; negatives: the installer leaking its bag, the private binding
      exported, and the label dropped.
- [ ] 2.2 Install it from `composeServices` and keep every `@wbs/core` export. Proof: the core and
      be-01 suites unchanged, and `wbs-core:build:portable` still bundling for the browser.

## 3. The remaining process modules

- [ ] 3.1 Bounded replay sweep, borrowing the timer `bootBe01` starts and stops.
- [ ] 3.2 Realtime, implementing the neutral event port.
- [ ] 3.3 Saved plans, absorbing project and admission checks and the publication after save,
      rename and delete.
- [ ] 3.4 Plan import, with its per-scope factory.
- [ ] 3.5 Authentication, absorbing the login throttle and covering the password-only and OIDC
      graphs; the accountless graph exports neither.
- [ ] 3.6 Optimization, with its repository ports and event projections.

## 4. Plan document and the adapter-side modules

- [ ] 4.1 Plan document as a resource module over the neutral marker read port from 1.3.
- [ ] 4.2 Local solver launcher as a standalone repository module; Supervisor as a repository
      module with the request/attempt mapper private to it.

## 5. The per-admission modules

- [ ] 5.1 Install the seven resource responsibilities per supplied scope inside `servicesOver`.
      Negative: two admitted batches sharing staged stores.
- [ ] 5.2 Plan commands, with Working plan and the announcement collector private to it.

## 6. Domain moves the map names

- [ ] 6.1 The fourteen portable-core domain moves: `assumed-assignee.ts`, `clean-name.ts`,
      `command-normalizers.ts`, `compensating.ts`, `dependency.ts`, `directory-usage.ts`,
      `numbered-work-item.ts`, `plan-command.ts`, `roll-up.ts`, `saved-plan-default-name.ts`,
      `saved-plan-input.ts`, `saved-plan-quota.ts`, `saved-plan-schedule-body.ts`,
      `smoke.service.ts`.
- [ ] 6.2 The two backend domain moves: `solver-exit-outcome.ts`, `solver-request-pair.ts`.
- [ ] 6.3 Delete `push-client.ts` once callers import `@wbs/runtime-portable` directly.

## 7. Ledger and closure

- [ ] 7.1 Move each test with its owner and delete the re-export shims whose callers are gone.
      `service-boundaries.test.ts`'s list is what decides when a shim may go.
- [ ] 7.2 Update `docs/code-organization/kinds.json` for every moved and suffix-declared file: a
      suffix-declared path carries no entry, and a retained unsuffixed shim keeps one.
- [ ] 7.3 Give every module a `tsconfig.json` and an Nx `typecheck:module` target, so the isolated
      type check the design names actually runs. Proof: the target fails on a module that breaks its
      own contract.
- [ ] 7.4 Record, per module, which K2 and K3 obligations it does not close and where they are
      tracked. Full K2 closure and wiki registration stay outside this change.
```

### 10.5 `openspec/changes/adopt-di-composition/verify.md`

Prettier widens the table borders, so run `--write` before `--check`.

```md
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

| Check                                   | Fault injected | Test that observed it | Result  |
| --------------------------------------- | -------------- | --------------------- | ------- |
| _(filled in by each slice as it lands)_ | -              | -                     | pending |

## Observations

_(each slice appends its own step-0 baselines, its deltas and the diagnostics it observed here
before handing over. Evidence references are basenames relative to the attempt's evidence
directory.)_
```

### 10.6 Slice 2's files

`libs/wbs/domain/domain/src/project-ownership.ts`:

```ts
/** The ownership facts a write gate reads, and nothing else a project carries. */
export interface ProjectOwnership {
  readonly ownerId: string;
  readonly restricted: boolean;
}

/**
 * Whether `actorId` may write to the project those ownership facts describe.
 *
 * Domain code because every resource and feature that writes a plan asks the
 * same question, and a resource asking a sibling resource for it is the sideways
 * import K6 forbids. Reading is deliberately not gated: an unrestricted project
 * is editable by any authenticated account, and a restricted one is readable by
 * all and writable only by its owner.
 */
export function canEditProject(project: ProjectOwnership, actorId: string): boolean {
  return !project.restricted || project.ownerId === actorId;
}
```

`libs/wbs/domain/domain/src/project-ownership.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';

import { canEditProject } from './project-ownership';

describe('canEditProject', () => {
  it('lets any account write an unrestricted project', () => {
    expect(canEditProject({ ownerId: 'ada', restricted: false }, 'grace')).toBe(true);
  });

  it('lets only the owner write a restricted project', () => {
    expect(canEditProject({ ownerId: 'ada', restricted: true }, 'ada')).toBe(true);
    expect(canEditProject({ ownerId: 'ada', restricted: true }, 'grace')).toBe(false);
  });
});
```

In `libs/wbs/domain/domain/src/index.ts`, insert directly **after** the single line
`export * from './progress';` and before the `saved-plan` comment block. Do not append at the end:
`simple-import-sort/exports` refuses it, and `--fix` places it under a comment about `tree-order`.

```ts
// The one write gate every resource and feature asks: `canEditProject`. Domain
// code rather than a Project-resource export, because a resource importing a
// sibling resource for it is the sideways edge K6 forbids.
export * from './project-ownership';
```

`libs/wbs/domain/domain/README.md` gets one row in its noun-to-module table naming
`project-ownership.ts`; `readme.test.ts` only requires that a named file exists, so any row that
spells the filename in backticks satisfies it.

### 10.7 Slice 3's edits

Seven files. In each, delete the line `import { canEdit } from './project.service';` (in
`use-cases/save-plan.ts` it is
`import { canEdit, type ProjectService } from '../service/project.service';`, which becomes
`import type { ProjectService } from '../service/project.service';`), add `canEditProject` to the
`@wbs/domain` import, rename every call, and update every `canEdit` mention in JSDoc.

| File                           | The import line, after                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `priority-band.service.ts:1`   | `import { canEditProject, type PriorityBand } from '@wbs/domain';`                                                             |
| `calendar-marker.service.ts:1` | `import { canEditProject, type IsoDate } from '@wbs/domain';`                                                                  |
| `step.service.ts:1`            | `import { canEditProject, stepIsInUse } from '@wbs/domain';`                                                                   |
| `project.service.ts:1`         | `import { canEditProject, DEFAULT_ESTIMATE_RULE, isIsoDate, PertWeights } from '@wbs/domain';`                                 |
| `capacity.service.ts`          | a new first line `import { canEditProject } from '@wbs/domain';` then a blank line (it had none)                               |
| `use-cases/save-plan.ts`       | a new first line `import { canEditProject } from '@wbs/domain';` then a blank line                                             |
| `work-item.service.ts:32`      | the one-line `MEASURE_METRICS, SOLVER_OBJECTIVES, type SolverObjectiveName` import becomes the four-name multi-line form below |

```ts
import {
  canEditProject,
  MEASURE_METRICS,
  SOLVER_OBJECTIVES,
  type SolverObjectiveName,
} from '@wbs/domain';
```

Call sites, all of the form `if (!canEdit(project, actorId))` →
`if (!canEditProject(project, actorId))`: `priority-band.service.ts:71`, `capacity.service.ts:84`,
`step.service.ts:135` and `:240`, `project.service.ts:238`, `work-item.service.ts:1847`, `:2747`,
`:2832`, `:2887`, `:3679`, `:4589`, and `use-cases/save-plan.ts:41`
(`canEdit(found.project, input.actor.id)`).

`calendar-marker.service.ts:216` is the exception: after the rename it exceeds the print width, so
write it in the two-line form Prettier produces at its real indentation inside the method — four
spaces on the `if`, six on the `return` — otherwise the pre-commit `format` hook refuses the commit.
The fence below is `text`, not `ts`, on purpose: Prettier reformats an embedded `ts` fence at
top-level indentation and collapses this statement back onto one line, which is how both earlier
copies of this packet came to show it wrongly.

```text
    if (!canEditProject(project, actorId))
      return { ok: false, reason: 'forbidden', about: 'project' };
```

In `project.service.ts`, the whole `canEdit` function and its JSDoc become a compatibility export.
Keep it at the same place in the file, between `ProjectServiceOptions` and `class ProjectService`.

```ts
/**
 * Compatibility export of the domain rule this resource no longer owns.
 *
 * The rule moved to `canEditProject` in `@wbs/domain` so that Calendar marker,
 * Capacity, Priority band, Step, Work item and `savePlan` stop importing a
 * sibling resource for it, which K6 forbids. Delivery still names it `canEdit`;
 * the alias goes when delivery moves to the domain import.
 */
export { canEditProject as canEdit };
```

`http/project.routes.ts` is left alone on purpose: it is delivery, it already imports
`ProjectService` from the same module, and the alias above keeps its import valid. Say so in
`verify.md` rather than widening the slice.

### 10.8 Slice 4's files

`plan-history.feature.ts` is the moved `history.service.ts`, byte for byte, with its two imports
rewritten from `../ports/` to `../../ports/`. `service/history.service.ts` becomes:

```ts
/**
 * Compatibility re-export: Plan history moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and delivery still
 * deep-imports it. It goes when every importer names the module.
 */
export * from '../module/plan-history/plan-history.feature';
```

`contract.ts`:

```ts
import type { PlanEventStore } from '../../ports/plan-event-store';
import type { ProjectStore } from '../../ports/project-store';
import type { HistoryService } from './plan-history.feature';

/**
 * What a host must supply to install {@link planHistoryModule}.
 *
 * **Both are repository ports, and that is existing K3 debt this extraction
 * preserves rather than fixes.** K3 and the import matrix in
 * `docs/superpowers/specs/2026-09-19-code-organization-design.md` say a
 * feature-service depends on resource-services and the domain library, never on
 * a repository port; `HistoryService` has read both stores directly since it was
 * written. Sealing the module makes that dependency declared instead of
 * implicit, which is the whole of the claim here. Closing it needs a Plan
 * resource-service over `PlanEventStore`, which no accepted change supplies, so
 * `adopt-di-composition` records it as open and this module claims no K3
 * compliance.
 */
export interface PlanHistoryRequirements {
  readonly projectStore: ProjectStore;
  readonly planEventStore: PlanEventStore;
}

/** What installing {@link planHistoryModule} adds to a host graph. */
export interface PlanHistoryExports {
  readonly history: HistoryService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching the six existing `module.<ring>.<name>`
 * identifiers in `docs/wiki-policy/modules.json`; the wiki module identifier is
 * `module.application.plan-history` and the label drops the `module.` prefix.
 */
export const PLAN_HISTORY_LABEL = 'application.plan-history';
```

`module.ts`. Its single `buildModule` call is where faults 5 and 6 go.

```ts
import { DiBag } from 'di-bag';

import type { PlanEventStore } from '../../ports/plan-event-store';
import type { ProjectStore } from '../../ports/project-store';
import { PLAN_HISTORY_LABEL } from './contract';
import { HistoryService, type HistoryServiceOptions } from './plan-history.feature';

/**
 * Plan history as a sealed DI Bag module.
 *
 * Only `history` is exported. `historySettings` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is reported
 * against `application.plan-history/historySettings` rather than against an
 * anonymous binding.
 *
 * The module registers no disposer, because nothing it owns has one: the
 * service holds two borrowed store ports and no timer, socket or handle. Its
 * lifetime therefore stays the composition root's, exactly as `bootBe01` owns
 * the source it borrows.
 */
export const planHistoryModule = DiBag.createBuilder()
  .register({
    historySettings: DiBag.fromSyncFactory(
      ({
        projectStore,
        planEventStore,
      }: {
        projectStore: ProjectStore;
        planEventStore: PlanEventStore;
      }): HistoryServiceOptions => ({ projects: projectStore, events: planEventStore }),
    ),
  })
  .register({
    history: DiBag.fromSyncFactory(
      ({ historySettings }: { historySettings: HistoryServiceOptions }): HistoryService =>
        new HistoryService(historySettings),
    ),
  })
  .buildModule(['history'], { label: PLAN_HISTORY_LABEL });
```

`check.ts`. The single `return` is fault 4's location.

```ts
import { DiBag } from 'di-bag';

import type { PlanHistoryExports, PlanHistoryRequirements } from './contract';
import { planHistoryModule } from './module';

/**
 * Installs {@link planHistoryModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan history can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanHistoryExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanHistory(requirements: PlanHistoryRequirements): PlanHistoryExports {
  const bag = DiBag.createBuilder()
    .installModule(planHistoryModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projectStore),
      planEventStore: DiBag.fromSyncFactory(() => requirements.planEventStore),
    })
    .build();
  return { history: bag.resolve('history') };
}
```

`module.test.ts`. The two casts are the boundary this packet's `verify.md` names: DI Bag refuses both
at the type level, and the runtime path they reach is the one an untyped or generated host reaches.
The complete host graph is written out rather than shared with the incomplete one, because a helper
returning either registration object gives the builder a union it refuses.

```ts
import { inMemoryPlanEvents } from '@wbs/store-memory/history-fixture';
import { inMemoryProjects, projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installPlanHistory } from './check';
import { PLAN_HISTORY_LABEL } from './contract';
import { planHistoryModule } from './module';

const requirements = () => ({
  projectStore: inMemoryProjects(),
  planEventStore: inMemoryPlanEvents(),
});

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it refuses
 * at the type level (`TS2345 … is not assignable to parameter of type 'never'`,
 * observed 2026-09-21).
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(planHistoryModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => inMemoryProjects()),
      planEventStore: DiBag.fromSyncFactory(() => inMemoryPlanEvents()),
    })
    .build();

describe('the Plan history module', () => {
  it('answers not_found for a project nothing holds', async () => {
    const { history } = installPlanHistory(requirements());

    expect(await history.read('no-such-project', {})).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('reads the events of a project that exists', async () => {
    const projectStore = inMemoryProjects();
    const project = projectRow({ id: crypto.randomUUID() });
    await projectStore.create(project, [], { at: 1, by: project.ownerId });
    const { history } = installPlanHistory({
      projectStore,
      planEventStore: inMemoryPlanEvents(),
    });

    expect(await history.read(project.id, {})).toEqual({ ok: true, value: [] });
  });

  /**
   * The production installer hands out the contract's exports and nothing else.
   *
   * This is the assertion that makes the bag unreachable: `installPlanHistory`
   * is what `composeServices` calls, and an extra property on the object it
   * returns still satisfies `PlanHistoryExports`, so the type checker does not
   * refuse a returned bag. Enumerating the surface does.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installPlanHistory(requirements());

    expect(Object.keys(exposed)).toEqual(['history']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('historySettings'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "historySettings" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PLAN_HISTORY_LABEL}/historySettings`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the cast
   * reaches the runtime path an untyped or generated host reaches. The message
   * has to say which module asked, because `planEventStore` alone would not.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(planHistoryModule)
      .register({ projectStore: DiBag.fromSyncFactory(() => inMemoryProjects()) }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('history')).toThrow(
      `Cannot resolve "${PLAN_HISTORY_LABEL}/historySettings": dependency "planEventStore" is not registered. Resolution path: history -> ${PLAN_HISTORY_LABEL}/historySettings -> planEventStore.`,
    );
  });
});
```

`README.md`. **No** `<!-- module-index -->` block, and no Markdown links: the link checker resolves a
relative link against the file that carries it, and this listing is quoted inside a plan document at
another depth.

```md
# Plan history

This module is not yet registered as a wiki module: `docs/wiki-policy/policy.json` needs a
trusted boundary for `module.application.plan-history`, and
`apps/wiki/cli/src/policy/pilot-policy.test.ts` pins both the mapping length and the exact set of
discovered index identifiers. Adding the `module-index` block before those land fails that suite,
so registration is its own packet.

The plan's history, read. This is the first sealed DI Bag module in the core: `module.ts` seals
the graph and exports `history` alone, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two repository ports a host must supply — preserved K3 debt, not
compliance. Private bindings are named under the `application.plan-history` label, so a DI failure
says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` and
`libs/wbs/application/core/src/service/history.service.ts` keep the former
`@wbs/core/service/history.service` names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the
file that carries it, and this listing is quoted inside a plan document at another depth.
```

### 10.9 Slice 5's edits

`compose.ts`. Delete `import { HistoryService } from './service/history.service';` (line 18) and add
these two lines directly above `import type { Clock } from './ports/clock';`:

```ts
import { installPlanHistory } from './module/plan-history/check';
import type { HistoryService } from './module/plan-history/plan-history.feature';
```

Then the one construction inside `composeServices`, at `compose.ts:228-231`:

```ts
    history: installPlanHistory({
      projectStore: source.stores.projects,
      planEventStore: source.stores.planEvents,
    }).history,
```

`CommonServices.history: HistoryService` at `compose.ts:134` is unchanged — the type it names is now
the module's, through the new type import.

`index.ts`. Add, in sorted position between `export * from './http/import.routes';` and
`export * from './ports/actual-store';`:

```ts
export * from './module/plan-history/contract';
export * from './module/plan-history/module';
```

and put this comment directly above the existing `export * from './service/history.service';`:

```ts
// Compatibility export: Plan history's symbols keep their barrel names.
```

`docs/code-organization/kinds.json`. The entry whose `path` is
`libs/wbs/application/core/src/service/history.service.ts` **keeps that path** and is rewritten in
place: its `kind`, `capability` and `rationale` are replaced by `kind` and `disposition`. **No entry
is added** for `module/plan-history/plan-history.feature.ts` — its `.feature.ts` suffix declares its
kind, and `service-kinds.test.ts:259` refuses a second declaration — and **no entry is removed**,
because `:237` requires the retained unsuffixed shim to stay classified. The entry count is 95 before
and 95 after.

```json
    {
      "path": "libs/wbs/application/core/src/service/history.service.ts",
      "kind": "support",
      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-history module directly"
    },
```

## 11. Global stop conditions

These are not preconditions — each slice's own step 0 in section 7 holds those, so that a later slice
is never blocked by an earlier slice's own work. Stop on any of the following at any point.

- A red checkpoint reports `0 tests ran`: the `-t` filter did not match. Anchor the joined `describe`
  and title, or use the unanchored title alone; never include Bun's printed `>`.
- A mutation leaves its named test passing. That is first a location mistake: restore, check the
  location against section 10, redo once, and stop if it still passes.
- An Nx target outlives the tool's wait. It is STILL RUNNING, not failed: poll it under a
  status-recording wrapper.
- A command needs the network, or an OpenSpec invocation tries to download.
- A step-0 line in section 7 does not print what it says.
- Any check this packet names is unavailable. Report the block; never skip it silently.

## 12. Ready to commit

Each slice ends in its own planner commit, so there is no single final `git status`. Each slice
records `base=$(git rev-parse HEAD)` in its step 0 and hands over `git diff --name-only "$base"` plus
`git ls-files --others --exclude-standard`, which cannot be broken by the planner's own commits. Every
list below includes the slice's own `verify.md` append and, where the slice ticks one, `tasks.md`:
those edits are prescribed, so a handoff that omitted them would contradict the slice.

| Slice | `git diff --name-only` adds                                                                                                                                                                                                                         | Untracked adds                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | nothing                                                                                                                                                                                                                                             | the six files under `openspec/changes/adopt-di-composition/`                     |
| 2     | `openspec/changes/adopt-di-composition/verify.md`, `libs/wbs/domain/domain/README.md`, `libs/wbs/domain/domain/src/index.ts`                                                                                                                        | `libs/wbs/domain/domain/src/project-ownership.ts`, `…/project-ownership.test.ts` |
| 3     | `openspec/changes/adopt-di-composition/tasks.md` and `…/verify.md`, the seven core files of section 10.7, `libs/wbs/application/core/src/service/broadcast.test.ts`, and `libs/wbs/domain/domain/src/project-ownership.ts` for its `Proof:` comment | nothing                                                                          |
| 4     | `openspec/changes/adopt-di-composition/tasks.md` and `…/verify.md`, `libs/wbs/application/core/src/service/history.service.ts`                                                                                                                      | the six files under `libs/wbs/application/core/src/module/plan-history/`         |
| 5     | `openspec/changes/adopt-di-composition/tasks.md` and `…/verify.md`, `libs/wbs/application/core/src/compose.ts`, `libs/wbs/application/core/src/index.ts`, `docs/code-organization/kinds.json`                                                       | nothing                                                                          |

Subjects are the five named in section 7. Never `--no-verify`.

## 13. Recorded assumptions

1. **The module identifier is `module.application.plan-history` and the DI Bag label is
   `application.plan-history`.** The batch-6 addendum gives a runtime word — `module.backend.<name>`,
   `module.frontend.<name>`, `module.gateway.<name>`, `module.mcp.<name>` — only to a module that
   lives **under an app**. This module lives in a library, so it keeps ring then name, and the ring is
   `application` because the six existing identifiers in `docs/wiki-policy/modules.json` use exactly
   that grammar and `libs/wbs/application/core` is that ring. Later packets that extract a module
   under `apps/wbs/*` use the runtime word instead; no existing identifier is touched.
2. **The private binding is `historySettings`, the module's construction options.** The map says Plan
   history has no private collaborator, so without this binding the module would have nothing to label
   and neither label proof would be reachable. It is genuine wiring, not a placeholder: it is the
   value the module builds from its two requirements.
3. **`http/project.routes.ts` keeps importing `canEdit`.** It is delivery and the map treats
   delivery's direct resource imports as existing K2 debt; the compatibility alias keeps it valid.
4. **No per-module `tsconfig.json` in this packet.** The design's layout names one, but nothing in
   this repository runs an isolated type check yet, and adding an Nx target would move
   `tools/tool-devsync/src/workspace-inventory.test.ts` counts. `tasks.md` 7.3 carries it as work with its own
   proof, and the target name `typecheck:module` there is that task's proposal rather than a name the
   design supplies; this packet does not open it.
5. **The module claims no K3 or K2 compliance.** `HistoryService` reads two repository ports, which K3
   forbids a feature-service, and delivery still reaches seven resource-services directly. Sealing
   declares those dependencies; `tasks.md` 7.4 is where closing them is tracked.

## 14. Disposition of review 1

| Finding                                               | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical 1** — stops block the packet's own slices  | **FIXED.** Section 11 no longer holds preconditions; each slice in section 7 opens with its own step 0, and every gate was evaluated as written while walking the five slices in order on one tree. The `canEdit` count is slice 3's, the 40-line check is slice 4's, and slice 3 is told not to touch `history.service.ts`.                                                                                                          |
| **Critical 2** — `wbs-be-01:test:unit` needs a port   | **FIXED.** Measured: exactly one non-DB be-01 test binds a port (`src/app.routes.test.ts:548`, `refuses framed GET and HEAD bodies on the production health route`). The target moves to section 8 with the value observed; slice 5's executor runs `wbs-be-01:typecheck` plus `src/app.test.ts` and `src/controller/history.controller.test.ts` (`11 pass`, `0 fail`). No `--network` is requested.                                  |
| **Critical 3** — encapsulation proof is a false green | **FIXED.** A new test, `exposes only the contract exports from its installer`, enumerates what the production `installPlanHistory` returns. Rehearsed with the reviewer's exact mutation: `5 pass`, `1 fail`, `[ "history", + "bag", ]`, while `wbs-core:typecheck` still exits 0 — which is the point. Section 10.2 gains a scenario for it; the host-graph test stays a separate obligation.                                        |
| **Important 4** — tasks do not cover the whole map    | **FIXED.** `tasks.md` gains section 4 (Plan document, Local solver launcher, Supervisor), section 6 (the fourteen portable-core and two backend domain moves, and `push-client.ts`), and 7.3 for the isolated type check that assumption 4 defers.                                                                                                                                                                                    |
| **Important 5** — the K3 JSDoc teaches an exemption   | **FIXED.** The `PlanHistoryRequirements` JSDoc now says the repository-port dependency is preserved K3 debt, not compliance. Section 1, section 10.3's "What sealing does not fix", a new spec requirement, the proposal's "Decisions Recorded", `tasks.md` 7.4 and assumption 5 all say the same thing.                                                                                                                              |
| **Important 6** — OpenSpec creation and validation    | **FIXED.** Slice 1 runs the README's creation block (`new change … --schema sdd-lean` plus the `.openspec.yaml` grep — measured: it creates that file alone) and the README's strict `jq -s -e` validation block, with a recorded baseline of `N` items and a requirement of `N + 1`. Observed `112` → `113/113/0`. The proposal is now 385 words. `.openspec.yaml` is in section 5 and section 12.                                   |
| **Important 7** — implementation before its tests     | **FIXED.** Slice 4 step 1 creates `module.test.ts` first and records the rehearsed red on the unchanged tree: `error: Cannot find module './check'`, `0 pass`, `1 fail`, `1 error` (section 6 row 2).                                                                                                                                                                                                                                 |
| **Important 8** — recorded negatives do not match     | **FIXED.** The three privacy and label assertions are now three separate `it` blocks, and all three mutations were re-rehearsed against the final listing: `5 pass 1 fail`, `3 pass 3 fail`, `4 pass 2 fail`. The reviewer's `3 pass 1 fail` for the label mutation was right about review 1's listing; the counts above are the observed ones for this one.                                                                          |
| **Important 9** — classification contradiction        | **FIXED.** Measured 95 entries. The prescription is now "rewrite the row in place; add no suffix-declared row; remove none", the count is 95 → 95 in both section 7 and section 10.9, and section 6's duplicate-row row is labelled a rehearsal of the refusal rather than a prescription.                                                                                                                                            |
| **Important 10** — the handoff is impossible          | **FIXED.** Section 12 is a per-slice table of `git diff --name-only "$base"` and `git ls-files --others`, with `base` recorded by the slice. Slice 3's Prettier target is the seven named files rather than a placeholder, and the `Proof:` comments are attributed to `project-ownership.ts`, `module.ts` and `check.ts`.                                                                                                            |
| **Important 11** — baselines and ownership            | **FIXED.** Every slice has an explicit step 0 with its baselines and deltas. `tool-devsync:test` moved to section 8 with `366 pass 0 fail`; `nx format:check --all` is the executor's in slices 2, 3, 4 and 5; `wbs-core:build:portable` is a new executor check in slices 3 and 5, observed exit 0 with `application.plan-history` in the browser bundle; `test:portable` is the planner's.                                          |
| **Minor 12** — post-Prettier listing and line anchor  | **FIXED after a wrong rejection.** The line anchor was corrected to `broadcast.test.ts:274`. My rejection of the listing was wrong: I wrote the two-line form, but Prettier reformats an embedded `ts` fence and collapsed it back onto one line in the committed file, so both earlier revisions really did show one line. Review 2 caught this. Section 10.7 now uses a `text` fence, which I verified survives `prettier --write`. |
| **Minor 13** — rename preparation unfinished          | **FIXED.** The header carries a six-row table of every identifier the planner must re-point, says which two this packet actually references, keeps historical filenames, and uses "Twilight Burokrat" in prose. Assumption 1 now distinguishes app runtime labels from library ring labels.                                                                                                                                           |
| **Minor 14** — known race handling missing            | **FIXED.** Section 8 carries the record-and-rerun-once exception for `claims.db.test.ts` › `bounds terminal lock contention and retries until a held write commits`, and forbids editing that or any other unnamed test.                                                                                                                                                                                                              |
| **Minor 15** — dispatch flags and evidence paths      | **FIXED.** The header gives `--batch batch-6` and says `--batch-dir docs/superpowers/plans/2026-09-21-batch-6` is that batch's launcher default. Section 7's preamble and section 10.5's `verify.md` both require evidence references to be basenames relative to the attempt's evidence directory.                                                                                                                                   |

**New facts this revision measured**, beyond the review: a helper returning either of two
registration objects makes DI Bag's builder reject the graph at the type level, so the two host
graphs in `module.test.ts` are written out separately; and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves relative Markdown links against
the file that carries them, so review 1's own README listing broke `tool-devsync:test` with four
failures naming this packet — the module README now uses backticked workspace-relative paths.

## 15. Disposition of review 2

The four round-1 PARTLY items are closed first: Important 9 (slice 5's classification count is now
`K`, unchanged), Important 10 and Important 11 (evidence and task edits are in every handoff, and
every slice collects and names its own baselines), and Minor 13 (the generated artifacts now carry the
app grammar). Minor 12 was a wrong rejection and is now fixed for real.

| Finding                                                          | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Important 1** — evidence and task edits missing                | **FIXED.** Section 5 now owns `verify.md` for slices 1 to 5 and `tasks.md` for slices 1, 3, 4 and 5; section 7 gives each later slice an explicit append step and names the checkbox it ticks (1.1 → slice 3, 2.1 → slice 4, 2.2 → slice 5); section 12's rows for slices 2 to 5 list both paths and say why a handoff without them would contradict the slice.                                                                                                                                                                             |
| **Important 2** — generated OpenSpec contradicts the app grammar | **FIXED.** The proposal's Non-Goals no longer forbid a non-ring identifier, and a new "Module identifiers" section states the decision; the delta spec's label requirement now says a library module is `module.<ring>.<name>` and a module under an app is `module.<runtime>.<name>` — `backend`, `frontend`, `gateway` or `mcp` by location — with a scenario naming `module.application.plan-history` and `module.backend.optimization`; `design.md` repeats it. The nine existing identifiers are untouched and the label is unchanged. |
| **Important 3** — the second assertion had no negative           | **FIXED.** Section 6 gains fault 7, the reviewer's mutation, rehearsed: `expect(Object.values(exposed).every(…)).toBe(true);` → `error: expect(received).toBe(expected)`, `Expected: true`, `Received: false`, `5 pass`, `1 fail`, with `wbs-core:typecheck` exit 0 and the key list still `['history']`. Slice 4 step 6 now runs four negatives and prescribes two `Proof:` comments beside `installPlanHistory`'s `return`, one per assertion.                                                                                            |
| **Important 4** — baselines and final verification               | **FIXED.** Slice 1 gains the repository-wide format check and a `verify.md` append; slice 4 records `C` and `F` from its own `bun test src` run (observed `535 pass`, 52 files) and closes with `C + 6` over `F + 1` (observed `541 pass`, 53 files); slice 5 records `K` and requires `K` unchanged, with 95 kept only as historical evidence; in slices 2 to 5 the format check and the closing runs now come **after** the proof comments, task ticks and evidence appends.                                                              |
| **Minor 5** — the formatter listing                              | **FIXED**, and my round-1 rejection was wrong: see the corrected row in section 14.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Minor 6** — preparation 6 misidentified                        | **FIXED.** `040-6-backend-module-map.md:103-105` is the root-supplied optimizer callback and realtime broadcaster; `:111-113` is `SolverObjectiveName`. Section 4's row is now labelled "8's first half", and preparation 6 has its own row.                                                                                                                                                                                                                                                                                                |
| **Minor 7** — inaccurate command and target text                 | **FIXED.** The listener search is wrapped in `(cd apps/wbs/be-01 && …)` and says there is no `src` at the repository root; `wbs-core:test` is now described as planner integration verification with coverage, explicitly **not** a listener or database restriction, with the measured fact that no core test calls `Bun.serve` or `.listen(` and its `541`/`535` counts; `typecheck:module` is attributed to `tasks.md` 7.3's proposal in section 9 and in assumption 4.                                                                  |
| **Minor 8** — the zero-import check's exit status                | **FIXED.** Slice 3 replaces the table row with the batch README's `\|\| test $? -eq 1` shape, rehearsed under `set -euo pipefail`: `remaining=0`, subshell exit 0, against the 5 recorded at step 0. Any other status from the first `grep` is a stop.                                                                                                                                                                                                                                                                                      |

**Dispatchable now.** Slices 1, 2 and 3 are dispatchable as written: their preconditions, baselines,
commands, negative, handoff and commit subject are complete, and all three were rehearsed in order on
one tree. Slices 4 and 5 are complete and rehearsed too, and become dispatchable as their predecessors
land, because each one's step 0 reads the previous slice's result rather than an absolute fact.

## 16. Disposition of review 3

| Finding                                                            | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blocking 1** — the zero-import check could certify a failed scan | **FIXED.** I reproduced the flaw first: with a nonexistent input the old pipeline printed a `No such file or directory` warning, then `remaining=0`, and exited **0**. Slice 3 now carries the review's `if remaining=$(grep -nH …); then … else scan_status=$?; test "$scan_status" -eq 1; fi` form, rehearsed three ways — no matches gave `remaining=0` and exit 0; one import left in `step.service.ts:9` printed its location and exited 1 with no `remaining=0`; a missing input path printed grep's error and exited 1. I also searched the packet for any other `… \| … \|\| test $? -eq 1` pipeline and found none; the note now says a bare command with that suffix stays fine.                                                                |
| **Note** — the stale 385-word claim                                | **FIXED.** `wc -w` on the supplied text was **491** raw (456 with markers stripped, as the review measured), over R4's cap either way. The proposal is trimmed to **399** by `wc -w` on the file as the executor writes it, keeping the "Module identifiers" section whole; §10.1 states the number and the command. Slice 1 was rehearsed again end to end: strict validation `{"items": 113, "passed": 113, "failed": 0}` with the `jq -s -e` contract at exit 0, then a real `git commit` that lefthook accepted. Measured while doing it: `doc-caps` does **not** police this cap — `lefthook.yml:24-26` globs it to `LLM_README.md` and it reported `doc-caps (skip) no matching staged files` — so §10.1 says the count is the executor's to check. |
| **Note** — slice 1 appended evidence after its format check        | **FIXED.** Slice 1's steps 5 and 6 are swapped: the `verify.md` append comes first, then `prettier --write` on that file, then `nx format:check --all`. The step says every later slice follows the same order, which is what slices 2 to 5 already do.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Review 3's "what the planner must verify" list is the planner's checklist, not the executor's, and it
matches sections 7, 8 and 12: the ownership-gate fault and all four module faults replayed with saved
patches and byte restoration, the six callers and the alias, the moved implementation differing only in
import paths, domain `+2`, core `+6` over `+1` file, classification unchanged at `K`, staged
`tool-devsync:test` then the HEAD-sensitive pilot-policy run, the portable build and browser test, only
tasks 1.1, 2.1 and 2.2 ticked, relative evidence references, `N + 1` on strict validation, and the host
gate on the committed SHA.
