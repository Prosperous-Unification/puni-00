import type { UnitOfWork } from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import { reserveSolverSlot, solverSlot, type SqliteSource } from '@wbs/store-sqlite';

import type { OptimizationRepository } from '../module/optimization/contract';
import { reservationOf } from '../repository/optimization';

/** Owns initial admission's global reclaim, victim comparison and event rows in one writer turn. */
export function createInitialReservationOwner(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationRepository['reserveSlot'] {
  return (request) =>
    uow.run(async (scope) => {
      const capture = scope.fanoutCapture;
      // Proof: removing this guard changed the mounted missing-capability
      // refusal into an incidental property error before any victim write.
      if (capture?.resolveLifecycleOwner === undefined)
        throw new Error('initial reservation lacks borrowed ownership and capture');

      const ownership = new Map<string, string>();
      for (const { projectId } of db
        .select({ projectId: solverSlot.projectId })
        .from(solverSlot)
        .all()) {
        if (ownership.has(projectId)) continue;
        const owner = await capture.resolveLifecycleOwner(projectId);
        if (owner.kind === 'scoped') ownership.set(projectId, owner.organizationId);
      }

      const before = new Map<string, CapturedFanout>();
      // Proof: capturing only the first organization erased D's event after
      // reclaiming C while B's event still persisted.
      for (const organizationId of new Set(ownership.values()))
        before.set(organizationId, await capture.capture(organizationId));

      const finished = new Set<string>();
      const admission = reserveSolverSlot(db, request, ({ projectId }) => finished.add(projectId));
      const envelopes: CommittedProjectEvent[] = [];
      for (const [organizationId, oldObservation] of before) {
        // Proof: dropping finished causes lost B's selected-contract event
        // while A remained present; this only addresses actual finishes.
        const causes = [...finished].filter(
          (projectId) => ownership.get(projectId) === organizationId,
        );
        const after = await capture.capture(organizationId);
        // Proof: omitting recording deleted A but left B's durable range empty.
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
      return {
        // Proof: returning commit:false left A's expired slot intact and
        // discarded the new reservation and event rows together.
        commit: true,
        value: { decision: reservationOf(admission, request.budgetMs), envelopes },
      };
    });
}
