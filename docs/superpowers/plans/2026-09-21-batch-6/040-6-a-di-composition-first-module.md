# 040.6 A DI composition, and the first sealed core module

> **Before dispatch, the planner re-points renamed identifiers.** This packet was written on the
> base at `72627001`, which still spells the product "Bureaucrat". The rename lands first: project
> `twilight-bureaucrat` → `twilight-burokrat`, and paths under `infra/ci/bureaucrat`. Nothing this
> packet's commands depend on changes shape; only those names do.

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — first packet |
| Size class | M, in five slices                                                                                       |
| Slices     | 1 open the change, 2 the domain gate, 3 the six importers, 4 the first module, 5 install it             |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, preparation 2 and one module   |
| Planned on | 2026-09-21, every slice rehearsed end to end in a private worktree of `72627001` and reverted           |

**You execute one slice and stop.** The end of your instructions names which. Section 7 gives every
command with its expected exit status; section 8 names the planner's checks.

## 1. Goal and non-goals

**Goal.** Open the OpenSpec change `adopt-di-composition` over the whole of 040.6's target shape,
so every later packet only ticks its tasks; then land the map's smallest independent no-sideways
preparation (the project write gate moves to the domain library as `canEditProject`); then extract
Plan history as the pattern-setting sealed DI Bag module, with a README, a contract, a labelled
`module.ts` and a composition check, proving by test that its bag is unreachable from outside its
own composition and that its label names a binding in a real DI failure message.

**Non-goals.** No library version bump: `di-bag` stays 0.4.0, `application-exception` 0.5.0,
`caught-object-report-json` 11.0.1, and `bun.lock` and `package.json` are the planner's. No
frontend, no gateway, no MCP. No second core module — the map's other seventeen responsibilities
are later packets, listed in section 9. **No K2 feature owner is invented:** the map is explicit
that direct CRUD delivery for Calendar marker, Capacity, Directory, Priority band, Project, Step
and Work item still lacks accepted feature owners, so full K2 closure stays outside 040.6's claim,
and slice 1's proposal records exactly that. No wiki-module registration (section 3 says why it
cannot happen here). No per-admission module: `servicesOver` keeps hand-wiring in this packet.

## 2. Read first

| File                                                                    | Why                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                             | Rules R1 to R5. R5 and R3 decide most of the review of this work.                     |
| `LLM_README.md`                                                         | The index. Read only the entry your slice needs.                                      |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                   | "Execution contract" and "Standard blocks every packet uses", by name.                |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` | The ownership map. Slice 1 turns it into artifacts; sections 3 and 9 correct it.      |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`         | "Modules", "Module layout", "Import matrix", K1 to K9.                                |
| `libs/wbs/application/core/src/compose.ts`                              | 297 lines. Slice 5 edits two places in it; read `servicesOver` and `composeServices`. |
| `apps/wbs/be-01/src/boot.ts`                                            | How DI Bag is already used, and what disposal `bootBe01` owns. Not edited.            |
| `libs/wbs/application/core/src/service/project.service.ts`              | Slices 2 and 3 move `canEdit` out of it.                                              |
| `libs/wbs/application/core/src/service/history.service.ts`              | 40 lines. Slice 4 moves it and leaves a shim.                                         |

## 3. Verified facts

Every line was read in the repository at `72627001` on 2026-09-21; every command result was
observed in a private worktree of that commit.

| Fact                                                                                                                                                                                                                                             | Evidence                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-di-composition` does not exist. The schema is `sdd-lean`.                                                                                                                                                                | `ls openspec/changes`; `openspec/config.yaml:1`                                                                                                                                                |
| `canEdit` is a two-line pure function reading only `restricted` and `ownerId`.                                                                                                                                                                   | `libs/wbs/application/core/src/service/project.service.ts:94-96`                                                                                                                               |
| Six core production paths import it sideways: priority band, capacity, calendar marker, step, work item, and `savePlan`. `project.routes.ts` also imports it, but it is delivery and already imports `ProjectService`.                           | `priority-band.service.ts:7`, `capacity.service.ts:5`, `calendar-marker.service.ts:7`, `step.service.ts:9`, `work-item.service.ts:87`, `use-cases/save-plan.ts:3`, `http/project.routes.ts:19` |
| `history.service.ts` is 40 lines, one method, two store requirements, and is built once at process level rather than per admitted scope.                                                                                                         | `libs/wbs/application/core/src/service/history.service.ts`; `compose.ts:228-231`                                                                                                               |
| It is the smallest responsibility in the map. The next smallest are priority band (83 lines) and capacity (95), and both are per-admission and need `canEditProject`.                                                                            | `wc -l` over `libs/wbs/application/core/src/service/*.service.ts`                                                                                                                              |
| `service-boundaries.test.ts` asserts `libs/wbs/application/core/src/service/history.service.ts` **exists** and lints it. The shim is required, not optional.                                                                                     | `libs/wbs/application/core/src/service/service-boundaries.test.ts:22`, `:53-55`                                                                                                                |
| `tools/tool-devsync/src/service-kinds.test.ts` refuses a `kinds.json` entry for a file whose name declares its kind by suffix, and requires every unsuffixed candidate to be classified exactly once.                                            | `service-kinds.test.ts:237`, `:259`; both observed failing, section 6 fault 5                                                                                                                  |
| DI Bag 0.4.0 `buildModule(keys, { label })` names non-exported bindings `<label>/<key>` in error messages, cycle paths and `inspectGraph()`; exported bindings keep the bare key.                                                                | `node_modules/di-bag/dist/module.d.ts:9-22`; probed, section 6                                                                                                                                 |
| `lint:source` exists **only** on `twilight-bureaucrat`. For `wbs-core` and `wbs-domain` the source-lint target is `lint`.                                                                                                                        | `bunx nx show project wbs-core --json`; `package.json:13`                                                                                                                                      |
| The six wiki module identifiers use the grammar `module.<ring>.<name>`: `adapter`, `application`, `archive`, `docs`, `domain`, `infra`.                                                                                                          | `docs/wiki-policy/modules.json`                                                                                                                                                                |
| A new `<!-- module-index -->` block anywhere breaks `pilot-policy.test.ts:380`, and a new `modules.json` row additionally breaks `:363` (`toHaveLength(6)`) and is refused by the CLI as "pilot module ownership has no exact trusted boundary". | Observed, section 6 fault 6. **This is why this packet registers no wiki module.**                                                                                                             |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts` clones the repository at HEAD and overlays only `pilotPaths`, so it cannot see an uncommitted change to any other file.                                                                          | `pilot-policy.test.ts:101-118`                                                                                                                                                                 |
| It also needs `TOOL_WIKI_TRUSTED_NODE_MODULES`; a bare `bun test` of that file fails with `trusted TypeScript runtime modules are not configured` on the unmodified tree too.                                                                    | `apps/wiki/cli/project.json:23`; `apps/wiki/cli/src/relationships/index.ts:82`                                                                                                                 |
| `bootBe01` already owns source, retention, optimizer and listener disposal in a tested order. The Plan history module registers no disposer, because nothing it owns has one.                                                                    | `apps/wbs/be-01/src/boot.ts:89-140`                                                                                                                                                            |

## 4. Why this preparation and why this module

**Preparation.** The map lists eight required no-sideways preparations. Measured:

| Preparation                                 | Measured size                                                                                                                | Verdict                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1, split `broadcast.ts`                     | 3 exported contracts plus a collector, consumed by every resource                                                            | Largest. Not first.                                                                                    |
| **2, move `canEdit`**                       | one 2-line pure function, 6 sideways production imports, 1 compat alias                                                      | **Chosen.** Smallest preparation that carries a real rule, so it has a production-path negative.       |
| 3, Plan document's marker read              | `plan-document.ts:28-30` is **already** a structural port; only the `CalendarMarkerListOutcome` type import at `:14` remains | Smaller in lines, but type-only: no behaviour changes, so R5 has no production-path negative to watch. |
| 6 and 8's first half, `SolverObjectiveName` | 1 import line in `optimization-coordinator.ts:43` plus 1 test                                                                | Type-only, same objection; and 8's other half (the cache-key port) is not independent of Optimization. |
| 4, 5, 7                                     | Depend on contracts that do not exist yet                                                                                    | Not independent.                                                                                       |

Preparation 2 also breaks the most edges per line changed: six of the map's resource and feature
paths, with no event or service dependency introduced.

**Module.** Plan history, measured smallest in the map at 40 lines and one method, and the only
small one that is **process-level**. Every resource responsibility (priority band 83 lines,
capacity 95) is built inside `servicesOver`, which runs once per admitted transaction; the map
warns that a singleton installation there would leak staged stores between transactions, so the
first module must not be one of those. Plan history needs no `Broadcaster`, no `Clock` and no
`canEditProject`, so it isolates the composition question from every other change.

**Size.** Five slices, each one 20 to 40 minutes. (a) is one slice because section 10 gives the
artifacts verbatim; (b) is two, because the domain move and the six rewrites have separate red and
green points; (c) is two, because the module's files and its negatives are one unit and the
composition wiring is another. Nothing is cut.

## 5. File plan

| Path                                                                                                       | Slice | Create or modify                                                   |
| ---------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `openspec/changes/adopt-di-composition/proposal.md`                                                        | 1     | create, verbatim from section 10.1                                 |
| `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`                                       | 1     | create, verbatim from section 10.2                                 |
| `openspec/changes/adopt-di-composition/design.md`                                                          | 1     | create, verbatim from section 10.3                                 |
| `openspec/changes/adopt-di-composition/tasks.md`                                                           | 1     | create, verbatim from section 10.4                                 |
| `openspec/changes/adopt-di-composition/verify.md`                                                          | 1     | create, verbatim from section 10.5; each later slice appends to it |
| `libs/wbs/domain/domain/src/project-ownership.ts`                                                          | 2     | create                                                             |
| `libs/wbs/domain/domain/src/project-ownership.test.ts`                                                     | 2     | create                                                             |
| `libs/wbs/domain/domain/src/index.ts`                                                                      | 2     | modify, one export in sorted position                              |
| `libs/wbs/domain/domain/README.md`                                                                         | 2     | modify, one row naming `project-ownership.ts`                      |
| `libs/wbs/application/core/src/service/project.service.ts`                                                 | 3     | modify                                                             |
| `libs/wbs/application/core/src/service/{priority-band,capacity,calendar-marker,step,work-item}.service.ts` | 3     | modify                                                             |
| `libs/wbs/application/core/src/use-cases/save-plan.ts`                                                     | 3     | modify                                                             |
| `libs/wbs/application/core/src/service/broadcast.test.ts`                                                  | 3     | modify, one stale comment                                          |
| `libs/wbs/application/core/src/module/plan-history/README.md`                                              | 4     | create                                                             |
| `libs/wbs/application/core/src/module/plan-history/contract.ts`                                            | 4     | create                                                             |
| `libs/wbs/application/core/src/module/plan-history/module.ts`                                              | 4     | create                                                             |
| `libs/wbs/application/core/src/module/plan-history/check.ts`                                               | 4     | create                                                             |
| `libs/wbs/application/core/src/module/plan-history/module.test.ts`                                         | 4     | create                                                             |
| `libs/wbs/application/core/src/module/plan-history/plan-history.feature.ts`                                | 4     | `git mv` of `service/history.service.ts`                           |
| `libs/wbs/application/core/src/service/history.service.ts`                                                 | 4     | create, a re-export shim (the moved file's former path)            |
| `libs/wbs/application/core/src/compose.ts`                                                                 | 5     | modify, two places                                                 |
| `libs/wbs/application/core/src/index.ts`                                                                   | 5     | modify, three export lines                                         |
| `docs/code-organization/kinds.json`                                                                        | 5     | modify, one entry rewritten                                        |

**Neighbours.** No other batch-6 packet owns any of these paths. `docs/code-organization/kinds.json`
is also the subject of the map's correction task 1.8, which stays in `tasks.md` unticked. The
planner may add or revise this packet file itself; slice path counts below are scoped to owned
paths, never to the whole tree.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of `72627001` and the literal
fragment is what the runner printed. Restore a mutated file from a copy under `"$TMPDIR"` and prove
it with `cmp` before asserting on any captured status.

| #   | Where                                                                    | Fault injected                                                         | Test that observed it                                                                                   | Literal fragment observed                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | slice 2 red, on the unchanged tree                                       | none; the module does not exist yet                                    | `project-ownership.test.ts`                                                                             | `error: Cannot find module './project-ownership'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                  |
| 2   | `libs/wbs/domain/domain/src/project-ownership.ts`, `canEditProject` body | `return true;` in place of the rule                                    | `announces nothing for a write it refused` in `libs/wbs/application/core/src/service/broadcast.test.ts` | `- "reason": "forbidden",` / `+ "ok": true,` then `(fail) a calendar marker write announces itself > announces nothing for a write it refused`, `0 pass`, `1 fail`, `10 filtered out`                                                                              |
| 3   | `module.ts`, the `buildModule` call                                      | the `{ label: PLAN_HISTORY_LABEL }` option removed                     | `names itself when a host omits a requirement`                                                          | `Expected to contain: "application.plan-history/historySettings"` / `Received: [ "history", "projectStore", "planEventStore", "historySettings" ]`, and `Received message: "DI_BAG_MISSING_DEPENDENCY: Cannot resolve \"historySettings\": …"`; `2 pass`, `2 fail` |
| 4   | `module.ts`, the `buildModule` key tuple                                 | `['history', 'historySettings']` in place of `['history']`             | `keeps its private bindings out of every host graph`                                                    | `Expected substring: "DI_BAG_MISSING_REGISTRATION: Service \"historySettings\" is not registered."` / `Received function did not throw`; `2 pass`, `2 fail`                                                                                                        |
| 5   | `docs/code-organization/kinds.json`                                      | the moved row renamed to the new `.feature.ts` path instead of deleted | `tool-devsync:test`                                                                                     | `+   "libs/wbs/application/core/src/module/plan-history/plan-history.feature.ts",` at `service-kinds.test.ts:237`, and `declaredTwice` non-empty at `:259`; `2 fail`. Deleting the row instead: `366 pass`, `0 fail`                                               |
| 6   | `libs/wbs/application/core/src/module/plan-history/README.md`            | a `<!-- module-index -->` block added                                  | `pins exact pre-index tuples and passes observe lint from external trust`                               | `+   "module.application.plan-history",` at `pilot-policy.test.ts:380`. Adding the `modules.json` row too gave `Expected length: 6` / `Received length: 7` at `:363` and `pilot module ownership has no exact trusted boundary: module.application.plan-history`   |

Faults 3 and 4 each leave the other check observable: 3 does not stop the missing-registration
assertion passing, and 4 does not stop the resolution-path assertion being reached. Both are
recorded because both were watched.

**Also observed, and prescribed because of it:** renaming `canEdit` to `canEditProject` pushes
`calendar-marker.service.ts:216` past the print width, and the pre-commit `format` hook refused the
commit with `[warn] libs/wbs/application/core/src/service/calendar-marker.service.ts`. Section 10.7
shows that line in its post-Prettier two-line form. Appending the new export to the end of
`libs/wbs/domain/domain/src/index.ts` failed `wbs-domain:lint` with
`Run autofix to sort these exports! simple-import-sort/exports`; `bunx eslint --fix` moves it to a
position whose neighbouring comment is about `tree-order`, so section 10.6 gives the correct
insertion point instead.

## 7. Slices

Each slice records its own baselines in a step 0 and compares relatively. Run every test with
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with `NX_DAEMON=false`. Keep
exit statuses as `cmd > log 2>&1; echo "exit=$?"`; never read a status through `tee` and never
`|| true`. Scratch only under `"$TMPDIR"`; the executor cannot change Git state, so the planner
commits each slice.

### Slice 1 — Open `adopt-di-composition`

Create the five files of section 10 exactly as given, then:

| Command                                                                                          | Expect                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `GSETTINGS_BACKEND=memory bunx prettier --write 'openspec/changes/adopt-di-composition/**/*.md'` | exit 0                                                                          |
| `GSETTINGS_BACKEND=memory bunx prettier --check 'openspec/changes/adopt-di-composition/**/*.md'` | exit 0, `All matched files use Prettier code style!`                            |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                    | exit 0; the `adopt-di-composition` entry has `"valid": true` and `"issues": []` |

Observed: exit 0 and `{"id": "adopt-di-composition", "type": "change", "valid": true, "issues": []}`.
The command must not download beyond the pinned `@fission-ai/openspec@1.12.0` already in the
workspace cache; if it attempts a network fetch, stop and say so.

Planner commit: `feat(openspec): open adopt-di-composition for the 040.6 module split`.

### Slice 2 — The write gate becomes domain code

1. Write `project-ownership.test.ts` (section 10.6) and run it. Expect the red of fault 1:
   `error: Cannot find module './project-ownership'`. This red is evidence, not a commit.
2. Write `project-ownership.ts` (section 10.6), insert the export at the position section 10.6
   names, and add the README row.
3. Green: `bun test libs/wbs/domain/domain/src/project-ownership.test.ts` → exit 0, `2 pass`,
   `0 fail`, `3 expect() calls` (observed).
4. `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-domain` → exit 0.

The R5 negative belongs to slice 3, because until the six callers use the moved rule the injected
fault has no production path through a service. Say so in `verify.md`.

Planner commit: `refactor(core): move the project write gate into the domain library`.

### Slice 3 — The six sideways importers

Apply section 10.7's edits to the seven core files, and correct the stale `canEdit` mention in
`broadcast.test.ts:273`.

| Command                                                                                     | Expect                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache`                            | exit 0 (this slice re-declares an exported symbol, so the type check runs here) |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint -p wbs-core,wbs-domain --skip-nx-cache` | exit 0                                                                          |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the seven files>`                          | exit 0                                                                          |
| `grep -rn "from './project.service'" libs/wbs/application/core/src/service`                 | no line imports `canEdit`                                                       |

Then the negative, fault 2: replace the body of `canEditProject` with `return true;`, run
`bun test libs/wbs/application/core/src/service/broadcast.test.ts -t 'announces nothing for a write it refused'`,
and expect exit 1 with the fragment in row 2 of section 6. Save the patch under
`"$TMPDIR"/evidence` with the README's `if diff …; then …; else test $? -eq 1; fi` form, restore
with `cp` and prove with `cmp` **before** asserting on the captured status. Add beside
`canEditProject` a dated `Proof:` comment naming the injected fault and the observed test.

Planner commit: `refactor(core): point every resource at the domain write gate`.

### Slice 4 — Plan history as the first sealed module

1. `git mv libs/wbs/application/core/src/service/history.service.ts libs/wbs/application/core/src/module/plan-history/plan-history.feature.ts`
   is the planner's; the executor instead copies the file to the new path, rewrites its two
   `../ports/` imports to `../../ports/`, and replaces the old path with the shim of section 10.8.
   **Do not delete the old path:** `service-boundaries.test.ts:22` asserts it exists.
2. Create `README.md`, `contract.ts`, `module.ts`, `check.ts` and `module.test.ts` from section 10.8.
3. `bun test libs/wbs/application/core/src/module/plan-history/module.test.ts` → exit 0, `4 pass`,
   `0 fail`, `5 expect() calls` (observed).
4. `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0.
5. The two negatives, faults 3 and 4, one at a time, each restored and `cmp`-proved before the next.
   Add the dated `Proof:` comments beside the `buildModule` call.

The README carries no `<!-- module-index -->` block and `docs/wiki-policy/modules.json` is not
touched; fault 6 is why, and the README says so in its own words.

Planner commit: `refactor(core): seal Plan history as the first DI Bag module`.

### Slice 5 — Install it from the composition root

Apply section 10.9: `compose.ts` (two places), `index.ts` (three export lines), and
`docs/code-organization/kinds.json` (the `history.service.ts` row becomes the shim row; **no** row
is added for the `.feature.ts` file — fault 5).

| Command                                                                                               | Expect                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain --skip-nx-cache` | exit 0                                                                                                        |
| `NX_DAEMON=false bunx nx run-many -t test:unit,typecheck -p wbs-be-01 --skip-nx-cache`                | exit 0                                                                                                        |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                       | exit 0, `366 pass`, `0 fail` on the rehearsed tree; record your own baseline first and require the same count |

`tool-devsync:test`'s index checker refuses untracked files, so this one runs with the slice's files
staged. On this host `poller.test.ts`'s two `durable dev poller` tests may fail in the sandbox with
`Invalid cross-device link`; record that and hand the target to the planner rather than treating it
as yours.

Planner commit: `refactor(core): compose Plan history from its sealed module`.

## 8. Planner-only checks

| Check                                                                                                                                                                     | Why it is the planner's                                                                           | Value observed on the rehearsed tree |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts` | Clones the repository at HEAD, so it needs the slices committed; and it spawns the CLI many times | exit 0, `21 pass`, `0 fail`          |
| `bunx nx run wbs-core:test` and `wbs-be-01:test` (whole targets)                                                                                                          | Spawn processes and bind ports; `EPERM` in the sandbox                                            | pending planner verification         |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                | Takes the host-wide heavy lock                                                                    | pending planner verification         |
| `bunx nx format:check --all`                                                                                                                                              | Needs `--all`; the base-ref default is empty on main                                              | pending planner verification         |

No slice adds a file under `apps/wiki/cli`, so the Twilight Bureaucrat validator identity does not
move. No slice adds a project target or a scanned-source line, so
`tools/tool-devsync/src/workspace-inventory.test.ts` counts and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s digest do not move — `tool-devsync:test`
was observed at `366 pass`, `0 fail` with every slice applied.

## 9. What the next 040.6 packets should be

1. **B — the neutral event port.** The map's preparation 1: split `broadcast.ts` into a neutral
   `ProjectEvent`/`Broadcaster`/`subscriptionFor` location plus Plan commands' private collector.
   Every remaining module depends on it, and it is the largest preparation.
2. **C — the small preparations.** Map preparations 3, 4, 5 and 6 and 8's type halves: Plan
   document's marker read port, the principal and actor types, `SolverObjectiveName`. Type-only, so
   one packet with one typecheck slice each.
3. **D — the wiki registration of a module.** `docs/wiki-policy/policy.json` trusted boundary, the
   `modules.json` row, the `module-index` block, and the two pins at `pilot-policy.test.ts:363` and
   `:380`. It must land before any further module README carries index metadata.
4. **E — the remaining process modules**, one per packet or two where they share a contract:
   Bounded replay sweep, Realtime, Saved plans, Plan import, Authentication, Optimization.
5. **F — per-admission installation.** `servicesOver` installing the seven resource modules per
   supplied scope, with the leak negative the map demands. This is the only remaining composition
   question and should not be attempted before B.
6. **G — Plan commands**, last, because Working plan and the collector are private to it and it
   consumes almost every other contract.

## 10. Exact content

### 10.1 `openspec/changes/adopt-di-composition/proposal.md`

```md
## Why

The backend core keeps about fifty service files in one flat directory. Nothing declares what a
service needs, nothing seals what it hides, and a DI failure names an anonymous binding. The
accepted code organization design answers this with one sealed DI Bag module per service
responsibility, and the reviewed 040.6 ownership map already settles which responsibility owns
which file. DI Bag 0.4.0 is installed and the backend's startup already uses it, so what is left
is the composition shape, not a library choice.

## What Changes

**Sealed module composition**

- From: `compose.ts` constructs every service by hand; a service imports a sibling service for a
  shared rule; the bag exists only in `bootBe01`.
- To: each service responsibility in the 040.6 map is one sealed DI Bag module with a README,
  a contract, a labelled `module.ts` and a composition check; sideways rules move to the domain
  library or to a neutral event port; `@wbs/core` keeps every existing export.
- Impact: architectural. No HTTP contract, WebSocket frame, MCP envelope or table changes.

## Non-Goals

No library version bump: di-bag stays 0.4.0, application-exception 0.5.0,
caught-object-report-json 11.0.1. No frontend lifetimes, no gateway or MCP composition, no new
feature capability invented for the resource CRUD that delivery reaches directly, and no new
runtime module identifier beyond the ring-then-name grammar the six existing ones use.

## Constraints

Rules R1 to R5 govern. `bootBe01` keeps owning source, retention, optimizer and listener disposal
in its tested order, and core modules borrow those values without registering a second disposer.
`servicesOver` stays a per-admission graph: no singleton installation may leak staged stores or an
announcement collector between transactions. Every new or changed safety check ships a
production-path negative watched failing.

## Capabilities

### New Capabilities

- `di-composition`: How a service responsibility is sealed as a module, what it may require, and
  what a composition root may see.

### Modified Capabilities

None. Plan history, Plan commands and Saved plans keep their existing `wbs-domain` requirement
groups; Plan import keeps `plan-import`.

## Domain Terms

None new. The nine resource terms the map names are already in `CONTEXT.md`.

## Decisions Recorded

- Full K2 closure stays outside this change: direct CRUD delivery for Calendar marker, Capacity,
  Directory, Priority band, Project, Step and Work item still lacks accepted feature owners, and
  this change does not invent their capability grouping.
- A module's wiki registration is separate work: `docs/wiki-policy/policy.json` needs a trusted
  boundary per module identifier, and `apps/wiki/cli/src/policy/pilot-policy.test.ts` pins both the
  mapping length and the exact set of discovered index identifiers.

## Impact

`libs/wbs/application/core/src`, `libs/wbs/domain/domain/src`, `docs/code-organization/kinds.json`,
and later `docs/wiki-policy/`. `apps/wbs/be-01` changes only where a shim path moves.
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

Every sealed module SHALL be built with a `label` of its ring and name, so that its private
bindings appear as `<label>/<key>` in DI failure messages and in `inspectGraph()`.

#### Scenario: A missing requirement names the module that asked

- **GIVEN** a host graph missing one of a module's requirements
- **WHEN** the module's exported service is resolved
- **THEN** the refusal names the private binding as `<label>/<key>` and the resolution path through it

### Requirement: The bag is reachable only from a composition root

A bag SHALL be built only by a module's own composition function or by a composition root, and a
module's consumers SHALL receive typed services rather than a bag.

#### Scenario: A consumer cannot reach a private binding

- **GIVEN** a module installed in a host graph
- **WHEN** a private binding key is resolved from that host
- **THEN** the host answers that the service is not registered

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

## Order of work

The map's eight no-sideways preparations come first, because every one of them removes an import a
module move would otherwise have to keep. `canEdit` and the `broadcast.ts` split are the two that
unblock the most modules. Each responsibility then moves with `git mv`, keeping its former path as
a compatibility re-export; `docs/code-organization/kinds.json` loses the moved row, because
`tools/tool-devsync/src/service-kinds.test.ts` refuses an entry for a file whose name already
declares its kind by suffix.

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
      Proof: the module's own tests; negatives: the label dropped, and the private binding exported.
- [ ] 2.2 Install it from `composeServices` and keep every `@wbs/core` export. Proof: the core and
      be-01 suites unchanged.

## 3. The remaining process modules

- [ ] 3.1 Bounded replay sweep, borrowing the timer `bootBe01` starts and stops.
- [ ] 3.2 Realtime, implementing the neutral event port.
- [ ] 3.3 Saved plans, absorbing project and admission checks and the publication after save,
      rename and delete.
- [ ] 3.4 Plan import, with its per-scope factory.
- [ ] 3.5 Authentication, absorbing the login throttle and covering the password-only and OIDC
      graphs; the accountless graph exports neither.
- [ ] 3.6 Optimization, with its repository ports and event projections.

## 4. The per-admission modules

- [ ] 4.1 Install the seven resource responsibilities per supplied scope inside `servicesOver`.
      Negative: two admitted batches sharing staged stores.
- [ ] 4.2 Plan commands, with Working plan and the announcement collector private to it.

## 5. Ledger and closure

- [ ] 5.1 Move each test with its owner and delete the re-export shims whose callers are gone.
- [ ] 5.2 Update `docs/code-organization/kinds.json` for every moved and suffix-declared file.
- [ ] 5.3 Record in the change that full K2 closure and wiki registration stay outside it.
```

### 10.5 `openspec/changes/adopt-di-composition/verify.md`

Write it with the four command rows and the empty proof table; Prettier widens the table borders,
so run `--write` before `--check`.

```md
## Commands

| Command                                                                       | Expectation          |
| ----------------------------------------------------------------------------- | -------------------- |
| `bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain`         | exit 0               |
| `bunx nx run-many -t test:unit,typecheck -p wbs-be-01`                        | exit 0               |
| `bunx nx run tool-devsync:test`                                               | exit 0               |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` | exit 0               |
| `bin/h2puni-gate.sh <sha>`                                                    | planner-only, exit 0 |

## Failure proofs

| Check                                   | Fault injected | Test that observed it | Result  |
| --------------------------------------- | -------------- | --------------------- | ------- |
| _(filled in by each slice as it lands)_ | -              | -                     | pending |

## Observations

_(each slice appends its own baselines, counts and observed diagnostics here before handing over)_
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
`use-cases/save-plan.ts` it is `import { canEdit, type ProjectService } from '../service/project.service';`,
which becomes `import type { ProjectService } from '../service/project.service';`), add
`canEditProject` to the `@wbs/domain` import, rename every call, and update every `canEdit`
mention in JSDoc.

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

Call sites, all of the form `if (!canEdit(project, actorId))` → `if (!canEditProject(project, actorId))`:
`priority-band.service.ts:71`, `capacity.service.ts:84`, `step.service.ts:135` and `:240`,
`project.service.ts:238`, `work-item.service.ts:1847`, `:2747`, `:2832`, `:2887`, `:3679`, `:4589`,
and `use-cases/save-plan.ts:41` (`canEdit(found.project, input.actor.id)`).

`calendar-marker.service.ts:216` is the exception: after the rename it exceeds the print width, so
write it in the form Prettier produces, otherwise the pre-commit `format` hook refuses the commit.

```ts
if (!canEditProject(project, actorId)) return { ok: false, reason: 'forbidden', about: 'project' };
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
 * Both are repository ports, never services: Plan history is a feature-service
 * and K3 forbids it a repository of its own, so the host's composition root is
 * what hands it the two stores.
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

`module.ts`:

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

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { PlanHistoryExports, PlanHistoryRequirements } from './contract';
import { planHistoryModule } from './module';

/**
 * Installs {@link planHistoryModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else: this is the one place that sees a
 * bag, so no caller of Plan history can reach a private binding or a host key
 * through it. A host that forgets a requirement is refused by the type checker
 * before it is refused at runtime.
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

`module.test.ts`. The two casts are the boundary this packet's `verify.md` names: DI Bag refuses
both of these at the type level, and the runtime path they reach is the one an untyped or generated
host reaches, so each cast carries the comment above it.

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
   * The bag is not reachable from outside the module's composition.
   *
   * `installPlanHistory` is the only place that builds one, and it returns the
   * exported service alone. A host that installs the module itself gets the same
   * answer: `historySettings` was never published, so naming it is naming
   * nothing.
   */
  it('keeps its private bindings out of every host graph', () => {
    const host = DiBag.createBuilder()
      .installModule(planHistoryModule)
      .register({
        projectStore: DiBag.fromSyncFactory(() => inMemoryProjects()),
        planEventStore: DiBag.fromSyncFactory(() => inMemoryPlanEvents()),
      })
      .build();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('historySettings'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "historySettings" is not registered.');
  });

  /**
   * The module's label names the binding in a DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * runtime path is reached the way an untyped or generated host reaches it. The
   * message has to say which module asked, because `planEventStore` alone would
   * not.
   */
  it('names itself when a host omits a requirement', () => {
    const complete = DiBag.createBuilder()
      .installModule(planHistoryModule)
      .register({
        projectStore: DiBag.fromSyncFactory(() => inMemoryProjects()),
        planEventStore: DiBag.fromSyncFactory(() => inMemoryPlanEvents()),
      })
      .build();
    expect(complete.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PLAN_HISTORY_LABEL}/historySettings`,
    );

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

`README.md` states the module's purpose, its checks and its consumers, and says in its own words
that wiki registration is a later packet. Write it with **no** `<!-- module-index -->` block.

```md
# Plan history

This module is not yet registered as a wiki module: `docs/wiki-policy/policy.json` needs a
trusted boundary for `module.application.plan-history`, and
`apps/wiki/cli/src/policy/pilot-policy.test.ts` pins both the mapping length and the exact set of
discovered index identifiers. Adding the `module-index` block before those land fails that suite,
so registration is its own packet.

The plan's history, read. This is the first sealed DI Bag module in the core: `module.ts` seals
the graph and exports `history` alone, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two repository ports a host must supply. Private bindings are named
under the `application.plan-history` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
[the core project](../../../project.json).

## Consumers

[The composition root](../../compose.ts) installs the module; [the public
barrel](../../index.ts) and [the compatibility shim](../../service/history.service.ts) keep the
former `@wbs/core/service/history.service` names.
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
`libs/wbs/application/core/src/service/history.service.ts` keeps that path and becomes the shim
row; its `kind`, `capability` and `rationale` are replaced by `kind` and `disposition`. **No entry
is added** for `module/plan-history/plan-history.feature.ts`: its `.feature.ts` suffix declares its
kind, and `service-kinds.test.ts:259` refuses a second declaration (fault 5). The entry count goes
from 96 to 95.

```json
    {
      "path": "libs/wbs/application/core/src/service/history.service.ts",
      "kind": "support",
      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-history module directly"
    },
```

## 11. Stop conditions

Each is **false** on the real starting tree; if one is true, stop and report it.

- `openspec/changes/adopt-di-composition` already exists.
- `libs/wbs/domain/domain/src/project-ownership.ts` already exists.
- `libs/wbs/application/core/src/module/` already exists.
- `grep -c "canEdit" libs/wbs/application/core/src/service/project.service.ts` is not 3.
- `libs/wbs/application/core/src/service/history.service.ts` is not 40 lines.
- `bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain` does not exit 0 before any
  edit.
- A red checkpoint reports `0 tests ran`: the `-t` filter did not match. Anchor the joined
  `describe` and title, or use the title alone; never include Bun's printed `>`.
- An Nx target outlives the tool's wait. It is STILL RUNNING, not failed: poll it under a
  status-recording wrapper.

## 12. Ready to commit

Expected `git status --short --untracked-files=all` after all five slices, over owned paths only
(the planner may also have revised this packet file):

```text
 M docs/code-organization/kinds.json
 M libs/wbs/application/core/src/compose.ts
 M libs/wbs/application/core/src/index.ts
 M libs/wbs/application/core/src/service/calendar-marker.service.ts
 M libs/wbs/application/core/src/service/capacity.service.ts
 M libs/wbs/application/core/src/service/history.service.ts
 M libs/wbs/application/core/src/service/priority-band.service.ts
 M libs/wbs/application/core/src/service/project.service.ts
 M libs/wbs/application/core/src/service/step.service.ts
 M libs/wbs/application/core/src/service/work-item.service.ts
 M libs/wbs/application/core/src/service/broadcast.test.ts
 M libs/wbs/application/core/src/use-cases/save-plan.ts
 M libs/wbs/domain/domain/README.md
 M libs/wbs/domain/domain/src/index.ts
?? libs/wbs/application/core/src/module/
?? libs/wbs/domain/domain/src/project-ownership.test.ts
?? libs/wbs/domain/domain/src/project-ownership.ts
?? openspec/changes/adopt-di-composition/
```

`project.service.ts`, `work-item.service.ts` and `module.ts` are listed because their required
dated `Proof:` comments change them. Subjects are the five named in section 7. Never `--no-verify`.

## 13. Recorded assumptions

1. **The module identifier is `module.application.plan-history` and the DI Bag label is
   `application.plan-history`.** The batch-6 addendum gives a runtime word only to modules under an
   app; this module lives in a library, so it keeps ring then name, and the ring is `application`
   because the six existing identifiers in `docs/wiki-policy/modules.json` use exactly that grammar
   and `libs/wbs/application/core` is that ring. No existing identifier is touched.
2. **The private binding is `historySettings`, the module's construction options.** The map says
   Plan history has no private collaborator, so without this binding the module would have nothing
   to label and neither DI proof would be reachable. It is genuine wiring, not a placeholder: it is
   the value the module builds from its two requirements.
3. **`http/project.routes.ts` keeps importing `canEdit`.** It is delivery and the map treats
   delivery's direct resource imports as existing K2 debt; the compatibility alias keeps it valid.
4. **No per-module `tsconfig.json`.** The design's layout names one, but nothing in this repository
   runs an isolated type check yet, and adding a target would move
   `tools/tool-devsync/src/workspace-inventory.test.ts` counts. `tasks.md` carries it; this packet
   does not.
