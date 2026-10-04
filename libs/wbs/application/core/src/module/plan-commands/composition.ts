import { NO_ADMISSION } from '../../ports/edit-admission';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
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
}

/** Raw route-write requirements accepted only at composition. */
export interface AdmittedWriteSource {
  uow: UnitOfWork;
  batch: AdmittedGraphFactory<AdmittedServices>;
  announcements: Broadcaster;
}

export function commandTransaction(
  uow: UnitOfWork,
  factory: AdmittedGraphFactory<PlanCommandServices>,
): CommandTransaction {
  return {
    run: (act) =>
      uow.run(async (rawScope) => {
        const scope = new AdmittedScope(rawScope);
        const resources: CommandAdmission = {
          refuseOutsideScope: (...args) => scope.refuseOutsideScope(...args),
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
        if (decision.commit) return decision;
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
      }),
  };
}

/** Composition fixes NO_ADMISSION before a route-write feature sees its graph. */
export function createAdmittedWrites(source: AdmittedWriteSource) {
  const transaction: AdmittedWriteTransaction = {
    run: (broadcast, act) =>
      source.uow.run(async (scope) => act(source.batch(scope, broadcast, NO_ADMISSION))),
  };
  return admittedWrites({ transaction, announcements: source.announcements });
}

export function createPlanCommandRunner(source: PlanCommandsSource): PlanCommandRunner {
  return new PlanCommandRunner({
    transaction: commandTransaction(source.uow, source.batchServices),
    publicServices: source.publicServices,
    announcements: source.announcements,
  });
}
