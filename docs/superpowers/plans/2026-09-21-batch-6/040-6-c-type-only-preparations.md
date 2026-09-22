# 040.6 C The type-only preparations and the K9 inventory

> **Dispatch:** `--batch batch-6` (the launcher's batch-6 default supplies
> `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`). No slice binds a port, so **no slice
> needs `--network`**. Slices 1 to 4 need no seed. Slice 5 is the hand-over: it cites the evidence of
> slices 1 to 4 and is dispatched with one `--seed` per earlier attempt id — section 7's slice 5 gives
> the exact layout. Section 8 scopes every command the sandbox cannot run.
>
> Slices 2 to 5 continue the clone slice 1 created, so each of them is dispatched with `--resume`
> and `--require-ancestor <the reviewed previous slice's sha>`; the launcher exits 67 on an existing
> clone without `--resume`.
>
> **Revised four times on 2026-09-22, and this is the last identity round.** The fourth review found
> that resolving the selected expression's **type** loses the export when its value type is primitive: a
> forwarded `TOKEN_TTL_SECONDS` selects to `number`, which declares nothing. The rule now resolves the
> **export symbol** as well — for every literal member name the key type can be, it takes
> `checker.getPropertyOfType` on the base module and follows the alias chain — and keeps the type route
> for what the symbol route cannot name. Both of round 4's forms are faults 24 and 25. From here on
> **section 6 lists the forms that have watched negatives and claims no class**; anything else, observed
> `1 pass`, `0 fail`, is in the residual table with its probe. Section 17 disposes of every finding.
>
> **Revised three times on 2026-09-22.** The third review found that a finite-union selector
> (`key: 'CalendarMarkerService' | 'ReplayOrchestrator'`) resolved to a type with no symbol of its own
> and slipped through, and that this packet's initial reds for slices 1 and 2 had been measured on the
> restored tree rather than on the code each slice actually starts from. Both are fixed from
> measurement: the identity branch now walks union and intersection constituents, and the two initial
> reds are **four** and **twenty-two** rows, quoted in section 6. The widened-key fault is no longer a
> residual — walking constituents catches it — and the residual is now a base whose module identity has
> been cast away. Section 16 disposes of every finding.
>
> **Revised twice on 2026-09-22 — this paragraph is history, superseded by the two above.** After the
> second review the rule stopped enumerating member spellings: the three forms round 2 got through — a
> `const`-keyed element access, a computed binding property and an indexed-access type through a type
> alias, all through a narrow forwarding file — were reproduced returning `[]` on the round-1 listing
> first, and are faults 18 to 20. Two of that round's claims did not survive: a widened `string` key is
> **not** a residual (round 3 showed `keyof typeof` resolves it, fault 21), and "a selection whose base
> resolves to a module" is no longer claimed as a class at all (round 4). Round 2 also closed the
> evidence, dispatch and wording defects listed in section 15, and retracted this packet's one wrong
> rejection.
>
> **Revised once on 2026-09-22, after its first review.** The review found a real defect in the rule
> this packet prescribes: a namespace of a **forwarding barrel**, read by property access, element
> access or destructuring, reached the owner with nothing reported. The rule now resolves the selected
> member and the destructured property through the `TypeChecker` to their declaring file; four new
> watched negatives cover the four spellings, and the bypass was reproduced on the previous listing
> first. The review also found that slice 3's baseline ran a `Bun.serve` test in a sandbox dispatched
> without network, that the proof-comment count demanded six comments where five exist, and that slice
> 5's step 0, dispatch, baselines and closing record were wrong in several ways. Section 14 disposes of
> every finding.
>
> **Rehearsed on `10c2171f`** (main after batch 6's integration, which carries packets A and B).
> Every red, green, count, fault and literal fragment below was produced in a private worktree of
> that commit against the listings in section 9, one slice at a time, each ending in a real
> `git commit` that lefthook accepted.

| Field      | Value                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — third packet                                                                                                  |
| Size class | M, in five slices                                                                                                                                                                                        |
| Slices     | 1 the marker read port and the rule's first row, 2 the principals and the rule's other three rows, 3 the optimizer's two type paths, 4 the negatives, 5 the K9 values and the close                      |
| Continues  | `openspec/changes/adopt-di-composition`. Tasks 1.3, 1.4 and 1.8 are ticked; 1.6 keeps its box and gains a note, because only its first half lands here. No artifact of the change is rewritten           |
| Implements | `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`, required no-sideways preparations 3, 4, 5, 6 and the first half of 8, plus the four incorrect K9 inventory values the map names |
| Planned on | 2026-09-22, every slice rehearsed end to end in a private worktree of `10c2171f`                                                                                                                         |

**You execute one slice and stop.** The end of your instructions names which. Each slice in section 7
opens with its own step 0: what must hold **before** it edits anything, and the baselines it compares
against. Section 8 names the planner's checks.

## 1. Goal and non-goals

**Goal.** Remove the five sideways **type** dependencies the module map's preparations 3, 4, 5 and 8
name, each by the smallest move that removes it and with every `@wbs/core` and `@wbs/contracts` name
kept as a compatibility export:

- Plan document stops naming `CalendarMarkerService`'s outcome type and names a marker **read port**
  instead (preparation 3, task 1.3).
- `runCommandBatch`, `replay`, `savePlan`, `retention-sweep.ts` and `retention-timer.ts` stop taking
  their principal types from the Authentication service and from the HTTP endpoint, and take them
  from the contracts library (preparations 4 and 5, task 1.4).
- `optimization-coordinator.ts` takes `SolverObjectiveName` from `@wbs/domain` instead of the
  repository schema, and `ProjectEvent` from `@wbs/core` instead of through `service/broadcast.ts`
  (the first half of preparation 8, the first half of task 1.6).
- Preparation 6 is **already met** and is recorded with its evidence rather than redone (section 4).
- The five `kinds.json` capability values the map calls four are corrected in place, `K` staying 95
  (task 1.8).

One checked rule is added, `rejects the checked sideways-type import routes` in
`libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`. **A type-only move has no
runtime behaviour, so its production-path negative is not a behaviour test's failure: it is this
rule's red while `wbs-core:typecheck` stays at exit 0.** That asymmetry is the whole reason the rule
exists — every move here leaves a compatibility re-export behind, so re-introducing the sideways
import still compiles. Seventeen injected reference routes are watched negatives, on top of the two
slices' own initial reds; two further probes are recorded as **not** prevented; and four guards are
watched throwing, one of them against a false green. What the rule cannot keep is stated in section 6 and in
the function's own JSDoc, not promised.

**Non-goals.** No DI Bag module: section 4 shows why none of these preparations produces one, so no
`module.ts`, `contract.ts` or `check.ts` is written. No library version bump: `di-bag` stays 0.4.0,
`application-exception` 0.5.0, `caught-object-report-json` 11.0.1; `bun.lock` and `package.json` are
the planner's. **Preparation 7 and the second half of 8 are not in this packet** — the Optimization
spawn/child contract and the injected cache-key port are tasks 1.5 and the rest of 1.6, and 3.6 is
the module that owns them. No `AuthService`, `CalendarMarkerService` or `PlanDocumentService`
behaviour change: every edit below is a type position, an import line or a re-export. No K2 closure.
No frontend, gateway or MCP edit: `apps/wbs/gw-01` and `apps/wbs/mcp-01` import nothing from
`@wbs/core` (measured, section 3).

## 2. Read first

| File                                                                        | Why                                                                                                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                 | Rules R1 to R5. R5 and R3 decide most of the review of this work.                                                                                                                |
| `LLM_README.md`                                                             | The index. Read only the entry your slice needs.                                                                                                                                 |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                       | "Execution contract" and "Standard blocks every packet uses". Slice 5 runs the OpenSpec validation block.                                                                        |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-b-broadcast-event-port.md` | The second packet of this item. Its section 6 is the model for how a check's limits are stated; its 9.4 is the rule this one reuses.                                             |
| `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`     | The ownership map, lines 78 to 118. Section 13 corrects three of its statements.                                                                                                 |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`             | "Import matrix" (line 152) and K2 to K6. Every relevant **backend** kind may import both Domain and Contracts; `UI primitives` may import neither, and is no row of this packet. |
| `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts`         | Packet B's identity-based rule. Slice 1's check is the same vantage points aimed at a different question, plus a fourth one B does not need.                                     |

## 3. Verified facts

Every line was read at `10c2171f` on 2026-09-22; every command result was observed in a private
worktree of that commit.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation 3 is **mostly done already**: `PlanDocumentServiceOptions.markers` is a structural port, not `CalendarMarkerService`. Only the type import remains.                                                                                                                                                                                                                                                                                                                                                                                                                                              | `libs/wbs/application/core/src/service/plan-document.ts:27-30` against `:14`                                                                                                           |
| What remains of preparation 3 is one line: `import type { CalendarMarkerListOutcome } from './calendar-marker.service';`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `libs/wbs/application/core/src/service/plan-document.ts:14`                                                                                                                            |
| `CalendarMarkerListOutcome` needs three more declarations to move with it: `CalendarMarkerRefused` (`:56`), which needs `CalendarMarkerRefusal` (`:31`) and `CalendarMarkerSubject` (`:54`). `CalendarMarkerOutcome` (`:62`) stays: only the write side uses it.                                                                                                                                                                                                                                                                                                                                             | `libs/wbs/application/core/src/service/calendar-marker.service.ts:31,54,56,62,64`                                                                                                      |
| `CalendarMarkerStore` refuses with `not_found` or `taken` only and has no notion of `forbidden`, so the refusal shape is the service's answer and not the table's. That is why the new file is `ports/calendar-marker-read.ts` and not an addition to `ports/calendar-marker-store.ts`.                                                                                                                                                                                                                                                                                                                      | `libs/wbs/application/core/src/ports/calendar-marker-store.ts:41-42`                                                                                                                   |
| `AuthenticatedUser` is a three-field interface whose only dependency is `WbsScope` from `@wbs/contracts`. Nothing about it is authentication logic.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `libs/wbs/application/core/src/service/auth.service.ts:56-60`; `libs/wbs/domain/contracts/src/oidc-identity.ts:1`                                                                      |
| Four use cases take it from the Authentication service, and `http/endpoint.ts` does too: `use-cases/run-command-batch.ts:1`, `use-cases/replay.ts:2`, `use-cases/save-plan.ts:4`, `use-cases/retention-sweep.ts:2`, `http/endpoint.ts:18`.                                                                                                                                                                                                                                                                                                                                                                   | those lines                                                                                                                                                                            |
| `InternalIdentity` is declared in **delivery** and imported by two use cases and by `service/retention-timer.ts`. A feature importing delivery is what the import matrix refuses outright, so preparation 5 is not satisfied by leaving it there.                                                                                                                                                                                                                                                                                                                                                            | `libs/wbs/application/core/src/http/endpoint.ts:30-32`; `use-cases/replay.ts:1`, `use-cases/retention-sweep.ts:1`, `service/retention-timer.ts:1`                                      |
| `WbsScope` and `OidcIdentity` already live in the contracts library, and the library's index is a flat list of `export *` lines. A new `principal.ts` costs one line there.                                                                                                                                                                                                                                                                                                                                                                                                                                  | `libs/wbs/domain/contracts/src/oidc-identity.ts:1-10`; `libs/wbs/domain/contracts/src/index.ts:31`                                                                                     |
| The import matrix lets every **backend** row — repository adapter, resource-service, feature-service, delivery — import both Domain and Contracts, while Feature-service to Feature-service is `no, K6` and Feature-service to Delivery is `no`. (`UI primitives` may import neither, but it is a frontend row and no row of this packet.) Domain and Contracts are both legal shared homes; Contracts is the one chosen here, because a principal is a wire-shaped value and `WbsScope` already lives there.                                                                                                | `docs/superpowers/specs/2026-09-19-code-organization-design.md:154-161`                                                                                                                |
| Preparation 8's first half is one line in the Optimization feature: `import type { SolverObjectiveName } from '../repository/schema';`. That path is two hops of pure forwarding — `apps/wbs/be-01/src/repository/schema.ts:1` is `export * from '@wbs/store-sqlite/schema';`, and line 2026 of the adapter schema is `export { SOLVER_OBJECTIVES, type SolverObjectiveName } from '@wbs/domain';` — so the declaration already is the domain's and only the path is sideways.                                                                                                                               | `apps/wbs/be-01/src/service/optimization-coordinator.ts:43`; `apps/wbs/be-01/src/repository/schema.ts:1`; `libs/wbs/adapters/store-sqlite/src/schema.ts:2026`                          |
| One test takes it the same way: `apps/wbs/be-01/src/service/optimized-plan-read.test.ts:6`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | that line                                                                                                                                                                              |
| The coordinator also takes `ProjectEvent` from `./broadcast`, the be-01 shim of the file packet B split. The declaration it reaches is neutral, but the path is not, and `@wbs/core` exports the name directly.                                                                                                                                                                                                                                                                                                                                                                                              | `apps/wbs/be-01/src/service/optimization-coordinator.ts:44`; `libs/wbs/application/core/src/index.ts:36`                                                                               |
| `docs/code-organization/kinds.json` holds **95** entries. Five carry a value the map calls wrong: `import.service.ts` (`"unspecified"`, line 321) and four `"core-lib-extraction"` rows at lines 351, 453, 525 and 531. Plan history's row is no longer one of them: task 2.1 turned it into a shim.                                                                                                                                                                                                                                                                                                         | `python3 -c` over the policy; `docs/code-organization/kinds.json:319-321,349-351,451-453,523-525,529-531`                                                                              |
| `kinds.json` scan roots are `libs/wbs/application/core/src/service`, `…/src/use-cases` and `apps/wbs/be-01/src/service` only, so the two new files under `ports/` and the new contracts file owe no entry.                                                                                                                                                                                                                                                                                                                                                                                                   | `tools/tool-devsync/src/service-kinds.ts:15-19`                                                                                                                                        |
| The `capability` field is a free `string>0` in the policy schema: nothing cross-checks it against OpenSpec, so the correction is a reviewed claim and its evidence is the requirement group, not an exit code.                                                                                                                                                                                                                                                                                                                                                                                               | `tools/tool-devsync/src/service-kinds.ts:41`                                                                                                                                           |
| `wbs-domain` is **not** a synced main spec. `openspec spec list` names twelve capabilities and not that one, while 123 archived change directories carry `specs/wbs-domain/`.                                                                                                                                                                                                                                                                                                                                                                                                                                | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 spec list`; `ls -d openspec/changes/archive/*/specs/wbs-domain                                                                  | wc -l` is 123 |
| `plan-import` is named as a capability by the unarchived `plan-json-import` change, whose delta spec sits under `specs/wbs-domain/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `openspec/changes/plan-json-import/proposal.md:23`; `openspec/changes/plan-json-import/specs/wbs-domain/spec.md:8`                                                                     |
| Plan commands' user-facing requirements are the archived `2026-08-30-plan-commands` group; Saved plans' are in the archived `2026-09-10-scheduler-runtime-port` group.                                                                                                                                                                                                                                                                                                                                                                                                                                       | `openspec/changes/archive/2026-08-30-plan-commands/specs/wbs-domain/spec.md:3,42,67`; `openspec/changes/archive/2026-09-10-scheduler-runtime-port/specs/wbs-domain/spec.md:12,125,260` |
| `lint:source` exists **only** on the Burokrat project. For `wbs-core`, `wbs-contracts` and `wbs-be-01` the source-lint target is `lint`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `bunx nx show project wbs-core --json`; packet B section 3 records the same                                                                                                            |
| `apps/wbs/gw-01` and `apps/wbs/mcp-01` import nothing from `@wbs/core`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `grep -rn "@wbs/core" apps/wbs/gw-01/src apps/wbs/mcp-01/src` printed nothing                                                                                                          |
| TypeScript **6.0.2** is installed as `npm:@typescript/typescript6@6.0.2` and `ports/event-port-boundaries.test.ts` already imports it, so the new rule parses instead of matching text.                                                                                                                                                                                                                                                                                                                                                                                                                      | `package.json:117`; `libs/wbs/application/core/src/ports/event-port-boundaries.test.ts:5`                                                                                              |
| Exactly two be-01 test files bind a socket, and neither is in slice 3's enumerated suite: `apps/wbs/be-01/src/app.routes.test.ts:548` calls `Bun.serve` and `apps/wbs/be-01/src/boot.db.test.ts` listens. `optimization-spawn-handshake.proc.db.test.ts` spawns a child. All three are planner-only.                                                                                                                                                                                                                                                                                                         | `grep -rln "Bun.serve\|\.listen(" apps/wbs/be-01/src --include=*.test.ts` printed those two paths and nothing else                                                                     |
| Slice 3's focused sandbox-safe subset is the six selected be-01 test files closest to the two changed files: `60 pass`, `0 fail` over 6 files in 3.1 seconds, and none of the six names `Bun.spawn` or `spawnSync`. Four further eligible tests (`services.db.test.ts`, `controller/project.controller.test.ts`, `service/optimization-restart.db.test.ts`, `service/optimization-cancel.two-coordinator.db.test.ts`) are the planner's in the whole target; `service/optimization-spawn-handshake.proc.db.test.ts` also reaches the coordinator but spawns a child, so it is excluded rather than deferred. | Observed 2026-09-22; `grep -ln "Bun.spawn\|spawnSync"` over the six printed nothing and exited 1                                                                                       |
| The whole-target values on the rehearsed tree, all exit 0: `wbs-core:test` 543 pass over 55 files, `wbs-be-01` `bun test src` 1091 pass and 1 skip over 92 files, `wbs-gw-01:test` 128 pass over 17 files, `wbs-mcp-01:test` 165 pass over 15 files, `tool-devsync:test` 366 pass over 25 files, `wbs-core:build:portable`, `wbs-core:test:portable`, `nx format:check --all`.                                                                                                                                                                                                                               | Observed 2026-09-22                                                                                                                                                                    |
| Strict OpenSpec validation is `{"items": 114, "passed": 114, "failed": 0}` before and after this packet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The README's `jq -s -e` block, observed exit 0                                                                                                                                         |
| `grep` is **ugrep** on the rehearsal host and exits **1** for a missing input file as well as for zero matches, so every count below is preceded by `test -f` or is read by Bun.                                                                                                                                                                                                                                                                                                                                                                                                                             | Packet B section 3 records the same observation                                                                                                                                        |

## 4. What is already met, and why none of this is a module

**Preparation 6 is already met.** It asks that "Root composition supplies the optimizer event
callback and realtime broadcaster. Neither feature imports the other." Measured at `10c2171f`:

- The callback is supplied by the root. `apps/wbs/be-01/src/services.ts:149-150` passes
  `pushRecorded: (subscription, recorded, event) => graph.gatewayBroadcaster.pushRecorded(...)` into
  `OptimizationCoordinatorOptions`, whose declaration
  (`apps/wbs/be-01/src/service/optimization-coordinator.ts:84-88`) documents it as the "best-effort
  live half, invoked only after the outcome transaction commits". Optimization holds a function, not
  a broadcaster.
- Realtime does not import Optimization. `libs/wbs/application/core/src/service/optimizer-trigger-broadcaster.ts:1`
  imports `Broadcaster` and `ProjectEvent` from the neutral port packet B created and takes
  `inputChanged: OptimizationInputChanged` as a constructor argument (`:22-26`). It names no
  coordinator type.
- Optimization does not import Realtime's code. Its only edge into that direction was the
  `ProjectEvent` **type** through `./broadcast`, and slice 3 removes it. Nothing else in
  `optimization-coordinator.ts` names `GatewayBroadcaster`, `ReplayBuffer` or
  `OptimizerTriggerBroadcaster` (`grep` over that file printed nothing for all three).

So this packet records preparation 6 as met, with those three citations, and changes nothing for it
beyond the `ProjectEvent` path that slice 3 tidies while it is in that file for preparation 8.

**Preparation 3 was mostly done already**, exactly as packet A's author reported: `markers` is
already a structural port (`plan-document.ts:27-30`). What remained is the type import at `:14`, and
that is what slice 1 removes — by giving the structural shape a name in `ports/`, which is what the
map's "owner-neutral marker-read port" (line 43) asks for. Naming it matters: an anonymous inline
shape leaves the outcome type's home a resource file, so the K6 edge survives the "port" in the
prose.

**None of these preparations produces a DI Bag module, though three of the files it edits belong to
responsibilities the map does give module rows.** The map's "Proposed core modules" table has rows for
Authentication (`:36`), Calendar markers (`:37`) and Plan document (`:43`), and this packet edits a
file of each. It **prepares** those three and extracts none: Authentication's module is task 3.5,
Plan document's is task **4.1**, written as "Plan document as a resource module over the neutral
marker read port from 1.3", and Calendar markers' is task 5.1. This packet supplies the port 4.1
consumes, moves the principal types 3.5 will need out of the way, and stops there. `AuthenticatedUser`
and `InternalIdentity` are contracts, not services, so they produce no module of their own. What ships
is two type homes, one rule and five corrected inventory values, and no `module.ts`.

**Why the contracts library and not a third place.** The import matrix
(`2026-09-19-code-organization-design.md:154-161`) allows both **Domain** and **Contracts** from every
backend row, refuses Feature-service to Feature-service (`no, K6`) and refuses Feature-service to
Delivery. So a principal type used by four features and by delivery has two legal homes, and Contracts
is the chosen one: `WbsScope`, which `AuthenticatedUser` is made of, is already there, and a principal
is a wire-shaped value rather than a plan rule. `http/endpoint.ts` would have been the cheaper edit and
is wrong whichever of the two is picked: `auth.service.ts` would then import delivery.

**Size.** Five slices of one 20-to-40-minute attempt each. The work is cut by preparation, and the
rule's rows are introduced in the slice whose red they produce.

## 5. File plan

| Path                                                                   | Slice | Create or modify                                                                                                               |
| ---------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `libs/wbs/application/core/src/ports/calendar-marker-read.ts`          | 1     | create, from section 9.1                                                                                                       |
| `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` | 1,2,4 | create in slice 1 with one `routes` row (9.5); slice 2 adds three rows (9.6); slice 4 writes its five `Proof:` comments (9.11) |
| `libs/wbs/application/core/src/service/calendar-marker.service.ts`     | 1     | modify: import two names from the port, delete four declarations, re-export four names (9.2)                                   |
| `libs/wbs/application/core/src/service/plan-document.ts`               | 1     | modify, two edits (9.3)                                                                                                        |
| `libs/wbs/application/core/src/index.ts`                               | 1     | modify, one insertion (9.4)                                                                                                    |
| `libs/wbs/domain/contracts/src/principal.ts`                           | 2     | create, from section 9.7                                                                                                       |
| `libs/wbs/domain/contracts/src/index.ts`                               | 2     | modify, one insertion (9.8)                                                                                                    |
| `libs/wbs/application/core/src/service/auth.service.ts`                | 2     | modify: the declaration becomes a re-export (9.9)                                                                              |
| `libs/wbs/application/core/src/http/endpoint.ts`                       | 2     | modify: both principal types come from contracts (9.9)                                                                         |
| The six production and three test importers of section 9.10            | 2     | modify, one import line each                                                                                                   |
| `apps/wbs/be-01/src/service/optimization-coordinator.ts`               | 3     | modify, two import lines (9.12)                                                                                                |
| `apps/wbs/be-01/src/service/optimized-plan-read.test.ts`               | 3     | modify, one import line (9.12)                                                                                                 |
| `docs/code-organization/kinds.json`                                    | 5     | modify, five `capability` values and five rationales rewritten in place (9.13)                                                 |
| `openspec/changes/adopt-di-composition/tasks.md`                       | 5     | modify: tick 1.3, 1.4 and 1.8 with notes, and add a note under 1.6 without ticking it (9.14)                                   |
| `openspec/changes/adopt-di-composition/verify.md`                      | 1–5   | modify: each slice appends its own baselines, deltas and evidence basenames                                                    |

**Neighbours.** No other batch-6 packet owns any of these paths. `docs/code-organization/kinds.json`
is packet B's only in the one entry it rewrote for `service/broadcast.ts`; slice 5 touches five other
entries and must not disturb that one. `openspec/changes/adopt-di-composition/tasks.md` carries
packet B's note under 1.2, which stays verbatim. Section 10's cumulative check is a
`git diff --name-only` against a base each slice records itself, so the planner's own commits — a
revision of this packet file included — cannot break it.

## 6. Rehearsed observations

Every row was produced in a private worktree of `10c2171f` against the final listings in section 9,
and the literal fragment is what Bun 1.4.2 printed. Restore a mutated file from a copy under
`"$TMPDIR"` and prove it with `cmp` **before** asserting on any captured status.

**The contract is a list of forms, not a class.** Four rounds of review taught that every attempt to
claim a category ("selections whose base resolves to a module") was wider than what the rule rejected.
So the claim is an enumeration of the forms that have a watched negative in the table below, and nothing
else. Every question compares **declaration files of resolved identities**, never spelling. Section 9.11's
JSDoc carries the same list, fault for fault.

| Covered form                                                                                                            | Watched as |
| ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| A module specifier resolving to a forbidden file, including a bare side-effect import                                   | 3, 7       |
| A named import of a name the forbidden file declares, and the same through the `@wbs/core` barrel                       | 1, 2, 8    |
| A type-only namespace import of the forbidden file, used as a qualified type                                            | 4          |
| A value namespace of the forbidden file, read by element access                                                         | 5          |
| A `typeof import(...)` indexed by a string literal                                                                      | 6          |
| A value namespace of a **forwarding barrel**, read by element access, property access, or destructured plain or renamed | 10–13      |
| A namespace of a **narrow forwarding file**, read by a `const`-typed literal key                                        | 18         |
| …destructured through a **computed** property name                                                                      | 19         |
| …read as an indexed-access type through a **type alias** key                                                            | 20         |
| …read by a key the compiler knows only as `string`, cast back through `keyof typeof`                                    | 21         |
| …read by a **finite-union** key, judged by every constituent                                                            | 22         |
| A forwarded **primitive-valued** export, read as an indexed-access type                                                 | 24         |
| …and the same read by a `const`-keyed element access                                                                    | 25         |

The last two are why there are **two** routes into a selection: the checker's answer for the selection
itself, walking union and intersection constituents, and the base module's **export symbol** for every
literal member name the key type can be, followed to the end of its alias chain. A forwarded
`export const TOKEN_TTL_SECONDS` selects to `number`, which declares nothing, so the type route alone
lost it (round 4). The one assertion this packet ships is named
`rejects the checked sideways-type import routes`, and that name is the claim.

**Unverified by this packet.** The implementation also resolves a dynamic `import(...)` specifier, an
`import x = require(...)` reference, a renamed import, a `default` re-export, an `export * as ns`
re-export and a multi-hop re-export chain — and this packet supplies **no probe for any of them**, so it
claims nothing about them. They are neither covered nor residual: they are untested code paths, and a
later packet that needs them owes them a watched negative first.
`ports/event-port-boundaries.test.ts` watches those forms against **its own** port contracts, which is
evidence about that rule and not about this one.

**Four rounds, and what each got past.** Round 1 got past a rule that asked only which module the base
resolved to: a value namespace of `index.ts` — which forwards the Calendar marker service — read as
`core['CalendarMarkerService']`, as `core.CalendarMarkerService`, or destructured as
`const { CalendarMarkerService } = core`, reported nothing (`1 pass`, `0 fail`, `wbs-core:typecheck`
exit 0, observed). Round 1's answer added the **member name**, and round 2 got past
that too, because a name is still a spelling: through a narrow file forwarding only
`CalendarMarkerService`, `markers[key]` with `const key = 'CalendarMarkerService'`, a computed binding
property `const { ['CalendarMarkerService']: held } = markers`, and
`(typeof import('./replay-orchestrator'))[MarkerKey]` each returned `[]` — observed on the round-1
listing, `1 pass`, `0 fail`, typecheck exit 0 for all three. Round 2's answer took
`checker.getTypeAtLocation(node)` and the node's own symbol and asked where **that** was declared, which
removed `selectedName` and `memberDeclarations`. Round 3 then got past that, because it read only the
selected type's **own** symbol: a finite-union selector,
`key: 'CalendarMarkerService' | 'ReplayOrchestrator'`, resolves to
`typeof CalendarMarkerService | typeof ReplayOrchestrator`, and a union carries no symbol of its own, so
the rule saw nothing (`[]`, typecheck exit 0, observed on the round-2 listing). Walking union and
intersection constituents, alias-resolved and cycle-guarded, closed that. Round 4 then got past **the
type route itself**: with `export { TOKEN_TTL_SECONDS } from './auth.service';` appended to
`service/replay-orchestrator.ts`, `use-cases/replay.ts` reading
`(typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS']` and, separately, a `const`-keyed
element access of the same namespace both returned `[]` at typecheck exit 0 — the selection's type is
`number`, and a primitive declares nothing. The **export-symbol** route closed that, and faults 24 and 25
are those two forms. Faults 10 to 13, 18 to 22, 24 and 25 are the eleven selection spellings, each red;
fault 23 is what neither route reaches, and it is not a spelling but a cast that destroys the base's
module identity before anything is selected.

**Why a type-only move's negative is a rule's red and not a test's failure.** Every move here leaves
a compatibility re-export at the old path, which is what keeps `@wbs/core` working — and which means
re-introducing the sideways import **compiles**. Faults 1 to 13 were each run with
`NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache`, which exited **0** for every one of
them. A typecheck red would have proved nothing about the rule; the rule's red is the only thing that
notices. Fault **8b** is the one exception, and it is recorded precisely because it compiled wrongly:
a mutation the compiler rejects proves nothing about the rule, so it was replaced rather than kept.

| #   | Where                                                                                                      | Fault injected                                                                                                                                                                                                                                                                                    | Literal fragment observed on `rejects the checked sideways-type import routes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red, on the code slice 1 starts from, with only the marker row in `routes`                         | none; the row is new. **This is an initial red on unchanged code, not a restoration**: `CalendarMarkerListOutcome` and the refusal shape are still declared in the service, so the identifier and property vantages fire as well as the specifier one                                             | `- []`, then **four** rows — `'./calendar-marker.service' reaches …`, `CalendarMarkerListOutcome reaches …`, `ok reaches …`, `value reaches …`, all naming `service/calendar-marker.service.ts` — with `- Expected - 1`, `+ Received + 6`; `0 pass`, `1 fail`; `wbs-core:typecheck` exit 0                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | slice 2 red, on the tree slice 1 leaves, with all four rows and the nine importers unchanged               | none; the three rows are new. Also an initial red on unchanged code: `AuthenticatedUser` and `InternalIdentity` are still declared in `service/auth.service.ts` and `http/endpoint.ts`                                                                                                            | **twenty-two** rows, `+ Received + 24`; `0 pass`, `1 fail`; `wbs-core:typecheck` exit 0. They come from **six** checked consumers — the four production use cases, `use-cases/admission.test.ts` and `service/retention-timer.ts`, which is what the `routes` predicates select — contributing eight import-specifier rows and fourteen identifier rows. `compose.ts` and the two HTTP route tests are among the nine files the slice edits but contribute no row. Three of the rows: `use-cases/save-plan.ts: username reaches service/auth.service.ts`, `use-cases/run-command-batch.ts: scopes reaches service/auth.service.ts`, `service/retention-timer.ts: InternalIdentity reaches http/endpoint.ts` |
| 3   | `service/plan-document.ts`, after slice 1                                                                  | the file restored to its pre-move content (the `CalendarMarkerListOutcome` import and the inline `markers` shape)                                                                                                                                                                                 | `+ "service/plan-document.ts: './calendar-marker.service' reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | `service/plan-document.ts`                                                                                 | `import type * as markerService from './calendar-marker.service';` with the `markers` field spelled `markerService.CalendarMarkerListOutcome` (section 9.15)                                                                                                                                      | three rows: the specifier row, `+ "service/plan-document.ts: CalendarMarkerListOutcome reaches service/calendar-marker.service.ts",` and `+ "service/plan-document.ts: markerService reaches service/calendar-marker.service.ts",`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | `service/plan-document.ts`                                                                                 | a **value** namespace of the marker service read by element access, `markerService['CalendarMarkerService']` (section 9.15)                                                                                                                                                                       | three rows: the specifier row, the `markerService reaches …` row, and `+ "service/plan-document.ts: markerService['CalendarMarkerService'] reaches service/calendar-marker.service.ts",`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | `service/plan-document.ts`                                                                                 | `typeof import('./calendar-marker.service')['CalendarMarkerService']` behind an exported alias (section 9.15)                                                                                                                                                                                     | two rows: the specifier row and `+ "service/plan-document.ts: typeof import('./calendar-marker.service')['CalendarMarkerService'] reaches service/calendar-marker.service.ts",`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | `service/plan-document.ts`                                                                                 | `import './calendar-marker.service';` — a bare side-effect import that binds no name                                                                                                                                                                                                              | `+ "service/plan-document.ts: './calendar-marker.service' reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | `service/plan-document.ts`                                                                                 | `import type { CalendarMarkerOutcome } from '../index';` behind `export type PlanDocumentMarkerWrite = CalendarMarkerOutcome;` — the **barrel** route to a name only the owner declares (section 9.15)                                                                                            | `+ "service/plan-document.ts: CalendarMarkerOutcome reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`. This is the identifier vantage alone: the specifier is `'../index'`, which no row names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8b  | the same, written as `markers: { list(…): Promise<{ ok: true; value: [] }                                  | CalendarMarkerOutcome> }`                                                                                                                                                                                                                                                                         | the first attempt at fault 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | same row, but `wbs-core:typecheck` exited **1** — the mutation was type-invalid, so it proved nothing. Recorded because it is the mistake to avoid: fault 8 must be the section 9.15 form |
| 9   | `use-cases/replay.ts` and `service/replay-orchestrator.ts`                                                 | `export type { AuthenticatedUser } from './auth.service';` appended to the orchestrator, and `replay.ts` importing the name from `'../service/replay-orchestrator'`                                                                                                                               | **`1 pass`, `0 fail` — not prevented.** `wbs-core:typecheck` exited 0. Recorded as the residual below, not as a rule failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 10  | `service/plan-document.ts`                                                                                 | a value namespace of `'../index'`, which forwards the owner, read by element access: `core['CalendarMarkerService']` (section 9.15)                                                                                                                                                               | `+ "service/plan-document.ts: core['CalendarMarkerService'] reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`. Reported **nothing** before the member vantage existed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11  | `service/plan-document.ts`                                                                                 | the same namespace read by property access: `core.CalendarMarkerService` (section 9.15)                                                                                                                                                                                                           | two rows: `+ "service/plan-document.ts: CalendarMarkerService reaches service/calendar-marker.service.ts",` and `+ "service/plan-document.ts: core.CalendarMarkerService reaches service/calendar-marker.service.ts",`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 12  | `service/plan-document.ts`                                                                                 | the same namespace destructured: `const { CalendarMarkerService } = core;` (section 9.15)                                                                                                                                                                                                         | `+ "service/plan-document.ts: CalendarMarkerService reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`. Reported nothing before the binding-pattern vantage existed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 13  | `service/plan-document.ts`                                                                                 | the same, renamed: `const { CalendarMarkerService: markerClass } = core;` (section 9.15)                                                                                                                                                                                                          | two rows: that row and `+ "service/plan-document.ts: CalendarMarkerService: markerClass reaches service/calendar-marker.service.ts",`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 14  | `ports/sideways-type-boundaries.test.ts`                                                                   | one row's `reaches` changed to `'service/absent.service.ts'`                                                                                                                                                                                                                                      | `error: the program holds no service/absent.service.ts`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | `ports/sideways-type-boundaries.test.ts`                                                                   | ``const configPath = `${coreRoot}tsconfig.absent.json`;``                                                                                                                                                                                                                                         | `error: Cannot read file '…/libs/wbs/application/core/tsconfig.absent.json'.`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 16  | `libs/wbs/application/core/tsconfig.lib.json`                                                              | `"module": "invalid"` added after `"declaration": true`                                                                                                                                                                                                                                           | `error: refused tsconfig.lib.json: 6046`; `0 pass`, `1 fail`. `wbs-core:typecheck` fails here too, by construction, which is the recorded fact rather than a claim otherwise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 16b | that same malformed option **and** the statement beginning `if (parsed.errors.length > 0) {` deleted whole | both together                                                                                                                                                                                                                                                                                     | exit **0**, `1 pass`, `0 fail` — the false green that guard prevents. Restore both edits together                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 17  | `ports/sideways-type-boundaries.test.ts`                                                                   | `.concat('ports/missing.ts')` appended to what `scannedSources` returns                                                                                                                                                                                                                           | `error: the program holds no ports/missing.ts`; `0 pass`, `1 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 18  | `service/plan-document.ts` and `service/replay-orchestrator.ts`                                            | the orchestrator forwards one name (`export { CalendarMarkerService } from './calendar-marker.service';`) and the document reads it by a `const`-typed key: `const key = 'CalendarMarkerService'; const held = markers[key];` (section 9.15)                                                      | `+ "service/plan-document.ts: markers[key] reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`. Returned `[]` on the round-1 listing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 19  | the same pair                                                                                              | a **computed** binding property: `const { ['CalendarMarkerService']: held } = markers;` (section 9.15)                                                                                                                                                                                            | `+ "service/plan-document.ts: ['CalendarMarkerService']: held reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`. Returned `[]` on the round-1 listing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 20  | the same pair                                                                                              | an indexed-access type through a type alias: `export type Held = (typeof import('./replay-orchestrator'))[MarkerKey];` (section 9.15)                                                                                                                                                             | `+ "service/plan-document.ts: (typeof import('./replay-orchestrator'))[MarkerKey] reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`. Returned `[]` on the round-1 listing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 21  | the same pair                                                                                              | a key the compiler only knows as `string`, cast back: `const key: string = 'CalendarMarkerService'; const held = markers[key as keyof typeof markers];` (section 9.15)                                                                                                                            | `+ "service/plan-document.ts: markers[key as keyof typeof markers] reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`, typecheck exit 0. **Round 2 recorded this as a residual on the false ground that there was no member type; there is — `keyof typeof markers` makes the selection a union of every member, and walking constituents catches it**                                                                                                                                                                                                                                                                                                                                       |
| 22  | the same pair                                                                                              | a finite-union selector: `export function held(key: 'CalendarMarkerService' \| 'ReplayOrchestrator') { return markers[key]; }` (section 9.15)                                                                                                                                                     | `+ "service/plan-document.ts: markers[key] reaches service/calendar-marker.service.ts",`; `0 pass`, `1 fail`, typecheck exit 0. Returned `[]` on the round-2 listing, which read only the selected type's own symbol and a union has none                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 23  | the same pair                                                                                              | the namespace's module identity cast away before anything is selected: `const opaque = markers as unknown as Record<string, unknown>; const held = opaque['CalendarMarkerService'];` (section 9.15)                                                                                               | **`1 pass`, `0 fail` — not prevented**, typecheck exit 0. The base no longer resolves to a module, so the selection vantage never opens. Recorded as the residual below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 24  | `service/replay-orchestrator.ts` and `use-cases/replay.ts`                                                 | the orchestrator forwards a **primitive-valued** export (`export { TOKEN_TTL_SECONDS } from './auth.service';`, declared at `service/auth.service.ts:8`) and the use case reads it as `export type Held = (typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS'];` (section 9.15) | `+ "use-cases/replay.ts: (typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS'] reaches service/auth.service.ts",`; `0 pass`, `1 fail`, typecheck exit 0. Returned `[]` on the round-3 listing, whose only selection route was the selected type — and `number` declares nothing                                                                                                                                                                                                                                                                                                                                                                                                            |
| 25  | the same pair                                                                                              | the same forwarded export read as a `const`-keyed element access: `const ttlKey = 'TOKEN_TTL_SECONDS'; export const ttl = orchestrator[ttlKey];` (section 9.15)                                                                                                                                   | `+ "use-cases/replay.ts: orchestrator[ttlKey] reaches service/auth.service.ts",`; `0 pass`, `1 fail`, typecheck exit 0. Also `[]` on the round-3 listing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**What the rule does not prevent**, each with where it belongs. None of these is a defect in the
moves; they are the limits of a reference rule, and naming them here is not evidence that anything
stops them.

| Not prevented                                                                                                                                     | Why the rule cannot decide it                                                                                                                                                                                                                                                                                                                                    | Whose job instead                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A base whose module identity has been cast away before the selection (`(markers as unknown as Record<string, unknown>)['CalendarMarkerService']`) | The selection vantage opens only when the base resolves to a module; after that double cast it resolves to `Record<string, unknown>`, so there is no module to attribute anything to. Observed `[]`, `1 pass`, `0 fail`, typecheck exit 0 (fault 23)                                                                                                             | The file-path rule — `@nx/enforce-module-boundaries` and the kind rules K2 to K6 — which does not care what was selected. A cast through `unknown` is also what R3's adjacent-comment rule exists to make visible in review |
| A third file re-exporting the owner's own re-export of a contracts declaration, then imported from that third file (fault 9)                      | TypeScript collapses the alias straight to the contracts declaration, so **nothing of the owner is in the resolved identity**: the specifier names the third file and the chain names `contracts/src/principal.ts`. Measured with a probe: on the moved tree, `getAliasedSymbol` on a `replay.ts` import of `AuthenticatedUser` lands directly in `principal.ts` | The file-path rule, which is `@nx/enforce-module-boundaries` and the kind rules K2 to K6, not a type-identity rule                                                                                                          |
| Value-binding indirection (`export const actor = user`) consumed as a named import                                                                | Same collapse: the binding's type keeps the contract's symbol, but the binding's own declaration is neutral                                                                                                                                                                                                                                                      | K2 to K6; packet B records the identical residual for the event port                                                                                                                                                        |
| A structural copy (`interface Actor { id: string; username: string; scopes: readonly WbsScope[] }`) or a type alias of the contract               | Structural typing makes a copy indistinguishable from the original by identity                                                                                                                                                                                                                                                                                   | K2 to K6                                                                                                                                                                                                                    |
| A duplicate or merged declaration under a contract's name                                                                                         | Declaration merging produces compile-valid duplicates forever; packet B deleted a "sole declaration" assertion for exactly this reason after five review rounds                                                                                                                                                                                                  | K2 to K6                                                                                                                                                                                                                    |
| `apps/wbs/be-01` re-taking `SolverObjectiveName` from `../repository/schema` after slice 3                                                        | The rule is a `wbs-core` test over the core program. be-01 has no type-identity boundary check at all                                                                                                                                                                                                                                                            | Task 3.6, the Optimization module, which is where the map puts that contract                                                                                                                                                |

**What packet B's landed check does and does not answer here, probed twice.** Round 1 of this packet
claimed B was unaffected; that claim tested the wrong thing and is **retracted** — section 15 records the
retraction. What was actually measured: aimed at B's own contracts, through the `'../index'` namespace at
`subscriptionFor`, both spellings failed B (`0 pass`, `1 fail`, with `'../index' hands out the contracts
from index.ts` and `core hands out the contracts from index.ts`, and for element access also
`core['subscriptionFor'] reads a contract out of index.ts`). Aimed at the **marker service** through a
narrow forwarding file, all three of round 2's forms returned `[]` from
`ports/event-port-boundaries.test.ts` (`1 pass`, `0 fail`, observed). That is not a bypass of B: the
Calendar marker service is not among B's port contracts, so its rule has nothing to say about a file
forwarding it, and nothing about B's scope should be widened for it. Policing marker-service forwarding is
this packet's rule's job, and faults 18 to 20 are where it does it.

**A barrel import is not automatically a violation, and that is deliberate.** Importing
`CalendarMarkerListOutcome` from `'../index'` after slice 1 reports **nothing** (`1 pass`, `0 fail`,
observed): the barrel exports that name from the port as well as from the service, the identity
reached is the port's, and there is no dependency on the owner's contract left to report. Fault 8
shows the same route reporting a violation for `CalendarMarkerOutcome`, which only the owner
declares, and faults 10 to 13 show the same barrel namespace reporting a violation for a member only
the owner declares. The rule is about identity, so it answers differently for the two names,
correctly.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `cmd > log 2>&1; echo "exit=$?"`; never read a status through
`tee`, never `|| true`, and never take `status=$?` after an `if`. From the repository root a test path
starts with `./`, because a bare path is a filter that also collects the compiled copies a typecheck
leaves under `dist/out-tsc`; whole-project counts use
`(cd libs/wbs/application/core && bun test src)`. Record every baseline **after** the slice has run
its own type check at least once, so `dist/out-tsc` exists either way. Scratch only under `"$TMPDIR"`,
patches and failing output under `"$TMPDIR/evidence"`, and evidence references in `verify.md` are
basenames relative to that directory. The executor cannot change Git state: restore a mutated file
with `cp` from a copy under `"$TMPDIR"` and prove it with `cmp`; the planner commits. Every slice
records `base=$(git rev-parse HEAD)` in its step 0, for section 10.

### Slice 1 — Plan document reads markers through a port

**Step 0.** Every line must print what it says; if one does not, stop.

```sh
base=$(git rev-parse HEAD)
document=libs/wbs/application/core/src/service/plan-document.ts
service=libs/wbs/application/core/src/service/calendar-marker.service.ts
for each in "$document" "$service"; do
  test -f "$each" || { echo "no such file: $each" >&2; exit 65; }
done
grep -c "from './calendar-marker.service'" "$document"
grep -c "^export type CalendarMarkerListOutcome" "$service"
test ! -f libs/wbs/application/core/src/ports/calendar-marker-read.ts && echo "gate: nothing to overwrite"
test ! -f libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts && echo "gate: no rule yet"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

Expect **1**, **1**, both gate lines, then exit 0. Then record this slice's own whole-core baseline:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-1-core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/slice-1-core-baseline.log"
```

Call that pass count `C` and that file count `F`. Observed: `542 pass`, `0 fail`, 54 files. Every later
run in this slice writes `slice-1-core-closing.log` instead, because **a baseline is never overwritten**:
slice 5 reads both, and a closing run redirected over its own baseline would leave nothing to compare.
**This slice must end at `C + 1` over `F + 1`**, never at an absolute number: it adds one test file holding
one assertion.

1. Create `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` from section 9.5 —
   the whole of section 9.11's file **with only the marker row in `routes` and with none of its five
   `Proof:` comments**, which slice 4 writes. Run
   `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`. Expect section
   6 fault 1: exit 1, **four** violation rows, `- Expected - 1`, `+ Received + 6`, `0 pass`, `1 fail`.
   Four and not one, because nothing has moved yet: the specifier row is joined by
   `CalendarMarkerListOutcome`, `ok` and `value`, whose declarations are still in the service file. This is
   an initial red on unchanged code, not one of slice 4's restorations. A run reporting `0 tests ran`, a
   green run, or a red with a different row count is a stop — say how many rows you saw. This red is
   evidence, not a commit: the commit hook lints test files under `strictTypeChecked`, so the rule and the
   move that makes it pass land in one slice.
2. Create `libs/wbs/application/core/src/ports/calendar-marker-read.ts` from section 9.1. Lines 3 to
   35 of it are the JSDoc of `CalendarMarkerRefusal` and `CalendarMarkerSubject` moved from the
   service **with the four phrases section 9.1 enumerates repointed**, and nothing else changed:
   knowledge follows its symbol (R3), so the prose is neither shortened nor reworded beyond those four.
3. Apply section 9.2 to `service/calendar-marker.service.ts` and section 9.3 to
   `service/plan-document.ts`.
4. Apply section 9.4 to `index.ts`.
5. `GSETTINGS_BACKEND=memory bunx prettier --check` the five paths → exit 0 and
   `All matched files use Prettier code style!` (observed).
6. `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache` → exit 0
   (observed). This slice moves exported declarations, so the type check runs here.
7. `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass`, `0 fail` (observed).
8. `(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-1-core-closing.log" 2>&1`
   → exit 0 with `C + 1` passes over `F + 1` files (observed `543 pass`, `0 fail`, 55 files).
9. `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-mcp-01 --skip-nx-cache`
   → exit 0 (observed), and `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache` →
   exit 0 (observed). The browser bundle is what proves the new port is framework-free.
10. Append to `verify.md`: `C`, `F`, the closing counts, the red's literal row and the evidence
    basenames. Then
    `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
    and `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0. The append comes first, then
    its format, then the check; every later slice does the same.

Planner commit: `refactor(core): read calendar markers through a neutral port`.

### Slice 2 — The principals become contracts

**Step 0.**

```sh
base=$(git rev-parse HEAD)
port=libs/wbs/application/core/src/ports/calendar-marker-read.ts
check=libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
for each in "$port" "$check"; do
  test -f "$each" || { echo "no such file: $each" >&2; exit 65; }
done
grep -c "^export interface CalendarMarkerReader" "$port"
grep -c "reaches: 'service/calendar-marker.service.ts'" "$check"
test ! -f libs/wbs/domain/contracts/src/principal.ts && echo "gate: nothing to overwrite"
NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache
```

Expect **1**, **1**, the gate line, then exit 0 (all four behaved as written after slice 1 on the
rehearsed tree). Record this slice's own `C` and `F` the way slice 1 does, into
`"$TMPDIR/evidence/slice-2-core-baseline.log"`, and write every later run of that command in this slice
to `slice-2-core-closing.log`. Observed `543` over 55. **This slice must end at `C` and `F`
unchanged**: it adds no test file.

1. Add the three rows of section 9.6 to `routes` in
   `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`, above the marker row, and
   run `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`. Expect
   section 6 fault 2: exit 1, **twenty-two** violation rows, `+ Received + 24`, `0 pass`, `1 fail`. Again
   nothing has moved yet, so the **six checked consumers** contribute eight import-specifier rows plus
   fourteen identifier rows, naming `AuthenticatedUser`, `InternalIdentity`, `id`, `scopes` and
   `username`. Six, not nine: the `routes` predicates scan `use-cases/` and `service/retention-timer.ts`,
   so the four production use cases, `use-cases/admission.test.ts` and the timer are what the rule sees.
   Nine is the number of importers this slice **edits** — `compose.ts` and the two HTTP route tests are
   edited but contribute no row. A different row count is a stop; say how many you saw.
2. Create `libs/wbs/domain/contracts/src/principal.ts` from section 9.7 and apply section 9.8 to
   `libs/wbs/domain/contracts/src/index.ts`.
3. Apply section 9.9 to `service/auth.service.ts` and `http/endpoint.ts`.
4. Apply the nine one-line edits of section 9.10. Four of them move an import from a relative path to
   `@wbs/contracts`, which changes the sorted group it belongs to; section 9.10 gives each file's
   **post-sort** head, and `bunx eslint --fix <paths>` is the right answer to an
   `import/order`-family error here rather than a stop (preamble rule 17). Observed: four files
   needed `--fix`, each reporting `Run autofix to sort these imports!  simple-import-sort/imports`
   before it.
5. `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass`, `0 fail` (observed).
6. `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache` → exit 0, and
   `NX_DAEMON=false bunx nx run-many -t typecheck,lint,test -p wbs-contracts --skip-nx-cache` →
   exit 0 (both observed). The contracts project gains a file, so its own three targets run here.
7. `(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-2-core-closing.log" 2>&1`
   → exit 0, `C` over `F`, unchanged (observed `543` over 55).
8. `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-gw-01,wbs-mcp-01,wbs-fe-01 --skip-nx-cache`
   → exit 0 (observed). `apps/wbs/be-01` keeps importing both names from its own shims, which is why
   this must be checked and not assumed.
9. `NX_DAEMON=false bunx nx run wbs-core:build:portable --skip-nx-cache` → exit 0 (observed).
10. Append to `verify.md` and format, as slice 1 step 10.

Planner commit: `refactor(core): take principals from the contracts library`.

### Slice 3 — The optimizer's two type paths

**Step 0.**

```sh
base=$(git rev-parse HEAD)
coordinator=apps/wbs/be-01/src/service/optimization-coordinator.ts
reader=apps/wbs/be-01/src/service/optimized-plan-read.test.ts
for each in "$coordinator" "$reader"; do
  test -f "$each" || { echo "no such file: $each" >&2; exit 65; }
done
grep -c "from '../repository/schema'" "$coordinator" "$reader"
grep -c "from './broadcast'" "$coordinator"
NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache
```

Expect `…coordinator:1`, `…reader:1`, then **1**, then exit 0. Record this slice's own baseline over
a **focused, sandbox-safe subset**, after that type check has run. The whole backend suite is the
planner's and must not be run here: `(cd apps/wbs/be-01 && bun test src)` collects
`apps/wbs/be-01/src/app.routes.test.ts:548`, which calls `Bun.serve`, and `boot.db.test.ts`, which
listens, and this slice is dispatched with no `--network`.

**The six selected files are not every eligible test.** They are the closest readers of the two changed
files; none of the six names `Bun.spawn` or `spawnSync`, and none listens. Four further be-01 tests also
reach the coordinator and are **deliberately left to the planner's whole-target run**:
`services.db.test.ts`, `controller/project.controller.test.ts`, `service/optimization-restart.db.test.ts`
and `service/optimization-cancel.two-coordinator.db.test.ts`. Separately,
`service/optimization-spawn-handshake.proc.db.test.ts` also reaches the coordinator and spawns a child,
which is why it is excluded rather than merely deferred. Broader coverage is section 8's claim, not this
slice's.

```sh
suite=(
  ./apps/wbs/be-01/src/service/optimized-plan-read.test.ts
  ./apps/wbs/be-01/src/service/optimized-plan-read-annotations.test.ts
  ./apps/wbs/be-01/src/service/deadline-plan-read.test.ts
  ./apps/wbs/be-01/src/service/solver-supervisor-spawner.test.ts
  ./apps/wbs/be-01/src/service/optimization-events.db.test.ts
  ./apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts
)
for each in "${suite[@]}"; do
  test -f "$each" || { echo "no such test: $each" >&2; exit 65; }
done
bun test "${suite[@]}" > "$TMPDIR/evidence/slice-3-be-subset-baseline.log" 2>&1
echo "exit=$?"
tail -5 "$TMPDIR/evidence/slice-3-be-subset-baseline.log"
```

Call that pass count `B` and that file count `G`. Observed: exit 0, `60 pass`, `0 fail`, 6 files, 3.1
seconds. **This slice must end at `B` and `G` unchanged**: it changes three import lines and no
behaviour. The whole backend suite's value is section 8's, and the one pre-existing skip lives there,
not here.

1. Apply section 9.12 to both files. `SolverObjectiveName` joins the existing `@wbs/domain` import of
   `optimized-plan-read.test.ts` rather than becoming a second import line from the same specifier —
   `bunx eslint --fix` accepts two lines, and the single line is what section 9.12 prescribes.
2. `GSETTINGS_BACKEND=memory bunx prettier --check` both paths → exit 0.
3. `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-be-01 --skip-nx-cache` → exit 0
   (observed).
4. The step-0 `bun test "${suite[@]}"` command again, **redirected to
   `"$TMPDIR/evidence/slice-3-be-subset-closing.log"`** so the baseline survives → exit 0 at `B` over `G`
   files (observed `60 pass`, `0 fail`, 6 files). Do not run the whole backend suite: it is section 8's,
   for the reason step 0 gives.
5. `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → exit 0,
   `1 pass` (observed). The rule scans the core only, so this slice cannot move it; running it proves
   that rather than assuming it.
6. **Say in `verify.md` what this slice does not prove.** Nothing prevents either import path coming
   back: be-01 has no type-identity boundary check, and the Optimization module of task 3.6 owns that
   rule. The evidence this slice leaves is the two grep counts of step 0 falling to 0 and the
   observed type check, not a rule.
7. Append to `verify.md` and format, as slice 1 step 10.

Planner commit: `refactor(be-01): take the optimizer's types from domain and core`.

### Slice 4 — Watch the rule and its guards fail

**Step 0.** The count is read by Bun, its failure ends the block, and the number is asserted: a `grep`
status of 1 means either "no match" or "could not read the input", and a bare assignment swallows
both.

```sh
base=$(git rev-parse HEAD)
check=libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
test -f "$check" || { echo "no such file: $check" >&2; exit 65; }
count=$(bun -e 'const lines = (await Bun.file(Bun.argv[1]).text()).split("\n"); console.log(lines.filter((line) => /^\s*\/\/ Proof:/.test(line)).length);' "$check") || exit "$?"
echo "proof-comments=$count"
test "$count" -eq 0
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts
```

Expect `proof-comments=0` and exit 0, then exit 0, then `1 pass`, `0 fail` (observed: slices 1 and 2
ship the rule with no `Proof:` comment, because a comment may not describe a fault nobody has watched
yet). Record this slice's `C` and `F` the way slice 2 does — observed `543` over 55 — and require them
unchanged at the end.

Inject section 6's faults 3 to 25 **one at a time**, each saved as a patch under
`"$TMPDIR/evidence"` with the README's `if diff …; then …; else test $? -eq 1; fi` form, each restored
with `cp` and proved with `cmp` before the next and before asserting on any captured status. Section
9.15 gives every listing a fault inserts.

| Fault | Exact location and edit                                                                                                                                                                                                     | Typecheck must exit | Expected result                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 3     | `service/plan-document.ts`: its one `'../ports/calendar-marker-read'` import becomes `import type { CalendarMarkerListOutcome } from './calendar-marker.service';` and the `markers` field becomes the inline shape of 9.15 | 0                   | section 6 fault 3's one row                                                                                          |
| 4     | `service/plan-document.ts`: that import becomes `import type * as markerService from './calendar-marker.service';` with 9.15's qualified field                                                                              | 0                   | section 6 fault 4's three rows                                                                                       |
| 5     | `service/plan-document.ts`: 9.15's value namespace and element access added **above** the port import, which stays                                                                                                          | 0                   | section 6 fault 5's three rows                                                                                       |
| 6     | `service/plan-document.ts`: 9.15's `typeof import(…)` indexed alias added above `export interface PlanDocumentServiceOptions {`                                                                                             | 0                   | section 6 fault 6's two rows                                                                                         |
| 7     | `service/plan-document.ts`: `import './calendar-marker.service';` added directly above the port import                                                                                                                      | 0                   | section 6 fault 7's one row                                                                                          |
| 8     | `service/plan-document.ts`: 9.15's barrel import of `CalendarMarkerOutcome` **and** the exported alias that consumes it. The inline-union form is fault 8b and fails the type check; do not use it                          | 0                   | section 6 fault 8's one row                                                                                          |
| 9     | `service/replay-orchestrator.ts` and `use-cases/replay.ts`: 9.15's laundering pair                                                                                                                                          | 0                   | **`1 pass`, `0 fail`.** Not prevented. Record it in `verify.md` as the residual of section 6, and restore both files |
| 10    | `service/plan-document.ts`: 9.15's value namespace of `'../index'` read by element access, added **above** the port import, which stays                                                                                     | 0                   | section 6 fault 10's one row                                                                                         |
| 11    | `service/plan-document.ts`: the same namespace read by property access (9.15)                                                                                                                                               | 0                   | section 6 fault 11's two rows                                                                                        |
| 12    | `service/plan-document.ts`: the same namespace destructured (9.15)                                                                                                                                                          | 0                   | section 6 fault 12's one row                                                                                         |
| 13    | `service/plan-document.ts`: the same destructuring renamed (9.15)                                                                                                                                                           | 0                   | section 6 fault 13's two rows                                                                                        |
| 14    | `ports/sideways-type-boundaries.test.ts`: the third `routes` row's `reaches` becomes `'service/absent.service.ts'` — the row whose `from` is `path === 'service/retention-timer.ts'`, not either `use-cases/` row           | not run             | `error: the program holds no service/absent.service.ts`, `0 pass`, `1 fail`                                          |
| 15    | `ports/sideways-type-boundaries.test.ts`: ``const configPath = `${coreRoot}tsconfig.absent.json`;``                                                                                                                         | not run             | `error: Cannot read file '…/tsconfig.absent.json'.`, `0 pass`, `1 fail`                                              |
| 16    | `libs/wbs/application/core/tsconfig.lib.json`: `"module": "invalid"` added after `"declaration": true`                                                                                                                      | 1, by construction  | `error: refused tsconfig.lib.json: 6046`, `0 pass`, `1 fail`                                                         |
| 16b   | that same malformed option **and** the statement beginning `if (parsed.errors.length > 0) {` deleted whole from `coreProgram`                                                                                               | 1, by construction  | exit **0**, `1 pass`, `0 fail` — the false green the guard prevents. Restore both edits together                     |
| 17    | `ports/sideways-type-boundaries.test.ts`: `.concat('ports/missing.ts')` appended to `scannedSources`' return expression                                                                                                     | not run             | `error: the program holds no ports/missing.ts`, `0 pass`, `1 fail`                                                   |
| 18    | `service/replay-orchestrator.ts`: append 9.15's one forwarding line. `service/plan-document.ts`: 9.15's `const` key and element access above the port import, which stays                                                   | 0                   | section 6 fault 18's one row                                                                                         |
| 19    | the same forwarding line, with 9.15's computed binding property in place of the element access                                                                                                                              | 0                   | section 6 fault 19's one row                                                                                         |
| 20    | the same forwarding line, with 9.15's two exported type aliases and no value import                                                                                                                                         | 0                   | section 6 fault 20's one row                                                                                         |
| 21    | the same forwarding line, with 9.15's widened `string` key cast back through `keyof typeof`                                                                                                                                 | 0                   | section 6 fault 21's one row                                                                                         |
| 22    | the same forwarding line, with 9.15's finite-union selector                                                                                                                                                                 | 0                   | section 6 fault 22's one row                                                                                         |
| 23    | the same forwarding line, with 9.15's cast-erased base                                                                                                                                                                      | 0                   | **`1 pass`, `0 fail`.** Not prevented. Record it in `verify.md` as the residual of section 6, and restore both files |
| 24    | `service/replay-orchestrator.ts`: append 9.15's **primitive** forwarding line instead. `use-cases/replay.ts`: 9.15's indexed-access type                                                                                    | 0                   | section 6 fault 24's one row                                                                                         |
| 25    | the same primitive forwarding line, with 9.15's `const`-keyed element access in `use-cases/replay.ts`                                                                                                                       | 0                   | section 6 fault 25's one row                                                                                         |

Faults 14, 15 and 17 mutate the rule's own file, which is what an architecture rule's negative fixture
is: those three throws have no other production path. **Fault 16 mutates a file outside this packet's
edit lane, and that is authorized here**: it is the only way to reach that guard, the file is restored
with `cp` from a copy under `"$TMPDIR"` and proved identical with `cmp` before anything else runs, and
this slice's handoff lists `libs/wbs/application/core/tsconfig.lib.json` as **unchanged**. Faults 3 to
13 and 18 to 25 are production files; 18 to 25 mutate **two** of them, and both are restored and
`cmp`-proved before the next fault. Faults 18 to 23 forward `CalendarMarkerService` from
`service/replay-orchestrator.ts` and read it from `service/plan-document.ts`; faults 24 and 25 forward the
primitive `TOKEN_TTL_SECONDS` from the same file and read it from `use-cases/replay.ts`.

**Twenty-four fault runs, with three different expected outcomes.** Seventeen report violation rows and
fail the assertion: 3 to 8, 10 to 13, 18 to 22, 24 and 25. Four throw from a guard and fail it: 14, 15, 16
and 17. Two **pass** and are recorded as residuals rather than chased: 9 and 23. One more passes on
purpose, 16b, which is the false green the malformed-tsconfig guard prevents. A run whose outcome differs
from its row is a stop.

Then write the **five** `Proof:` comments of section 9.11 — two beside `coreProgram`'s throws, one
beside the owner-file throw, one beside the per-file throw, and the assertion's, which names the two
initial reds, faults 3 to 13, 18 to 22, 24 and 25, and records faults 9 and 23 as not prevented. **The
comment describes only what this executor observed**: it must not claim a restoration of the principal
importers, because no fault performs one — slice 2's initial red is where those twenty-two rows come from. Five, not six: every reference vantage is
a branch of the **one** assertion, so its faults belong in that assertion's comment rather than in a
comment invented to reach a number. Every comment describes only a fault this slice injected.

Append to `verify.md` the twenty-four fault runs with the literal fragments observed and their evidence
basenames (`document-restored.patch` and `.log`, `document-namespace-type.*`,
`document-value-namespace.*`, `document-typeof-import.*`, `document-bare-import.*`,
`document-barrel-outcome.*`, `laundered-reexport.*`, `barrel-element-access.*`,
`barrel-property-access.*`, `barrel-destructuring.*`, `barrel-destructuring-renamed.*`,
`forwarded-const-key.*`, `forwarded-computed-binding.*`, `forwarded-indexed-access.*`,
`forwarded-widened-key.*`, `forwarded-union-key.*`, `forwarded-cast-base.*`,
`forwarded-primitive-indexed-type.*`, `forwarded-primitive-const-key.*`, `absent-owner-row.*`, `absent-tsconfig.*`, `malformed-tsconfig.*`,
`slice-4-malformed-tsconfig-guard-deleted.log`, `missing-scanned-path.*`, and one
`…-restored-green.log` per restore). The guard-deleted log keeps its `slice-4-` prefix because slice 5's
step 0 validates that exact name in the seed. Only after those edits:

| Command                                                                           | Expect                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` | exit 0, `1 pass`, `0 fail`                                          |
| the step-0 count block with `test "$count" -eq 5`                                 | `proof-comments=5`, exit 0 (observed on the exact final file)       |
| `NX_DAEMON=false bunx nx run-many -t typecheck,lint -p wbs-core --skip-nx-cache`  | exit 0                                                              |
| `(cd libs/wbs/application/core && bun test src)`                                  | exit 0, `C` passes over `F` files, unchanged (observed 543 over 55) |
| `GSETTINGS_BACKEND=memory bunx nx format:check --all`                             | exit 0                                                              |

Planner commit: `test(core): prove the no-sideways type rule can fail`.

### Slice 5 — The K9 values, the tasks, and the close

**Dispatch.** This is the hand-over slice: it cites the evidence of slices 1 to 4. **This is the
planner's command, not the executor's.** `PLAN_ROOT` is the launcher's own root, which is the one
absolute path this packet prints — the launcher-path precedent — and every other path is derived from
it, so no other private path is published. Every step checks its status before the next runs: a failed
copy must not reach a dispatch.

```sh
set -euo pipefail
PLAN_ROOT=/home/df/wd/puni/puni-plan
attempts=(<slice-1-id> <slice-2-id> <slice-3-id> <slice-4-id>)
seeds=()
for attempt in "${attempts[@]}"; do
  from="$PLAN_ROOT/exec/logs/$attempt/preserved/evidence"
  into="$PLAN_ROOT/exec/seeds/$attempt"
  test -d "$from" || { echo "no preserved evidence for $attempt" >&2; exit 71; }
  mkdir -p "$into"
  cp -a "$from/." "$into/" || { echo "seed copy failed for $attempt" >&2; exit 72; }
  seeds+=(--seed "$into")
done
note="seeded evidence: slice 1 = '${attempts[0]}', slice 2 = '${attempts[1]}', slice 3 = '${attempts[2]}', slice 4 = '${attempts[3]}'"
"$PLAN_ROOT/exec/run-executor.sh" 040-6-c-type-only-preparations "slice 5" <base-sha> \
  --batch batch-6 --resume --require-ancestor <reviewed-slice-4-sha> --preserve evidence \
  --slice-note "$note" "${seeds[@]}"
```

`--slice-note` is how the four ids reach the executor at all: `--seed` copies directories and adds
nothing to the prompt, while the launcher renders the note into
`The slice you execute now is: slice 5 (<note>)`. Without it, step 0's `attempts` array has nothing to
be filled from, and the slice would be left guessing — which is exactly what step 0 forbids.

`--resume` is not optional: the launcher derives the clone directory from the packet basename and
**exits 67** if it already exists without it, and slice 1 created that clone. Slices 2, 3 and 4 are
dispatched the same way, each with `--resume`, `--require-ancestor <the reviewed previous slice's sha>`
and `--preserve evidence`; only slice 1 is dispatched without `--resume`.

`--seed <dir>` copies into `$TMPDIR/$(basename <dir>)`, which is why each copy is named by its attempt
id rather than seeded as `evidence`: four `evidence` seeds would all merge into `$TMPDIR/evidence` and
the slice could not say which attempt a log came from.

**Step 0.**

The four attempt ids arrive in this slice's own instruction line, as
`slice 5 (seeded evidence: slice 1 = '…', slice 2 = '…', slice 3 = '…', slice 4 = '…')`. Put them in
`attempts` below, in that order, beside the file each one owes. Do **not** discover seeds by globbing
`"$TMPDIR"`: the launcher always creates `$TMPDIR/evidence`, so a glob can never yield only the four
seeded directories, and a directory listing proves nothing about the log inside it. If the instruction
line carries no ids, stop and say so rather than inventing them.

```sh
base=$(git rev-parse HEAD)
policy=docs/code-organization/kinds.json
tasks=openspec/changes/adopt-di-composition/tasks.md
for each in "$policy" "$tasks"; do
  test -f "$each" || { echo "no such file: $each" >&2; exit 65; }
done
attempts=(<slice-1-id> <slice-2-id> <slice-3-id> <slice-4-id>)
owed=(
  "slice-1-core-baseline.log slice-1-core-closing.log"
  "slice-2-core-baseline.log slice-2-core-closing.log"
  "slice-3-be-subset-baseline.log slice-3-be-subset-closing.log"
  "slice-4-malformed-tsconfig-guard-deleted.log"
)
mkdir -p "$TMPDIR/evidence/seeded"
for index in "${!attempts[@]}"; do
  attempt=${attempts[index]}
  mkdir -p "$TMPDIR/evidence/seeded/$attempt"
  for log in ${owed[index]}; do
    seeded="$TMPDIR/$attempt/$log"
    test -f "$seeded" || { echo "seed is not a regular file: $seeded" >&2; exit 71; }
    test -r "$seeded" || { echo "seed is not readable: $seeded" >&2; exit 71; }
    test -s "$seeded" || { echo "seed is empty: $seeded" >&2; exit 71; }
    lines=$(wc -l < "$seeded") || { echo "seed could not be read: $seeded" >&2; exit 71; }
    cp "$seeded" "$TMPDIR/evidence/seeded/$attempt/$log" || { echo "could not copy $seeded" >&2; exit 72; }
    echo "seeded: seeded/$attempt/$log $lines lines"
  done
done
bun -e 'const policy = await Bun.file(Bun.argv[1]).json(); const counts = {}; for (const entry of policy.entries) { const key = entry.capability ?? "-"; counts[key] = (counts[key] ?? 0) + 1; } console.log(policy.entries.length, JSON.stringify(counts));' "$policy" > "$TMPDIR/evidence/slice-5-kinds-before.txt"
status=$?
test "$status" -eq 0 || { echo "the policy could not be counted: exit $status" >&2; exit 65; }
cat "$TMPDIR/evidence/slice-5-kinds-before.txt"
NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache
```

**Every seeded log is copied into `"$TMPDIR/evidence/seeded/<attempt-id>/"` and cited from there.** The
launcher's `--preserve evidence` keeps the current evidence directory and the directories named to it; it
does **not** keep the sibling attempt directories `--seed` created, so a reference to
`$TMPDIR/<attempt-id>/…` would not resolve in the published record. Seven logs are validated and copied —
each slice's baseline **and** its closing run, plus slice 4's guard log — and section 9.16 cites exactly
those seven relative paths. Rehearsed: the seven-log valid set printed seven `seeded:` lines at exit 0,
and removing one closing log stopped at `seed is not a regular file: …` with exit 71. The four-log
expectation an earlier revision of this packet printed here was wrong and is gone: the loop prints once per
log, not once per attempt.

Each of the four `test`s answers a different way of being unusable, and `wc` is captured into a variable
so that its own failure ends the block instead of being swallowed inside an `echo`. Rehearsed against
four invalid inputs and one valid one: a **missing** file printed `seed is not a regular file: …` and
exited 71; an **empty** file `seed is empty: …`, 71; a **directory** at that path
`seed is not a regular file: …`, 71 — the earlier `test -s` form printed `wc: … Is a directory` and then
`seeded: 0 lines` at exit **0**, which is the false success this replaces; a `chmod 000` file
`seed is not readable: …`, 71; and the valid set **seven** `seeded:` lines at exit 0, one per log.

Expect **seven** `seeded:` lines — one per validated log, two for each of slices 1 to 3 and one for
slice 4 — then exactly

```text
95 {"-":85,"scheduler-runtime-port":1,"authentication":1,"unspecified":1,"core-lib-extraction":4,"realtime":2,"bounded-replay-sweep":1}
```

(observed literally; `"-"` is the 85 entries that carry no `capability` at all, which is what the
expression's `?? "-"` prints — there is no `"support"` capability), then exit 0. The **redirect** is what
puts that line in `slice-5-kinds-before.txt`, and `status=$?` on the next line is what makes a failure
stop: `bun … | tee file` would report success even when the read or the parse failed, because this block
does not run under `pipefail` and nothing here may depend on a shell option surviving between commands.
Rehearsed both ways against a truncated policy file: the redirect form printed
`the policy could not be counted: exit 1` and exited 65, while the `tee` form printed the parse error and
then `pipeline-exit=0`. Then collect this slice's **own** two baselines, after that type check has run:

```sh
(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-5-core-baseline.log" 2>&1
echo "exit=$?"
tail -4 "$TMPDIR/evidence/slice-5-core-baseline.log"
```

Call those `C` and `F` (observed `543 pass`, `0 fail`, 55 files); the closing run of the same command
goes to `slice-5-core-closing.log`, never over the baseline. Then run the README's OpenSpec validation
block once and **copy its report to a named file**, because the block's own `mktemp` name carries a random
suffix that no record can cite:

```sh
cp "$report" "$TMPDIR/evidence/slice-5-openspec-before.json"
jq '.summary.totals' "$TMPDIR/evidence/slice-5-openspec-before.json"
```

Call that `N` (observed `{"items": 114, "passed": 114, "failed": 0}`). `C`, `F` and `N` are this
attempt's numbers; the closing checks require them **unchanged**, never a number copied from this packet.

1. Apply section 9.13 to `docs/code-organization/kinds.json`. **Address each entry by its `path`
   value, not by line number and not by "the first occurrence"**: the four `"core-lib-extraction"`
   lines are byte-identical and two of them are six lines apart (525 and 531).
2. Re-run step 0's Bun count with its output redirected to
   `"$TMPDIR/evidence/slice-5-kinds-after.txt"`, the same `status=$?` check after it, and `cat` to show it.
   Expect exactly
   `95 {"-":85,"scheduler-runtime-port":1,"authentication":1,"plan-import":1,"wbs-domain":4,"realtime":2,"bounded-replay-sweep":1}`
   (observed literally): `K` stays **95**, four entries carry `wbs-domain`, one carries `plan-import`,
   and `core-lib-extraction` and `unspecified` are gone.
3. Apply section 9.14 to `openspec/changes/adopt-di-composition/tasks.md`: tick 1.3, 1.4 and 1.8 with
   their notes, and add the note under 1.6 **without ticking it**. Packet B's note under 1.2 is not
   touched.
4. `GSETTINGS_BACKEND=memory bunx prettier --check` both paths → exit 0.
5. Run the README's OpenSpec validation block again, then
   `cp "$report" "$TMPDIR/evidence/slice-5-openspec-after.json"`. Expect exit 0 and `summary.totals` equal
   to `N`, the value step 0 recorded — this packet opens no change, so the number must not move. Do not
   compare against a number written in this packet. The four named files this slice must leave behind are
   `slice-5-kinds-before.txt`, `slice-5-kinds-after.txt`, `slice-5-openspec-before.json` and
   `slice-5-openspec-after.json`; section 9.16 cites all four, so a missing one is a stop.
6. Append section 9.16 to `verify.md`, **filling every `<…>` from this attempt's own logs and its
   seeded ones**. It is a template, not a record to copy: a claim whose log this attempt does not hold
   is written as `pending planner verification`, and section 8's whole-target rows are exactly that
   here. Then format and `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
7. `(cd libs/wbs/application/core && bun test src) > "$TMPDIR/evidence/slice-5-core-closing.log" 2>&1`
   → exit 0 at the `C` and `F` this slice recorded, and
   `bun test ./libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts` → `1 pass`.

Planner commit:
`chore(core): correct the K9 capability values and close the type-only preparations`.

## 8. Planner-only checks

| Check                                                           | Why it is the planner's                                                                                                                                                                                                                  | Value observed on the rehearsed tree                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NX_DAEMON=false bunx nx run wbs-be-01:test`                    | Whole target: opens SQLite databases and includes `app.routes.test.ts:548`'s `Bun.serve` listener and `boot.db.test.ts`'s. **Slice 3 must not run it**; its enumerated six-file suite is the executor's half, and this is the other half | `(cd apps/wbs/be-01 && bun test src)` at exit 0, `1091 pass`, `1 skip`, `0 fail`, 92 files                               |
| `NX_DAEMON=false bunx nx run wbs-gw-01:test`                    | Binds loopback ports in its integration tests                                                                                                                                                                                            | exit 0, 128 tests over 17 files                                                                                          |
| `NX_DAEMON=false bunx nx run wbs-mcp-01:test`                   | Same reason                                                                                                                                                                                                                              | exit 0, 165 tests over 15 files                                                                                          |
| `NX_DAEMON=false bunx nx run wbs-core:test`                     | Planner verification of the whole target with coverage                                                                                                                                                                                   | exit 0, 543 tests over 55 files                                                                                          |
| `NX_DAEMON=false bunx nx run wbs-core:test:portable`            | Runs Playwright; the executor has no browser. `build:portable` is the executor's and proves the new port bundles                                                                                                                         | exit 0                                                                                                                   |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` | Its index checker refuses untracked files, so it needs the slice staged or committed, and it spawns processes                                                                                                                            | 366 tests over 25 files, unchanged — the two new core files and the new contracts file move no inventory count or digest |
| `bin/h2puni-gate.sh <sha>`                                      | Takes the host-wide heavy lock                                                                                                                                                                                                           | pending planner verification                                                                                             |

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once. Do not edit that test, and do not edit any test this packet does not name.

No slice adds a file under `apps/wiki/cli`, so the Twilight Burokrat validator identity does not
move. No slice adds a project, a target or a `docs/wiki-policy` row, so `pilot-policy.test.ts`'s pins
do not move; its run still belongs after the planner's commits because it reads the repository at
`HEAD`. No slice adds a file to a module directory, so no `module-index` README entry is owed — the
two new core files are under `ports/`, which has no index README, and the new contracts file is under
`libs/wbs/domain/contracts/src`, which has none either.

## 9. Exact content

### 9.1 `libs/wbs/application/core/src/ports/calendar-marker-read.ts`

The two moved JSDoc blocks are the service's own prose with **four** phrases repointed, because the
prose now sits beside the contract rather than inside the service and "this service" would name
nothing: "Only the service knows which check failed" becomes "Only the Calendar marker service knows
which check failed"; "`gate` reads the project" becomes "its gate reads the project"; "so only the
service can say" becomes "so only it can say"; and "A create that let this service mint one" becomes "A
create that let the service mint one". Nothing else of the two blocks is altered, and nothing is
shortened — R3 keeps the knowledge with the symbol that moved.

```ts
import type { CalendarMarker } from './calendar-marker-store';

/**
 * Why a marker could not be listed, stored or changed. All four are states.
 *
 * `not_found` covers **both** "no such project" and "no such marker of this
 * project", and it stays one reason on the wire: a caller who could tell the
 * two apart by the reason would learn that a marker it may not see exists
 * (spec.md, "a marker of another project answers `not_found` rather than
 * `forbidden`"). Which of the two it was is carried beside the reason instead,
 * as {@link CalendarMarkerSubject}.
 */
export type CalendarMarkerRefusal = 'not_found' | 'forbidden' | 'taken';

/**
 * What a refusal is **about** — the project the request addressed, or the
 * marker inside it.
 *
 * This is not a second reason and never reaches a client as one. It exists so a
 * route can answer the spec's `field` honestly: the refusal table blames
 * `markerId` for a marker that is absent or another project's, and the routes
 * used to blame it for an **absent project** too, naming a value that had
 * nothing to do with the refusal (TASK-279 AC #7). Only the Calendar marker
 * service knows which check failed — its gate reads the project, the store
 * reads the marker inside its own transaction — so only it can say.
 *
 * It leaks nothing the reason did not already: an existing project the caller
 * may not write answers `forbidden` and an absent one answers `not_found`, so
 * project existence is already distinguishable from outside. Marker existence
 * is not, and stays that way — `about` never reaches the wire, and the routes
 * turn it into a `field` only for a request that named a marker id itself. A
 * create that let the service mint one can still be refused `about: 'marker'`
 * (the minted id collided), and the route blames nothing for it, because the
 * two questions are separate and both are asked.
 */
export type CalendarMarkerSubject = 'project' | 'marker';

export interface CalendarMarkerRefused {
  ok: false;
  reason: CalendarMarkerRefusal;
  about: CalendarMarkerSubject;
}

export type CalendarMarkerListOutcome =
  { ok: true; value: CalendarMarker[] } | CalendarMarkerRefused;

/**
 * A project's markers, read by something that does not own them.
 *
 * Plan document needs the list and nothing else. Naming that here rather than
 * accepting `CalendarMarkerService` is what keeps one resource out of another
 * resource's file: the import matrix of
 * `docs/superpowers/specs/2026-09-19-code-organization-design.md` forbids the
 * resource-to-resource edge (K6), and `CalendarMarkerService` satisfies this
 * contract without either file knowing about the other.
 *
 * The refusal shape lives here rather than with the store port because it is
 * the service's answer, not the table's: {@link CalendarMarkerStore} refuses
 * with `not_found` or `taken` only and has no notion of `forbidden`.
 */
export interface CalendarMarkerReader {
  list(projectId: string): Promise<CalendarMarkerListOutcome>;
}
```

### 9.2 `libs/wbs/application/core/src/service/calendar-marker.service.ts`

Add this import group directly above the `'../ports/calendar-marker-store'` import (line 3):

```ts
import type {
  CalendarMarkerListOutcome,
  CalendarMarkerRefused,
} from '../ports/calendar-marker-read';
```

Then replace everything from the JSDoc that opens `Why a marker could not be listed` (line 21, the
comment above `CalendarMarkerRefusal`) up to and including the two lines declaring
`CalendarMarkerListOutcome` (lines 64 to 65), leaving the `/** What a create carries …` comment and
everything after it untouched, with exactly this:

```ts
/**
 * What one marker write decided.
 *
 * The refusal half lives in {@link CalendarMarkerRefused}, beside the read
 * contract Plan document consumes, so that reading a project's markers costs no
 * dependency on this service. The names stay exported here.
 */
export type CalendarMarkerOutcome = { ok: true; value: CalendarMarker } | CalendarMarkerRefused;

export type {
  CalendarMarkerListOutcome,
  CalendarMarkerRefusal,
  CalendarMarkerRefused,
  CalendarMarkerSubject,
} from '../ports/calendar-marker-read';
```

`CalendarMarkerOutcome` keeps its declaration here: only this service's four writes answer with it,
and moving it would widen the port past what Plan document reads.

### 9.3 `libs/wbs/application/core/src/service/plan-document.ts`

Delete line 14, `import type { CalendarMarkerListOutcome } from './calendar-marker.service';`, and
add this directly above the `'../ports/clock'` import:

```ts
import type { CalendarMarkerReader } from '../ports/calendar-marker-read';
```

Then replace the three lines of the `markers` field inside `PlanDocumentServiceOptions` with one:

```ts
markers: CalendarMarkerReader;
```

### 9.4 `libs/wbs/application/core/src/index.ts`

Insert two lines directly above `export * from './ports/calendar-marker-store';` (line 22):

```ts
// The owner-neutral marker read: `CalendarMarkerReader` and the list outcome it answers with.
export * from './ports/calendar-marker-read';
```

The barrel now exports the four moved names from two places, which is one symbol reached by two
`export *` lines and not a duplicate declaration. Section 6's last paragraph records what the rule
says about that.

### 9.5 Slice 1's `routes` table

Create section 9.11's file with `routes` holding **only** this row, and with none of the five
`Proof:` comments:

```ts
const routes = [
  {
    reaches: 'service/calendar-marker.service.ts',
    from: (path: string) => path === 'service/plan-document.ts',
  },
] as const;
```

### 9.6 Slice 2's three rows

Insert these three rows above the marker row, giving the final table of section 9.11:

```ts
  { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
  { reaches: 'http/endpoint.ts', from: (path: string) => path.startsWith('use-cases/') },
  { reaches: 'http/endpoint.ts', from: (path: string) => path === 'service/retention-timer.ts' },
```

`service/retention-timer.ts` gets its own row rather than joining a widened predicate: it is a
resource-side timer, not a use case, and one predicate covering both would stop saying which rule it
is keeping.

### 9.7 `libs/wbs/domain/contracts/src/principal.ts`

```ts
import type { WbsScope } from './oidc-identity';

/**
 * Who a request is, once a session token has been read and believed.
 *
 * It lives in the contracts library rather than beside the authentication
 * service because four use cases — the command batch, the replay, the save and
 * the retention sweep — admit on it without being about authentication. A type
 * exported from the service makes each of them import a sibling feature, which
 * rule K6 of `docs/superpowers/specs/2026-09-19-code-organization-design.md`
 * forbids; every relevant backend kind may import Contracts.
 *
 * `scopes` is what the token carried, not what the account may ever hold: an
 * older token keeps the scopes it was minted with until it expires.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  scopes: readonly WbsScope[];
}

/**
 * The gateway or another trusted process, admitted by the internal adapter.
 *
 * It carries no id on purpose. An internal caller acts for the deployment, not
 * for a person, and a field to put a person in would be one somebody fills.
 */
export interface InternalIdentity {
  kind: 'internal';
}
```

### 9.8 `libs/wbs/domain/contracts/src/index.ts`

Insert one line directly below `export * from './oidc-identity';` (line 31), keeping the file's
alphabetical order:

```ts
export * from './principal';
```

### 9.9 The two compatibility re-exports

`libs/wbs/application/core/src/service/auth.service.ts`: line 1 becomes

```ts
import type { AuthenticatedUser, OidcIdentity } from '@wbs/contracts';
```

and the five lines declaring `AuthenticatedUser` (lines 56 to 60) become

```ts
export type { AuthenticatedUser } from '@wbs/contracts';
```

`WbsScope` leaves the import because nothing else in the file uses it.

`libs/wbs/application/core/src/http/endpoint.ts`: add `AuthenticatedUser` and `InternalIdentity` to
the sorted `@wbs/contracts` type import (after `type {` and after `ImportRefusalResponse,`
respectively), delete line 18 and the blank line below it, and replace the three lines declaring
`InternalIdentity` (lines 30 to 32) with

```ts
export type { AuthenticatedUser, InternalIdentity } from '@wbs/contracts';
```

`export type Identity = AuthenticatedUser | InternalIdentity;` and every `PrincipalFor` and
`PrincipalInput` line, including their two `Proof:` comments, stay exactly as they are: the
declarations moved, the type machinery did not.

### 9.10 Slice 2's nine one-line edits

Six production files and three test files. The four marked **sort** move an import across a sorted
group boundary; their post-sort head is given.

| File                                        | Edit                                                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-cases/run-command-batch.ts`            | line 1 becomes `import type { AuthenticatedUser } from '@wbs/contracts';` followed by a blank line, then the two `'../service/…'` imports                                                            |
| `use-cases/replay.ts`                       | lines 1 to 2 become one line, `import type { AuthenticatedUser, InternalIdentity } from '@wbs/contracts';`, then a blank line, then the orchestrator import                                          |
| `use-cases/retention-sweep.ts`              | lines 1 to 2 become one line, `import type { AuthenticatedUser, InternalIdentity } from '@wbs/contracts';`, then a blank line, then the retention-job import                                         |
| `use-cases/save-plan.ts`                    | delete line 4 and add `import type { AuthenticatedUser } from '@wbs/contracts';` **above** line 1's `import { canEditProject } from '@wbs/domain';`                                                  |
| `service/retention-timer.ts` (**sort**)     | its `'../http/endpoint'` import becomes `import type { InternalIdentity } from '@wbs/contracts';` and moves to line 1, above a blank line and the four `'../ports/…'` and `'../use-cases/…'` imports |
| `compose.ts`                                | line 1 becomes `import type { AuthenticatedUser, Logger } from '@wbs/contracts';`, and the `AuthService` import becomes `import { AuthService } from './service/auth.service';`                      |
| `use-cases/admission.test.ts` (**sort**)    | its `'../service/auth.service'` import becomes `import type { AuthenticatedUser } from '@wbs/contracts';` and moves to line 1, above the two `@wbs/store-memory` imports                             |
| `http/project.routes.test.ts` (**sort**)    | the same move to line 1, above the `@wbs/store-memory/testing/service-fixtures` import                                                                                                               |
| `http/saved-plan.routes.test.ts` (**sort**) | the same move to line 1, above the `@wbs/store-memory/project-fixture` import                                                                                                                        |

`apps/wbs/be-01/src/{boot,services,middleware/authenticated}.ts` and its two tests keep importing
`AuthenticatedUser` from `./service/auth.service`, which is the shim of the file that now re-exports
it. That is delivery importing a feature, which the matrix allows, and it is what the compatibility
re-export is for. Do not change them.

### 9.11 `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`

The final file, with the four-row table of 9.6 and the **five** `Proof:` comments slice 4 writes.
Slice 1 creates it with 9.5's table and no `Proof:` comment; slice 2 widens the table; slice 4 adds the
comments and nothing else. `resolvedDeclarations` and `patternBaseType` are the selection vantage the
first two reviews made necessary; they are present from slice 1, because slice 1's own red is produced
with them in place. `resolvedDeclarations` walks **union and intersection constituents** because round 3
got past a version that read only the selected type's own symbol, and a union has none;
`selectedNames` plus `memberDeclarations` resolve the base module's **export symbol** because round 4 got
past the type route alone, and a forwarded primitive export selects to `number`, which declares nothing.
`selectedNames` reads the key's **type**, not its syntax, which is why one branch covers a literal, a
`const` binding, a computed property name and a union of literals.

```ts
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

const coreRoot = fileURLToPath(new URL('../..', import.meta.url));
const coreSource = `${coreRoot}src/`;
const configPath = `${coreRoot}tsconfig.lib.json`;

/**
 * One owner a group of files may not reach, and where its contracts live now.
 *
 * Each row is a preparation of
 * `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`: the
 * first three are preparations 4 and 5 (no use case and no retention timer
 * imports Authentication or the HTTP endpoint for a principal), the fourth is
 * preparation 3 (Plan document reads markers through a port, not through the
 * Calendar marker resource).
 */
const routes = [
  { reaches: 'service/auth.service.ts', from: (path: string) => path.startsWith('use-cases/') },
  { reaches: 'http/endpoint.ts', from: (path: string) => path.startsWith('use-cases/') },
  { reaches: 'http/endpoint.ts', from: (path: string) => path === 'service/retention-timer.ts' },
  {
    reaches: 'service/calendar-marker.service.ts',
    from: (path: string) => path === 'service/plan-document.ts',
  },
] as const;

function underSrc(fileName: string): string {
  return fileName.startsWith(coreSource) ? fileName.slice(coreSource.length) : fileName;
}

/** Every TypeScript file of the core, as a path under `src`. */
async function scannedSources(): Promise<readonly string[]> {
  return (await readdir(coreSource, { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();
}

/**
 * The core compiled as one program, with its own `tsconfig.lib.json` options.
 *
 * Both throws are load-bearing: without the real options there are no path
 * mappings, `@wbs/contracts` does not resolve, and every symbol this rule asks
 * about comes back unresolved — which reads as an empty violation list.
 */
function coreProgram(rootNames: readonly string[]): ts.Program {
  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  // Proof: pointing `configPath` at `tsconfig.absent.json` threw
  // `Cannot read file '…/tsconfig.absent.json'.` and failed the assertion, 0 pass and 1 fail (2026-09-22).
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, coreRoot);
  // Proof: `"module": "invalid"` in the real tsconfig.lib.json threw `refused tsconfig.lib.json: 6046`
  // and failed the assertion, 0 pass and 1 fail; with this throw deleted the same malformed option left
  // the assertion passing on unresolved symbols, 1 pass and 0 fail (2026-09-22).
  if (parsed.errors.length > 0) {
    throw new Error(
      `refused tsconfig.lib.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
    );
  }
  return ts.createProgram({
    rootNames: rootNames.map((path) => `${coreSource}${path}`),
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
  return (symbol.declarations ?? []).map((each) => underSrc(each.getSourceFile().fileName));
}

/** Every module specifier of a node that introduces one. */
function moduleSpecifierOf(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return node.arguments[0];
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require'
  ) {
    return node.arguments[0];
  }
  return undefined;
}

/**
 * Every checked route by which one of {@link routes}' consumers reaches the owner
 * file it may not depend on.
 *
 * **Proven coverage: exactly the forms with a watched negative**, each named with
 * the fault of the 040.6 C packet's section 6 that watches it. Every question
 * compares declaration files of **resolved identities**, never spelling.
 *
 * - A module specifier resolving to a forbidden file: a relative named import (3)
 *   and a bare side-effect import (7).
 * - An identifier whose alias chain passes through a forbidden file: a named import
 *   of a name that file declares (1, 2) and the same through the `@wbs/core` barrel
 *   (8).
 * - A type-only namespace import used as a qualified type (4).
 * - A value namespace of the forbidden file read by element access (5).
 * - A `typeof import(...)` indexed by a string literal (6).
 * - A value namespace of a **forwarding barrel** read by element access, by property
 *   access, and destructured plain or renamed (10 to 13).
 * - A namespace of a **narrow forwarding file** read by a `const`-typed literal key
 *   (18), destructured through a computed property name (19), read as an
 *   indexed-access type through a type-alias key (20), keyed by `keyof typeof` from a
 *   widened `string` (21), and keyed by a **finite union** (22).
 * - A forwarded **primitive-valued** export read as an indexed-access type (24) and
 *   by a `const`-keyed element access (25).
 *
 * The second selection route — the base module's export symbol for every literal
 * member name the key type can be — exists because a forwarded
 * `export const TOKEN_TTL_SECONDS` selects to `number`, which declares nothing.
 *
 * **Unverified here.** The implementation also resolves a dynamic `import(...)`
 * specifier, an `import x = require(...)` reference, a renamed import, a `default`
 * re-export, an `export * as ns` re-export and a multi-hop re-export chain, and this
 * packet supplies **no probe for any of them**, so nothing here shows that it does.
 * `ports/event-port-boundaries.test.ts` watches those forms against **its own** port
 * contracts; that is evidence about that rule, not this one.
 *
 * **Residuals observed returning `[]` here, with the type check at exit 0.** A
 * selection whose **base** no longer resolves to a module:
 * `(markers as unknown as Record<string, unknown>)['CalendarMarkerService']` erases
 * the namespace's identity before anything is selected out of it, so neither route
 * opens (23). A third file re-exporting an owner's own re-export of a **contracts**
 * declaration, which resolves to the contracts declaration and leaves nothing of the
 * owner to reach (9).
 *
 * **Limits by analysis, not measured here.** Value-binding indirection
 * (`export const actor = user` consumed as a named import), a structural copy of a
 * contract, and a duplicate or merged declaration of the same shape are
 * declaration-side problems a reference rule cannot decide; packet B records the same
 * limits for its own rule after five rounds. They belong to the kind rules K2 to K6
 * of `docs/superpowers/specs/2026-09-19-code-organization-design.md`.
 */
function sidewaysUses(paths: readonly string[]): readonly string[] {
  const program = coreProgram(paths);
  const checker = program.getTypeChecker();
  for (const route of routes) {
    // Proof: changing one row's `reaches` to `service/absent.service.ts` threw
    // `the program holds no service/absent.service.ts` and failed the assertion, 0 pass and 1 fail (2026-09-22).
    if (program.getSourceFile(`${coreSource}${route.reaches}`) === undefined) {
      throw new Error(`the program holds no ${route.reaches}`);
    }
  }
  const reached: string[] = [];

  for (const path of paths) {
    const file = program.getSourceFile(`${coreSource}${path}`);
    // Proof: appending `'ports/missing.ts'` to what `scannedSources` returns threw
    // `the program holds no ports/missing.ts` and failed the assertion, 0 pass and 1 fail (2026-09-22).
    if (file === undefined) throw new Error(`the program holds no ${path}`);
    const owners = routes.filter((route) => route.reaches !== path && route.from(path));
    if (owners.length === 0) continue;

    const report = (owner: string, how: string): void => {
      reached.push(`${path}: ${how} reaches ${owner}`);
    };
    const ownerIn = (files: readonly string[]): readonly string[] =>
      owners.map((route) => route.reaches).filter((owner) => files.includes(owner));

    /**
     * Every declaration file the checker resolves this node's own identity to.
     *
     * This is the whole of the member rule, and it enumerates no syntax: a
     * selection out of a module is judged by what the checker says the selection
     * **is**. A literal key, a `const` key with a literal type, a computed binding
     * property and an indexed-access type through a type alias all resolve to the
     * same member symbol, so none of them needs a branch of its own. Two review
     * rounds got past an enumeration of literal spellings; identity has nothing to
     * enumerate. It is not sufficient alone — see {@link selectedNames} for the
     * primitive-valued export this route loses.
     */
    const resolvedDeclarations = (node: ts.Node): readonly string[] => {
      const files: string[] = [];
      const add = (symbol: ts.Symbol | undefined): void => {
        if (symbol !== undefined)
          files.push(...aliasChain(checker, symbol).flatMap(declarationFiles));
      };
      add(checker.getSymbolAtLocation(node));
      const seen = new Set<ts.Type>();
      const walk = (type: ts.Type): void => {
        if (seen.has(type)) return;
        seen.add(type);
        add(type.aliasSymbol);
        add(type.getSymbol());
        // A union or intersection carries no symbol of its own, so the identity that matters is in
        // its constituents: `markers[key]` with `key: 'A' | 'B'` resolves to `typeof A | typeof B`.
        if (type.isUnionOrIntersection()) for (const constituent of type.types) walk(constituent);
      };
      walk(checker.getTypeAtLocation(node));
      return files;
    };

    /**
     * Every member name a selection's **key type** can literally be.
     *
     * The type of a selection is not always enough to find the export it names: a
     * forwarded `export const TOKEN_TTL_SECONDS` selects to `number`, a primitive
     * with no declaration of its own, so the type route loses it (round 4). The key
     * is asked instead, by type and not by syntax — a string literal, a `const`
     * binding whose type is that literal, or any literal constituent of a union all
     * answer the same way — and the name is then resolved back to the base module's
     * export symbol.
     */
    const selectedNames = (node: ts.Node): readonly string[] => {
      const names: string[] = [];
      const addLiterals = (type: ts.Type): void => {
        if (type.isUnionOrIntersection()) {
          for (const constituent of type.types) addLiterals(constituent);
          return;
        }
        if (type.isStringLiteral()) names.push(type.value);
      };
      if (ts.isPropertyAccessExpression(node)) names.push(node.name.text);
      else if (ts.isElementAccessExpression(node)) {
        addLiterals(checker.getTypeAtLocation(node.argumentExpression));
      } else if (ts.isIndexedAccessTypeNode(node)) {
        addLiterals(checker.getTypeAtLocation(node.indexType));
      } else if (ts.isBindingElement(node)) {
        const selected = node.propertyName ?? node.name;
        if (ts.isIdentifier(selected) || ts.isStringLiteralLike(selected))
          names.push(selected.text);
        else if (ts.isComputedPropertyName(selected)) {
          addLiterals(checker.getTypeAtLocation(selected.expression));
        }
      }
      return names;
    };

    /** Where the base module's export of that name is finally declared. */
    const memberDeclarations = (baseType: ts.Type, name: string): readonly string[] => {
      const member = checker.getPropertyOfType(baseType, name);
      return member === undefined
        ? []
        : aliasChain(checker, member).flatMap((each) => declarationFiles(each));
    };

    /** What an object binding pattern is destructuring, as a type. */
    const patternBaseType = (pattern: ts.ObjectBindingPattern): ts.Type => {
      const parent = pattern.parent;
      const source =
        ts.isVariableDeclaration(parent) || ts.isParameter(parent)
          ? (parent.initializer ?? parent.type)
          : undefined;
      return checker.getTypeAtLocation(source ?? pattern);
    };

    /** The file a type's symbol is declared in, when that symbol is a module. */
    const moduleFileOfType = (type: ts.Type): string | undefined => {
      const symbol = type.aliasSymbol ?? type.getSymbol();
      if (symbol === undefined) return undefined;
      const chain = aliasChain(checker, symbol);
      const end = chain[chain.length - 1] ?? symbol;
      const declaration = end.declarations?.find((each) => ts.isSourceFile(each));
      return declaration === undefined ? undefined : underSrc(declaration.getSourceFile().fileName);
    };

    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierOf(node);
      if (specifier !== undefined) {
        const moduleSymbol = checker.getSymbolAtLocation(specifier);
        if (moduleSymbol !== undefined) {
          const chain = aliasChain(checker, moduleSymbol);
          const end = chain[chain.length - 1] ?? moduleSymbol;
          for (const owner of ownerIn(declarationFiles(end))) {
            report(owner, specifier.getText());
          }
        }
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined) {
          const hops = aliasChain(checker, symbol).flatMap((each) => declarationFiles(each));
          for (const owner of ownerIn(hops)) report(owner, node.getText());
        }
      }
      /**
       * A selection whose base is any module: the base may be an owner, and the
       * thing selected may be declared in one. Both are asked, neither is spelled.
       */
      const selectionBase = ts.isBindingElement(node)
        ? ts.isObjectBindingPattern(node.parent)
          ? patternBaseType(node.parent)
          : undefined
        : ts.isIndexedAccessTypeNode(node)
          ? checker.getTypeAtLocation(node.objectType)
          : ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)
            ? checker.getTypeAtLocation(node.expression)
            : undefined;
      if (selectionBase !== undefined) {
        const from = moduleFileOfType(selectionBase);
        if (from !== undefined) {
          for (const owner of ownerIn([from])) report(owner, node.getText());
          for (const owner of ownerIn(resolvedDeclarations(node))) report(owner, node.getText());
          for (const name of selectedNames(node)) {
            for (const owner of ownerIn(memberDeclarations(selectionBase, name))) {
              report(owner, node.getText());
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...new Set(reached)].sort();
}

describe('the no-sideways type routes of the 040.6 map', () => {
  it('rejects the checked sideways-type import routes', async () => {
    // Proof: seventeen injected routes each failed this assertion with `wbs-core:typecheck` at exit 0.
    // In `service/plan-document.ts`: its pre-move `CalendarMarkerListOutcome` import; a type-only namespace
    // of the marker service used as a qualified type; a value namespace of it read by element access; a
    // `typeof import(…)` indexed access; a bare side-effect import of it; and a `@wbs/core` barrel import of
    // `CalendarMarkerOutcome`, which only the marker service declares. Through a namespace of `index.ts`,
    // which forwards the owner: `core['CalendarMarkerService']`, `core.CalendarMarkerService`,
    // `const { CalendarMarkerService } = core` and its renamed form. Through a narrow file forwarding only
    // `CalendarMarkerService`: `markers[key]` with `const key = 'CalendarMarkerService'`,
    // `const { ['CalendarMarkerService']: held } = markers`,
    // `(typeof import('./replay-orchestrator'))[MarkerKey]`, a `keyof typeof` key from a widened `string`,
    // and a finite-union key (`key: 'CalendarMarkerService' | 'ReplayOrchestrator'`). Through the same file
    // forwarding the primitive `TOKEN_TTL_SECONDS`, from `use-cases/replay.ts`:
    // `(typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS']` and a `const`-keyed element
    // access of it. Each is reported as `<file>: <specifier or expression> reaches <owner>`. Two further
    // injections were watched **passing** and are not prevented: that namespace's module identity cast away
    // first (`markers as unknown as Record<string, unknown>`), and a third file re-exporting the owner's own
    // re-export of a contracts declaration, which resolves to the contracts declaration and leaves nothing
    // of the owner to reach (2026-09-22).
    expect(sidewaysUses(await scannedSources())).toEqual([]);
  }, 120_000);
});
```

### 9.12 Slice 3's three import lines

`apps/wbs/be-01/src/service/optimization-coordinator.ts`: lines 6 and 7 become

```ts
import type { ProjectEvent, RecordedEvent } from '@wbs/core';
import type { Schedule, SolverObjectiveName } from '@wbs/domain';
```

and lines 43 and 44 — `import type { SolverObjectiveName } from '../repository/schema';` and
`import type { ProjectEvent } from './broadcast';` — are **deleted**, both of them, as the two
adjacent lines they are.

`apps/wbs/be-01/src/service/optimized-plan-read.test.ts`: delete line 6,
`import type { SolverObjectiveName } from '../repository/schema';`, and line 1 becomes

```ts
import { type Schedule, schedule, sliceKey, type SolverObjectiveName } from '@wbs/domain';
```

`bunx eslint --fix` leaves two separate `@wbs/domain` import lines here, which lints and type-checks;
the single line above is what this packet prescribes, because two imports of one specifier is a
second place for the next reader to look.

### 9.13 `docs/code-organization/kinds.json`

Five entries, each addressed by its `path` value. `K` stays 95; no entry is added or removed.

| Entry `path`                                                   | `capability` becomes | Rationale becomes                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `libs/wbs/application/core/src/service/import.service.ts`      | `plan-import`        | `importRoutes calls it for one atomic user-visible import that owns UnitOfWork and coordinates DirectoryService, work-item insertion, scheduler and announcement ports, the capability the plan-json-import change names`                                                            |
| `libs/wbs/application/core/src/service/plan-commands.ts`       | `wbs-domain`         | `run-command-batch and work-item routes call it to own UnitOfWork and coordinate directory, capacity, priority-band and work-item services for one admitted command batch, the user-facing batch behaviour specified by the archived 2026-08-30-plan-commands requirement group`     |
| `libs/wbs/application/core/src/service/saved-plan.service.ts`  | `wbs-domain`         | `saved-plan routes and the save-plan use case call it to coordinate SavedPlanCaptureStore, SavedPlanStore, Scheduler and Digest for the user-visible save, read, compare, rename and delete behaviour specified by the archived 2026-09-10-scheduler-runtime-port requirement group` |
| `libs/wbs/application/core/src/use-cases/run-command-batch.ts` | `wbs-domain`         | `workItemRoutes and the portable composition call it to enforce write-scope admission before coordinating project or directory command batches through PlanCommandRunner for the same archived 2026-08-30-plan-commands requirement group`                                           |
| `libs/wbs/application/core/src/use-cases/save-plan.ts`         | `wbs-domain`         | `savedPlanRoutes and the portable composition call it to coordinate ProjectService access, SavedPlanService persistence and Broadcaster publication for one save of the archived 2026-09-10-scheduler-runtime-port saved-plan requirement group`                                     |

The fact that makes each value right, cited:

- `plan-import` is named as a capability at `openspec/changes/plan-json-import/proposal.md:23`
  ("`plan-import`: a plan document creates a new project, whole or not at all") and its delta spec's
  requirement refers to it at `openspec/changes/plan-json-import/specs/wbs-domain/spec.md:8`. The
  old value, `"unspecified"`, was already a statement that nobody had looked.
- Plan commands' user-facing behaviour is specified at
  `openspec/changes/archive/2026-08-30-plan-commands/specs/wbs-domain/spec.md:3` ("A plan is written
  to as a command batch"), `:42` and `:67` ("One batch is one undo").
- Saved plans' is specified at
  `openspec/changes/archive/2026-09-10-scheduler-runtime-port/specs/wbs-domain/spec.md:12` ("A saved
  plan is a copy of the whole plan, joined to nothing"), `:125` and `:260`.
- `core-lib-extraction` is a real accepted capability and it is about **the move**, not about what
  these features do for a user: its requirements are rings, dependency direction, port purity and
  "A move changes no behaviour" (`openspec/specs/core-lib-extraction/spec.md:9,28,80,167`). Rule K9
  asks a feature to name the capability it serves, which is why the map calls these four values
  wrong even though the old value names something real.

**State the gap, do not paper over it.** `wbs-domain` is not a synced main spec: `openspec spec list`
names twelve capabilities and not that one, while 123 archived change directories carry
`specs/wbs-domain/`. So the corrected value is checkable against those archived deltas only, and
`openspec/specs/wbs-domain/` does not exist to check it against. Syncing that requirement group is
its own change and not this packet's; the map's line 40, which calls the group "synced by archived
`2026-08-30-plan-history`", is wrong about the sync and section 13 records that.

### 9.14 The three ticks and the note under 1.6

Task 1.3 becomes:

```md
- [x] 1.3 Change Plan document's marker read to an owner-neutral read port and move
      `CalendarMarkerListOutcome` out of the Calendar marker service file. Landed 2026-09-22 as
      `libs/wbs/application/core/src/ports/calendar-marker-read.ts`, with `CalendarMarkerReader` as the
      contract `PlanDocumentServiceOptions.markers` now names; the service keeps every name as a
      compatibility re-export. Checked by `ports/sideways-type-boundaries.test.ts`.
```

Task 1.4 becomes:

```md
- [x] 1.4 Move the actor and principal types `runCommandBatch`, `replay`, `savePlan` and
      `retention-sweep.ts` share to a neutral contract location so none of them imports Authentication.
      Landed 2026-09-22: `AuthenticatedUser` and `InternalIdentity` are declared in
      `libs/wbs/domain/contracts/src/principal.ts`. `service/auth.service.ts` re-exports
      `AuthenticatedUser` only; `http/endpoint.ts` re-exports both and keeps `Identity` built from them.
      `service/retention-timer.ts` moved with the use cases. Checked by
      `ports/sideways-type-boundaries.test.ts`.
```

Task 1.6 keeps its empty box and gains the note:

```md
- [ ] 1.6 Import `SolverObjectiveName` from `@wbs/domain` and replace the repository hash shim with
      an injected cache-key port backed by SQLite's existing SHA-256. First half landed 2026-09-22:
      `apps/wbs/be-01/src/service/optimization-coordinator.ts` and `…/optimized-plan-read.test.ts` take
      `SolverObjectiveName` from `@wbs/domain`, and the coordinator takes `ProjectEvent` from `@wbs/core`
      rather than through `service/broadcast.ts`. No rule prevents the repository-schema path returning:
      be-01 has no type-identity boundary check, and the Optimization module of 3.6 owns that rule. The
      cache-key port is still owed.
```

Task 1.8 becomes:

```md
- [x] 1.8 Correct the four `kinds.json` capability values to `wbs-domain` and `plan-import`. Done
      2026-09-22 over **five** entries, not four: Plan history's row became a shim under 2.1, and Plan
      commands and Saved plans each carry two rows (the service and its use case). `wbs-domain` is a
      requirement group of 123 archived deltas and is not a synced main spec — `openspec spec list` does
      not name it — so the value is checkable against those deltas only; syncing it is its own change.
```

### 9.15 The listings the negative slice injects

Fault 3 restores the pre-move file: line 14 becomes
`import type { CalendarMarkerListOutcome } from './calendar-marker.service';` (and the
`'../ports/calendar-marker-read'` import is deleted), and the `markers` field becomes

```ts
  markers: {
    list(projectId: string): Promise<CalendarMarkerListOutcome>;
  };
```

Fault 4 replaces the port import with a type-only namespace and qualifies the field:

```ts
import type * as markerService from './calendar-marker.service';
```

```ts
  markers: { list(projectId: string): Promise<markerService.CalendarMarkerListOutcome> };
```

Fault 5 keeps the port import and adds a **value** namespace read by element access above it:

```ts
import * as markerService from './calendar-marker.service';

const held = markerService['CalendarMarkerService'];
void held;
```

Fault 6 keeps every import and adds this directly above `export interface PlanDocumentServiceOptions {`:

```ts
type MarkerServiceType = (typeof import('./calendar-marker.service'))['CalendarMarkerService'];
export type PlanDocumentMarkerService = MarkerServiceType;
```

Fault 7 adds one line directly above the port import:

```ts
import './calendar-marker.service';
```

Fault 8 keeps the port import, adds a barrel import above it and one exported alias above
`export interface PlanDocumentServiceOptions {`:

```ts
import type { CalendarMarkerOutcome } from '../index';
```

```ts
export type PlanDocumentMarkerWrite = CalendarMarkerOutcome;
```

Faults 10 to 13 all keep the port import and add a **value namespace of the barrel** directly above it,
differing only in how the member is reached. Fault 10:

```ts
import * as core from '../index';

const held = core['CalendarMarkerService'];
void held;
```

Fault 11 is the same four lines with `const held = core.CalendarMarkerService;`. Fault 12 is the same
with `const { CalendarMarkerService } = core;` and `void CalendarMarkerService;`. Fault 13 is fault 12
renamed: `const { CalendarMarkerService: markerClass } = core;` and `void markerClass;`. All four
type-check at exit 0, and all four reported **nothing** before the member and binding-pattern vantages
existed.

Faults 18 to 21 all add the **same** one forwarding line to
`libs/wbs/application/core/src/service/replay-orchestrator.ts`, a file that exports nothing of the
Calendar marker service today:

```ts
export { CalendarMarkerService } from './calendar-marker.service';
```

and then read it from `service/plan-document.ts`, above the port import, which stays. Fault 18:

```ts
import * as markers from './replay-orchestrator';

const key = 'CalendarMarkerService';
const held = markers[key];
void held;
```

Fault 19 replaces those four lines with the computed binding property:

```ts
import * as markers from './replay-orchestrator';

const { ['CalendarMarkerService']: held } = markers;
void held;
```

Fault 20 imports no value at all and adds two exported type aliases:

```ts
export type MarkerKey = 'CalendarMarkerService';
export type Held = (typeof import('./replay-orchestrator'))[MarkerKey];
```

Fault 21 is fault 18 with the key widened to `string` and cast back:

```ts
import * as markers from './replay-orchestrator';

const key: string = 'CalendarMarkerService';
const held = markers[key as keyof typeof markers];
void held;
```

Fault 22 is a finite union in the selector's type, which is where round 3 got through:

```ts
import * as markers from './replay-orchestrator';

export function held(key: 'CalendarMarkerService' | 'ReplayOrchestrator') {
  return markers[key];
}
```

Fault 23 casts the namespace's module identity away before anything is selected, and it is the
**residual**:

```ts
import * as markers from './replay-orchestrator';

const opaque = markers as unknown as Record<string, unknown>;
const held = opaque['CalendarMarkerService'];
void held;
```

Faults 24 and 25 forward a **primitive-valued** export from the same orchestrator file instead, and read it
from `use-cases/replay.ts`. The forwarding line is

```ts
export { TOKEN_TTL_SECONDS } from './auth.service';
```

Fault 24 appends one line to `use-cases/replay.ts`:

```ts
export type Held = (typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS'];
```

Fault 25 instead adds a value namespace and a `const` key above the existing type import:

```ts
import * as orchestrator from '../service/replay-orchestrator';

const ttlKey = 'TOKEN_TTL_SECONDS';
export const ttl = orchestrator[ttlKey];
```

Faults 18 to 22, 24 and 25 report one row each and type-check at exit 0; fault 23 reports nothing
(`1 pass`, `0 fail`, typecheck exit 0) and is recorded as the residual rather than chased. Restore **both**
files after each of the eight and prove both with `cmp`.

Fault 9, the laundering residual: append one line to
`libs/wbs/application/core/src/service/replay-orchestrator.ts`

```ts
export type { AuthenticatedUser } from './auth.service';
```

and in `use-cases/replay.ts` drop `AuthenticatedUser` from the `@wbs/contracts` import and take it
from the orchestrator instead:

```ts
import type { InternalIdentity } from '@wbs/contracts';

import type {
  AuthenticatedUser,
  ReplayOrchestrator,
  ReplayOutcome,
} from '../service/replay-orchestrator';
```

Observed: `1 pass`, `0 fail`, and `wbs-core:typecheck` exit 0. Restore both files and record it as
the residual rather than as a rule failure.

### 9.16 The closing `verify.md` template

**This is a template, not a record.** Every `<…>` is filled from a log **this attempt holds**, and every
path cited below is relative to `$TMPDIR/evidence`: either a file this slice wrote there, or one step 0
copied into `evidence/seeded/<attempt-id>/`. Nothing cites `$TMPDIR/<attempt-id>/` directly, because
`--preserve evidence` does not retain those sibling directories. A claim whose log this attempt does not
hold is written as `pending planner verification`, naming who runs it. Do not copy a number out of this
packet. Before appending, re-check that every path cited here exists and is non-empty; a published record
that names an absent log is the defect this template exists to prevent.

```md
## The type-only preparations, <the date this slice ran>

- Task 1.3: `ports/calendar-marker-read.ts` declares `CalendarMarkerReader`,
  `CalendarMarkerListOutcome`, `CalendarMarkerRefused`, `CalendarMarkerRefusal` and
  `CalendarMarkerSubject`. `service/calendar-marker.service.ts` re-exports the **four** moved names
  (not `CalendarMarkerReader`, which only Plan document needs) and keeps `CalendarMarkerOutcome` as its
  own declaration; `service/plan-document.ts` names the reader. Slice 1 observed: `wbs-core` type-check
  and lint, the portable browser build, and the be-01, gw-01 and mcp-01 type-checks at exit 0, and the
  core suite moving from `<C>` passed over `<F>` files to `<C + 1>` over `<F + 1>`, the one new file
  being the rule (`seeded/<slice-1-id>/slice-1-core-baseline.log`,
  `seeded/<slice-1-id>/slice-1-core-closing.log`).
- Task 1.4: `libs/wbs/domain/contracts/src/principal.ts` declares `AuthenticatedUser` and
  `InternalIdentity`. `service/auth.service.ts` re-exports `AuthenticatedUser` only;
  `http/endpoint.ts` re-exports both and keeps `Identity` built from them. The four use cases,
  `service/retention-timer.ts`, `compose.ts` and three test files take them from `@wbs/contracts`.
  Slice 2 observed: `wbs-contracts` type-check, lint and test at exit 0, and the core suite unchanged at
  `<C>` over `<F>` (`seeded/<slice-2-id>/slice-2-core-baseline.log`,
  `seeded/<slice-2-id>/slice-2-core-closing.log`).
- Task 1.6, first half: `apps/wbs/be-01/src/service/optimization-coordinator.ts` and
  `…/optimized-plan-read.test.ts` take `SolverObjectiveName` from `@wbs/domain`, and the coordinator
  takes `ProjectEvent` from `@wbs/core`. Slice 3 observed be-01 type-check and lint at exit 0 and its
  **focused sandbox-safe subset** (the six selected be-01 tests closest to the changed files; four further
  eligible ones, and the spawning `optimization-spawn-handshake.proc.db.test.ts`, are the planner's)
  unchanged at `<B>` passed over `<G>` files
  (`seeded/<slice-3-id>/slice-3-be-subset-baseline.log`,
  `seeded/<slice-3-id>/slice-3-be-subset-closing.log`). The whole `wbs-be-01:test`
  target is pending planner verification: two of its files bind a socket and the slice was dispatched
  without network.
- Preparation 6 of the module map was already met before this work and is recorded, not redone: the
  root supplies the optimizer's event callback at `apps/wbs/be-01/src/services.ts:149-150`, and
  `service/optimizer-trigger-broadcaster.ts:1` takes only the neutral port and an injected
  `inputChanged`, so neither feature imports the other.
- The one new safety check is `ports/sideways-type-boundaries.test.ts` ›
  `rejects the checked sideways-type import routes`. A type-only move has no runtime behaviour, so its
  production-path negative is this rule's red, not a behaviour test's: re-introducing a sideways type
  import leaves `wbs-core:typecheck` at exit 0 and fails this assertion. Slice 4 watched `<count>`
  reference routes fail and `<count>` guards throw, including the false green the malformed-tsconfig
  guard prevents, and two probes recorded as **not** prevented, each with the literal fragment recorded
  beside its evidence basename; the guard's own
  log is `seeded/<slice-4-id>/slice-4-malformed-tsconfig-guard-deleted.log`.
- Stated limits of the rule. It compares resolved declaration files, never spelling, and what it rejects
  is the list of forms in the packet's section 6, each with a watched negative — not a category. **Two
  residuals were observed here returning `[]` with the type check at exit 0**: a selection whose base has
  had its module identity cast away first
  (`(markers as unknown as Record<string, unknown>)['CalendarMarkerService']`, fault 23), and a third file
  re-exporting an owner's own re-export of a **contracts** declaration, because what is reached then is the
  contracts declaration and nothing of the owner remains in it (fault 9). **Two further limits are
  analysis, not measured here**: value-binding indirection through an exported binding, and a structural
  copy or a duplicate declaration of the same shape — `ports/event-port-boundaries.test.ts` records the
  same two for its own rule after five rounds, which is attributed precedent rather than a measurement of
  this one. All four belong to kind rules K2 to K6. Six further forms the implementation handles are
  **unverified here** and claimed neither way: a dynamic `import(...)`, `import x = require(...)`, a
  renamed import, a `default` re-export, an `export * as ns` re-export and a multi-hop re-export chain. Nothing prevents the be-01 repository-schema type path returning: be-01
  has no type-identity check, and task 3.6 owns that rule. `ports/event-port-boundaries.test.ts` says
  nothing about a file forwarding the Calendar marker service, which is out of that rule's scope and not a
  gap in it.
- Task 1.8 touched **five** entries, not four: Plan history's row became a shim under 2.1, and Plan
  commands and Saved plans each carry two rows. This slice observed the classification count unchanged
  at `<K>`, and strict OpenSpec validation unchanged at `<N>` before and after — the four files this
  slice wrote itself: `slice-5-kinds-before.txt`, `slice-5-kinds-after.txt`,
  `slice-5-openspec-before.json`, `slice-5-openspec-after.json`. `tool-devsync:test` is pending planner verification: its index
  checker refuses untracked files and it spawns processes.
- `wbs-domain` is not a synced main spec: `openspec spec list` names twelve capabilities and not that
  one, while 123 archived change deltas carry `specs/wbs-domain/`. The value is checkable against those
  deltas only, and syncing it is its own change.
```

## 10. Ready to commit

Each slice's handoff is `git status --short --untracked-files=all` against the `base` its step 0
recorded, and the path list is exactly:

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `libs/wbs/application/core/src/index.ts`, `…/src/ports/calendar-marker-read.ts`, `…/src/ports/sideways-type-boundaries.test.ts`, `…/src/service/calendar-marker.service.ts`, `…/src/service/plan-document.ts`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                                                                                                                    |
| 2     | `libs/wbs/application/core/src/compose.ts`, `…/src/http/endpoint.ts`, `…/src/http/project.routes.test.ts`, `…/src/http/saved-plan.routes.test.ts`, `…/src/ports/sideways-type-boundaries.test.ts`, `…/src/service/auth.service.ts`, `…/src/service/retention-timer.ts`, `…/src/use-cases/{admission.test,replay,retention-sweep,run-command-batch,save-plan}.ts`, `libs/wbs/domain/contracts/src/{index,principal}.ts`, `openspec/changes/adopt-di-composition/verify.md`                                                                                           |
| 3     | `apps/wbs/be-01/src/service/optimization-coordinator.ts`, `apps/wbs/be-01/src/service/optimized-plan-read.test.ts`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                                                                                                                                                                                                               |
| 4     | `libs/wbs/application/core/src/ports/sideways-type-boundaries.test.ts`, `openspec/changes/adopt-di-composition/verify.md`. Four files must be **absent** from the list, each mutated by the faults named and each restored from a copy under `"$TMPDIR"` and proved byte-identical with `cmp`: `libs/wbs/application/core/tsconfig.lib.json` (faults 16 and 16b), `…/src/service/plan-document.ts` (faults 3 to 8 and 10 to 13, and 18 to 23), `…/src/service/replay-orchestrator.ts` (faults 9 and 18 to 25) and `…/src/use-cases/replay.ts` (faults 9, 24 and 25) |
| 5     | `docs/code-organization/kinds.json`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                                                                                                                                                                                                                                            |

The count is scoped to the paths a slice owns, so a planner commit that also revises this packet file
cannot break it. Every slice ends with `GSETTINGS_BACKEND=memory bunx nx format:check --all` at
exit 0.

## 11. Stop conditions, each scoped to the slice it belongs to

Nothing here is global: slice 1 deliberately removes the marker import slice 1's own precondition
requires, and slice 2 deliberately rewrites the nine principal importers. Each condition below is
**false immediately before the slice named**, and a later slice asserts the previous slice's finished
state instead of its starting one. If one is true, stop and say which.

| Before | Stop if                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `libs/wbs/application/core/src/ports/calendar-marker-read.ts` or `…/ports/sideways-type-boundaries.test.ts` already exists; or `service/plan-document.ts` does **not** import `CalendarMarkerListOutcome` from `'./calendar-marker.service'`, or `service/calendar-marker.service.ts` no longer **declares** `CalendarMarkerListOutcome` and `CalendarMarkerRefused` (the red would be vacuous, or short of its four rows)                                                                                                                                                             |
| 2      | `…/ports/calendar-marker-read.ts` does **not** export `CalendarMarkerReader`, or `…/ports/sideways-type-boundaries.test.ts` does not hold the marker row (slice 1 did not finish); or `libs/wbs/domain/contracts/src/principal.ts` already exists; or any of the **nine** files this slice edits already takes its principal types from `@wbs/contracts` — that is the prerequisite the edits assume. The red count is a separate expectation and comes from the **six** checked consumers only: if it is not twenty-two, say which of those six is missing and how many rows appeared |
| 3      | `libs/wbs/domain/contracts/src/principal.ts` does **not** exist (slice 2 did not finish); or either `'../repository/schema'` import of section 9.12 is already gone; or one of the six enumerated test files of its step 0 is missing                                                                                                                                                                                                                                                                                                                                                  |
| 4      | `…/ports/sideways-type-boundaries.test.ts` holds anything but four `routes` rows and **zero** `Proof:` comments (slice 2 did not finish, or slice 4 already ran)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5      | `docs/code-organization/kinds.json` does not hold 95 entries, or does not hold four `"core-lib-extraction"` and one `"unspecified"` capability value (an earlier attempt already applied 9.13); or a seeded log step 0 names is absent or empty                                                                                                                                                                                                                                                                                                                                        |
| any    | the rule run reports `0 tests ran`, or a red this packet says should be red comes back green. A green where a red is expected is first a location mistake: restore, check the location, redo once, then stop                                                                                                                                                                                                                                                                                                                                                                           |
| 4      | `wbs-core:typecheck` exits non-zero with one of faults 3 to 13 or 18 to 23 in place. Those faults are meant to compile; a compiler diagnostic means the listing was applied wrongly, and the fault proves nothing about the rule until it does compile                                                                                                                                                                                                                                                                                                                                 |
| 5      | the closing OpenSpec `summary.totals` differs from the `N` this slice recorded in its own step 0. The number is relative to this attempt; there is no absolute value to compare against                                                                                                                                                                                                                                                                                                                                                                                                |

## 12. Recorded assumptions

- **`ports/` is the right home for `CalendarMarkerReader`, and no new directory is invented.** Packet
  B put the neutral event contracts in `ports/project-event.ts` for the same reason and the core keeps
  every contract of this kind there. The reader is a read port over a resource the caller does not
  own, which is what the map's line 43 asks for.
- **The refusal types move whole rather than being duplicated.** A second `CalendarMarkerRefused` in
  the port with the service keeping its own would be two shapes free to disagree; the map's
  public-symbol rule says as much ("No second class or exception definition may be left in a shim").
- **`InternalIdentity` moves even though preparation 5 only mentions `AuthenticatedUser`.** Leaving
  it in `http/endpoint.ts` leaves the use cases importing delivery, which the import matrix refuses
  outright — a worse edge than the one the preparation names. The map's own wording, "Move principal
  types to the endpoint/domain contract", covers both.
- **`CalendarMarkerOutcome` stays in the service.** Only the four writes answer with it, and Plan
  document never reads it. Moving it would widen the port past its one consumer.
- **The rule names consumers, not a global rule.** A whole-core "no resource imports a resource" rule
  is K6's job and needs the kind inventory; this rule keeps exactly the four edges these preparations
  removed, so it cannot quietly start passing for a reason unrelated to them.
- **Nothing in this packet claims K2, K3 or K6 closure.** A use case importing a contracts type is
  not a kind edge at all; a feature importing `ports/project-event` remains the preserved K3 debt
  packet B recorded.
- **`apps/wbs/be-01`'s shims stay.** Task 7.1 deletes them when `service-boundaries.test.ts`'s list
  says they may go, and that is not this packet.

## 13. Corrections this packet makes, and what it found wrong

- **The map says "four incorrect K9 inventory values"** (line 271). At `10c2171f` there are **five**
  entries carrying a value the map calls wrong, over three responsibilities: Plan commands and Saved
  plans each have two rows (the service and its use case), and Plan import has one. The fourth
  responsibility, Plan history, no longer carries a capability value at all — task 2.1 turned
  `libs/wbs/application/core/src/service/history.service.ts` into a `support` shim, so the map's
  line 40 instruction to "replace the incorrect `core-lib-extraction` inventory value" for Plan
  history is already moot. Slice 5 changes five values and says so in the task.
- **The map's line 40 calls the `wbs-domain` requirement group "synced by archived
  `2026-08-30-plan-history`". It is not synced.** `openspec spec list` names twelve capabilities and
  `wbs-domain` is not among them; `openspec/specs/wbs-domain/` does not exist, while 123 archived
  change directories carry `specs/wbs-domain/` deltas. The corrected `kinds.json` value is therefore
  checkable against archived deltas only. That is still better than `core-lib-extraction`, which
  names the extraction rather than the user-facing behaviour, and it is recorded as a gap in
  `verify.md` and in task 1.8's note rather than hidden.
- **The map's preparation 3 asks for a change that was 90% already made.** `plan-document.ts:27-30`
  has taken a structural port since before batch 6; only the type import at `:14` was left. Packet
  A's author reported this and it is confirmed here.
- **Preparation 6 needed nothing.** Section 4 gives the three citations. The map lists it among
  "Required no-sideways preparations"; it is a description of the code as it already stands.
- **Packet B's landed code is sound, with one thing worth naming and nothing to fix.**
  `libs/wbs/application/core/src/ports/project-event.ts:1` imports `SolverObjectiveName`,
  `ScheduleEngine` and `SolverFailureReason` from `@wbs/domain`, which is legal from every relevant backend kind, and
  its `verify.md` already records that the port keeps a type-only import of
  `../service/numbered-work-item` until task 6.1. `ports/event-port-boundaries.test.ts` scans the
  core only, so it does not see `apps/wbs/be-01/src/service/optimization-coordinator.ts:44` taking
  `ProjectEvent` through be-01's `service/broadcast.ts` shim — the identity reached is the port's, so
  it is not a violation of B's rule, but the path is one of the two that preparation 6 asks to be
  clean, and slice 3 removes it.
- **Packet A's landed code is sound.** `libs/wbs/application/core/src/module/plan-history/` carries
  the first suffix-declared file in the repository, `plan-history.feature.ts`, which makes
  `listSuffixDeclaredFiles`' JSDoc in `tools/tool-devsync/src/service-kinds.ts` — "Empty today and
  expected to stay empty until a module task renames its first file" — stale prose rather than a
  wrong check. Task 7.2 is where that sentence gets rewritten; this packet does not touch it.

## 14. Disposition of review 1 — historical where it describes the rule

Every finding was checked against the repository before it was acted on, and every fix was settled by
rehearsal in a private worktree of `10c2171f`, not by argument. **Round 2 superseded two of the entries
below**: Critical 1's fix was replaced by an identity test that enumerates nothing, and this section's
closing "one correction to the review" is retracted. Section 15 is the current record; read this one as
history.

**Critical 1 — the rule missed namespace access through a forwarding barrel. FIXED, and the review was
right.** Reproduced first on the previous listing: a value namespace of `'../index'` in
`service/plan-document.ts`, read as `core['CalendarMarkerService']` and destructured as
`const { CalendarMarkerService } = core`, both reported `1 pass`, `0 fail` with
`wbs-core:typecheck` at exit 0. The rule in section 9.11 now resolves the **selected member** and the
**destructured property** through `checker.getPropertyOfType`, follows the alias chain, and compares
declaration files, through helpers named `memberDeclarations` and `selectedName`. **Round 2 got past
that too, and both helpers are now deleted** — a member _name_ is still a spelling; see section 15.
Four watched negatives were added and survive: faults 10 to 13 of section 6, for element access,
property access, destructuring and renamed destructuring, each rehearsed red with the literal rows
recorded, each restored green, each type-checking at exit 0. The probe of packet B's rule reported here
aimed at `subscriptionFor` through `index.ts`, which is not the case round 1 raised; that rebuttal is
retracted under section 15's Minor 5.

**Critical 2 — slice 3 ran a `Bun.serve` test in a sandbox dispatched without network. FIXED in slice
3's step 0 and step 4.** Confirmed: `apps/wbs/be-01/src/app.routes.test.ts:548` calls `Bun.serve`, and
`grep -rln "Bun.serve\|\.listen("` over be-01's tests prints that file and `boot.db.test.ts` and
nothing else. The whole backend suite stays section 8's. Slice 3 now runs an **enumerated** six-file
suite — every be-01 test that reaches either changed file, minus
`optimization-spawn-handshake.proc.db.test.ts`, which spawns a child — with its own `test -f` gate and
its own baseline: observed exit 0, `60 pass`, `0 fail` over 6 files in 3.1 seconds, and none of the six
names `Bun.spawn` or `spawnSync`. The `bun test "${suite[@]}"` block was rehearsed as written,
including its failure path.

**Critical 3 — the proof-comment count demanded six where five exist. FIXED.** Counted with the
packet's own predicate against the final listing: `5`. Slice 4 now writes five and asserts
`test "$count" -eq 5`, and the text says why five is right rather than inventing a sixth: the member and
binding-pattern vantages are two branches of the one assertion, so their faults belong in the
assertion's comment.

**Important 1 — the slice-5 dispatch did not resume the clone. FIXED.** Confirmed at
`exec/run-executor.sh`: the clone path is derived from the packet basename and the launcher exits 67 if
it exists without `--resume`. The dispatch block now passes `--resume`,
`--require-ancestor <reviewed-slice-4-sha>` and `--preserve evidence`, says that slices 2 to 4 are
dispatched the same way, runs under `set -euo pipefail`, checks that each preserved evidence directory
exists before copying, and exits 72 on a failed copy **before** any dispatch.

**Important 2 — slice 5's step 0 expectations were wrong and its seed check could pass empty. FIXED.**
The expected policy line is now the literal one observed,
`95 {"-":85,"scheduler-runtime-port":1,"authentication":1,"unspecified":1,"core-lib-extraction":4,"realtime":2,"bounded-replay-sweep":1}`,
with a sentence saying `"-"` is the 85 entries carrying no capability — there is no `"support"`
capability and that was this packet's error. Seed discovery by globbing `"$TMPDIR"` is gone and the text
says why (the launcher always creates `$TMPDIR/evidence`). The four attempt ids are now explicit,
each paired with the log it owes, and `test -s` on that exact file with `exit 71` otherwise. The loop
was rehearsed both ways: it printed four `seeded:` lines at exit 0, and exit 71 naming the missing file
when one log was absent.

**Important 3 — the closing counts were not this attempt's. FIXED.** Slice 5 now collects its own `C`
and `F` and its own OpenSpec `N` in step 0, and its closing steps require those unchanged. Section 9.16
is relabelled "the closing `verify.md` **template**", every number is a `<…>` filled from a log this
attempt holds, and the whole-target and `tool-devsync` claims it used to assert are written as
`pending planner verification`. The absolute-114 stop condition is deleted; the OpenSpec condition is
now "differs from the `N` this slice recorded".

**Important 4 — the stop conditions were not global. FIXED.** Section 11 is retitled and is now a table
whose first column is the slice each condition precedes; later slices assert the previous slice's
finished state (slice 2 checks that the port exports `CalendarMarkerReader` and that the rule holds the
marker row; slice 4 checks four `routes` rows and zero `Proof:` comments).

**Important 5 — private absolute paths throughout slice 5. FIXED.** The block now sets `PLAN_ROOT` once
— the launcher's own root, the single absolute path this packet prints, which is the recorded
launcher-path precedent — and derives the logs, seeds and launcher from it. No other `/home` path
remains in the packet.

**Minor 1 — the schema chain. FIXED** in section 3: two hops now, `apps/wbs/be-01/src/repository/schema.ts:1`
(`export * from '@wbs/store-sqlite/schema';`) and line 2026 of the adapter schema, both cited.

**Minor 2 — the matrix and map claims were too strong. FIXED** in sections 3 and 4. The matrix row now
reads "every **backend** row … may import both Domain and Contracts", notes that `UI primitives` may
import neither, and says Contracts is the **chosen** shared home with the reason. Section 4 now states
that the map has module rows for Authentication (`:36`), Calendar markers (`:37`) and Plan document
(`:43`), that this packet edits a file of each, and that it **prepares** all three and extracts none,
naming tasks 3.5, 5.1 and 4.1.

**Minor 3 — the export inventory in the closing record. FIXED** in the section 9.16 template: the
service re-exports the **four** moved names and not `CalendarMarkerReader`, `auth.service.ts`
re-exports `AuthenticatedUser` only, and `http/endpoint.ts` re-exports both and keeps `Identity`.

**Minor 4 — descriptions contradicting their listings. FIXED.** The typecheck exception is now named as
fault **8b** with the reason it is recorded at all; the `routes` JSDoc now says the first three rows are
preparations 4 and 5 and the **fourth** is preparation 3; and section 9.1 now enumerates all **four**
repointed phrases instead of claiming two.

**One correction to the review — since RETRACTED.** Round 1's disposition claimed the review was wrong
that a narrow barrel left `ports/event-port-boundaries.test.ts` green. That rebuttal probed
`subscriptionFor` through `index.ts`, which is a different case, and round 2 was right to say so. See
section 15's Minor 5 for the retraction and the fresh probe.

## 15. Disposition of review 2 — historical where round 3 went further

Round 2 marked seven findings `PARTLY`, one `WRONGLY REJECTED` and the rest `FIXED`. Every `PARTLY` was
closed below, each settled by rehearsal on `10c2171f`. **Round 3 then superseded two of these entries**:
its Critical 1 fix was extended to walk union and intersection constituents, and its Minor 4 wording
("six of the ten") was itself miscounted. Section 16 is the current record.

**Critical 1 — computed member access still bypassed the rule. FIXED, and the enumeration is gone
rather than extended.** The three forms were reproduced first, on the round-1 listing, through a narrow
file forwarding one name (`export { CalendarMarkerService } from './calendar-marker.service';` appended
to `service/replay-orchestrator.ts`): `markers[key]` with `const key = 'CalendarMarkerService'`,
`const { ['CalendarMarkerService']: held } = markers`, and
`(typeof import('./replay-orchestrator'))[MarkerKey]` each gave `1 pass`, `0 fail` with
`wbs-core:typecheck` at exit 0 — the `[]` the review observed. No third syntax form was added.
`selectedName` and `memberDeclarations` were **deleted**, and the selection branch was made to do what
packet B's landed rule does at its own lines 241 to 264: it establishes that the base resolves to a module, then
takes `checker.getTypeAtLocation(node)` plus the node's own symbol, resolves them through the alias
chain, and compares declaration files. One branch now covers property access, element access with any
key expression, an object binding element with any property name, and `typeof import(...)` indexed by
any type, because all of them resolve to the same member symbol. **Round 3 found this still read only the
selected type's own symbol**, which a union does not have; section 16 records the constituent walk that
closed it. Observed after round 2's change, all three red and all three type-checking at exit 0:

- `+ "service/plan-document.ts: markers[key] reaches service/calendar-marker.service.ts",`
- `+ "service/plan-document.ts: ['CalendarMarkerService']: held reaches service/calendar-marker.service.ts",`
- `+ "service/plan-document.ts: (typeof import('./replay-orchestrator'))[MarkerKey] reaches service/calendar-marker.service.ts",`

Faults 10 to 13 were re-run on the new listing and are unchanged, `f3` and `f6` likewise; the clean tree
is green, `wbs-core` type-check and lint exit 0, and the core suite is 543 over 55. What identity still
cannot reach went into the **residual table**, not the coverage claim: a key the compiler only knows as
`string`, written `markers[key as keyof typeof markers]`, reports nothing (`1 pass`, `0 fail`, typecheck
exit 0) and is fault 21, with `@nx/enforce-module-boundaries` and the kind rules named as its owner.

**Critical 3 — three instructions still said six. FIXED.** The file plan, slice 1 step 1 and section 9.5
now say five, and slice 4 says why five is right. Section 1's "Eight reference routes" is now "Fifteen".

**Important 1 — the four attempt ids never reached the executor. FIXED.** Confirmed at
`exec/run-executor.sh:62-67` that `--seed` copies directories and adds nothing to the prompt, and at
`:75-80` that `--slice-note` is rendered into the instruction line. The dispatch now builds
`note="seeded evidence: slice 1 = '…', …"` from the same `attempts` array it seeds from and passes
`--slice-note "$note"`; slice 5's step 0 says the ids arrive on that line and that a line without ids is a
stop.

**Important 2 — evidence validation could falsely succeed. FIXED.** Reproduced the review's case: the old
`test -s` form against a **directory** printed `wc: … Is a directory`, then `seeded: 0 lines`, and exited 0. The block is now `test -f`, `test -r`, `test -s`, then `lines=$(wc -l < "$seeded") || exit 71`, each
with its own message. Rehearsed five ways: missing → `seed is not a regular file: …`, exit 71; empty →
`seed is empty: …`, 71; directory → `seed is not a regular file: …`, 71; `chmod 000` → `seed is not
readable: …`, 71; valid → four `seeded:` lines, exit 0.

**Important 3 — baselines were overwritten and the template cited names nothing created. FIXED.** Every
slice now writes a distinct pair: `slice-1-core-baseline.log` / `slice-1-core-closing.log`,
`slice-2-core-*`, `slice-3-be-subset-*`, `slice-5-core-*`, and slice 4's guard log is
`slice-4-malformed-tsconfig-guard-deleted.log`. Slice 5's `owed` array validates exactly those seeded
names, and section 9.16 cites the same ones, so no name is invented and no baseline is written over.

**Minor 1 — stale counts. FIXED**: the three remaining "six"s, slice 1 step 2's "two words changed" (now
"the four phrases section 9.1 enumerates"), and section 1's route count.

**Minor 2 — the matrix claim in section 2 and in the principal JSDoc. FIXED**: section 2 now reads "every
relevant **backend** kind may import both Domain and Contracts; `UI primitives` may import neither", and
section 9.7's JSDoc says "every relevant backend kind may import Contracts".

**Minor 3 — task 1.4's export record. FIXED**: it now enumerates `auth.service.ts` re-exporting
`AuthenticatedUser` only and `http/endpoint.ts` re-exporting both and keeping `Identity`.

**Minor 4 — the subset was described as exhaustive. FIXED, then corrected again in round 3**: section 3
and slice 3 call it a focused subset — round 2's wording said "six of the ten", which miscounted the
inventory and section 16 replaces with "the six selected files" — and name the four eligible tests
left to the planner's whole-target run (`services.db.test.ts`,
`controller/project.controller.test.ts`, `service/optimization-restart.db.test.ts`,
`service/optimization-cancel.two-coordinator.db.test.ts`) plus the excluded spawning one. Section 9.16
says the same.

**Minor 5 — round 1's rebuttal tested a different case. RETRACTED, the review was right.** Round 1
probed `subscriptionFor` through `index.ts`; the review's case was a narrow file forwarding the **marker
service**. Probed afresh: all three of round 2's forms through that narrow file returned `[]` from
`ports/event-port-boundaries.test.ts` — `1 pass`, `0 fail`, zero TypeScript diagnostics — reproducing
the original observation. Section 6's paragraph is rewritten and section 14's "one correction" is marked
retracted. **This is not a gap in packet B's rule and asks for no widening of it:** the Calendar marker
service is not one of that port's contracts, so its rule has nothing to say about a file forwarding it.
Policing marker-service forwarding is this packet's rule's job, and faults 18 to 20 are where it is done.

## 16. Disposition of review 3

Round 3 marked two findings `PARTLY` and raised one new `Critical`. All four are closed below, each
settled by measurement on `10c2171f`.

**Critical 1 — a finite-union selector bypassed the rule. FIXED, inside the identity branch.**
Reproduced first, exactly as the review wrote it: with
`export { CalendarMarkerService } from './calendar-marker.service';` appended to
`service/replay-orchestrator.ts` and
`export function held(key: 'CalendarMarkerService' | 'ReplayOrchestrator') { return markers[key]; }` in
`service/plan-document.ts`, the round-2 listing gave `1 pass`, `0 fail` with `wbs-core:typecheck` at
exit 0 — the `[]` the review observed. The cause was exact: `resolvedDeclarations` read only the selected
type's own symbol, and `typeof CalendarMarkerService | typeof ReplayOrchestrator` has none.
`resolvedDeclarations` now walks `type.isUnionOrIntersection() ? type.types : [type]` recursively,
alias-resolved and guarded with a `Set<ts.Type>` against cycles, and tests every constituent's
declarations. No syntax form was added. Observed after the change:
`+ "service/plan-document.ts: markers[key] reaches service/calendar-marker.service.ts",`, `0 pass`,
`1 fail`, typecheck exit 0 — fault 22.

**The review was also right that fault 21's explanation was misleading, and it is now a red, not a
residual.** Re-run with constituents walked, `markers[key as keyof typeof markers]` with
`const key: string` reports
`+ "service/plan-document.ts: markers[key as keyof typeof markers] reaches service/calendar-marker.service.ts",`:
`keyof typeof markers` makes the selection a union of every member, so there always was a member type to
resolve. The residual table's row is replaced by what actually survives, **fault 23**: a base whose module
identity is cast away first (`markers as unknown as Record<string, unknown>`), which reports `[]` at
typecheck exit 0 because the selection vantage never opens on a non-module base. Faults 10 to 13, 18 to 20,
3 and 6 were re-run on the new listing and are unchanged; the clean tree is green; `wbs-core` type-check
and lint exit 0; the core suite is 543 over 55.

**Important 1 — the initial reds were taken from the restored tree. FIXED, both re-measured from their
real starting states.** This was a lesson-1 defect and the review's numbers are confirmed. Slice 1, with
only the marker row and `service/plan-document.ts`, `service/calendar-marker.service.ts` and `index.ts` at
their unchanged content and no `ports/calendar-marker-read.ts`: **four** rows, `- Expected - 1`,
`+ Received + 6`, `0 pass`, `1 fail`, typecheck exit 0 —
`'./calendar-marker.service' reaches …`, `CalendarMarkerListOutcome reaches …`, `ok reaches …`,
`value reaches …`. Slice 2, with slice 1 applied and the nine importers plus
`libs/wbs/domain/contracts/src/index.ts` unchanged and no `principal.ts`: **twenty-two** rows,
`+ Received + 24`, `0 pass`, `1 fail`, typecheck exit 0, including
`use-cases/save-plan.ts: username reaches service/auth.service.ts`,
`use-cases/run-command-batch.ts: scopes reaches service/auth.service.ts` and
`service/retention-timer.ts: InternalIdentity reaches http/endpoint.ts`. Section 6's faults 1 and 2 and
both slices' step 1 now carry those counts, say why the extra rows exist (the declarations have not moved
yet), and say that a different count is a stop. Both rows are labelled **initial reds on unchanged code**,
distinct from slice 4's restoration faults, and tests still come before implementation in the same slice.

**Important 2 — the closing record cited evidence nobody creates or retains. FIXED.** Slice 5 now writes
its four named files itself — `slice-5-kinds-before.txt` and `slice-5-kinds-after.txt` through `tee` on the
Bun count, and `slice-5-openspec-before.json` and `slice-5-openspec-after.json` by copying the README
block's `$report`, whose own `mktemp` name carries a random suffix no record can cite. Step 0 now copies
**seven** validated seeded logs — each earlier slice's baseline _and_ closing run, plus slice 4's guard log
— into `"$TMPDIR/evidence/seeded/<attempt-id>/"`, and section 9.16 cites those relative paths, because
`--preserve evidence` keeps the current evidence directory and not the sibling attempt directories `--seed`
created. Rehearsed: the seven-log valid set printed seven `seeded:` lines at exit 0; removing one closing
log stopped at `seed is not a regular file: …`, exit 71. Section 9.16's preamble now also requires
re-checking every path it cites before the append.

**Minor 1 — "six of the ten". FIXED**: sections 3, 7 and 9.16 now say "the six selected files", name the
four further eligible tests as the planner's, and name `optimization-spawn-handshake.proc.db.test.ts`
separately as a coordinator reader excluded because it spawns.

**Minor 2 — "legal from any kind". FIXED** in section 13: "legal from every relevant backend kind", to
match sections 2, 3 and 9.7.

## 17. Disposition of review 4

Round 4 marked one finding `PARTLY` and raised four `Important` and two `Minor`. All are closed below,
each settled by measurement on `10c2171f`.

**Critical 1 — a forwarded primitive export bypassed the selection routes. FIXED, inside the identity
branch.** Reproduced first, exactly as the review wrote it: with
`export { TOKEN_TTL_SECONDS } from './auth.service';` appended to `service/replay-orchestrator.ts`
(`service/auth.service.ts:8` declares it), `use-cases/replay.ts` reading
`export type Held = (typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS'];` gave
`1 pass`, `0 fail` with `wbs-core:typecheck` at exit 0, and so did a `const`-keyed element access of the
same namespace. The cause was exact: the selection's type is `number`, and a primitive declares nothing,
so walking constituents could not help. Two helpers were added — `selectedNames`, which reads the **key
type** and collects its string-literal constituents (so a literal, a `const` binding whose type is that
literal, a computed property name and a union of literals are one branch, not four), and
`memberDeclarations`, which takes `checker.getPropertyOfType` on the base module for each of those names
and follows `getAliasedSymbol` to the end of the chain. The type route is kept for what the symbol route
cannot name. Observed after the change, both red at typecheck exit 0:

- `+ "use-cases/replay.ts: (typeof import('../service/replay-orchestrator'))['TOKEN_TTL_SECONDS'] reaches service/auth.service.ts",`
- `+ "use-cases/replay.ts: orchestrator[ttlKey] reaches service/auth.service.ts",`

Faults 13, 21, 22 and 23 were re-run on the new listing and are unchanged (23 still `1 pass`), the clean
tree is green, `wbs-core` type-check and lint exit 0, and the core suite is 543 over 55. **Section 6 now
claims no class**: it lists the thirteen covered forms against the faults that watch them, and the
residual table holds what is not covered with the `[]` observed for each.

**Important 1 — step 0 expected four `seeded:` lines where the loop prints seven. FIXED**: both
expectations in slice 5's step 0 now say seven, one per validated log, and the sentence that recorded the
earlier four-line observation says it was wrong rather than leaving it to be read as current.

**Important 2 — the closing template published a disproved limitation. FIXED**: section 9.16's limits
bullet is rewritten around fault 23's cast-erased base and now names four residuals, none of them fault
21, which is a watched red. The "Revised twice" paragraph in the header is marked superseded by the
round-3 and round-4 paragraphs above it, and sections 15 and 16 carry their own supersession notes.

**Important 3 — the assertion `Proof:` comment claimed an observation nobody makes. FIXED**: the comment
no longer mentions restoring the principal importers. It describes the two initial reds as what they are —
four rows for the marker row alone, and twenty-two once the principal rows exist, from six checked
consumers contributing eight import-specifier rows and fourteen identifier rows — and slice 4 says
explicitly that the comment must describe only what that executor observed.

**Important 4 — `tee` swallowed the producer's status. FIXED**: both policy counts now redirect Bun's
output straight into the named evidence file, take `status=$?` on the next line, refuse on a non-zero
status with exit 65, and `cat` the file afterwards. Rehearsed against a truncated policy file: the
redirect form printed `the policy could not be counted: exit 1` and exited 65; the `tee` form printed the
parse error and then `pipeline-exit=0`, which is the false success this replaces. The packet no longer
depends on any shell option surviving between commands.

**Minor 1 — nine edited importers confused with six scanned consumers. FIXED** in slice 2 step 1: "the
six checked consumers contribute eight import-specifier rows plus fourteen identifier rows", with the
reason (the `routes` predicates scan `use-cases/` and `service/retention-timer.ts`) and nine retained as
the number of importers the slice edits, `compose.ts` and the two HTTP route tests contributing no row.

**Minor 2 — the fault total omitted 16b. FIXED**: slice 4 now says **twenty-four fault runs** and
distinguishes their expected outcomes — seventeen report rows and fail, four throw from a guard and fail,
two pass as residuals (9 and 23), and 16b passes on purpose as the false green the malformed-tsconfig
guard prevents — with a run whose outcome differs from its row named a stop.

## 18. Disposition of review 5

Verdict was READY AFTER FIXES with no criticals. All four findings are text-only and closed here; the
rule's behaviour is unchanged, and the one edit to its file — the assertion comment — was re-run with
`wbs-core` type-check and lint at exit 0 and the assertion at `1 pass`, `0 fail`, so section 9.11's
listing is still byte-identical to a rehearsed file.

**Important 1 — the assertion `Proof:` comment demanded observations slice 4 never makes. FIXED** in
section 9.11. It now describes only that slice's own work: the seventeen injected routes it watches fail,
grouped by the file they mutate, and the two injections it watches **pass** as residuals. The initial reds
and every "reported nothing before round N" clause are gone from the comment; they live in section 6's
faults 1 and 2, in slices 1 and 2, and in the review history of sections 14 to 17, where they are
attributed.

**Important 2 — the JSDoc and closing record claimed more than the probes show. FIXED.** Section 9.11's
JSDoc is now the same fault-numbered list as section 6, form for form. The sentence "anything absent from
this list is a residual, recorded with the `[]` it was observed to return" is **deleted**. A dynamic
`import(...)`, `import x = require(...)`, a renamed import, a `default` re-export, an `export * as ns`
re-export and a multi-hop re-export chain are now labelled **unverified by this packet** — neither covered
nor residual — in the JSDoc, in section 6 and in the closing template, with a note that a later packet
needing them owes each a watched negative, and that packet B's observations concern its own rule.
"Observed returning `[]`" is now limited to faults 9 and 23; value-binding indirection and
structural/duplicate declarations are labelled analysis with packet B named as attributed precedent.

**Minor 1 — the stale nine-consumer claims. FIXED**: section 6's fault 2 row now says the twenty-two rows
come from the six checked consumers, contributing eight import-specifier and fourteen identifier rows, and
names `compose.ts` and the two HTTP route tests as edited-but-contributing-nothing. Section 11's slice-2
condition now separates the **nine**-file prerequisite from the **six**-consumer row count.

**Minor 2 — the slice-4 restoration checklist was short one file. FIXED**: section 10 now names four files
that must be absent from the handoff, each with the faults that mutate it and each requiring a byte
comparison — `tsconfig.lib.json` (16, 16b), `service/plan-document.ts` (3 to 8, 10 to 13, 18 to 23),
`service/replay-orchestrator.ts` (9, 18 to 25) and `use-cases/replay.ts` (9, 24, 25).
