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
      own design, not part of 7.5. Each future module ticks 7.5 for its own directory.
