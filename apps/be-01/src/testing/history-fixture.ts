import type { PlanEvent, PlanEventStore, ProjectStore } from '../repository';
import { HistoryService } from '../service/history.service';
import { inMemoryProjects } from './project-fixture';

/**
 * A {@link PlanEventStore} backed by an array, for service and controller tests
 * that do not need SQLite.
 *
 * It keeps the three guarantees a reader depends on, because a fixture laxer than
 * production lets a test pass against behaviour that does not exist: **newest
 * first** with the id breaking a tie, a `workItemId` filter that excludes the
 * plan-wide events rather than including them, and a `kinds` list that names
 * nothing being no filter at all.
 *
 * What it deliberately does not model is the JSON round trip — `before` and
 * `after` are held as the values they were given. A caller that cares about the
 * parse runs against the real store, exactly as `inMemoryCommandJournal` says of
 * the journal's three columns.
 */
export function inMemoryPlanEvents(seed: readonly PlanEvent[] = []): PlanEventStore & {
  readonly held: PlanEvent[];
} {
  const held: PlanEvent[] = [...seed];
  return {
    held,
    listFor(projectId, filter) {
      const kinds = filter.kinds ?? [];
      return Promise.resolve(
        held
          .filter((each) => each.projectId === projectId)
          .filter(
            (each) => filter.workItemId === undefined || each.workItemId === filter.workItemId,
          )
          .filter((each) => kinds.length === 0 || kinds.includes(each.kind))
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)),
      );
    },
    pruneOlderThan(cutoff) {
      const doomed = held.filter((each) => each.createdAt < cutoff);
      for (const each of doomed) held.splice(held.indexOf(each), 1);
      return Promise.resolve(doomed.length);
    },
  };
}

/**
 * A HistoryService over the in-memory stores, for tests that only need `buildApp`
 * to construct.
 *
 * Required rather than optional in `AppOptions` for the reason every other service
 * there is: a process built without it answers 404 on the history route, which a
 * client cannot tell from a plan whose history is empty.
 */
export function testHistoryService(
  projects: ProjectStore = inMemoryProjects(),
  events: PlanEventStore = inMemoryPlanEvents(),
): HistoryService {
  return new HistoryService({ projects, events });
}
