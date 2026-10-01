import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { Scheduler } from '../../ports/scheduler';
import type { UnitOfWork } from '../../ports/unit-of-work';
import {
  ImportedPlanResource,
  type ImportGraphFactory,
  type ImportTransaction,
} from './imported-plan.resource';
import { ImportService } from './plan-import.feature';

/** Source capabilities used only while composing the import service. */
export interface PlanImportSource {
  clock: Clock;
  scheduler: Scheduler;
  uow: UnitOfWork;
  announcements: Broadcaster;
  batchServices: ImportGraphFactory;
}

function importTransaction(uow: UnitOfWork, graphOver: ImportGraphFactory): ImportTransaction {
  return {
    run: (broadcast, act) =>
      uow.run(async (scope) =>
        act({ writes: new ImportedPlanResource(scope), services: graphOver(scope, broadcast) }),
      ),
  };
}

export function createImportService(source: PlanImportSource): ImportService {
  return new ImportService({
    clock: source.clock,
    scheduler: source.scheduler,
    announcements: source.announcements,
    transaction: importTransaction(source.uow, source.batchServices),
  });
}
