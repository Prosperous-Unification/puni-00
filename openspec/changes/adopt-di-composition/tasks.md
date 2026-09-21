## 1. No-sideways preparations

- [x] 1.1 Move the project write gate to the domain library as `canEditProject`, point Calendar
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
      tracked. Full K2 closure and wiki registration stay outside this change.
