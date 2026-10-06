import type { UnitOfWork } from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import { solverSlot, type SqliteSource } from '@wbs/store-sqlite';

import type { OptimizationRepository } from '../module/optimization/contract';
import { retryMutationIn, retryPreflightIn } from '../repository/optimization';

/** Owns eligible Retry, global reclaim, accepted audit and fan-out in one source writer turn. */
export function createRetryReservationOwner(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationRepository['admitRetry'] {
  return (ask) =>
    uow.run(async (scope) => {
      // Proof: moving capture ahead of this preflight made a foreign mounted
      // Retry invoke capture once despite its typed not_found refusal.
      const preflight = db.transaction((tx) => retryPreflightIn(tx, ask));
      if (preflight.kind === 'refused')
        return { commit: true, value: { decision: preflight.decision, envelopes: [] } };

      const capture = scope.fanoutCapture;
      // Proof: bypassing this guard changed the mounted missing-capability
      // refusal into an incidental undefined-property error before any write.
      if (capture?.resolveLifecycleOwner === undefined)
        throw new Error('Retry reservation lacks borrowed ownership and capture');
      const ownership = new Map<string, string>();
      for (const { projectId } of db
        .select({ projectId: solverSlot.projectId })
        .from(solverSlot)
        .all()) {
        // Proof: retaining only the first old-slot organization lost D's
        // durable C-cause event in the mounted three-organization Retry test.
        if (ownership.has(projectId)) continue;
        const owner = await capture.resolveLifecycleOwner(projectId);
        if (owner.kind === 'scoped') ownership.set(projectId, owner.organizationId);
      }
      const before = new Map<string, CapturedFanout>();
      for (const organizationId of new Set(ownership.values()))
        before.set(organizationId, await capture.capture(organizationId));

      const finished = new Set<string>();
      // Proof: injecting COMMIT/BEGIN here left deleted A/C and X's new slot
      // after the second real event insert failed; the full rollback snapshot failed.
      const decision = db.transaction((tx) =>
        retryMutationIn(tx, ask, preflight, ({ projectId }) => finished.add(projectId)),
      );
      const envelopes: CommittedProjectEvent[] = [];
      for (const [organizationId, oldObservation] of before) {
        // Proof: omitting these actual finished causes lost B's event when
        // Retry retired A's selected contract but A's local facts stayed equal.
        const causes = [...finished].filter(
          (projectId) => ownership.get(projectId) === organizationId,
        );
        const after = await capture.capture(organizationId);
        // Proof: omitting this record call let installed Retry delete A
        // without B's required durable recipient event.
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
      // Proof: dropping envelopes for closed Retry still committed B's event
      // but lost its installed gateway delivery after A was reclaimed.
      return { commit: true, value: { decision, envelopes } };
    });
}
