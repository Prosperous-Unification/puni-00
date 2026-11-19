import type { PlanEvent, PlanEventFilter } from '../../ports/plan-event-values';
import type { PlanEventService } from '../plan-event/plan-event.resource';
import type { WorkPackageService } from '../work-package/work-package.resource';

export interface HistoryServiceOptions {
  workPackages: WorkPackageService;
  events: PlanEventService;
}

export type HistoryOutcome = { ok: true; value: PlanEvent[] } | { ok: false; reason: 'not_found' };

/**
 * The plan's history, read.
 *
 * This raw reader preserves legacy and service-fixture behavior; it does not establish
 * current package permission. Ordinary HTTP history uses WorkPackageObservation.readHistory,
 * which admits the complete caller and reads events on one committed observation.
 * The history is written by `WorkItemService.record` as a side of the command it records,
 * and this service has no write method at all.
 *
 * The work package is read before the events so an absent work package is `not_found`
 * rather than an empty history. The two are different answers and a client must
 * be able to tell them apart: a plan somebody just deleted and a plan nobody has
 * edited yet would otherwise look identical.
 *
 * **Not a view.** What comes back is the rows, `before` and `after` still the
 * commands they were written as. Turning "set_estimate from {3,5,8} to {3,5,13}"
 * into a sentence about a figure is R5's H5, and doing it here would fix the
 * shape of a reading surface nobody has designed — see
 * `notes/wbs-brief-2026-08-14-r5-r6-history.md` §6.
 */
export class HistoryService {
  constructor(private readonly opts: HistoryServiceOptions) {}

  async read(workPackageId: string, filter: PlanEventFilter): Promise<HistoryOutcome> {
    const workPackage = await this.opts.workPackages.readWorkPackage(workPackageId);
    // Proof (2026-09-27): replacing this guard with `false && workPackage === null`
    // made `answers not_found for a workPackage nothing holds` fail (5 pass, 1 fail).
    if (workPackage === null) return { ok: false, reason: 'not_found' };
    return { ok: true, value: await this.opts.events.readHistory(workPackageId, filter) };
  }
}
