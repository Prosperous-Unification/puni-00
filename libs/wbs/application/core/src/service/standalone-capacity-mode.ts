import type { CommandAccess } from '../ports/command-access';
import { type ProjectEvent, subscriptionFor } from '../ports/project-event';
import type {
  CapacityModeSwitch,
  CapacityModeSwitched,
  SharedPeopleStore,
} from '../ports/project-rank-store';
import type { UnitOfWork } from '../ports/unit-of-work';
import { authorize } from './authorize';
import type { CommittedFanoutDelivery, CommittedProjectEvent } from './committed-fanout';

/**
 * The public capacity-mode writer: one complete async write turn, as
 * {@link standaloneRankStore} is for a rank move. Authenticated evidence is
 * detached with the caller-owned stamp before queuing; current membership and manage_capacity_mode grants
 * are resolved on the writer before mutation. A switch tells every project of the organization, naming no
 * cause, because flipping the mode may move any of them; the event rows settle
 * with the mode and its audit row, and delivery starts after release.
 */
export function standaloneCapacityModeSwitch(
  publicModes: Pick<SharedPeopleStore, 'capacityModeIn'>,
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
  commandAccess: CommandAccess,
): CapacityModeSwitch {
  return {
    capacityModeIn: (organizationId) => publicModes.capacityModeIn(organizationId),
    async switchCapacityMode(organizationId, mode, stamp, auditId, caller) {
      if (caller === undefined)
        throw new Error('capacity-mode writer lacks authenticated caller evidence');
      // Proof: mode-owner-caller: retaining queued command-caller aliases.
      // retains standalone mode queued caller authority and expected context
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      // Proof: mode-owner-caller-deep: shallow caller copying retains principal and expected-context aliases.
      // retains standalone mode queued caller authority and expected context
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      caller = structuredClone(caller);
      // Proof: mode-owner-stamp: retaining the caller-owned queued stamp.
      // retains standalone mode queued stamp by before admitted ownership
      // retains standalone mode queued stamp at before admitted ownership
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      stamp = { ...stamp };
      const settled = await uow.run<{
        switched: CapacityModeSwitched;
        events: readonly CommittedProjectEvent[];
      }>(async (scope) => {
        const capture = scope.fanoutCapture;
        const modes = scope.stores.projectRanks;
        // Proof: mode-required-capture: omitting required borrowed capture before a no-op.
        // requires capture before a standalone mode no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        // Proof: mode-required-store: omitting required borrowed store preflight before authorization.
        // requires the borrowed mode store before a standalone no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        if (capture === undefined || modes === undefined)
          throw new Error('capacity-mode owner lacks borrowed authority or mode store');
        // Proof: bypassing this current-membership check made `refuses a
        // super-admin demoted after route admission, storing nothing`
        // (`capacity-mode.controller.db.test.ts`) fail; watched 2026-10-11.
        const resolved = await commandAccess.resolve(caller);
        if (!resolved.ok)
          // Proof: mode-modeled-context-conflict: throwing for a modeled stale expected-context refusal.
          // preserves stale expected user as a modeled conflict at standalone mode
          // preserves stale expected organization as a modeled conflict at standalone mode
          // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
          return {
            commit: false,
            value: { switched: { ok: false, authority: resolved }, events: [] },
          };
        const access = resolved.access;
        if (
          access.kind !== 'scoped' ||
          access.scope.organizationId !== organizationId ||
          access.principal.id !== stamp.by ||
          access.scope.userId !== stamp.by
        )
          throw new Error('capacity-mode writer authority differs from its organization or actor');
        if (access.scope.delegated === true)
          return {
            commit: false,
            value: { switched: { ok: false, reason: 'forbidden' }, events: [] },
          };
        // Proof: mode-required-grant-port: bypassing current grant evaluation before a self/no-op.
        // requires grants before a standalone mode no-op
        // propagates unreadable grant state before a standalone mode no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        const authority = await authorize(
          scope.stores.accessDecisions,
          access.principal,
          { kind: 'organization', organizationId },
          'organization.manage_capacity_mode',
        );
        // Proof: mode-grant fault failed 'rechecks queued capacity mode grants' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
        // Proof: mode-current-decision: discarding the current named permission refusal.
        // names the current mode permission before a role-only standalone no-op
        // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
        if (!authority.ok)
          return {
            commit: false,
            value: {
              switched: {
                ok: false,
                reason: 'forbidden',
                permission: 'organization.manage_capacity_mode',
              },
              events: [],
            },
          };
        const set = await modes.setCapacityMode(organizationId, mode, stamp, auditId);
        if (!set.changed)
          return {
            commit: false as const,
            value: { switched: { ok: true as const, changed: false }, events: [] },
          };
        // Proof: this loop emptied made `tells every project when the
        // organization switches, and nothing for no switch` record no row;
        // watched 2026-10-11.
        const events: CommittedProjectEvent[] = [];
        for (const { projectId } of await modes.orderIn(organizationId)) {
          const event: ProjectEvent = {
            type: 'elsewhere_changed',
            projectId,
            causeProjectId: null,
          };
          const recorded = await scope.stores.eventLog.recordEvent(
            subscriptionFor(projectId),
            event,
            delivery.now(),
          );
          events.push({ projectId, event, recorded });
        }
        return {
          commit: true as const,
          value: { switched: { ok: true as const, changed: true }, events },
        };
      });
      if (settled.events.length > 0) await delivery.deliverCommitted(settled.events);
      return settled.switched;
    },
  };
}
