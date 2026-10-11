import type { UnitOfWork } from '@wbs/core';
import {
  type CommittedFanoutDelivery,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import { type SqliteSource } from '@wbs/store-sqlite';

import type { OptimizationRepository } from '../module/optimization/contract';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN } from '../repository/gate';
import { recordOptimizationOutcomeIn } from '../repository/optimization';

/** Owns outcome storage and any displaced shared-person display in one writer turn. */
export function createOptimizationOutcomeOwner(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationRepository['recordOutcome'] {
  const eventLog = new DrizzleEventLogStore(db, OPEN);
  return (write) =>
    uow.run(async (scope) => {
      const capture = scope.fanoutCapture;
      // Proof: removing this borrowed-capability refusal changed the installed
      // missing-capture test from a modeled refusal into a TypeError before write.
      if (capture?.resolveLifecycleOwner === undefined)
        throw new Error('optimization outcome lacks borrowed ownership and capture');
      const owner = await capture.resolveLifecycleOwner(write.claim.projectId);
      const organizationId = owner.kind === 'scoped' ? owner.organizationId : null;
      // Proof: detaching source.ts capture onto a read-only connection made the
      // installed selected-outcome test lose B's durable event after A stored.
      const before = organizationId === null ? null : await capture.capture(organizationId);
      const committed = recordOptimizationOutcomeIn(db, eventLog, write);
      // Proof: bypassing this no-op guard caused an already-recorded outcome
      // to take a fourth capture instead of the observed three.
      if (organizationId === null || before === null || committed.decision.kind !== 'stored')
        return { commit: true, value: committed };
      // Proof: reusing before here made the installed B event assertion empty;
      // throwing during this capture restored the complete prewrite snapshot.
      const after = await capture.capture(organizationId);
      const cause = write.claim.projectId;
      const addressed = before.localFacts.has(cause) || after.localFacts.has(cause);
      // Proof: dropping the addressed cause or this recording lost B's event;
      // a second-recipient insert fault rolled back outcome, cache and seq.
      // Splitting COMMIT/BEGIN after outcome write instead left those rows
      // committed when the same real second insert failed.
      const envelopes = await recordCommittedFanout(
        scope.stores.eventLog,
        before,
        after,
        () => delivery.now(),
        addressed ? [cause] : [],
      );
      return { commit: true, value: { decision: committed.decision, envelopes } };
    });
}
