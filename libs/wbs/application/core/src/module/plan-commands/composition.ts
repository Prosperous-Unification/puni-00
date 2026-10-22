import type { CommandAccess, CommandCaller } from '../../ports/command-access';
import type { DependencyContext } from '../../ports/dependency-context';
import { type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import type { CapturedFanout } from '../../ports/fanout-capture-store';
import type { BeforeProjectUpdate, BeforeStepRemoval } from '../../ports/fanout-capture-store';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import { createDependencyContext } from '../../service/dependency-context';
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
          const resources: CommandAdmission = {
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

export function createPlanCommandRunner(source: PlanCommandsSource): PlanCommandRunner {
  return new PlanCommandRunner({
    transaction: commandTransaction(
      source.uow,
      source.batchServices,
      source.commandAccess,
      source.committedFanout,
    ),
    publicServices: source.publicServices,
    announcements: source.announcements,
  });
}
