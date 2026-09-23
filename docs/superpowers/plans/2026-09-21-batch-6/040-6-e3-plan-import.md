# 040.6 E3 — Plan import as the fourth sealed module

| Field      | Value                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — seventh packet        |
| Size class | S, in three slices                                                                                               |
| Slices     | 1 seals the module, 2 installs it from composition, 3 records the module layout and the wiki-pilot finding       |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, one remaining process module            |
| Planned on | 2026-09-23, every slice rehearsed end to end in a private worktree of `a43542cb1b3a8da2f8d801739f4e584f573f9fba` |

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout `run-executor.sh` clones from must contain this packet file itself
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md` must
print an entry) and must be a descendant of `a43542cb1b3a8da2f8d801739f4e584f573f9fba` (packet E2's
own integration commit, which already carries packets A through E2 and Realtime's landed wiki
registration); dispatch from that commit or its reviewed integration descendant. Slice 1 has no
prior slice to resume from:
`run-executor.sh 040-6-e3-plan-import 1 <a packet-containing commit sha descended from a43542cb1b3a8da2f8d801739f4e584f573f9fba> --batch batch-6`
(the launcher's batch-6 default supplies `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`).
Slices 2 and 3 resume the clone the previous slice built:
`run-executor.sh 040-6-e3-plan-import 2 <the same packet-containing commit sha> --resume --require-ancestor <sha of slice 1's planner commit> --preserve evidence --batch batch-6`,
and likewise for slice 3 against slice 2's planner commit. No slice binds a port or needs the
network, so **no slice needs `--network`**; no slice cites an earlier slice's saved evidence beyond
its own immediately preceding slice's committed tree, so **no slice needs `--seed`**.

Stop on any of: a red checkpoint reporting `0 tests ran` (the `-t` filter did not match); a mutation
that leaves its named test passing (restore, check the location against section 10, redo once, stop
if it still passes); a step-0 line in section 7 not printing what it says; a section 10 edit anchor
that does not match the file as found (the file drifted from what this packet assumed — stop and
report the mismatch rather than inventing a repair); a pin (`kinds.json` entry count) that differs
from this packet's recorded baseline before any edit of this packet's own; any sign that extraction
changed `ImportService`'s or `prepareImport`'s runtime behaviour rather than only their location; and
any edit this packet does not itself prescribe that a check nonetheless requires (an out-of-lane
fix) — report the block, do not make it.

## 1. Goal and non-goals

**Goal.** Extract Plan import — the map's `imports: ImportService` export, admitted over `Clock`,
`Scheduler`, `UnitOfWork`, `Broadcaster` and a per-scope `ImportServices` factory — as the fourth
sealed DI Bag module, following Plan history's, Bounded replay sweep's and Realtime's exact pattern
from `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md` and
`docs/superpowers/plans/2026-09-21-batch-6/040-6-e2-realtime.md`: a module directory with a README,
a contract, a labelled `module.ts` and a composition check, proving by test that the production
installer hands out the contract's exports and nothing else, and that the module's label names a
binding in a real DI failure message; the former files left as compatibility re-export shims;
`compose.ts` installing the module instead of constructing `ImportService` by hand; `kinds.json`
rows rewritten in place. This packet also answers, by measurement (section 3), the question every
prior 040.6 packet's own section 9 left as "next": whether Plan import's wiki-pilot registration
(task 7.5) can land the same way Plan history's, Bounded replay sweep's and Realtime's did. It
cannot — section 3 and section 13 record why, with the literal refusal observed, and hand the
question to a later change rather than inventing a workaround.

**Non-goals.** No library version bump: `di-bag` stays 0.4.0. No frontend, no gateway, no MCP. No
change to Plan history, Bounded replay sweep or Realtime. No new checker over source shapes: the
sideways-boundary rows this packet adds are the same identity-based mechanism
`ports/sideways-type-boundaries.test.ts` already uses. No `docs/wiki-policy/modules.json` row, no
`docs/wiki-policy/policy.json` boundary and no `apps/wiki/cli/src/policy/pilot-policy.test.ts` edit:
section 3 measures that no valid, non-empty `baselineEntries` exists for this module under the
pilot's current rename-tracking mechanism, and section 13 hands that finding to the map rather than
fabricating a predecessor or accepting a refused empty baseline. No change to
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s pinned legacy-occurrence numbers: unlike
Realtime's own slice 3, this packet touches no file that changes what that sweep counts, so the
`historical policy selector or baseline`/`occurrences`/digest triple Realtime's own packet moved to
`45`/`263`/`a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4` stays exactly there. No
second module: Plan import alone was the clear next pick after Realtime (section 4); Saved plans,
Authentication and Optimization are handed to later packets in dependency order (section 9).

## 2. Read first

| File                                                                                                                                    | Why                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                            | Rules R1 to R5; read only the entry your slice needs.                                                                                                                                                                               |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`                                                                 | The ownership map: Plan import's row (`imports: ImportService`; requirements `Clock`, `Scheduler`, `UnitOfWork`, `Broadcaster`, per-scope `ImportServices` factory).                                                                |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md`                                                      | The pattern-setter: module shape, the single-private-binding shape this module reuses (Plan import needs one private binding, `importOptions`, not two like Realtime's).                                                            |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e2-realtime.md`                                                                        | The third module, landed: slice shape, wiki-registration mechanics this packet could **not** reuse, and its own section 9's "Then — Plan import" note.                                                                              |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`                                                                | The wiki registration mechanism verbatim, and "Deferred: label agreement" — the precedent this packet's own deferral follows.                                                                                                       |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                                        | Task 3.4 ("Plan import, with its per-scope factory") is this packet's own task; task 1.2's own note ("`import.service.ts:148` builds one too") is read before any edit.                                                             |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s "Standard blocks every packet uses" — "OpenSpec validation"                     | The exact `jq -s -e` contract every OpenSpec validation in section 7 uses; never a loose success check.                                                                                                                             |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                                                                  | The identity-based no-sideways rule; slice 1 adds two new rows, scoped to `module/plan-import/`, the same shape Realtime's own slice 1 added.                                                                                       |
| `libs/wbs/application/core/src/service/broadcast.ts`                                                                                    | `AnnouncementCollector` still lives here, unmoved (task 1.2's own note); Plan import continues to import it from this location, unchanged by this packet.                                                                           |
| `tools/tool-devsync/src/service-kinds.ts`                                                                                               | `SERVICE_ROOTS` names exactly three directories; `src/module` is not one of them, so no new `kinds.json` row is needed for either file this packet moves.                                                                           |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                                                                         | `pins exact pre-index tuples and passes observe lint from external trust` compares every boundary's `baselineEntries` against `entriesAt(policy.pilot.sourceRevision)`; measured, not edited, by this packet (section 3).           |
| `apps/wiki/cli/src/policy/trust.ts`                                                                                                     | `trusted boundary baseline is empty: <id>` (line 407) is the exact refusal section 3 reproduces.                                                                                                                                    |
| `apps/wiki/cli/src/rules/kinds.ts`                                                                                                      | `moduleLayoutObservations` — the Burokrat rule model's own module-layout requirement (a `<!-- module-index -->` block and a `contract.ts`), independent of the wiki pilot; this module still satisfies it.                          |
| `libs/wbs/application/core/src/compose.ts`, `src/index.ts`                                                                              | Slice 2 edits both; read `composeServices`'s `imports: new ImportService({...})` construction and the export barrel's sort order.                                                                                                   |
| `libs/wbs/application/core/src/service/import.service.ts`, `src/service/prepare-import.ts`                                              | Slice 1 moves both; read them in full before editing.                                                                                                                                                                               |
| `libs/wbs/application/core/src/http/import.routes.ts`, `src/testing/import-service-source-contract.ts`, `src/testing/writes-fixture.ts` | Relative importers of `service/import.service.ts` that must keep resolving through the compatibility shim.                                                                                                                          |
| `libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts`, `libs/wbs/adapters/store-memory/src/import.service.test.ts`             | Consume `@wbs/core/testing/import-service-source-contract`, which itself deep-imports the shim by relative path — the two-level shim chain slice 2 proves unchanged.                                                                |
| `libs/wbs/adapters/store-sqlite/src/import-performance.db.test.ts`                                                                      | A **different** consumer: imports `ImportService`, `prepareImport` and `servicesOver` directly from `@wbs/core`'s own barrel, not through `testing/import-service-source-contract.ts` — a one-level chain (barrel → shim → module). |

## 3. Verified facts

Every line was read, or the command run, in this private worktree of
`a43542cb1b3a8da2f8d801739f4e584f573f9fba` on 2026-09-23.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1.2 is unticked, and its own running note already names this packet: "The collector stays in `service/broadcast.ts` and moves with 5.2: `import.service.ts:148` builds one too, so Plan commands cannot own it privately before that module exists without a K6 feature-to-feature edge." `broadcast.ts` is not classified into any sealed module today — it stays a shared, unsealed file in `service/`, imported by both Plan import and (eventually) Plan commands. Moving `import.service.ts` into `module/plan-import/` and continuing to import `AnnouncementCollector` from `../../service/broadcast` (one directory level deeper) is therefore not a sideways edge to another sealed module: it is the same relationship the file already had, unmoved. No preparation from the map's "Required no-sideways preparations" list (1 through 8) names Plan import as blocked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `openspec/changes/adopt-di-composition/tasks.md`'s task 1.2, read in full before any edit; `grep -n "^import" libs/wbs/application/core/src/service/import.service.ts` (line 8: `import { AnnouncementCollector } from './broadcast';`, unmoved by any prior packet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `service/import.service.ts` (466 lines) and `service/prepare-import.ts` (739 lines) import only ports (`Clock`, `Broadcaster` from `ports/project-event.ts`, `Scheduler`, `SubtreeCopy`, `Scope`/`UnitOfWork`, `StoredDependency`, `WorkItem`), `@wbs/contracts`/`@wbs/domain`/`@wbs/validation`, `./broadcast` (`AnnouncementCollector`), `./directory.service` and `./work-item.service` (types only), and, between themselves, `./prepare-import` and `./clean-name`/`./command-normalizers`/`./dependency` — zero sideways edges to `service/auth.service.ts` or `http/endpoint.ts`. Total 1,205 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Read both files in full; `grep -n "^import"` over each; matches the map's own Plan import row exactly (`Clock`, `Scheduler`, `UnitOfWork`, `Broadcaster`, per-scope `ImportServices` factory; private member `prepare-import.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `kinds.json` already carries pre-classified rows for both files: `service/import.service.ts` (`feature`, `capability: plan-import`) and `service/prepare-import.ts` (`support`, `"private member of import.service.ts"`). Neither file's classification needs correcting — task 1.8 already did that in a prior packet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `docs/code-organization/kinds.json`, read before any edit; `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"` printed `95` both before and after this packet's own rewrite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` names exactly `libs/wbs/application/core/src/service`, `.../use-cases` and `apps/wbs/be-01/src/service`; `src/module` is outside all three, so moving both files into `module/plan-import/` needs no new `kinds.json` row, matching every prior 040.6 module's own precedent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tools/tool-devsync/src/service-kinds.ts:15-19`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `libs/wbs/application/core/src/service/service-boundaries.test.ts`'s own `services` array does **not** name `import.service` or `prepare-import` — unlike Realtime's and Bounded replay sweep's own moved files, neither is asserted to exist at its old `service/` path by that ESLint sweep. The compatibility shims are still needed, but for a different, narrower reason: real relative importers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `libs/wbs/application/core/src/service/service-boundaries.test.ts:8-44`, read in full; neither `import.service` nor `prepare-import` appears.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Three files import `service/import.service.ts` by relative path and must keep resolving through the shim: `http/import.routes.ts` (`ImportOutcome`, `ImportService` types), `testing/import-service-source-contract.ts` (`ImportService`, constructs it directly for the source-conformance harness) and `testing/writes-fixture.ts` (`ImportService` type, `Pick<ImportService, 'import'>`). One file imports `service/prepare-import.ts` by relative path: `service/prepare-import.test.ts` (`prepareImport`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `grep -rn "from '\\.\\./service/import.service'\|from '\\./import.service'"` and the equivalent for `prepare-import`, over `libs/wbs/application/core/src`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `testing/import-service-source-contract.ts` is itself reached from two adapter packages through the barrel subpath `@wbs/core/testing/import-service-source-contract`, never by relative path: `libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts` and `libs/wbs/adapters/store-memory/src/import.service.test.ts`. This is Plan import's own two-level shim chain (adapter → barrel subpath → `testing/import-service-source-contract.ts`'s own relative import → the shim → the module), the same proof shape Realtime's own be-01 shim chain needed, over different projects (`wbs-store-sqlite`, `wbs-store-memory` rather than `wbs-be-01`). `libs/wbs/adapters/store-sqlite/src/import-performance.db.test.ts` is a separate, **one-level** consumer: it imports `ImportService`, `prepareImport` and `servicesOver` directly from `@wbs/core`'s own barrel (`import { clockOf, ImportService, prepareImport, servicesOver, ... } from '@wbs/core';`), never through the source-contract harness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `grep -n "^import" libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts libs/wbs/adapters/store-memory/src/import.service.test.ts`; `sed -n '5,14p' libs/wbs/adapters/store-sqlite/src/import-performance.db.test.ts` for the barrel import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **The pilot's frozen `sourceRevision` and the predecessor for Plan import's own `sourceSelector`, answered by measurement.** `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/import.service.ts libs/core/src/service/prepare-import.ts` returns **no entries**. Both files existed before namespacing, at two separate introduction commits — `git show 56a8776b` introduces `libs/core/src/service/import.service.ts` on 2026-09-13; `git show 3188852c` introduces `libs/core/src/service/prepare-import.ts` separately, the same day; commit `7c5dee9e` (2026-09-14, `refactor(repo): namespace WBS projects`) then records one `R100` rename of both files together into `libs/wbs/application/core/src/service/` — but all three commits postdate the pilot's frozen revision (`7851161bf96312750d07b933ca5d42b75ce575c7`, 2026-09-10; `git merge-base --is-ancestor 7851161bf96312750d07b933ca5d42b75ce575c7 7c5dee9e` confirms the freeze is an ancestor of the rename), so the frozen tree still holds neither predecessor under either name. `git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7 --name-only \| grep -c '^libs/wbs/'` returns `0`: the whole `libs/wbs/` namespaced tree postdates the pilot's frozen revision, so **every** boundary under it needs a `sourceSelector` pointing at a real pre-namespacing file, and Plan import's own feature has none at any name. `openspec/changes/plan-json-import/` (the accepted design change this feature implements) does exist at that revision, but only as an unimplemented proposal — using it as a `sourceSelector` would misrepresent what that field tracks (a rename of the same executable code, proven by git blob identity, not a design document that predates its own implementation). **Decision:** this packet adds no `docs/wiki-policy/modules.json` row, no `docs/wiki-policy/policy.json` boundary and no `apps/wiki/cli/src/policy/pilot-policy.test.ts` edit; task 7.5 is left unticked for this module, with a dated note explaining why (section 13). | `git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/import.service.ts libs/core/src/service/prepare-import.ts` (empty); `git show 56a8776b --stat` (import.service.ts's own introduction, 2026-09-13); `git show 3188852c --stat` (prepare-import.ts's own separate introduction, 2026-09-13); `git show 7c5dee9e --stat` (one shared R100 rename, 2026-09-14); `git log -1 --format=%ad --date=short 7851161bf96312750d07b933ca5d42b75ce575c7` (2026-09-10) and `git merge-base --is-ancestor 7851161bf96312750d07b933ca5d42b75ce575c7 7c5dee9e` (exit 0); `git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7 --name-only \| grep -c '^libs/wbs/'` (prints `0`, exits `1` — this workstation's `grep` is ugrep, which exits 1 on zero matches, the same as a missing file, so `test -f` must gate any script relying on this exit status) and `\| grep -c '^libs/core/'` (prints `142`, exits `0`, confirming the sweep itself works); a truncated `git ls-tree -r 7851161b… --name-only` fails outright with `fatal: Not a valid object name 7851161b…`, exit `128` — the ellipsis must never appear in a real command; `openspec/changes/plan-json-import/.openspec.yaml` and `tasks.md` (21 of 22 tasks ticked; only the final exact-SHA host gate, 5.2, remains). |
| **The empty-baseline refusal, reproduced directly.** Registering a boundary `boundary.application.plan-import` with `baselineEntries: []` and running the whole `pilot-policy.test.ts` file failed at `apps/wiki/cli/src/policy/trust.ts:407` with the literal production message `trusted boundary baseline is empty: boundary.application.plan-import` — the same guard `pilot-policy.test.ts:832` already names for `boundary.domain.saved-plan`'s own negative. Filling `baselineEntries` with this directory's own **current** blobs instead (mirroring `boundary.infra.release-assembly`'s own no-`sourceSelector` shape, which works only because `tools/tool-dagger/src/lib` genuinely existed, unmoved, at the frozen revision) failed a **different** assertion: `pilot-policy.test.ts:374`'s `expect(modules.length).toBe(policy.boundaries.length)` first (`Expected: 9`, `Received: 10`, with the same collateral pattern every prior module's own row-only red produces — 15 passed, 6 failed), and once a boundary was added to match, `pilot-policy.test.ts:344`'s own `expect(boundary.baselineEntries).toEqual(baseline.filter(...))` next — because `entriesAt(sourceRevision)` filters the **frozen tree**, not the current one, and the frozen tree holds nothing under `libs/wbs/application/core/src/module/plan-import` (6 passed, 15 failed: this second mutation is markedly worse than the first, because it invalidates the structural comparison every OTHER already-registered boundary's own row also runs inside the same loop, not only Plan import's). Both mutations were reverted before this packet's own commit.                                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/wiki/cli/src/policy/trust.ts:407`; `apps/wiki/cli/src/policy/pilot-policy.test.ts:344,374,832`; both mutations rehearsed once and reverted by the planner during this packet's own authoring, `cmp`-proved (section 6, rows 9 and 10 — not an executor obligation; see section 7 slice 3's own note).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The Burokrat rule model's own module-layout requirement (`apps/wiki/cli/src/rules/kinds.ts`'s `moduleLayoutObservations`, `MOD-LAYOUT` in `apps/wiki/cli/src/rules/registry.ts`) is independent of the wiki content-review pilot: it discovers a "module directory" from any `*.feature.ts`-suffixed file inside it and then requires only a `<!-- module-index -->`-carrying README and a regular-file `contract.ts` — neither check touches `docs/wiki-policy/modules.json` or `policy.json`. This module has both, so it is not exempt from that rule even though it is not a pilot member. `createCandidate()` clones committed `HEAD` and overlays only the fixed `pilotPaths` array, which excludes this module's README, so the pilot suite cannot see an uncommitted module-index block either way — adding it changes nothing the pilot suite counts (21 passed, 0 failed, 296 assertions both with and without it, a non-regression check only). What actually proves the Burokrat rule model accepts the block is a **planner-only** check, run against this packet's own committed slice-3 SHA: `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 3's own commit SHA>` reports 12 indexes, one of them `{"indexPath": "libs/wbs/application/core/src/module/plan-import/README.md", "moduleId": "module.application.plan-import", "members": [...six files...]}`, with zero `reviewDebt` entries naming this module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `apps/wiki/cli/src/rules/kinds.ts:137-181`; the non-regression check rehearsed both ways (section 6, row 11); `check-indexes committed` run against commit `28097eae` in this packet's own rehearsal, output saved and inspected (section 8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 4. Why this module and not another

Packet A's own section 9 and packet E2's own section 9 both listed the remaining process modules in
dependency order: Saved plans (blocked on task 1.7), then Plan import, then Authentication, then
Optimization. Measured directly against the tree at `a43542cb1b3a8da2f8d801739f4e584f573f9fba`
rather than assumed from either packet's own note:

| Candidate       | Sideways edges after A-E2                                                                 | Total lines                                                 | Composition hazard                                                                                                                                  | Verdict                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan import** | **0**                                                                                     | **1,205** (466 + 739)                                       | None: the per-scope `ImportServices` factory is a permitted feature-to-resource edge, passed through as a requirement, not built inside the module. | **Chosen.** Zero sideways edges, no open preparation, the only new complication (wiki registration) resolved by measurement, not invention. |
| Saved plans     | 0 (feature→resource only, permitted)                                                      | ~1,700 (`saved-plan.service.ts` 996 + five satellite files) | `saved-plan-retry.ts` is still unresolved (task 1.7 unticked): "wire or delete … before extraction."                                                | Still blocked on the same open preparation packet E2 recorded.                                                                              |
| Authentication  | 0 as a source; several other modules used to import it sideways, all stopped via task 1.4 | 178 + `login-throttle.ts` 152                               | Absorbing `LoginThrottle` and the accountful/accountless overload is the map's largest single-module task after Plan commands.                      | Larger scope; not preferred over Plan import for this packet.                                                                               |
| Optimization    | N/A (lives under `apps/wbs/be-01`, not this library)                                      | Large                                                       | Preparations 1.5/1.6's second half still open (the cache-key port is still owed).                                                                   | Blocked on its own preparations; last in dependency order per packet A's own section 9.                                                     |

Plan import is the only remaining candidate with zero sideways edges and no open architectural
preparation. Its own wiki-registration complication is not a preparation this packet could complete
by doing more work; it is a limit of the pilot mechanism itself, measured and handed off rather than
worked around (section 3, section 13).

## 5. File plan

| Path                                                                      | Slice   | Create or modify                                                                                                                |
| ------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/plan-import/module.test.ts`         | 1       | create **first**, for the red                                                                                                   |
| `libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts` | 1       | the moved `service/import.service.ts`                                                                                           |
| `libs/wbs/application/core/src/module/plan-import/prepare-import.ts`      | 1       | the moved `service/prepare-import.ts`                                                                                           |
| `libs/wbs/application/core/src/module/plan-import/contract.ts`            | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/plan-import/module.ts`              | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/plan-import/check.ts`               | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/plan-import/README.md`              | 1, 3    | slice 1 creates it without a `module-index` block or "Wiki registration"; slice 3 replaces it with section 10.8's final content |
| `libs/wbs/application/core/src/service/import.service.ts`                 | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/service/prepare-import.ts`                 | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`    | 1       | modify: two new rows added, scoped to `module/plan-import/`                                                                     |
| `openspec/changes/adopt-di-composition/verify.md`                         | 1, 2, 3 | modify: each slice appends its own baselines, deltas and evidence basenames                                                     |
| `libs/wbs/application/core/src/compose.ts`                                | 2       | modify: install through `installPlanImport`                                                                                     |
| `libs/wbs/application/core/src/index.ts`                                  | 2       | modify: two export lines                                                                                                        |
| `docs/code-organization/kinds.json`                                       | 2       | modify: two rows rewritten in place, 95 entries unchanged                                                                       |
| `openspec/changes/adopt-di-composition/tasks.md`                          | 3       | modify: tick 3.4, extend 7.5 with the wiki-registration finding                                                                 |

`docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`,
`apps/wiki/cli/src/policy/pilot-policy.test.ts` and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` are **not** in this list: section 3 and
section 13 measure that no valid registration exists for this module today, and no slice touches any
of the four.

**Neighbours.** No other batch-6 packet owns any of these paths.
`openspec/changes/adopt-di-composition/tasks.md` is also touched by A/B/C/D/E/E2's own ticks, all
already landed; this packet's edits are additive to untouched lines. Section 12's per-slice
hand-over lists are each scoped to that slice's own `base=$(git rev-parse HEAD)`, so the planner's
own commits (including a revision of this packet file) cannot break them.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of
`a43542cb1b3a8da2f8d801739f4e584f573f9fba`, against the final listings in section 10; restore a
mutated file from a copy under `"$TMPDIR"` and prove it with `cmp` before asserting on any captured
status.

| #   | Where                                                                                                                                                               | Fault injected                                                                                                                                                                                                                                                          | Test that observed it                                                                                                                                | Literal fragment observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, on the unchanged tree                                                                                                                                  | none; `contract.ts`, `module.ts` and `check.ts` do not exist yet                                                                                                                                                                                                        | `module.test.ts`                                                                                                                                     | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | slice 1 green, first attempt (after fixing two autofixable lint diagnostics)                                                                                        | all module files written                                                                                                                                                                                                                                                | `module.test.ts`                                                                                                                                     | `6 pass`, `0 fail`, `8 expect() calls`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3   | `module.ts`'s single `buildModule` call, the key tuple                                                                                                              | `['imports', 'importOptions']` in place of `['imports']`                                                                                                                                                                                                                | `keeps its private bindings out of a host graph`, `labels its private bindings with the module name`, `names itself when a host omits a requirement` | `resolve('importOptions')` returned the raw options object instead of throwing; `inspectGraph()` reported bare `importOptions`, not `application.plan-import/importOptions`; `3 pass`, `3 fail`                                                                                                                                                                                                                                                                                                                        |
| 4   | `module.ts`, the same call, restored then the label argument alone                                                                                                  | `{ label: PLAN_IMPORT_LABEL }` removed                                                                                                                                                                                                                                  | the two label assertions                                                                                                                             | `inspectGraph()` reported `importOptions` unlabelled; the missing-requirement message named `importOptions` alone; `4 pass`, `2 fail`                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | `check.ts`, `installPlanImport`'s single `return`                                                                                                                   | `const exposed = { imports: bag.resolve('imports'), bag }; return exposed;` — structurally assignable (returning the object literal directly instead fails `wbs-core:typecheck` with TS2353 and is not a valid fault)                                                   | `exposes only the contract exports from its installer`, its FIRST assertion                                                                          | `Object.keys(exposed)` reported `["bag", "imports"]` against `["imports"]`; `5 pass`, `1 fail`; `wbs-core:typecheck` exits 0                                                                                                                                                                                                                                                                                                                                                                                           |
| 6   | `check.ts`, the same `return`, made type-correct                                                                                                                    | `Object.assign(bag.resolve('imports'), { resolve: bag.resolve.bind(bag) })`                                                                                                                                                                                             | the same test, its SECOND assertion                                                                                                                  | `Expected: true`, `Received: false`; `5 pass`, `1 fail`. `wbs-core:typecheck` **still exits 0** on this mutation, which is why the enumeration test exists                                                                                                                                                                                                                                                                                                                                                             |
| 7   | `ports/sideways-type-boundaries.test.ts`, unchanged rule, injected import                                                                                           | `import type { Identity } from '../../http/endpoint';` prepended to `plan-import.feature.ts`                                                                                                                                                                            | `rejects the checked sideways-type import routes`                                                                                                    | `[ "module/plan-import/plan-import.feature.ts: '../../http/endpoint' reaches http/endpoint.ts", "…: Identity reaches http/endpoint.ts" ]`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                                                          |
| 8   | `ports/sideways-type-boundaries.test.ts`, the new `service/auth.service.ts` row, injected independently                                                             | `import type { AuthenticatedUser } from '../../service/auth.service';` prepended to `plan-import.feature.ts` (restored from row 7's own copy first, so this fault stands alone)                                                                                         | `rejects the checked sideways-type import routes`                                                                                                    | `[ "module/plan-import/plan-import.feature.ts: '../../service/auth.service' reaches service/auth.service.ts" ]` — **only** that one violation, no `http/endpoint.ts` entry; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                         |
| 9   | **planner-only** (not an executor step), `docs/wiki-policy/policy.json`, a boundary with an empty baseline                                                          | `boundaryId: "boundary.application.plan-import"`, `selector` prefixed at this module's own directory, `baselineEntries: []`, appended to `boundaries`                                                                                                                   | `apps/wiki/cli/src/policy/pilot-policy.test.ts`, the whole file, through the production `lint()`/loader path                                         | `trusted boundary baseline is empty: boundary.application.plan-import` — the exact refusal `apps/wiki/cli/src/policy/trust.ts:407` throws                                                                                                                                                                                                                                                                                                                                                                              |
| 10  | **planner-only** (not an executor step), the same boundary, `baselineEntries` filled with this directory's own current blobs (restored from row 9's own copy first) | six current `{mode, blob, path}` tuples for `check.ts`, `contract.ts`, `module.test.ts`, `module.ts`, `plan-import.feature.ts`, `prepare-import.ts`; `docs/wiki-policy/modules.json` also given a matching `module.application.plan-import` row so the two counts agree | the same whole-file run                                                                                                                              | `pilot-policy.test.ts:344`'s `expect(boundary.baselineEntries).toEqual(baseline.filter(...))` fails: `entriesAt(sourceRevision)` (the FROZEN tree) holds nothing under this module's own prefix, so the expected side is `[]` and the received side is the six current tuples — `Expected - 1`, `Received + 32`; `6 pass`, `15 fail` (worse than row 9's `15 pass`, `6 fail`, because this mutation also breaks the structural comparison every OTHER already-registered boundary's own row runs inside the same loop) |
| 11  | slice 3 step 2, the final README, with and without the `<!-- module-index -->` block                                                                                | none; observing whether an inert, unregistered module-index block changes the wiki-pilot suite's own count                                                                                                                                                              | the whole `pilot-policy.test.ts` file                                                                                                                | `21 pass`, `0 fail`, `296 expect() calls` both ways — the block is genuinely inert to this suite, confirming it is safe to keep for the Burokrat rule model's own separate module-layout requirement                                                                                                                                                                                                                                                                                                                   |

Each assertion has a mutation that names it. Fault 5 fails only the installer test's first assertion
(the leaked key stops the second from running); fault 6 leaves the key list correct and fails only
the second. Faults 7 and 8 are independent: each proves one of the two new sideways rows separately
rather than one fault standing in for both. Rows 9 and 10 are two DIFFERENT refusals on the same
production path, not one red repeated, and neither is an executor obligation — both were performed
once by the planner during this packet's own authoring, outside any dispatched slice, and are
recorded here as established facts section 3 and section 13 also cite: an empty baseline is refused
outright (row 9); a non-empty but wrongly-sourced baseline is refused by the structural comparison
instead, and collaterally breaks every other boundary's own check inside the same loop (row 10) —
this is why the packet does not prescribe either as a real edit for any slice. Row 11 IS an executor
step (slice 3 step 2): it proves only that the `module-index` block does not regress the pilot
suite, not that the Burokrat rule model accepts it — that proof is the planner-only `check-indexes
committed` run section 7 slice 3 and section 8 both record.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `if cmd >"$log" 2>&1; then status=0; else status=$?; fi;
printf 'exit=%s\n' "$status" >>"$log"`; never read a status through `tee` and never `|| true`.
Scratch only under `"$TMPDIR"`, mutation patches and failing output under `"$TMPDIR/evidence"`;
evidence references in `verify.md` are basenames relative to that directory, never absolute clone,
home or temporary paths. The executor never runs `git add`, `git commit` or any other Git-state
command; a working-tree mutation is injected by editing the file directly, observed, then restored
with `cp` from a `"$TMPDIR"` copy and proved with `cmp`. The planner commits each slice, and records
`base=$(git rev-parse HEAD)` in its own step 0.

### Slice 1 — Seal Plan import as a DI Bag module

**Step 0.**

```sh
set -euo pipefail
test ! -d libs/wbs/application/core/src/module/plan-import && echo "gate: module absent"
test -f libs/wbs/application/core/src/service/import.service.ts
wc -l < libs/wbs/application/core/src/service/import.service.ts
test -f libs/wbs/application/core/src/service/prepare-import.ts
wc -l < libs/wbs/application/core/src/service/prepare-import.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache
```

Expect the gate line, `466`, `739`, then exit 0. Record this slice's own whole-core baseline:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice1-core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/slice1-core-baseline.log"
```

Call that pass count `C` and file count `F`. Observed on the rehearsed tree: `555 pass`, `0 fail`,
57 files. The end of this slice requires `C + 6` and `F + 1`, never an absolute number.

Tests first, then the implementation, both inside this one slice:

1. Create `libs/wbs/application/core/src/module/plan-import/module.test.ts` from section 10.1
   verbatim and run it. Expect row 1's red: `error: Cannot find module './check'`, `0 pass`,
   `1 fail`, `1 error`. This red is evidence, not a commit.
2. Move the two files. The planner's form is `git mv`:
   - `service/import.service.ts` → `module/plan-import/plan-import.feature.ts`
   - `service/prepare-import.ts` → `module/plan-import/prepare-import.ts`

   The executor copies each file to its new path instead, and rewrites its own relative imports per
   section 10.2's illustrative diffs (one directory level deeper for every port import and for the
   three imports each file makes of a sibling still in `service/` — `./broadcast`,
   `./directory.service`, `./work-item.service` for the feature file; `./clean-name`,
   `./command-normalizers`, `./dependency` for its private support; `./prepare-import` stays
   unchanged, since both files move together). **Do not delete the old paths:** replace each with
   the compatibility shim of section 10.3 instead — `http/import.routes.ts`,
   `testing/import-service-source-contract.ts` and `testing/writes-fixture.ts` import
   `service/import.service.ts` by relative path, and `service/prepare-import.test.ts` imports
   `service/prepare-import.ts` the same way.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from section 10.4. The README at
   this point carries no `<!-- module-index -->` block and no "Wiki registration" section — only
   title prose, "## Checks" and "## Consumers" — exactly as every prior module's own slice-1 README
   did before its own wiki-registration slice.
4. `bun test ./libs/wbs/application/core/src/module/plan-import/module.test.ts` → exit 0,
   `6 pass`, `0 fail`, `8 expect() calls` (observed).
5. `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → expect exit
   0 for both lint and typecheck on the first attempt: section 10's exact listings already order
   `plan-import.feature.ts`'s own imports correctly (`WorkItemService` moves above the
   `./prepare-import` import, per section 10.2's own diff), so `simple-import-sort/imports` does
   not fire, and `module.test.ts` writes `entry.event.type` with no cast and no unused
   `ProjectEvent` import. Preamble rule 17 (only `simple-import-sort/imports`,
   `simple-import-sort/exports` and `prettier/prettier`, fixed with `bunx eslint --fix` and a
   rerun) remains available **if** the executor's own transcription drifts from section 10's exact
   listing, but is not itself an expected outcome. Any diagnostic outside that rule's own scope is
   a stop: report it rather than repairing code this packet did not itself prescribe.
6. Apply section 10.5's diff to `ports/sideways-type-boundaries.test.ts`: add two new rows scoped
   to `module/plan-import/`. This is a pure addition, not a rename: no existing row ever targeted a
   single Plan import file. Rerun
   `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass`.
7. The four module negatives, rows 3, 4, 5 and 6 of section 6, **one at a time**, each restored
   and `cmp`-proved before the next. Then the two sideways-boundary negatives, rows 7 and 8,
   **each its own fault, restored and `cmp`-proved before the next** — one fault must not stand in
   for both new rows:
   - Row 7: prepend `import type { Identity } from '../../http/endpoint';` to
     `plan-import.feature.ts`, run the same boundary test, expect row 7's fragment, `0 pass`,
     `1 fail`; restore, `cmp`-prove, rerun green (`1 pass`).
   - Row 8: prepend `import type { AuthenticatedUser } from '../../service/auth.service';` to
     `plan-import.feature.ts` instead, run the same boundary test, expect row 8's fragment — **only**
     the `service/auth.service.ts` violation, no `http/endpoint.ts` entry — `0 pass`, `1 fail`;
     restore, `cmp`-prove, rerun green (`1 pass`).

   Add the dated `Proof:` comments: two beside `module.ts`'s `buildModule` call (rows 3 and 4), two
   beside `check.ts`'s `return` (rows 5 and 6), and two in `sideways-type-boundaries.test.ts`'s own
   JSDoc above `routes` (rows 7 and 8, each naming its own fault and fragment separately).

8. Tick nothing yet — `tasks.md` 3.4 ticks in slice 3.
9. Append to `openspec/changes/adopt-di-composition/verify.md`: `C`, `F`, all four module faults,
   rows 3-6, with their literal fragments, both sideways-boundary faults, the evidence basenames,
   and one line naming `contract.ts`'s preserved K3 debt (direct `scope.stores.*` calls inside
   `ImportService.import`'s own `UnitOfWork.run`) and that it is tracked under task 7.4.
10. Only now the closing checks: `(cd libs/wbs/application/core && bun test src)` → exit 0 with
    `C + 6` passes over `F + 1` files (observed `561 pass`, `0 fail`, 58 files); then
    `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0; then
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0 (section 10's own listings are
    already Prettier-clean; no `format:write` pass is needed).

Planner commit: `refactor(core): seal Plan import as a DI Bag module`. Section 12 gives this slice's
exact hand-over path list, `verify.md`'s append included.

### Slice 2 — Compose Plan import from its sealed module

**Step 0.**

```sh
set -euo pipefail
test -f libs/wbs/application/core/src/module/plan-import/module.ts && echo "gate: slice 1 landed"
test -f libs/wbs/application/core/src/compose.ts
grep -cF "new ImportService({" libs/wbs/application/core/src/compose.ts
test -f docs/code-organization/kinds.json
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect the gate line, `1`, then a number; call it `K` and record it (observed `95`; the end of this
slice requires `K`, unchanged, never an absolute figure). Record this slice's own whole-core
baseline the way slice 1 does and call it `C` (observed `561 pass` over 58 files after slice 1).

Record three more pre-edit baselines, before any edit below, so a pre-existing failure is never
mistaken for a regression this slice caused:

```sh
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-domain --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
(cd libs/wbs/adapters/store-sqlite && bun test src/import.service.db.test.ts src/import-performance.db.test.ts)
(cd libs/wbs/adapters/store-memory && bun test src/import.service.test.ts)
```

Expect exit 0 for the first two; the third's and fourth's own pass/fail/file counts are this
slice's own adapter baselines (observed `13 pass`, `0 fail`, `84 expect() calls` across 2 files;
`12 pass`, `0 fail`, `71 expect() calls` across 1 file). This slice's closing table below requires
all four unchanged from these baselines, not merely green.

1. Apply section 10.6's diff to `compose.ts`: import `installPlanImport` and the `ImportService`
   **type** from the new module path, drop the value import from `./service/import.service`, and
   replace `new ImportService({...})` with `installPlanImport({...}).imports` — the same object
   literal's fields (`clock`, `scheduler`, `uow`, `announcements`, `batchServices`) unchanged.
2. Apply section 10.6's diff to `index.ts`: two new export lines in sorted position.
3. Apply section 10.7's diff to `kinds.json`: the two rows for `service/import.service.ts` and
   `service/prepare-import.ts` rewritten in place to the `re-export shim;` disposition (exempt from
   the rationale-required rule); no row added for any file under `module/plan-import/`, and none
   removed.

| Command                                                                                                                                                      | Expect                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain --skip-nx-cache`                                                        | exit 0 (observed clean on the first attempt; if `lint` reports only the three preamble-rule-17 diagnostics on `compose.ts`, `bunx eslint --fix` and a rerun — any other diagnostic is a stop)                                                      |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                                                                        | exit 0                                                                                                                                                                                                                                             |
| `test -f dist/libs/wbs/application/core/portable-composition.js && grep -c "application.plan-import" dist/libs/wbs/application/core/portable-composition.js` | at least `1`                                                                                                                                                                                                                                       |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                                                            | exit 0, unchanged from the be-01-typecheck baseline above                                                                                                                                                                                          |
| `(cd libs/wbs/adapters/store-sqlite && bun test src/import.service.db.test.ts src/import-performance.db.test.ts)`                                            | exit 0, identical to the sqlite baseline above (`13 pass`, `0 fail`, `84 expect() calls` across 2 files observed both times)                                                                                                                       |
| `(cd libs/wbs/adapters/store-memory && bun test src/import.service.test.ts)`                                                                                 | exit 0, identical to the memory baseline above (`12 pass`, `0 fail`, `71 expect() calls` across 1 file observed both times). Confirms the two-level shim chain (adapter → `@wbs/core/testing/...` → this packet's own shim → the module) resolves. |
| `test -f docs/code-organization/kinds.json && python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`          | `K`, the step-0 value, unchanged                                                                                                                                                                                                                   |
| `(cd libs/wbs/application/core && bun test src)`                                                                                                             | exit 0, `C` passes, `0 fail` — this slice adds no test                                                                                                                                                                                             |

Tick nothing in `tasks.md` here either. Append to `openspec/changes/adopt-di-composition/verify.md`:
`K`, `C`, the portable-bundle grep result, the `wbs-domain`/be-01-typecheck baselines (pass/fail
only, both are gates not counts), and the sqlite/memory focused-test baselines and closing counts
side by side. Only after those appends: `GSETTINGS_BACKEND=memory bunx nx format:check --all` →
exit 0.

Planner commit: `refactor(core): compose Plan import from its sealed module`. Section 12 gives this
slice's exact hand-over path list, `verify.md`'s append included.

### Slice 3 — Record the module layout and the wiki-registration finding

**Step 0.**

```sh
set -euo pipefail
git log -1 --format=%H -- libs/wbs/application/core/src/module/plan-import/module.ts
test -f docs/wiki-policy/modules.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
test -f docs/wiki-policy/policy.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/import.service.ts libs/core/src/service/prepare-import.ts
```

Expect a commit hash, then two equal counts — call them `M` and `B` (observed `9` and `9`) — then
**no output** from the `git ls-tree` line. If that line prints a tuple, stop: this packet's own
central finding (section 3) is wrong for the checkout in hand, and the packet needs re-measurement
rather than execution. Also run, before any edit:

```sh
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Record the whole file's own test count, failure count and assertion count as `T`, `TF` and `P`
(observed `21`, `0`, `296` on the rehearsed tree — historical values, never an absolute requirement:
the executor records its own `T`/`TF`/`P` and requires them **unchanged** at step 2 below, not equal
to `21`/`0`/`296`, in case another packet's own edit to this file lands between rehearsal and
dispatch). Expect `TF=0`, then exit 0 for the second command. The whole `pilot-policy.test.ts` file
never writes to the executor's own clone — every candidate is a fresh temporary one — so, unlike
`tool-devsync:test`, the executor may run it directly; give it a generous timeout
(`timeout 600 bun test …`), since it spawns the CLI many times (~300-330s observed).

Also run the "OpenSpec validation" standard block (§2) once, before any edit:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation-baseline.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Expect exit 0. Record `jq -r '.summary.totals.passed' "$report"` as `N` (observed `114`; this
packet adds or removes no OpenSpec change or specification, so closure at step 4 requires exactly
`N` passed and `0` failed, never an absolute figure another packet's own OpenSpec work could move).

**Rows 9 and 10 of section 6 (the wiki-pilot refusals) are not this slice's own obligation.** They
were established once, by the planner, during this packet's own authoring measurement — no numbered
step below re-injects either mutation, and no `--seed` layout is prescribed, because no step
consumes that evidence. The executor's own work in this slice is steps 1–7 below; do not attempt to
reproduce rows 9 or 10, and do not cite evidence for them beyond naming this packet's own section 3
and section 6.

1. Replace `libs/wbs/application/core/src/module/plan-import/README.md`'s content with section
   10.8 verbatim — the `<!-- module-index -->` block and the "Wiki registration" section explaining
   this packet's own finding both land in this one step. `GSETTINGS_BACKEND=memory bunx prettier
--write` it then `--check` it; expect exit 0 both times.
2. Rerun the whole `pilot-policy.test.ts` file from step 0. Expect the identical result: `T` tests,
   `0` failures, `P` `expect()` calls, all unchanged from step 0's own recording (observed `21`
   tests, `0` failures, `296` assertions both times). **This is a baseline/non-regression check
   only, not a proof of registration:** `createCandidate()` clones committed `HEAD` and overlays
   only the fixed `pilotPaths` array, which excludes this module's own README, so this run cannot
   see the uncommitted module-index block either way — it proves only that adding an inert,
   unregistered block does not regress the suite. **Do not** add a row to `modules.json`, a
   boundary to `policy.json`, or this module's README path to `pilotPaths`: section 3's own
   measurement shows every such attempt is refused (row 9 of section 6) or breaks the structural
   comparison every other registered boundary's own row also depends on (row 10 of section 6).
   This slice's own contribution is a **documented, dated finding**, not a registration.
3. Apply section 10.9's diff to `openspec/changes/adopt-di-composition/tasks.md`: tick 3.4
   (recording what slices 1 and 2 already did, and that task 7.5 is explicitly **not** landed for
   this module) and extend 7.5's own running note with the wiki-registration finding, naming this
   packet's own document.
4. Rerun the "OpenSpec validation" standard block from step 0. Expect exit 0, and
   `jq -r '.summary.totals' "$report"` prints `passed` equal to `N` (this packet adds or removes no
   OpenSpec change or specification) and `failed` equal to `0`.
5. `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache` → exit 0. This slice edits no
   TypeScript file; this is a final sanity check, not a target this slice's own edits could break.
6. Append to `openspec/changes/adopt-di-composition/verify.md`: `M`, `B`, `T`/`TF`/`P` and their
   step-0/step-2 comparison, `N`, the empty `git ls-tree` result at the frozen revision, the
   step-2 non-regression result, and the evidence basenames. **Do not** write rows 9 or 10's own
   fragments into `verify.md` as this slice's own observation — cite section 3 and section 6 by
   name instead; they are the planner's own record, not this slice's. **This slice touches no file
   under `apps/wiki/cli/src` or `tools/tool-devsync/src`**, so it does not itself own
   `tool-devsync:typecheck`, `tool-devsync:lint`, `twilight-burokrat:typecheck` or
   `twilight-burokrat:lint:source` — they are covered by the standard integration matrix (section
   8), not by this slice's own baselines.
7. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

**Do not** touch `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`,
`apps/wiki/cli/src/policy/pilot-policy.test.ts` or
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` anywhere in this slice or this packet.

Planner commit: `docs(core): record Plan import's sealed module and its wiki-registration block`.
Section 12 gives this slice's exact hand-over path list, `verify.md`'s append included.

**Planner-only, after this slice's own commit.** `bun run apps/wiki/cli/src/cli.ts check-indexes
committed <repository> <this slice's own commit SHA>` is what actually proves the Burokrat rule
model accepts the module-index block — rehearsed against this packet's own commit `28097eae`: the
report's 12 `indexes` include one with `"indexPath": "libs/wbs/application/core/src/module/plan-import/README.md"`,
`"moduleId": "module.application.plan-import"` and all six module files as `members`, with zero
`reviewDebt` entries naming it. Record this command and its observed `moduleId`/`reviewDebt` result
in `verify.md` once the real commit SHA is known; section 8 lists it as a standing planner check.

## 8. Planner-only checks

| Check                                                                                              | Why it is the planner's                                                                                                                                                                         | Value observed on the rehearsed tree                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-be-01:test:unit`                                                  | One be-01 unit file binds a TCP port (packet A's own finding); nothing in this packet needs loopback, so the target moves, not the dispatch.                                                    | `519 pass`, `0 fail`, 49 files                                                                                                                        |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                    | Writes Git objects over the working tree; the executor's clone is read-only.                                                                                                                    | `366 pass`, `0 fail`, 25 files                                                                                                                        |
| `NX_DAEMON=false bunx nx run wbs-core:test`                                                        | Whole-target integration verification with coverage; runs the same files `test:unit` discovers and no core test binds a port.                                                                   | `561 pass`, `0 fail`, 58 files                                                                                                                        |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                                                       | Opens SQLite databases as a whole target.                                                                                                                                                       | `1091 pass`, `1 skip`, `0 fail`, 92 files                                                                                                             |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                                               | Runs Playwright; the executor has no browser.                                                                                                                                                   | pending planner verification                                                                                                                          |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                               | Whole listener-test target; `apps/wiki/cli/project.json:23` explicitly excludes `packaging/install.test.ts` and `packaging/consumer-bootstrap.test.ts` from it, so it does not cover packaging. | `764 pass`, `0 fail`, 39 files                                                                                                                        |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test:package --skip-nx-cache`                       | The excluded packaging suite (`apps/wiki/cli/project.json:85`, depends on `pack`); no slice of this packet touches packaging, but it is part of the standard integration matrix below.          | `44 pass`, `0 fail`, 6 files                                                                                                                          |
| `bin/h2puni-gate.sh <sha>`                                                                         | Takes the host-wide heavy lock.                                                                                                                                                                 | pending planner verification                                                                                                                          |
| `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 3's own commit SHA>` | Proves the Burokrat rule model's module-layout requirement accepts the new index, independently of wiki-pilot registration; not observable by any executor step (section 7 slice 3's own note). | rehearsed against commit `28097eae`: 12 indexes, one `moduleId: "module.application.plan-import"` with all six files as `members`, `reviewDebt` empty |

This table supplements the mandatory full "Integration verification" matrix in the batch-1 README;
it does not replace that matrix. That matrix — strict OpenSpec validation, the repository-wide
format check, uncached tests/lint/typecheck/build for every project but the Burokrat, and the
Burokrat's own build, source lint and package install test — is run once by the planner on a clean
checkout of the integration commit after this packet merges.

No slice of this packet touches `apps/wiki/cli/src` or `tools/tool-devsync/src` at all — unlike
Realtime's own slice 3, this packet neither registers a wiki boundary nor moves a legacy-pin number
— so `tool-devsync:typecheck`, `tool-devsync:lint`, `twilight-burokrat:typecheck` and
`twilight-burokrat:lint:source` are pure planner-only checks here, covered by the whole-target rows
above; no slice records its own baseline for any of the four.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once (packet A's/D's/E's/E2's own note); do not edit that test or any other test this
packet does not name.

## 9. What the next 040.6 packets should be

1. **Next — Saved plans.** Still blocked on task 1.7 (`saved-plan-retry.ts`: "wire or delete … under
   the accepted saved-plans obligation") before its own extraction packet can start; resolve that
   first.
2. **Then — Authentication.** Absorbs `LoginThrottle` and the accountful/accountless overload split;
   every module that used to import it sideways already stopped via packet C's task 1.4, so it is
   not currently blocking any other module — only its own scope makes it larger than a next pick.
3. **Optimization** stays last: preparations 1.5 and 1.6's second half are still open, and it lives
   under `apps/wbs/be-01`, so its wiki registration will need a `module.backend.optimization`
   identifier rather than `module.application.*` — and, per this packet's own finding, will need its
   own frozen-revision predecessor check before assuming registration is even possible.
4. **A genuine open question for a future change, not a 040.6 packet:** whether the wiki content-
   review pilot should gain a documented mechanism for a boundary with no pre-namespacing
   predecessor — either by moving `sourceRevision` forward to a point after the namespaced tree's
   own creation, or by defining a distinct, explicitly-empty-baseline category the loader accepts
   rather than refuses. This packet does not decide that; it measures the current refusal and hands
   the choice to whoever owns the pilot's own design.

## 10. Exact content

### 10.1 `module.test.ts` (slice 1, step 1)

```ts
import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { planDocumentFixture } from '../../testing/plan-document-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanImport } from './check';
import { PLAN_IMPORT_LABEL } from './contract';
import { planImportModule } from './module';

const STAMP_AT = 1_757_851_200_000;

const requirements = () => {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => STAMP_AT, newId: () => `imported-${String(++next)}` });
  return {
    clock,
    scheduler: fastScheduler,
    uow: source.uow,
    announcements: recordingBroadcaster(),
    batchServices: (scope: Scope, broadcast: Broadcaster) =>
      servicesOver(scope.stores, { clock, broadcast, scheduler: fastScheduler }),
  };
};

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 Plan history's and Bounded
 * replay sweep's own `module.test.ts` record for their two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(planImportModule)
    .register({
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => STAMP_AT, newId: () => 'id' })),
      scheduler: DiBag.fromSyncFactory(() => fastScheduler),
      uow: DiBag.fromSyncFactory(() => openMemorySource().uow),
      announcements: DiBag.fromSyncFactory(() => recordingBroadcaster()),
      batchServices: DiBag.fromSyncFactory(
        () => (scope: Scope, broadcast: Broadcaster) =>
          servicesOver(scope.stores, {
            clock: clockOf({ now: () => STAMP_AT, newId: () => 'id' }),
            broadcast,
            scheduler: fastScheduler,
          }),
      ),
    })
    .build();

describe('the Plan import module', () => {
  it('refuses a document whose deadline sits before the project start, without an admitted batch', async () => {
    const { imports } = installPlanImport(requirements());
    const document = planDocumentFixture();
    const row = document.workItems.at(0);
    if (row === undefined) throw new Error('fixture lost its own first work item');
    row.deadline = '2026-09-13';

    expect(await imports.import(document, 'importer')).toMatchObject({
      ok: false,
      code: 'deadline_before_project_start',
      path: 'workItems[0].deadline',
    });
  });

  it('admits a small document over the graph installPlanImport wires', async () => {
    const announcements = recordingBroadcaster();
    const { imports } = installPlanImport({ ...requirements(), announcements });

    const outcome = await imports.import(planDocumentFixture(), 'importer');

    expect(outcome).toMatchObject({ ok: true, rows: 1 });
    expect(
      announcements.published.some((entry) => entry.event.type === 'project_settings_changed'),
    ).toBe(true);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as Plan history's, Bounded replay sweep's and
   * Realtime's own installer tests: an object with an extra property still
   * satisfies `PlanImportExports`, so only enumerating the returned surface
   * catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installPlanImport(requirements());

    expect(Object.keys(exposed)).toEqual(['imports']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('importOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "importOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PLAN_IMPORT_LABEL}/importOptions`,
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
      .installModule(planImportModule)
      .register({
        clock: DiBag.fromSyncFactory(() => clockOf({ now: () => STAMP_AT, newId: () => 'id' })),
        scheduler: DiBag.fromSyncFactory(() => fastScheduler),
        uow: DiBag.fromSyncFactory(() => openMemorySource().uow),
        announcements: DiBag.fromSyncFactory(() => recordingBroadcaster()),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('imports')).toThrow(
      `Cannot resolve "${PLAN_IMPORT_LABEL}/importOptions": dependency "batchServices" is not registered. Resolution path: imports -> ${PLAN_IMPORT_LABEL}/importOptions -> batchServices.`,
    );
  });
});
```

### 10.2 The two moved files, illustrative relative-import diffs

Not among this packet's `git apply --check`ed diffs (section 15): each file's body is otherwise
byte-for-byte unchanged, so these are shown to make the move's own effect legible, not as a patch to
apply. `plan-import.feature.ts` (the moved `service/import.service.ts`):

```diff
--- /dev/fd/63	2026-09-23 13:20:41.376196940 +0300
+++ /dev/fd/62	2026-09-23 13:20:41.376196940 +0300
@@ -1,19 +1,19 @@
 import type { PlanDocumentRequest } from '@wbs/contracts';

-import type { Clock } from '../ports/clock';
-import type { Broadcaster } from '../ports/project-event';
-import type { Scheduler } from '../ports/scheduler';
-import type { SubtreeCopy } from '../ports/subtree-store';
-import type { Scope, UnitOfWork } from '../ports/unit-of-work';
-import { AnnouncementCollector } from './broadcast';
-import type { DirectoryService } from './directory.service';
+import type { Clock } from '../../ports/clock';
+import type { Broadcaster } from '../../ports/project-event';
+import type { Scheduler } from '../../ports/scheduler';
+import type { SubtreeCopy } from '../../ports/subtree-store';
+import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
+import { AnnouncementCollector } from '../../service/broadcast';
+import type { DirectoryService } from '../../service/directory.service';
+import type { WorkItemService } from '../../service/work-item.service';
 import {
   type ImportPreparation,
   type PreparedNamedEntry,
   type PreparedWorkItem,
   prepareImport,
 } from './prepare-import';
-import type { WorkItemService } from './work-item.service';

 interface ImportServices {
   directory: DirectoryService;
```

`prepare-import.ts` (the moved `service/prepare-import.ts`):

```diff
--- /dev/fd/63	2026-09-23 13:20:41.380196915 +0300
+++ /dev/fd/62	2026-09-23 13:20:41.380196915 +0300
@@ -18,12 +18,12 @@
 } from '@wbs/domain';
 import { type } from '@wbs/validation';

-import type { StoredDependency } from '../ports/dependency-store';
-import type { Scheduler } from '../ports/scheduler';
-import type { WorkItem } from '../ports/work-item-store';
-import { cleanName } from './clean-name';
-import { MOST_CHARACTERS_IN_A_REF_NAME } from './command-normalizers';
-import { canDepend } from './dependency';
+import type { StoredDependency } from '../../ports/dependency-store';
+import type { Scheduler } from '../../ports/scheduler';
+import type { WorkItem } from '../../ports/work-item-store';
+import { cleanName } from '../../service/clean-name';
+import { MOST_CHARACTERS_IN_A_REF_NAME } from '../../service/command-normalizers';
+import { canDepend } from '../../service/dependency';

 type DocumentRow = PlanDocumentRequest['workItems'][number];
 type DocumentStep = PlanDocumentRequest['steps'][number];
```

### 10.3 The two compatibility shims (full replacement content)

`service/import.service.ts`:

```ts
/**
 * Compatibility re-export: Plan import moved into its own sealed module.
 *
 * Kept because `http/import.routes.ts`, `testing/import-service-source-contract.ts`
 * and `testing/writes-fixture.ts` deep-import this path by relative import, and
 * the store-sqlite and store-memory adapters reach `import-service-source-contract.ts`
 * through `@wbs/core/testing/import-service-source-contract`. It goes when every
 * importer names the module.
 */
export * from '../module/plan-import/plan-import.feature';
```

`service/prepare-import.ts`:

```ts
/**
 * Compatibility re-export: Plan import moved into its own sealed module.
 *
 * Kept because `service/prepare-import.test.ts` deep-imports this path by
 * relative import. It goes when every importer names the module.
 */
export * from '../module/plan-import/prepare-import';
```

### 10.4 `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1)

`contract.ts`:

```ts
import type { ImportService, ImportServiceOptions } from './plan-import.feature';

/**
 * What a host must supply to install {@link planImportModule}.
 *
 * `batchServices` is the per-scope `ImportServices` factory the map's Plan
 * import row names: a callback borrowing the Directory and Work item resource
 * contracts over the admitted scope a running import's own unit of work
 * supplies, the same permitted feature-to-resource edge Plan commands' own
 * `batch` factory already is. It is passed through unresolved rather than
 * built here, because building it needs the per-admission resource graph
 * `servicesOver` composes, which this module does not own and does not
 * duplicate.
 *
 * **`uow` carries existing K3 debt this extraction preserves rather than
 * fixes.** `ImportService.import` calls `scope.stores.projects.create`,
 * `scope.stores.priorityBands.replace`, `scope.stores.capacity.set` and
 * `scope.stores.subtrees.insertSubtree` directly inside its own
 * `UnitOfWork.run(scope)` callback — a feature-service reading and writing
 * repository store ports, not the Project/Priority band/Capacity/Work item
 * resource-services K3 requires it to depend on instead. Closing it needs
 * either those resource-services to expose an admitted-scope write surface
 * `ImportService` could call instead, or an explicit exception the kind
 * rules record, neither of which any accepted change supplies today. Task
 * 7.4 of `openspec/changes/adopt-di-composition/tasks.md` is where this
 * module's own K3 debt is tracked; this module claims no K3 compliance.
 */
export type PlanImportRequirements = ImportServiceOptions;

/** What installing {@link planImportModule} adds to a host graph. */
export interface PlanImportExports {
  readonly imports: ImportService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s,
 * `module.application.bounded-replay-sweep`'s and `module.application.realtime`'s;
 * the wiki module identifier is `module.application.plan-import` and the label
 * drops the `module.` prefix.
 */
export const PLAN_IMPORT_LABEL = 'application.plan-import';
```

`module.ts`. Its single `buildModule` call is where faults 3 and 4 go, and where the two dated
`Proof:` comments land after those faults are observed:

```ts
import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { Scheduler } from '../../ports/scheduler';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { PLAN_IMPORT_LABEL } from './contract';
import { ImportService, type ImportServiceOptions } from './plan-import.feature';

/**
 * Plan import as a sealed DI Bag module.
 *
 * Only `imports` is exported. `importOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is reported
 * against `application.plan-import/importOptions` rather than against an
 * anonymous binding.
 *
 * The module registers no disposer, because nothing it owns has one:
 * `ImportService` holds five borrowed ports and callbacks and no timer, socket
 * or handle of its own. Its lifetime therefore stays the composition root's,
 * exactly as `bootBe01` owns the source it borrows.
 */
export const planImportModule = DiBag.createBuilder()
  .register({
    importOptions: DiBag.fromSyncFactory(
      ({
        clock,
        scheduler,
        uow,
        announcements,
        batchServices,
      }: {
        clock: Clock;
        scheduler: Scheduler;
        uow: UnitOfWork;
        announcements: Broadcaster;
        batchServices: ImportServiceOptions['batchServices'];
      }): ImportServiceOptions => ({ clock, scheduler, uow, announcements, batchServices }),
    ),
  })
  .register({
    imports: DiBag.fromSyncFactory(
      ({ importOptions }: { importOptions: ImportServiceOptions }): ImportService =>
        new ImportService(importOptions),
    ),
  })
  .buildModule(['imports'], { label: PLAN_IMPORT_LABEL });
```

`check.ts`. The single `return` is faults 5 and 6's location:

```ts
import { DiBag } from 'di-bag';

import type { PlanImportExports, PlanImportRequirements } from './contract';
import { planImportModule } from './module';

/**
 * Installs {@link planImportModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan import can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanImportExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanImport(requirements: PlanImportRequirements): PlanImportExports {
  const bag = DiBag.createBuilder()
    .installModule(planImportModule)
    .register({
      clock: DiBag.fromSyncFactory(() => requirements.clock),
      scheduler: DiBag.fromSyncFactory(() => requirements.scheduler),
      uow: DiBag.fromSyncFactory(() => requirements.uow),
      announcements: DiBag.fromSyncFactory(() => requirements.announcements),
      batchServices: DiBag.fromSyncFactory(() => requirements.batchServices),
    })
    .build();
  return { imports: bag.resolve('imports') };
}
```

`README.md` (slice 1's version — no `module-index` block, no "Wiki registration" section yet):

```md
# Plan import

The fourth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's and
Realtime's pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the runtime ports, the collector-backed announcement broadcaster and the
per-scope batch factory a host must supply.

`plan-import.feature.ts` (the moved `service/import.service.ts`) admits one prepared archival plan
inside a single unit of work, reconciling deployment-global directory names before writing a fresh
project tree and publishing only after commit. `prepare-import.ts` is its private support: it
validates and normalizes a plan document over pure values, asking only the `Scheduler` port whether
the requested engine is supported. Private bindings are named under the `application.plan-import`
label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/http/import.routes.ts`,
`libs/wbs/application/core/src/service/import.service.ts`,
`libs/wbs/application/core/src/service/prepare-import.ts`,
`libs/wbs/application/core/src/testing/import-service-source-contract.ts` and
`libs/wbs/application/core/src/testing/writes-fixture.ts` keep the former `@wbs/core` deep-import
names.
```

### 10.5 `ports/sideways-type-boundaries.test.ts`, exact diff (slice 1)

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
index 4e547831..28e1bba0 100644
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -64,6 +64,15 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * HTTP-endpoint fault above in place leaves that fault's two violations
  * unchanged, so this second fault is what proves the Realtime Authentication
  * row independently.
+ *
+ * The eighth and ninth rows are preparation 4's other half re-scoped to the
+ * Plan import module's own directory once `import.service.ts` (now
+ * `plan-import.feature.ts`) moved out of `service/` — a directory row, since
+ * the module also holds `prepare-import.ts`, which never carried a principal
+ * type before but should not gain one unnoticed either. Neither of these two
+ * files ever imported `service/auth.service.ts` or `http/endpoint.ts` before
+ * this move; the row is added for the same reason the other module rows were,
+ * not because a violation existed.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -88,6 +97,14 @@ const routes = [
     reaches: 'http/endpoint.ts',
     from: (path: string) => path.startsWith('module/realtime/'),
   },
+  {
+    reaches: 'service/auth.service.ts',
+    from: (path: string) => path.startsWith('module/plan-import/'),
+  },
+  {
+    reaches: 'http/endpoint.ts',
+    from: (path: string) => path.startsWith('module/plan-import/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.6 `compose.ts`, `index.ts`, exact diffs (slice 2)

```diff
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
index c4a8092f..c746b0b0 100644
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -4,6 +4,8 @@ import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
 import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
 import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
+import { installPlanImport } from './module/plan-import/check';
+import type { ImportService } from './module/plan-import/plan-import.feature';
 import { installRealtime } from './module/realtime/check';
 import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
 import type { ReplayBuffer } from './module/realtime/replay-buffer';
@@ -22,7 +24,6 @@ import { AuthService } from './service/auth.service';
 import { CalendarMarkerService } from './service/calendar-marker.service';
 import { CapacityService } from './service/capacity.service';
 import { DirectoryService } from './service/directory.service';
-import { ImportService } from './service/import.service';
 import { LoginThrottle } from './service/login-throttle';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
 import { PriorityBandService } from './service/priority-band.service';
@@ -219,13 +220,13 @@ export function composeServices(
     replayBuffer: buffer,
     uow: source.uow,
     batch,
-    imports: new ImportService({
+    imports: installPlanImport({
       clock: runtime.clock,
       scheduler: runtime.scheduler,
       uow: source.uow,
       announcements,
       batchServices: batch,
-    }),
+    }).imports,
     history: installPlanHistory({
       projectStore: source.stores.projects,
       planEventStore: source.stores.planEvents,
```

```diff
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
index 1c7ac09e..b265a0cb 100644
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -20,6 +20,8 @@ export * from './module/bounded-replay-sweep/contract';
 export * from './module/bounded-replay-sweep/module';
 export * from './module/plan-history/contract';
 export * from './module/plan-history/module';
+export * from './module/plan-import/contract';
+export * from './module/plan-import/module';
 export * from './module/realtime/contract';
 export * from './module/realtime/module';
 export * from './ports/actual-store';
```

### 10.7 `kinds.json`, exact diff (slice 2)

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
index 767f3ce6..5202cf01 100644
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -316,9 +316,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/service/import.service.ts",
-      "kind": "feature",
-      "capability": "plan-import",
-      "rationale": "importRoutes calls it for one atomic user-visible import that owns UnitOfWork and coordinates DirectoryService, work-item insertion, scheduler and announcement ports, the capability the plan-json-import change names"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-import module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/login-throttle.ts",
@@ -359,8 +358,7 @@
     {
       "path": "libs/wbs/application/core/src/service/prepare-import.ts",
       "kind": "support",
-      "disposition": "private member of import.service.ts",
-      "rationale": "ImportService is its only production importer; it validates and prepares a plan document over values but also asks the Scheduler port whether an engine is supported, so it is not pure domain code"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the plan-import module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/priority-band.service.ts",
```

### 10.8 `README.md`, final content (slice 3 replaces the slice-1 version)

```md
# Plan import

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-import","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-import.feature.ts"},{"kind":"path","path":"prepare-import.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The commit-then-publish and directory-names-are-authoritative invariants are documented on ImportService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/import.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/import.service.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/prepare-import.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/import-service-source-contract.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/writes-fixture.ts"}],"knowledgeLimit":"Only the composition root, the core barrel, the two compatibility shims and the two testing fixtures that deep-import them are declared; a deep import of plan-import.feature.ts or prepare-import.ts by a test fixture elsewhere is not tracked here."}} -->

The fourth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's and
Realtime's pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the runtime ports, the collector-backed announcement broadcaster and the
per-scope batch factory a host must supply.

`plan-import.feature.ts` (the moved `service/import.service.ts`) admits one prepared archival plan
inside a single unit of work, reconciling deployment-global directory names before writing a fresh
project tree and publishing only after commit. `prepare-import.ts` is its private support: it
validates and normalizes a plan document over pure values, asking only the `Scheduler` port whether
the requested engine is supported. Private bindings are named under the `application.plan-import`
label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/http/import.routes.ts`,
`libs/wbs/application/core/src/service/import.service.ts`,
`libs/wbs/application/core/src/service/prepare-import.ts`,
`libs/wbs/application/core/src/testing/import-service-source-contract.ts` and
`libs/wbs/application/core/src/testing/writes-fixture.ts` keep the former `@wbs/core` deep-import
names.

## Wiki registration

Not yet a member of `docs/wiki-policy/modules.json`'s content-review pilot, unlike Plan history's,
Bounded replay sweep's and Realtime's own modules. Every existing pilot boundary under this
namespaced tree carries a `sourceSelector` bound to a pre-namespacing predecessor file that existed
at the pilot's frozen `sourceRevision`; the production loader refuses any boundary whose
`baselineEntries` come back empty (`trusted boundary baseline is empty: <id>`), and this module's own
two files were both introduced after that revision — neither has a predecessor anywhere in the tree
at that point, so no `sourceSelector` can be supplied that yields even one matching entry. This is a
limit of the pilot's rename-tracking mechanism, not of this module's own boundaries; see the plan
that extracted this module for the measurement and the exact refusal observed. This directory still
declares the module layout the Burokrat rule model requires independently of the pilot (this
`module-index` block, and `contract.ts`), so it is not exempt from that separate rule.
```

### 10.9 `openspec/changes/adopt-di-composition/tasks.md`, exact diff (slice 3)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
index e93e8b94..5e8d4d09 100644
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -75,7 +75,19 @@
       `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
 - [ ] 3.3 Saved plans, absorbing project and admission checks and the publication after save,
       rename and delete.
-- [ ] 3.4 Plan import, with its per-scope factory.
+- [x] 3.4 Plan import, with its per-scope factory. Landed 2026-09-23 as
+      `libs/wbs/application/core/src/module/plan-import/`, with `service/import.service.ts` and
+      `service/prepare-import.ts` kept as compatibility re-export shims, and
+      `docs/code-organization/kinds.json`'s two rows for them rewritten in place (95 entries,
+      unchanged). The per-scope `ImportServices` factory (`batchServices`) is passed through as a
+      requirement, unresolved, exactly as the map's Plan import row names — the module builds no
+      resource graph of its own. `ImportService`'s existing K3 debt (direct calls into
+      `scope.stores.projects.create`, `priorityBands.replace`, `capacity.set` and
+      `subtrees.insertSubtree`) is preserved rather than fixed and is tracked under task 7.4.
+      Proof: negatives for the installer leaking its bag, its resolver leaking through the
+      returned `ImportService`, the private `importOptions` binding exported, and the label
+      dropped. Wiki registration (task 7.5) is **not** landed for this module; see 7.5's own note
+      below.
 - [ ] 3.5 Authentication, absorbing the login throttle and covering the password-only and OIDC
       graphs; the accountless graph exports neither.
 - [ ] 3.6 Optimization, with its repository ports and event projections.
@@ -148,4 +160,20 @@
       bound to the pre-move `libs/core/src/use-cases/replay.ts` alone — the file `kinds.json`
       classified `capability: realtime` before the move. `gateway-broadcaster.ts`,
       `replay-buffer.ts` and `replay-orchestrator.ts` have no separate baseline entry, for the same
-      reason.
+      reason. **Not landed for Plan import (task 3.4).** Every existing pilot boundary under the
+      namespaced tree is registered through a `sourceSelector` bound to a pre-namespacing
+      predecessor file that existed at the pilot's frozen `sourceRevision`. Both of Plan import's
+      own files existed before namespacing — `libs/core/src/service/import.service.ts` introduced
+      at commit `56a8776b`, `libs/core/src/service/prepare-import.ts` introduced separately at
+      commit `3188852c`, both renamed `R100` into `libs/wbs/application/core/src/service/` at the
+      same commit `7c5dee9e` — but all three commits postdate the pilot's frozen `sourceRevision`,
+      so the frozen tree still holds neither predecessor and no `sourceSelector` yields even one
+      matching entry. The production loader refuses any boundary whose `baselineEntries` come back
+      empty (`trusted boundary baseline is empty: <id>`, observed 2026-09-23 against a
+      deliberately empty baseline). The module still carries a `<!-- module-index -->` block and a
+      `contract.ts`, satisfying the Burokrat rule model's own module-layout requirement
+      independently of the pilot: `check-indexes committed` against this packet's own slice-3
+      commit reports `module.application.plan-import` among its indexes. Registering the wiki
+      boundary needs either the pilot's `sourceRevision` moved forward or a documented exemption
+      for a boundary with no predecessor, neither of which this packet decides; see
+      `docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md`.
```

## 11. Global stop conditions

These are not preconditions — each slice's own step 0 in section 7 holds those, so that a later
slice is never blocked by an earlier slice's own work. Stop on any of the following at any point
(restated from the intro's "Dispatch" paragraph, in the form every prior 040.6 packet's own section
11 uses):

- A red checkpoint reports `0 tests ran`: the `-t` filter did not match. Anchor the joined
  `describe` and title, or use the unanchored title alone; never include Bun's printed `>`.
- A mutation leaves its named test passing. That is first a location mistake: restore, check the
  location against section 10, redo once, and stop if it still passes.
- A command needs the network, or an OpenSpec invocation tries to download.
- A step-0 line in section 7 does not print what it says.
- A section 10 edit anchor (an exact line, diff context or JSON entry) does not match the file as
  found. The file drifted from what this packet assumed; report the mismatch, do not invent a
  repair.
- A pin this packet records before its own edits — `kinds.json`'s entry count — differs from what
  section 7's own step 0 observes.
- Any sign that extraction changed `ImportService`'s or `prepareImport`'s runtime behaviour, rather
  than only their location.
- Any check this packet names is unavailable. Report the block; never skip it silently.
- A check requires an edit this packet does not itself prescribe (an out-of-lane fix). Report the
  block; never make the edit. In particular: **do not** add a `docs/wiki-policy/modules.json` row,
  a `docs/wiki-policy/policy.json` boundary, or a `pilotPaths` entry for this module under any
  circumstance — section 3 and section 6 (rows 9 and 10) show both fail, one of them destructively
  to every other registered boundary's own check.

**Not a stop.** An Nx target outliving the tool's own wait is STILL RUNNING, not failed: poll it
under a status-recording wrapper (`if cmd >"$log" 2>&1 & wait $!; ...` with a background status
file, per the preamble's own sandbox rules) rather than treating the timeout as a failure.

## 12. Ready to commit

Each slice ends in its own planner commit, so there is no single final `git status`. Each slice
records `base=$(git rev-parse HEAD)` in its step 0 and hands over `git diff --name-only "$base"`
plus `git ls-files --others --exclude-standard`, which cannot be broken by the planner's own
commits. Every list below includes the slice's own
`openspec/changes/adopt-di-composition/verify.md` append and, where the slice ticks one,
`tasks.md`: those edits are prescribed, so a hand-over that omitted them would contradict the
slice.

| Slice | `git diff --name-only` adds                                                                                                                                                                                             | Untracked adds                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1     | `libs/wbs/application/core/src/service/import.service.ts`, `.../service/prepare-import.ts` (each replaced by its shim), `.../ports/sideways-type-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md` | the seven files under `libs/wbs/application/core/src/module/plan-import/` |
| 2     | `libs/wbs/application/core/src/compose.ts`, `.../index.ts`, `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`                                                                      | nothing                                                                   |
| 3     | `libs/wbs/application/core/src/module/plan-import/README.md` (its slice-1 content replaced), `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`                        | nothing                                                                   |

## 13. Findings for the map and for packets A-E2's landed code

- **Map, `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`:** no defect
  found. The map's Plan import row (exports, requirements, private members) matches this packet's
  own measurement exactly; the map does not claim wiki registration is automatic for every module,
  and this packet's own finding does not contradict it.
- **Packets A, B, C, D, E, E2:** no defect found in landed code. Packet E2's own section 9 correctly
  named Plan import as the next pick without claiming its wiki registration would be as simple as
  Realtime's own.
- **A genuine limit of the wiki content-review pilot, found by measurement, not by choice.** Every
  boundary registered so far under the namespaced tree (`boundary.application.plan-history`,
  `.bounded-replay-sweep`, `.realtime`) relies on a `sourceSelector` naming a real file that existed
  at the pilot's frozen `sourceRevision` (`7851161bf96312750d07b933ca5d42b75ce575c7`). Plan import's
  own two files (`import.service.ts` at `56a8776b`, `prepare-import.ts` separately at
  `3188852c`) were each introduced on 2026-09-13 and both renamed together (`R100`) into the
  namespaced tree at `7c5dee9e` on 2026-09-14 — every one of those three commits postdates that
  revision, so the frozen tree holds neither file under either name.
  `apps/wiki/cli/src/policy/trust.ts:407` refuses any boundary whose `baselineEntries` come back
  empty, and `apps/wiki/cli/src/policy/pilot-policy.test.ts:344`'s own structural comparison against
  `entriesAt(sourceRevision)` refuses a non-empty baseline sourced from anywhere but that frozen
  tree. Together these mean **no module introduced after the pilot's own frozen revision can be
  registered today**, regardless of how cleanly it seals. This is not a defect in Plan import, in
  this packet, or in any packet before it — every one of them extracted a file that already existed
  at the frozen revision. It is worth a one-line addition to a future wiki-registration packet's own
  scope, or to the map: "a module whose files postdate the pilot's frozen `sourceRevision` cannot be
  registered under the current mechanism; check `git ls-tree <sourceRevision>` for a predecessor
  before promising task 7.5 for it." Saved plans, Authentication and Optimization should each be
  checked the same way before their own packets promise wiki registration.
- **This packet's own module-index block is not wasted work.** The Burokrat rule model's
  `MOD-LAYOUT` requirement (`apps/wiki/cli/src/rules/kinds.ts`) discovers module directories from
  `*.feature.ts`-suffixed files independently of the wiki pilot, and requires only a
  `module-index`-carrying README and a `contract.ts`. This module satisfies that requirement now;
  only its pilot membership is deferred.

## 14. This packet's own document exemption (precondition record, not a slice)

This packet's "Verified facts" section (§3) and "Findings" section (§13) both cite
`libs/core/src/service/import.service.ts` and `libs/core/src/service/prepare-import.ts` — the
pre-namespacing paths this packet's own measurement proves have **no** entry at the pilot's frozen
`sourceRevision` — the same reason packets D, E and E2's own documents needed an entry in
`docs/findings/current-document-check-exemptions.json`. That entry must exist, added alongside this
packet document itself (matching precedent), **before** any slice below dispatches — see the
intro's dispatch paragraph. No slice touches that file:

```json
{
  "path": "docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md",
  "reason": "task packet whose verified facts and findings sections cite libs/core/src/service/import.service.ts and libs/core/src/service/prepare-import.ts to prove neither has a predecessor at the pilot's frozen sourceRevision, which is why this packet registers no wiki-pilot boundary",
  "excuses": ["legacy-root"]
}
```

## 15. Disposition of review 1

**Verdict: READY AFTER FIXES.**

- **Critical 1, §7 slice 1 step 5 expected a lint failure and a cast repair that §10.1's own
  listing does not contain. PARTLY FIXED, then corrected by review 2 (§16): the cast repair was
  removed, but step 5 still required one `simple-import-sort/imports` diagnostic that section 10's
  own already-sorted listings do not produce.** See §16.
- **Critical 2, evidence for faults 9 and 10 was asked of an executor step that never performs them
  and cannot see fresh-`$TMPDIR` evidence across attempts. FIXED by planner ownership, not
  seeding.** Rows 9 and 10 of §6 are now marked `**planner-only** (not an executor step)`; §7
  slice 3's own step 0 states plainly that neither mutation is a slice obligation and that no
  `--seed` layout is prescribed because nothing consumes that evidence; step 6's `verify.md`
  instruction no longer asks the executor to cite fragments it never observed.
- **Important 3, the "module-index is inert" experiment could not observe the edit `createCandidate()`
  overlays. FIXED.** §6 row 11 and §7 slice 3 step 2 now describe that run as a
  baseline/non-regression check only. A new planner-only step, run once against this packet's own
  rehearsed commit `28097eae`, is `bun run apps/wiki/cli/src/cli.ts check-indexes committed
<repository> <commit>` — observed: 12 indexes, one with `"moduleId":
"module.application.plan-import"`, all six module files as `members`, zero `reviewDebt` entries
  naming it. Recorded in §7 slice 3's own closing note and §8's table.
- **Important 4, K3 debt was undocumented. FIXED.** §10.4's `contract.ts` gained a JSDoc paragraph
  naming the preserved direct `scope.stores.*` calls inside `ImportService.import`'s own
  `UnitOfWork.run` and tracking them under task 7.4; §7 slice 1 step 9 now names the same K3 debt
  as part of what that slice appends to `verify.md`. The module's README is unchanged from its
  original content, matching the actually-rehearsed and committed file — the review's own "Fix"
  names contract JSDoc and verification notes, not the README.
- **Minor 5, the frozen-revision history claim was false. FIXED.** §3 and §13 now state the real
  history: `libs/core/src/service/import.service.ts` was introduced at commit `56a8776b`
  (2026-09-13) and renamed `R100` into the namespaced tree at commit `7c5dee9e` (2026-09-14),
  confirmed via `git show --stat` on both commits and `git merge-base --is-ancestor
7851161b 7c5dee9e` (exit 0) — both postdate the pilot's frozen revision (`7851161b`, 2026-09-10),
  so the central finding (no predecessor at the frozen tree) is unchanged.
- **Minor 6, one claimed consumer and one command path were wrong. FIXED.** §2 and §3 now
  distinguish `import.service.db.test.ts`/`import.service.test.ts` (the two-level
  `@wbs/core/testing/import-service-source-contract` chain) from
  `import-performance.db.test.ts` (a one-level chain: direct `@wbs/core` barrel imports of
  `ImportService`, `prepareImport` and `servicesOver`, confirmed by reading its own import block).
  The grep command in §3 now gives `import-performance.db.test.ts`'s full repository-relative path.
- **Minor 7, several internal references were stale. FIXED.** §5's file-plan row now cites §10.8
  (not §10.4) for the final README; §3's two citations now name rows 9/10 and row 11 (not rows
  7/8 and row 9); §10.2's "section 15" reference now resolves to this section, which is where the
  `git apply --check` enumeration below lives.
- **Minor 8, the pilot baseline hard-coded a movable `21 pass`. FIXED.** §7 slice 3 step 0 now
  records the whole file's own test/failure/assertion counts as `T`/`TF`/`P` (observed `21`/`0`/
  `296`, stated as historical, not required) and step 2 requires them unchanged from that baseline,
  never equal to a fixed number.

Every fenced diff in the finished document (five blocks: §10.5, §10.6's two hunks, §10.7, §10.9;
the illustrative import-line diffs in §10.2 are explicitly not among them, per that section's own
note) was extracted and checked with `git apply --check`. None of the five depends on another: each
edits a file none of the other four touches, so all five apply cleanly directly against
`a43542cb1b3a8da2f8d801739f4e584f573f9fba` — re-verified in a scratch worktree against the final,
Prettier-formatted document content after review 2's own revision (§16).

## 16. Disposition of review 2

**Verdict: READY AFTER FIXES.**

- **Critical 1, §7 slice 1 step 5 still required a `simple-import-sort/imports` diagnostic that
  section 10's own already-sorted listings do not produce. FIXED.** Rehearsed fresh: created
  `plan-import.feature.ts` and `prepare-import.ts` with `WorkItemService` already in its section
  10.2-shown sorted position (above `./prepare-import`, not below it), then
  `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` exited `0` for
  both targets on the first attempt — zero diagnostics. `module.test.ts` and the sideways-boundary
  test both stayed green (`6 pass`/`0 fail` and `1 pass`/`0 fail`). Step 5 now expects exit 0 for
  both lint and typecheck; the preamble-rule-17 autofix is stated as a permission for transcription
  drift, not an expected outcome. §15's own Critical-1 entry is corrected to point here rather than
  repeat the wrong claim.
- **Minor 1, §10.9's generated task 7.5 note conflated the two files' introduction commits. FIXED.**
  `git show 3188852c --stat` confirms `libs/core/src/service/prepare-import.ts` was introduced
  separately from `import.service.ts` (`56a8776b`), the same day (2026-09-13); both were renamed
  together at `7c5dee9e`. §10.9's diff, §3's row 108 and §13 now name both introduction commits
  separately.
- **Minor 2, a quoted command used a literal ellipsis. FIXED.** `git ls-tree -r 7851161b…
--name-only` reproduced the exact refusal: `fatal: Not a valid object name 7851161b…`, exit
  `128`. §3's row 108 now uses the complete revision
  (`7851161bf96312750d07b933ca5d42b75ce575c7`) in both quoted commands, and states that this
  workstation's `grep -c` prints `0` but exits `1` on zero matches — the same exit status a missing
  file would produce, confirmed directly (`grep -c '^libs/wbs/'` on the correct output: prints `0`,
  exits `1`; `grep -c '^libs/core/'`: prints `142`, exits `0`).
- **Minor 3, §10.4 and §10.5's initial listings already contained the `Proof:` comments step 7
  instructs the executor to add after observation. FIXED.** The rehearsal commit review 1 produced
  (`28097eae`) is exactly the artifact of this bug: `module.ts` and `check.ts` each ended up with
  their proof blocks duplicated, because the packet's own listing already had them before step 7
  added them again. §10.4's `module.ts` and `check.ts` and §10.5's diff now carry no `Proof:` text;
  rehearsed fresh, the module and boundary tests both stay green without it. Step 7's own
  instruction ("Add the dated `Proof:` comments…") is unchanged, since it already described the
  correct order — only the listings it pointed at were wrong.

Every fenced diff affected by this review (§10.5, §10.9) was regenerated against a real edit of
the corresponding file in a private worktree of `a43542cb1b3a8da2f8d801739f4e584f573f9fba`,
Prettier-checked, and re-verified with `git apply --check` directly against that same commit in a
separate scratch worktree — both applied cleanly. §10.4's `contract.ts`, `module.ts` and
`check.ts` (full listings, not diffs) were rehearsed the same way: written fresh with no `Proof:`
text, then `wbs-core:test:unit`/`lint`/`typecheck` all run clean.
