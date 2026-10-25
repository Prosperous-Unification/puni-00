import { credentialPinOf } from '@wbs/contracts';

import { type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import type { CapturedFanout } from '../../ports/fanout-capture-store';
import type { BeforeProjectUpdate, BeforeStepRemoval } from '../../ports/fanout-capture-store';
import type { Broadcaster } from '../../ports/project-event';
import type { Digest } from '../../ports/runtime';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import { isClaimAdmin } from '../work-item/claims';
import {
  type AdmittedGraphFactory,
  AdmittedScope,
  type CommandAdmission,
  type CommandRepair,
  type CommandTransaction,
} from './admitted-scope.resource';
import {
  type AdmittedServices,
  admittedWrites,
  type AdmittedWriteTransaction,
} from './admitted-write';
import type { PlanCommandServices } from './plan-command-graph';
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
  batchServices: AdmittedGraphFactory<PlanCommandServices>;
  publicServices: PlanCommandServices;
  uow: UnitOfWork;
  announcements: Broadcaster;
  /** Required whenever the installed source can capture a shared organization. */
  committedFanout?: CommittedFanoutDelivery;
}

/** Raw route-write requirements accepted only at composition. */
export interface AdmittedWriteSource {
  uow: UnitOfWork;
  batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    beforeProjectUpdate?: BeforeProjectUpdate,
    beforeStepRemoval?: BeforeStepRemoval,
  ) => AdmittedServices;
  announcements: Broadcaster;
  committedFanout?: CommittedFanoutDelivery;
}

export function commandTransaction(
  uow: UnitOfWork,
  factory: AdmittedGraphFactory<PlanCommandServices>,
  committedFanout?: CommittedFanoutDelivery,
): CommandTransaction {
  return {
    run: async (act, settled) => {
      let committed: readonly CommittedProjectEvent[] = [];
      const value = await uow.run(async (rawScope) => {
        const scope = new AdmittedScope(rawScope);
        const captureState: { before: CapturedFanout | null; organizationId: string | null } = {
          before: null,
          organizationId: null,
        };
        const resources: CommandAdmission = {
          authorizeRuntime: (identity) => authorizeRuntimeScope(rawScope, identity),
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
            if (captureState.before.observation.mode === 'shared' && committedFanout === undefined)
              throw new Error('committed fan-out delivery is missing');
            return null;
          },
          listCrossReferenceKinds: (...args) => scope.listCrossReferenceKinds(...args),
          openCommandGraph: (projectId, broadcast, admission) => {
            const workingPlan =
              projectId === null ? undefined : createWorkingPlan(rawScope, projectId);
            try {
              return {
                services: factory(
                  workingPlan === undefined ? rawScope : { stores: workingPlan.stores },
                  broadcast,
                  admission,
                ),
                close: () => workingPlan?.close(),
              };
            } catch (cause) {
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
            if (captureState.before.observation.mode === 'shared') {
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
              discardEntry: async (entryId, broadcast) => {
                await factory(repairScope, broadcast, NO_ADMISSION).workItems.discardEntry(entryId);
              },
            };
            await decision.afterRollback?.(repair);
          },
        };
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
    run: async (broadcast, act) => {
      let committed: readonly CommittedProjectEvent[] = [];
      const value = await source.uow.run(async (scope) => {
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
            captureState.before.observation.mode === 'shared' &&
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
            captureState.before.observation.mode === 'shared' &&
            source.committedFanout === undefined
          )
            throw new Error('bare step fan-out delivery is missing');
          return { ok: true };
        };
        // Proof: independently omitting project or bare-step hook made mounted
        // fan-out receive 3/4 or 2/3 recipient rows; both faults were watched.
        const decision = await act(
          source.batch(scope, broadcast, NO_ADMISSION, beforeProjectUpdate, beforeStepRemoval),
        );
        if (
          decision.commit &&
          captureState.before !== null &&
          captureState.organizationId !== null
        ) {
          const capture = scope.fanoutCapture;
          if (capture === undefined) throw new Error('admitted fan-out capture disappeared');
          const after = await capture.capture(captureState.organizationId);
          if (captureState.before.observation.mode === 'shared') {
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
      });
      if (committed.length > 0) {
        if (source.committedFanout === undefined)
          throw new Error('admitted fan-out delivery is missing');
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
    transaction: commandTransaction(source.uow, source.batchServices, source.committedFanout),
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
