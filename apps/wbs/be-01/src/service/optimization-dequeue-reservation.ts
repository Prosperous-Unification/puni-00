import type { UnitOfWork } from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import {
  dequeueSolverRequest,
  solverAdmissionStartedAt,
  solverSlot,
  type SqliteSource,
} from '@wbs/store-sqlite';

import type { OptimizationRepository } from '../module/optimization/contract';

/** Owns the entire FIFO dequeue loop, global reclaim and victim events in one source turn. */
export function createDequeueReservationOwner(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationRepository['dequeueRequest'] {
  return (request) =>
    uow.run(async (scope) => {
      const capture = scope.fanoutCapture;
      // Proof: omitting this capability check changed the installed missing
      // binding refusal into an unmodeled property-access error.
      if (capture?.resolveLifecycleOwner === undefined)
        throw new Error('dequeue reservation lacks borrowed ownership and capture');

      const ownership = new Map<string, string>();
      for (const { projectId } of db
        .select({ projectId: solverSlot.projectId })
        .from(solverSlot)
        .all()) {
        if (ownership.has(projectId)) continue;
        // Proof: replacing this borrowed resolver with a guessed organization
        // let a malformed A owner pass the installed queue pump.
        const owner = await capture.resolveLifecycleOwner(projectId);
        if (owner.kind === 'scoped') ownership.set(projectId, owner.organizationId);
      }

      const before = new Map<string, CapturedFanout>();
      // Proof: retaining only the first old-slot organization omitted D's
      // real C-cause event, so the mounted second-event trigger never fired.
      for (const organizationId of new Set(ownership.values()))
        before.set(organizationId, await capture.capture(organizationId));

      const finished = new Set<string>();
      const dequeued = dequeueSolverRequest(db, request, ({ projectId }) =>
        finished.add(projectId),
      );
      // Proof: committing here and reopening the writer before event recording
      // left A/C deleted and the FIFO queue consumed after the second event
      // INSERT failed; the mounted full-state rollback assertion caught it.
      const decision =
        dequeued.kind === 'reserved'
          ? {
              ...dequeued,
              admission: {
                ...dequeued.admission,
                startedAt: solverAdmissionStartedAt(dequeued.admission, dequeued.entry.budgetMs),
              },
            }
          : dequeued;
      const envelopes: CommittedProjectEvent[] = [];
      for (const [organizationId, oldObservation] of before) {
        const causes = [...finished].filter(
          (projectId) => ownership.get(projectId) === organizationId,
        );
        const after = await capture.capture(organizationId);
        // Proof: omitting this recording left the reclaimed A graph committed
        // but removed B's durable event in the capacity-blocked FIFO case.
        envelopes.push(
          ...(await recordCommittedFanout(
            scope.stores.eventLog,
            oldObservation,
            after,
            () => delivery.now(),
            causes,
          )),
        );
      }
      // Proof: discarding envelopes on empty/capacity-full kept B's durable
      // A-cause row but lost its gateway push in both mounted cases.
      return { commit: true, value: { decision, envelopes } };
    });
}
