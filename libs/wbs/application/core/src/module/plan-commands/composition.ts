import { credentialPinOf } from '@wbs/contracts';

import type { CommandAccess, CommandCaller } from '../../ports/command-access';
import type { DependencyContext } from '../../ports/dependency-context';
import { type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import type { CapturedFanout } from '../../ports/fanout-capture-store';
import type { BeforeProjectUpdate, BeforeStepRemoval } from '../../ports/fanout-capture-store';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Digest } from '../../ports/runtime';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import { createDependencyContext } from '../../service/dependency-context';
import { isClaimAdmin } from '../work-item/claims';
import {
  type AdmittedGraphFactory,
  AdmittedScope,
  type CommandAdmission,
  type CommandRepair,
  type CommandTransaction,
} from './admitted-scope.resource';
import type { AdmittedWriteDecision } from './admitted-write';
import {
  type AdmittedServices,
  admittedWrites,
  type AdmittedWriteTransaction,
} from './admitted-write';
import type { PlanCommandServices } from './plan-command-graph';
import type { AuthorityRefusal } from './plan-commands.feature';
import { PlanCommandRunner } from './plan-commands.feature';
import {
  type RuntimeAdmission,
  type RuntimeAdmissionIdentity,
  type RuntimeDecision,
  RuntimeReceiver,
  type RuntimeTransaction,
} from './runtime-authority';
import { RuntimeCommands } from './runtime-commands.resource';
import {
  type RuntimeContext,
  type RuntimeObservation,
  type RuntimeReadRefusal,
  RuntimeState,
} from './runtime-state';
import { createWorkingPlan } from './working-plan.resource';

/** Source capabilities retained by composition, outside the runner's options. */
export interface PlanCommandsSource {
  /** Revalidates the original request evidence inside the admitted writer turn. */
  commandAccess: CommandAccess;
  batchServices: AdmittedGraphFactory<PlanCommandServices>;
  publicServices: PlanCommandServices;
  uow: UnitOfWork;
  announcements: Broadcaster;
  /** Required whenever the installed source captures shared bookings or dependency components. */
  committedFanout?: CommittedFanoutDelivery;
}

/** Raw route-write requirements accepted only at composition. */
export interface AdmittedWriteSource {
  /** Revalidates the original request evidence inside the admitted writer turn. */
  commandAccess: CommandAccess;
  uow: UnitOfWork;
  batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    dependencies: DependencyContext,
    beforeProjectUpdate?: BeforeProjectUpdate,
    beforeStepRemoval?: BeforeStepRemoval,
  ) => AdmittedServices;
  announcements: Broadcaster;
  committedFanout?: CommittedFanoutDelivery;
}

export function commandTransaction(
  uow: UnitOfWork,
  factory: AdmittedGraphFactory<PlanCommandServices>,
  commandAccess: CommandAccess,
  committedFanout?: CommittedFanoutDelivery,
): CommandTransaction {
  return {
    run: async (act, settled) => {
      let committed: readonly CommittedProjectEvent[] = [];
      const value = await uow.run(async (rawScope) => {
        let observing = true;
        const assertObservation = () => {
          if (!observing) throw new Error('command dependency observation is closed');
        };
        try {
          const scope = new AdmittedScope(rawScope);
          const captureState: { before: CapturedFanout | null; organizationId: string | null } = {
            before: null,
            organizationId: null,
          };
          const addressedCauses: string[] = [];
          const resources: CommandAdmission = {
            authorizeRuntime: (identity) => authorizeRuntimeScope(rawScope, identity),
            releaseExpiredLeases: async (projectId, broadcast) => {
              // Proof: removing this assertion changed the escaped lifecycle negative's
              // refusal to a borrowed snapshot error (2026-10-23).
              assertObservation();
              const capture = rawScope.fanoutCapture;
              const resolveOwner = capture?.resolveLifecycleOwner;
              // Proof: removing this refusal reached the write graph in both missing
              // capture and missing owner integration negatives (2026-10-23).
              if (resolveOwner === undefined && rawScope.stores.livePlans !== undefined)
                throw new Error('claim lease lifecycle ownership is missing');
              if (capture !== undefined && resolveOwner !== undefined) {
                const owner = await resolveOwner(projectId);
                assertObservation();
                if (owner.kind === 'absent') return 0;
                if (owner.kind === 'scoped') {
                  captureState.organizationId = owner.organizationId;
                  captureState.before = await capture.capture(owner.organizationId);
                  assertObservation();
                  // Proof: removing this prewrite refusal reached the throwing write
                  // graph in the missing delivery integration negative (2026-10-23).
                  if (
                    (captureState.before.observation.mode === 'shared' ||
                      captureState.before.dependency !== null) &&
                    committedFanout === undefined
                  )
                    throw new Error('committed fan-out delivery is missing');
                }
              }
              const workingPlan = createWorkingPlan(rawScope, projectId);
              const dependencies = createDependencyContext(
                rawScope.stores,
                {
                  projectId: null,
                  actorId: 'claim-lease-sweep',
                  access: LEGACY_ACCESS,
                  admission: NO_ADMISSION,
                },
                assertObservation,
                { kind: 'raw' },
              );
              try {
                const graph = factory(
                  { stores: workingPlan.stores },
                  broadcast,
                  NO_ADMISSION,
                  dependencies.context,
                );
                const released = await graph.workItems.releaseExpiredLeases(projectId);
                assertObservation();
                // Proof: omitting this cause lost both connected recipients despite
                // releasing the claim in the mounted integration test (2026-10-23).
                if (released > 0) addressedCauses.push(projectId);
                return released;
              } finally {
                dependencies.close();
                workingPlan.close();
              }
            },
            // Proof: pre-resolving this same source authority before writer admission
            // changed queued membership's HTTP403 error from not_a_member to forbidden;
            // native revocation reached the fan-out tripwire (HTTP500 instead of 403).
            // Qualified-lookup race tests, 2026-10-22.
            resolveAccess: (caller) => commandAccess.resolve(caller),
            refuseOutsideScope: async (...args) => {
              const refusal = await scope.refuseOutsideScope(...args);
              if (refusal !== null) return refusal;
              captureState.organizationId = args[2].organizationId;
              const capture = rawScope.fanoutCapture;
              if (capture === undefined) {
                // Legacy fixtures have no live-plan source; a shared production source must fail closed.
                if (rawScope.stores.livePlans !== undefined)
                  throw new Error('shared fan-out capture is missing');
                return null;
              }
              captureState.before = await capture.capture(captureState.organizationId);
              // Proof: disabling dependency eligibility made the isolated module missing-delivery negative resolve successfully instead of refusing.
              if (
                (captureState.before.observation.mode === 'shared' ||
                  captureState.before.dependency !== null) &&
                committedFanout === undefined
              )
                throw new Error('committed fan-out delivery is missing');
              return null;
            },
            listCrossReferenceKinds: (...args) => scope.listCrossReferenceKinds(...args),
            openCommandGraph: (projectId, broadcast, authority) => {
              assertObservation();
              if (projectId !== null && projectId !== authority.projectId)
                throw new Error('retained project does not match dependency owner');
              const workingPlan =
                projectId === null ? undefined : createWorkingPlan(rawScope, projectId);
              const dependencies = createDependencyContext(
                rawScope.stores,
                authority,
                assertObservation,
                workingPlan === undefined
                  ? { kind: 'raw' }
                  : { kind: 'owner', refresh: workingPlan.refreshRows },
              );
              try {
                return {
                  services: factory(
                    workingPlan === undefined ? rawScope : { stores: workingPlan.stores },
                    broadcast,
                    authority.admission,
                    dependencies.context,
                  ),
                  close: () => {
                    dependencies.close();
                    workingPlan?.close();
                  },
                };
              } catch (cause) {
                dependencies.close();
                workingPlan?.close();
                throw cause;
              }
            },
          };
          const decision = await act(resources);
          if (decision.commit) {
            if (captureState.before !== null && captureState.organizationId !== null) {
              const capture = rawScope.fanoutCapture;
              if (capture === undefined) throw new Error('shared fan-out capture disappeared');
              const after = await capture.capture(captureState.organizationId);
              // Proof: omitting dependency eligibility lost both isolated runtime recipients in the mixed replay test (R10, 2026-10-26).
              if (
                captureState.before.observation.mode === 'shared' ||
                captureState.before.dependency !== null
              ) {
                if (committedFanout === undefined)
                  throw new Error('committed fan-out delivery is missing');
                // Proof: deferring this record until after the UoW returned let
                // a second-recipient insert failure leave command, history and
                // first event/sequence persisted instead of rolling back.
                committed = await recordCommittedFanout(
                  rawScope.stores.eventLog,
                  captureState.before,
                  after,
                  () => committedFanout.now(),
                  addressedCauses,
                );
              }
            }
            return decision;
          }
          if (decision.afterRollback === undefined) return { commit: false, value: decision.value };
          return {
            commit: false,
            value: decision.value,
            afterRollback: async (repairScope: Scope) => {
              const repair: CommandRepair = {
                discardEntry: async (entryId) => {
                  // Proof: omitting this discard made the next undo remain stale instead of nothing_to_undo (compose.test.ts).
                  await repairScope.stores.journal.discard(entryId);
                },
              };
              await decision.afterRollback?.(repair);
            },
          };
        } finally {
          // Proof: command-observation-close bypass failed `command observation closes escaped capabilities on success`'s selected assertion
          // (actual SQLite boundary; watched 2026-10-22).
          // Proof: bypassing this close returned usable endpoint evidence after a successful SQLite command (R10, 2026-10-26).
          observing = false;
        }
      });
      // Proof: omitting this settlement callback kept a scoped execute/undo/redo
      // grant live while a second writer entered during held recipient delivery.
      settled?.();
      if (committed.length > 0) {
        if (committedFanout === undefined) throw new Error('committed fan-out delivery is missing');
        await committedFanout.deliverCommitted(committed);
      }
      return value;
    },
  };
}

/** Composition fixes NO_ADMISSION before a route-write feature sees its graph. */
export function createAdmittedWrites(source: AdmittedWriteSource) {
  const transaction: AdmittedWriteTransaction = {
    run: async <T>(
      projectId: string,
      caller: CommandCaller,
      broadcast: Broadcaster,
      act: (
        services: AdmittedServices,
        access: ResourceAccess,
      ) => Promise<AdmittedWriteDecision<T>>,
    ) => {
      let committed: readonly CommittedProjectEvent[] = [];
      const value = await source.uow.run<T | AuthorityRefusal>(async (scope) => {
        // Proof: using request access instead returned 200 for queued project revocation in the mounted current-authority matrix.
        const resolved = await source.commandAccess.resolve(caller);
        if (!resolved.ok) return { commit: false, value: resolved };
        const captureState: { before: CapturedFanout | null; organizationId: string | null } = {
          before: null,
          organizationId: null,
        };
        const beforeProjectUpdate: BeforeProjectUpdate = async (projectId, actorId, access) => {
          if (access.kind === 'legacy') return { ok: true };
          const capture = scope.fanoutCapture;
          if (capture === undefined) {
            if (scope.stores.livePlans !== undefined)
              throw new Error('admitted fan-out capture is missing');
            return { ok: true };
          }
          // Proof: bypassing this borrowed-store recheck sent a queued-demoted
          // project edit into broken capture (500 instead of typed 403).
          const admitted = await capture.authorizeProjectUpdate(projectId, actorId, access);
          if (!admitted.ok) return admitted;
          captureState.organizationId = access.scope.organizationId;
          captureState.before = await capture.capture(access.scope.organizationId);
          if (
            (captureState.before.observation.mode === 'shared' ||
              captureState.before.dependency !== null) &&
            source.committedFanout === undefined
          )
            throw new Error('admitted fan-out delivery is missing');
          return { ok: true };
        };
        const beforeStepRemoval: BeforeStepRemoval = async (projectId, actorId, access) => {
          if (access.kind === 'legacy') return { ok: true };
          const capture = scope.fanoutCapture;
          if (capture === undefined) {
            if (scope.stores.livePlans !== undefined)
              throw new Error('bare step fan-out capture is missing');
            return { ok: true };
          }
          // Proof: replacing this fresh borrowed-store check with success let a
          // stale member scope remove a step after DB demotion (ok:true, expected forbidden).
          const admitted = await capture.authorizeStepRemoval(projectId, actorId, access);
          if (!admitted.ok) return admitted;
          captureState.organizationId = access.scope.organizationId;
          captureState.before = await capture.capture(access.scope.organizationId);
          if (
            (captureState.before.observation.mode === 'shared' ||
              captureState.before.dependency !== null) &&
            source.committedFanout === undefined
          )
            throw new Error('bare step fan-out delivery is missing');
          return { ok: true };
        };
        // Proof: independently omitting project or bare-step hook made mounted
        // fan-out receive 3/4 or 2/3 recipient rows; both faults were watched.
        const dependencies = createDependencyContext(
          scope.stores,
          {
            projectId,
            actorId: caller.kind === 'human' ? caller.principal.id : caller.actorId,
            access: resolved.access,
            admission: NO_ADMISSION,
          },
          () => undefined,
          { kind: 'raw' },
        );
        try {
          const decision = await act(
            source.batch(
              scope,
              broadcast,
              NO_ADMISSION,
              dependencies.context,
              beforeProjectUpdate,
              beforeStepRemoval,
            ),
            resolved.access,
          );
          if (
            decision.commit &&
            captureState.before !== null &&
            captureState.organizationId !== null
          ) {
            const capture = scope.fanoutCapture;
            if (capture === undefined) throw new Error('admitted fan-out capture disappeared');
            const after = await capture.capture(captureState.organizationId);
            if (
              captureState.before.observation.mode === 'shared' ||
              captureState.before.dependency !== null
            ) {
              const delivery = source.committedFanout;
              if (delivery === undefined) throw new Error('admitted fan-out delivery is missing');
              committed = await recordCommittedFanout(
                scope.stores.eventLog,
                captureState.before,
                after,
                () => delivery.now(),
              );
            }
          }
          return decision;
        } finally {
          dependencies.close();
        }
      });
      if (committed.length > 0) {
        if (source.committedFanout === undefined)
          throw new Error('admitted fan-out delivery is missing');
        // Proof: moving this delivery into the admitted writer made the mounted observer see Upstream instead of Committed name and zero successful deliveries.
        await source.committedFanout.deliverCommitted(committed);
      }
      return value;
    },
  };
  return admittedWrites({ transaction, announcements: source.announcements });
}

/** Ordinary-only compositions may omit digest; runtime mutation requires the host Digest. */
export function createPlanCommandRunner(
  source: PlanCommandsSource,
  digest?: Digest,
): PlanCommandRunner {
  return new PlanCommandRunner({
    transaction: commandTransaction(
      source.uow,
      source.batchServices,
      source.commandAccess,
      source.committedFanout,
    ),
    digest,
    publicServices: source.publicServices,
    announcements: source.announcements,
  });
}

/** Exposes only coherent runtime reads; no public store or write graph escapes composition. */
export function createRuntimeState(uow: UnitOfWork): RuntimeState {
  const transaction = runtimeTransaction(uow);
  return new RuntimeState((context) =>
    transaction.run(context, async (admitted) => ({
      commit: true,
      value: await admitted.observe(),
    })),
  );
}

/** Receiver reconciliation shares the same borrowed admission as raw observation. */
export function createRuntimeReceiver(uow: UnitOfWork, digest: Digest): RuntimeReceiver {
  return new RuntimeReceiver(runtimeTransaction(uow), digest);
}

function runtimeTransaction(uow: UnitOfWork): RuntimeTransaction {
  return {
    run<T>(
      context: RuntimeContext,
      act: (admitted: RuntimeAdmission) => Promise<RuntimeDecision<T>>,
    ): Promise<T | RuntimeReadRefusal> {
      // Proof: F17 bypassed this refusal; the legacy read threw instead of returning runtime_scope_unavailable.
      if (context.access.kind === 'legacy')
        return Promise.resolve({ ok: false, reason: 'runtime_scope_unavailable' });
      // Proof: F21 delayed this copy until admission; queued organization mutation redirected the read.
      const organizationId = context.access.scope.organizationId;
      // Proof: F20 delayed these copies; queued project/person/actor/credential tests returned refusals.
      const { projectId, personId } = context;
      const actorId = context.actor.id;
      // Proof: dropping this verified pin made eight machine/consent public read, acquisition and
      // historical lookup cases in runtime-credential-pin.db.test.ts answer 200 instead of 403, 2026-10-22.
      // Proof: RCAP-02 retained the caller alias; all six queued machine/consent read,
      // acquisition and lookup cases in runtime-principal-cap.db.test.ts succeeded instead of forbidden.
      const authentication =
        context.actor.authentication === undefined
          ? undefined
          : { ...context.actor.authentication };
      const credential = credentialPinOf(authentication);
      // Proof: F16 injected real UoW reentrancy; the blocked-writer test returned early with staged row `staged`.
      return uow.run<T | RuntimeReadRefusal>(async (scope) => {
        const admitted = await authorizeRuntimeScope(scope, {
          organizationId,
          projectId,
          personId,
          actorId,
          authentication,
          credential,
        });
        if ('ok' in admitted) return { commit: false, value: admitted };
        return act(admitted);
      });
    },
  };
}

async function authorizeRuntimeScope(
  scope: Scope,
  identity: RuntimeAdmissionIdentity,
): Promise<RuntimeAdmission | RuntimeReadRefusal> {
  const { organizationId, projectId, personId, actorId, authentication, credential } = identity;
  const resolveScope = scope.fanoutCapture?.resolveProjectWriteScope;
  // Proof: F10 removed this diagnostic; the absent-capability negative received an unclassified TypeError.
  if (resolveScope === undefined) throw new Error('runtime project scope resolver is missing');
  // Proof: P3-01 bypassed fresh resolution; a viewer replay received the old accepted authority.
  const admission = await resolveScope(projectId, organizationId, actorId, authentication);
  // Proof: F18 skipped refusal forwarding; the viewer negative threw instead of returning forbidden.
  if (!admission.ok) return admission;
  // Proof: F05 substituted incoming scope; queued admin-to-member demotion incorrectly read an unbound person.
  const access = { kind: 'scoped', scope: admission.scope } as const;
  const people = await scope.stores.directory.listInOrganization('people', organizationId);
  // Proof: F06 bypassed person ownership; a bound foreign person received local facts.
  if (!people.some(({ id }) => id === personId)) return { ok: false, reason: 'unknown_person' };
  // Proof: F07 bypassed binding; an otherwise authorized unbound-person read succeeded.
  if (!isClaimAdmin(access) && (await scope.stores.claims.boundAccountOf(personId)) !== actorId)
    return { ok: false, reason: 'person_not_bound' };
  const pinnedPersonId = await scope.stores.claims.pinnedPersonOf(credential);
  // Proof: F08 bypassed pin comparison; the real pinned admin credential read as another person.
  if (pinnedPersonId !== null && pinnedPersonId !== personId)
    return { ok: false, reason: 'credential_not_for_person' };

  return {
    scope: { organizationId, projectId, personId },
    actorId,
    commands: new RuntimeCommands(scope.stores.runtimeCommands, {
      organizationId,
      projectId,
      personId,
    }),
    access,
    credential,
    listClaims: () => scope.stores.claims.listByProject(projectId),
    findClaim: (claimId) => scope.stores.claims.findById(projectId, claimId),
    observe: async () => {
      const project = await scope.stores.projects.findInOrganization(projectId, organizationId);
      // Proof: F09 removed this diagnostic; the broken borrowed-read test received null dereference instead.
      if (project === null) throw new Error('admitted runtime project disappeared');
      const rows = await scope.stores.workItems.listByProject(projectId);
      const steps = await scope.stores.steps.listByProject(projectId);
      const observation: RuntimeObservation = {
        scope: { organizationId, projectId, personId },
        projectRevision: project.revision,
        workItems: rows.map(({ id, parentId, revision, externalRefs }) => ({
          id,
          parentId,
          revision,
          externalRefs: externalRefs.map(({ id, systemId, url, name }) => ({
            id,
            systemId,
            url,
            name,
          })),
        })),
        steps: steps.map(({ id, code, position }) => ({ id, code, position })),
      };

      return observation;
    },
  };
}
