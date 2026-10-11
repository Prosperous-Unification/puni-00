import type { UnitOfWork } from '@wbs/core';
import {
  type CommittedFanoutDelivery,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import type { SqliteSource } from '@wbs/store-sqlite';

import type { OptimizationRepository } from '../module/optimization/contract';
import { observeForAdmissionIn } from '../repository/optimization';

/** Owns generation allocation, its cache eviction and addressed fan-out in one source turn. */
export function createOptimizationObservationOwner(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationRepository['observeForAdmission'] {
  return (key, now) =>
    uow.run(async (scope) => {
      const capture = scope.fanoutCapture;
      // Proof: removing this guard changed the installed missing-capability
      // refusal into an incidental property error before any generation write.
      if (capture?.resolveLifecycleOwner === undefined)
        throw new Error('optimization observation lacks borrowed ownership and capture');
      const owner = await capture.resolveLifecycleOwner(key.projectId);
      const organizationId = owner.kind === 'scoped' ? owner.organizationId : null;
      const before = organizationId === null ? null : await capture.capture(organizationId);
      // Proof: moving observation before this source turn read uncommitted
      // generation 2 from a held writer; its rollback left generation 1.
      const decision = observeForAdmissionIn(db, key, now);
      if (before === null || organizationId === null)
        return { commit: true, value: { decision, envelopes: [] } };
      // Proof: reusing the old capture after H2's cache eviction left B's
      // installed A-cause event absent despite generation 2 committing.
      // Proof: detaching source.ts capture onto a read-only connection also
      // missed staged H1 deletion and lost B while generation 2 committed.
      const after = await capture.capture(organizationId);
      const cause = key.projectId;
      const addressed = before.localFacts.has(cause) || after.localFacts.has(cause);
      // Proof: dropping the addressed cause left B silent when H2 evicted
      // selected H1; bypassing recording independently lost the same row.
      const envelopes = await recordCommittedFanout(
        scope.stores.eventLog,
        before,
        after,
        () => delivery.now(),
        addressed ? [cause] : [],
      );
      return { commit: true, value: { decision, envelopes } };
    });
}
