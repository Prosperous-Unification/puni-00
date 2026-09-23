# 040.6 E2 — Realtime as the third sealed module

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — sixth packet |
| Size class | S, in three slices                                                                                      |
| Slices     | 1 seals the module, 2 installs it from composition, 3 registers it in the wiki pilot                    |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, one remaining process module   |
| Planned on | 2026-09-23, every slice rehearsed end to end in a private worktree of `95754749`                        |

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout `run-executor.sh` clones from must contain this packet file itself
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-e2-realtime.md` must
print an entry) and must be a descendant of `95754749`; dispatch from that commit or its reviewed
integration descendant. Slice 1 has no prior slice to resume from:
`run-executor.sh 040-6-e2-realtime 1 <a packet-containing commit sha descended from 95754749> --batch batch-6`
(the launcher's batch-6 default supplies `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`).
Slices 2 and 3 resume the clone the previous slice built:
`run-executor.sh 040-6-e2-realtime 2 <the same packet-containing commit sha> --resume --require-ancestor <sha of slice 1's planner commit> --preserve evidence --batch batch-6`,
and likewise for slice 3 against slice 2's planner commit. No slice binds a port or needs the
network: the whole `pilot-policy.test.ts` run in slice 3 builds every candidate as a fresh temporary
clone under the system temp directory, so **no slice needs `--network`**. No slice cites an earlier
slice's saved evidence beyond its own immediately preceding slice's committed tree, so **no slice
needs `--seed`**.

Stop on any of: a red checkpoint reporting `0 tests ran` (the `-t` filter did not match); a mutation
that leaves its named test passing (restore, check the location against section 10, redo once, stop
if it still passes); a step-0 line in section 7 not printing what it says; a section 10 edit anchor
that does not match the file as found (the file drifted from what this packet assumed — stop and
report the mismatch rather than inventing a repair); a pin (`kinds.json` entry count,
`modules.json`/`policy.json` counts, the `repo-namespacing-handoff.test.ts` digest/occurrence
numbers) that differs from this packet's recorded baseline before any edit of this packet's own; any
sign that extraction changed `GatewayBroadcaster`'s, `ReplayBuffer`'s or `ReplayOrchestrator`'s
runtime behaviour, delivery order or fallback logic rather than only their location; and any edit
this packet does not itself prescribe that a check nonetheless requires (an out-of-lane fix) —
report the block, do not make it.

## 1. Goal and non-goals

**Goal.** Extract Realtime — the map's `replay: ReplayOrchestrator`/`ReplayGraph` export, with its
current compatibility values `announcements`, `gatewayBroadcaster`, `replayBuffer` — as the third
sealed DI Bag module, following Plan history's and Bounded replay sweep's exact pattern from
`docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md` and
`docs/superpowers/plans/2026-09-21-batch-6/040-6-e-bounded-replay-sweep.md`: a module directory with
a README, a contract, a labelled `module.ts` and a composition check, proving by test that the
production installer hands out the contract's exports and nothing else, and that the module's label
names a binding in a real DI failure message; the former files left as compatibility re-export
shims; `compose.ts` installing the module instead of constructing `ReplayBuffer`, `GatewayBroadcaster`
and `ReplayOrchestrator` by hand; `kinds.json` rows rewritten in place; full wiki-pilot registration
(README index block, `modules.json` row, `policy.json` boundary with a `sourceSelector` to its
predecessor at the pilot's frozen revision), following
`docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`'s mechanism. This packet
also answers, by measurement (section 3), the open composition question Bounded replay sweep's own
section 9 raised: whether the sealed module still lets composition decorate the broadcaster with
`OptimizerTriggerBroadcaster`, or whether the module contract needs to state the callback as an
optional requirement.

**Non-goals.** No library version bump: `di-bag` stays 0.4.0. No frontend, no gateway, no MCP. No
change to Plan history or to Bounded replay sweep beyond what the Broadcaster decision strictly
needs (section 3 finds it needs none: `OptimizerTriggerBroadcaster` and `AnnouncementCollector` are
untouched by this packet). No new checker over source shapes: the sideways-boundary row this packet
adds is the same identity-based mechanism `ports/sideways-type-boundaries.test.ts` already uses (a
path-string predicate whose violations are resolved through the TypeScript checker's own symbol
identity, never a regex or a syntax walk). No label-agreement check: "Deferred: label agreement" in
packet D's own document explains why that remains out of scope for every module, this one included.
No second module: section 4's measurement shows Realtime alone was the clear next pick after
Bounded replay sweep; Saved plans, Plan import, Authentication and Optimization are handed to later
packets in dependency order (section 9).

## 2. Read first

| File                                                                                                                                                            | Why                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                                    | Rules R1 to R5; read only the entry your slice needs.                                                                                                                           |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`                                                                                         | The ownership map: Realtime's row, required no-sideways preparation 6 (root composition owns the optimizer callback and the broadcaster; neither feature imports the other).    |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-a-di-composition-first-module.md`                                                                              | The pattern-setter: module shape, `PLAN_HISTORY_LABEL`, the four negatives, the `check.ts`/`module.ts` split, and its own section 9 general ordering of the remaining modules.  |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-e-bounded-replay-sweep.md`                                                                                     | The second module, landed: slice shape, mutation-inventory form, wiki-registration mechanics, and its own section 9's specific "Next — Realtime" note and composition caveat.   |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`                                                                                        | The wiki registration mechanism verbatim, and "Deferred: label agreement."                                                                                                      |
| `openspec/changes/adopt-di-composition/tasks.md`                                                                                                                | Task 3.2 ("Realtime, implementing the neutral event port") is this packet's own task; 7.5 is the wiki-registration task every module ticks again for its own directory.         |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s "Standard blocks every packet uses" — "OpenSpec validation"                                             | The exact `jq -s -e` contract every OpenSpec validation in section 7 uses; never a loose success check.                                                                         |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`                                                                                          | The identity-based no-sideways rule; slice 1 adds two new rows, the same shape Bounded replay sweep's own slice 1 added for its own directory.                                  |
| `libs/wbs/application/core/src/service/service-boundaries.test.ts`                                                                                              | `services` names every extracted file the ESLint sweep still checks at its old path — `gateway-broadcaster`, `replay-buffer`, `replay-orchestrator` — unchanged by this packet. |
| `tools/tool-devsync/src/service-kinds.ts`                                                                                                                       | `SERVICE_ROOTS` names exactly three directories; `src/module` is not one of them, so no new `kinds.json` row is needed for any file this packet moves.                          |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                                                                                                 | `pilotPaths` is a fixed array `createCandidate()` overlays from the working tree; slice 3 adds one line.                                                                        |
| `libs/wbs/application/core/src/compose.ts`, `src/index.ts`                                                                                                      | Slice 2 edits both; read `composeServices`, the `OptimizerTriggerBroadcaster` decoration and the export barrel's sort order.                                                    |
| `libs/wbs/application/core/src/use-cases/replay.ts`, `src/service/replay-orchestrator.ts`, `src/service/replay-buffer.ts`, `src/service/gateway-broadcaster.ts` | Slice 1 moves all four; read them in full before editing.                                                                                                                       |
| `apps/wbs/be-01/src/services.ts`                                                                                                                                | The one consumer of `GatewayBroadcaster`'s `pushRecorded` method beyond the neutral `Broadcaster` port; section 3 measures this to answer the composition question.             |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `95754749` on 2026-09-23.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packet C's task 1.4 already moved `AuthenticatedUser`/`InternalIdentity` to `@wbs/contracts`, so `use-cases/replay.ts` no longer imports Authentication or `http/endpoint.ts`; the map's required preparation 4 (`replay`'s actor/principal types moving to a neutral contract) is already satisfied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `grep -n "^import"` over `use-cases/replay.ts`; `tasks.md`'s ticked 1.4 entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `use-cases/replay.ts` (26 lines), `service/replay-orchestrator.ts` (110 lines), `service/replay-buffer.ts` (118 lines) and `service/gateway-broadcaster.ts` (104 lines) import only ports (`EventLogStore`, `Clock`, `ProjectEvent`/`Broadcaster` from `ports/project-event.ts`, `PushTransport`) and `@wbs/contracts` — zero sideways edges to any other feature or resource. Total 358 lines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Read all four files in full; matches packet E's own section 4 measurement of the same four files before this packet moved them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **The Broadcaster composition question, answered by measurement.** `GatewayBroadcaster` (the `Broadcaster` port's production adapter) is owned by `service/gateway-broadcaster.ts`. Beyond `compose.ts` itself, exactly one production file needs the **concrete class**, not the neutral `Broadcaster` port: `apps/wbs/be-01/src/services.ts:150` calls `graph.gatewayBroadcaster.pushRecorded(subscription, recorded, event)` to wire `OptimizationCoordinator`'s `pushRecorded` callback — a method the `Broadcaster` interface (`publish`/`latestSeq`) does not declare. `apps/wbs/be-01/src/service/optimization-coordinator.ts` never imports `GatewayBroadcaster`; it receives `pushRecorded` as a plain typed callback (`optimization-coordinator.ts:82`), so widening its type surface costs that file nothing. `OptimizerTriggerBroadcaster` (`service/optimizer-trigger-broadcaster.ts`) only ever calls `.publish`/`.latestSeq` on the instance it wraps — it needs the `Broadcaster` port alone, never the concrete class — and it is built entirely inside `compose.ts`, never inside any DI Bag module (`compose.ts:191-194` at `95754749`; the map: "`OptimizerTriggerBroadcaster` remains root-private wiring"; required preparation 6: "Root composition supplies the optimizer event callback and realtime broadcaster. Neither feature imports the other."). **Decision:** the module exports `broadcaster` as the concrete `GatewayBroadcaster` class (not narrowed to `Broadcaster`); `OptimizerTriggerBroadcaster` is **not** moved into the module and **not** touched by this packet; `compose.ts` calls `installRealtime({...}).broadcaster` and applies the exact same conditional decoration it does today. No new port is created: `ports/project-event.ts` (packet B's neutral port) already is the `Broadcaster` port, and a "GatewayBroadcaster port" would be a second interface with exactly one implementation and no second consumer — manufactured abstraction, not a missing type (R2). | `grep -rn "gatewayBroadcaster\|pushRecorded(" apps libs`; `apps/wbs/be-01/src/services.ts:100-158`; `apps/wbs/be-01/src/service/optimization-coordinator.ts:1-30,82,280`; `compose.ts:9,21,24,182-194,219` (pre-edit, at `95754749`); the map's Realtime row and required preparation 6, read in full. Probed the resulting module shape directly: a four-stage `di-bag` builder chain (private `replayBuffer`→private `broadcasterOptions`/`replayOptions`→public `broadcaster`/`replay`) built and resolved correctly under `bun test` and `wbs-core:typecheck` in a throwaway fixture, then discarded before this packet's own slice 1 (2026-09-23). |
| `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` names exactly `libs/wbs/application/core/src/service`, `libs/wbs/application/core/src/use-cases` and `apps/wbs/be-01/src/service`; `src/module` is outside all three, so a file moved into a module directory needs no new `kinds.json` row regardless of its kind, matching Plan history's and Bounded replay sweep's own precedent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `tools/tool-devsync/src/service-kinds.ts:15-19` (`SERVICE_ROOTS`); confirmed no row exists today for any file under `module/plan-history/` or `module/bounded-replay-sweep/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `kinds.json` already carries pre-classified rows for all four files this packet moves: `use-cases/replay.ts` (`feature`, `capability: realtime`), `service/replay-orchestrator.ts` (`feature`, `capability: realtime`), `service/replay-buffer.ts` (`support`, "move to the realtime module"), `service/gateway-broadcaster.ts` (`support`, "private member of compose.ts"). `service/broadcast.ts` and `service/optimizer-trigger-broadcaster.ts` are classified separately (a different future task, "move it there with task 5.2", and "private member of compose.ts" respectively) and this packet does not move either.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `docs/code-organization/kinds.json`, read before any edit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/wbs/be-01/src/service/gateway-broadcaster.ts`, `replay-buffer.ts` and `replay-orchestrator.ts` are already `export * from '@wbs/core';` shims (be-01's own compatibility layer, predating this packet); `apps/wbs/be-01/src/service/replay-orchestrator.test.ts`, `gateway-broadcaster-order.db.test.ts`, `gateway-broadcaster-durability.db.test.ts` and `step.service.db.test.ts` import `GatewayBroadcaster`/`ReplayBuffer`/`ReplayOrchestrator` through those shims by relative path — the same two-level shim chain packet E's own slice 2 confirmed for `retention-job.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Read all three be-01 shim files; `grep -rn "from '\\./replay-orchestrator'\|from '\\./replay-buffer'\|from '\\./gateway-broadcaster'"` over `apps/wbs/be-01/src`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `service-boundaries.test.ts`'s `services` array already lists `broadcast`, `gateway-broadcaster`, `optimizer-trigger-broadcaster`, `replay-buffer`, `replay-orchestrator`, `retention-job` and `retention-timer` by name, asserting each exists at its old `service/` path and passes ESLint there. This packet's four compatibility shims satisfy it unchanged; `broadcast.ts` and `optimizer-trigger-broadcaster.ts` are untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `libs/wbs/application/core/src/service/service-boundaries.test.ts:8-44`, read in full.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/wiki-policy/policy.json`'s existing `boundary.application.use-cases` covers the whole pre-namespacing `libs/core/src/use-cases` directory prefix as its `sourceSelector`, which already includes `replay.ts`'s own historical predecessor; this is unrelated to (and untouched by) the narrower, single-file `sourceSelector` this packet's own new boundary adds, exactly as Bounded replay sweep's own narrower boundary coexisted with the same wider one for `retention-sweep.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `docs/wiki-policy/policy.json`'s `boundary.application.use-cases` entry, read before any edit; `docs/wiki-policy/modules.json`'s `module.application.use-cases` README, whose `module-index` block still lists `replay.ts` and `retention-sweep.ts` as path memberships even though `retention-sweep.ts` is already a shim, confirming a shim file continues to satisfy that pre-existing directory-prefix membership.                                                                                                                                                                                                                                  |
| `libs/core/src/use-cases/replay.ts` exists at the pilot's frozen revision `7851161bf96312750d07b933ca5d42b75ce575c7`, blob `d18bf8e74e82501358dd994e2226a87e068b9220`. `libs/core/src/service/gateway-broadcaster.ts`, `replay-buffer.ts` and `replay-orchestrator.ts` also exist there, but — mirroring Bounded replay sweep's own precedent for `retention-timer.ts`/`retention-job.ts` — only the feature file gets this packet's own narrow `sourceSelector`; the module's README states that limit explicitly rather than silently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `git ls-tree -r 7851161b… -- libs/core/src/use-cases/replay.ts libs/core/src/service/gateway-broadcaster.ts libs/core/src/service/replay-buffer.ts libs/core/src/service/replay-orchestrator.ts`, all four present.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/findings/current-document-check-exemptions.json` already exempts packets D's and E's own plan documents for the same reason this packet needs an exemption: their exact-content sections repeatedly cite a pre-move `libs/core/…` path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `docs/findings/current-document-check-exemptions.json`, the `040-6-d-wiki-registration.md` and `040-6-e-bounded-replay-sweep.md` entries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pilot-policy.test.ts`'s `createCandidate()` clones the repository fresh from `repositoryRoot` and overlays **only** the fixed `pilotPaths` array from the working tree; a new module's README is invisible to that candidate until its path is added there, and every candidate built while it is invisible reports `pilot module index has no module-index metadata` for it, not only the assertion this packet's own row targets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `pilot-policy.test.ts:30-45,101-119`; rehearsed (section 6, rows 11-12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 4. Why this module and not another

Packet A's own section 9 lists the remaining process modules in order: Bounded replay sweep,
Realtime, Saved plans, Plan import, Authentication, Optimization. Packet E's own section 9,
written after actually extracting Bounded replay sweep, confirmed Realtime as next and flagged the
Broadcaster composition question section 3 above answers. Measured directly against the tree at
`95754749` rather than assumed from either packet's own note:

| Candidate      | Sideways edges after B/C                                        | Total lines                                                 | Composition hazard                                                                                                                                                                                                   | Verdict                                                                                                                        |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Realtime**   | **0**                                                           | **358** (26+110+118+104)                                    | Owns the `Broadcaster` production adapter `GatewayBroadcaster`, wrapped by `OptimizerTriggerBroadcaster`; answered by measurement in section 3 with no change needed to the decorator or to composition's own shape. | **Chosen.** Zero sideways edges, the composition question resolved with the smallest possible change (none, to the decorator). |
| Saved plans    | 0 (feature→resource only, permitted)                            | ~1,700 (`saved-plan.service.ts` 996 + five satellite files) | `saved-plan-retry.ts` is still unresolved (task 1.7 unticked): "wire or delete … before extraction."                                                                                                                 | Blocked on an open preparation task; not independent yet.                                                                      |
| Plan import    | 0                                                               | 466 + `prepare-import.ts` 739                               | None new; capability already accepted (`plan-import`).                                                                                                                                                               | Larger than Realtime; not preferred over it for this packet.                                                                   |
| Authentication | 0 as a source; several other modules used to import it sideways | 178 + `login-throttle.ts` 152                               | Absorbing `LoginThrottle` and the accountful/accountless overload is the map's largest single-module task after Plan commands.                                                                                       | Larger scope; every other module that used to import it sideways already stopped via packet C's task 1.4.                      |
| Optimization   | N/A (lives under `apps/wbs/be-01`, not this library)            | Large                                                       | Preparation 1.5/1.6 (contract extraction, cache-key port) still open.                                                                                                                                                | Blocked on its own preparations; last in dependency order per packet A's own section 9.                                        |

Realtime is the only remaining candidate with zero sideways edges and no _open_ composition
question — its own composition question is resolved in section 3, not left open. One module, not
two: Realtime shares no contract with any other candidate that would make bundling reduce total
work rather than only this packet's own scope discipline.

## 5. File plan

| Path                                                                   | Slice   | Create or modify                                                                                                                |
| ---------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/realtime/module.test.ts`         | 1       | create **first**, for the red                                                                                                   |
| `libs/wbs/application/core/src/module/realtime/realtime.feature.ts`    | 1       | the moved `use-cases/replay.ts`                                                                                                 |
| `libs/wbs/application/core/src/module/realtime/gateway-broadcaster.ts` | 1       | the moved `service/gateway-broadcaster.ts`                                                                                      |
| `libs/wbs/application/core/src/module/realtime/replay-buffer.ts`       | 1       | the moved `service/replay-buffer.ts`                                                                                            |
| `libs/wbs/application/core/src/module/realtime/replay-orchestrator.ts` | 1       | the moved `service/replay-orchestrator.ts`                                                                                      |
| `libs/wbs/application/core/src/module/realtime/contract.ts`            | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/realtime/module.ts`              | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/realtime/check.ts`               | 1       | create                                                                                                                          |
| `libs/wbs/application/core/src/module/realtime/README.md`              | 1, 3    | slice 1 creates it without a `module-index` block or "Wiki registration"; slice 3 replaces it with section 10.9's final content |
| `libs/wbs/application/core/src/use-cases/replay.ts`                    | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/service/gateway-broadcaster.ts`         | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/service/replay-buffer.ts`               | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/service/replay-orchestrator.ts`         | 1       | replaced by a re-export shim                                                                                                    |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` | 1       | modify: two new rows added, scoped to `module/realtime/`                                                                        |
| `openspec/changes/adopt-di-composition/verify.md`                      | 1, 2, 3 | modify: each slice appends its own baselines, deltas and evidence basenames                                                     |
| `libs/wbs/application/core/src/compose.ts`                             | 2       | modify: install through `installRealtime`                                                                                       |
| `libs/wbs/application/core/src/index.ts`                               | 2       | modify: two export lines                                                                                                        |
| `docs/code-organization/kinds.json`                                    | 2       | modify: four rows rewritten in place, 95 entries unchanged                                                                      |
| `docs/wiki-policy/modules.json`                                        | 3       | modify: one row inserted                                                                                                        |
| `docs/wiki-policy/policy.json`                                         | 3       | modify: one boundary appended                                                                                                   |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                        | 3       | modify: one `pilotPaths` line                                                                                                   |
| `openspec/changes/adopt-di-composition/tasks.md`                       | 3       | modify: tick 3.2, extend 7.5                                                                                                    |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`              | 3       | modify: re-pin `historical policy selector or baseline` and `occurrences`, per slice 3's own measured baseline                  |

`docs/findings/current-document-check-exemptions.json` is **not** in this list: this packet's own
document needs the same kind of entry packets D and E needed, added alongside the packet document
itself (matching precedent) **before** any slice below dispatches — see the intro's dispatch
paragraph and section 14. No slice touches that file.

**Neighbours.** No other batch-6 packet owns any of these paths. `openspec/changes/adopt-di-composition/tasks.md`
is also touched by A/B/C/D/E's own ticks, all already landed; this packet's edits are additive to
untouched lines. Section 12's per-slice hand-over lists are each scoped to that slice's own
`base=$(git rev-parse HEAD)`, so the planner's own commits (including a revision of this packet
file) cannot break them.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of `95754749`, against the
final listings in section 10; restore a mutated file from a copy under `"$TMPDIR"` and prove it with
`cmp` before asserting on any captured status.

| #   | Where                                                                                                                         | Fault injected                                                                                                                                                                                                                                                                                                                                             | Test that observed it                                                                                                                                                | Literal fragment observed                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | slice 1 red, on the unchanged tree                                                                                            | none; `contract.ts`, `module.ts` and `check.ts` do not exist yet                                                                                                                                                                                                                                                                                           | `module.test.ts`                                                                                                                                                     | `error: Cannot find module './check'` — `0 pass`, `1 fail`, `1 error`                                                                                                                                                                                                                                                                                                    |
| 2   | slice 1 green, first attempt                                                                                                  | all module files written                                                                                                                                                                                                                                                                                                                                   | `module.test.ts`                                                                                                                                                     | `6 pass`, `0 fail`, `13 expect() calls`                                                                                                                                                                                                                                                                                                                                  |
| 3   | `check.ts`, `installRealtime`'s single `return`                                                                               | `const exposed = { replayBuffer: ..., broadcaster: ..., replay: ..., bag }; return exposed;` — structurally assignable (`exposed`'s inferred type is a superset of `RealtimeExports`, so no excess-property check fires); returning the object literal `{ ..., bag }` directly instead fails `wbs-core:typecheck` with **TS2353** and is not a valid fault | `exposes only the contract exports from its installer`, its FIRST assertion                                                                                          | `[ "bag", "broadcaster", "replay", "replayBuffer" ]` against `[ "broadcaster", "replay", "replayBuffer" ]`; `0 pass`, `1 fail`, `5 filtered out`; `wbs-core:typecheck` exits 0                                                                                                                                                                                           |
| 4   | `check.ts`, the same `return`, made type-correct                                                                              | `Object.assign(bag.resolve('broadcaster'), { resolve: bag.resolve.bind(bag) })`                                                                                                                                                                                                                                                                            | the same test, its SECOND assertion                                                                                                                                  | `Expected: true`, `Received: false`; `0 pass`, `1 fail`, `5 filtered out`. `wbs-core:typecheck` **still exits 0** on this mutation, which is why the enumeration test exists                                                                                                                                                                                             |
| 5   | `module.ts`, the key tuple of its single `buildModule` call                                                                   | `['replayBuffer', 'broadcaster', 'replay', 'broadcasterOptions']` in place of `['replayBuffer', 'broadcaster', 'replay']`                                                                                                                                                                                                                                  | `keeps its private bindings out of a host graph`'s FIRST assertion, `labels its private bindings…`'s FIRST assertion, `names itself when a host omits a requirement` | `resolve('broadcasterOptions')` returned the raw options object instead of throwing; `inspectGraph()` reported bare `broadcasterOptions`, not `application.realtime/broadcasterOptions`; `3 pass`, `3 fail`                                                                                                                                                              |
| 6   | `module.ts`, the key tuple, restored then independently widened the other way                                                 | `['replayBuffer', 'broadcaster', 'replay', 'replayOptions']` in place of `['replayBuffer', 'broadcaster', 'replay']`                                                                                                                                                                                                                                       | `keeps its private bindings out of a host graph`'s SECOND assertion, `labels its private bindings…`'s SECOND assertion                                               | `resolve('replayOptions')` returned the raw options object; `inspectGraph()` reported bare `replayOptions`; `broadcasterOptions` stayed correctly hidden and labelled — `4 pass`, `2 fail`. Proves each private binding's own privacy independently of the other; a fault that leaked only one would leave the module.test.ts row testing the other still green.         |
| 7   | `module.ts`, the options object of the same `buildModule` call, restored first                                                | the `{ label: REALTIME_LABEL }` argument removed                                                                                                                                                                                                                                                                                                           | both label assertions                                                                                                                                                | `inspectGraph()` reported both `broadcasterOptions` and `replayOptions` unlabelled; the missing-requirement message named `broadcasterOptions` alone; `4 pass`, `2 fail`                                                                                                                                                                                                 |
| 8   | `ports/sideways-type-boundaries.test.ts`, unchanged rule, injected import                                                     | `import type { Identity } from '../../http/endpoint';` prepended to `gateway-broadcaster.ts`                                                                                                                                                                                                                                                               | `rejects the checked sideways-type import routes`                                                                                                                    | `[ "module/realtime/gateway-broadcaster.ts: '../../http/endpoint' reaches http/endpoint.ts", "…: Identity reaches http/endpoint.ts" ]`; `0 pass`, `1 fail`                                                                                                                                                                                                               |
| 9   | `ports/sideways-type-boundaries.test.ts`, the new `service/auth.service.ts` row, injected independently                       | `import type { AuthenticatedUser } from '../../service/auth.service';` prepended to `gateway-broadcaster.ts` (restored from row 8's own copy first, so this fault stands alone)                                                                                                                                                                            | `rejects the checked sideways-type import routes`                                                                                                                    | `[ "module/realtime/gateway-broadcaster.ts: '../../service/auth.service' reaches service/auth.service.ts" ]` — **only** that one violation, no `http/endpoint.ts` entry; `0 pass`, `1 fail`. This is what an Authentication-only regression looks like, and only the new row catches it.                                                                                 |
| 10  | slice 2 gate, `kinds.json`                                                                                                    | none; observing the unedited count                                                                                                                                                                                                                                                                                                                         | `python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`                                                               | `95`; the slice's own edit rewrites four rows in place and leaves the count at `95`                                                                                                                                                                                                                                                                                      |
| 11  | slice 3 step 3, `pilotPaths` and the boundary both unchanged, only the mapping row added                                      | new module row present in `modules.json`, no matching boundary in `policy.json` yet                                                                                                                                                                                                                                                                        | `pins exact pre-index tuples and passes observe lint from external trust`                                                                                            | length-parity assertion: `Expected: 8`, `Received: 9`; `0 pass`, `1 fail` on the named test — collaterally, 15 passed / 6 failed / 260 assertions across the whole file (five other cases hit `pilot module index has no module-index metadata: …/module/realtime/README.md` first)                                                                                      |
| 12  | slice 3 step 4, the boundary added too, `pilotPaths` still unchanged                                                          | new module row present in both `modules.json` and `policy.json`, but its README still outside the fixed `pilotPaths` overlay                                                                                                                                                                                                                               | the same named test, a DIFFERENT assertion                                                                                                                           | length parity now PASSES (`9` equals `9`); the discovered-index-per-mapped-module assertion fails instead: `Expected: true`, `Received: false` — collaterally, 14 passed / 7 failed / 264 assertions across the whole file (one more collateral case than row 11's, because the ninth boundary changes which other candidates the fixture touches)                       |
| 13  | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the pinned category kept as unchanged CONTEXT rather than replaced | `'historical policy selector or baseline': 43,` line left in place, `'historical policy selector or baseline': 45,` added as a second line — a duplicate object-literal key                                                                                                                                                                                | `tool-devsync:typecheck`                                                                                                                                             | **TS1117: "An object literal cannot have multiple properties with the same name."** Reproduces exactly review 1's prediction; `bun test` alone does not catch it — Bun accepts the second value of a duplicate key silently, which is why `tool-devsync:typecheck` and `tool-devsync:lint` are added to this slice's own verification, not only the filtered `bun test`. |
| 14  | the same file, unchanged pin, the correct single-line replacement not yet applied                                             | registering the new boundary adds two pinned strings naming `libs/core/src/use-cases/replay.ts` (the `sourceSelector` value and the one `baselineEntries` path)                                                                                                                                                                                            | `every legacy source occurrence and relevant text family is pinned`                                                                                                  | `'historical policy selector or baseline': 43` → `45`, `occurrences: 261` → `263`, digest `fb0d4227…` → `a3db8f97…`; `0 pass`, `1 fail`, `14 filtered out`                                                                                                                                                                                                               |

Each assertion has a mutation that names it. Fault 3 fails only the installer test's first
assertion (the leaked key stops the second from running); fault 4 leaves the key list correct and
fails only the second. Faults 5 and 6 are independent: each widens the tuple by exactly one of the
two private keys, and each leaves the OTHER private binding correctly hidden and labelled — proving
`broadcasterOptions`'s and `replayOptions`'s own privacy separately, rather than one fault standing
in for both, exactly as faults 8 and 9 prove the two new sideways rows separately rather than one
fault standing in for both. Row 11 and row 12 are two DIFFERENT checkpoints on the same named test,
not one red repeated: parity fails first (row 11), then — once the boundary is also added — parity
passes and a different assertion fails (row 12); the packet's own step 3/step 4 split in section 7
mirrors this. Rows 11 and 12 both reproduce the same collateral-failure shape Bounded replay
sweep's own packet recorded for its module (several other cases failing on the same
invisible-README message) — not a defect this packet introduces, a property of
`createCandidate()`'s single fixed overlay array shared by every registered module. Row 13 is not a
fault this packet leaves in place — it is why section 10.11's diff is worded as a replacement, not
an addition.

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

### Slice 1 — Seal Realtime as a DI Bag module

**Step 0.**

```sh
set -euo pipefail
test ! -d libs/wbs/application/core/src/module/realtime && echo "gate: module absent"
test -f libs/wbs/application/core/src/service/gateway-broadcaster.ts
wc -l < libs/wbs/application/core/src/service/gateway-broadcaster.ts
test -f libs/wbs/application/core/src/service/replay-buffer.ts
wc -l < libs/wbs/application/core/src/service/replay-buffer.ts
test -f libs/wbs/application/core/src/service/replay-orchestrator.ts
wc -l < libs/wbs/application/core/src/service/replay-orchestrator.ts
test -f libs/wbs/application/core/src/use-cases/replay.ts
wc -l < libs/wbs/application/core/src/use-cases/replay.ts
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core --skip-nx-cache
```

Expect the gate line, `104`, `118`, `110`, `26`, then exit 0. Record this slice's own whole-core
baseline:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-1-core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/slice-1-core-baseline.log"
```

Call that pass count `C` and file count `F`. Observed on the rehearsed tree: `549 pass`, `0 fail`,
56 files. The end of this slice requires `C + 6` and `F + 1`, never an absolute number.

Tests first, then the implementation, both inside this one slice:

1. Create `libs/wbs/application/core/src/module/realtime/module.test.ts` from section 10.1
   verbatim and run it. Expect row 1's red: `error: Cannot find module './check'`, `0 pass`,
   `1 fail`, `1 error`. This red is evidence, not a commit.
2. Move the four files. The planner's form is `git mv`:
   - `use-cases/replay.ts` → `module/realtime/realtime.feature.ts`
   - `service/gateway-broadcaster.ts` → `module/realtime/gateway-broadcaster.ts`
   - `service/replay-buffer.ts` → `module/realtime/replay-buffer.ts`
   - `service/replay-orchestrator.ts` → `module/realtime/replay-orchestrator.ts`

   The executor copies each file to its new path instead, and rewrites its own relative imports per
   section 10.2's exact diffs (one directory level deeper for `gateway-broadcaster.ts`'s and
   `replay-orchestrator.ts`'s own port imports; `realtime.feature.ts`'s import of `ReplayOrchestrator`
   changes from `'../service/replay-orchestrator'` to `'./replay-orchestrator'`; `replay-buffer.ts`
   carries no import to rewrite). **Do not delete the old paths:** replace each with the
   compatibility shim of section 10.3 instead — `service-boundaries.test.ts:21,30,31` asserts
   `gateway-broadcaster.ts`, `replay-buffer.ts` and `replay-orchestrator.ts` exist at their old
   paths, and `use-cases/admission.test.ts:9` imports `replay` from `./replay` by relative path.

3. Create `contract.ts`, `module.ts`, `check.ts` and `README.md` from section 10.4. The README at
   this point carries no `<!-- module-index -->` block and no "Wiki registration" section — only
   title prose, "## Checks" and "## Consumers" — exactly as Plan history's and Bounded replay
   sweep's own slice-1 READMEs did before their own wiki-registration slices.
4. `bun test ./libs/wbs/application/core/src/module/realtime/module.test.ts` → exit 0, `6 pass`,
   `0 fail`, `13 expect() calls` (observed).
5. `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0
   (observed clean on the first attempt against section 10's exact listings — no autofix needed).
   Preamble rule 17 permits fixing a lint failure without stopping only when its diagnostics are
   exclusively `simple-import-sort/imports`, `simple-import-sort/exports` or `prettier/prettier`:
   `bunx eslint --fix <the named file>` and rerun. Any other diagnostic, including an unused-import
   rule, is a stop, not an autofix — report it rather than fixing it.
6. Apply section 10.5's diff to `ports/sideways-type-boundaries.test.ts`: add two new rows scoped
   to `module/realtime/`. Unlike Bounded replay sweep's own slice 1, this is a pure addition, not a
   rename: no existing row ever targeted a single Realtime file. Rerun
   `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass`.
7. The five module negatives, rows 3, 4, 5, 6 and 7 of section 6, **one at a time**, each restored
   and `cmp`-proved before the next — rows 5 and 6 each widen the exported tuple by exactly one of
   the two private keys, independently, so neither fault stands in for the other. Then the two
   sideways-boundary negatives, rows 8 and 9, **each its own fault, restored and `cmp`-proved
   before the next** — one fault must not stand in for both new rows:
   - Row 8: prepend `import type { Identity } from '../../http/endpoint';` to
     `gateway-broadcaster.ts`, run the same boundary test, expect row 8's fragment (the
     module-specifier and identifier violations reaching `http/endpoint.ts`), `0 pass`, `1 fail`;
     restore, `cmp`-prove, rerun green (`1 pass`).
   - Row 9: prepend `import type { AuthenticatedUser } from '../../service/auth.service';` to
     `gateway-broadcaster.ts` instead, run the same boundary test, expect row 9's fragment — **only**
     the `service/auth.service.ts` violation, no `http/endpoint.ts` entry — `0 pass`, `1 fail`;
     restore, `cmp`-prove, rerun green (`1 pass`).

   Add the dated `Proof:` comments: three beside `module.ts`'s `buildModule` call (rows 5, 6 and 7),
   two beside `check.ts`'s `return` (rows 3 and 4), and two in `sideways-type-boundaries.test.ts`'s
   own JSDoc above `routes` (rows 8 and 9, each naming its own fault and fragment separately).

8. Tick nothing yet — `tasks.md` 3.2 ticks in slice 3, once the wiki registration also lands,
   mirroring how Bounded replay sweep's own module-extraction slice left its wiki task unticked.
9. Append to `openspec/changes/adopt-di-composition/verify.md`: `C`, `F`, all five module faults,
   rows 3–7 (bag leak, exposed resolver, exported `broadcasterOptions`, exported `replayOptions`,
   dropped label), with their literal fragments, both sideways-boundary faults, and the evidence
   basenames.
10. Only now the closing checks: `(cd libs/wbs/application/core && bun test src)` → exit 0 with
    `C + 6` passes over `F + 1` files (observed `555 pass`, `0 fail`, 57 files); then
    `NX_DAEMON=false bunx nx run-many -t lint,typecheck -p wbs-core --skip-nx-cache` → exit 0; then
    `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0 (a `format:write` pass may be
    needed for `module.test.ts`'s own line wrapping — this is reflow, not a content change).

Planner commit: `refactor(core): seal Realtime as a DI Bag module`. Section 12 gives this slice's
exact hand-over path list, `verify.md`'s append included.

### Slice 2 — Compose Realtime from its sealed module

**Step 0.**

```sh
set -euo pipefail
test -f libs/wbs/application/core/src/module/realtime/module.ts && echo "gate: slice 1 landed"
test -f libs/wbs/application/core/src/compose.ts
grep -cF "new GatewayBroadcaster({" libs/wbs/application/core/src/compose.ts
test -f docs/code-organization/kinds.json
python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"
```

Expect the gate line, `1`, then a number; call it `K` and record it (observed `95`; the end of this
slice requires `K`, unchanged, never an absolute figure). Record this slice's own whole-core
baseline the way slice 1 does and call it `C` (observed `555 pass` over 57 files after slice 1).

Record three more pre-edit baselines, before any edit below, so a pre-existing failure is never
mistaken for a regression this slice caused:

```sh
NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-domain --skip-nx-cache
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
(cd apps/wbs/be-01 && bun test src/service/replay-orchestrator.test.ts src/service/gateway-broadcaster-order.db.test.ts src/service/gateway-broadcaster-durability.db.test.ts src/service/step.service.db.test.ts)
```

Expect exit 0 for the first two; the third's own pass/fail/file counts are this slice's own
`be-01 baseline` (observed `38 pass`, `0 fail`, `89 expect() calls` across 4 files). This slice's
closing table below requires all three unchanged from these baselines, not merely green.

1. Apply section 10.6's diff to `compose.ts`: import `installRealtime` and the `GatewayBroadcaster`,
   `ReplayBuffer` and `ReplayOrchestrator` **types** from the new module path, drop the three
   value imports from `./service/gateway-broadcaster`, `./service/replay-buffer` and
   `./service/replay-orchestrator`, and replace the separate `new ReplayBuffer({...})` /
   `new GatewayBroadcaster({...})` constructions and the later `new ReplayOrchestrator({...})` with
   one `installRealtime({...})` call whose result is destructured into `replayBuffer: buffer`,
   `broadcaster` and (later in the same object literal) `replay`. The `onPushFailed` callback body
   is byte-for-byte unchanged from the pre-edit file, and the `OptimizerTriggerBroadcaster`
   decoration of `broadcaster` — the line `runtime.onPlanChanged === undefined ? broadcaster : new
OptimizerTriggerBroadcaster(broadcaster, runtime.onPlanChanged)` — is untouched; section 10.6
   shows both in full. Do not summarize or reconstruct either.
2. Apply section 10.6's diff to `index.ts`: two new export lines in sorted position.
3. Apply section 10.7's diff to `kinds.json`: the four rows for `service/gateway-broadcaster.ts`,
   `service/replay-buffer.ts`, `service/replay-orchestrator.ts` and `use-cases/replay.ts` rewritten
   in place to the `re-export shim;` disposition prefix (exempt from the rationale-required rule);
   no row added for any file under `module/realtime/`, and none removed.

| Command                                                                                                                                                                                                              | Expect                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain --skip-nx-cache`                                                                                                                | exit 0 (observed clean on the first attempt; if `lint` reports only `simple-import-sort/imports`, `simple-import-sort/exports` or `prettier/prettier` on `compose.ts`, preamble rule 17 permits `bunx eslint --fix` and a rerun — any other diagnostic is a stop) |
| `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache`                                                                                                                                                | exit 0                                                                                                                                                                                                                                                            |
| `test -f dist/libs/wbs/application/core/portable-composition.js && grep -c "application.realtime" dist/libs/wbs/application/core/portable-composition.js`                                                            | at least `1`                                                                                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                                                                                                                    | exit 0, unchanged from the be-01-typecheck baseline above                                                                                                                                                                                                         |
| `(cd apps/wbs/be-01 && bun test src/service/replay-orchestrator.test.ts src/service/gateway-broadcaster-order.db.test.ts src/service/gateway-broadcaster-durability.db.test.ts src/service/step.service.db.test.ts)` | exit 0, identical to the be-01 baseline above (`38 pass`, `0 fail`, `89 expect() calls` across 4 files observed both times). Confirms the two-level shim chain (be-01's own shims → `@wbs/core` → this packet's own shims → the module) resolves.                 |
| `test -f docs/code-organization/kinds.json && python3 -c "import json;print(len(json.load(open('docs/code-organization/kinds.json'))['entries']))"`                                                                  | `K`, the step-0 value, unchanged                                                                                                                                                                                                                                  |
| `(cd libs/wbs/application/core && bun test src)`                                                                                                                                                                     | exit 0, `C` passes, `0 fail` — this slice adds no test                                                                                                                                                                                                            |

Tick nothing in `tasks.md` here either. Append to `openspec/changes/adopt-di-composition/verify.md`:
`K`, `C`, the portable-bundle grep result, the `wbs-domain`/be-01-typecheck baselines (pass/fail
only, both are gates not counts), and the be-01 focused-test baseline and closing counts side by
side. Only after those appends: `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `refactor(core): compose Realtime from its sealed module`. Section 12 gives this
slice's exact hand-over path list, `verify.md`'s append included.

### Slice 3 — Register Realtime as a trusted pilot boundary

**Step 0.** Requires slices 1 and 2 committed: `createCandidate()`'s clone only sees committed
content for a path outside `pilotPaths`, and every module source file this slice's README indexes
is outside that array.

```sh
set -euo pipefail
git log -1 --format=%H -- libs/wbs/application/core/src/module/realtime/module.ts
test -f docs/wiki-policy/modules.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
test -f docs/wiki-policy/policy.json
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/use-cases/replay.ts
```

Expect a commit hash, then two equal counts — call them `M` and `B` (observed `8` and `8`, since
Plan history's and Bounded replay sweep's own registrations already landed) — then one
`100644 blob d18bf8e74e82501358dd994e2226a87e068b9220 libs/core/src/use-cases/replay.ts` tuple; if
that last line is empty, stop. Record, each into its own log under `"$TMPDIR/evidence"` with the
`if cmd >"$log" 2>&1; then …` wrapper (so a slow command's completion is durable evidence rather
than a line a later tool call cannot see again):

```sh
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence and relevant text family is pinned'
(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)
```

Expect exit 0, then `1 pass`/`0 fail`/`1 expect() calls`, then `21 pass`/`0 fail` — call that whole
run's assertion count `P` (observed `295`; the executor records its own `P` rather than trusting
this number). The whole `pilot-policy.test.ts` file never writes to the executor's own clone —
every candidate is a fresh temporary one (`createCandidate():101-119`) — so, unlike
`tool-devsync:test`, the executor may run it directly; give it a generous timeout
(`timeout 600 bun test …`), since it spawns the CLI many times (~290-310s observed; one case took
over 80s alone).

This slice also edits `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (step 6) and
`apps/wiki/cli/src/policy/pilot-policy.test.ts` (step 5), so record all four of the following
targets' pre-edit statuses too, before any edit, the same way — an executor that only discovers a
pre-existing failure after editing cannot tell that failure apart from a regression this slice
caused:

```sh
NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
```

Expect exit 0 for all four (observed on the rehearsed tree: all four exited 0, before any edit).
Record each into its own log the same `if cmd >"$log" 2>&1; then …` way as the block above; the
slice's own numbered steps below rerun all four after editing and require the identical exit-0
result, not merely a green run in isolation.

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
packet adds or removes no OpenSpec change or specification, so closure at step 10 requires exactly
`N` passed and `0` failed, never an absolute figure another packet's own OpenSpec work could move).

1. Replace `libs/wbs/application/core/src/module/realtime/README.md`'s content with section 10.9
   verbatim — the module-index block and the "Wiki registration" section both land in this one
   step, together. `GSETTINGS_BACKEND=memory bunx prettier --write` it then `--check` it; expect
   exit 0 both times.
2. Add one row to `docs/wiki-policy/modules.json`'s `modules` array from section 10.8 verbatim
   (insert it immediately before the `module.application.use-cases` entry, alphabetically). Run
   `bun run apps/wiki/cli/src/cli.ts validate module-mapping docs/wiki-policy/modules.json` → exit 0,
   `valid module-mapping`.
3. Row 11's setup, not yet its red: the `pilotPaths` line from step 5 below is **not** applied yet.
   Run the whole `pilot-policy.test.ts` file (the command above, no `-t` filter). Expect exit 1 at
   the length-parity assertion inside "pins exact pre-index tuples and passes observe lint from
   external trust": `Expected: 8`, `Received: 9` (`M` vs `M + 1`) — parity fails because the row is
   registered but the boundary is not yet, so the two arrays disagree in length. Section 6 row 11's
   collateral pattern applies here too: five other cases in the same file also fail, each on the
   invisible-README message, because their fresh candidates see the committed README without its
   uncommitted module-index metadata (observed: 15 passed, 6 failed, 260 assertions across the
   whole file). This red is evidence, not a commit.
4. Add one boundary to `docs/wiki-policy/policy.json`'s `boundaries` array from section 10.8
   verbatim (append it last, so `boundaries.at(0)` stays `boundary.domain.saved-plan`, the pin this
   test's own object-match assertion checks). Rerun the whole file. **The length-parity assertion
   now PASSES** (`M+1` boundaries equal `M+1` mapped modules — nine both sides), and the named test
   fails at a **different** assertion instead: the discovered-index-per-mapped-module check,
   `Expected: true`, `Received: false` — the module is now fully declared on both sides, but its
   README is still invisible to any candidate, since nothing in `pilotPaths` yet names it. The same
   collateral cases fail too, one more than step 3's own red because the ninth boundary changes
   which other candidates the fixture happens to touch (observed: 14 passed, 7 failed, 264
   assertions across the whole file). This is a **separate** checkpoint from step 3's own red, not
   a continuation of the same failure.
5. Apply the diff of section 10.10 to `pilot-policy.test.ts`: add the new README's path to
   `pilotPaths`, alphabetically after `.../module/plan-history/README.md` and before
   `.../use-cases/README.md`. Rerun the whole file. Expect exit 0, `21 pass`, `0 fail`, `P + 1`
   `expect()` calls (observed `296`). **This checkpoint must be rehearsed against the actually
   committed slice 1 and slice 2 trees** — `createCandidate()` clones committed `HEAD` content for
   every path outside `pilotPaths`, so a rehearsal against an uncommitted working tree fails every
   case with `membership target absent: …/module/realtime/check.ts` instead of the shapes above;
   that failure means slices 1/2 are not committed yet, not that this slice's own edit is wrong.
   Rerun `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` and
   `NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache` → exit 0 both,
   identical to step 0's own baseline for these two targets — this is the one edit under
   `apps/wiki/cli/src` this slice makes.
6. The legacy-pin's own red, **filtered, not the whole `tool-devsync:test` target** — that whole
   target is the planner's: it writes Git objects the executor's read-only `.git` refuses, exactly
   as packet D's and E's own slice 3 name. Rerun the filtered legacy-pin command from step 0. Expect
   exit 1, `1 fail`, `0 pass`, `1 expect() calls`, `historical policy selector or baseline` at `45`
   where the pin still says `43`, `occurrences` at `263` where the pin still says `261`, and digest
   `a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4` where the pin still says
   `fb0d422785019f2351c00082e4533b820b0aca3cce8f9789a348e6167099363e`. Apply section 10.11's exact
   diff: **replace** the `43` line with `45` (never keep both — a duplicate `historical policy
selector or baseline` key is TS1117 under `tsc`, rehearsed in section 10.11), replace the digest
   and `occurrences` values, and add one new dated `Proof:` comment naming exactly what changed. If
   the executor's own step-0 baseline does not match the `43`/`261`/`fb0d4227…` this packet
   recorded, stop per section 11 rather than computing a different replacement — see section 10.11.
   Then rerun `NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache` and
   `NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache` → exit 0 both, identical to step
   0's own baseline for these two targets (added specifically because a duplicate-key mutation of
   this pin passes `bun test` silently — Bun accepts the second value of a duplicate object-literal
   key at runtime — and only the type checker refuses it).
7. Rerun the same filtered command. Expect exit 0, `1 passed`, `0 failed`, `1 expect() calls`.
8. Apply section 10.12's diff to `openspec/changes/adopt-di-composition/tasks.md`: tick 3.2
   (recording what slices 1 and 2 already did) and extend 7.5's landed list.
   (`docs/findings/current-document-check-exemptions.json` is **not** touched here or anywhere in
   this packet — its entry for this document is a precondition, per section 14.)
9. `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache` → exit 0. This slice's final
   typecheck, after every edit above; step 0 already ran the same target once, before, as this
   slice's baseline.
10. Rerun the "OpenSpec validation" standard block from step 0. Expect exit 0, and
    `jq -r '.summary.totals' "$report"` prints `passed` equal to `N` (this packet adds or removes no
    OpenSpec change or specification) and `failed` equal to `0`.
11. Append to `openspec/changes/adopt-di-composition/verify.md`: `M`, `B`, `P`, `N`, the historical
    blob tuple, both reds (mapping-parity and discovered-index) and both greens' fragments, the
    pin-move before/after values and digests, both the pre-edit baseline and the post-edit closing
    result for all four of `tool-devsync:typecheck`, `tool-devsync:lint`,
    `twilight-burokrat:typecheck` and `twilight-burokrat:lint:source`, and the evidence basenames.
12. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

**Do not** touch `docs/wiki-policy/modules.bootstrap.json` or `bootstrap-policy.json` — they are a
separate change's candidate artifacts. **Do not** write the README's "Wiki registration" prose any
way other than section 10.9's exact text: it deliberately never spells the pre-move
`libs/core/src/use-cases/replay.ts` path, for the reason Bounded replay sweep's own section 6 row 11
records — a draft that does trips `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s
current-document sweep independently of the wiki-pilot mechanism.

Planner commit: `docs(wiki-policy): register Realtime in the pilot`. Section 12 gives this slice's
exact hand-over path list, `verify.md`'s append included. (This packet document's own landing in
the tree, and the `docs/findings/current-document-check-exemptions.json` entry beside it, is a
separate, earlier commit — the intro's "Dispatch" paragraph names it as the prerequisite
`run-executor.sh` clones from, the same relationship packets D's and E's own documents have to
their own slices.)

## 8. Planner-only checks

| Check                                                                        | Why it is the planner's                                                                                                                                                                         | Value observed on the rehearsed tree |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `NX_DAEMON=false bunx nx run wbs-be-01:test:unit`                            | One be-01 unit file binds a TCP port (packet A's own finding); nothing in this packet needs loopback, so the target moves, not the dispatch.                                                    | pending planner verification         |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`              | Writes Git objects over the working tree; the executor's clone is read-only.                                                                                                                    | pending planner verification         |
| `NX_DAEMON=false bunx nx run wbs-core:test`                                  | Whole-target integration verification with coverage; runs the same files `test:unit` discovers and no core test binds a port.                                                                   | `555 pass`, `0 fail`, 57 files       |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                                 | Opens SQLite databases as a whole target.                                                                                                                                                       | pending planner verification         |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`                         | Runs Playwright; the executor has no browser.                                                                                                                                                   | pending planner verification         |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                         | Whole listener-test target; `apps/wiki/cli/project.json:23` explicitly excludes `packaging/install.test.ts` and `packaging/consumer-bootstrap.test.ts` from it, so it does not cover packaging. | pending planner verification         |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test:package --skip-nx-cache` | The excluded packaging suite (`apps/wiki/cli/project.json:85`, depends on `pack`); no slice of this packet touches packaging, but it is part of the standard integration matrix below.          | pending planner verification         |
| `bin/h2puni-gate.sh <sha>`                                                   | Takes the host-wide heavy lock.                                                                                                                                                                 | pending planner verification         |

This table supplements the mandatory full "Integration verification" matrix in the batch-1 README;
it does not replace that matrix. That matrix — strict OpenSpec validation, the repository-wide
format check, uncached tests/lint/typecheck/build for every project but the Burokrat, and the
Burokrat's own build, source lint and package install test — is run once by the planner on a clean
checkout of the integration commit after this packet merges.

`NX_DAEMON=false bunx nx run twilight-burokrat:typecheck` and `…:lint:source` are not planner-only:
slice 3 touches `apps/wiki/cli/src/policy/pilot-policy.test.ts`, so its own step 0 records both
targets' pre-edit baseline and step 5 reruns both after the edit, exit 0 both times either way on
the rehearsed tree. `tool-devsync:typecheck` and `tool-devsync:lint` are likewise not planner-only:
slice 3 also edits `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, so step 0 records
both targets' baseline and step 6 reruns both after that edit. No slice adds a project target or a
scanned-source comment line beyond the one test pin slice 3 already accounts for, so
`tools/tool-devsync/src/workspace-inventory.test.ts` was not expected to move and was not
separately rehearsed; it is covered by the whole `tool-devsync:test` pass, planner-only above.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once (packet A's/D's/E's own note); do not edit that test or any other test this packet
does not name.

## 9. What the next 040.6 packets should be

1. **Next — Saved plans.** Blocked on task 1.7 (`saved-plan-retry.ts`: "wire or delete … under the
   accepted saved-plans obligation") before its own extraction packet can start; resolve that first.
2. **Then — Plan import.** Capability already accepted (`plan-import`); `Clock`/`Scheduler`/`UnitOfWork`/`Broadcaster`
   plus a per-scope `ImportServices` factory that borrows Directory/Work item resource contracts —
   a permitted feature→resource edge, not sideways.
3. **Authentication** absorbs `LoginThrottle` and the accountful/accountless overload split; every
   module that used to import it sideways already stopped via packet C's task 1.4, so it is not
   currently blocking any other module — only its own scope makes it larger than a next pick.
4. **Optimization** stays last: preparations 1.5 and 1.6's second half are still open, and it lives
   under `apps/wbs/be-01`, so its wiki registration will need a `module.backend.optimization`
   identifier rather than `module.application.*`.

## 10. Exact content

### 10.1 `module.test.ts` (slice 1, step 1)

```ts
import { inMemoryEventLog } from '@wbs/store-memory/replay-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { type ProjectEvent, subscriptionFor } from '../../ports/project-event';
import type { PushTransport } from '../../ports/push-transport';
import { installRealtime } from './check';
import { REALTIME_LABEL } from './contract';
import { realtimeModule } from './module';

const EVENT: ProjectEvent = { type: 'tree_replaced', workItems: [] };

/** A push client that records what it was handed, borrowed from `gateway-broadcaster.test.ts`'s own fixture. */
function fakePush() {
  const pushed: { subscription: string; seq: number }[] = [];
  const client: PushTransport = {
    push(payload) {
      pushed.push({ subscription: payload.subscription, seq: payload.seq });
      return Promise.resolve({ delivered: 1 });
    },
  };
  return { pushed, client };
}

const requirements = () => ({
  eventLog: inMemoryEventLog(),
  clock: clockOf({ now: () => 1_000, newId: () => crypto.randomUUID() }),
  push: fakePush().client,
  maxPerSubscription: 100,
  maxAgeMs: 5 * 60_000,
  onPushFailed: () => undefined,
});

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
    .installModule(realtimeModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 1_000, newId: () => 'id' })),
      push: DiBag.fromSyncFactory(() => fakePush().client),
      maxPerSubscription: DiBag.fromSyncFactory(() => 100),
      maxAgeMs: DiBag.fromSyncFactory(() => 5 * 60_000),
      maxEvents: DiBag.fromSyncFactory(() => undefined),
      onPushFailed: DiBag.fromSyncFactory(() => undefined),
    })
    .build();

describe('the Realtime module', () => {
  it('builds a buffer, a broadcaster and a replay orchestrator over the same requirements', () => {
    const { replayBuffer, broadcaster, replay } = installRealtime(requirements());

    expect(replayBuffer.oldestSeq('project:p-1')).toBeNull();
    expect(typeof broadcaster.publish).toBe('function');
    expect(typeof replay.replay).toBe('function');
  });

  it('publishes through the broadcaster, fills the shared buffer, and replay reads it back', async () => {
    const { pushed, client } = fakePush();
    const { replayBuffer, broadcaster, replay } = installRealtime({
      ...requirements(),
      push: client,
    });

    await broadcaster.publish('p-1', EVENT);

    expect(replayBuffer.oldestSeq(subscriptionFor('p-1'))).toBe(0);
    expect(await replay.replay({ 'project:p-1': -1 })).toEqual({
      'project:p-1': { status: 'replaying', events: [{ seq: 0, message: EVENT }] },
    });
    expect(pushed).toEqual([{ subscription: 'project:p-1', seq: 0 }]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as Plan history's and Bounded replay sweep's own
   * installer tests: an object with an extra property still satisfies
   * `RealtimeExports`, so only enumerating the returned surface catches a
   * leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installRealtime(requirements());

    expect(Object.keys(exposed).sort()).toEqual(['broadcaster', 'replay', 'replayBuffer']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /**
   * A host that installs the module cannot name either private binding: not
   * `broadcasterOptions`, and not `replayOptions` independently of it. Two
   * assertions rather than one, because a fault that leaks only one of the
   * two would leave the other passing.
   */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('broadcasterOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "broadcasterOptions" is not registered.');
    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('replayOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "replayOptions" is not registered.');
  });

  /**
   * The label is what makes a private binding identifiable in any graph
   * report — for both private bindings, not only the one the installer
   * happens to build first.
   */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();
    const labels = host.inspectGraph().bindings.map((binding) => binding.label);

    expect(labels).toContain(`${REALTIME_LABEL}/broadcasterOptions`);
    expect(labels).toContain(`${REALTIME_LABEL}/replayOptions`);
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(realtimeModule)
      .register({
        eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
        clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 1_000, newId: () => 'id' })),
        maxPerSubscription: DiBag.fromSyncFactory(() => 100),
        maxAgeMs: DiBag.fromSyncFactory(() => 5 * 60_000),
        maxEvents: DiBag.fromSyncFactory(() => undefined),
        onPushFailed: DiBag.fromSyncFactory(() => undefined),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('broadcaster')).toThrow(
      `Cannot resolve "${REALTIME_LABEL}/broadcasterOptions": dependency "push" is not registered. Resolution path: broadcaster -> ${REALTIME_LABEL}/broadcasterOptions -> push.`,
    );
  });
});
```

### 10.2 The four moved files, exact relative-import diffs

These three fragments show only the import lines that change inside content `git mv` also
relocates; they carry no `---`/`+++` file header and are not independently `git apply`-able (a
rename plus an edit needs a `diff --git`/`rename from`/`rename to` combination `git mv` itself
produces, not a hand-written fragment). Apply each by editing the named import lines in the moved
file directly; every other line is byte-for-byte identical to the pre-move file.

`realtime.feature.ts` (from `use-cases/replay.ts`, otherwise byte for byte):

```diff
-import type { ReplayOrchestrator, ReplayOutcome } from '../service/replay-orchestrator';
+import type { ReplayOrchestrator, ReplayOutcome } from './replay-orchestrator';
```

`gateway-broadcaster.ts` (from `service/gateway-broadcaster.ts`, otherwise byte for byte):

```diff
-import type { Clock } from '../ports/clock';
-import type { EventLogStore, RecordedEvent } from '../ports/event-log-store';
-import { type Broadcaster, type ProjectEvent, subscriptionFor } from '../ports/project-event';
-import type { PushTransport } from '../ports/push-transport';
+import type { Clock } from '../../ports/clock';
+import type { EventLogStore, RecordedEvent } from '../../ports/event-log-store';
+import { type Broadcaster, type ProjectEvent, subscriptionFor } from '../../ports/project-event';
+import type { PushTransport } from '../../ports/push-transport';
 import type { ReplayBuffer } from './replay-buffer';
```

`replay-buffer.ts` (from `service/replay-buffer.ts`, byte for byte, no import to rewrite).

`replay-orchestrator.ts` (from `service/replay-orchestrator.ts`, otherwise byte for byte):

```diff
-import type { EventLogStore } from '../ports/event-log-store';
+import type { EventLogStore } from '../../ports/event-log-store';
 import type { ReplayBuffer } from './replay-buffer';
```

### 10.3 The four compatibility shims (full replacement content)

`libs/wbs/application/core/src/use-cases/replay.ts`:

```ts
/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `use-cases/admission.test.ts` imports this relative path
 * directly and `@wbs/core`'s barrel still deep-imports it. It goes when every
 * importer names the module.
 */
export * from '../module/realtime/realtime.feature';
```

`libs/wbs/application/core/src/service/gateway-broadcaster.ts`:

```ts
/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path,
 * `gateway-broadcaster.test.ts` deep-imports it by relative path, and be-01's
 * own `gateway-broadcaster.ts` re-export shim, plus its
 * `gateway-broadcaster-order.db.test.ts`, `gateway-broadcaster-durability.db.test.ts`
 * and `step.service.db.test.ts`, reach it through `@wbs/core`. It goes when
 * every importer names the module.
 */
export * from '../module/realtime/gateway-broadcaster';
```

`libs/wbs/application/core/src/service/replay-buffer.ts`:

```ts
/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and
 * `replay-buffer.test.ts`, `replay-buffer.property.test.ts` and
 * `gateway-broadcaster.test.ts` deep-import it by relative path, as does
 * be-01's own `replay-buffer.ts` re-export shim through `@wbs/core`. It goes
 * when every importer names the module.
 */
export * from '../module/realtime/replay-buffer';
```

`libs/wbs/application/core/src/service/replay-orchestrator.ts`:

```ts
/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and
 * `gateway-broadcaster.test.ts` deep-imports it by relative path, as does
 * be-01's own `replay-orchestrator.ts` re-export shim through `@wbs/core`. It
 * goes when every importer names the module.
 */
export * from '../module/realtime/replay-orchestrator';
```

### 10.4 `contract.ts`, `module.ts`, `check.ts`, `README.md` (slice 1)

`contract.ts`:

```ts
import type { Clock } from '../../ports/clock';
import type { EventLogStore } from '../../ports/event-log-store';
import type { PushTransport } from '../../ports/push-transport';
import type { GatewayBroadcaster } from './gateway-broadcaster';
import type { ReplayBuffer } from './replay-buffer';
import type { ReplayOrchestrator } from './replay-orchestrator';

/**
 * What a host must supply to install {@link realtimeModule}.
 *
 * `eventLog` is a repository port, existing K3 debt this extraction preserves
 * rather than fixes — the same preserved debt
 * `libs/wbs/application/core/src/module/bounded-replay-sweep/contract.ts`
 * records for its own two stores. Closing it needs a resource-service over
 * this store that no accepted change supplies, so `adopt-di-composition`
 * records it as open and this module claims no K3 compliance either.
 *
 * `onPushFailed` is optional for the reason `gateway-broadcaster.ts`'s own
 * JSDoc gives: a failed push is logged and swallowed because the mutation it
 * describes already committed, and a process that does not care to log the
 * swallow still needs the swallow to happen. `maxEvents` is optional because
 * `ReplayOrchestrator` already defaults it.
 */
export interface RealtimeRequirements {
  readonly eventLog: EventLogStore;
  readonly clock: Clock;
  readonly push: PushTransport;
  readonly maxPerSubscription: number;
  readonly maxAgeMs: number;
  readonly maxEvents?: number;
  readonly onPushFailed?: (err: unknown, subscription: string) => void;
}

/**
 * What installing {@link realtimeModule} adds to a host graph.
 *
 * `broadcaster` is exported as the concrete {@link GatewayBroadcaster} class
 * rather than narrowed to the neutral `Broadcaster` port
 * (`ports/project-event.ts`): `apps/wbs/be-01/src/services.ts` calls its
 * `pushRecorded` method, which is not part of the `Broadcaster` contract and
 * has exactly one production caller outside this module. Composition may
 * still decorate the returned instance with `OptimizerTriggerBroadcaster`
 * exactly as before this module existed — that decoration only ever needed
 * the `Broadcaster` half of this surface, so widening `broadcaster`'s
 * declared type costs the decorator nothing. See the module's own README,
 * "Wiki registration," for the measurement this decision rests on.
 *
 * `replayBuffer` is exported for the same "current compatibility value"
 * reason `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`
 * names it: `compose.ts`'s `CommonServices` has carried this field since
 * before this module existed, and no accepted change asks this packet to
 * remove it, even though nothing outside `compose.ts` reads it today.
 */
export interface RealtimeExports {
  readonly replayBuffer: ReplayBuffer;
  readonly broadcaster: GatewayBroadcaster;
  readonly replay: ReplayOrchestrator;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s and
 * `module.application.bounded-replay-sweep`'s; the wiki module identifier is
 * `module.application.realtime` and the label drops the `module.` prefix.
 */
export const REALTIME_LABEL = 'application.realtime';
```

`module.ts`. Its single `buildModule` call is where faults 5, 6 and 7 go, and where the three dated
`Proof:` comments land after those faults are observed:

```ts
import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { EventLogStore } from '../../ports/event-log-store';
import type { PushTransport } from '../../ports/push-transport';
import { REALTIME_LABEL } from './contract';
import { GatewayBroadcaster, type GatewayBroadcasterOptions } from './gateway-broadcaster';
import { ReplayBuffer } from './replay-buffer';
import { ReplayOrchestrator, type ReplayOrchestratorOptions } from './replay-orchestrator';

/**
 * Realtime as a sealed DI Bag module.
 *
 * `replayBuffer` is exported directly: it needs no assembly beyond its own
 * three host-supplied fields, and the map records it as a current
 * compatibility export rather than a private implementation detail.
 * `broadcasterOptions` and `replayOptions` stay private — a host cannot name
 * either, so a requirement it forgets is reported against
 * `application.realtime/broadcasterOptions` or `application.realtime/replayOptions`
 * rather than against an anonymous binding. Both classes read the same
 * `replayBuffer` instance, so `broadcaster` and `replay` are registered after
 * it in the same stage rather than in parallel private ones.
 *
 * The module registers no disposer: `ReplayBuffer` owns no resource,
 * `GatewayBroadcaster` and `ReplayOrchestrator` hold no handle either, and
 * nothing in this module starts a timer or a connection of its own.
 */
export const realtimeModule = DiBag.createBuilder()
  .register({
    replayBuffer: DiBag.fromSyncFactory(
      ({
        maxPerSubscription,
        maxAgeMs,
        clock,
      }: {
        maxPerSubscription: number;
        maxAgeMs: number;
        clock: Clock;
      }): ReplayBuffer =>
        new ReplayBuffer({ maxPerSubscription, maxAgeMs, now: () => clock.now() }),
    ),
  })
  .register({
    broadcasterOptions: DiBag.fromSyncFactory(
      ({
        eventLog,
        clock,
        push,
        replayBuffer,
        onPushFailed,
      }: {
        eventLog: EventLogStore;
        clock: Clock;
        push: PushTransport;
        replayBuffer: ReplayBuffer;
        onPushFailed: ((err: unknown, subscription: string) => void) | undefined;
      }): GatewayBroadcasterOptions => ({
        eventLog,
        clock,
        push,
        buffer: replayBuffer,
        ...(onPushFailed === undefined ? {} : { onPushFailed }),
      }),
    ),
    replayOptions: DiBag.fromSyncFactory(
      ({
        eventLog,
        replayBuffer,
        maxEvents,
      }: {
        eventLog: EventLogStore;
        replayBuffer: ReplayBuffer;
        maxEvents: number | undefined;
      }): ReplayOrchestratorOptions => ({
        log: eventLog,
        buffer: replayBuffer,
        ...(maxEvents === undefined ? {} : { maxEvents }),
      }),
    ),
  })
  .register({
    broadcaster: DiBag.fromSyncFactory(
      ({ broadcasterOptions }: { broadcasterOptions: GatewayBroadcasterOptions }) =>
        new GatewayBroadcaster(broadcasterOptions),
    ),
    replay: DiBag.fromSyncFactory(
      ({ replayOptions }: { replayOptions: ReplayOrchestratorOptions }) =>
        new ReplayOrchestrator(replayOptions),
    ),
  })
  // Proof (2026-09-23): widening the key tuple to
  // `['replayBuffer', 'broadcaster', 'replay', 'broadcasterOptions']` left `keeps its private
  // bindings out of a host graph`'s first assertion, `labels its private bindings with the module
  // name`'s first assertion and `names itself when a host omits a requirement` failing (3 pass, 3
  // fail) — `resolve('broadcasterOptions')` returned the raw options object instead of throwing,
  // and `inspectGraph()` reported the bare key `broadcasterOptions` with no label prefix.
  // Proof (2026-09-23): widening the key tuple to
  // `['replayBuffer', 'broadcaster', 'replay', 'replayOptions']` instead, independently, left only
  // `keeps its private bindings out of a host graph`'s SECOND assertion and `labels its private
  // bindings with the module name`'s SECOND assertion failing (4 pass, 2 fail) —
  // `resolve('replayOptions')` returned the raw options object and `inspectGraph()` reported the
  // bare key `replayOptions`; `broadcasterOptions` stayed correctly hidden and labelled, proving
  // each private binding's privacy independently of the other.
  // Proof (2026-09-23): dropping `{ label: REALTIME_LABEL }` left only the two label assertions
  // failing (4 pass, 2 fail): `inspectGraph()` reported both `broadcasterOptions` and
  // `replayOptions` unlabelled, and a missing requirement's message named `broadcasterOptions`
  // instead of `application.realtime/broadcasterOptions`.
  .buildModule(['replayBuffer', 'broadcaster', 'replay'], { label: REALTIME_LABEL });
```

`check.ts`. The single `return` is faults 3 and 4's location. Fault 3's mutation builds a separate
`const exposed = { ..., bag }` and returns that variable — a structurally assignable mutation
(`exposed`'s inferred type has the three required properties plus `bag`, and TypeScript's excess
property check only fires on an object literal written directly in a typed position, never on a
variable of inferred type flowing through `return`), unlike returning the literal
`{ ..., bag }` directly, which review round 1 found fails to typecheck with **TS2353** and is
therefore not a valid fault to prescribe:

```ts
import { DiBag } from 'di-bag';

import type { RealtimeExports, RealtimeRequirements } from './contract';
import { realtimeModule } from './module';

/**
 * Installs {@link realtimeModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Realtime can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through
 * a variable still satisfies {@link RealtimeExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installRealtime(requirements: RealtimeRequirements): RealtimeExports {
  const bag = DiBag.createBuilder()
    .installModule(realtimeModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => requirements.eventLog),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
      push: DiBag.fromSyncFactory(() => requirements.push),
      maxPerSubscription: DiBag.fromSyncFactory(() => requirements.maxPerSubscription),
      maxAgeMs: DiBag.fromSyncFactory(() => requirements.maxAgeMs),
      maxEvents: DiBag.fromSyncFactory(() => requirements.maxEvents),
      onPushFailed: DiBag.fromSyncFactory(() => requirements.onPushFailed),
    })
    .build();
  // Proof (2026-09-23): building `const exposed = { replayBuffer: ..., broadcaster: ...,
  // replay: ..., bag }` and returning it (structurally assignable to `RealtimeExports`, so
  // `wbs-core:typecheck` still exits 0) left `exposes only the contract exports from its
  // installer` failing on its first assertion — `Object.keys(exposed).sort()` reported an extra
  // `"bag"` entry — 0 pass, 1 fail, 5 filtered out.
  // Proof (2026-09-23): keeping the key list correct but hanging `resolve` on the returned
  // broadcaster (`Object.assign(bag.resolve('broadcaster'), { resolve: bag.resolve.bind(bag) })`)
  // left the same test failing on its SECOND assertion instead (`Expected: true`, `Received: false`),
  // with `wbs-core:typecheck` still exiting 0 on this mutation too.
  return {
    replayBuffer: bag.resolve('replayBuffer'),
    broadcaster: bag.resolve('broadcaster'),
    replay: bag.resolve('replay'),
  };
}
```

Fault 3's rehearsed mutation, exact form (do not return the object literal directly — that fails
`wbs-core:typecheck` with TS2353, "'bag' does not exist in type 'RealtimeExports'", and is not a
valid fault):

```ts
const exposed = {
  replayBuffer: bag.resolve('replayBuffer'),
  broadcaster: bag.resolve('broadcaster'),
  replay: bag.resolve('replay'),
  bag,
};
return exposed;
```

`README.md` (slice 1's version — no `module-index` block, no "Wiki registration" section yet):

```md
# Realtime

The third sealed DI Bag module in the core, following Plan history's and Bounded replay sweep's
pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two runtime ports and the buffer/replay limits a host must supply — the
same preserved K3 debt Plan history's and Bounded replay sweep's contracts record for their own
repository ports, not compliance. Private bindings are named under the `application.realtime`
label, so a DI failure says which module asked.

`realtime.feature.ts` (the moved `use-cases/replay.ts`) admits an internal principal before
replaying resume points; `replay-buffer.ts` is the bounded, per-subscription fast-path cache;
`gateway-broadcaster.ts` is the durable-then-push adapter of the neutral `Broadcaster` port
(`ports/project-event.ts`), exported as the concrete class rather than the port itself because
`apps/wbs/be-01/src/services.ts` calls its `pushRecorded` method, one level beyond the port
contract. `replay-orchestrator.ts` answers a reconnecting client's resume from the buffer, falling
back to the log. Composition still decorates the returned `broadcaster` with
`OptimizerTriggerBroadcaster` exactly as before this module existed — that stays root-private
wiring, not part of this module.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/service/gateway-broadcaster.ts`,
`libs/wbs/application/core/src/service/replay-buffer.ts`,
`libs/wbs/application/core/src/service/replay-orchestrator.ts` and
`libs/wbs/application/core/src/use-cases/replay.ts` keep the former `@wbs/core` deep-import names.
Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the file
that carries it, and this listing is quoted inside a plan document at another depth.
```

### 10.5 `ports/sideways-type-boundaries.test.ts`, exact diff (slice 1)

Regenerated against this checkout at `95754749` — where the block already carries Bounded replay
sweep's own two `Proof:` paragraphs before the closing `*/`, wrapped differently than a
from-memory draft would assume. The new explanation and the two new `Proof:` paragraphs are
inserted **after** the existing content and **before** the closing `*/`, so every existing line is
preserved verbatim; the two new `routes` entries are a separate hunk. Verified with
`git apply --check` against a checkout of `95754749` (passed):

```diff
diff --git a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
index e54b5fb1..4e547831 100644
--- a/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
+++ b/libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
@@ -39,6 +39,31 @@ const configPath = `${coreRoot}tsconfig.lib.json`;
  * `service/auth.service.ts` row while leaving the HTTP-endpoint fault above in
  * place leaves that fault's two violations unchanged, so this second fault is
  * what proves the Authentication row independently.
+ *
+ * The sixth and seventh rows are preparation 4's other half re-scoped to the
+ * Realtime module's own directory once `replay.ts` (now `realtime.feature.ts`)
+ * moved out of `use-cases/` and stopped being covered by the first two rows'
+ * `path.startsWith('use-cases/')` — a new directory row rather than a renamed
+ * single-file one, since no row ever targeted a single Realtime file, and the
+ * module also holds `gateway-broadcaster.ts`, `replay-buffer.ts` and
+ * `replay-orchestrator.ts`, none of which carried a principal type before but
+ * should not gain one unnoticed either.
+ *
+ * Proof: importing `type { Identity } from '../../http/endpoint'` into the
+ * Realtime module's `gateway-broadcaster.ts` failed this suite with both a
+ * module-specifier and an identifier violation — `"module/realtime/gateway-broadcaster.ts:
+ * '../../http/endpoint' reaches http/endpoint.ts"` and `"…: Identity reaches
+ * http/endpoint.ts"` — against an expected empty array, 0 pass and 1 fail
+ * (2026-09-23).
+ * Proof: importing `type { AuthenticatedUser } from '../../service/auth.service'`
+ * into the same file, independently, failed this suite with only
+ * `"module/realtime/gateway-broadcaster.ts: '../../service/auth.service'
+ * reaches service/auth.service.ts"` — no `http/endpoint.ts` entry — against an
+ * expected empty array, 0 pass and 1 fail (2026-09-23). Deleting the new
+ * Realtime `service/auth.service.ts` row while leaving the Realtime
+ * HTTP-endpoint fault above in place leaves that fault's two violations
+ * unchanged, so this second fault is what proves the Realtime Authentication
+ * row independently.
  */
 const routes = [
   { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
@@ -55,6 +80,14 @@ const routes = [
     reaches: 'service/calendar-marker.service.ts',
     from: (path: string) => path === 'service/plan-document.ts',
   },
+  {
+    reaches: 'service/auth.service.ts',
+    from: (path: string) => path.startsWith('module/realtime/'),
+  },
+  {
+    reaches: 'http/endpoint.ts',
+    from: (path: string) => path.startsWith('module/realtime/'),
+  },
 ] as const;

 function underSrc(fileName: string): string {
```

### 10.6 `compose.ts`, `index.ts`, exact diffs (slice 2)

Real `git diff` output (not a hand-assembled `@@` splice), verified with `git apply --check`
against a checkout of `7e65dd4a` (slice 1's planner commit; passed):

```diff
diff --git a/libs/wbs/application/core/src/compose.ts b/libs/wbs/application/core/src/compose.ts
index ce9ad5a3..c4a8092f 100644
--- a/libs/wbs/application/core/src/compose.ts
+++ b/libs/wbs/application/core/src/compose.ts
@@ -4,6 +4,10 @@ import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
 import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
 import { installPlanHistory } from './module/plan-history/check';
 import type { HistoryService } from './module/plan-history/plan-history.feature';
+import { installRealtime } from './module/realtime/check';
+import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
+import type { ReplayBuffer } from './module/realtime/replay-buffer';
+import type { ReplayOrchestrator } from './module/realtime/replay-orchestrator';
 import type { Clock } from './ports/clock';
 import type { OidcVerifier } from './ports/oidc-verifier';
 import type { Broadcaster } from './ports/project-event';
@@ -18,14 +22,11 @@ import { AuthService } from './service/auth.service';
 import { CalendarMarkerService } from './service/calendar-marker.service';
 import { CapacityService } from './service/capacity.service';
 import { DirectoryService } from './service/directory.service';
-import { GatewayBroadcaster } from './service/gateway-broadcaster';
 import { ImportService } from './service/import.service';
 import { LoginThrottle } from './service/login-throttle';
 import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
 import { PriorityBandService } from './service/priority-band.service';
 import { ProjectService } from './service/project.service';
-import { ReplayBuffer } from './service/replay-buffer';
-import { ReplayOrchestrator } from './service/replay-orchestrator';
 import { SavedPlanService } from './service/saved-plan.service';
 import { StepService } from './service/step.service';
 import { WorkItemService } from './service/work-item.service';
@@ -174,20 +175,18 @@ export function composeServices(
   options: AccountfulOptions | AccountlessOptions,
 ): AccountfulServices | AccountlessServices {
   const { source, runtime, shared } = options;
-  const buffer = new ReplayBuffer({
-    maxPerSubscription: shared.replayMaxPerSubscription,
-    maxAgeMs: shared.replayMaxAgeMs,
-    now: () => runtime.clock.now(),
-  });
-  const broadcaster = new GatewayBroadcaster({
+  const realtime = installRealtime({
     eventLog: source.stores.eventLog,
     clock: runtime.clock,
     push: runtime.push,
-    buffer,
+    maxPerSubscription: shared.replayMaxPerSubscription,
+    maxAgeMs: shared.replayMaxAgeMs,
+    ...(shared.replayMaxEvents === undefined ? {} : { maxEvents: shared.replayMaxEvents }),
     onPushFailed: (error, subscription) => {
       shared.logger.warn({ err: error, subscription }, 'project event recorded but not pushed');
     },
   });
+  const { replayBuffer: buffer, broadcaster } = realtime;
   const announcements: Broadcaster =
     runtime.onPlanChanged === undefined
       ? broadcaster
@@ -233,11 +232,7 @@ export function composeServices(
     }).history,
     plans: savedPlans,
     savedPlans,
-    replay: new ReplayOrchestrator({
-      log: source.stores.eventLog,
-      buffer,
-      ...(shared.replayMaxEvents === undefined ? {} : { maxEvents: shared.replayMaxEvents }),
-    }),
+    replay: realtime.replay,
     retention: installBoundedReplaySweep({
       eventLog: source.stores.eventLog,
       maxPerSubscription: shared.replayMaxPerSubscription,
```

The `onPushFailed` callback body above is byte-for-byte identical to the pre-edit file
(`compose.ts:188-190` at `95754749`), and the `OptimizerTriggerBroadcaster` decoration is untouched
— only the surrounding construction changes shape.

```diff
diff --git a/libs/wbs/application/core/src/index.ts b/libs/wbs/application/core/src/index.ts
index 20c389fd..1c7ac09e 100644
--- a/libs/wbs/application/core/src/index.ts
+++ b/libs/wbs/application/core/src/index.ts
@@ -20,6 +20,8 @@ export * from './module/bounded-replay-sweep/contract';
 export * from './module/bounded-replay-sweep/module';
 export * from './module/plan-history/contract';
 export * from './module/plan-history/module';
+export * from './module/realtime/contract';
+export * from './module/realtime/module';
 export * from './ports/actual-store';
 // The owner-neutral marker read: `CalendarMarkerReader` and the list outcome it answers with.
 export * from './ports/calendar-marker-read';
```

Both diffs applied with `git apply --check` and no `eslint --fix` was needed for either file when
rehearsed (`lint` reported clean on the first attempt). If the executor's own rehearsal reports a
lint failure whose diagnostics are exclusively `simple-import-sort/imports`,
`simple-import-sort/exports` or `prettier/prettier` (preamble rule 17), `bunx eslint --fix` on the
touched file and a rerun is the permitted autofix, not a stop; any other diagnostic is a stop.

### 10.7 `kinds.json`, exact diff (slice 2)

Real `git diff` output, verified with `git apply --check` against a checkout of `7e65dd4a`
(passed):

```diff
diff --git a/docs/code-organization/kinds.json b/docs/code-organization/kinds.json
index 203750d0..767f3ce6 100644
--- a/docs/code-organization/kinds.json
+++ b/docs/code-organization/kinds.json
@@ -307,8 +307,7 @@
     {
       "path": "libs/wbs/application/core/src/service/gateway-broadcaster.ts",
       "kind": "support",
-      "disposition": "private member of compose.ts",
-      "rationale": "composeServices is its only production importer and binds EventLogStore, PushTransport, ReplayBuffer and Clock into the composition's durable project-event publisher"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the realtime module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/history.service.ts",
@@ -378,14 +377,12 @@
     {
       "path": "libs/wbs/application/core/src/service/replay-buffer.ts",
       "kind": "support",
-      "disposition": "realtime replay buffer; move to the realtime module",
-      "rationale": "composeServices constructs it and GatewayBroadcaster plus ReplayOrchestrator share its injected-clock bounded event buffer for realtime publication and recovery"
+      "disposition": "re-export shim; delete when importers use @wbs/core or the realtime module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/replay-orchestrator.ts",
-      "kind": "feature",
-      "capability": "realtime",
-      "rationale": "the replay use case calls it to coordinate ReplayBuffer with EventLogStore and return one complete replay-or-refusal outcome for realtime resume"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the realtime module directly"
     },
     {
       "path": "libs/wbs/application/core/src/service/retention-job.ts",
@@ -507,9 +504,8 @@
     },
     {
       "path": "libs/wbs/application/core/src/use-cases/replay.ts",
-      "kind": "feature",
-      "capability": "realtime",
-      "rationale": "internalRoutes and the portable composition call it to admit an internal principal before replaying resume points through the ReplayOrchestrator port for realtime recovery"
+      "kind": "support",
+      "disposition": "re-export shim; delete when importers use @wbs/core or the realtime module directly"
     },
     {
       "path": "libs/wbs/application/core/src/use-cases/retention-sweep.ts",
```

Run `GSETTINGS_BACKEND=memory bunx prettier --write docs/code-organization/kinds.json` after
applying it; entry count stays `95` (rehearsed: `prettier --write` reported the file unchanged,
since `json.dump`'s own two-space indent already matched Prettier's).

### 10.8 `docs/wiki-policy/modules.json`, the new row; `docs/wiki-policy/policy.json`, the new boundary (slice 3)

Insert immediately before the `module.application.use-cases` entry in `modules.json`'s `modules`
array:

```json
{
  "moduleId": "module.application.realtime",
  "name": "Realtime sealed DI Bag module",
  "memberships": [
    {
      "kind": "directory-prefix",
      "prefix": "libs/wbs/application/core/src/module/realtime",
      "exclusions": []
    }
  ],
  "predecessorModuleIds": [],
  "indexPath": "libs/wbs/application/core/src/module/realtime/README.md",
  "externalConsumers": {
    "kind": "declared",
    "memberships": [
      { "kind": "path", "path": "libs/wbs/application/core/src/compose.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/index.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/service/gateway-broadcaster.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/service/replay-buffer.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/service/replay-orchestrator.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/use-cases/replay.ts" }
    ]
  }
}
```

Append to `policy.json`'s `boundaries` array (last, so `boundaries.at(0)` stays unchanged):

```json
{
  "boundaryId": "boundary.application.realtime",
  "selector": {
    "kind": "prefix",
    "value": "libs/wbs/application/core/src/module/realtime"
  },
  "sourceSelector": {
    "kind": "prefix",
    "value": "libs/core/src/use-cases/replay.ts"
  },
  "baselineEntries": [
    {
      "mode": "100644",
      "blob": "d18bf8e74e82501358dd994e2226a87e068b9220",
      "path": "libs/core/src/use-cases/replay.ts"
    }
  ],
  "obligationIds": []
}
```

Run `GSETTINGS_BACKEND=memory bunx prettier --write` on both files after inserting. Both blocks
above are shown as the JSON to insert, not as diffs: `modules.json`'s own real `git diff` reflows
several neighbouring, otherwise-untouched array entries purely because the file's total width
recalculation changed once the new entry landed (rehearsed; not a content change, and not
worth showing as noise) — do not revert that reflow. `policy.json`'s own insertion IS a clean
append with no reflow (rehearsed and verified with `git apply --check` against a checkout of
`60edd69e`, as a plain unified diff appending the object above before the closing `]`).

### 10.9 `README.md`, final content (slice 3 replaces the slice-1 version)

```md
# Realtime

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.realtime","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"gateway-broadcaster.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"realtime.feature.ts"},{"kind":"path","path":"replay-buffer.ts"},{"kind":"path","path":"replay-orchestrator.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The durable-before-push and buffer-then-log-fallback invariants are documented on GatewayBroadcaster and ReplayOrchestrator respectively; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/gateway-broadcaster.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/replay-buffer.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/replay-orchestrator.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/replay.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the four compatibility shims are declared; a deep import of realtime.feature.ts, gateway-broadcaster.ts, replay-buffer.ts or replay-orchestrator.ts by a test fixture elsewhere is not tracked here."}} -->

The third sealed DI Bag module in the core, following Plan history's and Bounded replay sweep's
pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two runtime ports and the buffer/replay limits a host must supply — the
same preserved K3 debt Plan history's and Bounded replay sweep's contracts record for their own
repository ports, not compliance. Private bindings are named under the `application.realtime`
label, so a DI failure says which module asked.

`realtime.feature.ts` (the moved `use-cases/replay.ts`) admits an internal principal before
replaying resume points; `replay-buffer.ts` is the bounded, per-subscription fast-path cache;
`gateway-broadcaster.ts` is the durable-then-push adapter of the neutral `Broadcaster` port
(`ports/project-event.ts`), exported as the concrete class rather than the port itself because
`apps/wbs/be-01/src/services.ts` calls its `pushRecorded` method, one level beyond the port
contract. `replay-orchestrator.ts` answers a reconnecting client's resume from the buffer, falling
back to the log. Composition still decorates the returned `broadcaster` with
`OptimizerTriggerBroadcaster` exactly as before this module existed — that stays root-private
wiring, not part of this module.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/service/gateway-broadcaster.ts`,
`libs/wbs/application/core/src/service/replay-buffer.ts`,
`libs/wbs/application/core/src/service/replay-orchestrator.ts` and
`libs/wbs/application/core/src/use-cases/replay.ts` keep the former `@wbs/core` deep-import names.
Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the file
that carries it, and this listing is quoted inside a plan document at another depth.

## Wiki registration

This module is a full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.realtime` (`docs/wiki-policy/policy.json`'s `boundary.application.realtime`).
The boundary's `sourceSelector` binds this new directory to the single pre-namespacing use case it
was extracted from, the file `docs/code-organization/kinds.json` classified `capability: realtime`
before the move, which existed at the pilot's frozen `sourceRevision` — the same mechanism
`boundary.application.plan-history` and `boundary.application.bounded-replay-sweep` use for their
own predecessors. `gateway-broadcaster.ts`, `replay-buffer.ts` and `replay-orchestrator.ts` are not
separately named in the source selector: the wiki registration's guarantee is narrower than "every
file in this module has a pilot-tracked predecessor", exactly as Plan history's and Bounded replay
sweep's own READMEs say of their label agreement — see the plan's "Deferred: label agreement" for
why, and what a later change needs before it can be.
```

**Deliberately does not spell the pre-move path.** Bounded replay sweep's own section 6 row 11
records what happens when a draft of this paragraph does; write it exactly as above.

### 10.10 `apps/wiki/cli/src/policy/pilot-policy.test.ts`, exact diff (slice 3)

Real `git diff` output, verified with `git apply --check` against a checkout of `60edd69e` (slice
2's planner commit; passed):

```diff
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
index f19c4f30..5a4f143a 100644
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -37,6 +37,7 @@ const pilotPaths = [
   'docs/wiki-policy/relationships.bootstrap.json',
   'libs/wbs/application/core/src/module/bounded-replay-sweep/README.md',
   'libs/wbs/application/core/src/module/plan-history/README.md',
+  'libs/wbs/application/core/src/module/realtime/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
   'libs/wbs/domain/domain/src/saved-plan/README.md',
   'libs/wbs/adapters/store-memory/src/README.md',
```

Full-string alphabetical order (`bounded-replay-sweep` < `plan-history` < `realtime` < `use-cases`),
matching the array's own existing order.

### 10.11 `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, exact diff (slice 3)

Registering this boundary adds exactly two new pinned strings — the `sourceSelector` value and the
one `baselineEntries` path, both naming `libs/core/src/use-cases/replay.ts` — to the
`historical policy selector or baseline` category, rehearsed directly against the tree at
`60edd69e` with packets A through E's own registrations already applied. **The category line is a
replacement, not an addition** — keeping the old `43` line as unchanged context while adding a new
`45` line creates a duplicate object-literal key: rehearsed and reverted, `tsc` refuses it with
**TS1117: "An object literal cannot have multiple properties with the same name"** at that
duplicated key (`tool-devsync:typecheck`, exit non-zero), and Bun's own runtime accepts the
duplicate silently (using the second value), which is why a filtered `bun test` alone would not
have caught it. Both `tool-devsync:typecheck` and `tool-devsync:lint` are added to this slice's own
verification for exactly this reason. Real `git diff` output, verified with `git apply --check`
against a checkout of `60edd69e` (passed):

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
index 53d46474..9f3c64b6 100644
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 43,
+      'historical policy selector or baseline': 45,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -807,8 +807,13 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // both naming the pre-move `libs/core/src/use-cases/retention-sweep.ts` this module was
     // extracted from; raised `historical policy selector or baseline` from 41 to 43 and occurrences
     // from 259 to 261, no unclassified entries (2026-09-23).
-    digest: 'fb0d422785019f2351c00082e4533b820b0aca3cce8f9789a348e6167099363e',
-    occurrences: 261,
+    // Proof: registering `module.application.realtime` added its `boundary.application.realtime`'s
+    // `sourceSelector` and one `baselineEntries` path, both naming the pre-move
+    // `libs/core/src/use-cases/replay.ts` this module was extracted from; raised `historical policy
+    // selector or baseline` from 43 to 45 and occurrences from 261 to 263, no unclassified entries
+    // (2026-09-23).
+    digest: 'a3db8f9766fa58137d1067c35e0628fd9020100aac871e07c0137a28ac772cd4',
+    occurrences: 263,
     unclassified: [],
   });
 });
```

This packet's own before/after numbers (`43`→`45`, `261`→`263`, the two digests) are the one
authority for this pin: the executor applies exactly this diff. If the executor's own step-0
baseline for the category or the pre-edit digest differs from `43`/`261`/`fb0d422785019f2351c00082e4533b820b0aca3cce8f9789a348e6167099363e`
(a packet landing between this document's writing and this slice's dispatch shifted it), that is a
step-0 pin mismatch — stop per section 11 and report it to the planner rather than measuring and
substituting a new replacement value; this pin depends on the full byte content of every classified
context in the repository, which only the planner can safely re-measure (it requires the whole
`tool-devsync:test` target's own write access to confirm, per section 8).

### 10.12 `openspec/changes/adopt-di-composition/tasks.md`, exact diff (slice 3)

Real `git diff` output, verified with `git apply --check` against a checkout of `60edd69e`
(passed). The second hunk's context is the file's actual text at `60edd69e`, found by matching the
unique string `` `contract.ts`/`module.ts`/`check.ts` predecessor either.`` rather than assumed by
line number, since an earlier hunk in the same file shifts every later line number:

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
index 9414fc90..e93e8b94 100644
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -60,7 +60,19 @@
       kept as compatibility re-export shims, and `docs/code-organization/kinds.json`'s three rows
       for them rewritten in place (95 entries, unchanged) rather than added or removed, because
       `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
-- [ ] 3.2 Realtime, implementing the neutral event port.
+- [x] 3.2 Realtime, implementing the neutral event port. Proof: the module's own tests;
+      negatives: the installer leaking its bag, either private binding
+      (`broadcasterOptions`/`replayOptions`) exported independently, and the label dropped. The
+      `Broadcaster` composition question packet E's own section 9 raised is answered by
+      measurement, not by a contract change: `GatewayBroadcaster` is exported as the concrete
+      class (`apps/wbs/be-01/src/services.ts` needs its `pushRecorded` method, beyond the neutral
+      port), and `compose.ts`'s `OptimizerTriggerBroadcaster` decoration is byte-for-byte
+      unchanged. Landed 2026-09-23 as `libs/wbs/application/core/src/module/realtime/`, with
+      `use-cases/replay.ts`, `service/gateway-broadcaster.ts`, `service/replay-buffer.ts` and
+      `service/replay-orchestrator.ts` kept as compatibility re-export shims, and
+      `docs/code-organization/kinds.json`'s four rows for them rewritten in place (95 entries,
+      unchanged) rather than added or removed, because
+      `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
 - [ ] 3.3 Saved plans, absorbing project and admission checks and the publication after save,
       rename and delete.
 - [ ] 3.4 Plan import, with its per-scope factory.
@@ -129,4 +141,11 @@
       `retention-timer.ts` and `retention-job.ts` have no separate baseline entry: 7.5's guarantee
       names one predecessor per module directory, not one per file it holds, exactly as Plan
       history's single `history.service.ts` predecessor did not separately name a
-      `contract.ts`/`module.ts`/`check.ts` predecessor either.
+      `contract.ts`/`module.ts`/`check.ts` predecessor either. Landed again 2026-09-23 for
+      Realtime as `libs/wbs/application/core/src/module/realtime/README.md`,
+      `docs/wiki-policy/modules.json`'s `module.application.realtime` row and
+      `docs/wiki-policy/policy.json`'s `boundary.application.realtime`, using a `sourceSelector`
+      bound to the pre-move `libs/core/src/use-cases/replay.ts` alone — the file `kinds.json`
+      classified `capability: realtime` before the move. `gateway-broadcaster.ts`,
+      `replay-buffer.ts` and `replay-orchestrator.ts` have no separate baseline entry, for the same
+      reason.
```

Write the whole addition as one continuous paragraph per list item, never a second paragraph
separated by a blank line inside the same `- [x]` item: Prettier re-indents a two-paragraph
checklist item non-idempotently (Bounded replay sweep's own packet rehearsed this: it drifts to a
14-space indent on the second `--write` pass).

## 11. Global stop conditions

These are not preconditions — each slice's own step 0 in section 7 holds those, so that a later
slice is never blocked by an earlier slice's own work. Stop on any of the following at any point
(restated from the intro's "Dispatch" paragraph, in the form packets A's and E's own section 11
use):

- A red checkpoint reports `0 tests ran`: the `-t` filter did not match. Anchor the joined `describe`
  and title, or use the unanchored title alone; never include Bun's printed `>`.
- A mutation leaves its named test passing. That is first a location mistake: restore, check the
  location against section 10, redo once, and stop if it still passes.
- A command needs the network, or an OpenSpec invocation tries to download.
- A step-0 line in section 7 does not print what it says.
- A section 10 edit anchor (an exact line, diff context or JSON entry) does not match the file as
  found. The file drifted from what this packet assumed; report the mismatch, do not invent a repair.
- A pin this packet records before its own edits — `kinds.json`'s entry count, `modules.json`'s or
  `policy.json`'s array lengths, `repo-namespacing-handoff.test.ts`'s digest or occurrence numbers —
  differs from what section 7's own step 0 observes.
- Any sign that extraction changed `GatewayBroadcaster`'s, `ReplayBuffer`'s or `ReplayOrchestrator`'s
  runtime behaviour, delivery order or fallback logic, rather than only their location.
- Any check this packet names is unavailable. Report the block; never skip it silently.
- A check requires an edit this packet does not itself prescribe (an out-of-lane fix). Report the
  block; never make the edit.

**Not a stop.** An Nx target outliving the tool's own wait is STILL RUNNING, not failed: poll it
under a status-recording wrapper (`if cmd >"$log" 2>&1 & wait $!; ...` with a background status
file, per the preamble's own sandbox rules) rather than treating the timeout as a failure.

## 12. Ready to commit

Each slice ends in its own planner commit, so there is no single final `git status`. Each slice
records `base=$(git rev-parse HEAD)` in its step 0 and hands over `git diff --name-only "$base"` plus
`git ls-files --others --exclude-standard`, which cannot be broken by the planner's own commits. Every
list below includes the slice's own `openspec/changes/adopt-di-composition/verify.md` append and,
where the slice ticks one, `tasks.md`: those edits are prescribed, so a hand-over that omitted them
would contradict the slice.

| Slice | `git diff --name-only` adds                                                                                                                                                                                                                                                                                                                                                | Untracked adds                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `libs/wbs/application/core/src/use-cases/replay.ts`, `.../service/gateway-broadcaster.ts`, `.../service/replay-buffer.ts`, `.../service/replay-orchestrator.ts` (each replaced by its shim), `.../ports/sideways-type-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md`                                                                               | the nine files under `libs/wbs/application/core/src/module/realtime/`                                                                                             |
| 2     | `libs/wbs/application/core/src/compose.ts`, `.../index.ts`, `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                                         | nothing                                                                                                                                                           |
| 3     | `libs/wbs/application/core/src/module/realtime/README.md` (its slice-1 content replaced), `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | nothing (`docs/findings/current-document-check-exemptions.json` is a precondition, added before slice 1 dispatches — see the intro — and carries no slice-3 edit) |

## 13. Findings for the map and for packets A–E's landed code

- **Map, `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`:** no defect
  found. The map's own required preparation 6 ("Root composition supplies the optimizer event
  callback and realtime broadcaster. Neither feature imports the other.") answered this packet's own
  composition question exactly as measured in section 3, before any code was written.
- **Packets A, B, C, D, E:** no defect found in landed code. Packet E's own section 9 correctly
  flagged the Broadcaster composition question as this packet's design question rather than
  resolving it itself, and its own measurement of Realtime's four files (358 lines, zero sideways
  edges) reproduced identically against the tree this packet started from.
- **`docs/wiki-policy/modules.json`'s existing `module.application.use-cases`'s own `module-index`
  block still lists `replay.ts` (and `retention-sweep.ts`) as path memberships even after both
  became re-export shims.** Not a defect: a shim file still exists at that path and the directory
  prefix membership is about presence, not content, but a reader of that block by eye could mistake
  it for meaning the real feature code still lives there. Worth a one-line addition to a future
  wiki-registration packet's own README prose, not a fix this packet makes.
- **A one-line addition to the map or to `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s
  "Standard blocks" would help every future module packet, restated from Bounded replay sweep's own
  section 13:** "a module README's prose never spells its predecessor's literal path; say 'the file
  it was extracted from' instead."

## 14. This packet's own document exemption (precondition record, not a slice)

This packet's "Exact content" sections (10.8, 10.9, 10.11, 10.12) repeatedly cite
`libs/core/src/use-cases/replay.ts`, the pre-move file `docs/wiki-policy/policy.json`'s new
`sourceSelector` boundary binds to — the same reason packets D's and E's own documents needed an
entry in `docs/findings/current-document-check-exemptions.json`. That entry must exist, added
alongside this packet document itself (matching packets D's and E's own precedent), **before** any
slice below dispatches — see the intro's dispatch paragraph. No slice touches that file:

```json
{
  "path": "docs/superpowers/plans/2026-09-21-batch-6/040-6-e2-realtime.md",
  "reason": "task packet whose verified facts and exact-content sections repeatedly cite libs/core/src/use-cases/replay.ts, the pre-move file docs/wiki-policy/policy.json's new sourceSelector boundary binds to",
  "excuses": ["legacy-root"]
}
```

## 15. Disposition of review 1

**Verdict: READY AFTER FIXES.**

- **Critical 1, §10.5's diff did not match the starting tree. FIXED.** Regenerated against this
  checkout at `95754749`: the new explanation and both new `Proof:` paragraphs are inserted after
  Bounded replay sweep's own two existing `Proof:` paragraphs and before the closing `*/`,
  preserving every existing line; the two new `routes` entries are a separate hunk. Replaced with
  real `git diff` output and verified with `git apply --check` against a checkout of `95754749`.
- **Critical 2, §10.11 created a duplicate object property. FIXED.** The `43` line is now a
  deletion (`-`), not context; rehearsed and reverted the wrong version to reproduce **TS1117** on
  `tool-devsync:typecheck` exactly as predicted (§6 row 13). `tool-devsync:typecheck` and
  `tool-devsync:lint` are both added to slice 3's own verification (§7 slice 3 step 6).
- **Critical 3, §7 slice 3 step 4's expected failure was impossible after the prescribed edit.
  FIXED.** Step 4 now states that parity passes once the ninth boundary lands and the named test
  fails at the discovered-index assertion instead (`Expected: true`, `Received: false`), rehearsed
  as its own separate checkpoint (§6 rows 11 and 12).
- **Important 1, the bag-leak mutation contradicted its claimed typecheck result. FIXED.** §10.4's
  and §6 row 3's mutation now builds `const exposed = { ..., bag }` and returns the variable
  (structurally assignable, so `wbs-core:typecheck` exits 0) rather than returning the object
  literal directly (which fails with **TS2353** — rehearsed and confirmed). §10.4 states the
  contrast explicitly.
- **Important 2, the sealing tests missed the second private binding. FIXED.** `module.test.ts`'s
  "keeps its private bindings out of a host graph" and "labels its private bindings with the module
  name" each gained a second assertion for `replayOptions`; §6 splits the former single row into
  rows 5 and 6, each widening the exported tuple by exactly one private key and rehearsed
  independently — leaking only `replayOptions` (row 6) leaves `broadcasterOptions` correctly hidden
  and labelled, and vice versa.
- **Important 3, slice 2 lacked pre-edit baselines for `wbs-domain`, be-01 typecheck and the four
  be-01 test files. FIXED.** Slice 2's step 0 now records all three before any edit; the closing
  table requires each unchanged from that baseline, not merely green.
- **Minor 1, incorrect line anchor in §10.12. FIXED.** The 7.5 extension now names the anchor by
  its unique text (`` `contract.ts`/`module.ts`/`check.ts` predecessor either.``) rather than a line
  number, since an earlier hunk in the same diff shifts every later line.
- **Minor 2, preamble rule 17 misquoted; a still-running Nx target listed as a stop condition.
  FIXED.** Every reference to rule 17 now names its real scope (`simple-import-sort/imports`,
  `simple-import-sort/exports`, `prettier/prettier` only — never an unused-import rule). The
  still-running-Nx-target note moved out of §11's "Stop on any of" list into its own "Not a stop"
  paragraph immediately after it.
- **Minor 3, conflicting pin-update authority between §7 step 6 and §10.11. FIXED.** One authority
  now governs: this packet's own before/after numbers and digest are what the executor applies;
  a step-0 baseline mismatch is a stop, reported to the planner, never a locally computed
  replacement.

Every fenced diff in the finished document (ten blocks; the three import-only fragments in §10.2
are explicitly not among them, per that section's own note) was extracted and checked in slice
order with `git apply --check` against its correct predecessor tree (`95754749` for §10.5;
`7e65dd4a`, slice 1's own planner commit, for §10.6 and §10.7; `60edd69e`, slice 2's own planner
commit, for §10.10, §10.11 and §10.12) — all seven applied cleanly.
