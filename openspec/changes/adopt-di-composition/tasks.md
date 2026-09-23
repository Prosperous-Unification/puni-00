## 1. No-sideways preparations

- [x] 1.1 Move the project write gate to the domain library as `canEditProject`, point Calendar
      marker, Capacity, Priority band, Step, Work item and `savePlan` at it, and keep `canEdit` as a
      compatibility export of the Project resource. Proof: `libs/wbs/domain/domain/src/project-ownership.test.ts`;
      negative: `announces nothing for a write it refused` in
      `libs/wbs/application/core/src/service/broadcast.test.ts` with the rule forced to `true`.
- [ ] 1.2 Split `broadcast.ts`: `ProjectEvent`, `Broadcaster` and `subscriptionFor` to a neutral
      application event port; `AnnouncementCollector` and `HeldAnnouncement` into Plan commands.
      Negative: a resource publishing through the port with the port unregistered.
      Port landed 2026-09-22 as `libs/wbs/application/core/src/ports/project-event.ts`, with
      `ports/event-port-boundaries.test.ts` as its checked rule. The collector stays in
      `service/broadcast.ts` and moves with 5.2: `import.service.ts:148` builds one too, so Plan
      commands cannot own it privately before that module exists without a K6 feature-to-feature edge.
- [x] 1.3 Change Plan document's marker read to an owner-neutral read port and move
      `CalendarMarkerListOutcome` out of the Calendar marker service file. Landed 2026-09-22 as
      `libs/wbs/application/core/src/ports/calendar-marker-read.ts`, with `CalendarMarkerReader` as the
      contract `PlanDocumentServiceOptions.markers` now names; the service keeps every name as a
      compatibility re-export. Checked by `ports/sideways-type-boundaries.test.ts`.
- [x] 1.4 Move the actor and principal types `runCommandBatch`, `replay`, `savePlan` and
      `retention-sweep.ts` share to a neutral contract location so none of them imports Authentication.
      Landed 2026-09-22: `AuthenticatedUser` and `InternalIdentity` are declared in
      `libs/wbs/domain/contracts/src/principal.ts`. `service/auth.service.ts` re-exports
      `AuthenticatedUser` only; `http/endpoint.ts` re-exports both and keeps `Identity` built from them.
      `service/retention-timer.ts` moved with the use cases. Checked by
      `ports/sideways-type-boundaries.test.ts`.
- [ ] 1.5 Move the Optimization spawn and child interfaces into the Optimization contract; keep the
      Supervisor request/attempt mapper private beside the Supervisor client and amend its
      classification to adapter-private support.
- [ ] 1.6 Import `SolverObjectiveName` from `@wbs/domain` and replace the repository hash shim with
      an injected cache-key port backed by SQLite's existing SHA-256. First half landed 2026-09-22:
      `apps/wbs/be-01/src/service/optimization-coordinator.ts` and `…/optimized-plan-read.test.ts` take
      `SolverObjectiveName` from `@wbs/domain`, and the coordinator takes `ProjectEvent` from `@wbs/core`
      rather than through `service/broadcast.ts`. No rule prevents the repository-schema path returning:
      be-01 has no type-identity boundary check, and the Optimization module of 3.6 owns that rule. The
      cache-key port is still owed.
- [ ] 1.7 Wire or delete `saved-plan-retry.ts` under the accepted saved-plans obligation.
- [x] 1.8 Correct the four `kinds.json` capability values to `wbs-domain` and `plan-import`. Done
      2026-09-22 over **five** entries, not four: Plan history's row became a shim under 2.1, and Plan
      commands and Saved plans each carry two rows (the service and its use case). `wbs-domain` is a
      requirement group of 123 archived deltas and is not a synced main spec — `openspec spec list` does
      not name it — so the value is checkable against those deltas only; syncing it is its own change.

## 2. The first sealed module

- [x] 2.1 Extract Plan history as the pattern-setter: module directory, contract, labelled
      `module.ts`, composition check, and the compatibility re-export at the former service path.
      Proof: the module's own tests; negatives: the installer leaking its bag, the private binding
      exported, and the label dropped.
- [x] 2.2 Install it from `composeServices` and keep every `@wbs/core` export. Proof: the core and
      be-01 suites unchanged, and `wbs-core:build:portable` still bundling for the browser.

## 3. The remaining process modules

- [x] 3.1 Bounded replay sweep, borrowing the timer `bootBe01` starts and stops. Proof: the
      module's own tests; negatives: the installer leaking its bag, the private
      `retentionOptions` binding exported, and the label dropped. Landed 2026-09-23 as
      `libs/wbs/application/core/src/module/bounded-replay-sweep/`, with
      `use-cases/retention-sweep.ts`, `service/retention-timer.ts` and `service/retention-job.ts`
      kept as compatibility re-export shims, and `docs/code-organization/kinds.json`'s three rows
      for them rewritten in place (95 entries, unchanged) rather than added or removed, because
      `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
- [x] 3.2 Realtime, implementing the neutral event port. Proof: the module's own tests;
      negatives: the installer leaking its bag, either private binding
      (`broadcasterOptions`/`replayOptions`) exported independently, and the label dropped. The
      `Broadcaster` composition question packet E's own section 9 raised is answered by
      measurement, not by a contract change: `GatewayBroadcaster` is exported as the concrete
      class (`apps/wbs/be-01/src/services.ts` needs its `pushRecorded` method, beyond the neutral
      port), and `compose.ts`'s `OptimizerTriggerBroadcaster` decoration is byte-for-byte
      unchanged. Landed 2026-09-23 as `libs/wbs/application/core/src/module/realtime/`, with
      `use-cases/replay.ts`, `service/gateway-broadcaster.ts`, `service/replay-buffer.ts` and
      `service/replay-orchestrator.ts` kept as compatibility re-export shims, and
      `docs/code-organization/kinds.json`'s four rows for them rewritten in place (95 entries,
      unchanged) rather than added or removed, because
      `tools/tool-devsync/src/service-kinds.ts`'s `SERVICE_ROOTS` does not scan `src/module`.
- [ ] 3.3 Saved plans, absorbing project and admission checks and the publication after save,
      rename and delete.
- [x] 3.4 Plan import, with its per-scope factory. Landed 2026-09-23 as
      `libs/wbs/application/core/src/module/plan-import/`, with `service/import.service.ts` and
      `service/prepare-import.ts` kept as compatibility re-export shims, and
      `docs/code-organization/kinds.json`'s two rows for them rewritten in place (95 entries,
      unchanged). The per-scope `ImportServices` factory (`batchServices`) is passed through as a
      requirement, unresolved, exactly as the map's Plan import row names — the module builds no
      resource graph of its own. `ImportService`'s existing K3 debt (direct calls into
      `scope.stores.projects.create`, `priorityBands.replace`, `capacity.set` and
      `subtrees.insertSubtree`) is preserved rather than fixed and is tracked under task 7.4.
      Proof: negatives for the installer leaking its bag, its resolver leaking through the
      returned `ImportService`, the private `importOptions` binding exported, and the label
      dropped. Wiki registration (task 7.5) is **not** landed for this module; see 7.5's own note
      below.
- [x] 3.5 Authentication, absorbing the login throttle and covering the password-only and OIDC
      graphs; the accountless graph exports neither. Landed 2026-09-23 as
      `libs/wbs/application/core/src/module/authentication/`, with `service/auth.service.ts` and
      `service/login-throttle.ts` kept as compatibility re-export shims, and
      `docs/code-organization/kinds.json`'s two rows for them rewritten in place (95 entries,
      unchanged). `loginThrottle` moved off `CommonServices` onto `AccountfulServices`, alongside
      `auth`, so the accountless graph exports neither, watched by a new `@ts-expect-error`
      negative in `compose.test.ts`. The module's own `AuthenticationRequirements['account']`
      requires `users: UserStore & OidcIdentityStore` unconditionally — the map's own "verifier
      without identity store is unrepresentable" requirement — watched by a compile-negative
      fixture; `identities` is always derived from that combined store, never supplied separately.
      `auth` and `loginThrottle` remain two current compatibility values rather than one
      `Authentication` feature contract; the map's own single-contract target and the delivery-side
      throttle-orchestration move (K2) are not this task's scope. Proof: negatives for the
      installer leaking its bag, its resolver leaking through the returned `AuthService`, each of
      the two private bindings (`authOptions`, `throttleOptions`) exported independently, and the
      label dropped. Wiki registration (task 7.5) IS landed for this module; see 7.5's own note
      below.
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
      tracked. Full K2 closure stays outside this change.
- [x] 7.5 Register each sealed module's directory as a wiki index: a `<!-- module-index -->` block
      naming every module file by path, and full membership in `docs/wiki-policy/modules.json`'s
      content-review pilot (a `modules.json` row matched one-to-one by a `policy.json` boundary).
      This keeps a declared mapping row, boundary and README index mutually consistent, checked
      by `apps/wiki/cli/src/policy/pilot-policy.test.ts`'s own production `lint()` call — a
      narrower guarantee than "every sealed DI module has a pilot registration": that stronger
      claim, and label agreement, are both out of this task's scope (packet D's "Deferred: label
      agreement"). Landed 2026-09-22 for Plan history as
      `libs/wbs/application/core/src/module/plan-history/README.md`,
      `docs/wiki-policy/modules.json`'s `module.application.plan-history` row and
      `docs/wiki-policy/policy.json`'s `boundary.application.plan-history`, using a
      `sourceSelector` bound to the pre-move `libs/core/src/service/history.service.ts` this
      directory was extracted from — the same mechanism `boundary.application.use-cases` and
      `boundary.domain.saved-plan` already use for their own renamed directories. Whether the
      index block's `moduleId` names the same label the module's own `buildModule` call seals its
      bag under is explicitly **not** checked by this task: four review rounds against a
      machine-checked version of that specific claim each found a new compile- or runtime-valid
      bypass (040.6 packet D's "Deferred: label agreement"), so that check is a later task with its
      own design, not part of 7.5. Each future module ticks 7.5 for its own directory. Landed
      again 2026-09-23 for Bounded replay sweep as
      `libs/wbs/application/core/src/module/bounded-replay-sweep/README.md`,
      `docs/wiki-policy/modules.json`'s `module.application.bounded-replay-sweep` row and
      `docs/wiki-policy/policy.json`'s `boundary.application.bounded-replay-sweep`, using a
      `sourceSelector` bound to the pre-move `libs/core/src/use-cases/retention-sweep.ts` alone —
      the file `kinds.json` classified `capability: bounded-replay-sweep` before the move.
      `retention-timer.ts` and `retention-job.ts` have no separate baseline entry: 7.5's guarantee
      names one predecessor per module directory, not one per file it holds, exactly as Plan
      history's single `history.service.ts` predecessor did not separately name a
      `contract.ts`/`module.ts`/`check.ts` predecessor either. Landed again 2026-09-23 for
      Realtime as `libs/wbs/application/core/src/module/realtime/README.md`,
      `docs/wiki-policy/modules.json`'s `module.application.realtime` row and
      `docs/wiki-policy/policy.json`'s `boundary.application.realtime`, using a `sourceSelector`
      bound to the pre-move `libs/core/src/use-cases/replay.ts` alone — the file `kinds.json`
      classified `capability: realtime` before the move. `gateway-broadcaster.ts`,
      `replay-buffer.ts` and `replay-orchestrator.ts` have no separate baseline entry, for the same
      reason. Landed again 2026-09-23 for Authentication as
      `libs/wbs/application/core/src/module/authentication/README.md`,
      `docs/wiki-policy/modules.json`'s `module.application.authentication` row and
      `docs/wiki-policy/policy.json`'s `boundary.application.authentication`, using a
      `sourceSelector` bound to the pre-namespacing `libs/core/src/service/auth.service.ts`
      alone — the file `kinds.json` classified `capability: authentication` before the move.
      `login-throttle.ts` has no separate baseline entry, for the same reason as Realtime's own
      satellite files above. This withdraws review round 1's own finding that a multi-file
      module cannot register (040-6 packet E4, first revision): Realtime's own precedent above
      already refutes it, and the second rehearsed experiment's own failure was a missing
      `pilotPaths` overlay entry — packet D's own lesson — not a mechanism limit.
      **Not landed for Plan import (task 3.4).** Every existing pilot boundary under the
      namespaced tree is registered through a `sourceSelector` bound to a pre-namespacing
      predecessor file that existed at the pilot's frozen `sourceRevision`. Both of Plan import's
      own files existed before namespacing — `libs/core/src/service/import.service.ts` introduced
      at commit `56a8776b`, `libs/core/src/service/prepare-import.ts` introduced separately at
      commit `3188852c`, both renamed `R100` into `libs/wbs/application/core/src/service/` at the
      same commit `7c5dee9e` — but all three commits postdate the pilot's frozen `sourceRevision`,
      so the frozen tree still holds neither predecessor and no `sourceSelector` yields even one
      matching entry. The production loader refuses any boundary whose `baselineEntries` come back
      empty (`trusted boundary baseline is empty: <id>`, observed 2026-09-23 against a
      deliberately empty baseline). The module still carries a `<!-- module-index -->` block and a
      `contract.ts`, satisfying the Burokrat rule model's own module-layout requirement
      independently of the pilot: `check-indexes committed` against this packet's own slice-3
      commit reports `module.application.plan-import` among its indexes. Registering the wiki
      boundary needs either the pilot's `sourceRevision` moved forward or a documented exemption
      for a boundary with no predecessor, neither of which this packet decides; see
      `docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md`.
