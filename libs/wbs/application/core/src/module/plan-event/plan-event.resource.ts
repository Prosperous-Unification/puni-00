import type { PlanEvent, PlanEventFilter, PlanEventStore } from '../../ports/plan-event-store';

/** Retained plan history over one repository scope, newest first as supplied by the store. */
export class PlanEventService {
  constructor(private readonly events: PlanEventStore) {}

  /** Read a work package's events using the repository's ordering and filtering. */
  readHistory(workPackageId: string, filter: PlanEventFilter): Promise<PlanEvent[]> {
    return this.events.listFor(workPackageId, filter);
  }

  /** Remove events older than the requested number of whole days. */
  pruneHistory(now: number, retainDays: number): Promise<number> {
    // Proof (2026-09-27): replacing the day multiplier with zero made `keeps
    // the repository ordering and prunes by age` fail (4 pass, 1 fail): an
    // event inside the retention window was deleted.
    return this.events.pruneOlderThan(now - retainDays * 24 * 60 * 60 * 1_000);
  }
}
