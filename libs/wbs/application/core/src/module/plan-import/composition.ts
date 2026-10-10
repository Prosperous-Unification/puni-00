import type { Clock } from '../../ports/clock';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scheduler } from '../../ports/scheduler';
import type { UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import {
  type ImportDecision,
  type ImportedPlan,
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
  committedFanout?: CommittedFanoutDelivery;
}

function importTransaction(
  uow: UnitOfWork,
  graphOver: ImportGraphFactory,
  delivery?: CommittedFanoutDelivery,
): ImportTransaction {
  return {
    run: async <T>(
      actorId: string,
      access: ResourceAccess,
      forbidden: T,
      broadcast: Broadcaster,
      act: (plan: ImportedPlan) => Promise<ImportDecision<T>>,
    ): Promise<T> => {
      const settled = await uow.run<{
        value: T;
        delivery: {
          events: readonly CommittedProjectEvent[];
          transport: CommittedFanoutDelivery;
        } | null;
      }>(async (scope) => {
        if (access.kind === 'legacy') {
          const decision = await act({
            writes: new ImportedPlanResource(scope),
            services: graphOver(scope, broadcast),
          });
          return {
            commit: decision.commit,
            value: { value: decision.value, delivery: null },
          };
        }
        const capture = scope.fanoutCapture;
        // Proof: omitting authorizeImport from the borrowed source made
        // the mounted scoped import answer 500 before any capture/write.
        if (capture?.authorizeImport === undefined || delivery === undefined)
          throw new Error('scoped import lacks borrowed authority or fan-out delivery');
        // Proof: moving this below capture invokes the throwing capture spy after
        // a queued membership demotion instead of returning typed forbidden.
        const authority = await capture.authorizeImport(actorId, access);
        if (!authority.ok)
          return { commit: false as const, value: { value: forbidden, delivery: null } };
        const before = await capture.capture(access.scope.organizationId);
        const decision = await act({
          writes: new ImportedPlanResource(scope),
          services: graphOver(scope, broadcast),
        });
        if (!decision.commit)
          return { commit: false as const, value: { value: decision.value, delivery: null } };
        const after = await capture.capture(access.scope.organizationId);
        // Proof: reusing before as after lost the mounted (B,A) event;
        // omitting this record likewise left the durable event list empty.
        const events = await recordCommittedFanout(scope.stores.eventLog, before, after, () =>
          delivery.now(),
        );
        return {
          commit: true as const,
          value: { value: decision.value, delivery: { events, transport: delivery } },
        };
      });
      if (settled.delivery !== null && settled.delivery.events.length > 0)
        await settled.delivery.transport.deliverCommitted(settled.delivery.events);
      return settled.value;
    },
  };
}

export function createImportService(source: PlanImportSource): ImportService {
  return new ImportService({
    clock: source.clock,
    scheduler: source.scheduler,
    announcements: source.announcements,
    transaction: importTransaction(source.uow, source.batchServices, source.committedFanout),
  });
}
