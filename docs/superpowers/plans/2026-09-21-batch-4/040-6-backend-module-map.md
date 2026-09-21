# 040.6 backend/core module ownership map

Read-only inventory at integration `78f14391c977b2adaf1d2d1f38e1d8154d98ad42`.
Authority: reviewed `docs/code-organization/kinds.json` (2026-09-20), the accepted
code-organization design/rollout, the 2026-09-19 package-adoption amendment,
ADR 0014/0015/0018/0019/0020. No checks ran for this source inventory.

Runtime identity grammar is deliberately absent. Names below are stable
responsibilities for planning, not proposed runtime IDs.

## Rules applied

- One DI module per service responsibility. A use-case façade and its existing
  implementation share a module when separating them would create a prohibited
  same-kind edge.
- A resource used only by one feature is private in that feature module. This
  applies to Working plan under Plan commands.
- DI exports are ordinary typed contracts. The bag is visible only to
  `compose.ts`/backend composition. Existing `@wbs/core` exports remain as
  compatibility exports during moves.
- Feature modules consume resource contracts or ports; resources consume
  repository ports/domain code. No module imports a same-kind sibling.
- `servicesOver(scope.stores, ...)` remains a per-admission graph. The process
  root must never cache its stores, collector, or Working plan.
- Core modules borrow source/runtime values and own no disposers. Existing
  `bootBe01` continues owning source, retention start/stop, optimizer stop, and
  server in its tested order.

## Proposed core modules

`Exports` means DI/module contract, not every TypeScript type kept in the public
barrel.

| Responsibility       | Kind; accepted binding                                                        | Exports                                                                                                                                                      | Requirements                                                                                                                                                                 | Private/current members                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | feature; capability `authentication`                                          | one `Authentication` feature contract covering authenticate/session, password register and throttled password login; retain `auth` only as a migration alias | accountful `users: UserStore & OidcIdentityStore`, optional `OidcVerifier`, `PasswordHasher`, `TokenCodec`, `Clock`, throttle/mode policy                                    | `AuthService` and `LoginThrottle` are private collaborators. Delivery extracts trusted client identity and maps HTTP/cookies, but never drives the throttle directly                                                                                                                                                                  |
| Calendar markers     | resource; term **Calendar marker**                                            | `calendarMarkers: CalendarMarkerService`                                                                                                                     | `CalendarMarkerStore`, `ProjectStore`, `Clock`, `Broadcaster`                                                                                                                | none after `canEdit` becomes domain policy                                                                                                                                                                                                                                                                                            |
| Capacity             | resource; term **Capacity**                                                   | `capacity: CapacityService`                                                                                                                                  | `CapacityStore`, `ProjectStore`, `Clock`, `Broadcaster`                                                                                                                      | none after `canEdit` move                                                                                                                                                                                                                                                                                                             |
| Directory            | resource; term **Directory**                                                  | `directory: DirectoryService`                                                                                                                                | `DirectoryStore`, `Clock`, `Broadcaster`                                                                                                                                     | pure name/usage/assignee rules move to domain                                                                                                                                                                                                                                                                                         |
| Plan history         | feature; capability `wbs-domain`                                              | `history: HistoryService`                                                                                                                                    | `ProjectStore`, `PlanEventStore`                                                                                                                                             | bind to the existing user-facing capability requirement group synced by archived `2026-08-30-plan-history`; replace the incorrect `core-lib-extraction` inventory value                                                                                                                                                               |
| Plan import          | feature; capability `plan-import` from the accepted `plan-json-import` change | `imports: ImportService`                                                                                                                                     | `Clock`, `Scheduler`, `UnitOfWork`, `Broadcaster`, per-scope `ImportServices` factory                                                                                        | `prepare-import.ts`; admitted factory borrows Directory/Work item resource contracts                                                                                                                                                                                                                                                  |
| Plan commands        | feature; capability `wbs-domain`                                              | `commands: PlanCommandRunner`; `runCommandBatch` compatibility façade                                                                                        | `UnitOfWork`, neutral `Broadcaster` port, public and per-scope Directory/Capacity/Priority band/Work item contracts                                                          | bind to the existing requirement group synced by archived `2026-08-30-plan-commands`; `AnnouncementCollector`, `command-bindings.ts`, and **Working plan** with its five helpers are private. `plan-command-registry` and `live-plan-snapshot` remain supporting capabilities                                                         |
| Plan document        | resource; term **Plan document**                                              | `planDocuments: PlanDocumentService`                                                                                                                         | `PlanDirectory`, `CalendarMarkerStore` (or an owner-neutral marker-read port), `Clock`                                                                                       | replace its `CalendarMarkerService` type import; no resource-to-resource edge                                                                                                                                                                                                                                                         |
| Priority band        | resource; term **Priority band**                                              | `priorityBands: PriorityBandService`                                                                                                                         | `PriorityBandStore`, `ProjectStore`, `Clock`, `Broadcaster`                                                                                                                  | none after `canEdit` move                                                                                                                                                                                                                                                                                                             |
| Project              | resource; term **Project**                                                    | `projects: ProjectService`                                                                                                                                   | `ProjectStore`, `Clock`, `Broadcaster`, optimizer-availability port                                                                                                          | `canEdit` is shared pure policy and moves to domain; it is not a Project-module API for sibling resources                                                                                                                                                                                                                             |
| Realtime             | feature; capability `realtime`                                                | `replay: ReplayOrchestrator`/`ReplayGraph`; current compatibility values `announcements`, `gatewayBroadcaster`, `replayBuffer`                               | neutral project-event/`Broadcaster` port, `EventLogStore`, `PushTransport`, `Clock`, replay limits, push-failure sink                                                        | `replay.ts`, `ReplayBuffer`, and `GatewayBroadcaster`; `OptimizerTriggerBroadcaster` remains root-private wiring. Realtime implements/consumes the neutral event port; it does not own the event union or Plan commands' collector                                                                                                    |
| Bounded replay sweep | feature; capability `bounded-replay-sweep`                                    | `retention: RetentionTimer`; `retentionSweep` contract                                                                                                       | `EventLogStore`, `PlanEventStore`, `Intervals`, clock/read limits and callbacks                                                                                              | `retention-job.ts`; timer is the lifecycle adapter within the module and its process start/stop stays owned by boot                                                                                                                                                                                                                   |
| Saved plans          | feature; capability `wbs-domain`                                              | one `SavedPlans` feature contract for save/list/read/compare/rename/delete; `savedPlans` and `plans` remain aliases of that one instance during migration    | `SavedPlanCaptureStore`, `SavedPlanStore`, `Digest`, `Scheduler`, id/time sources, Project reader, neutral `Broadcaster` port                                                | The feature owns project/admission checks and publishes after successful save/rename/delete; delivery only validates/maps HTTP. `SavedPlanService`, integrity and captured-schedule policy become private collaborators; default-name/input/quota/schedule-body algorithms move to domain; wire or delete `saved-plan-retry.ts` first |
| Step                 | resource; term **Step**                                                       | `steps: StepService`                                                                                                                                         | `StepStore`, `ProjectStore`, `Clock`, `Broadcaster`                                                                                                                          | assumed-assignee/name rules move to domain; `canEdit` move                                                                                                                                                                                                                                                                            |
| Work item            | resource; term **Work item**                                                  | `workItems: WorkItemService`                                                                                                                                 | its existing store ports, `ProjectStore`, `DirectoryStore`, `CapacityStore`, `PriorityBandStore`, `SubtreeStore`, `CommandJournalStore`, `Broadcaster`, `Scheduler`, `Clock` | roll-up, dependency, compensation, numbering and command normalization that are pure move to domain; `canEdit` move                                                                                                                                                                                                                   |

The nine resource terms above are present verbatim in `CONTEXT.md`. Working plan
is the ninth classified core resource but is private to Plan commands, so it
does not produce a standalone module/export.

Binding audit:

- Present and usable: `authentication`, `plan-import` (accepted delta),
  `realtime`, `bounded-replay-sweep`, `scheduler-runtime-port`, and the existing
  `wbs-domain` requirement groups for Plan history, Plan commands, and Saved plans.
- Terms present: Project, Work item, Step, Directory, Capacity, Priority band,
  Calendar marker, Plan document, and Working plan.
- Corrective, with no user decision: change Plan history, Plan commands, and
  Saved plans from `core-lib-extraction` to existing `wbs-domain`; change Plan
  import from `unspecified` to `plan-import`. K9 does not require one capability
  per feature, and the accepted artifacts do not establish a finer granularity
  rule. A future rule may split them through its own OpenSpec change; 040.6 does
  not block on or invent that work.

## Backend optimization and repository ownership

| Responsibility        | Kind/binding                                 | Exports                                                                                                                                                                                       | Requirements/private members                                                                                                                                                                                                              | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimization          | feature; capability `scheduler-runtime-port` | `optimizer: OptimizationCoordinator`; narrow read/input-changed/stop contract; neutral `ReservedSpawnRequest`/`ReservedSolverChild`/`ReservedSpawner` port and optimization event projections | queue/generation/cache/slot/outcome repository ports, cache-key hash port, plan-input/enabled readers, neutral recorded-project-event publisher, clock/id/timer/error ports; `OptimizedScheduleReader` and solver-child lifecycle private | Remove direct `Drizzle`, repository functions/types, and `@wbs/store-sqlite` ownership. Import `SolverObjectiveName` from `@wbs/domain`; use neutral `ProjectEvent`, with the three optimization projections owned by this module contract; inject `scheduleInputHash` through the cache-key port because SHA-256 is adapter-owned. Domain owns solver request/outcome evaluation. `optimizer-wiring.ts` stays root wiring. |
| Local solver launcher | repository                                   | installed/runtime version probes and `spawnSolverLauncher` adapter contracts                                                                                                                  | injected process/spawn/fs seams                                                                                                                                                                                                           | Standalone adapter module used by local/dev entrypoints. It is not part of the optimization feature module.                                                                                                                                                                                                                                                                                                                 |
| Supervisor            | repository                                   | module exports the already-adapted `ReservedSpawner` provider; `connectSolverSupervisor` remains a TypeScript diagnostic/test surface                                                         | Unix socket connector, protocol types, and neutral Optimization spawn/child port types                                                                                                                                                    | `solver-supervisor-client.ts` is the repository service. Reclassify `solver-supervisor-spawner.ts` as adapter-private support in this same module: it translates the feature port to the wire request and returned attempt, has one production caller, and is not composition logic. Image/orphan scripts may retain the direct client export without making the mapper a second DI service.                                |

## Required no-sideways preparations

1. Split `broadcast.ts` by owner before any module move. Move `ProjectEvent`,
   `Broadcaster`, and `subscriptionFor` to a neutral application event/port
   location. Every resource/feature publishes through that port without
   importing Realtime. Move `AnnouncementCollector` and `HeldAnnouncement` into
   Plan commands as batch-private support. Realtime's `GatewayBroadcaster`
   implements the neutral port. Optimization event projections use the neutral
   `ProjectEvent`, so Optimization never imports Realtime.
2. Move `canEdit` from `project.service.ts` to the domain library, taking only
   the structural ownership fields it needs rather than the application port's
   `Project` type. Calendar
   marker, Capacity, Priority band, Step, Work item, and `savePlan` currently
   import it from the Project resource. The move preserves the function and
   breaks six resource/feature paths without an event or service dependency.
3. Change Plan document's marker read from `CalendarMarkerService` to its
   repository/owner-neutral read port. It only calls `list`; retaining the
   service type creates a resource-to-resource dependency.
4. Keep `runCommandBatch` with Plan commands, `replay` with Realtime, and
   `savePlan` with Saved plans. Separate modules would be same-kind feature
   imports. Their actor/principal types must move to a neutral contract/domain
   location rather than importing Authentication sideways.
5. `retention-sweep.ts` also imports `AuthenticatedUser` only as a union member.
   Move principal types to the endpoint/domain contract; Bounded replay sweep
   must not import Authentication.
6. Root composition supplies the optimizer event callback and realtime
   broadcaster. Neither feature imports the other. The callback remains a
   published-event boundary.
7. Move the Optimization spawn/child interfaces out of
   `optimization-coordinator.ts` into the module's neutral contract. Keep the
   Supervisor request/attempt mapper private beside the Supervisor client, and
   amend its classification from repository service to adapter-private support.
   Composition only selects/configures that provider.
8. Import `SolverObjectiveName` directly from `@wbs/domain`; remove the
   repository-schema type path. Replace the repository hash shim import with an
   injected cache-key port backed by SQLite's existing SHA-256 implementation.

Public-symbol rule: every exported declaration in a ledger file follows that
file's owner, while the root barrel temporarily re-exports it from the new
location. Three current cross-owner re-exports need explicit correction:
`ProjectEvent`/`Broadcaster` become neutral application contracts;
`ScheduleOptimizedEvent`, `ScheduleOptimizationFailedEvent`, and
`ScheduleOptimizationInfeasibleEvent` become Optimization contract projections;
`storeOptimizedOutcomeAndRecord` remains in the SQLite repository adapter
behind an outcome-writer port; and principal/user types used by
non-authentication features move to a neutral contract. No second class or
exception definition may be left in a shim.

## Delivery and composition hazards measured in callers

- `mountedEndpoints` constructs `PlanCommandRunner`; `project.routes.ts`
  constructs `PlanDocumentService`; `smoke.routes.ts` constructs
  `SmokeService`. Move construction to composition. Smoke is pure domain code,
  so delivery may call the moved pure operation without a service module.
- HTTP delivery currently accepts Calendar marker, Capacity, Directory,
  Priority band, Project, Step and Work item resource classes directly. That is
  existing K2 debt. This inventory does not invent feature capabilities or thin
  façades. Module extraction can preserve the public API, but K2 cannot be
  claimed complete until accepted feature contracts/capability bindings replace
  those direct delivery dependencies.
- Authentication delivery currently calls `LoginThrottle` around
  `AuthService.register/login`. Move reservation, failure/success recording, and
  release into the Authentication feature surface. Header/IP extraction,
  password-mode route availability, cookies, and HTTP status mapping remain in
  delivery. A compatibility export of the throttle does not satisfy K2.
- Saved-plan delivery currently checks Project existence, coordinates
  `SavedPlanService`, and publishes `saved_plans_changed` after save, rename,
  and delete. Move all six operation decisions into the `SavedPlans` feature
  contract; delivery retains request validation and `HttpReply` mapping only.
  This is existing Saved plans behavior under `wbs-domain`, not a new
  capability.
- `composeServices` accountful/accountless overloads and returned
  `AccountfulServices`/`AccountlessServices` shapes are compatibility contracts.
  Do not expose an optional throwing auth value in the accountless graph.
- The accountful Authentication provider requires one `users` value satisfying
  both `UserStore` and `OidcIdentityStore`, matching `TransactionalStores`.
  `OidcVerifier` alone is optional; verifier-without-identity-store is
  unrepresentable. Module checks cover password-only (combined store, no
  verifier) and OIDC (combined store plus verifier) graphs. Accountless exports
  neither Authentication nor throttle.
- `servicesOver` is used for the public graph and for every admitted import or
  command batch. A singleton module installation here would leak staged stores
  or announcement collectors between transactions. Install/build the writing
  modules per supplied scope, or retain this direct borrowed subgraph behind a
  typed provider.
- `buildServices` closes over `coordinator` so scheduler reads and plan-change
  callbacks become valid only after composition. Preserve the current loud
  read-before-composition error and test it; do not resolve optimizer lazily
  from a bag inside services.
- `bootBe01` already owns source, retention, optimizer and listener disposal in
  tested order. Core modules borrow them. Nested `withDisposal` registrations
  would double-close or reorder shutdown.
- `plans` and `savedPlans` are aliases of the same `SavedPlans` feature identity,
  which owns one private `SavedPlanService`; `LoginThrottle`, `ReplayBuffer`,
  and broadcaster identities are process-shared. Alias exports must not
  instantiate duplicates.

## Complete classified-file ledger

Every reviewed backend/core classification is covered below. Files named as
groups retain their current symbols through the core barrel until callers move.

### Backend application: 45/45

- **Feature (1):** `optimization-coordinator.ts` → Optimization module.
- **Currently classified repositories (3):** `solver-launcher-process.ts` →
  Local solver launcher; `solver-supervisor-client.ts` → Supervisor repository;
  `solver-supervisor-spawner.ts` → amend to adapter-private support in the same
  Supervisor module before the move.
- **Private support (2):** `optimized-schedule-reader.ts`,
  `solver-child-lifecycle.ts` → Optimization.
- **Domain support (2):** `solver-exit-outcome.ts`, `solver-request-pair.ts` →
  domain library.
- **Composition support (1):** `optimizer-wiring.ts` → backend composition root.
- **Runtime shim (1):** `push-client.ts` → delete after direct
  `@wbs/runtime-portable` imports.
- **Core re-export shims (35):** `assumed-assignee.ts`, `auth.service.ts`,
  `broadcast.ts`, `calendar-marker.service.ts`, `capacity.service.ts`,
  `clean-name.ts`, `compensating.ts`, `dependency.ts`, `directory-usage.ts`,
  `directory.service.ts`, `gateway-broadcaster.ts`, `history.service.ts`,
  `login-throttle.ts`, `optimizer-trigger-broadcaster.ts`, `plan-command.ts`,
  `plan-commands.ts`, `priority-band.service.ts`, `project.service.ts`,
  `replay-buffer.ts`, `replay-orchestrator.ts`, `retention-job.ts`,
  `retention-timer.ts`, `roll-up.ts`, `saved-plan-default-name.ts`,
  `saved-plan-input.ts`, `saved-plan-integrity.ts`, `saved-plan-quota.ts`,
  `saved-plan-retry.ts`, `saved-plan-schedule-body.ts`,
  `saved-plan-schedule.ts`, `saved-plan.service.ts`, `smoke.service.ts`,
  `step.service.ts`, `unit-of-work.ts`, `work-item.service.ts` → delete only
  after all production/tests use the core barrel or final module exports.

### Portable core: 50/50

- **Feature files (10):** `auth.service.ts` → Authentication;
  `history.service.ts` → Plan history; `import.service.ts` → Plan import;
  `plan-commands.ts` + `use-cases/run-command-batch.ts` → Plan commands;
  `replay-orchestrator.ts` + `use-cases/replay.ts` → Realtime;
  `use-cases/retention-sweep.ts` → Bounded replay sweep;
  `saved-plan.service.ts` + `use-cases/save-plan.ts` → Saved plans.
- **Resource files (9):** `calendar-marker.service.ts`, `capacity.service.ts`,
  `directory.service.ts`, `plan-document.ts`, `priority-band.service.ts`,
  `project.service.ts`, `step.service.ts`, `work-item.service.ts` → their
  standalone resource modules; `working-plan.ts` → private in Plan commands.
- **Domain moves (14):** `assumed-assignee.ts`, `clean-name.ts`,
  `command-normalizers.ts`, `compensating.ts`, `dependency.ts`,
  `directory-usage.ts`, `numbered-work-item.ts`, `plan-command.ts`, `roll-up.ts`,
  `saved-plan-default-name.ts`, `saved-plan-input.ts`, `saved-plan-quota.ts`,
  `saved-plan-schedule-body.ts`, `smoke.service.ts`.
- **Event/feature/root support (4):** split `broadcast.ts`: neutral event/port
  contracts plus Plan commands' private collector; `replay-buffer.ts` and
  `gateway-broadcaster.ts` → Realtime; `optimizer-trigger-broadcaster.ts` →
  root-private realtime/optimizer provider wiring.
- **Feature-private support (12):** `command-bindings.ts` → Plan commands;
  `prepare-import.ts` → Plan import; `login-throttle.ts` → Authentication;
  `retention-job.ts`, `retention-timer.ts` → Bounded replay sweep;
  `saved-plan-integrity.ts`, `saved-plan-schedule.ts` → Saved plans;
  `working-plan-directory.ts`, `working-plan-edges.ts`,
  `working-plan-rows.ts`, `working-plan-subtrees.ts`,
  `working-plan-values.ts` → private Working plan implementation.
- **Unresolved support (1):** `saved-plan-retry.ts` → wire or delete under the
  accepted saved-plans obligation before extraction; it has no backend/core
  production caller today.

## Mechanical move and compatibility checklist

1. Resolve all support dispositions first; update `kinds.json` atomically when
   suffix-declared files replace inventory rows.
2. Use `git mv`; keep `@wbs/core` barrel names and the `plans` alias unchanged.
   Deep-import shims may disappear only after caller/test search is empty.
3. Preserve exported refusal/result types and constructor identity. Do not
   duplicate classes across compatibility files; `instanceof` consumers and
   test fixtures must see one definition.
4. Move each current unit test with its owner. Keep SQLite DB tests at the
   adapter boundary and portable composition/browser tests as cross-module
   proofs. Add module `check.ts` and isolated typecheck without replacing those
   behavior tests.
5. Prove private keys cannot be resolved by a host; prove each module missing
   one requirement fails its compile fixture; break one real provider edge and
   watch the production-path test fail.
6. Preserve direct borrowed arguments for request identity, admitted stores,
   collectors and forks. DI scopes do not replace UnitOfWork.
7. Runtime module IDs and later-collision policy remain pending user preference.
   Allocate no new IDs in this work packet. Existing IDs, mappings and
   predecessor rules remain immutable under ADR 0020.

## Decisions and prerequisites before an executable 040.6 packet

- **Only genuine user choice:** runtime segment grammar and the
  later-collision rule for new IDs.
- **Ordinary required implementation:** split `broadcast.ts`; correct the
  Supervisor mapper classification/ownership; extract every Optimization port
  and neutral type named above; enforce the accountful OIDC graph invariant;
  absorb throttle and all saved-plan orchestration/publication into their
  existing feature contracts; resolve `saved-plan-retry.ts`; and update the
  four incorrect K9 inventory values to `wbs-domain`/`plan-import`.
- **Separate K2 specification prerequisite, not a user preference:** direct
  CRUD delivery for Calendar marker, Capacity, Directory, Priority band,
  Project, Step, and Work item still lacks feature owners. Accepted K2 requires
  eventual feature surfaces, but this map cannot invent their capability
  grouping. Until an accepted change supplies/reclassifies them, 040.6 must
  record that full K2 closure remains outside its claim.
