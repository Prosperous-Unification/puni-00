import { type ProjectEvent, subscriptionFor } from '../ports/project-event';
import type {
  CapacityModeSwitch,
  CapacityModeSwitched,
  SharedPeopleStore,
} from '../ports/project-rank-store';
import type { UnitOfWork } from '../ports/unit-of-work';
import type { CommittedFanoutDelivery, CommittedProjectEvent } from './committed-fanout';

/**
 * The public capacity-mode writer: one complete async write turn, as
 * {@link standaloneRankStore} is for a rank move. The actor's super-admin
 * membership is re-read on the writer, so a demotion queued ahead of the turn
 * refuses it. A switch tells every project of the organization, naming no
 * cause, because flipping the mode may move any of them; the event rows settle
 * with the mode and its audit row, and delivery starts after release.
 */
export function standaloneCapacityModeSwitch(
  publicModes: Pick<SharedPeopleStore, 'capacityModeIn'>,
  uow: UnitOfWork,
  delivery: CommittedFanoutDelivery,
): CapacityModeSwitch {
  return {
    capacityModeIn: (organizationId) => publicModes.capacityModeIn(organizationId),
    async switchCapacityMode(organizationId, mode, stamp, auditId) {
      const settled = await uow.run<{
        switched: CapacityModeSwitched;
        events: readonly CommittedProjectEvent[];
      }>(async (scope) => {
        const authorize = scope.fanoutCapture?.authorizeModeSwitch;
        const modes = scope.stores.projectRanks;
        if (authorize === undefined || modes === undefined)
          throw new Error('capacity-mode owner lacks borrowed authority or mode store');
        // Proof: bypassing this current-membership check made `refuses a
        // super-admin demoted after route admission, storing nothing`
        // (`capacity-mode.controller.db.test.ts`) fail; watched 2026-10-11.
        const authority = await authorize(organizationId, stamp.by);
        if (!authority.ok)
          return {
            commit: false as const,
            value: { switched: { ok: false as const, reason: authority.reason }, events: [] },
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
