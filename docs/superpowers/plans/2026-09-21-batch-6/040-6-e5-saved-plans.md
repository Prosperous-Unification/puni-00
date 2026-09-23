# 040.6 E5 — Saved plans as the sixth sealed module

| Field      | Value                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — tenth packet                              |
| Size class | S, in three slices                                                                                                                   |
| Slices     | 1 resolves task 1.7 and seals the module, 2 installs it from composition, 3 registers it in the wiki content-review pilot            |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` task 1.7 (resolved by deletion) and the sealing half of task 3.3                    |
| Planned on | 2026-09-23; every slice rehearsed end to end and committed on a throwaway branch cut from `474be8df0826bdd36ce4003adb1034b880d3fa6a` |

**Dates.** Every `Proof:` comment and `Landed`/`Sealed`/`Deleted`/`Withdrawn` note below carries the
planner's rehearsal date, 2026-09-23. Write the date you actually observe (`date -u +%F`) when you
add them; if it differs, change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e5-saved-plans.md` must
print an entry) and must descend from `474be8df0826bdd36ce4003adb1034b880d3fa6a` (main
`0ad6f109`, which carries packets A through E4, plus the batch-6 planning documents). Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e5-saved-plans 1 <packet-containing commit sha> --batch batch-6
```

Slices 2 and 3 resume the clone the previous slice built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e5-saved-plans 2 <the same sha> --resume --require-ancestor <slice 1 planner commit> --preserve evidence --batch batch-6
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-e5-saved-plans 3 <the same sha> --resume --require-ancestor <slice 2 planner commit> --preserve evidence --batch batch-6
```

No slice binds a port or needs the network, so **no slice needs `--network`**. No slice reads an
earlier attempt's evidence, only the committed tree, so **no slice needs `--seed`**.

## 1. Goal and non-goals

**Goal.** Seal Saved plans — the map's `Saved plans` feature row — as the sixth DI Bag module of
the backend core, following Plan import's and Authentication's pattern exactly: a module directory
with a README, a contract, a labelled `module.ts` and a composition `check.ts`, tested to prove that
the production installer hands out the contract's exports and nothing else and that the module's
label names a binding in a real DI failure message. The former files stay as compatibility
re-export shims; `compose.ts` installs the module instead of constructing `SavedPlanService` by
hand; `kinds.json` rows are rewritten in place; and the module is registered in the wiki
content-review pilot through its feature file's frozen-revision predecessor.

Before extraction, this packet resolves task 1.7 ("wire or delete `saved-plan-retry.ts`") by
**deletion** (section 4 gives the evidence).

Saved plans is **accountless-shared**: it stays on `CommonServices`, like Plan import, and unlike
Authentication. `common.plans` and `common.savedPlans` stay two names for **one** instance; slice 2
adds a test that watches that.

**Non-goals.**

- No change to what saving, reading, comparing, renaming or deleting does. The moved code differs
  from its source only in its import lines (section 10.2 is the exact diff).
- No fold of the rename and delete routes into use cases. `http/saved-plan.routes.ts` still reads the
  project and publishes `saved_plans_changed` inline for rename and delete (lines 222-243). Moving
  that into the feature is the map's K2 work for this row and is real additional scope. It is
  **why task 3.3 stays unticked** (slice 3 records a partial-landing note instead); E4's section 9
  set the same precedent for Authentication's throttle orchestration.
- No move of the four domain files (`saved-plan-default-name.ts`, `saved-plan-input.ts`,
  `saved-plan-quota.ts`, `saved-plan-schedule-body.ts`). The map sends them to the domain library,
  not to this module; they stay at `service/` and the moved code imports them one level deeper.
- No library version bump: `di-bag` stays 0.4.0. No frontend, gateway or MCP change. No change to
  the five earlier modules. No new checker: the three sideways rows use the existing identity-based
  mechanism in `ports/sideways-type-boundaries.test.ts`.
- No new retry. A caller that wants to retry a `snapshot_busy` save sends a new request, as today.

## 2. Read first

| File                                                                                                               | Why                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                       | Rules R1 to R5.                                                                                                                                                                                                                                       |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md` (line 48 and lines 143-173, 215, 232, 236) | Saved plans' row: feature files `saved-plan.service.ts` + `use-cases/save-plan.ts`; private support `saved-plan-integrity.ts`, `saved-plan-schedule.ts`; four domain moves; "`plans` and `savedPlans` are aliases … must not instantiate duplicates". |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md`, `040-6-e4-authentication.md`                  | The two precedents. E3 is the accountless-shared shape; E4 is the relocation, registration and legacy-pin shape.                                                                                                                                      |
| `libs/wbs/application/core/src/module/plan-import/`                                                                | The module files this packet's own `contract.ts`, `module.ts`, `check.ts` and `module.test.ts` mirror.                                                                                                                                                |
| `libs/wbs/application/core/src/service/saved-plan.service.ts` (996 lines), `use-cases/save-plan.ts` (60 lines)     | Slice 1 moves both. Read `SavedPlanServiceOptions` (lines 302-325) in full.                                                                                                                                                                           |
| `libs/wbs/application/core/src/compose.ts:216-245`                                                                 | The one `new SavedPlanService({...})` and the `plans: savedPlans, savedPlans` aliases slice 2 changes.                                                                                                                                                |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts:113-195`                                     | The row list and its JSDoc; slice 1 adds rows fifteen to seventeen.                                                                                                                                                                                   |
| `tools/tool-devsync/src/service-kinds.ts:15-20`                                                                    | `SERVICE_ROOTS`: `src/service`, `src/use-cases` and be-01's `src/service` must each be classified exactly once, and `src/module` is not scanned.                                                                                                      |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation" | The exact `jq -s -e` contract slice 3 uses.                                                                                                                                                                                                           |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `474be8df` on 2026-09-23.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The moved files' edges: `saved-plan.service.ts` imports four ports, the four domain-move files and the two private support files; `save-plan.ts` imports `AuthenticatedUser` from `@wbs/contracts`, `Broadcaster` from `ports/project-event.ts`, `ProjectService` (a resource, a permitted feature-to-resource edge) and the service; `saved-plan-schedule.ts` imports `NO_DEADLINES`/`slicesOf` from `service/work-item.service.ts` (resource). No file imports Authentication or `http/endpoint.ts`.                                                                                               | `grep -n "from '"` over each file.                                |
| `use-cases/save-plan.ts` has **no** test file of its own. Its callers are tested by `use-cases/admission.test.ts:12` and `compose.test.ts:19`, both through the relative path, and `libs/wbs/application/core/testing/portable-composition.ts:10` bundles it. `saved-plan-integrity.ts` has `saved-plan-integrity.test.ts` (9 tests); `saved-plan-schedule.ts` has none in core (be-01's `saved-plan-schedule*.db.test.ts` import it through the be-01 shim).                                                                                                                                        | `ls`; `git grep -n "save-plan'"`.                                 |
| Every be-01 saved-plan shim (`apps/wbs/be-01/src/service/saved-plan*.ts`) is `export * from '@wbs/core';` — the whole barrel, not a deep import — so no be-01 file names a moved path.                                                                                                                                                                                                                                                                                                                                                                                                               | `head -1` of each.                                                |
| Deep importers of the four old paths inside core: `service/saved-plan.service.ts` ← `http/saved-plan.routes.ts:16`, `index.ts:105`, `service/service-boundaries.test.ts:41`; `service/saved-plan-integrity.ts` ← `http/saved-plan.routes.ts:17`, `index.ts:108`; `service/saved-plan-schedule.ts` ← `index.ts:111`, `service/service-boundaries.test.ts:40`; `use-cases/save-plan.ts` ← `http/saved-plan.routes.ts:18`, `index.ts:119`, `compose.test.ts:19`, `use-cases/admission.test.ts:12`, `libs/wbs/application/core/testing/portable-composition.ts:10`. So all four stay as real shim files. | `git grep` at `474be8df`.                                         |
| `compose.ts:216` builds `SavedPlanService` once and `compose.ts:244-245` hands the same object out as `plans` and `savedPlans`, both on `CommonServices` (`compose.ts:140-141`). No other construction exists in core.                                                                                                                                                                                                                                                                                                                                                                               | Read.                                                             |
| **K3 debt exists and is disclosed, not claimed absent.** `SavedPlanServiceOptions.plans` is `SavedPlanStore` (`ports/saved-plan-store.ts`) and `.capture` is `SavedPlanCaptureStore` (`ports/saved-plan-capture-store.ts`), both repository ports the service calls directly. `contract.ts` (section 10.4) records it and points at task 7.4.                                                                                                                                                                                                                                                        | `saved-plan.service.ts:302-325`.                                  |
| `kinds.json` has `K=95` entries at `474be8df`. The rows this packet touches: be-01 `saved-plan-retry.ts` (line 163) and core `saved-plan-retry.ts` (line 424), removed in slice 1; core `saved-plan-integrity.ts`, `saved-plan-schedule.ts`, `saved-plan.service.ts` and `use-cases/save-plan.ts`, rewritten to shim rows in slice 2. After slice 1, 93.                                                                                                                                                                                                                                             | `python3` count; `grep -n`.                                       |
| The frozen-revision predecessor exists: `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/saved-plan.service.ts` prints `100644 blob f3a12fbc600b51ff3794e3593c4a6634960198d9`. `use-cases/save-plan.ts`, `saved-plan-integrity.ts` and `saved-plan-schedule.ts` also existed then (blobs `040f8b3e…`, `6170e328…`, `bbf298eb…`) but, following Realtime's and Authentication's precedent (one predecessor per module directory), only the feature file is named.                                                                                                       | `git ls-tree` at the frozen revision.                             |
| The wiki pilot holds `M=10` modules and `B=10` boundaries. `module.domain.saved-plan` already exists but covers `libs/wbs/domain/domain/src/saved-plan` and binds `libs/domain/src/saved-plan`; the new `module.application.saved-plans` overlaps neither. Its sorted place is between `module.application.realtime` and `module.application.use-cases`.                                                                                                                                                                                                                                             | `python3` over `docs/wiki-policy/modules.json` and `policy.json`. |
| The legacy pin (`tools/tool-devsync/src/repo-namespacing-handoff.test.ts:612-823`) stands at `historical policy selector or baseline` 47, occurrences 265, digest `3eca3cf1a2f8d1703b42edfd40be279a5a144034c000a812d7b70eb8b2cfef62`; slice 3's registration moves it (section 6, row 18).                                                                                                                                                                                                                                                                                                           | Read; the test passes at `474be8df`.                              |
| The sideways checker does not follow a shim's re-export on its module-specifier route, but its identifier route does: a named `AuthenticatedUser` import through `service/auth.service` is reported twice, once against the shim and once against `module/authentication/authentication.feature.ts`. A **bare** side-effect import reports only the specifier, so section 6 rows 9-11 use bare imports to prove each new row alone.                                                                                                                                                                  | Rehearsed; both forms' output kept in section 6.                  |

## 4. Task 1.7 resolution — delete, not wire

Task 1.7 (`openspec/changes/adopt-di-composition/tasks.md:37`) reads "Wire or delete
`saved-plan-retry.ts` under the accepted saved-plans obligation." This packet deletes it.

**Fact 1 — no production caller.** At `474be8df`, `git grep -n "saveWithBoundedRetry\|savedPlanRetryDelayMs\|SAVED_PLAN_SAVE_BUDGET_MS\|saved-plan-retry" -- apps libs tools`
names only:

- `libs/wbs/application/core/src/service/saved-plan-retry.ts` itself (lines 10, 29, 80);
- its unit test `libs/wbs/application/core/src/service/saved-plan-retry.test.ts` (6 tests);
- the barrel line `libs/wbs/application/core/src/index.ts:110`;
- the list entry `libs/wbs/application/core/src/service/service-boundaries.test.ts:38`;
- be-01's `apps/wbs/be-01/src/service/saved-plan-retry.db.test.ts:24` (1 test), which imports it
  through be-01's shim `apps/wbs/be-01/src/service/saved-plan-retry.ts:1`
  (`export * from '@wbs/core';`).

No route, use case, frontend, gateway or MCP file calls it. `kinds.json:424`'s own rationale says
the same: "no route ever called it".

**Fact 2 — no archived specification requires it.** `grep -rn -i "caller retry\|bounded retry\|saveWithBoundedRetry\|saved-plan-retry" openspec/specs`
prints nothing (exit 1). The only normative text is in the **unarchived**
`openspec/changes/saved-plans/specs/wbs-domain/spec.md`: lines 160-163 say a caller retry "SHALL be
allowed to succeed" as a fresh save, and the scenario at lines 190-194 describes what such a retry
finds. Both are permissions, not obligations to ship a retry helper, and both hold with the helper
gone: `SavedPlanService.save` takes its read snapshot and `created_at` at its own top on every call,
so any later save is a fresh one. `openspec/changes/saved-plans/design.md:130-133` likewise speaks of
"a bounded retry the caller **may** make". **Residual:** after the deletion, the scenario
`a retry after the rival committed` (`spec.md:190-194`) is backed by no test; a caller's retry is a
fresh `save`, so the scenario holds by construction and stays in the spec as the caller's permission.

**Why not wire it.** Wiring would make a contended save wait up to five seconds in the save route
before answering `snapshot_busy`: an observable latency and behaviour change, which the repository
rules route through OpenSpec, and which no accepted task asks for. Deletion changes no observable
behaviour, because nothing ran the code. It is reversible from Git history.

**What deletion costs, stated.** `openspec/changes/saved-plans/tasks.md:228-265` (task 4.5, ticked)
records the retry as landed, with a negative proof in the deleted database test. Slice 3 appends a
"Withdrawn" note to that task (section 10.15) rather than leaving it claiming code that no longer
exists. Task 4.5's other half, `busy_timeout` 0 and the typed refusal, is unchanged and still tested
by `libs/wbs/adapters/store-sqlite/src/saved-plan-busy.db.test.ts` and
`saved-plan-concurrency.db.test.ts`. Neither exercises a save that acquires after the rival
committed, so the deleted database test was that scenario's only test; the "Withdrawn" note says so,
and says that `saved-plans/tasks.md:228-230` and `design.md:130-133` still describe the bounded retry.

**Authorised deletions (slice 1, filesystem `rm`, the planner stages them):**

1. `libs/wbs/application/core/src/service/saved-plan-retry.ts`
2. `libs/wbs/application/core/src/service/saved-plan-retry.test.ts`
3. `apps/wbs/be-01/src/service/saved-plan-retry.ts`
4. `apps/wbs/be-01/src/service/saved-plan-retry.db.test.ts`

plus, by section 10.5's diff: the barrel line, the `'saved-plan-retry'` entry in
`service-boundaries.test.ts` (an existing test's list; the edit is prescribed here exactly, because
its `existsSync` assertion would otherwise fail on a deleted file), and both `kinds.json` rows (95 →
93). `apps/wbs/be-01/src/testing/saved-plan-lock-holder.ts` is **kept**: the store-sqlite busy and
concurrency tests still spawn it.

## 5. File plan

| Path (under `libs/wbs/application/core/src/` unless shown)                                                                     | Slice   | Action                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `module/saved-plans/module.test.ts`                                                                                            | 1       | create **first**, for the red (10.1)                                                                          |
| `module/saved-plans/saved-plans.feature.ts`                                                                                    | 1       | `cp` from `service/saved-plan.service.ts`, then 10.2's import diff                                            |
| `module/saved-plans/save-plan.ts`                                                                                              | 1       | `cp` from `use-cases/save-plan.ts`, then 10.2's import diff                                                   |
| `module/saved-plans/saved-plan-integrity.ts`                                                                                   | 1       | `cp` from `service/saved-plan-integrity.ts`, then 10.2's import diff                                          |
| `module/saved-plans/saved-plan-integrity.test.ts`                                                                              | 1       | **`mv`** from `service/saved-plan-integrity.test.ts`, then 10.2's import diff (old path deleted, not shimmed) |
| `module/saved-plans/saved-plan-schedule.ts`                                                                                    | 1       | `cp` from `service/saved-plan-schedule.ts`, then 10.2's import diff                                           |
| `module/saved-plans/contract.ts`, `module.ts`, `check.ts`                                                                      | 1       | create (10.4)                                                                                                 |
| `module/saved-plans/README.md`                                                                                                 | 1, 3    | slice 1 creates it (10.4); slice 3 replaces it (10.13)                                                        |
| `service/saved-plan.service.ts`, `service/saved-plan-integrity.ts`, `service/saved-plan-schedule.ts`, `use-cases/save-plan.ts` | 1       | content replaced by the shims of 10.3                                                                         |
| the four authorised deletions of section 4                                                                                     | 1       | `rm`                                                                                                          |
| `index.ts`                                                                                                                     | 1, 2    | slice 1 drops the retry export (10.5); slice 2 adds two module exports (10.9)                                 |
| `service/service-boundaries.test.ts`                                                                                           | 1       | drop `'saved-plan-retry'` (10.5)                                                                              |
| `docs/code-organization/kinds.json`                                                                                            | 1, 2    | slice 1 removes two rows (10.5, 95 → 93); slice 2 rewrites four rows in place (10.10, 93 unchanged)           |
| `ports/sideways-type-boundaries.test.ts`                                                                                       | 1       | three rows and one JSDoc paragraph (10.6), then three Proof comments (10.7)                                   |
| `compose.test.ts`                                                                                                              | 2       | one new test (10.8), then its Proof comment (10.11)                                                           |
| `compose.ts`                                                                                                                   | 2       | install through `installSavedPlans` (10.9)                                                                    |
| `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`                                                                | 3       | one row, one boundary (10.12)                                                                                 |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                                                                | 3       | one `pilotPaths` entry (10.12)                                                                                |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                      | 3       | legacy re-pin (10.14), then its Proof comment                                                                 |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                               | 3       | tick 1.7, note 3.3 (unticked), extend 7.5 (10.15)                                                             |
| `openspec/changes/saved-plans/tasks.md`                                                                                        | 3       | "Withdrawn" note on 4.5 (10.15)                                                                               |
| `openspec/changes/adopt-di-composition/verify.md`                                                                              | 1, 2, 3 | each slice appends its own observations                                                                       |

**The module directory holds exactly ten files** after slice 1, and still ten after slice 3:
`README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `save-plan.ts`,
`saved-plan-integrity.test.ts`, `saved-plan-integrity.ts`, `saved-plan-schedule.ts`,
`saved-plans.feature.ts`. Every section below that counts them says ten; the README index names the
nine that are not the README.

**Neighbours.** No other batch-6 packet owns these paths. `tasks.md` has been touched by every earlier
040.6 packet; this packet's edits are to lines no one else edits. Section 12's hand-over lists are
scoped to each slice's own `base`, so the planner's own commits cannot break them.

## 6. Rehearsed observations

Every row was produced on the throwaway branch in a private worktree of `474be8df`, against the
exact listings of section 10, and restored with `cp` + `cmp` before the next.

| #   | Where                                                                   | Fault injected                                                                                    | Test that observed it                                                                              | Literal fragment observed                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | slice 1 red, unchanged tree                                             | none; `check.ts` does not exist                                                                   | `module.test.ts`                                                                                   | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                        |
| 2   | slice 1 green                                                           | none                                                                                              | `bun test ./libs/wbs/application/core/src/module/saved-plans/`                                     | `16 pass`, `0 fail`, `27 expect() calls`, 2 files; `wbs-core` lint and typecheck exit 0 on the first run                                                                                                                                                     |
| 3   | `module.ts`, the `buildModule` key tuple                                | `['savedPlans', 'savedPlanOptions']`                                                              | `keeps its private bindings out of a host graph`, plus the two label tests                         | `Received function did not throw`; labels `[ "savedPlans", "savedPlanOptions", … ]`; message `Cannot resolve "savedPlanOptions"`. `4 pass`, `3 fail`                                                                                                         |
| 4   | `module.ts`, the label argument alone                                   | `.buildModule(['savedPlans'])`                                                                    | `labels its private bindings with the module name`, `names itself when a host omits a requirement` | `Expected to contain: "application.saved-plans/savedPlanOptions"`; `5 pass`, `2 fail`; the private-binding test stays green                                                                                                                                  |
| 5   | `module.ts`, the `savedPlanOptions` factory's quota spread              | the line `...(quota === undefined ? {} : { quota }),` deleted                                     | `passes a supplied quota through to the installed feature`                                         | `Expected: "refused"`, `Received: "saved"`; `6 pass`, `1 fail`                                                                                                                                                                                               |
| 6   | `check.ts`, the single `return`                                         | `const exposed = { savedPlans: bag.resolve('savedPlans'), bag };` then `return exposed;`          | `exposes only the contract exports from its installer`, first assertion                            | received keys `"savedPlans", + "bag"`; `6 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                                                                       |
| 7   | `check.ts`, the same `return`                                           | `savedPlans: Object.assign(bag.resolve('savedPlans'), { resolve: bag.resolve.bind(bag) })`        | the same test, second assertion                                                                    | `Expected: true`, `Received: false`; `6 pass`, `1 fail`; typecheck exit 0                                                                                                                                                                                    |
| 8   | (evidence for section 3, not a proof) `module/saved-plans/save-plan.ts` | `import type { AuthenticatedUser as ShimUser } from '../../service/auth.service';` prepended      | `rejects the checked sideways-type import routes`                                                  | two violations: `'../../service/auth.service' reaches service/auth.service.ts` **and** `AuthenticatedUser reaches module/authentication/authentication.feature.ts` — why rows 9-11 use bare imports                                                          |
| 9   | `module/saved-plans/save-plan.ts`                                       | `import '../../service/auth.service';` prepended                                                  | same test                                                                                          | exactly `"module/saved-plans/save-plan.ts: '../../service/auth.service' reaches service/auth.service.ts"`; `0 pass`, `1 fail`                                                                                                                                |
| 10  | the same file, independently                                            | `import '../authentication/authentication.feature';` prepended                                    | same test                                                                                          | exactly `"module/saved-plans/save-plan.ts: '../authentication/authentication.feature' reaches module/authentication/authentication.feature.ts"`; `0 pass`, `1 fail`                                                                                          |
| 11  | the same file, independently                                            | `import '../../http/endpoint';` prepended                                                         | same test                                                                                          | exactly `"module/saved-plans/save-plan.ts: '../../http/endpoint' reaches http/endpoint.ts"`; `0 pass`, `1 fail`                                                                                                                                              |
| 12  | slice 2, before `compose.ts` changes                                    | none; `build:portable` on the slice-1 tree                                                        | `grep -c "application.saved-plans" dist/libs/wbs/application/core/portable-composition.js`         | no match: `grep` exit 1, count `0` — the composition root does not reach the module yet                                                                                                                                                                      |
| 13  | slice 2 green                                                           | `compose.ts` installs the module                                                                  | the same `grep -c`                                                                                 | `1`                                                                                                                                                                                                                                                          |
| 14  | `compose.ts`, the `plans:` line of `common`                             | `plans: savedPlans,` replaced by a second `installSavedPlans({...same six fields...}).savedPlans` | `composes one Saved plans instance behind both the plans and savedPlans names`                     | `expect(received).toBe(expected)` with two `SavedPlanService` objects; `0 pass`, `1 fail`, `8 filtered out`; typecheck exit 0                                                                                                                                |
| 15  | slice 3, `modules.json` row alone                                       | none; a genuine partial registration                                                              | `pins exact pre-index tuples and passes observe lint from external trust`                          | `pilot-policy.test.ts:375`, `expect(modules.length).toBe(policy.boundaries.length)`: `Expected: 10`, `Received: 11`; `0 pass`, `1 fail`, `22 expect() calls`                                                                                                 |
| 16  | slice 3, `policy.json` boundary added, README not yet in `pilotPaths`   | none                                                                                              | same test                                                                                          | `pilot-policy.test.ts:412`: `Expected: true`, `Received: false`; `0 pass`, `1 fail`, `26 expect() calls` (parity and the structural baseline now pass)                                                                                                       |
| 17  | slice 3 green                                                           | `pilotPaths` entry and the final README added                                                     | the whole `pilot-policy.test.ts`                                                                   | `21 pass`, `0 fail`, `298 expect() calls` (baseline `21`/`0`/`297`: one more per-boundary assertion, eleven boundaries instead of ten)                                                                                                                       |
| 18  | slice 3, legacy pin unchanged, after registration                       | none; the registration alone moves it                                                             | `every legacy source occurrence and relevant text family is pinned`                                | `historical policy selector or baseline` `47` → `49`, `occurrences` `265` → `267`, digest `3eca3cf1…` → `86721c9c2457e04146bd4db56db16869936be5a012fddc671bf2e39989c23d0f`, `unclassified` still `[]`; `Expected  - 3` / `Received  + 3`; `0 pass`, `1 fail` |

Each module assertion has its own mutation: rows 3 and 4 are independent (the label fault leaves the
private-binding test green); rows 6 and 7 split the installer test's two assertions; row 5 is the
only fault the optional quota branch has. Rows 9-11 each produce **exactly one** violation, naming
exactly one of the three new rows, so each row is proven alone. Row 14 is the alias invariant's
production-path negative.

**No compile red in slice 2, on purpose.** E4's slice 2 changed a type (the throttle moved from
`CommonServices` to `AccountfulServices`), so a `@ts-expect-error` could go red on the unchanged
tree. Slice 2 here changes no type: `plans` and `savedPlans` keep type `SavedPlanService` on
`CommonServices`. A `@ts-expect-error` would have nothing true to assert. Slice 2's observed red is
row 12, the composition bundle that does not yet contain the module, and its new check (the alias
test) gets row 14 as its negative.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses with
`if cmd >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"`;
never read a status through `tee`, never `|| true`. Start lint, typecheck, build and format targets
the same way and poll their logs (preamble rule 19). Scratch lives only under `"$TMPDIR"`, faults and
failing output under `"$TMPDIR/evidence"`; `verify.md` cites basenames only. You never run `git add`,
`git commit` or `git mv`: moves and deletions are `mv`, `cp` and `rm`, and the planner stages them. A
fault is injected by editing the file, observed, then restored with `cp` from a `"$TMPDIR"` copy and
proved with `cmp`. Every step 0 opens with `base=$(git rev-parse HEAD)` and an empty-status check;
every count compared (`K`, `C`, `F`, `E`, `EF`, `M`, `B`, `T`, `TF`, `P`, `N`) is assigned in the
slice that compares it.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`.

### Slice 1 — Resolve task 1.7 and seal Saved plans as a DI Bag module

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e libs/wbs/application/core/src/module/saved-plans && echo "gate: module absent"
for f in libs/wbs/application/core/src/service/saved-plan-retry.ts \
  libs/wbs/application/core/src/service/saved-plan-retry.test.ts \
  apps/wbs/be-01/src/service/saved-plan-retry.ts \
  apps/wbs/be-01/src/service/saved-plan-retry.db.test.ts; do test -f "$f"; done
wc -l < libs/wbs/application/core/src/service/saved-plan.service.ts
wc -l < libs/wbs/application/core/src/use-cases/save-plan.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, the two gate lines, `996`, `60`, then a number: call it `K` (observed `95`). Then
record, before any edit:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
log="$TMPDIR/evidence/slice1-core-gate-baseline.log"
if NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
log="$TMPDIR/evidence/slice1-be01-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
log="$TMPDIR/evidence/slice1-core-baseline.log"
if (cd libs/wbs/application/core && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test src) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
log="$TMPDIR/evidence/slice1-be01-saved-baseline.log"
if (cd apps/wbs/be-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test $(ls ./src/service/saved-plan*.db.test.ts ./src/controller/saved-plan*.test.ts)) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
```

The typecheck runs first on purpose (addendum 14): the core baseline then already sees any `dist/`
the typecheck left. Expect `exit=0` in all four logs. Call the core pass count `C` and file count `F`
(observed `570 pass` over 59 files); call the be-01 saved-plan pass count `E` and file count `EF`
(observed `124 pass` over 13 files). This slice ends at `C + 1` over `F` (module.test.ts adds 7
tests and one file; the deleted retry unit test removes 6 tests and one file; the integrity test's 9
move and stay counted) and at `E - 1` over `EF - 1` (the deleted database test held one test).

**Steps — test first, then the implementation, in this one slice.**

1. `mkdir -p libs/wbs/application/core/src/module/saved-plans`, create `module.test.ts` there from
   10.1 verbatim, and run `bun test ./libs/wbs/application/core/src/module/saved-plans/module.test.ts`.
   Expect row 1's red (`Cannot find module './check'`, `0 pass`, `1 fail`, `1 error`). Save the log.
   This red is evidence, not a commit.
2. Resolve task 1.7: `rm` the four files section 4 lists, then apply 10.5's diff (barrel line,
   `service-boundaries.test.ts` entry, two `kinds.json` rows).
3. Move the code. From the repository root:

```sh
set -euo pipefail
c=libs/wbs/application/core/src
cp "$c/service/saved-plan.service.ts" "$c/module/saved-plans/saved-plans.feature.ts"
cp "$c/use-cases/save-plan.ts" "$c/module/saved-plans/save-plan.ts"
cp "$c/service/saved-plan-integrity.ts" "$c/module/saved-plans/saved-plan-integrity.ts"
cp "$c/service/saved-plan-schedule.ts" "$c/module/saved-plans/saved-plan-schedule.ts"
mv "$c/service/saved-plan-integrity.test.ts" "$c/module/saved-plans/saved-plan-integrity.test.ts"
```

Then apply 10.2's diff (import lines only, five files), and replace the four old files' content
with 10.3's shims. The `mv` is an **authorised deletion** of the old test path: its 9 tests must
exist at exactly one path, and no file imports a test.

4. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from 10.4 verbatim (no `Proof:`
   comments yet; the README has no `module-index` block and no "Wiki registration" section yet).
5. `bun test ./libs/wbs/application/core/src/module/saved-plans/` → exit 0, `16 pass`, `0 fail`,
   `27 expect() calls` across 2 files (row 2).
6. `wbs-core` lint and typecheck, and `wbs-be-01:typecheck`, each under the status wrapper → exit 0.
   Only rule-17 diagnostics (`simple-import-sort/*`, `prettier/prettier`) may be fixed with
   `bunx eslint --fix` on files this slice owns; anything else is a stop.
7. Apply 10.6's diff to `ports/sideways-type-boundaries.test.ts` (three rows plus a JSDoc paragraph;
   the existing rows are unchanged). `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`
   → `1 pass`.
8. The negatives of section 6, **one at a time, each restored and `cmp`-proved before the next**:
   rows 3, 4, 5 (`module.ts`), 6, 7 (`check.ts`) against
   `bun test ./libs/wbs/application/core/src/module/saved-plans/module.test.ts`; rows 9, 10, 11
   (each a single line prepended to `module/saved-plans/save-plan.ts`) against the sideways suite.
   For rows 6 and 7 also run `wbs-core:typecheck` on the mutated tree and record its exit 0. Save each
   mutation as a patch and each failing output beside it. Row 8 is not required.
9. Only now apply 10.7's diff: the five observed `Proof:` comments (three in `module.ts`, two in
   `check.ts`) and the three in the sideways test's JSDoc. Change the date only if yours differs, and change a
   fragment only if what you saw differs (then record the difference).
10. Planner-only, and why: `tools/tool-devsync/src/service-kinds.test.ts` compares `kinds.json` to
    `git ls-files`, which still lists the four deleted files until the planner stages the deletions.
    Run this filesystem substitute instead, and expect `93 []`:

```sh
python3 -c "import json,os;e=json.load(open('docs/code-organization/kinds.json'))['entries'];print(len(e),[x['path'] for x in e if not os.path.isfile(x['path'])])"
```

11. Closing checks, each under the status wrapper: `(cd libs/wbs/application/core && bun test src)` →
    exit 0, `C + 1` passes over `F` files (observed `571` over 59); be-01 saved-plan files as in step
    0 → `E - 1` over `EF - 1` (observed `123` over 12); `wbs-core` lint and typecheck → exit 0;
    `wbs-be-01:typecheck` → exit 0; `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
12. Append to `openspec/changes/adopt-di-composition/verify.md` a `### Saved plans, Slice 1 — <date>`
    section: `base`, `K`, `C`/`F`, `E`/`EF`, the red, the green, every fault of rows 3-7 and 9-11 with
    its fragment and evidence basenames, the step-10 substitute, and one line stating the preserved K3
    debt (`plans` and `capture` are repository ports, tracked under 7.4). Then rerun the format check.
13. Hand-over: section 12's slice-1 modified and deleted paths must equal
    `git diff --name-only "$base"`, and its new paths `git ls-files --others --exclude-standard`.

Planner commit: `refactor(core): seal Saved plans as a DI Bag module and delete the unadopted save retry`.
The planner stages with `git add -A` over exactly section 12's paths; Git's rename detection reports
`saved-plan-integrity.test.ts` as a rename. The planner then runs `tool-devsync:test` whole (it
covers `service-kinds.test.ts`) and checks the moved code as in section 8.

### Slice 2 — Compose Saved plans from its sealed module

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test -f libs/wbs/application/core/src/module/saved-plans/module.ts && echo "gate: slice 1 landed"
grep -cF "new SavedPlanService({" libs/wbs/application/core/src/compose.ts
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect `base=…`, both gates, `1`, then `K` (observed `93`). Record, before any edit, the be-01
typecheck and the core baseline exactly as slice 1's step 0 does (`slice2-…` log names), and call
the pass and file counts `C` and `F` (observed `571` over 59). This slice ends at `C + 1` over `F`:
one new test inside the existing `compose.test.ts`. Then record the composition bundle's red:

```sh
set -euo pipefail
log="$TMPDIR/evidence/slice2-portable-build-baseline.log"
if NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
bundle=dist/libs/wbs/application/core/portable-composition.js
test -f "$bundle"
if count=$(grep -c "application.saved-plans" "$bundle"); then echo "count=$count"; else status=$?; test "$status" -eq 1; echo "count=0 (grep exit 1)"; fi
```

Expect `exit=0` in the log and `count=0 (grep exit 1)` (row 12). A missing bundle stops at `test -f`.

1. Apply 10.8's diff (the alias test only) and run
   `bun test ./libs/wbs/application/core/src/compose.test.ts` → `9 pass`, `0 fail`. It is green on
   the unchanged `compose.ts`, because the aliases already share one instance; step 4 proves it can
   fail.
2. Apply 10.9's diff: `compose.ts` imports `installSavedPlans` and the `SavedPlanService` **type**
   from the module and replaces `new SavedPlanService({` with `const { savedPlans } = installSavedPlans({`
   — the six fields unchanged, the aliases unchanged; `index.ts` gains two export lines.
3. Apply 10.10's diff to `kinds.json` (four rows rewritten in place; count unchanged).
4. Row 14: in `compose.ts`, replace the line `    plans: savedPlans,` inside `const common` with the
   mutation of section 6 row 14 (the full replacement text is in 10.11's note), run the named test
   with `-t "composes one Saved plans instance behind both the plans and savedPlans names"`, record
   `0 pass`, `1 fail`, restore, `cmp`, rerun green. Then apply 10.11's Proof diff.

| Command (each under the status wrapper)                                                         | Expect                                            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache`      | exit 0                                            |
| `bun test ./libs/wbs/application/core/src/compose.test.ts`                                      | exit 0, `9 pass`, `0 fail`                        |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`, then the `grep -c` above | exit 0, then `count=1` or more (row 13)           |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                               | exit 0                                            |
| `(cd libs/wbs/application/core && bun test src)`                                                | exit 0, `C + 1` over `F` (observed `572` over 59) |
| the `kinds.json` count, and slice 1's step-10 substitute                                        | `K` unchanged; `93 []`                            |
| `grep -cF "new SavedPlanService({" libs/wbs/application/core/src/compose.ts`                    | `0` (use the `if count=$(…)` form: grep exits 1)  |

Append `### Saved plans, Slice 2 — <date>` to `verify.md`: `base`, `K`, `C`/`F`, the bundle red and
green, the alias test green on the unchanged root, row 14 with evidence, the closing counts; then
`GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): compose Saved plans from its sealed module`.

### Slice 3 — Register Saved plans in the wiki content-review pilot and record the tasks

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- libs/wbs/application/core/src/module/saved-plans/module.ts
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/saved-plan.service.ts
```

Expect `base=…`, the gate, a commit hash, `M` and `B` (observed `10` and `10`), then exactly
`100644 blob f3a12fbc600b51ff3794e3593c4a6634960198d9	libs/core/src/service/saved-plan.service.ts`.
If that line prints nothing, stop. Then, before any edit, each under the status wrapper:

```sh
NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all. Call the pilot file's tests, failures and `expect()` calls `T`, `TF`, `P`
(observed `21`, `0`, `297`; the run takes about 340 seconds). The legacy pin passes
(`1 pass`). Run the OpenSpec validation standard block and call `passed` `N` (observed `114`).

**Registration, in the order it must be observed.** The pilot suite clones committed `HEAD` and
overlays only `pilotPaths` from the working tree (`pilot-policy.test.ts:30-47`); slices 1 and 2 are
committed, so the module's files are in `HEAD`.

1. Apply 10.12a (`modules.json`: one row, sorted before `module.application.use-cases`). Run
   `(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples")`
   → the PARITY red (row 15).
2. Apply 10.12b (`policy.json`: one boundary after `boundary.application.authentication`). Rerun the
   same command → the DISCOVERED-INDEX red (row 16).
3. Apply 10.12c (`pilotPaths` entry) and replace the module README with 10.13 verbatim. Rerun the
   whole pilot file → green (row 17): `T` tests, `TF` failures, `P + 1` assertions.
4. Rerun the legacy-pin test **with the pin unchanged** → red (row 18). Save it. Only then apply
   10.14's diff (the numbers), rerun → `1 pass`, and then apply 10.14's Proof diff. No other pinned
   literal in that file may move; if one does, stop.
5. Apply 10.15's two diffs (`adopt-di-composition/tasks.md`: tick 1.7, note 3.3 **unticked**, extend
   7.5; `saved-plans/tasks.md`: the 4.5 "Withdrawn" note).
6. Rerun step 0's run-many typecheck, `twilight-burokrat:lint:source`, `tool-devsync:lint` and the
   legacy-pin test → exit 0 (the pilot suite already reran green in step 3); `wbs-core:typecheck` →
   exit 0; the OpenSpec block → `passed` `N`, `failed` `0`.
7. Append `### Saved plans, Slice 3 — <date>` to `verify.md`: `base`, `M`, `B`, the frozen tuple,
   rows 15-18 with evidence basenames, `T`/`TF`/`P` before and after, the four checks, `N`. Then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `docs(core): register Saved plans' sealed module in the wiki content-review pilot`.

**Planner-only, after this commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 3 commit>`
is **index validation** (`checkIndexes`, imported at `apps/wiki/cli/src/cli.ts:19` and called at `:186`): it shows the index is
discovered with its members. It is **not** the `MOD-LAYOUT` rule (`moduleLayoutObservations`,
`apps/wiki/cli/src/rules/kinds.ts:137`), which it does not invoke. Rehearsed against the throwaway slice-3 commit `39ae91f8`: 14 indexes, one with `"moduleId": "module.application.saved-plans"`, all nine non-README files as `members`, the six declared consumers, and no `reviewDebt` entry naming it.

## 8. Planner-only checks

| Check                                                                                                                                                                                                   | Why the planner's                                                      | Observed on the rehearsed tree                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Moved-code identity: for each of 10.2's five files, copy the `$base` version of the source path to a scratch file, apply that file's section of 10.2 to it, and `cmp` it with the committed module file | Proves the moved bodies differ only in 10.2's import lines             | all five `cmp` clean (the extraction script of section 15 does the same)                              |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged                                                                            | Writes Git objects; `service-kinds.test.ts` needs the deletions staged | slices 1, 2 and 3: `366 pass`, `0 fail`, 25 files, through `planner-commit.sh`                        |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                                                                                                                                                            | Opens SQLite databases as a whole target                               | **not run** by the planning author; expect the step-0 total minus the one deleted database test       |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                                                                                                                                                    | Playwright; no browser in the sandbox                                  | **not run**                                                                                           |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test` and `:test:package --skip-nx-cache`                                                                                                                | Whole listener suite; package suite listens                            | **not run** (only `pilot-policy.test.ts` was run, section 6)                                          |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                              | Host-wide heavy lock                                                   | **not run**                                                                                           |
| Rows 6 and 7's `wbs-core:typecheck` on the mutated `check.ts`                                                                                                                                           | Still required of the executor (slice 1 step 8)                        | exit 0 both times in the author's rehearsal; review round 1 did **not** replay these two runs         |
| `check-indexes committed` (slice 3 note)                                                                                                                                                                | Index validation, not MOD-LAYOUT                                       | 14 indexes; `module.application.saved-plans` with 9 members and 6 consumers; no review debt naming it |

This table supplements the batch-1 README's "Integration verification" matrix.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What the next 040.6 packets should be

1. **Saved plans' K2 fold.** Moving rename's and delete's project read and `saved_plans_changed`
   publication out of `http/saved-plan.routes.ts` into the module (one `SavedPlans` feature contract
   for the six operations, the map's line 48) is what task 3.3 still owes. It changes the routes'
   collaborators, so it needs its own packet with route-level tests; tick 3.3 there.
2. **Optimization** stays last (tasks 1.5 and 1.6's cache-key port are still open) and lives under
   `apps/wbs/be-01`, so its identifier is `module.backend.optimization`.
3. **Domain moves.** The four saved-plan domain files move to `libs/wbs/domain` in their own packet;
   the Saved plans module then imports them from `@wbs/domain`.

## 10. Exact content

### 10.1 `module/saved-plans/module.test.ts` (slice 1 step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import type { Digest } from '../../ports/runtime';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installSavedPlans } from './check';
import { SAVED_PLANS_LABEL } from './contract';
import { savedPlansModule } from './module';
import { savePlan } from './save-plan';

const STAMP_AT = 1_757_851_200_000;

/** Deterministic and non-cryptographic: these tests are about the graph, not SHA-256. */
const lengthDigest: Digest = {
  sha256: (bytes) => Promise.resolve(`length:${String(bytes.length)}`),
};

const owner = { id: 'owner', username: 'owner', scopes: ['read', 'write'] as const };

/** One memory source, a project in it, and the requirements that save it. */
async function seeded() {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => STAMP_AT, newId: () => `id-${String(++next)}` });
  const { projects } = servicesOver(source.stores, {
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const created = await projects.create('Plan', owner.id);
  return {
    projects,
    projectId: created.project.id,
    requirements: {
      digest: lengthDigest,
      capture: source.history.savedPlanCapture,
      plans: source.history.savedPlans,
      scheduler: fastScheduler,
      newId: () => clock.newId(),
      now: () => Math.floor(clock.now() / 1_000),
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    digest: DiBag.fromSyncFactory(() => lengthDigest),
    capture: DiBag.fromSyncFactory(() => source.history.savedPlanCapture),
    plans: DiBag.fromSyncFactory(() => source.history.savedPlans),
    scheduler: DiBag.fromSyncFactory(() => fastScheduler),
    newId: DiBag.fromSyncFactory(() => () => 'id'),
    now: DiBag.fromSyncFactory(() => () => STAMP_AT / 1_000),
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
    .installModule(savedPlansModule)
    .register({ ...hostRequirements(), quota: DiBag.fromSyncFactory(() => undefined) })
    .build();

describe('the Saved plans module', () => {
  it('saves and reads back a plan over the graph installSavedPlans wires', async () => {
    const { projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);

    const saved = await savedPlans.save({
      projectId,
      name: 'Baseline',
      createdBy: owner.username,
      createdById: owner.id,
    });
    if (saved.outcome !== 'saved') throw new Error(`save answered ${saved.outcome}`);

    expect(await savedPlans.read(saved.record.id)).toHaveProperty('outcome', 'read');
  });

  it('passes a supplied quota through to the installed feature', async () => {
    const { projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans({
      ...requirements,
      quota: {
        mostBytesPerBody: 1024 * 1024,
        mostPlansPerProject: 1,
        mostBytesPerProject: 1024 * 1024,
      },
    });
    const request = { projectId, createdBy: owner.username, createdById: owner.id };

    expect(await savedPlans.save(request)).toHaveProperty('outcome', 'saved');
    expect(await savedPlans.save(request)).toHaveProperty('outcome', 'refused');
  });

  it('saves and announces through savePlan over the installed feature', async () => {
    const { projects, projectId, requirements } = await seeded();
    const { savedPlans } = installSavedPlans(requirements);
    const announcements = recordingBroadcaster();

    const outcome = await savePlan(
      { projects, plans: savedPlans, announcements },
      { projectId, actor: owner, name: 'Announced' },
    );

    expect(outcome).toHaveProperty('outcome', 'saved');
    expect(announcements.published).toEqual([
      { projectId, event: { type: 'saved_plans_changed' } },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `SavedPlansExports`, so only
   * enumerating the returned surface catches a leak the type checker would
   * not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installSavedPlans(requirements);

    expect(Object.keys(exposed)).toEqual(['savedPlans']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('savedPlanOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "savedPlanOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${SAVED_PLANS_LABEL}/savedPlanOptions`,
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
      .installModule(savedPlansModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('savedPlans')).toThrow(
      `Cannot resolve "${SAVED_PLANS_LABEL}/savedPlanOptions": dependency "quota" is not registered. Resolution path: savedPlans -> ${SAVED_PLANS_LABEL}/savedPlanOptions -> quota.`,
    );
  });
});
```

### 10.2 Import lines of the five moved files (slice 1 step 3 — applied after the `cp`/`mv`)

```diff
diff --git a/libs/wbs/application/core/src/module/saved-plans/saved-plans.feature.ts b/libs/wbs/application/core/src/module/saved-plans/saved-plans.feature.ts
--- a/libs/wbs/application/core/src/module/saved-plans/saved-plans.feature.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/saved-plans.feature.ts
@@ -13,8 +13,8 @@
   serialiseCanonicalPlanInput,
 } from '@wbs/domain';

-import type { Digest } from '../ports/runtime';
-import type { PlanInputReads, SavedPlanCaptureStore } from '../ports/saved-plan-capture-store';
+import type { Digest } from '../../ports/runtime';
+import type { PlanInputReads, SavedPlanCaptureStore } from '../../ports/saved-plan-capture-store';
 import type {
   SavedPlanBodyWrite,
   SavedPlanPrincipals,
@@ -23,10 +23,17 @@
   SavedPlanTouchOutcome,
   SavedPlanWrite,
   StoredSavedPlan,
-} from '../ports/saved-plan-store';
-import type { Scheduler } from '../ports/scheduler';
-import { defaultSavedPlanName } from './saved-plan-default-name';
-import { planInputRowsOf } from './saved-plan-input';
+} from '../../ports/saved-plan-store';
+import type { Scheduler } from '../../ports/scheduler';
+import { defaultSavedPlanName } from '../../service/saved-plan-default-name';
+import { planInputRowsOf } from '../../service/saved-plan-input';
+import type { SavedPlanQuota, SavedPlanQuotaRefusal } from '../../service/saved-plan-quota';
+import {
+  bodyBytesRefusal,
+  DEFAULT_SAVED_PLAN_QUOTA,
+  holdingRefusal,
+} from '../../service/saved-plan-quota';
+import { buildScheduleBody, serialiseScheduleBody } from '../../service/saved-plan-schedule-body';
 import type { SavedPlanIntegrityRefusal } from './saved-plan-integrity';
 import {
   assertKnownBodyVersion,
@@ -36,10 +43,7 @@
   verifyBody,
   verifyScheduleLink,
 } from './saved-plan-integrity';
-import type { SavedPlanQuota, SavedPlanQuotaRefusal } from './saved-plan-quota';
-import { bodyBytesRefusal, DEFAULT_SAVED_PLAN_QUOTA, holdingRefusal } from './saved-plan-quota';
 import { scheduleInputOfCaptured } from './saved-plan-schedule';
-import { buildScheduleBody, serialiseScheduleBody } from './saved-plan-schedule-body';

 const representableScheduleBody = (
   planned: Schedule,
diff --git a/libs/wbs/application/core/src/module/saved-plans/save-plan.ts b/libs/wbs/application/core/src/module/saved-plans/save-plan.ts
--- a/libs/wbs/application/core/src/module/saved-plans/save-plan.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/save-plan.ts
@@ -1,13 +1,13 @@
 import type { AuthenticatedUser } from '@wbs/contracts';
 import { canEditProject } from '@wbs/domain';

-import type { Broadcaster } from '../ports/project-event';
-import type { ProjectService } from '../service/project.service';
+import type { Broadcaster } from '../../ports/project-event';
+import type { ProjectService } from '../../service/project.service';
 import type {
   SavedPlanSaveOutcome,
   SavedPlanSaveRequest,
   SavedPlanService,
-} from '../service/saved-plan.service';
+} from './saved-plans.feature';

 export interface SavePlanGraph {
   readonly projects: Pick<ProjectService, 'read'>;
diff --git a/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.ts b/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.ts
--- a/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.ts
@@ -1,6 +1,6 @@
 import type { PlanInputNormaliseFailure } from '@wbs/domain';

-import type { Digest } from '../ports/runtime';
+import type { Digest } from '../../ports/runtime';

 /** Which of a saved plan's two sides a refusal is about. */
 export type SavedPlanBodyKind = 'input' | 'schedule';
diff --git a/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts b/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts
--- a/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts
@@ -3,7 +3,8 @@
 import { CANONICAL_PLAN_INPUT_SCHEMA_VERSION } from '@wbs/domain';
 import { describe, expect, it } from 'bun:test';

-import type { Digest } from '../ports/runtime';
+import type { Digest } from '../../ports/runtime';
+import { SCHEDULE_BODY_SCHEMA_VERSION } from '../../service/saved-plan-schedule-body';
 import {
   assertKnownBodyVersion,
   bodySha256,
@@ -12,7 +13,6 @@
   UnknownSavedPlanBodyVersionError,
   verifyBody,
 } from './saved-plan-integrity';
-import { SCHEDULE_BODY_SCHEMA_VERSION } from './saved-plan-schedule-body';

 const nodeDigest: Digest = {
   sha256: (bytes) => Promise.resolve(createHash('sha256').update(bytes, 'utf8').digest('hex')),
diff --git a/libs/wbs/application/core/src/module/saved-plans/saved-plan-schedule.ts b/libs/wbs/application/core/src/module/saved-plans/saved-plan-schedule.ts
--- a/libs/wbs/application/core/src/module/saved-plans/saved-plan-schedule.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/saved-plan-schedule.ts
@@ -10,8 +10,8 @@
 } from '@wbs/domain';
 import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

-import type { PlanInputReads, SavedPlanCaptureStore } from '../ports/saved-plan-capture-store';
-import { NO_DEADLINES, slicesOf } from './work-item.service';
+import type { PlanInputReads, SavedPlanCaptureStore } from '../../ports/saved-plan-capture-store';
+import { NO_DEADLINES, slicesOf } from '../../service/work-item.service';

 /**
  * The dates a captured plan has, computed from the captured values alone.
```

### 10.3 The four compatibility shims (slice 1 step 3 — full replacement content)

`libs/wbs/application/core/src/service/saved-plan.service.ts`:

```ts
/**
 * Compatibility re-export: Saved plans moved into its own sealed module.
 *
 * Kept because `http/saved-plan.routes.ts` and `service/service-boundaries.test.ts`
 * name this path and `@wbs/core`'s barrel still deep-imports it. It goes when
 * every importer names the module.
 */
export * from '../module/saved-plans/saved-plans.feature';
```

`libs/wbs/application/core/src/service/saved-plan-integrity.ts`:

```ts
/**
 * Compatibility re-export: saved-plan integrity moved into the Saved plans module.
 *
 * Kept because `http/saved-plan.routes.ts` imports this relative path directly
 * and `@wbs/core`'s barrel still deep-imports it. It goes when every importer
 * names the module.
 */
export * from '../module/saved-plans/saved-plan-integrity';
```

`libs/wbs/application/core/src/service/saved-plan-schedule.ts`:

```ts
/**
 * Compatibility re-export: saved-plan scheduling moved into the Saved plans module.
 *
 * Kept because `service/service-boundaries.test.ts` names this path and
 * `@wbs/core`'s barrel still deep-imports it. It goes when every importer names
 * the module.
 */
export * from '../module/saved-plans/saved-plan-schedule';
```

`libs/wbs/application/core/src/use-cases/save-plan.ts`:

```ts
/**
 * Compatibility re-export: the save-plan use case moved into the Saved plans module.
 *
 * Kept because `http/saved-plan.routes.ts`, `use-cases/admission.test.ts`,
 * `compose.test.ts` and `libs/wbs/application/core/testing/portable-composition.ts`
 * import this relative path directly and `@wbs/core`'s barrel still
 * deep-imports it. It goes when every importer names the module.
 */
export * from '../module/saved-plans/save-plan';
```

### 10.4 `contract.ts`, `module.ts`, `check.ts`, slice-1 `README.md` (slice 1 step 4 — no `Proof:` comments)

`contract.ts`:

```ts
import type { SavedPlanService, SavedPlanServiceOptions } from './saved-plans.feature';

/**
 * What a host must supply to install {@link savedPlansModule}.
 *
 * Exactly {@link SavedPlanServiceOptions}, unchanged by the move: the digest,
 * scheduler, id and clock callbacks, the optional quota and the two stores.
 *
 * **Preserved K3 debt.** `plans` (`SavedPlanStore`, `ports/saved-plan-store.ts`)
 * and `capture` (`SavedPlanCaptureStore`, `ports/saved-plan-capture-store.ts`)
 * are repository ports, not resource-service contracts: `SavedPlanService`
 * reads and writes saved-plan rows and captures the live plan through them
 * directly. This extraction moves the file; it does not close that debt.
 * Tracked under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`,
 * the same disposition Plan import's and Authentication's own requirements
 * record for their preserved direct-store calls.
 */
export type SavedPlansRequirements = SavedPlanServiceOptions;

/**
 * What installing {@link savedPlansModule} adds to a host graph.
 *
 * One export, `savedPlans`. The composition root's `plans` name stays an alias
 * of this same instance rather than a second export: the requirement key
 * `plans` already names the saved-plan store, and a second binding would be a
 * second place a duplicate `SavedPlanService` could be constructed.
 */
export interface SavedPlansExports {
  readonly savedPlans: SavedPlanService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching the five earlier core modules; the wiki
 * module identifier is `module.application.saved-plans` and the label drops
 * the `module.` prefix.
 */
export const SAVED_PLANS_LABEL = 'application.saved-plans';
```

`module.ts`:

```ts
import { DiBag } from 'di-bag';

import type { Digest } from '../../ports/runtime';
import type { SavedPlanCaptureStore } from '../../ports/saved-plan-capture-store';
import type { SavedPlanStore } from '../../ports/saved-plan-store';
import type { Scheduler } from '../../ports/scheduler';
import type { SavedPlanQuota } from '../../service/saved-plan-quota';
import { SAVED_PLANS_LABEL } from './contract';
import { SavedPlanService, type SavedPlanServiceOptions } from './saved-plans.feature';

/**
 * Saved plans as a sealed DI Bag module.
 *
 * Only `savedPlans` is exported. `savedPlanOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.saved-plans/savedPlanOptions` rather than
 * against an anonymous binding. `quota` is registered even when absent, as
 * `undefined`, the way Realtime registers its optional `maxEvents`: the
 * feature applies its own default limits when none is supplied.
 *
 * The module registers no disposer: `SavedPlanService` holds borrowed ports
 * and callbacks and no timer, socket or handle of its own.
 */
export const savedPlansModule = DiBag.createBuilder()
  .register({
    savedPlanOptions: DiBag.fromSyncFactory(
      ({
        digest,
        capture,
        plans,
        scheduler,
        newId,
        now,
        quota,
      }: {
        digest: Digest;
        capture: SavedPlanCaptureStore;
        plans: SavedPlanStore;
        scheduler: Scheduler;
        newId: () => string;
        now: () => number;
        quota: SavedPlanQuota | undefined;
      }): SavedPlanServiceOptions => ({
        digest,
        capture,
        plans,
        scheduler,
        newId,
        now,
        ...(quota === undefined ? {} : { quota }),
      }),
    ),
  })
  .register({
    savedPlans: DiBag.fromSyncFactory(
      ({ savedPlanOptions }: { savedPlanOptions: SavedPlanServiceOptions }): SavedPlanService =>
        new SavedPlanService(savedPlanOptions),
    ),
  })
  .buildModule(['savedPlans'], { label: SAVED_PLANS_LABEL });
```

`check.ts`:

```ts
import { DiBag } from 'di-bag';

import type { SavedPlansExports, SavedPlansRequirements } from './contract';
import { savedPlansModule } from './module';

/**
 * Installs {@link savedPlansModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Saved plans can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link SavedPlansExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installSavedPlans(requirements: SavedPlansRequirements): SavedPlansExports {
  const bag = DiBag.createBuilder()
    .installModule(savedPlansModule)
    .register({
      digest: DiBag.fromSyncFactory(() => requirements.digest),
      capture: DiBag.fromSyncFactory(() => requirements.capture),
      plans: DiBag.fromSyncFactory(() => requirements.plans),
      scheduler: DiBag.fromSyncFactory(() => requirements.scheduler),
      newId: DiBag.fromSyncFactory(() => requirements.newId),
      now: DiBag.fromSyncFactory(() => requirements.now),
      quota: DiBag.fromSyncFactory(() => requirements.quota),
    })
    .build();
  return { savedPlans: bag.resolve('savedPlans') };
}
```

`README.md`:

```md
# Saved plans

The sixth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's, Plan import's and Authentication's pattern: `module.ts` seals the graph, `check.ts` is
the only place that builds a bag, and `contract.ts` states the digest, scheduler, id and clock
callbacks, optional quota and two saved-plan stores a host must supply.

`saved-plans.feature.ts` (the moved `service/saved-plan.service.ts`) saves, lists, reads, compares,
renames and deletes saved plans. `save-plan.ts` (the moved `use-cases/save-plan.ts`) admits one
save for an authenticated actor and announces it after it is written. `saved-plan-integrity.ts`
and `saved-plan-schedule.ts` are the feature's private support: stored-body verification, and the
detached scheduling of a captured plan. Private bindings are named under the
`application.saved-plans` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` will install the module (slice 2);
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/saved-plan.service.ts`,
`libs/wbs/application/core/src/service/saved-plan-integrity.ts`,
`libs/wbs/application/core/src/service/saved-plan-schedule.ts` and
`libs/wbs/application/core/src/use-cases/save-plan.ts` keep the former `@wbs/core` deep-import
names.
```

### 10.5 Task 1.7's reference removals (slice 1 step 2)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
index 72631b8c..c4adf62a 100644
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -159,11 +159,6 @@
       "kind": "support",
       "disposition": "re-export shim; delete when importers use @wbs/core directly"
     },
-    {
-      "path": "apps/wbs/be-01/src/service/saved-plan-retry.ts",
-      "kind": "support",
-      "disposition": "re-export shim; delete when importers use @wbs/core directly"
-    },
     {
       "path": "apps/wbs/be-01/src/service/saved-plan-schedule-body.ts",
       "kind": "support",
@@ -420,12 +415,6 @@
       "disposition": "pure domain code; move to the domain library",
       "rationale": "SavedPlanService calls its pure body-size, plan-count and project-byte limit decisions over supplied saved-plan holdings with no store or clock access"
     },
-    {
-      "path": "libs/wbs/application/core/src/service/saved-plan-retry.ts",
-      "kind": "support",
-      "disposition": "unadopted caller retry; wire it into the save route or delete it with saved-plans task 4.5",
-      "rationale": "saved-plans design (Fail-fast, not queue) and its task 4.5 provide this bounded retry as something the caller of a refused save may make; commit 4ee1ab89 added it with its unit and database tests and no route ever called it, so only those tests, the core barrel and service-boundaries.test.ts name it. It is designed behaviour without a caller, not dead code"
-    },
     {
       "path": "libs/wbs/application/core/src/service/saved-plan-schedule-body.ts",
       "kind": "support",
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
index f7f6ee46..6068527b 100644
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -107,7 +107,6 @@ export * from './service/saved-plan-default-name';
 export * from './service/saved-plan-input';
 export * from './service/saved-plan-integrity';
 export * from './service/saved-plan-quota';
-export * from './service/saved-plan-retry';
 export * from './service/saved-plan-schedule';
 export * from './service/saved-plan-schedule-body';
 export * from './service/step.service';
diff --git a/libs/wbs/application/core/src/service/service-boundaries.test.ts b/libs/wbs/application/core/src/service/service-boundaries.test.ts
index ddae4e93..06b8a814 100644
--- a/libs/wbs/application/core/src/service/service-boundaries.test.ts
+++ b/libs/wbs/application/core/src/service/service-boundaries.test.ts
@@ -35,7 +35,6 @@ const services = [
   'saved-plan-default-name',
   'saved-plan-input',
   'saved-plan-quota',
-  'saved-plan-retry',
   'saved-plan-schedule-body',
   'saved-plan-schedule',
   'saved-plan.service',
```

### 10.6 Sideways rows (slice 1 step 7)

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -116,6 +116,16 @@
  * module-specifier and an identifier violation — `"module/authentication/authentication.feature.ts:
  * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches http/endpoint.ts"`
  * (0 pass, 1 fail).
+ *
+ * The fifteenth through seventeenth rows are the same three rules re-scoped
+ * to the Saved plans module's own directory once `save-plan.ts` moved out of
+ * `use-cases/` and stopped being covered by the first two rows'
+ * `path.startsWith('use-cases/')`: the module's own use case takes its
+ * principal type from `@wbs/contracts`, never from Authentication or the HTTP
+ * endpoint, and `saved-plans.feature.ts`, `saved-plan-integrity.ts` and
+ * `saved-plan-schedule.ts` never did either. The Authentication row is spelt
+ * twice, once for the compatibility shim and once for the module's real path,
+ * because the module-specifier route does not follow a shim's re-export.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -168,6 +178,18 @@
     reaches: 'http/endpoint.ts',
     from: (path: string) => path.startsWith('module/authentication/'),
   },
+  {
+    reaches: 'service/auth.service.ts',
+    from: (path: string) => path.startsWith('module/saved-plans/'),
+  },
+  {
+    reaches: 'module/authentication/authentication.feature.ts',
+    from: (path: string) => path.startsWith('module/saved-plans/'),
+  },
+  {
+    reaches: 'http/endpoint.ts',
+    from: (path: string) => path.startsWith('module/saved-plans/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.7 Slice 1's Proof comments (slice 1 step 9 — only after rows 3-7 and 9-11 were observed)

```diff
diff --git a/libs/wbs/application/core/src/module/saved-plans/module.ts b/libs/wbs/application/core/src/module/saved-plans/module.ts
--- a/libs/wbs/application/core/src/module/saved-plans/module.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/module.ts
@@ -48,6 +48,9 @@
         scheduler,
         newId,
         now,
+        // Proof (2026-09-23): deleting this spread left `passes a supplied quota through to the
+        // installed feature` failing (6 pass, 1 fail): the second save answered "saved" instead of
+        // "refused", because the feature fell back to its default limits.
         ...(quota === undefined ? {} : { quota }),
       }),
     ),
@@ -58,4 +61,12 @@
         new SavedPlanService(savedPlanOptions),
     ),
   })
+  // Proof (2026-09-23): widening the key tuple to `['savedPlans', 'savedPlanOptions']` left the
+  // private-binding, graph-label and missing-requirement assertions failing (4 pass, 3 fail):
+  // `resolve('savedPlanOptions')` did not throw, `inspectGraph()` reported bare
+  // `savedPlanOptions`, and the DI failure named that bare key instead of the module label.
+  // Proof (2026-09-23): dropping `{ label: SAVED_PLANS_LABEL }` left only the two label
+  // assertions failing (5 pass, 2 fail): `inspectGraph()` reported `savedPlanOptions` unlabelled,
+  // and the missing-requirement message named `savedPlanOptions` instead of
+  // `application.saved-plans/savedPlanOptions`.
   .buildModule(['savedPlans'], { label: SAVED_PLANS_LABEL });
diff --git a/libs/wbs/application/core/src/module/saved-plans/check.ts b/libs/wbs/application/core/src/module/saved-plans/check.ts
--- a/libs/wbs/application/core/src/module/saved-plans/check.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/check.ts
@@ -26,5 +26,11 @@
       quota: DiBag.fromSyncFactory(() => requirements.quota),
     })
     .build();
+  // Proof (2026-09-23): returning a structurally assignable `exposed` object with `bag` left
+  // the installer-surface assertion failing: the received keys included `bag` (6 pass, 1 fail),
+  // with `wbs-core:typecheck` at exit 0.
+  // Proof (2026-09-23): attaching `resolve` to the returned `SavedPlanService` kept the key list
+  // correct but made the no-resolver assertion receive false (6 pass, 1 fail), with
+  // `wbs-core:typecheck` at exit 0.
   return { savedPlans: bag.resolve('savedPlans') };
 }
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -126,6 +126,19 @@
  * `saved-plan-schedule.ts` never did either. The Authentication row is spelt
  * twice, once for the compatibility shim and once for the module's real path,
  * because the module-specifier route does not follow a shim's re-export.
+ *
+ * Proof (2026-09-23): prepending the bare import `import '../../service/auth.service';`
+ * to `module/saved-plans/save-plan.ts` failed this suite with exactly one violation,
+ * `"module/saved-plans/save-plan.ts: '../../service/auth.service' reaches
+ * service/auth.service.ts"` (0 pass, 1 fail).
+ * Proof (2026-09-23): independently prepending
+ * `import '../authentication/authentication.feature';` to the same file failed this suite
+ * with exactly one violation, `"module/saved-plans/save-plan.ts:
+ * '../authentication/authentication.feature' reaches
+ * module/authentication/authentication.feature.ts"` (0 pass, 1 fail).
+ * Proof (2026-09-23): independently prepending `import '../../http/endpoint';` to the same
+ * file failed this suite with exactly one violation, `"module/saved-plans/save-plan.ts:
+ * '../../http/endpoint' reaches http/endpoint.ts"` (0 pass, 1 fail).
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
```

### 10.8 The alias test (slice 2 step 1)

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -229,6 +229,16 @@
     expect((await graph.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
   });

+  /**
+   * `plans` and `savedPlans` are two names for one Saved plans feature identity, never two
+   * instances: the backend module map's "Alias exports must not instantiate duplicates".
+   */
+  test('composes one Saved plans instance behind both the plans and savedPlans names', () => {
+    const { graph } = fixture();
+
+    expect(graph.plans).toBe(graph.savedPlans);
+  });
+
   test('denies a foreign save and persists an owner save through independent history', async () => {
     const { graph } = fixture();
     const project = await graph.projects.create('Private', 'owner');
```

### 10.9 `compose.ts` and `index.ts` (slice 2 step 2)

```diff
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
index 449ae165..2415e192 100644
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -13,6 +13,8 @@ import { installRealtime } from './module/realtime/check';
 import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
 import type { ReplayBuffer } from './module/realtime/replay-buffer';
 import type { ReplayOrchestrator } from './module/realtime/replay-orchestrator';
+import { installSavedPlans } from './module/saved-plans/check';
+import type { SavedPlanService } from './module/saved-plans/saved-plans.feature';
 import type { Clock } from './ports/clock';
 import type { OidcVerifier } from './ports/oidc-verifier';
 import type { Broadcaster } from './ports/project-event';
@@ -29,7 +31,6 @@ import { DirectoryService } from './service/directory.service';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
 import { PriorityBandService } from './service/priority-band.service';
 import { ProjectService } from './service/project.service';
-import { SavedPlanService } from './service/saved-plan.service';
 import { StepService } from './service/step.service';
 import { WorkItemService } from './service/work-item.service';

@@ -213,7 +214,7 @@ export function composeServices(
       broadcast,
       scheduler: runtime.scheduler,
     });
-  const savedPlans = new SavedPlanService({
+  const { savedPlans } = installSavedPlans({
     digest: runtime.digest,
     capture: source.history.savedPlanCapture,
     plans: source.history.savedPlans,
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
index 6068527b..09b3fb37 100644
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -26,6 +26,8 @@ export * from './module/plan-import/contract';
 export * from './module/plan-import/module';
 export * from './module/realtime/contract';
 export * from './module/realtime/module';
+export * from './module/saved-plans/contract';
+export * from './module/saved-plans/module';
 export * from './ports/actual-store';
 // The owner-neutral marker read: `CalendarMarkerReader` and the list outcome it answers with.
 export * from './ports/calendar-marker-read';
```

### 10.10 `kinds.json` shim rows (slice 2 step 3)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
index c4adf62a..5439f7fd 100644
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -406,8 +406,7 @@
     {
       "path": "libs/wbs/application/core/src/service/saved-plan-integrity.ts",
       "kind": "support",
-      "disposition": "saved-plan integrity policy; move to the saved plan module",
-      "rationale": "SavedPlanService verifies stored bodies through its Digest port, saved-plan routes map its version failure, and the SQLite adapter shares its byte measurement for the saved plan aggregate"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the saved-plans module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/saved-plan-quota.ts",
@@ -424,14 +423,12 @@
     {
       "path": "libs/wbs/application/core/src/service/saved-plan-schedule.ts",
       "kind": "support",
-      "disposition": "private member of saved-plan.service.ts",
-      "rationale": "saved-plan.service.ts is its only production importer and uses its detached scheduling derivation; the file's capture helper asks SavedPlanCaptureStore, so it is not pure domain code"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the saved-plans module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/saved-plan.service.ts",
-      "kind": "feature",
-      "capability": "wbs-domain",
-      "rationale": "saved-plan routes and the save-plan use case call it to coordinate SavedPlanCaptureStore, SavedPlanStore, Scheduler and Digest for the user-visible save, read, compare, rename and delete behaviour specified by the archived 2026-09-10-scheduler-runtime-port requirement group"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the saved-plans module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/smoke.service.ts",
@@ -505,9 +502,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/use-cases/save-plan.ts",
-      "kind": "feature",
-      "capability": "wbs-domain",
-      "rationale": "savedPlanRoutes and the portable composition call it to coordinate ProjectService access, SavedPlanService persistence and Broadcaster publication for one save of the archived 2026-09-10-scheduler-runtime-port saved-plan requirement group"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the saved-plans module directly"
     }
   ]
 }
```

### 10.11 Row 14's mutation, and the alias test's Proof comment (slice 2 step 4)

Row 14 replaces the single line `    plans: savedPlans,` inside `const common: CommonServices = {` with:

```ts
    plans: installSavedPlans({
      digest: runtime.digest,
      capture: source.history.savedPlanCapture,
      plans: source.history.savedPlans,
      scheduler: runtime.scheduler,
      newId: () => runtime.clock.newId(),
      now: () => Math.floor(runtime.clock.now() / 1_000),
    }).savedPlans,
```

After observing it and restoring, apply:

```diff
diff --git a/libs/wbs/application/core/src/compose.test.ts b/libs/wbs/application/core/src/compose.test.ts
--- a/libs/wbs/application/core/src/compose.test.ts
+++ b/libs/wbs/application/core/src/compose.test.ts
@@ -236,6 +236,9 @@
   test('composes one Saved plans instance behind both the plans and savedPlans names', () => {
     const { graph } = fixture();

+    // Proof (2026-09-23): giving `plans` its own `installSavedPlans({...}).savedPlans` in
+    // `composeServices` left this assertion failing with two distinct `SavedPlanService`
+    // instances (0 pass, 1 fail), with `wbs-core:typecheck` at exit 0.
     expect(graph.plans).toBe(graph.savedPlans);
   });

```

### 10.12 Registration (slice 3 steps 1-3)

10.12a, `modules.json`:

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -138,6 +138,36 @@
       }
     },
     {
+      "moduleId": "module.application.saved-plans",
+      "name": "Saved plans sealed DI Bag module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "libs/wbs/application/core/src/module/saved-plans",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "libs/wbs/application/core/src/module/saved-plans/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "libs/wbs/application/core/src/compose.ts" },
+          { "kind": "path", "path": "libs/wbs/application/core/src/index.ts" },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/service/saved-plan-integrity.ts"
+          },
+          {
+            "kind": "path",
+            "path": "libs/wbs/application/core/src/service/saved-plan-schedule.ts"
+          },
+          { "kind": "path", "path": "libs/wbs/application/core/src/service/saved-plan.service.ts" },
+          { "kind": "path", "path": "libs/wbs/application/core/src/use-cases/save-plan.ts" }
+        ]
+      }
+    },
+    {
       "moduleId": "module.application.use-cases",
       "name": "Core application use cases pilot boundary",
       "memberships": [
```

10.12b, `policy.json`:

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -954,6 +954,25 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.application.saved-plans",
+      "selector": {
+        "kind": "prefix",
+        "value": "libs/wbs/application/core/src/module/saved-plans"
+      },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "libs/core/src/service/saved-plan.service.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "f3a12fbc600b51ff3794e3593c4a6634960198d9",
+          "path": "libs/core/src/service/saved-plan.service.ts"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
```

10.12c, `pilotPaths`:

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -39,6 +39,7 @@
   'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/module/realtime/README.md',
+  'libs/wbs/application/core/src/module/saved-plans/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
   'libs/wbs/domain/domain/src/saved-plan/README.md',
   'libs/wbs/adapters/store-memory/src/README.md',
```

### 10.13 The final README (slice 3 step 3 — full content)

It names its predecessor by filename only: `tool-devsync`'s `LEGACY_ROOT` scan refuses a current
README that spells a pre-namespacing path (E4 section 6 row 18).

```md
# Saved plans

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.saved-plans","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"save-plan.ts"},{"kind":"path","path":"saved-plan-integrity.test.ts"},{"kind":"path","path":"saved-plan-integrity.ts"},{"kind":"path","path":"saved-plan-schedule.ts"},{"kind":"path","path":"saved-plans.feature.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the four compatibility shims."},{"section":"invariants","reason":"The write-order, fail-fast and verify-on-read invariants are documented on SavedPlanService and the integrity functions; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan-integrity.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan-schedule.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan.service.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/save-plan.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the four compatibility shims are declared; the saved-plan routes, the portable composition, the admission and composition tests and the be-01 shims and database tests reach this module through those shims or the barrel and are not tracked here."}} -->

The sixth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's, Plan import's and Authentication's pattern: `module.ts` seals the graph, `check.ts` is
the only place that builds a bag, and `contract.ts` states the digest, scheduler, id and clock
callbacks, optional quota and two saved-plan stores a host must supply.

`saved-plans.feature.ts` (the moved `service/saved-plan.service.ts`) saves, lists, reads, compares,
renames and deletes saved plans. `save-plan.ts` (the moved `use-cases/save-plan.ts`) admits one
save for an authenticated actor and announces it after it is written. `saved-plan-integrity.ts`
and `saved-plan-schedule.ts` are the feature's private support: stored-body verification, and the
detached scheduling of a captured plan. Private bindings are named under the
`application.saved-plans` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/saved-plan.service.ts`,
`libs/wbs/application/core/src/service/saved-plan-integrity.ts`,
`libs/wbs/application/core/src/service/saved-plan-schedule.ts` and
`libs/wbs/application/core/src/use-cases/save-plan.ts` keep the former `@wbs/core` deep-import
names.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.saved-plans` (`docs/wiki-policy/policy.json`'s
`boundary.application.saved-plans`). The boundary's `sourceSelector` binds this directory to
`saved-plans.feature.ts`'s own single pre-namespacing predecessor, `saved-plan.service.ts`, the
file `docs/code-organization/kinds.json` classified as the Saved plans feature before the move,
which existed at the pilot's frozen `sourceRevision` — the same mechanism
`boundary.application.authentication` uses for its `auth.service.ts` predecessor. The other files
here have no separate baseline entry: the registration's guarantee is one predecessor per module
directory, not one per file it holds.
```

### 10.14 Legacy re-pin (slice 3 step 4 — the numbers only after the red, the Proof after the green)

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 47,
+      'historical policy selector or baseline': 49,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -817,8 +817,8 @@
     // naming the pre-move `libs/core/src/service/auth.service.ts` this module was extracted from;
     // raised `historical policy selector or baseline` from 45 to 47 and occurrences from 263 to 265,
     // no unclassified entries (2026-09-23).
-    digest: '3eca3cf1a2f8d1703b42edfd40be279a5a144034c000a812d7b70eb8b2cfef62',
-    occurrences: 265,
+    digest: '86721c9c2457e04146bd4db56db16869936be5a012fddc671bf2e39989c23d0f',
+    occurrences: 267,
     unclassified: [],
   });
 });
```

Then:

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -817,6 +817,11 @@
     // naming the pre-move `libs/core/src/service/auth.service.ts` this module was extracted from;
     // raised `historical policy selector or baseline` from 45 to 47 and occurrences from 263 to 265,
     // no unclassified entries (2026-09-23).
+    // Proof: registering `module.application.saved-plans` added its
+    // `boundary.application.saved-plans`'s `sourceSelector` and one `baselineEntries` path, both
+    // naming the pre-move `libs/core/src/service/saved-plan.service.ts` this module was extracted
+    // from; raised `historical policy selector or baseline` from 47 to 49 and occurrences from 265
+    // to 267, no unclassified entries (2026-09-23).
     digest: '86721c9c2457e04146bd4db56db16869936be5a012fddc671bf2e39989c23d0f',
     occurrences: 267,
     unclassified: [],
```

### 10.15 Task records (slice 3 step 5)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -34,7 +34,14 @@
       rather than through `service/broadcast.ts`. No rule prevents the repository-schema path returning:
       be-01 has no type-identity boundary check, and the Optimization module of 3.6 owns that rule. The
       cache-key port is still owed.
-- [ ] 1.7 Wire or delete `saved-plan-retry.ts` under the accepted saved-plans obligation.
+- [x] 1.7 Wire or delete `saved-plan-retry.ts` under the accepted saved-plans obligation. Deleted
+      2026-09-23, with its unit test, be-01's re-export shim and its database test, its barrel
+      export, its `service/service-boundaries.test.ts` entry and both `kinds.json` rows (95 to 93
+      entries). `saveWithBoundedRetry` never had a production caller, and no archived
+      specification requires a caller retry: the saved-plans delta only lets a later save succeed
+      as a fresh save, which `SavedPlanService.save` already does on every call. Wiring it into
+      the save route would change how long a contended save waits, an observable change no
+      accepted task asks for. Recorded against saved-plans task 4.5.
 - [x] 1.8 Correct the four `kinds.json` capability values to `wbs-domain` and `plan-import`. Done
       2026-09-22 over **five** entries, not four: Plan history's row became a shim under 2.1, and Plan
       commands and Saved plans each carry two rows (the service and its use case). `wbs-domain` is a
@@ -74,7 +81,18 @@
       unchanged) rather than added or removed, because
       `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
 - [ ] 3.3 Saved plans, absorbing project and admission checks and the publication after save,
-      rename and delete.
+      rename and delete. Sealed 2026-09-23 as `libs/wbs/application/core/src/module/saved-plans/`,
+      with `service/saved-plan.service.ts`, `service/saved-plan-integrity.ts`,
+      `service/saved-plan-schedule.ts` and `use-cases/save-plan.ts` kept as compatibility
+      re-export shims and their four `kinds.json` rows rewritten in place (93 entries,
+      unchanged). The save path's project, admission and publication checks now live in the
+      module's own `save-plan.ts`. **Not yet done, so not ticked:** rename and delete still read
+      the project and publish `saved_plans_changed` inline in `http/saved-plan.routes.ts`. The
+      contract's `plans` and `capture` stores are preserved K3 debt, tracked under 7.4. Proof: the
+      module's own tests; negatives for the installer leaking its bag, its resolver leaking
+      through the returned `SavedPlanService`, the private `savedPlanOptions` binding exported,
+      the label dropped, the optional quota dropped, and the two composition names given two
+      instances. Wiki registration (task 7.5) IS landed for this module; see 7.5's own note below.
 - [x] 3.4 Plan import, with its per-scope factory. Landed 2026-09-23 as
       `libs/wbs/application/core/src/module/plan-import/`, with `service/import.service.ts` and
       `service/prepare-import.ts` kept as compatibility re-export shims, and
@@ -187,6 +205,14 @@
       module cannot register (040-6 packet E4, first revision): Realtime's own precedent above
       already refutes it, and the second rehearsed experiment's own failure was a missing
       `pilotPaths` overlay entry — packet D's own lesson — not a mechanism limit.
+      Landed again 2026-09-23 for Saved plans as
+      `libs/wbs/application/core/src/module/saved-plans/README.md`,
+      `docs/wiki-policy/modules.json`'s `module.application.saved-plans` row and
+      `docs/wiki-policy/policy.json`'s `boundary.application.saved-plans`, using a
+      `sourceSelector` bound to the pre-namespacing `libs/core/src/service/saved-plan.service.ts`
+      alone — the file `kinds.json` classified as the Saved plans feature before the move.
+      `save-plan.ts`, `saved-plan-integrity.ts` and `saved-plan-schedule.ts` have no separate
+      baseline entry, for the same reason.
       **Not landed for Plan import (task 3.4).** Every existing pilot boundary under the
       namespaced tree is registered through a `sourceSelector` bound to a pre-namespacing
       predecessor file that existed at the pilot's frozen `sourceRevision`. Both of Plan import's
```

```diff
diff --git a/openspec/changes/saved-plans/tasks.md b/openspec/changes/saved-plans/tasks.md
--- a/openspec/changes/saved-plans/tasks.md
+++ b/openspec/changes/saved-plans/tasks.md
@@ -266,6 +266,17 @@
       `inputBytes).toContain('wi-3')`, whose received value listed `wi-1` and
       `wi-2` alone. So the two weaker assertions cannot stand in for it, which
       is exactly the claim.
+      **Withdrawn 2026-09-23** by `adopt-di-composition` task 1.7: no route
+      ever called `saveWithBoundedRetry`, so it, its unit test, its database
+      test and be-01's re-export shim were deleted. The `busy_timeout` 0
+      refusal above is unchanged, and a caller that retries sends a new save,
+      which captures a fresh read snapshot by construction. The retry negative
+      described above was deleted with its test. The delta spec's scenario
+      `a retry after the rival committed` (`specs/wbs-domain/spec.md:190-194`)
+      is now backed by no test: a caller's retry is a fresh `save`, so it holds
+      by construction and stays in the spec as the caller's permission. The
+      first lines of this task and `design.md:130-133` still describe the
+      bounded retry loop.
 - [x] 4.6 Quota. Each of the three limits refuses **before** any row is written,
       naming which limit was hit; the count and total are read in the same
       transaction that would write. Two negatives, both watched: move the check
```

## 11. Global stop conditions

- A red checkpoint reports `0 tests ran`.
- A mutation leaves its named test passing: restore, check the location against section 10, redo
  once, stop if it still passes.
- A step-0 line does not print what it says, or the step-0 tree is not clean.
- `git apply --check` refuses any section-10 diff: the file drifted; report, do not repair.
- A pin differs from step 0 other than by this packet's own prescribed change (`kinds.json` 95 → 93 in
  slice 1 and unchanged in slice 2; wiki modules and boundaries +1 each in slice 3; the legacy pin
  exactly as row 18 states).
- Any change to what `SavedPlanService` or `savePlan` does. The **only** permitted source changes to
  moved code are 10.2's import lines; the only permitted composition change is 10.9's.
- A network access or an OpenSpec download.
- A check needs an edit this packet does not prescribe.

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                                                                                                                      | Untracked (new)                                                                                                                                                                                                                                                                   | Deleted                                                                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, and under `libs/wbs/application/core/src/`: `index.ts`, `ports/sideways-type-boundaries.test.ts`, `service/saved-plan-integrity.ts`, `service/saved-plan-schedule.ts`, `service/saved-plan.service.ts`, `service/service-boundaries.test.ts`, `use-cases/save-plan.ts`                          | all **ten** files under `libs/wbs/application/core/src/module/saved-plans/`: `README.md`, `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `save-plan.ts`, `saved-plan-integrity.test.ts`, `saved-plan-integrity.ts`, `saved-plan-schedule.ts`, `saved-plans.feature.ts` | `apps/wbs/be-01/src/service/saved-plan-retry.db.test.ts`, `apps/wbs/be-01/src/service/saved-plan-retry.ts`, and under `libs/wbs/application/core/src/service/`: `saved-plan-integrity.test.ts` (moved), `saved-plan-retry.test.ts`, `saved-plan-retry.ts` |
| 2     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`, `libs/wbs/application/core/src/compose.test.ts`, `libs/wbs/application/core/src/compose.ts`, `libs/wbs/application/core/src/index.ts`                                                                                                                                                           | nothing                                                                                                                                                                                                                                                                           | nothing                                                                                                                                                                                                                                                   |
| 3     | `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `libs/wbs/application/core/src/module/saved-plans/README.md`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `openspec/changes/saved-plans/tasks.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing                                                                                                                                                                                                                                                                           | nothing                                                                                                                                                                                                                                                   |

Slice 1: 9 modified, 10 new, 5 deleted (24 paths). Slice 2: 5 modified. Slice 3: 8 modified. The
planner may add a revised packet file to its own commits; the lists are scoped to `$base`, so that
does not break them.

## 13. Findings

- **Map:** no defect. Its Saved plans row, its file ledger (lines 215, 232, 236) and its alias rule
  match the tree.
- **Task 3.3's wording is larger than a sealing packet.** It names the six-operation fold ("the
  publication after save, rename and delete"). Only save's half exists in the moved code, so 3.3
  stays unticked with a precise note (section 10.15), not ticked on a partial basis.
- **`kinds.json`'s retry rationale predicted this decision** ("wire it into the save route or delete
  it with saved-plans task 4.5"); slice 3's note on 4.5 closes that loop.
- **Landed code of packets A-E4:** no defect found.

## 14. Document exemption (precondition, not a slice)

Sections 3 and 4 and the tasks diffs cite `libs/core/src/service/saved-plan.service.ts` as the
frozen-revision predecessor. `docs/findings/current-document-check-exemptions.json` carries this
packet's `legacy-root` entry, committed with the packet itself; no slice touches that file.

## 15. `git apply --check` verification

Every fenced `diff` block above was extracted from this document by the script below and applied in
slice order to a disposable worktree of `474be8df`, with the filesystem steps each slice prescribes
in between, and the resulting tree compared with the rehearsed slice commits.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <slice1-sha> <slice2-sha> <slice3-sha>
set -euo pipefail
repo=$1; packet=$2; s1=$3; s2=$4; s3=$5
work=$(mktemp -d "${TMPDIR:?}/e5-extract-XXXXXX")
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
test "$(ls "$work"/*.listing | wc -l)" -eq 11
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" 474be8df0826bdd36ce4003adb1034b880d3fa6a
cd "$wt"
c=libs/wbs/application/core/src
m=$c/module/saved-plans
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
rm "$c/service/saved-plan-retry.ts" "$c/service/saved-plan-retry.test.ts" \
  apps/wbs/be-01/src/service/saved-plan-retry.ts apps/wbs/be-01/src/service/saved-plan-retry.db.test.ts
apply 02
cp "$c/service/saved-plan.service.ts" "$m/saved-plans.feature.ts"
cp "$c/use-cases/save-plan.ts" "$m/save-plan.ts"
cp "$c/service/saved-plan-integrity.ts" "$m/saved-plan-integrity.ts"
cp "$c/service/saved-plan-schedule.ts" "$m/saved-plan-schedule.ts"
mv "$c/service/saved-plan-integrity.test.ts" "$m/saved-plan-integrity.test.ts"
apply 01
cp "$work/02.listing" "$c/service/saved-plan.service.ts"
cp "$work/03.listing" "$c/service/saved-plan-integrity.ts"
cp "$work/04.listing" "$c/service/saved-plan-schedule.ts"
cp "$work/05.listing" "$c/use-cases/save-plan.ts"
cp "$work/06.listing" "$m/contract.ts"
cp "$work/07.listing" "$m/module.ts"
cp "$work/08.listing" "$m/check.ts"
cp "$work/09.listing" "$m/README.md"
apply 03
apply 04
test "$(ls "$m" | wc -l)" -eq 10
same_as "$s1"
# Slice 2
apply 05
apply 06
apply 07
apply 08
same_as "$s2"
# Slice 3 (listing 10 is row 14's mutation text, not a file)
apply 09
apply 10
apply 11
cp "$work/11.listing" "$m/README.md"
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
diffs=15 listings=11
applied 02
applied 01
applied 03
applied 04
tree equals 54bb3b45
applied 05
applied 06
applied 07
applied 08
tree equals da2dceb3
applied 09
applied 10
applied 11
applied 12
applied 13
applied 14
applied 15
tree equals 39ae91f8
all 15 diffs applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits were throwaway: slice 1 `54bb3b45`, slice 2 `da2dceb3`, slice 3 `39ae91f8`, on branch `rehearse/040-6-e5-saved-plans-r2` (not pushed; kept only as the comparison target of the script above). They replace the first revision's `1c8c28db`, `dcb2fc69` and `033d8a1e` on branch `rehearse/040-6-e5-saved-plans`, which is kept unchanged; review round 1's fixes changed three committed texts (the `use-cases/save-plan.ts` shim comment, the slice-1 README's Consumers line and the saved-plans 4.5 note), so the comparison target had to change with them.

## 16. Deferred: label agreement

Whether the README's `moduleId` names the label `savedPlansModule` seals its bag under is not checked,
matching packet D's deferral.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                     |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | Fixture reproduces the failure first | §6 row 1 (module red), row 12 (bundle red), rows 15, 16, 18 (registration and pin reds), all on unchanged code |
| 2   | Test code passes typecheck and lint  | §6 row 2; `wbs-core` lint/typecheck on each rehearsed slice; lefthook passed on all three rehearsal commits    |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                            |
| 4   | Commands can show failure            | §7 status wrapper; `if count=$(grep …)` form                                                                   |
| 5   | Tests reading `HEAD`                 | §7 slice 3 preamble: slices 1-2 are committed before the pilot suite runs                                      |
| 6   | Sandbox facts                        | §7 slice 1 step 10 (service-kinds is planner-only); §8                                                         |
| 7   | Known race                           | §8                                                                                                             |
| 8   | Names                                | `module.application.saved-plans`; label `application.saved-plans`; Twilight Burokrat                           |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines                              |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change                                                        |
| 11  | `\|\| test $? -eq 1` after pipelines | not used; single-command `if … then … else status=$?` form only                                                |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                       |
| 13  | Index every module file              | §10.13 names all nine non-README files                                                                         |
| 14  | Bun path vs filter                   | every focused run uses `./…` or `cd <project>`; typecheck before baselines (§7 slice 1 step 0)                 |
| 15  | Interleaving property tests          | not triggered: no owner, queue, lock or retry logic is added (one is deleted)                                  |
| 16  | Model-based tests                    | not triggered                                                                                                  |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed` (dispatch paragraph)                                              |
| 18  | Symbol-based boundary checks         | §10.6 reuses the TypeChecker-based checker; §3 records its shim behaviour                                      |
| 19  | ugrep exits 1 on missing file        | `test -f` precedes every `grep` on a file (slice 2 bundle)                                                     |
| 20  | Promise only what a check keeps      | task 3.3 left unticked; `check-indexes` called index validation; no compile red claimed for slice 2 (§6)       |
