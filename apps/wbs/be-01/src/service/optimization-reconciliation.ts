import type { UnitOfWork } from '@wbs/core';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '@wbs/core/service/committed-fanout';
import {
  reclaimExpiredSolverSlotsIn,
  reconciliationTargetIsCurrent,
  reconciliationTargets,
  type SolverSlotReclaimScope,
  type SqliteSource,
} from '@wbs/store-sqlite';

import type { OptimizationRepository } from '../module/optimization/contract';

/** Give each generation and then each project sweep its own borrowed source turn. */
export function createOptimizationReconciliation(
  db: SqliteSource['db'],
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): OptimizationRepository['reconcileDrains'] {
  return async (now) => {
    let reclaimed = 0;
    let finished = 0;
    let waiting = 0;

    const sweep = async (target: SolverSlotReclaimScope): Promise<void> => {
      const settled = await uow.run(async (scope) => {
        // Proof: bypassing the in-writer recheck reclaimed C's expired slot after
        // an earlier sweep removed C's drain markers in the installed startup pass.
        if (!reconciliationTargetIsCurrent(db, target))
          return {
            commit: true as const,
            value: { pass: { reclaimed: 0, finished: 0, waiting: 0 }, events: [] },
          };

        const capture = scope.fanoutCapture;
        // Proof: omitting this capability guard changed the mounted missing
        // owner refusal into an untyped property-access failure.
        if (capture?.resolveLifecycleOwner === undefined)
          throw new Error('reconciliation lacks borrowed ownership and capture');
        const owner = await capture.resolveLifecycleOwner(target.projectId);
        // Proof: omitting the old persisted capture let startup remove
        // populated A while B received no durable old-topology event.
        const before = owner.kind === 'scoped' ? await capture.capture(owner.organizationId) : null;
        const causes = new Set<string>();
        const pass = db.transaction((tx) =>
          reclaimExpiredSolverSlotsIn(tx, now, target, ({ projectId }) => causes.add(projectId)),
        );
        const events: CommittedProjectEvent[] = [];
        if (before !== null && owner.kind === 'scoped') {
          const after = await capture.capture(owner.organizationId);
          // Proof: omitting the recorder deleted populated A without B's
          // durable seq0 event in installed startup reconciliation.
          events.push(
            ...(await recordCommittedFanout(
              scope.stores.eventLog,
              before,
              after,
              () => delivery.now(),
              // Proof: omitting the actual finished A cause lost B's event
              // when selected retirement changed display at the same input hash.
              [...causes],
            )),
          );
        }
        return { commit: true as const, value: { pass, events } };
      });
      reclaimed += settled.pass.reclaimed;
      finished += settled.pass.finished;
      waiting += settled.pass.waiting;
      // Proof: dropping this await let installed stop settle while B's push
      // stayed held after the project deletion had already committed.
      if (settled.events.length > 0) await delivery.deliverCommitted(settled.events);
    };

    // Proof: reversing these passes collapsed selected A retirement and later
    // A deletion into one B event instead of the two committed transitions.
    for (const target of reconciliationTargets(db, 'generations')) await sweep(target);
    for (const target of reconciliationTargets(db, 'projects')) await sweep(target);
    return { reclaimed, finished, waiting };
  };
}
