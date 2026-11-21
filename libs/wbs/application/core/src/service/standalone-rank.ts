import type { CommandAccess } from '../ports/command-access';
import type { ProjectRankStore, RankMoved } from '../ports/project-rank-store';
import type { UnitOfWork } from '../ports/unit-of-work';
import { authorize } from './authorize';
import type { CommittedFanoutDelivery, CommittedProjectEvent } from './committed-fanout';
import { recordCommittedFanout } from './committed-fanout';

/**
 * A public rank writer owns one complete async write turn. The scope's rank
 * repository is OPEN, so its synchronous savepoint remains inside the owner.
 * Caller and stamp are retained before queuing. Capture and event rows settle
 * with the rank; delivery starts after release.
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
      // Proof: rank-owner-caller: retaining queued command-caller aliases.
      // retains standalone rank queued caller authority and expected context
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      // Proof: rank-owner-caller-deep: shallow caller copying retains principal and expected-context aliases.
      // retains standalone rank queued caller authority and expected context
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      caller = structuredClone(caller);
      // Proof: rank-owner-stamp: retaining the caller-owned queued stamp.
      // retains standalone rank queued stamp by before admitted ownership
      // retains standalone rank queued stamp at before admitted ownership
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      stamp = { ...stamp };
      const settled = await uow.run<{
        moved: RankMoved;
        events: readonly CommittedProjectEvent[];
      }>(async (scope) => {
        const capture = scope.fanoutCapture;
        const ranks = scope.stores.projectRanks;
        // Proof: rank-required-capture: omitting required borrowed capture before a no-op.
        // requires capture before a standalone rank no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        // Proof: rank-required-store: omitting required borrowed store preflight before authorization.
        // requires the borrowed rank store before a standalone self move
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        // Proof: rank-retired-authority-marker: requiring the retired role marker despite current grant authority.
        // moves rank with current grants and no retired role-authority slots
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        if (capture === undefined || ranks === undefined)
          throw new Error('standalone rank owner lacks borrowed capture or rank store');
        // Proof: bypassing this current-membership check lets a queued demotion
        // write ranks; moving capture above it invokes the throwing capture spy.
        const resolved = await commandAccess.resolve(caller);
        if (!resolved.ok)
          // Proof: rank-modeled-context-conflict: throwing for a modeled stale expected-context refusal.
          // preserves stale expected user as a modeled conflict at standalone rank
          // preserves stale expected organization as a modeled conflict at standalone rank
          // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
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
        // Proof: rank-required-grant-port: bypassing current grant evaluation before a self/no-op.
        // requires grants before a standalone rank no-op
        // propagates unreadable grant state before a standalone rank no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        const authority = await authorize(
          scope.stores.accessDecisions,
          access.principal,
          { kind: 'organization', organizationId },
          'organization.manage_spaces',
        );
        // Proof: rank-grant fault failed 'rechecks queued rank grants' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
        // Proof: rank-current-decision: discarding the current named permission refusal.
        // names the current rank permission before a role-only standalone no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
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
