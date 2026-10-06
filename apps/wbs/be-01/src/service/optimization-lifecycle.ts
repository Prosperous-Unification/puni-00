import type { UnitOfWork, WriteStamp } from '@wbs/core';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import {
  beginOptimizationDrain,
  finishOptimizationDrain,
  type OptimizationDrainFinish,
  type SqliteSource,
} from '@wbs/store-sqlite';

/** Installed source-bound direct drain owner; raw borrowed drain operations remain synchronous. */
export interface OptimizationLifecycle {
  beginDrain(projectId: string, stamp: WriteStamp, contractVersion?: string): Promise<number>;
  finishDrain(projectId: string, contractVersion?: string): Promise<OptimizationDrainFinish>;
}

/** Captures and records on one borrowed writer, then delivers after its turn releases. */
export function createOptimizationLifecycle(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationLifecycle {
  async function own<T>(projectId: string, write: () => T): Promise<T> {
    const settled = await uow.run<{
      value: T;
      events: readonly CommittedProjectEvent[];
    }>(async (scope) => {
      const capture = scope.fanoutCapture;
      // Proof: omitting this installed-capability check replaced the mounted
      // missing-capture refusal with an incidental property error.
      if (capture?.resolveLifecycleOwner === undefined)
        throw new Error('optimization lifecycle lacks borrowed ownership and capture');
      const owner = await capture.resolveLifecycleOwner(projectId);
      // Proof: omitting this branch let an absent target reach capture with an
      // undefined organization and throw instead of returning its no-op result.
      if (owner.kind !== 'scoped')
        return { commit: true as const, value: { value: write(), events: [] } };
      // Proof: moving this old capture after the raw retirement lost B's
      // selected-ready displacement event at unchanged input hash.
      const before = await capture.capture(owner.organizationId);
      const value = write();
      const after = await capture.capture(owner.organizationId);
      // Proof: omitting transactional recording let the selected contract
      // retire despite a later recipient event-insert trigger; the rollback
      // fixture expected a rejection and byte-equal cache/generation/sequence.
      const events = await recordCommittedFanout(
        scope.stores.eventLog,
        before,
        after,
        () => delivery.now(),
        // Proof: omitting this addressed cause lost B's event when selected A
        // retired at the same input hash and unchanged local scheduling facts.
        [projectId],
      );
      return { commit: true as const, value: { value, events } };
    });
    // Proof: awaiting delivery inside the owner held SQLite's writer turn and
    // made the second writer fail SQLITE_BUSY during a held transport push.
    // Proof: deleting the committed event row here made populated deletion's
    // rejected-push replay return no original seq/cause envelope.
    if (settled.events.length > 0) await delivery.deliverCommitted(settled.events);
    return settled.value;
  }

  return {
    beginDrain: (projectId, stamp, contractVersion) =>
      own(projectId, () => beginOptimizationDrain(db, projectId, stamp, contractVersion)),
    finishDrain: (projectId, contractVersion) =>
      own(projectId, () => finishOptimizationDrain(db, projectId, contractVersion)),
  };
}
