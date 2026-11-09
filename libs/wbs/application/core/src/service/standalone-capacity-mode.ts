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
 * detached before queuing; current membership and manage_capacity_mode grants
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
      caller = structuredClone(caller);
      const settled = await uow.run<{
        switched: CapacityModeSwitched;
        events: readonly CommittedProjectEvent[];
      }>(async (scope) => {
        const capture = scope.fanoutCapture;
        const modes = scope.stores.projectRanks;
        if (capture === undefined || modes === undefined)
          throw new Error('capacity-mode owner lacks borrowed authority or mode store');
        // Proof: bypassing this current-membership check made `refuses a
        // super-admin demoted after route admission, storing nothing`
        // (`capacity-mode.controller.db.test.ts`) fail; watched 2026-10-11.
        const resolved = await commandAccess.resolve(caller);
        if (!resolved.ok)
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
        const authority = await authorize(
          scope.stores.accessDecisions,
          access.principal,
          { kind: 'organization', organizationId },
          'organization.manage_capacity_mode',
        );
        // Proof: mode-grant fault failed 'rechecks queued capacity mode grants' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
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
