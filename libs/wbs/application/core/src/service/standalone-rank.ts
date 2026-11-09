import type { CommandAccess } from '../ports/command-access';
import type { ProjectRankStore, RankMoved } from '../ports/project-rank-store';
import type { UnitOfWork } from '../ports/unit-of-work';
import { authorize } from './authorize';
import type { CommittedFanoutDelivery, CommittedProjectEvent } from './committed-fanout';
import { recordCommittedFanout } from './committed-fanout';

/**
 * A public rank writer owns one complete async write turn. The scope's rank
 * repository is OPEN, so its synchronous savepoint remains inside the owner.
 * Capture and event rows settle with the rank; delivery starts after release.
 */
export function standaloneRankStore(
  publicRanks: ProjectRankStore,
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
  commandAccess: CommandAccess,
): ProjectRankStore {
  return {
    orderIn: (organizationId) => publicRanks.orderIn(organizationId),
    async moveAfter(organizationId, projectId, afterProjectId, stamp, caller): Promise<RankMoved> {
      if (caller === undefined) throw new Error('rank writer lacks authenticated caller evidence');
      caller = structuredClone(caller);
      const settled = await uow.run<{
        moved: RankMoved;
        events: readonly CommittedProjectEvent[];
      }>(async (scope) => {
        const capture = scope.fanoutCapture;
        const ranks = scope.stores.projectRanks;
        if (capture?.authorizeRankMove === undefined || ranks === undefined)
          throw new Error('standalone rank owner lacks borrowed capture, authority or rank store');
        // Proof: bypassing this current-membership check lets a queued demotion
        // write ranks; moving capture above it invokes the throwing capture spy.
        const resolved = await commandAccess.resolve(caller);
        if (!resolved.ok)
          return {
            commit: false,
            value: { moved: { ok: false, authority: resolved }, events: [] },
          };
        const access = resolved.access;
        if (
          access.kind !== 'scoped' ||
          access.scope.organizationId !== organizationId ||
          access.principal.id !== stamp.by ||
          access.scope.userId !== stamp.by
        )
          throw new Error('rank writer authority differs from its addressed organization or actor');
        const authority = await authorize(
          scope.stores.accessDecisions,
          access.principal,
          { kind: 'organization', organizationId },
          'organization.manage_spaces',
        );
        // Proof: rank-grant fault failed 'rechecks queued rank grants' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
        if (!authority.ok)
          return {
            commit: false,
            value: {
              moved: { ok: false, reason: 'forbidden', permission: 'organization.manage_spaces' },
              events: [],
            },
          };
        const order = await ranks.orderIn(organizationId);
        if (
          !order.some(({ projectId: id }) => id === projectId) ||
          (afterProjectId !== null && !order.some(({ projectId: id }) => id === afterProjectId))
        )
          return {
            commit: false as const,
            value: {
              moved: { ok: false as const, reason: 'not_found' as const },
              events: [],
            },
          };
        if (afterProjectId === projectId) {
          const moved = await ranks.moveAfter(organizationId, projectId, afterProjectId, stamp);
          return { commit: moved.ok, value: { moved, events: [] } };
        }
        // Proof: capturing after the move lost the old ordered bridge and its recipient.
        const before = await capture.capture(organizationId);
        const moved = await ranks.moveAfter(organizationId, projectId, afterProjectId, stamp);
        if (!moved.ok) return { commit: false as const, value: { moved, events: [] } };
        const after = await capture.capture(organizationId);
        // Proof: recording after UoW settlement left rank rows committed when a later
        // recipient insert failed, instead of rolling back rank, rows and sequence.
        const events = await recordCommittedFanout(scope.stores.eventLog, before, after, () =>
          delivery.now(),
        );
        return { commit: true as const, value: { moved, events } };
      });
      // Proof: awaiting this delivery inside the owner kept the SQLite writer
      // locked during held transport; the second writer failed SQLITE_BUSY.
      if (settled.events.length > 0) await delivery.deliverCommitted(settled.events);
      return settled.moved;
    },
  };
}
