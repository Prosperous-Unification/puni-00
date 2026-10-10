import { type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import type { CapturedFanout } from '../../ports/fanout-capture-store';
import type { BeforeProjectUpdate, BeforeStepRemoval } from '../../ports/fanout-capture-store';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
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

export function createPlanCommandRunner(source: PlanCommandsSource): PlanCommandRunner {
  return new PlanCommandRunner({
    transaction: commandTransaction(source.uow, source.batchServices, source.committedFanout),
    publicServices: source.publicServices,
    announcements: source.announcements,
  });
}
